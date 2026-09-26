import { generarPieza } from "@em/docgen";
import type { ManejadorNodo } from "../contexto";
import { completado } from "./comun";
import { renderizarInforme } from "./entrega";
import { MIME_DOCX, registrarEntregable } from "./entregables";
import { documentoPieza } from "./estrategia";

/* e7 · Salida: dos finales, no hay un tercero. */

/** Terminal favorable: versión radicable de la pieza y versión final del informe, tras la aprobación del ABOGADO (USUARIO). */
export const n_entrega: ManejadorNodo = async (ctx) => {
  const aprobacion = ctx.exp.decisiones.filter((d) => d.compuerta === "g_revision").at(-1);
  if (aprobacion?.decision !== "si") throw new Error("No hay aprobación del ABOGADO (USUARIO): no se genera versión radicable.");
  const pieza = ctx.exp.borradores.pieza as Parameters<typeof documentoPieza>[1] | undefined;
  const salidas: string[] = [];
  if (pieza) {
    const perfil = ctx.s.abogados ? await ctx.s.abogados.perfil(ctx.exp.propietarioId) : null;
    const doc = await generarPieza(documentoPieza(ctx, pieza, "RADICABLE", perfil));
    const e = await registrarEntregable(ctx, { tipo: "PIEZA_PROCESAL", modo: "RADICABLE", contenido: doc.docx, nombreArchivo: `${pieza.tipo}_RADICABLE.docx`, mime: MIME_DOCX });
    salidas.push(`pieza radicable v${e.version}`);
  }
  const informe = await renderizarInforme(ctx, "FINAL");
  salidas.push(`informe técnico final (${informe.paginas ?? "?"} páginas)`);
  if (ctx.s.terminos) await ctx.s.terminos.indexar(ctx.exp);
  return completado(`Entregado: ${salidas.join(", ")}. Aprobó ${aprobacion.actor} el ${aprobacion.decididoEn.slice(0, 10)}.`);
};

/** Terminal alternativo: dictamen de no radicación o remisión, con el trabajo hecho. */
export const n_remision: ManejadorNodo = async (ctx) => {
  const motivos = (ctx.exp.analisis.habilitacion?.hallazgos ?? []).filter((h) => h.tipo === "IMPEDIMENTO").map((h) => `${h.descripcion} Fundamento: ${h.fundamento}. Acción: ${h.accion}`);
  const r = await renderizarInforme(ctx, "DICTAMEN", motivos.length ? motivos : ["La actuación no es procedente en las condiciones actuales."]);
  if (ctx.s.terminos) await ctx.s.terminos.indexar(ctx.exp);
  return completado(`Dictamen de no radicación emitido (v${r.entregable.version}): ${motivos.length} impedimento(s).`);
};
