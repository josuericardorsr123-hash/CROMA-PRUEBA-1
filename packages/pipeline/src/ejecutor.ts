import {
  type AccionAbogado, aristasHaciaAdelante, type Arista, type DecisionCompuerta, type DefinicionGrafo, type EstadoNodo, type Expediente, GRAFO, hoyColombia,
  type IdCompuerta, IdCompuerta as EsquemaCompuerta, nuevoId, type Nodo, sha256,
} from "@em/dominio";
import { ErrorIA } from "@em/ia";
import { type ContextoNodo, ErrorPipeline, type ManejadorNodo, type ResultadoNodo, type Servicios } from "./contexto";

/* ────────────────────────────────────────────────────────────────────────────
 * Ejecutor del grafo. Semántica:
 *  - Una arista hacia adelante está VIVA si su origen se completó (y, si el
 *    origen es una compuerta, si eligió su rama), MUERTA si su origen se omitió
 *    o eligió la otra rama, y PENDIENTE en otro caso.
 *  - Un nodo corre cuando ninguna entrada está pendiente y alguna está viva; si
 *    todas están muertas se OMITE (eliminación de caminos muertos).
 *  - Las aristas de retorno declaradas reinician el tramo desde su destino
 *    (todos los nodos alcanzables desde él vuelven a PENDIENTE).
 *  - Una PAUSA detiene el lanzamiento de nodos: el ABOGADO (USUARIO) decide y
 *    la ejecución se reanuda desde el mismo nodo.
 *  - Tras cada nodo se guarda un punto de control: un proceso caído reanuda
 *    desde el último nodo completado.
 * ──────────────────────────────────────────────────────────────────────────── */

export type EstadoFinal = "TERMINADO" | "PAUSADO" | "ERROR" | "CANCELADO";

export interface EventoPipeline {
  tipo: "NODO_INICIADO" | "NODO_TERMINADO" | "RETORNO" | "PAUSA" | "FIN" | "ERROR";
  nodo: string | null;
  resultado?: string;
  detalle: string;
  instante: string;
}

export interface OpcionesEjecucion {
  /** Punto de control: persiste el expediente y devuelve la versión guardada. */
  guardar: (exp: Expediente) => Promise<Expediente>;
  alEvento?: (e: EventoPipeline) => void;
  senal?: AbortSignal;
  grafo?: DefinicionGrafo;
  /** Reintentos ante fallas transitorias de un nodo (API, red). */
  reintentosNodo?: number;
  esperaReintentoMs?: number;
}

export interface ResultadoEjecucion {
  estado: EstadoFinal;
  exp: Expediente;
  pausa: Expediente["ejecucion"]["pausa"];
  error: string | null;
  nodosEjecutados: string[];
}

type EstadoArista = "VIVA" | "MUERTA" | "PENDIENTE";

/** Nodos alcanzables hacia adelante desde un origen (incluido). */
export function alcanzablesDesde(origen: string, adelante: Arista[]): Set<string> {
  const visto = new Set([origen]);
  const pila = [origen];
  while (pila.length) {
    const x = pila.pop()!;
    for (const a of adelante) if (a.o === x && !visto.has(a.d)) visto.add(a.d), pila.push(a.d);
  }
  return visto;
}

function esTransitorio(e: unknown): boolean {
  if (e instanceof ErrorIA) return e.codigo === "API" && /tasa|429|5\d\d|overloaded|timeout/i.test(e.message);
  return /ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|EAI_AGAIN/i.test(String((e as Error)?.message ?? e));
}

export class Ejecutor {
  private readonly g: DefinicionGrafo;
  private readonly adelante: Arista[];
  private readonly entradas = new Map<string, Arista[]>();
  private readonly retornos: Arista[];

  constructor(private readonly manejadores: Record<string, ManejadorNodo>, grafo: DefinicionGrafo = GRAFO) {
    this.g = grafo;
    this.adelante = aristasHaciaAdelante(grafo);
    for (const a of this.adelante) this.entradas.set(a.d, [...(this.entradas.get(a.d) ?? []), a]);
    this.retornos = grafo.aristas.filter((a) => a.retorno);
    const faltantes = grafo.nodos.filter((n) => !manejadores[n.id]).map((n) => n.id);
    if (faltantes.length) throw new ErrorPipeline("SIN_MANEJADOR", `Nodos del grafo sin manejador: ${faltantes.join(", ")}`);
  }

  get grafo(): DefinicionGrafo {
    return this.g;
  }

  private estadoArista(exp: Expediente, a: Arista): EstadoArista {
    const e = exp.ejecucion.estados[a.o];
    if (e === "OMITIDO") return "MUERTA";
    if (e !== "COMPLETADO") return "PENDIENTE";
    if (a.rama) return exp.ejecucion.ramas[a.o] === a.rama ? "VIVA" : "MUERTA";
    return "VIVA";
  }

