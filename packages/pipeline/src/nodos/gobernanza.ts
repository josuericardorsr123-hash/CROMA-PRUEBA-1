import { type Afirmacion, type Correccion, type EtiquetaConfianza, type Expediente, jsonEstable, nuevoId, sha256 } from "@em/dominio";
import { construirIndice, empaquetar, indiceCsv } from "@em/documentos";
import { evaluarHabilitacion } from "@em/motores";
import type { ContextoNodo, ManejadorNodo } from "../contexto";
import { LeccionesDisociadas, PoderLeido, Retroalimentacion, Sesgo } from "../esquemas";
import { tarea } from "../ia";
import type { AfirmacionFuente } from "../informe";
import { bloques, vistaAnalisis, vistaCaso, vistaHechos, vistaPartes } from "../vistas";
import { aviso, completado, decision, pausa, reiniciarAvisos } from "./comun";
import { renderizarInforme } from "./entrega";
import { registrarEntregable, ultimoEntregable } from "./entregables";

/* e6 · Gobernanza (Capa D): anexos, trazabilidad encadenada, etiquetas de
 * confianza, sesgo, control del ejercicio profesional y las dos compuertas que
 * ningún módulo puede saltar: habilitación y aprobación del ABOGADO (USUARIO). */

type PiezaGuardada = { redactada: { secciones: Array<{ titulo: string; parrafos: Array<{ texto: string; fuenteIds: string[]; hechoIds: string[]; soportes: Array<{ archivoId: string; pagina: number }> }> }> }; tipo: string };

/** Módulo 28 · paquete de anexos con numeración estable y validación de remisiones cruzadas. */
export const m28: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const anexos = ctx.exp.piezas.filter((p) => p.estado === "ORGANIZADO" && p.anexo !== null).sort((a, b) => a.anexo! - b.anexo!);
  const numeros = new Set(anexos.map((a) => a.anexo!));
  const pieza = ctx.exp.borradores.pieza as PiezaGuardada | undefined;
  const remitidos = new Set<number>();
  for (const s of pieza?.redactada.secciones ?? []) for (const p of s.parrafos) for (const m of p.texto.matchAll(/\banexo\s+(?:n\.?\s*[º°o]?\s*)?(\d{1,3})\b/gi)) remitidos.add(Number(m[1]));
  const rotos = [...remitidos].filter((n) => !numeros.has(n));
  for (const n of rotos) aviso(ctx, `La pieza remite al anexo ${n}, que no existe en el índice electrónico: corregir la remisión.`, "ALTA");
  const filas = construirIndice(anexos.map((p) => ({ orden: p.anexo!, anexo: p.anexo, nombreDocumento: p.nombreArchivo, tipologia: p.tipologia, fechaDocumento: p.fecha, fechaIncorporacion: ctx.hoy(), paginas: p.paginas, formato: "PDF", bytes: 0, origen: p.origenFisico, sha256: p.sha256 ?? "", observaciones: remitidos.has(p.anexo!) ? "Citado en la pieza" : "" })));
  const archivos: Array<{ ruta: string; contenido: Buffer | string }> = [{ ruta: "00_RELACION_DE_ANEXOS.csv", contenido: indiceCsv(filas) }];
  for (const p of anexos.filter((x) => x.blobId)) archivos.push({ ruta: `ANEXO_${String(p.anexo).padStart(2, "0")}-${p.nombreArchivo}`, contenido: await ctx.leerBlob(p.blobId!) });
  if (anexos.length) await registrarEntregable(ctx, { tipo: "PAQUETE_ANEXOS", modo: "BORRADOR", contenido: empaquetar(archivos), nombreArchivo: "PAQUETE_DE_ANEXOS.zip", mime: "application/zip" });
  return completado(`${anexos.length} anexo(s) empaquetado(s) con foliación continua; ${rotos.length} remisión(es) rota(s).`);
};

/* ─────────────── Módulos 22 y 23 · trazabilidad y etiquetas ─────────────── */

const FUERTES = new Set(["VINCULANTE_ERGA_OMNES", "PRECEDENTE_REFORZADO", "PRECEDENTE_VINCULANTE"]);

