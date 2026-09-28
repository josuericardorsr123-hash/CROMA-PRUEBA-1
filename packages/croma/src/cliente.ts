import { createHash, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type IdCapacidad, definicionCapacidad } from "./capacidades";
import { type AsignacionCapacidad, type MapeoConfigurado, aHerramienta, construirArgumentos, mapearCapacidades } from "./descubrimiento";
import { type ContenidoMcp, datosDe, esPendiente, esSinResultados, textoDe } from "./normalizadores";
import { CacheTTL, conReintentos, conTiempoMaximo, Cortacircuitos, Semaforo } from "./resiliencia";
import { ErrorCroma, type EstadoConsulta, type HerramientaCroma, type ProcedenciaCroma, REGISTRO_SILENCIOSO, type Registro, type ResultadoConsulta } from "./tipos";

export const CROMA_URL_POR_DEFECTO = "https://api.croma.run/mcp";

export interface OpcionesCroma {
  url?: string;
  apiKey: string | null;
  timeoutMs?: number;
  maxConcurrencia?: number;
  reintentos?: number;
  esperaReintentoMs?: number;
  esperaPendienteMs?: number;
  maxPendientes?: number;
  catalogoTtlMs?: number;
  mapeo?: MapeoConfigurado;
  registro?: Registro;
  umbralCircuito?: number;
  enfriamientoCircuitoMs?: number;
  simulado?: boolean;
  nombreCliente?: string;
}

export interface EstadoCroma {
  configurado: boolean;
  conectado: boolean;
  url: string;
  herramientas: number;
  capacidadesDisponibles: string[];
  capacidadesFaltantes: string[];
  circuito: string;
  ultimoError: string | null;
  cacheEntradas: number;
}

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