  /** Elimina caminos muertos hasta el punto fijo. Devuelve los nodos omitidos. */
  private propagarOmisiones(exp: Expediente): string[] {
    const omitidos: string[] = [];
    for (let cambio = true; cambio;) {
      cambio = false;
      for (const n of this.g.nodos) {
        if (exp.ejecucion.estados[n.id] !== "PENDIENTE" || n.id === this.g.inicio) continue;
        const ents = this.entradas.get(n.id) ?? [];
        if (ents.length && ents.every((a) => this.estadoArista(exp, a) === "MUERTA")) {
          exp.ejecucion.estados[n.id] = "OMITIDO";
          omitidos.push(n.id);
          cambio = true;
        }
      }
    }
    return omitidos;
  }

  private listos(exp: Expediente, enCurso: Set<string>): Nodo[] {
    return this.g.nodos.filter((n) => {
      if (exp.ejecucion.estados[n.id] !== "PENDIENTE" || enCurso.has(n.id)) return false;
      const ents = this.entradas.get(n.id) ?? [];
      if (!ents.length) return n.id === this.g.inicio;
      const estados = ents.map((a) => this.estadoArista(exp, a));
      return !estados.includes("PENDIENTE") && estados.includes("VIVA");
    });
  }

  /** Reinicia el tramo desde el destino de un retorno. */
  private reiniciar(exp: Expediente, destino: string): string[] {
    const tramo = alcanzablesDesde(destino, this.adelante);
    for (const id of tramo) {
      exp.ejecucion.estados[id] = "PENDIENTE";
      delete exp.ejecucion.ramas[id];
    }
    return [...tramo];
  }

  private preparar(exp: Expediente, ahora: string): void {
    for (const n of this.g.nodos) {
      const e = exp.ejecucion.estados[n.id];
      // Recuperación: lo que estaba en curso o esperando vuelve a evaluarse.
      if (!e || e === "EN_CURSO" || e === "ESPERANDO" || e === "ERROR") exp.ejecucion.estados[n.id] = "PENDIENTE";
    }
    exp.ejecucion.pausa = null;
    exp.ejecucion.error = null;
    exp.ejecucion.iniciadaEn ??= ahora;
    exp.ejecucion.finalizadaEn = null;
    exp.estado = "EN_PROCESO";
  }

  private contexto(exp: Expediente, nodo: Nodo, s: Servicios): ContextoNodo {
    const tenantId = exp.tenantId;
    return {
      exp, nodo, s,
      iteracion: exp.ejecucion.iteraciones.ciclo ?? 0,
      ahora: () => s.reloj().toISOString(),
      hoy: () => hoyColombia(s.reloj()),
      procedencia: async (p, texto) => {
        let blobResultadoId: string | null = null;
        if (texto) blobResultadoId = (await s.blobs.guardar(Buffer.from(texto, "utf8"), { tenantId, mime: "text/plain" })).blobId;
        exp.procedencias.push({
          id: p.id, tipo: p.tipo, herramienta: p.herramienta, capacidad: p.capacidad, argumentos: p.argumentos, url: p.url, consultadoEn: p.consultadoEn,
          finalidad: p.finalidad, estado: p.estado, hashResultado: p.hashResultado ?? (texto ? sha256(texto) : null), blobResultadoId, resumen: p.resumen, latenciaMs: p.latenciaMs, error: p.error,
        });
        return p.id;
      },
      guardarBlob: (datos, mime, nombre) => s.blobs.guardar(datos, { tenantId, mime, nombre }),
      leerBlob: (id) => s.blobs.leer(id, tenantId),
      instrucciones: (accion?: AccionAbogado | AccionAbogado[]) => {
        const acciones = accion ? (Array.isArray(accion) ? accion : [accion]) : null;
        return exp.instrucciones.filter((i) => !i.consumida && (!acciones || acciones.includes(i.accion)) && (!i.nodo || i.nodo === nodo.id));
      },
      consumir: (i) => {
        const x = exp.instrucciones.find((y) => y.id === i.id);
        if (x) x.consumida = true, x.consumidaEn = s.reloj().toISOString();
      },
      hallazgo: (h) => ({ id: nuevoId("hal"), soportes: [], fundamento: null, recomendacion: null, ...h }),
      log: (mensaje, datos) => s.registro.info(`pipeline.${nodo.id}`, { mensaje, ...datos }),
    };
  }