/** Etiqueta de confianza determinista a partir del respaldo real de la afirmación. */
export function etiquetar(exp: Expediente, a: { origen: "SISTEMA" | "REDACCION"; hechos: string[]; fuentes: string[] }): EtiquetaConfianza {
  const hechos = exp.hechos.filter((h) => a.hechos.includes(h.id));
  const fuentes = exp.fuentes.filter((f) => a.fuentes.includes(f.id));
  const debil = (f: (typeof fuentes)[number]) => f.resolucion === "EXISTENCIA_CONFIRMADA" || f.resolucion === "APORTADA_POR_ABOGADO" || f.vigencia === "NO_VERIFICADA" || f.vigencia === "DEROGADA" || f.analogia?.nivel === "BAJA" || (f.clase === "PROVIDENCIA" && !FUERTES.has(f.fuerzaVinculante ?? ""));
  const hechosFirmes = hechos.every((h) => h.estado === "PROBADO_DOCUMENTAL" || h.estado === "ACREDITADO_FUENTE_OFICIAL");
  if (fuentes.length) return !fuentes.some(debil) && hechosFirmes ? "CONCLUSION_CONSOLIDADA" : "CONCLUSION_DISCUTIBLE";
  if (hechos.length) {
    const orden: Array<[string, EtiquetaConfianza]> = [["DESCONOCIDO", "DATO_NO_VERIFICADO"], ["CONTROVERTIDO", "INFERENCIA_RAZONABLE"], ["INFERIDO", "INFERENCIA_RAZONABLE"], ["AFIRMADO_POR_CLIENTE", "HECHO_AFIRMADO"], ["ACREDITADO_FUENTE_OFICIAL", "HECHO_OFICIAL"], ["PROBADO_DOCUMENTAL", "HECHO_PROBADO"]];
    for (const [estado, etiqueta] of orden) if (hechos.some((h) => h.estado === estado)) return etiqueta;
  }
  return a.origen === "SISTEMA" ? "HECHO_PROBADO" : "DATO_NO_VERIFICADO";
}

/** Módulo 22 · cadena hecho → documento → fuente → conclusión, encadenada por hash (inmutable). */
export const m22: ManejadorNodo = async (ctx) => {
  const informe = (ctx.exp.borradores.afirmacionesInforme as AfirmacionFuente[] | undefined) ?? [];
  const pieza = ctx.exp.borradores.pieza as PiezaGuardada | undefined;
  const unidades: Array<AfirmacionFuente & { entregable: Afirmacion["entregable"] }> = [
    ...informe.map((x) => ({ ...x, entregable: "INFORME_TECNICO" as const })),
    ...(pieza?.redactada.secciones ?? []).flatMap((s) => s.parrafos.map((p) => ({ entregable: "PIEZA_PROCESAL" as const, seccion: s.titulo, origen: "REDACCION" as const, texto: p.texto, hechos: p.hechoIds, fuentes: p.fuenteIds, soportes: p.soportes }))),
  ];
  let anterior = "0".repeat(64);
  const afirmaciones: Afirmacion[] = unidades.filter((u) => u.texto.trim()).map((u) => {
    const soportes = [...u.soportes, ...ctx.exp.hechos.filter((h) => u.hechos.includes(h.id)).flatMap((h) => h.soportes)].map((s) => ({ archivoId: s.archivoId, pagina: s.pagina, piezaId: null, cita: null }));
    const cuerpo = { entregable: u.entregable, seccion: u.seccion, texto: u.texto, hechos: u.hechos, soportes, fuentes: u.fuentes, conclusion: null, etiqueta: etiquetar(ctx.exp, u) };
    const huella = sha256(jsonEstable({ ...cuerpo, anterior }));
    const a: Afirmacion = { id: nuevoId("afi"), ...cuerpo, huella, anterior };
    anterior = huella;
    return a;
  });
  ctx.exp.afirmaciones = afirmaciones;
  return completado(`${afirmaciones.length} afirmación(es) encadenada(s); huella de cierre ${anterior.slice(0, 16)}….`);
};

/** Verifica la cadena de afirmaciones (cualquier edición posterior rompe la huella). */
export function verificarAfirmaciones(afirmaciones: Afirmacion[]): { integra: boolean; rotura: number | null } {
  let anterior = "0".repeat(64);
  for (let i = 0; i < afirmaciones.length; i++) {
    const a = afirmaciones[i]!;
    const { id: _id, huella, anterior: ant, ...cuerpo } = a;
    if (ant !== anterior || sha256(jsonEstable({ ...cuerpo, anterior })) !== huella) return { integra: false, rotura: i };
    anterior = huella;
  }
  return { integra: true, rotura: null };
}

