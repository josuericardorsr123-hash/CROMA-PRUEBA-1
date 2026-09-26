import { type Entregable, nuevoId } from "@em/dominio";
import type { ContextoNodo } from "../contexto";

/** Registra un entregable versionado (cada regeneración crea una versión nueva; ninguna se sobrescribe). */
export async function registrarEntregable(ctx: ContextoNodo, d: { tipo: Entregable["tipo"]; modo: Entregable["modo"]; contenido: Buffer; nombreArchivo: string; mime: string; paginas?: number | null }): Promise<Entregable> {
  const guardado = await ctx.guardarBlob(d.contenido, d.mime, d.nombreArchivo);
  const version = ctx.exp.entregables.filter((e) => e.tipo === d.tipo && e.modo === d.modo).reduce((m, e) => Math.max(m, e.version), 0) + 1;
  const e: Entregable = { id: nuevoId("ent"), tipo: d.tipo, version, modo: d.modo, blobId: guardado.blobId, nombreArchivo: d.nombreArchivo, mime: d.mime, sha256: guardado.sha256, paginas: d.paginas ?? null, generadoEn: ctx.ahora() };
  ctx.exp.entregables.push(e);
  return e;
}

export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function ultimoEntregable(exp: ContextoNodo["exp"], tipo: Entregable["tipo"], modo?: Entregable["modo"]): Entregable | null {
  return [...exp.entregables].filter((e) => e.tipo === tipo && (!modo || e.modo === modo)).sort((a, b) => b.version - a.version || b.generadoEn.localeCompare(a.generadoEn))[0] ?? null;
}
