import { type BloqueSubsuncion, type FilaProbatoria, type Hallazgo, nuevoId, type Termino } from "@em/dominio";
import {
  CATALOGO_TERMINOS, calcularTermino, CAUSALES_NULIDAD, catalogoDesistimiento, consolidarNulidades, determinarCompetencia, type EntradaTermino, evaluarProcedibilidad, evaluarTutela,
  type ResultadoCalculo,
} from "@em/motores";
import type { ContextoNodo, ManejadorNodo } from "../contexto";
import { HechosCompetenciaIA, MatrizProbatoria, Nulidades, Subsuncion, Tamizaje, TerminosAplicables, Trampas } from "../esquemas";
import { tarea } from "../ia";
import { bloques, vistaCaso, vistaCorrecciones, vistaDocumentos, vistaEstadoProcesal, vistaFuentes, vistaHechos, vistaLecturas, vistaPartes, vistaProblemas, vistaTerminos } from "../vistas";
import { aviso, completado, decision, reiniciarAvisos } from "./comun";

/* e4 · Análisis de Hecho y de Derecho (Fase 5 y Capa B). Los motores
 * deterministas calculan; la IA solo extrae los insumos del expediente y cada
 * insumo conserva su soporte. */

/** Fase 5 · subsunción: cada conclusión conecta hechos soportados con fuentes verificadas. */
export const f5: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const r = await tarea(ctx, {
    tarea: "analisis", esquema: Subsuncion, nombreEsquema: "Subsuncion",
    instruccion: "Para cada problema jurídico construye el silogismo de subsunción: la regla (con los identificadores de FUENTES VERIFICADAS que la sustentan), la premisa fáctica (con los identificadores de HECHOS), la conclusión y su etiqueta de confianza. Señala el eslabón más débil de cada cadena y distingue las figuras parecidas que no son intercambiables. Si una regla no tiene fuente verificada, la conclusión se etiqueta DATO_NO_VERIFICADO y se explica. Registra las zonas grises: cuestiones debatibles donde el criterio del ABOGADO (USUARIO) agrega más valor.",
    contexto: bloques(vistaCaso(ctx.exp), vistaHechos(ctx.exp), vistaProblemas(ctx.exp), vistaFuentes(ctx.exp, { conTexto: true, maxPorFuente: 2500 }), vistaCorrecciones(ctx.exp)),
  });
  const fuentes = new Set(ctx.exp.fuentes.filter((f) => f.resolucion !== "NO_RESUELTA").map((f) => f.id));
  const hechos = new Set(ctx.exp.hechos.map((h) => h.id));
  const problemas = new Set(ctx.exp.problemas.map((p) => p.id));
  let depurados = 0;
  const bloquesS: BloqueSubsuncion[] = r.bloques.filter((b) => problemas.has(b.problemaId)).map((b) => {
    const fuenteIds = b.fuenteIds.filter((f) => fuentes.has(f));
    const hechoIds = b.hechoIds.filter((h) => hechos.has(h));
    if (fuenteIds.length !== b.fuenteIds.length || hechoIds.length !== b.hechoIds.length) depurados++;
    const etiqueta = fuenteIds.length ? b.etiqueta : "DATO_NO_VERIFICADO";
    return { ...b, fuenteIds, hechoIds, etiqueta };
  });
  if (depurados) aviso(ctx, `${depurados} bloque(s) de subsunción citaban fuentes o hechos inexistentes: se depuraron (nunca se invoca una fuente no verificada).`, "MEDIA");
  ctx.exp.analisis.subsuncion = bloquesS;
  ctx.exp.analisis.zonasGrises = r.zonasGrises;
  return completado(`${bloquesS.length} bloque(s) de subsunción; ${r.zonasGrises.length} zona(s) gris(es).`);
};

/* ─────────────────────── M08 · prescripción y caducidad ─────────────────────── */

const areasDelCaso = (ctx: ContextoNodo) => [ctx.exp.analisis.area, ...ctx.exp.analisis.areasConcurrentes].filter((x): x is NonNullable<typeof x> => Boolean(x));