/** Módulo 23 · etiquetado de confianza: advierte (no corrige) y concentra la revisión humana. */
export const m23: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const v = verificarAfirmaciones(ctx.exp.afirmaciones);
  if (!v.integra) aviso(ctx, `La cadena de trazabilidad está rota en la afirmación ${v.rotura! + 1}: se regenerará antes de la entrega.`, "BLOQUEANTE");
  const conteo = ctx.exp.afirmaciones.reduce<Record<string, number>>((acc, a) => ((acc[a.etiqueta] = (acc[a.etiqueta] ?? 0) + 1), acc), {});
  const noVerificadas = ctx.exp.afirmaciones.filter((a) => a.etiqueta === "DATO_NO_VERIFICADO");
  if (noVerificadas.length) aviso(ctx, `${noVerificadas.length} afirmación(es) redactada(s) sin respaldo en hechos o fuentes (DATO NO VERIFICADO): revisar en ${[...new Set(noVerificadas.map((a) => `${a.entregable === "INFORME_TECNICO" ? "informe" : "pieza"} ${a.seccion}`))].slice(0, 6).join(", ")}.`, "MEDIA");
  const discutibles = ctx.exp.afirmaciones.filter((a) => a.etiqueta === "CONCLUSION_DISCUTIBLE").length;
  ctx.exp.borradores.etiquetas = conteo;
  return completado(`Etiquetas: ${Object.entries(conteo).map(([k, n]) => `${n} ${k}`).join(", ") || "sin afirmaciones"}; ${discutibles} conclusión(es) discutible(s) para la revisión.`);
};

/** Módulo 25 · sesgo y equidad con enfoque diferencial. */
export const m25: ManejadorNodo = async (ctx) => {
  const pieza = ctx.exp.borradores.pieza as PiezaGuardada | undefined;
  const r = await tarea(ctx, {
    tarea: "sesgo", esquema: Sesgo, nombreEsquema: "Sesgo",
    instruccion: "Aplica una lista de verificación con enfoque diferencial al análisis y al borrador: (1) ¿se valoran con el mismo estándar las pruebas y argumentos de ambas partes? (2) ¿hay lenguaje estereotipado por género, edad, discapacidad, etnia, origen, orientación, condición socioeconómica o migratoria? (3) ¿se consideraron los sujetos de especial protección y sus garantías? (4) ¿alguna inferencia descansa en generalizaciones sobre grupos? (5) ¿el relato del cliente se trata como hecho sin soporte? (6) ¿se omitió alguna vía favorable a la parte más débil? Responde cada pregunta con precisión y registra observaciones concretas con su ubicación. Esta revisión gestiona el riesgo de sesgo; no certifica su ausencia.",
    contexto: bloques(vistaPartes(ctx.exp), vistaHechos(ctx.exp), vistaAnalisis(ctx.exp), ...(pieza ? [{ titulo: "BORRADOR DE LA PIEZA", texto: JSON.stringify(pieza.redactada).slice(0, 60_000) }] : [])),
  });
  ctx.exp.analisis.sesgo = { checklist: r.checklist, observaciones: r.observaciones };
  return completado(`Lista de sesgo y equidad aplicada: ${r.observaciones.length} observación(es).`);
};

const FACULTADES: Record<string, string[]> = { SOLICITUD_CONCILIACION: ["conciliar"], DEMANDA_EJECUTIVA: [], EXCEPCIONES_EJECUCION: [], CONTESTACION_DEMANDA: [], RECURSO_APELACION: [], DEMANDA_VERBAL: [] };