  private async correrNodo(ctx: ContextoNodo, opciones: OpcionesEjecucion): Promise<ResultadoNodo> {
    const intentos = (opciones.reintentosNodo ?? 2) + 1;
    for (let i = 1; ; i++) {
      try {
        return await this.manejadores[ctx.nodo.id]!(ctx);
      } catch (e) {
        if (i >= intentos || !esTransitorio(e)) throw e;
        await new Promise((ok) => setTimeout(ok, (opciones.esperaReintentoMs ?? 2000) * 4 ** (i - 1)));
      }
    }
  }

  async ejecutar(entrada: Expediente, s: Servicios, opciones: OpcionesEjecucion): Promise<ResultadoEjecucion> {
    let exp = structuredClone(entrada);
    const emitir = (e: Omit<EventoPipeline, "instante">) => opciones.alEvento?.({ ...e, instante: s.reloj().toISOString() });
    this.preparar(exp, s.reloj().toISOString());
    const ejecutados: string[] = [];
    let guardando: Promise<void> = Promise.resolve();
    const puntoDeControl = () => {
      guardando = guardando.then(async () => {
        const guardado = await opciones.guardar(exp);
        exp.version = guardado.version;
        exp.actualizadoEn = guardado.actualizadoEn;
      });
      return guardando;
    };
    await puntoDeControl();

    const enCurso = new Map<string, Promise<{ id: string; r: ResultadoNodo | null; error: unknown; inicio: string }>>();
    let pausa: Expediente["ejecucion"]["pausa"] = null;
    let error: string | null = null;
    let terminal: string | null = null;

    const lanzar = (n: Nodo) => {
      exp.ejecucion.estados[n.id] = "EN_CURSO";
      const inicio = s.reloj().toISOString();
      emitir({ tipo: "NODO_INICIADO", nodo: n.id, detalle: n.nombre });
      enCurso.set(n.id, this.correrNodo(this.contexto(exp, n, s), opciones).then(
        (r) => ({ id: n.id, r, error: null, inicio }),
        (e) => ({ id: n.id, r: null, error: e, inicio }),
      ));
    };

    for (;;) {
      if (!pausa && !error && !terminal && !opciones.senal?.aborted) {
        for (const id of this.propagarOmisiones(exp)) emitir({ tipo: "NODO_TERMINADO", nodo: id, resultado: "OMITIDO", detalle: "Camino muerto: ninguna entrada activa." });
        for (const n of this.listos(exp, new Set(enCurso.keys())).slice(0, Math.max(0, s.config.concurrencia - enCurso.size))) lanzar(n);
      }
      if (!enCurso.size) break;
      const { id, r, error: fallo, inicio } = await Promise.race(enCurso.values());
      enCurso.delete(id);
      const nodo = this.g.nodos.find((n) => n.id === id)!;
      const fin = s.reloj().toISOString();
      const iteracion = exp.ejecucion.iteraciones.ciclo ?? 0;
      if (fallo || !r) {
        const mensaje = fallo instanceof Error ? `${fallo.name}: ${fallo.message}` : String(fallo);
        exp.ejecucion.estados[id] = "ERROR";
        exp.ejecucion.historial.push({ nodo: id, inicio, fin, resultado: "ERROR", detalle: mensaje.slice(0, 2000), iteracion });
        error = `${nodo.nombre}: ${mensaje}`;
        emitir({ tipo: "ERROR", nodo: id, detalle: mensaje });
        await puntoDeControl();
        continue;
      }
      ejecutados.push(id);
      switch (r.tipo) {
        case "COMPLETADO":
        case "OMITIDO":
          exp.ejecucion.estados[id] = r.tipo;
          exp.ejecucion.historial.push({ nodo: id, inicio, fin, resultado: r.tipo, detalle: r.detalle.slice(0, 2000), iteracion });
          break;
        case "DECISION": {
          exp.ejecucion.estados[id] = "COMPLETADO";
          exp.ejecucion.ramas[id] = r.rama;
          exp.ejecucion.historial.push({ nodo: id, inicio, fin, resultado: "DECISION", detalle: `${r.rama}: ${r.motivo}`.slice(0, 2000), iteracion });
          if (EsquemaCompuerta.safeParse(id).success) {
            const d: DecisionCompuerta = { compuerta: id as IdCompuerta, decision: r.rama, motivo: r.motivo, actor: r.actor ?? "SISTEMA", decididoEn: fin, anulacionHumana: r.anulacionHumana ?? false, iteracion: exp.ejecucion.iteraciones[id] ?? 0 };
            exp.decisiones.push(d);
          }
          break;
        }
        case "PAUSA":
          exp.ejecucion.estados[id] = "ESPERANDO";
          pausa = { nodo: id, motivo: r.motivo, acciones: r.acciones, detalle: r.detalle, desde: fin };
          exp.ejecucion.historial.push({ nodo: id, inicio, fin, resultado: "PAUSA", detalle: r.motivo.slice(0, 2000), iteracion });
          emitir({ tipo: "PAUSA", nodo: id, detalle: r.motivo });
          break;
      }
      emitir({ tipo: "NODO_TERMINADO", nodo: id, resultado: r.tipo === "DECISION" ? `DECISION:${r.rama}` : r.tipo, detalle: "motivo" in r ? r.motivo : r.detalle });

      // Retornos declarados: desde una compuerta (por su rama) o desde un nodo (al completarse).
      if (r.tipo === "DECISION" || r.tipo === "COMPLETADO") {
        const retorno = this.retornos.find((a) => a.o === id && (a.rama ? r.tipo === "DECISION" && r.rama === a.rama : true));
        if (retorno) {
          const clave = this.g.nodos.find((n) => n.id === id)?.tipo === "decision" ? id : "revision";
          const limite = clave === "g_citas" ? s.config.maxIteraciones.g_citas : clave === "revision" ? s.config.maxIteraciones.revision : Number.POSITIVE_INFINITY;
          const hechas = exp.ejecucion.iteraciones[clave] ?? 0;
          if (hechas >= limite) {
            error = `Se alcanzó el límite de ${limite} re-elaboraciones por ${clave}: se requiere decisión del ABOGADO (USUARIO).`;
            exp.ejecucion.estados[id] = "ERROR";
          } else {
            exp.ejecucion.iteraciones[clave] = hechas + 1;
            exp.ejecucion.iteraciones.ciclo = (exp.ejecucion.iteraciones.ciclo ?? 0) + 1;
            const tramo = this.reiniciar(exp, retorno.d);
            emitir({ tipo: "RETORNO", nodo: id, detalle: `${retorno.etiqueta ?? "retorno"}: se reinicia el tramo desde ${retorno.d} (${tramo.length} nodos).` });
          }
        }
      }
      if (this.g.terminales.includes(id) && exp.ejecucion.estados[id] === "COMPLETADO") terminal = id;
      await puntoDeControl();
    }

    await guardando;
    const ahora = s.reloj().toISOString();
    let estado: EstadoFinal;
    if (error) {
      estado = "ERROR";
      exp.ejecucion.error = error;
      exp.estado = "ERROR";
    } else if (pausa) {
      estado = "PAUSADO";
      exp.ejecucion.pausa = pausa;
      exp.estado = pausa.nodo === "g_revision" ? "EN_REVISION" : "REQUIERE_ACCION";
    } else if (terminal) {
      estado = "TERMINADO";
      for (const n of this.g.nodos) if (exp.ejecucion.estados[n.id] === "PENDIENTE") exp.ejecucion.estados[n.id] = "OMITIDO";
      exp.ejecucion.finalizadaEn = ahora;
      exp.estado = terminal === "n_entrega" ? "APROBADO" : "REMITIDO";
      emitir({ tipo: "FIN", nodo: terminal, detalle: exp.estado });
    } else if (opciones.senal?.aborted) {
      estado = "CANCELADO";
      exp.estado = "REQUIERE_ACCION";
      exp.ejecucion.pausa = { nodo: "n_exp", motivo: "Ejecución cancelada por el ABOGADO (USUARIO).", acciones: ["REANUDAR"], desde: ahora };
    } else {
      const pendientes = this.g.nodos.filter((n) => exp.ejecucion.estados[n.id] === "PENDIENTE").map((n) => n.id);
      estado = "ERROR";
      error = `El pipeline se detuvo sin terminal: nodos pendientes sin entradas activas (${pendientes.slice(0, 8).join(", ")}).`;
      exp.ejecucion.error = error;
      exp.estado = "ERROR";
    }
    exp = await opciones.guardar(exp);
    return { estado, exp, pausa: exp.ejecucion.pausa, error, nodosEjecutados: ejecutados };
  }
}

/** Resumen de avance por etapa (para la consola del ABOGADO (USUARIO)). */
export function avance(exp: Expediente, grafo: DefinicionGrafo = GRAFO): Array<{ etapa: string; nombre: string; total: number; completados: number; omitidos: number; enCurso: string[]; esperando: string[]; errores: string[] }> {
  return grafo.etapas.map((e) => {
    const nodos = grafo.nodos.filter((n) => n.etapa === e.id);
    const est = (x: EstadoNodo) => nodos.filter((n) => exp.ejecucion.estados[n.id] === x).map((n) => n.id);
    return { etapa: e.id, nombre: e.nombre, total: nodos.length, completados: est("COMPLETADO").length, omitidos: est("OMITIDO").length, enCurso: est("EN_CURSO"), esperando: est("ESPERANDO"), errores: est("ERROR") };
  });
}