function terminoDe(ctx: ContextoNodo, r: ResultadoCalculo, e: EntradaTermino, soporte: string, modulo: string, advertencias: string[] = []): Termino | null {
  if (!r.vencimiento || e.unidad === "SIN_TERMINO") return null;
  const tipo: Termino["tipo"] = ["PRESCRIPCION", "CADUCIDAD", "PROCESAL", "DESISTIMIENTO_TACITO", "RESPUESTA_AUTORIDAD", "NOTIFICACION", "INMEDIATEZ"].includes(e.tipo) ? e.tipo : "OTRO";
  return {
    id: nuevoId("ter"), tipo, descripcion: r.nombre, norma: r.norma, catalogoId: r.terminoId, verificacionNorma: r.verificacionNorma, fechaInicio: r.fechaEvento, fechaInicioSoporte: soporte,
    unidad: e.unidad, cantidad: r.cantidad, vencimiento: r.vencimiento, vencimientoMasTemprano: r.vencimientoMasTemprano, diasHabilesRestantes: r.diasHabilesRestantes ?? 0,
    estado: r.estado, esEstimacion: r.esEstimacion, margen: r.margen, accionQueInterrumpe: e.interrupcion ?? (e.tipo === "PRESCRIPCION" ? "Presentación de la demanda notificada en término (art. 94 CGP)." : null),
    alertas: r.alertas, modulo, calculadoEn: ctx.ahora(), advertencias: [...r.advertencias, ...advertencias, ...r.explicacion.map((x) => `Cómputo: ${x}`)],
  };
}

export const m08: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const areas = new Set(areasDelCaso(ctx));
  const catalogo = CATALOGO_TERMINOS.filter((e) => e.areas.some((a) => areas.has(a as never)) && e.tipo !== "DESISTIMIENTO_TACITO");
  if (!catalogo.length) {
    ctx.exp.terminos = ctx.exp.terminos.filter((t) => t.modulo !== "m08");
    aviso(ctx, `El catálogo no tiene términos para el área ${[...areas].join(", ") || "sin determinar"}: el cómputo requiere verificación manual.`, "ALTA");
    return completado("Sin términos del catálogo aplicables al área.");
  }
  const r = await tarea(ctx, {
    tarea: "terminos", esquema: TerminosAplicables, nombreEsquema: "TerminosAplicables",
    instruccion: "Del CATÁLOGO DE TÉRMINOS, selecciona los que se aplican al caso (prescripción, caducidad y términos procesales en curso) y, para cada uno, la fecha del hecho que dispara el cómputo según la regla de inicio del catálogo, con el documento y la página de donde sale. Si la fecha no está determinada, da el rango (fechaEvento y fechaEventoHasta) y marca fechaProvisional; si no hay forma de establecerla, fechaEvento null y explica qué dato falta. No calcules vencimientos: los calcula el motor.",
    contexto: bloques(vistaCaso(ctx.exp), vistaHechos(ctx.exp), vistaEstadoProcesal(ctx.exp), { titulo: "CATÁLOGO DE TÉRMINOS", texto: catalogo.map((e) => JSON.stringify({ id: e.id, nombre: e.nombre, tipo: e.tipo, inicio: e.inicio, norma: e.norma })).join("\n") }),
  });
  const confirmadas = new Set(ctx.exp.entidades.filter((e) => e.tipo === "FECHA" && e.verificacion !== "PROVISIONAL").map((e) => e.normalizado));
  const terminos: Termino[] = [];
  for (const t of r.terminos) {
    const e = catalogo.find((x) => x.id === t.catalogoId);
    if (!e) {
      aviso(ctx, `Término «${t.catalogoId}» fuera del catálogo verificado: no se calcula.`, "BAJA");
      continue;
    }
    if (!t.fechaEvento) {
      aviso(ctx, `${e.nombre}: no se pudo determinar la fecha inicial (${t.razon}). Se requiere el dato para calcular el término.`, "ALTA");
      continue;
    }
    const calc = calcularTermino({ termino: e, fechaEvento: t.fechaEvento, fechaEventoHasta: t.fechaEventoHasta, soporteFecha: t.soporte, fechaProvisional: t.fechaProvisional, hoy: ctx.hoy(), calendario: ctx.s.config.calendario, umbrales: ctx.s.config.umbrales });
    const adv = confirmadas.has(t.fechaEvento) ? [] : ["Fecha inicial extraída automáticamente: debe confirmarla el ABOGADO (USUARIO) antes de sustentar una actuación."];
    const termino = terminoDe(ctx, calc, e, t.soporte, "m08", adv);
    if (termino) terminos.push(termino);
  }
  for (const o of r.observaciones) aviso(ctx, o, "INFORMATIVA");
  ctx.exp.terminos = [...ctx.exp.terminos.filter((t) => t.modulo !== "m08"), ...terminos];
  return completado(`${terminos.length} término(s) calculado(s): ${terminos.filter((t) => t.estado !== "CORRIENDO").length} en riesgo o vencido(s) en apariencia.`);
};

