import { existsSync } from "node:fs";
import type { AlmacenBlobs, RepositorioSql } from "@em/almacen";
import { type ClienteCroma, crearClienteCromaDesdeEntorno, type Registro, REGISTRO_SILENCIOSO } from "@em/croma";
import { type AccionAbogado, type Entrante, type Expediente, type Instruccion, nuevoId } from "@em/dominio";
import { detectarMime } from "@em/documentos";
import { cargarJsonl, RepositorioFuentes, ResolutorFuentes } from "@em/fuentes";
import { LlmAnthropic, type LlmPort } from "@em/ia";
import type { ConfigPipeline, PuertoAbogados, PuertoMemoria, PuertoTerminos, Servicios } from "./contexto";
import { configDesdeEntorno } from "./config";

/* Ensamblaje de los servicios reales (API y CLI): Claude vía SDK oficial,
 * Croma vía MCP, repositorio normativo local y puertos sobre el almacén SQL.
 * Los puertos quedan acotados al tenant: un expediente nunca lee memoria,
 * perfiles ni términos de otro despacho. */

export interface Compartidos {
  llm: LlmPort | null;
  croma: ClienteCroma;
  repositorio: RepositorioFuentes;
  resolutor: ResolutorFuentes;
  config: ConfigPipeline;
  registro: Registro;
  advertencias: string[];
}

export interface OpcionesCompartidos {
  entorno?: NodeJS.ProcessEnv;
  registro?: Registro;
  config?: Partial<ConfigPipeline>;
  llm?: LlmPort | null;
  croma?: ClienteCroma;
  repositorio?: RepositorioFuentes;
}

/** Clientes de proceso (uno por proceso, compartidos entre tenants). */
export function serviciosCompartidos(o: OpcionesCompartidos = {}): Compartidos {
  const entorno = o.entorno ?? process.env;
  const registro = o.registro ?? REGISTRO_SILENCIOSO;
  const advertencias: string[] = [];
  const llm = o.llm !== undefined ? o.llm : entorno.ANTHROPIC_API_KEY
    ? new LlmAnthropic({ apiKey: entorno.ANTHROPIC_API_KEY, modelo: entorno.EM_MODELO || undefined, fallbacks: entorno.EM_FALLBACKS !== "0", registro })
    : null;
  if (!llm) advertencias.push("ANTHROPIC_API_KEY no configurada: los nodos que requieren IA se detendrán con error explicativo.");
  const croma = o.croma ?? crearClienteCromaDesdeEntorno({ registro }, entorno);
  if (!croma.configurado) advertencias.push("CROMA_API_KEY no configurada: las fuentes oficiales quedarán NO VERIFICADAS.");
  let repositorio = o.repositorio;
  if (!repositorio) {
    const ruta = entorno.EM_REPOSITORIO_JSONL;
    repositorio = new RepositorioFuentes(ruta && existsSync(ruta) ? cargarJsonl(ruta) : [], Number(entorno.EM_FRESCURA_DIAS ?? 180));
    if (ruta && !existsSync(ruta)) advertencias.push(`EM_REPOSITORIO_JSONL apunta a un archivo inexistente (${ruta}).`);
  }
  const resolutor = new ResolutorFuentes({ croma, repositorio, http: { habilitado: entorno.EM_HTTP_OFICIAL !== "0" } });
  return { llm, croma, repositorio, resolutor, config: configDesdeEntorno(entorno, o.config), registro, advertencias };
}

export function memoriaSql(repo: RepositorioSql, tenantId: string): PuertoMemoria {
  return {
    lecciones: (area) => repo.lecciones(tenantId, { area, limite: 25 }),
    guardar: async (l) => void (await repo.guardarLeccion(tenantId, l)),
  };
}

export function abogadosSql(repo: RepositorioSql, tenantId: string): PuertoAbogados {
  return {
    perfil: async (id) => {
      const u = await repo.usuarioPorId(tenantId, id);
      if (!u || !u.activo) return null;
      const p = await repo.perfilProfesional(tenantId, id);
      return {
        usuarioId: u.id, nombre: u.nombre, correo: u.correo,
        identificacion: p?.identificacion ?? null, tarjetaProfesional: p?.tarjetaProfesional ?? u.tarjetaProfesional,
        correoRegistroNacional: p?.correoRegistroNacional ?? null, telefono: p?.telefono ?? null, direccion: p?.direccion ?? null, ciudad: p?.ciudad ?? null,
      };
    },
  };
}

export function terminosSql(repo: RepositorioSql, tenantId: string): PuertoTerminos {
  return { indexar: (exp) => repo.indexarTerminos(tenantId, exp.id, exp.terminos) };
}

/** Servicios de un tenant sobre los clientes compartidos y el almacén. */
export function serviciosDeTenant(c: Compartidos, almacen: { repo: RepositorioSql; blobs: AlmacenBlobs }, tenantId: string, reloj: () => Date = () => new Date()): Servicios {
  return {
    llm: c.llm, croma: c.croma, resolutor: c.resolutor, repositorio: c.repositorio, blobs: almacen.blobs,
    memoria: memoriaSql(almacen.repo, tenantId), abogados: abogadosSql(almacen.repo, tenantId), terminos: terminosSql(almacen.repo, tenantId),
    config: c.config, reloj, registro: c.registro,
  };
}

/** Carga un archivo crudo como entrante del expediente (cifrado en reposo; la fase 1 lo recibe). */
export async function agregarEntrante(exp: Expediente, blobs: AlmacenBlobs, a: { nombre: string; contenido: Buffer; rutaRelativa?: string }, usuarioId: string, ahora = new Date().toISOString()): Promise<Entrante> {
  const g = await blobs.guardar(a.contenido, { tenantId: exp.tenantId, mime: detectarMime(a.contenido, a.nombre).mime, nombre: a.nombre });
  const e: Entrante = { id: nuevoId("inc"), blobId: g.blobId, nombre: a.nombre, rutaRelativa: a.rutaRelativa ?? a.nombre, bytes: g.bytes, sha256: g.sha256, cargadoEn: ahora, cargadoPor: usuarioId, procesado: false, procesadoEn: null };
  exp.entrantes.push(e);
  return e;
}

/** Instrucción del ABOGADO (USUARIO) para la compuerta en pausa (o para el nodo indicado). */
export function crearInstruccion(accion: AccionAbogado, usuarioId: string, o: { motivo?: string; datos?: unknown; nodo?: string | null; ahora?: string } = {}): Instruccion {
  return { id: nuevoId("ins"), accion, nodo: o.nodo ?? null, motivo: o.motivo ?? "", datos: o.datos ?? {}, usuarioId, emitidaEn: o.ahora ?? new Date().toISOString(), consumida: false, consumidaEn: null };
}
