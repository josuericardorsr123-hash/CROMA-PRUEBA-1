import { randomBytes } from "node:crypto";
import { type AlmacenBlobs, BlobsEnMemoria, Cifrador } from "@em/almacen";
import { ClienteCroma, type DatosSimulados, iniciarSimuladorCroma, REGISTRO_SILENCIOSO, type SimuladorCroma } from "@em/croma";
import { type ContextoInicial, crearExpediente, type Expediente, nuevoId } from "@em/dominio";
import { detectarMime } from "@em/documentos";
import { RepositorioFuentes, ResolutorFuentes } from "@em/fuentes";
import type { LlmPort } from "@em/ia";
import type { ConfigPipeline, PerfilAbogado, PuertoAbogados, PuertoMemoria, Servicios } from "../contexto";
import { configDesdeEntorno } from "../config";
import { construirExpedienteDemo, datosCromaDemo, PARTES_DEMO } from "./expediente";
import { crearLlmDemostracion, type OpcionesDemostracion } from "./llm";

/* Entorno de demostración y de prueba de extremo a extremo: Croma simulado
 * sobre MCP real, IA de demostración, blobs cifrados y el expediente ficticio
 * cargado como archivos crudos. Todo queda marcado como DEMOSTRACIÓN. */

export const CLAVE_CROMA_DEMO = "clave-demostracion-croma";

export const PERFIL_DEMO: PerfilAbogado = {
  usuarioId: "usr_demo", nombre: "ABOGADO DE DEMOSTRACIÓN", correo: "abogado@ejemplo.test", identificacion: "000.000.003", tarjetaProfesional: "000000",
  correoRegistroNacional: "abogado@ejemplo.test", telefono: null, direccion: "Dirección ficticia de demostración", ciudad: "Bogotá D.C.",
};

export interface OpcionesEntorno {
  tenantId?: string;
  propietarioId?: string;
  blobs?: AlmacenBlobs;
  cifrador?: Cifrador;
  llm?: LlmPort;
  opcionesLlm?: OpcionesDemostracion;
  datosCroma?: DatosSimulados;
  config?: Partial<ConfigPipeline>;
  reloj?: () => Date;
  memoria?: PuertoMemoria;
  abogados?: PuertoAbogados;
  contexto?: Partial<ContextoInicial>;
  /** Archivos del expediente a cargar (por defecto, el expediente de demostración completo). */
  filtrarArchivos?: (nombre: string) => boolean;
}

export interface EntornoDemostracion {
  servicios: Servicios;
  expediente: Expediente;
  simulador: SimuladorCroma;
  memoria: PuertoMemoria & { guardadas: unknown[] };
  cerrar(): Promise<void>;
}

export async function prepararDemostracion(o: OpcionesEntorno = {}): Promise<EntornoDemostracion> {
  const tenantId = o.tenantId ?? "demo";
  const propietarioId = o.propietarioId ?? PERFIL_DEMO.usuarioId;
  const demo = await construirExpedienteDemo();
  const simulador = await iniciarSimuladorCroma({ apiKey: CLAVE_CROMA_DEMO, datos: o.datosCroma ?? datosCromaDemo() });
  const croma = new ClienteCroma({ url: simulador.url, apiKey: CLAVE_CROMA_DEMO, simulado: true, reintentos: 1, esperaReintentoMs: 50, esperaPendienteMs: 20 });
  const repositorio = new RepositorioFuentes();
  const resolutor = new ResolutorFuentes({ croma, repositorio, http: { habilitado: false } });
  const cifrador = o.cifrador ?? new Cifrador({ kid: "demo", material: randomBytes(32) });
  const blobs = o.blobs ?? new BlobsEnMemoria(cifrador);
  const reloj = o.reloj ?? (() => new Date());
  const guardadas: unknown[] = [];
  const memoria = (o.memoria as EntornoDemostracion["memoria"] | undefined) ?? { guardadas, lecciones: async () => [], guardar: async (l) => void guardadas.push(l) };
  const servicios: Servicios = {
    llm: o.llm ?? crearLlmDemostracion({ transcripciones: demo.transcripciones, ...o.opcionesLlm }), croma, resolutor, repositorio, blobs, memoria,
    abogados: o.abogados ?? { perfil: async (id) => (id === propietarioId ? { ...PERFIL_DEMO, usuarioId: id } : null) }, terminos: null,
    config: configDesdeEntorno({}, { demostracion: true, ...o.config }), reloj, registro: REGISTRO_SILENCIOSO,
  };
  const ahora = reloj().toISOString();
  const expediente = crearExpediente({
    id: nuevoId("exp"), tenantId, propietarioId, titulo: "Cobro de pagaré vencido (DEMOSTRACIÓN)", ahora,
    contexto: { cliente: { nombre: PARTES_DEMO.acreedor, identificacion: `NIT ${PARTES_DEMO.nitAcreedor}`, rol: "EJECUTANTE" }, contraparte: PARTES_DEMO.deudora, objetivo: null, notasAbogado: "Expediente de demostración con datos ficticios.", ...o.contexto },
  });
  for (const a of demo.archivos.filter((x) => !o.filtrarArchivos || o.filtrarArchivos(x.nombre))) {
    const g = await blobs.guardar(a.contenido, { tenantId, mime: detectarMime(a.contenido, a.nombre).mime, nombre: a.nombre });
    expediente.entrantes.push({ id: nuevoId("inc"), blobId: g.blobId, nombre: a.nombre, rutaRelativa: a.nombre, bytes: g.bytes, sha256: g.sha256, cargadoEn: ahora, cargadoPor: propietarioId, procesado: false, procesadoEn: null });
  }
  return { servicios, expediente, simulador, memoria, cerrar: async () => { await croma.cerrar(); await simulador.cerrar(); } };
}