/* ───────────────────────── M09 · nulidades procesales ───────────────────────── */

const TIPOLOGIAS_PROCESO = /AUTO|MANDAMIENTO|SENTENCIA|NOTIFICACION|CITATORIO|AVISO|ACTA_DE_AUDIENCIA|DEMANDA/;

export const m09: ManejadorNodo = async (ctx) => {
  const hayProceso = ctx.exp.analisis.estadosProcesales.length > 0 || ctx.exp.piezas.some((p) => TIPOLOGIAS_PROCESO.test(p.tipologia));
  if (!hayProceso) {
    ctx.exp.analisis.nulidades = { aplica: false, hallazgos: [] };
    return completado("No hay actuación judicial en curso: el catálogo de nulidades no se aplica.");
  }
  const r = await tarea(ctx, {
    tarea: "nulidades", esquema: Nulidades, nombreEsquema: "Nulidades",
    instruccion: `Recorre el catálogo TAXATIVO del artículo 133 del CGP causal por causal. Para cada numeral responde si hay indicio (SI, NO, INCIERTO), con el documento y la página que lo soporta, una observación y si la nulidad quedó saneada (art. 136 CGP). Verifica en especial cada acto de notificación contra los arts. 291 a 293 del CGP y la Ley 2213 de 2022. Lo que no encaje en una causal es irregularidad, no nulidad.\n\nCausales:\n${CAUSALES_NULIDAD.map((c) => `${c.numeral}. ${c.causal} — ${c.pregunta}`).join("\n")}`,
    contexto: bloques(vistaCaso(ctx.exp), vistaDocumentos(ctx.exp), vistaEstadoProcesal(ctx.exp), vistaLecturas(ctx.exp, { maxCaracteres: 80_000, soloRelevantes: true })),
  });
  const evaluadas = consolidarNulidades(r.respuestas);
  const hallazgos: Hallazgo[] = evaluadas.filter((n) => n.estado === "INDICIO_CON_SOPORTE" || n.estado === "INDICIO_SIN_SOPORTE").map((n) => ctx.hallazgo({
    modulo: "m09", titulo: `Nulidad art. 133 num. ${n.numeral} CGP: ${n.causal}`, detalle: `${n.estado === "INDICIO_CON_SOPORTE" ? "Indicio con soporte" : "Indicio sin soporte documental (verificar)"}: ${n.observacion ?? ""} ${n.soporte ? `Soporte: ${n.soporte}.` : ""}`.trim(),
    gravedad: n.estado === "INDICIO_CON_SOPORTE" ? "ALTA" : "MEDIA", fundamento: `Ley 1564 de 2012, art. 133, num. ${n.numeral}${n.saneable ? "" : " (insaneable)"}.`, recomendacion: n.oportunidad,
  }));
  ctx.exp.analisis.nulidades = { aplica: r.aplica, hallazgos };
  return completado(`Catálogo de nulidades recorrido (8 causales): ${hallazgos.length} indicio(s).`);
};

/* ─────────────────────── M10 · derechos fundamentales ─────────────────────── */