/** Módulo 24 · control del ejercicio profesional: postulación, poder y facultades, correo del Registro Nacional de Abogados, conflicto y viabilidad. */
export const m24: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const e = ctx.exp.estrategia;
  if (!e) return completado("Sin actuación que habilitar.");
  const perfil = ctx.s.abogados ? await ctx.s.abogados.perfil(ctx.exp.propietarioId) : null;
  const declaracion = ctx.instrucciones("DECLARAR_HABILITACION")[0];
  const d = (declaracion?.datos ?? ctx.exp.borradores.declaracionHabilitacion ?? {}) as { representaATercero?: boolean; conflictos?: Array<{ expedienteId: string; detalle: string }>; poder?: { existe: boolean; facultadesExpresas: string[]; correoApoderado: string | null; porMensajeDeDatos: boolean | null } | null };
  if (declaracion) ctx.exp.borradores.declaracionHabilitacion = d, ctx.consumir(declaracion);
  let poder = d.poder ?? null;
  const piezaPoder = ctx.exp.piezas.find((p) => p.tipologia === "PODER" && p.estado === "ORGANIZADO");
  if (!poder && piezaPoder) {
    const texto = ctx.exp.lecturas.filter((l) => l.archivoId === piezaPoder.archivoId && l.pagina >= piezaPoder.paginaInicio && l.pagina <= piezaPoder.paginaFin).map((l) => l.transcripcion).join("\n").slice(0, 30_000);
    const leido = await tarea(ctx, { tarea: "habilitacion", esquema: PoderLeido, nombreEsquema: "PoderLeido", instruccion: "Lee el poder aportado y extrae: si existe un poder conferido, poderdante, apoderado, facultades conferidas de forma expresa (recibir, transigir, conciliar, desistir, sustituir, reasumir, allanarse, etc.), el correo del apoderado indicado y si se otorgó por mensaje de datos (Ley 2213 de 2022, art. 5). No infieras facultades que no estén escritas.", contexto: [{ titulo: "PODER", texto }] });
    poder = leido.existe ? { existe: true, facultadesExpresas: leido.facultadesExpresas, correoApoderado: leido.correoApoderado, porMensajeDeDatos: leido.porMensajeDeDatos } : null;
  }
  const r = evaluarHabilitacion({
    tipoPieza: e.piezaSiguiente.tipo, representaATercero: d.representaATercero ?? true,
    abogado: { nombre: perfil?.nombre ?? null, tarjetaProfesional: perfil?.tarjetaProfesional ?? null, correoRegistroNacional: perfil?.correoRegistroNacional ?? null },
    poder, facultadesRequeridas: FACULTADES[e.piezaSiguiente.tipo] ?? [], conflictos: d.conflictos ?? [],
    terminoVencidoAparente: ctx.exp.terminos.some((t) => t.estado === "VENCIDO_APARENTE" && (t.tipo === "PRESCRIPCION" || t.tipo === "CADUCIDAD")),
    tutelaPreviaMismosHechos: Boolean(ctx.exp.borradores.tutelaPreviaMismosHechos), cuantiaCategoria: ctx.exp.analisis.competencia?.cuantia?.categoria ?? null,
  });
  ctx.exp.analisis.habilitacion = r;
  for (const h of r.hallazgos) aviso(ctx, `${h.descripcion} ${h.accion}`, h.tipo === "IMPEDIMENTO" ? "BLOQUEANTE" : h.tipo === "SUBSANABLE" ? "ALTA" : "MEDIA");
  return completado(`${r.habilitada ? "Actuación habilitada" : "Actuación con impedimento"}; ${r.hallazgos.length} hallazgo(s) (${r.hallazgos.filter((h) => h.tipo === "SUBSANABLE").length} subsanable(s)).`);
};

/** Compuerta · ¿actuación habilitada y procedente? Con impedimento sale como dictamen: la remisión es una salida legítima. */
export const g_habilitacion: ManejadorNodo = async (ctx) => {
  const h = ctx.exp.analisis.habilitacion;
  if (!h) return decision("si", "Sin actuación que requiera habilitación.");
  const impedimentos = h.hallazgos.filter((x) => x.tipo === "IMPEDIMENTO");
  if (impedimentos.length) return decision("no", `Impedimento para actuar: ${impedimentos.map((x) => x.descripcion).join(" ")}`);
  return decision("si", h.requiereAccionDelAbogado ? `Habilitada, con ${h.hallazgos.filter((x) => x.tipo === "SUBSANABLE").length} requisito(s) subsanable(s) que el ABOGADO (USUARIO) debe atender.` : "Habilitada y procedente.");
};

