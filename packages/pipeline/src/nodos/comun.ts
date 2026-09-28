import type { AccionAbogado, Gravedad } from "@em/dominio";
import type { ContextoNodo, ResultadoNodo } from "../contexto";

export const completado = (detalle: string): ResultadoNodo => ({ tipo: "COMPLETADO", detalle });
export const omitido = (detalle: string): ResultadoNodo => ({ tipo: "OMITIDO", detalle });
export const decision = (rama: "si" | "no", motivo: string, extra: { actor?: string; anulacionHumana?: boolean } = {}): ResultadoNodo => ({ tipo: "DECISION", rama, motivo, ...extra });
export const pausa = (motivo: string, acciones: Array<AccionAbogado | "CARGAR_DOCUMENTOS" | "CONFIGURAR">, detalle?: unknown): ResultadoNodo => ({ tipo: "PAUSA", motivo, acciones, detalle });

/** Los módulos se re-ejecutan en los bucles: cada uno reemplaza sus propios avisos. */
export function reiniciarAvisos(ctx: ContextoNodo): void {
  ctx.exp.analisis.avisos = ctx.exp.analisis.avisos.filter((a) => a.modulo !== ctx.nodo.id);
}

export function aviso(ctx: ContextoNodo, texto: string, gravedad: Gravedad = "INFORMATIVA"): void {
  if (!ctx.exp.analisis.avisos.some((a) => a.modulo === ctx.nodo.id && a.texto === texto)) ctx.exp.analisis.avisos.push({ modulo: ctx.nodo.id, texto, gravedad });
}

/** Ejecuta tareas con un límite de concurrencia, conservando el orden de los resultados. */
export async function enParalelo<T, R>(items: T[], limite: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(items.length);
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      salida[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(trabajadores);
  return salida;
}

export const tituloCorto = (t: string, max = 80) => (t.length <= max ? t : `${t.slice(0, max - 1)}…`);