export const m10: ManejadorNodo = async (ctx) => {
  const r = await tarea(ctx, {
    tarea: "tutela", esquema: Tamizaje, nombreEsquema: "Tamizaje",
    instruccion: "Tamiza los hechos reconstruidos (no la carátula del caso) en busca de derechos fundamentales comprometidos, aunque el cliente no los haya nombrado. Si hay alguno, completa el examen de procedencia de la tutela: legitimación activa y pasiva, meses desde el hecho vulnerador y si la vulneración continúa, existencia y eficacia de otro medio de defensa, perjuicio irremediable (inminente, urgente, grave, impostergable), si se dirige contra providencia judicial y si hubo tutela previa por los mismos hechos. Indica la vía ordinaria que corresponde si la tutela no procede.",
    contexto: bloques(vistaCaso(ctx.exp), vistaPartes(ctx.exp), vistaHechos(ctx.exp), vistaEstadoProcesal(ctx.exp)),
  });
  if (!r.aplica || !r.derechos.length) {
    ctx.exp.analisis.derechosFundamentales = { derechos: [], resultado: "NO_APLICA", examen: [], viaOrdinaria: r.viaOrdinaria };
    return completado("Sin derechos fundamentales comprometidos en los hechos.");
  }
  ctx.exp.borradores.tutelaPreviaMismosHechos = r.tutelaPreviaMismosHechos;
  const sujetoEspecial = ctx.exp.partes.some((p) => p.esCliente && p.proteccionEspecial.length > 0);
  const t = evaluarTutela({
    legitimacionActiva: r.legitimacionActiva, legitimacionPasiva: r.legitimacionPasiva,
    inmediatez: { mesesDesdeElHecho: r.mesesDesdeElHecho, vulneracionContinuada: r.vulneracionContinuada, justificacionDemora: r.justificacionDemora },
    subsidiariedad: { existeOtroMedio: r.existeOtroMedio, medioEsEficaz: r.medioEsEficaz }, perjuicioIrremediable: r.perjuicio,
    contraProvidenciaJudicial: r.contraProvidenciaJudicial, tutelaPreviaMismosHechos: r.tutelaPreviaMismosHechos, sujetoEspecialProteccion: sujetoEspecial,
  });
  ctx.exp.analisis.derechosFundamentales = { derechos: r.derechos, resultado: t.resultado, examen: t.examen, viaOrdinaria: r.viaOrdinaria };
  if (t.resultado === "FUERA_DE_ALCANCE") aviso(ctx, "Tutela contra providencia judicial: queda fuera del alcance automático y se remite al criterio del ABOGADO (USUARIO).", "ALTA");
  return completado(`${r.derechos.length} derecho(s) comprometido(s); tutela: ${t.resultado}.`);
};

/* ─────────────────────── M11 · competencia y jurisdicción ─────────────────────── */

export const m11: ManejadorNodo = async (ctx) => {
  const r = await tarea(ctx, {
    tarea: "competencia", esquema: HechosCompetenciaIA, nombreEsquema: "HechosCompetencia",
    instruccion: `Extrae los hechos que determinan la competencia: naturaleza del asunto, valor de las pretensiones al tiempo de la demanda (suma de capital, intereses causados y demás pretensiones patrimoniales, con el cálculo explicado; null si no se puede estimar), año de referencia (${ctx.hoy().slice(0, 4)} salvo que conste otra fecha de presentación), domicilios y lugares relevantes, entidad pública demandada y si involucra NNA. Registra las irregularidades de competencia que ya se observen en actuaciones del expediente, indicando si el factor es prorrogable.`,
    contexto: bloques(vistaCaso(ctx.exp), vistaPartes(ctx.exp), vistaHechos(ctx.exp), vistaEstadoProcesal(ctx.exp)),
  });
  const c = determinarCompetencia({ area: ctx.exp.analisis.area ?? "OTRO", asunto: r.asunto, valor: r.valor, anio: r.anio, domicilioDemandado: r.domicilioDemandado, lugarCumplimiento: r.lugarCumplimiento, ubicacionInmueble: r.ubicacionInmueble, ultimoDomicilioCausante: r.ultimoDomicilioCausante, domicilioMenor: r.domicilioMenor, lugarPrestacionServicio: r.lugarPrestacionServicio, entidadPublicaDemandada: r.entidadPublicaDemandada, lugarVulneracion: r.lugarVulneracion, involucraNNA: r.involucraNNA }, ctx.s.config.smmlvAjustes);
  ctx.exp.analisis.competencia = {
    cuantia: c.cuantia ? { valor: c.cuantia.valor, smmlv: c.cuantia.smmlv, anio: c.cuantia.anio, categoria: c.cuantia.categoria, calculo: `${r.calculoValor} ${c.cuantia.calculo}`.trim() } : null,
    juez: c.juez, territorio: c.territorio, cadena: [...c.cadena, ...c.advertencias.map((x) => `Advertencia: ${x}`)],
    irregularidades: r.irregularidades.map((i) => ctx.hallazgo({ modulo: "m11", titulo: i.titulo, detalle: `${i.detalle}${i.prorrogable ? " Factor prorrogable: si las partes guardaron silencio, no debe proponerse la falta de competencia (art. 16 CGP)." : " Factor improrrogable."}`, gravedad: i.prorrogable ? "BAJA" : "ALTA", fundamento: "Ley 1564 de 2012, arts. 16 y 20 a 28." })),
  };
  return completado(`Competencia: ${c.juez} · ${c.territorio}${c.cuantia ? ` · cuantía ${c.cuantia.categoria}` : ""}.`);
};