/** Condiciones para aprobar: sin citas bloqueadas, riesgos severos asumidos, subsanables atendidos y perfil de firma completo. */
async function bloqueosDeAprobacion(ctx: ContextoNodo, datos: { asumirRiesgos?: boolean; subsanablesAtendidos?: boolean }): Promise<string[]> {
  const b: string[] = [];
  const bloqueadas = ctx.exp.citas.filter((c) => c.estado === "BLOQUEADA");
  if (bloqueadas.length) b.push(`Hay ${bloqueadas.length} cita(s) bloqueada(s): ${bloqueadas.map((c) => c.texto).join("; ")}.`);
  const graves = (ctx.exp.estrategia?.contradictor ?? []).filter((a) => a.severidad === "ALTA" && a.resiste !== "SI" && !a.replica && !a.riesgoAsumido);
  if (graves.length && !datos.asumirRiesgos) b.push(`${graves.length} ataque(s) severo(s) de la contraparte sin réplica: asuma expresamente el riesgo (asumirRiesgos) o devuelva el borrador.`);
  const subsanables = ctx.exp.analisis.habilitacion?.hallazgos.filter((h) => h.tipo === "SUBSANABLE") ?? [];
  if (subsanables.length && !datos.subsanablesAtendidos) b.push(`Requisitos subsanables pendientes: ${subsanables.map((h) => h.descripcion).join(" ")} Confirme que están atendidos (subsanablesAtendidos).`);
  if (ctx.exp.estrategia?.piezaSiguiente.requiereAbogado) {
    const p = ctx.s.abogados ? await ctx.s.abogados.perfil(ctx.exp.propietarioId) : null;
    const faltan = [!p?.nombre && "nombre", !p?.identificacion && "identificación", !p?.tarjetaProfesional && "tarjeta profesional"].filter(Boolean);
    if (faltan.length) b.push(`Complete su perfil profesional para la firma de la versión radicable: falta ${faltan.join(", ")}.`);
  }
  return b;
}

/** Compuerta humana · ¿el ABOGADO (USUARIO) aprueba? Ningún módulo puede tomar esta decisión. */
export const g_revision: ManejadorNodo = async (ctx) => {
  const decisionAbogado = ctx.instrucciones(["APROBAR", "DEVOLVER"]).at(-1);
  for (const i of ctx.instrucciones("ASUMIR_RIESGO")) {
    for (const a of ctx.exp.estrategia?.contradictor ?? []) a.riesgoAsumido = true;
    ctx.consumir(i);
  }
  if (decisionAbogado?.accion === "DEVOLVER") {
    for (const i of ctx.instrucciones(["APROBAR", "DEVOLVER"])) ctx.consumir(i);
    const obs = ((decisionAbogado.datos as { observaciones?: Array<{ texto: string; seccion?: string | null }> } | undefined)?.observaciones ?? []).filter((o) => o.texto?.trim());
    ctx.exp.borradores.observaciones = obs.length ? obs : [{ texto: decisionAbogado.motivo || "Devuelto sin observaciones detalladas.", seccion: null }];
    return decision("no", `Devuelto por el ABOGADO (USUARIO) con ${obs.length || 1} observación(es): se re-elabora completo.`, { actor: decisionAbogado.usuarioId });
  }
  if (decisionAbogado?.accion === "APROBAR") {
    for (const i of ctx.instrucciones(["APROBAR", "DEVOLVER"])) ctx.consumir(i);
    const bloqueos = await bloqueosDeAprobacion(ctx, (decisionAbogado.datos ?? {}) as { asumirRiesgos?: boolean; subsanablesAtendidos?: boolean });
    if (!bloqueos.length) {
      if ((decisionAbogado.datos as { asumirRiesgos?: boolean } | undefined)?.asumirRiesgos) for (const a of ctx.exp.estrategia?.contradictor ?? []) if (!a.replica) a.riesgoAsumido = true;
      return decision("si", `Aprobado y firmado por el ABOGADO (USUARIO)${decisionAbogado.motivo ? `: ${decisionAbogado.motivo}` : "."}`, { actor: decisionAbogado.usuarioId });
    }
    return pausa(`La aprobación no puede registrarse todavía: ${bloqueos.join(" ")}`, ["APROBAR", "DEVOLVER", "ASUMIR_RIESGO", "CONFIGURAR"], { bloqueos });
  }
  // Primera llegada de esta iteración: versión para revisión con la gobernanza incorporada.
  const iteracion = ctx.exp.ejecucion.iteraciones.ciclo ?? 0;
  if (ctx.exp.borradores.revisionPreparada !== iteracion) {
    await renderizarInforme(ctx, "BORRADOR");
    ctx.exp.borradores.revisionPreparada = iteracion;
  }
  const bloqueos = await bloqueosDeAprobacion(ctx, {});
  const entregables = ["INFORME_TECNICO", "PIEZA_PROCESAL", "PAQUETE_ANEXOS", "INDICE_ELECTRONICO"].map((t) => ultimoEntregable(ctx.exp, t as never)).filter(Boolean).map((e) => ({ id: e!.id, tipo: e!.tipo, version: e!.version, nombre: e!.nombreArchivo }));
  return pausa("Revise el informe técnico y el borrador de la pieza. Apruebe para generar la versión radicable o devuelva con observaciones (se re-elabora completo).", ["APROBAR", "DEVOLVER", "ASUMIR_RIESGO"], { entregables, bloqueos, avisos: ctx.exp.analisis.avisos.filter((a) => a.gravedad === "BLOQUEANTE" || a.gravedad === "ALTA").map((a) => a.texto) });
};

