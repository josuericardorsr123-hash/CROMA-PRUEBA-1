import {
  ErrorIA, type LlmPort, type PeticionAgente, type PeticionEstructurada, type RespuestaAgente, type RespuestaEstructurada,
  type TrazaHerramienta, USO_CERO,
} from "./puerto";

export type ManejadorSimulado = (p: PeticionEstructurada<unknown>) => unknown | Promise<unknown>;
export type GuionAgente = (p: PeticionAgente, usar: (nombre: string, entrada: unknown) => Promise<string>) => Promise<string>;

/**
 * Proveedor simulado y determinista para pruebas y demostración. Cada tarea se
 * resuelve con un manejador; la salida se valida contra el mismo esquema que
 * usaría el modelo real, de modo que un accesorio inválido falla la prueba.
 */
export class LlmSimulado implements LlmPort {
  readonly nombre = "simulado";
  readonly llamadas: Array<{ tarea: string; instruccion: string; adjuntos: number }> = [];

  constructor(private readonly manejadores: Record<string, ManejadorSimulado>, private readonly guiones: Record<string, GuionAgente> = {}) {}

  async estructurado<T>(p: PeticionEstructurada<T>): Promise<RespuestaEstructurada<T>> {
    this.llamadas.push({ tarea: p.tarea, instruccion: p.instruccion, adjuntos: p.adjuntos?.length ?? 0 });
    const h = this.manejadores[p.tarea];
    if (!h) throw new ErrorIA("SIN_SIMULACION", `No hay simulación para la tarea ${p.tarea}.`);
    const r = p.esquema.safeParse(await h(p as PeticionEstructurada<unknown>));
    if (!r.success) throw new ErrorIA("ESQUEMA_INVALIDO", `La simulación de ${p.tarea} no cumple ${p.nombreEsquema}: ${JSON.stringify(r.error.issues.slice(0, 5))}`);
    return { datos: r.data, uso: USO_CERO, modelo: "simulado", detencion: "end_turn", fallbackUsado: false };
  }

  async agente(p: PeticionAgente): Promise<RespuestaAgente> {
    this.llamadas.push({ tarea: p.tarea, instruccion: p.instruccion, adjuntos: 0 });
    const guion = this.guiones[p.tarea];
    const trazas: TrazaHerramienta[] = [];
    const usar = async (nombre: string, entrada: unknown) => {
      const h = p.herramientas.find((x) => x.nombre === nombre);
      if (!h) throw new ErrorIA("SIN_SIMULACION", `Herramienta no ofrecida al agente: ${nombre}`);
      const r = await h.ejecutar(entrada);
      trazas.push({ herramienta: nombre, entrada, esError: Boolean(r.esError), resumen: r.contenido.slice(0, 200) });
      return r.contenido;
    };
    const texto = guion ? await guion(p, usar) : "Sin hallazgos adicionales.";
    return { texto, trazas, turnos: trazas.length + 1, uso: USO_CERO, modelo: "simulado" };
  }
}