/* ─────────────────────── M13 · matriz de riesgo probatorio ─────────────────────── */

export const m13: ManejadorNodo = async (ctx) => {
  if (!ctx.exp.hechos.length) {
    ctx.exp.analisis.matrizProbatoria = [];
    return completado("Sin hechos que cruzar con medios de prueba.");
  }
  const r = await tarea(ctx, {
    tarea: "prueba", esquema: MatrizProbatoria, nombreEsquema: "MatrizProbatoria",
    instruccion: "Cruza cada hecho con sus medios de prueba disponibles en el expediente: una fila por hecho y medio. Califica pertinencia, conducencia, utilidad y licitud, el riesgo de tacha o desconocimiento (arts. 269 a 272 CGP) y marca 'vacio' cuando el hecho no tiene prueba suficiente, con la gestión probatoria concreta que lo subsanaría (documento a pedir, testimonio, dictamen, inspección, oficio).",
    contexto: bloques(vistaHechos(ctx.exp), vistaDocumentos(ctx.exp)),
  });
  const hechos = new Set(ctx.exp.hechos.map((h) => h.id));
  const filas: FilaProbatoria[] = r.filas.filter((f) => hechos.has(f.hechoId)).map((f) => ({ ...f, soporte: f.soporte && ctx.exp.archivos.some((a) => a.id === f.soporte!.archivoId) ? { ...f.soporte, piezaId: null } : null }));
  for (const h of ctx.exp.hechos) if (!filas.some((f) => f.hechoId === h.id)) filas.push({ hechoId: h.id, medio: null, soporte: null, pertinencia: "N/A", conducencia: "N/A", utilidad: "N/A", licitud: "N/A", riesgoTacha: null, vacio: true, gestionSugerida: "Identificar el medio de prueba del hecho." });
  ctx.exp.analisis.matrizProbatoria = filas;
  return completado(`${filas.length} fila(s) en la matriz probatoria; ${filas.filter((f) => f.vacio).length} vacío(s).`);
};

/* ─────────────────────── M14 · trampas procesales ─────────────────────── */