/* ─────────────── Módulo 27 · retroalimentación y memoria disociada ─────────────── */

/** Disociación determinista previa y posterior a la IA: nombres, identificaciones, correos, teléfonos y direcciones. */
export function disociar(texto: string, exp: Expediente): string {
  let t = texto;
  for (const p of exp.partes) {
    if (p.nombre.trim().length > 3) t = t.replace(new RegExp(p.nombre.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), `[${p.calidad.toUpperCase()}]`);
    if (p.identificacion) t = t.replace(new RegExp(p.identificacion.replace(/\D/g, "").split("").join("[.\\s-]?"), "g"), "[IDENTIFICACIÓN]");
  }
  return t.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[CORREO]").replace(/(?<!\d)(?:\+?57[\s-]?)?3\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g, "[TELÉFONO]")
    .replace(/\b\d{1,3}(?:\.\d{3}){2,3}\b/g, "[NÚMERO]").replace(/\b(calle|carrera|cra\.?|cl\.?|avenida|av\.?|diagonal|transversal)\s+\d+[^,;.]{0,30}/gi, "[DIRECCIÓN]");
}

export const m27: ManejadorNodo = async (ctx) => {
  const observaciones = (ctx.exp.borradores.observaciones as Array<{ texto: string; seccion: string | null }> | undefined) ?? [];
  const usuarioId = ctx.exp.decisiones.filter((d) => d.compuerta === "g_revision").at(-1)?.actor ?? ctx.exp.propietarioId;
  const r = await tarea(ctx, {
    tarea: "retroalimentacion", esquema: Retroalimentacion, nombreEsquema: "Retroalimentacion",
    instruccion: "Clasifica cada observación del ABOGADO (USUARIO) sobre el informe y la pieza: tipo, si es ERROR o ESTILO, si es generalizable a casos futuros, la sección afectada y la lección reutilizable expresada como regla (sin datos del caso).",
    contexto: [vistaCaso(ctx.exp), { titulo: "OBSERVACIONES", texto: JSON.stringify(observaciones) }],
  });
  const nuevas: Correccion[] = r.correcciones.map((c) => ({ id: nuevoId("cor"), usuarioId, fecha: ctx.ahora(), tipo: c.tipo, clase: c.clase, generalizable: c.generalizable, descripcion: c.descripcion, seccionAfectada: c.seccionAfectada, leccion: c.leccion, promovidaAMemoria: false }));
  ctx.exp.correcciones.push(...nuevas);
  ctx.exp.lecciones.push(...nuevas.map((c) => c.leccion ?? c.descripcion));
  const generalizables = nuevas.filter((c) => c.generalizable && c.leccion);
  if (generalizables.length && ctx.s.memoria) {
    const d = await tarea(ctx, {
      tarea: "anonimizacion", esquema: LeccionesDisociadas, nombreEsquema: "LeccionesDisociadas",
      instruccion: "Convierte cada lección en una regla reutilizable completamente disociada: sin nombres, identificaciones, lugares, fechas, montos ni ningún dato que permita identificar a personas o al caso. Si una lección no puede disociarse sin perder su sentido, omítela.",
      contexto: [{ titulo: "LECCIONES", texto: generalizables.map((c) => disociar(c.leccion!, ctx.exp)).join("\n") }],
    });
    for (const l of d.lecciones) await ctx.s.memoria.guardar({ tipo: l.tipo, area: l.area, clave: l.clave, contenido: { leccion: disociar(l.leccion, ctx.exp) }, expedienteOrigen: ctx.exp.id });
    for (const c of generalizables) c.promovidaAMemoria = true;
  }
  delete ctx.exp.borradores.observaciones;
  return completado(`${nuevas.length} corrección(es) clasificada(s); ${generalizables.length} lección(es) generalizable(s). Se re-elabora completo desde el fundamento.`);
};