function estable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${estable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

/** Código HTTP de los errores del transporte Streamable HTTP del SDK (StreamableHTTPError.code). */
function codigoHttp(e: unknown): number | null {
  const c = (e as { code?: unknown })?.code;
  return typeof c === "number" && c >= 100 && c < 600 ? c : null;
}

function esNoAutorizado(e: unknown): boolean {
  const c = codigoHttp(e);
  return c === 401 || c === 403 || /\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(String((e as Error)?.message ?? e));
}

function esReintentable(e: unknown): boolean {
  if (e instanceof ErrorCroma) return e.codigo === "TIEMPO_AGOTADO" || e.codigo === "TRANSPORTE";
  if (esNoAutorizado(e)) return false;
  const c = codigoHttp(e);
  if (c !== null) return c >= 500 || c === 429 || c === 408;
  const msg = String((e as Error)?.message ?? e);
  return /\b(5\d\d|429)\b|timeout|timed out|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket|network|aborted/i.test(msg);
}

/**
 * Gateway hacia Croma sobre el SDK oficial de MCP (Streamable HTTP, Bearer).
 * Toda consulta pasa por: autorización y finalidad → caché → cortacircuitos →
 * límite de concurrencia → reintentos con tiempo máximo → reintento de trabajos
 * pendientes → procedencia con hash del resultado. Nunca lanza por fallas de la
 * fuente: devuelve estado ERROR para que el módulo declare "no verificado".
 */
export class ClienteCroma {
  private conexion: Promise<Client> | null = null;
  private catalogo: { herramientas: HerramientaCroma[]; vence: number } | null = null;
  private asignaciones: Map<IdCapacidad, AsignacionCapacidad> | null = null;
  private readonly semaforo: Semaforo;
  private readonly circuito: Cortacircuitos;
  private readonly cache = new CacheTTL<ResultadoConsulta>(5000);
  private ultimoError: string | null = null;
  private readonly o: Required<Omit<OpcionesCroma, "apiKey" | "mapeo" | "registro">> & { apiKey: string | null; mapeo: MapeoConfigurado; registro: Registro };

  constructor(opciones: OpcionesCroma) {
    this.o = {
      url: opciones.url ?? CROMA_URL_POR_DEFECTO,
      apiKey: opciones.apiKey,
      timeoutMs: opciones.timeoutMs ?? 60_000,
      maxConcurrencia: opciones.maxConcurrencia ?? 4,
      reintentos: opciones.reintentos ?? 2,
      esperaReintentoMs: opciones.esperaReintentoMs ?? 400,
      esperaPendienteMs: opciones.esperaPendienteMs ?? 2500,
      maxPendientes: opciones.maxPendientes ?? 3,
      catalogoTtlMs: opciones.catalogoTtlMs ?? 10 * 60_000,
      mapeo: opciones.mapeo ?? {},
      registro: opciones.registro ?? REGISTRO_SILENCIOSO,
      umbralCircuito: opciones.umbralCircuito ?? 5,
      enfriamientoCircuitoMs: opciones.enfriamientoCircuitoMs ?? 60_000,
      simulado: opciones.simulado ?? false,
      nombreCliente: opciones.nombreCliente ?? "expediente-maleable",
    };
    this.semaforo = new Semaforo(this.o.maxConcurrencia);
    this.circuito = new Cortacircuitos(this.o.umbralCircuito, this.o.enfriamientoCircuitoMs);
  }

  get configurado(): boolean {
    return Boolean(this.o.apiKey);
  }

  private async cliente(): Promise<Client> {
    if (!this.o.apiKey) throw new ErrorCroma("SIN_CREDENCIAL", "CROMA_API_KEY no está configurada: las consultas oficiales quedan como NO VERIFICADAS.");
    if (!this.conexion) {
      this.conexion = (async () => {
        const cliente = new Client({ name: this.o.nombreCliente, version: "1.0.0" });
        const transporte = new StreamableHTTPClientTransport(new URL(this.o.url), {
          requestInit: { headers: { Authorization: `Bearer ${this.o.apiKey}` } },
        });
        await conTiempoMaximo(cliente.connect(transporte), this.o.timeoutMs, "Tiempo agotado conectando con Croma");
        this.o.registro.info("croma.conectado", { url: this.o.url });
        return cliente;
      })().catch((e) => {
        this.conexion = null;
        throw e;
      });
    }
    return this.conexion;
  }

  private async reiniciarConexion(): Promise<void> {
    const c = this.conexion;
    this.conexion = null;
    if (c) await c.then((x) => x.close()).catch(() => undefined);
  }

  /** Catálogo de herramientas (tools/list), en caché por diez minutos. */
  async herramientas(forzar = false): Promise<HerramientaCroma[]> {
    if (!forzar && this.catalogo && this.catalogo.vence > Date.now()) return this.catalogo.herramientas;
    const lista: HerramientaCroma[] = [];
    let cursor: string | undefined;
    const c = await this.cliente();
    do {
      const r = await conTiempoMaximo(c.listTools(cursor ? { cursor } : undefined), this.o.timeoutMs, "Tiempo agotado listando herramientas de Croma");
      lista.push(...r.tools.map((t) => aHerramienta(t)));
      cursor = r.nextCursor;
    } while (cursor);
    this.catalogo = { herramientas: lista.sort((a, b) => a.nombre.localeCompare(b.nombre)), vence: Date.now() + this.o.catalogoTtlMs };
    this.asignaciones = mapearCapacidades(this.catalogo.herramientas, this.o.mapeo);
    return this.catalogo.herramientas;
  }

  async capacidades(): Promise<Map<IdCapacidad, AsignacionCapacidad>> {
    if (!this.asignaciones || !this.catalogo || this.catalogo.vence <= Date.now()) await this.herramientas(true);
    return this.asignaciones!;
  }

  async asignacion(capacidad: IdCapacidad): Promise<AsignacionCapacidad | null> {
    if (!this.configurado) return null;
    try {
      return (await this.capacidades()).get(capacidad) ?? null;
    } catch (e) {
      this.ultimoError = String((e as Error).message ?? e);
      return null;
    }
  }

  async disponible(capacidad: IdCapacidad): Promise<boolean> {
    return (await this.asignacion(capacidad)) !== null;
  }

  private procedencia(parcial: Partial<ProcedenciaCroma> & { finalidad: string; estado: EstadoConsulta }): ProcedenciaCroma {
    return {
      id: `prc_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      tipo: this.o.simulado ? "SIMULADO" : "CROMA",
      herramienta: null, capacidad: null, argumentos: null, url: null,
      consultadoEn: new Date().toISOString(), hashResultado: null, resumen: null, latenciaMs: 0, error: null, desdeCache: false,
      ...parcial,
    };
  }

  /** Llama una herramienta concreta. `finalidad` es obligatoria (Ley 1581 de 2012). */
  async llamarHerramienta(nombre: string, args: Record<string, unknown>, meta: { finalidad: string; capacidad?: IdCapacidad; ttlSegundos?: number }): Promise<ResultadoConsulta> {
    if (!meta.finalidad?.trim()) throw new ErrorCroma("FINALIDAD_REQUERIDA", "Toda consulta a fuentes oficiales debe declarar su finalidad.");
    const base = { herramienta: nombre, capacidad: meta.capacidad ?? null, argumentos: args, finalidad: meta.finalidad };
    const clave = sha(`${nombre}:${estable(args)}`);
    const guardado = this.cache.get(clave);
    if (guardado) return { ...guardado, procedencia: { ...guardado.procedencia, id: `prc_${randomUUID().replace(/-/g, "").slice(0, 20)}`, desdeCache: true, finalidad: meta.finalidad } };
    if (!this.configurado) return { estado: "ERROR", texto: "", datos: null, procedencia: this.procedencia({ ...base, estado: "ERROR", error: "CROMA_API_KEY no configurada" }) };
    if (!this.circuito.permite()) return { estado: "ERROR", texto: "", datos: null, procedencia: this.procedencia({ ...base, estado: "ERROR", error: "Cortacircuitos abierto: Croma presentó fallas consecutivas; se reintentará tras el enfriamiento." }) };

    const inicio = Date.now();
    try {
      const resultado = await this.semaforo.ejecutar(async () => {
        let intentosPendiente = 0;
        for (;;) {
          const r = (await conReintentos(async () => {
            try {
              const c = await this.cliente();
              return await c.callTool({ name: nombre, arguments: args }, undefined, { timeout: this.o.timeoutMs });
            } catch (e) {
              if (esReintentable(e)) await this.reiniciarConexion();
              throw e;
            }
          }, { intentos: this.o.reintentos, baseMs: this.o.esperaReintentoMs, esReintentable })) as ContenidoMcp;
          const datos = datosDe(r);
          if (!r.isError && esPendiente(datos) && intentosPendiente < this.o.maxPendientes) {
            intentosPendiente += 1;
            this.o.registro.info("croma.pendiente", { herramienta: nombre, intento: intentosPendiente });
            await new Promise((ok) => setTimeout(ok, this.o.esperaPendienteMs));
            continue;
          }
          return r;
        }
      });
      this.circuito.exito();
      const texto = textoDe(resultado);
      const datos = datosDe(resultado);
      const estado: EstadoConsulta = resultado.isError ? "ERROR" : esPendiente(datos) ? "PENDIENTE" : esSinResultados(datos, texto) ? "SIN_RESULTADOS" : "OK";
      const salida: ResultadoConsulta = {
        estado, texto, datos,
        procedencia: this.procedencia({ ...base, estado, hashResultado: sha(texto), resumen: texto.replace(/\s+/g, " ").slice(0, 280), latenciaMs: Date.now() - inicio, error: resultado.isError ? texto.slice(0, 500) : null }),
      };
      if (estado === "OK" || estado === "SIN_RESULTADOS") this.cache.set(clave, salida, meta.ttlSegundos ?? (meta.capacidad ? definicionCapacidad(meta.capacidad).ttlSegundos : 3600));
      this.o.registro.debug("croma.consulta", { herramienta: nombre, estado, ms: Date.now() - inicio });
      return salida;
    } catch (e) {
      const mensaje = String((e as Error)?.message ?? e);
      const noAutorizado = esNoAutorizado(e);
      this.ultimoError = mensaje;
      if (!noAutorizado) this.circuito.fallo();
      this.o.registro.warn("croma.falla", { herramienta: nombre, error: mensaje, http: codigoHttp(e) });
      const codigo = codigoHttp(e);
      return { estado: "ERROR", texto: "", datos: null, procedencia: this.procedencia({ ...base, estado: "ERROR", error: noAutorizado ? "Credencial de Croma rechazada (401/403)." : `${codigo ? `HTTP ${codigo}: ` : ""}${mensaje.slice(0, 480)}`, latenciaMs: Date.now() - inicio }) };
    }
  }

  /**
   * Consulta por capacidad con valores canónicos. Las capacidades de datos
   * personales con autorización EXPLÍCITA exigen `autorizada: true` (decisión
   * registrada del ABOGADO (USUARIO) para ese expediente).
   */
  async consultar(capacidad: IdCapacidad, canonicos: Record<string, unknown>, opciones: { finalidad?: string; autorizada?: boolean } = {}): Promise<ResultadoConsulta> {
    const def = definicionCapacidad(capacidad);
    const finalidad = opciones.finalidad ?? def.finalidad;
    if (def.autorizacion === "EXPLICITA" && !opciones.autorizada) throw new ErrorCroma("NO_AUTORIZADO", `La capacidad ${capacidad} exige autorización expresa del ABOGADO (USUARIO) para este expediente.`);
    const asignacion = await this.asignacion(capacidad);
    if (!asignacion) {
      return { estado: "ERROR", texto: "", datos: null, procedencia: this.procedencia({ capacidad, argumentos: canonicos, finalidad, estado: "ERROR", error: this.configurado ? `Croma no expone una herramienta para la capacidad ${capacidad} (${def.descripcion}).` : "CROMA_API_KEY no configurada" }) };
    }
    const args = construirArgumentos(asignacion, canonicos);
    return this.llamarHerramienta(asignacion.herramienta.nombre, args, { finalidad, capacidad, ttlSegundos: def.ttlSegundos });
  }

  async estado(): Promise<EstadoCroma> {
    let herramientas = 0;
    let disponibles: string[] = [];
    let conectado = false;
    if (this.configurado) {
      try {
        herramientas = (await this.herramientas()).length;
        disponibles = [...(await this.capacidades()).keys()];
        conectado = true;
      } catch (e) {
        this.ultimoError = String((e as Error).message ?? e);
      }
    }
    const { CAPACIDADES } = await import("./capacidades");
    return {
      configurado: this.configurado, conectado, url: this.o.url, herramientas,
      capacidadesDisponibles: disponibles, capacidadesFaltantes: CAPACIDADES.map((c) => c.id).filter((id) => !disponibles.includes(id)),
      circuito: this.circuito.estado, ultimoError: this.ultimoError, cacheEntradas: this.cache.tamano,
    };
  }

  async cerrar(): Promise<void> {
    await this.reiniciarConexion();
  }
}

export function crearClienteCromaDesdeEntorno(extra: Partial<OpcionesCroma> = {}, entorno: NodeJS.ProcessEnv = process.env): ClienteCroma {
  let mapeo: MapeoConfigurado = {};
  if (entorno.CROMA_MAPEO_JSON) {
    try {
      mapeo = JSON.parse(entorno.CROMA_MAPEO_JSON) as MapeoConfigurado;
    } catch {
      throw new Error("CROMA_MAPEO_JSON no es JSON válido");
    }
  }
  return new ClienteCroma({
    url: entorno.CROMA_MCP_URL || CROMA_URL_POR_DEFECTO,
    apiKey: entorno.CROMA_API_KEY || null,
    timeoutMs: entorno.CROMA_TIMEOUT_MS ? Number(entorno.CROMA_TIMEOUT_MS) : undefined,
    maxConcurrencia: entorno.CROMA_CONCURRENCIA ? Number(entorno.CROMA_CONCURRENCIA) : undefined,
    mapeo,
    ...extra,
  });
}