export const m14: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const r = await tarea(ctx, {
    tarea: "trampas", esquema: Trampas, nombreEsquema: "Trampas",
    instruccion: "Identifica las cargas y riesgos procesales: la vía previsible (DEMANDA_VERBAL, DEMANDA_EJECUTIVA, NULIDAD_RESTABLECIMIENTO, REPARACION_DIRECTA, TUTELA, ACCION_POPULAR, ACCION_CUMPLIMIENTO, DENUNCIA, QUERELLA, RECLAMACION_ADMINISTRATIVA…), si el asunto es conciliable, si se pedirán medidas cautelares, si se demanda a una entidad pública, si es laboral o pensional, si el delito es querellable, si hay sentencia o auto de seguir adelante la ejecución, y cualquier carga ordenada por auto con su fecha de notificación. Lista además otras trampas (plazos para aportar, cauciones, requisitos formales, notificaciones pendientes) con su fundamento.",
    contexto: bloques(vistaCaso(ctx.exp), vistaHechos(ctx.exp), vistaEstadoProcesal(ctx.exp), vistaDocumentos(ctx.exp)),
  });
  const a = ctx.exp.analisis;
  a.procedibilidad = evaluarProcedibilidad({ area: a.area ?? "OTRO", via: r.via, asuntoConciliable: r.asuntoConciliable, pideMedidasCautelares: r.pideMedidasCautelares, demandadoEntidadPublica: r.demandadoEntidadPublica, asuntoLaboralOPensional: r.asuntoLaboralOPensional, querellable: r.querellable });
  const trampas: Hallazgo[] = [
    ...a.procedibilidad.filter((p) => p.estado === "EXIGIBLE" || p.estado === "INCIERTO").map((p) => ctx.hallazgo({ modulo: "m14", titulo: `Requisito de procedibilidad ${p.estado === "EXIGIBLE" ? "exigible" : "por determinar"}: ${p.requisito}`, detalle: `${p.razon} Consecuencia de omitirlo: ${p.consecuenciaOmision}`, gravedad: p.estado === "EXIGIBLE" ? "ALTA" : "MEDIA", fundamento: `${p.norma} [${p.verificacion}]` })),
    ...r.otras.map((o) => ctx.hallazgo({ modulo: "m14", titulo: o.titulo, detalle: o.detalle, gravedad: o.gravedad, fundamento: o.fundamento })),
  ];
  // Desistimiento tácito (art. 317 CGP): reloj con la última actuación OFICIAL.
  const ultima = a.estadosProcesales.map((e) => e.ultimaActuacion?.fecha).filter((f): f is string => Boolean(f)).sort().at(-1) ?? null;
  const hayRadicado = ctx.exp.entidades.some((e) => e.tipo === "RADICADO");
  if (hayRadicado && !ultima) aviso(ctx, "No hay fecha oficial de la última actuación: verifique en la secretaría del despacho antes de afirmar cualquier plazo de desistimiento tácito.", "ALTA");
  const terminos: Termino[] = [];
  for (const d of catalogoDesistimiento({ ultimaActuacion: ultima, tieneSentenciaOSeguirAdelante: r.tieneSentenciaOSeguirAdelante, cargaPendiente: r.cargaPendiente })) {
    const e = CATALOGO_TERMINOS.find((x) => x.id === d.terminoId);
    if (!e) continue;
    const calc = calcularTermino({ termino: e, fechaEvento: d.fechaEvento, soporteFecha: d.terminoId.includes("carga") ? "Auto que ordenó la carga (expediente)" : "Última actuación en la fuente oficial (Módulo 30)", hoy: ctx.hoy(), calendario: ctx.s.config.calendario, umbrales: ctx.s.config.umbrales });
    const t = terminoDe(ctx, calc, e, d.descripcion, "m14");
    if (t) terminos.push(t);
  }
  a.trampas = trampas;
  ctx.exp.terminos = [...ctx.exp.terminos.filter((t) => t.modulo !== "m14"), ...terminos];
  return completado(`${trampas.length} trampa(s) o requisito(s) detectado(s); ${terminos.length} reloj(es) de desistimiento tácito.`);
};

/* ─────────────────────── M18 · calendario de términos ─────────────────────── */

export const m18: ManejadorNodo = async (ctx) => {
  ctx.exp.terminos.sort((x, y) => (x.vencimientoMasTemprano ?? x.vencimiento).localeCompare(y.vencimientoMasTemprano ?? y.vencimiento));
  if (ctx.s.terminos) await ctx.s.terminos.indexar(ctx.exp);
  const riesgo = ctx.exp.terminos.filter((t) => ["RIESGO", "RIESGO_INMINENTE", "VENCIDO_APARENTE"].includes(t.estado));
  const proximo = ctx.exp.terminos[0];
  return completado(`${ctx.exp.terminos.length} término(s) consolidado(s); ${riesgo.length} en riesgo${proximo ? `; el más próximo vence el ${proximo.vencimientoMasTemprano ?? proximo.vencimiento} (${proximo.descripcion})` : ""}.`);
};

/** Compuerta · ¿hay término en riesgo? Con término por vencer se actúa primero; si no, se evalúa antes un acuerdo. */
export const g_riesgo: ManejadorNodo = async (ctx) => {
  const riesgo = ctx.exp.terminos.filter((t) => ["RIESGO", "RIESGO_INMINENTE", "VENCIDO_APARENTE"].includes(t.estado));
  if (riesgo.length) return decision("si", `Término(s) en riesgo: ${riesgo.map((t) => `${t.descripcion} (${t.estado}, vence ${t.vencimientoMasTemprano ?? t.vencimiento})`).join("; ")}. Se actúa de inmediato.`);
  return decision("no", ctx.exp.terminos.length ? "Ningún término en riesgo: se evalúan primero los mecanismos alternativos." : "Sin términos calculados en riesgo: se evalúan primero los mecanismos alternativos.");
};

export { vistaTerminos };
