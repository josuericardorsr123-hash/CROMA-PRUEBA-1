/* Módulos 9, 12 y 14 · reglas procesales verificables: requisitos de
 * procedibilidad, catálogo taxativo de nulidades y trampas del sistema. */

const SENADO = "http://www.secretariasenado.gov.co/senado/basedoc";

export type EstadoRequisito = "EXIGIBLE" | "NO_EXIGIBLE" | "FACULTATIVO" | "INCIERTO";

export interface ContextoProcedibilidad {
  area: string;
  via: string; // DEMANDA_VERBAL, DEMANDA_EJECUTIVA, NULIDAD_RESTABLECIMIENTO, REPARACION_DIRECTA, ACCION_POPULAR, ACCION_CUMPLIMIENTO, TUTELA, ...
  asuntoConciliable: boolean | null;
  pideMedidasCautelares: boolean;
  demandadoEntidadPublica: boolean;
  asuntoLaboralOPensional?: boolean;
  querellable?: boolean;
}

export interface RequisitoEvaluado {
  id: string;
  requisito: string;
  estado: EstadoRequisito;
  razon: string;
  norma: string;
  url: string | null;
  verificacion: string;
  consecuenciaOmision: string;
}

export function evaluarProcedibilidad(c: ContextoProcedibilidad): RequisitoEvaluado[] {
  const r: RequisitoEvaluado[] = [];
  const civil = ["CIVIL", "COMERCIAL", "FAMILIA", "AGRARIO", "CONSUMIDOR"].includes(c.area);
  if (civil && c.via.startsWith("DEMANDA") && c.via !== "DEMANDA_EJECUTIVA") {
    const estado: EstadoRequisito = c.pideMedidasCautelares ? "NO_EXIGIBLE" : c.asuntoConciliable === false ? "NO_EXIGIBLE" : c.asuntoConciliable === null ? "INCIERTO" : "EXIGIBLE";
    r.push({
      id: "conciliacion_civil", requisito: "Conciliación extrajudicial en derecho como requisito de procedibilidad",
      estado, razon: c.pideMedidasCautelares ? "Se solicitan medidas cautelares: se puede acudir directamente al juez (art. 590, parágrafo 1, CGP)." : c.asuntoConciliable === false ? "El asunto no es conciliable." : c.asuntoConciliable === null ? "Determinar si el asunto es conciliable." : "Asunto conciliable sin medidas cautelares.",
      norma: "Ley 2220 de 2022 (Estatuto de Conciliación; derogó la Ley 640 de 2001) y art. 590, par. 1, CGP", url: `${SENADO}/ley_2220_2022.html`,
      verificacion: "CONTRASTADA (Ley 2220 de 2022 vigente desde el 30 de diciembre de 2022); PENDIENTE confirmar artículos exactos y excepciones",
      consecuenciaOmision: "Inadmisión de la demanda (art. 90 CGP) con término de cinco días para subsanar.",
    });
  }
  if (c.area === "LABORAL" || c.area === "SEGURIDAD_SOCIAL") {
    r.push({
      id: "conciliacion_laboral", requisito: "Conciliación extrajudicial previa en asuntos laborales",
      estado: "NO_EXIGIBLE", razon: "No es requisito de procedibilidad en materia laboral; es facultativa.",
      norma: "Jurisprudencia constitucional (C-893 de 2001) y CPACA art. 161 num. 1 (facultativa en asuntos laborales y pensionales)", url: "https://www.corteconstitucional.gov.co/relatoria/2001/C-893-01.htm",
      verificacion: "PENDIENTE de verificación en fuente oficial", consecuenciaOmision: "Ninguna.",
    });
    if (c.demandadoEntidadPublica) r.push({
      id: "reclamacion_administrativa_laboral", requisito: "Reclamación administrativa previa ante la entidad pública empleadora o de seguridad social",
      estado: "EXIGIBLE", razon: "La demanda se dirige contra una entidad pública.", norma: "Código Procesal del Trabajo y de la Seguridad Social, art. 6", url: `${SENADO}/codigo_procedimental_laboral.html`,
      verificacion: "PENDIENTE de verificación en fuente oficial", consecuenciaOmision: "Falta de competencia del juez laboral hasta agotar la reclamación.",
    });
  }
  if (c.area === "ADMINISTRATIVO" && ["NULIDAD_RESTABLECIMIENTO", "REPARACION_DIRECTA", "CONTROVERSIAS_CONTRACTUALES"].includes(c.via)) {
    const facultativa = c.asuntoLaboralOPensional || c.pideMedidasCautelares;
    r.push({
      id: "conciliacion_contencioso", requisito: "Conciliación extrajudicial ante el Ministerio Público",
      estado: c.asuntoConciliable === false ? "NO_EXIGIBLE" : facultativa ? "FACULTATIVO" : "EXIGIBLE",
      razon: facultativa ? "Asunto laboral o pensional, o se piden medidas cautelares de carácter patrimonial: el requisito es facultativo." : "Medio de control con pretensiones conciliables.",
      norma: "Ley 1437 de 2011 (CPACA), art. 161, num. 1, modificado por la Ley 2080 de 2021; Ley 2220 de 2022", url: `${SENADO}/ley_1437_2011.html`,
      verificacion: "PENDIENTE de verificación en fuente oficial", consecuenciaOmision: "Inadmisión y, de no subsanarse, rechazo de la demanda.",
    });
  }
  if (c.area === "ADMINISTRATIVO" && c.via === "NULIDAD_RESTABLECIMIENTO") r.push({
    id: "recursos_obligatorios", requisito: "Haber ejercido y decidido los recursos obligatorios contra el acto particular (apelación)",
    estado: "EXIGIBLE", razon: "Se pretende la nulidad de un acto administrativo particular.",
    norma: "Ley 1437 de 2011 (CPACA), art. 161, num. 2", url: `${SENADO}/ley_1437_2011.html`, verificacion: "PENDIENTE de verificación en fuente oficial",
    consecuenciaOmision: "Ineptitud de la demanda. No es exigible si la autoridad no dio oportunidad de interponerlos.",
  });
  if (c.via === "ACCION_POPULAR") r.push({
    id: "requerimiento_popular", requisito: "Solicitud previa a la autoridad o particular para que adopte medidas de protección del derecho colectivo",
    estado: "EXIGIBLE", razon: "Salvo inminente peligro de perjuicio irremediable.", norma: "Ley 1437 de 2011 (CPACA), art. 144, inc. 3", url: `${SENADO}/ley_1437_2011.html`,
    verificacion: "PENDIENTE de verificación en fuente oficial", consecuenciaOmision: "Rechazo de la demanda por falta de requisito de procedibilidad.",
  });
  if (c.via === "ACCION_CUMPLIMIENTO") r.push({
    id: "renuencia", requisito: "Constitución en renuencia: reclamación previa y ratificación en el incumplimiento o silencio de diez días",
    estado: "EXIGIBLE", razon: "Requisito legal de la acción de cumplimiento.", norma: "Ley 393 de 1997, art. 8", url: `${SENADO}/ley_0393_1997.html`,
    verificacion: "CONTRASTADA (Ley 393 de 1997)", consecuenciaOmision: "Rechazo de plano de la demanda.",
  });
  if (c.area === "SERVICIOS_PUBLICOS") r.push({
    id: "recursos_spd", requisito: "Reclamación y recursos ante la empresa prestadora (reposición y subsidiario de apelación ante la Superservicios)",
    estado: "EXIGIBLE", razon: "Actos de facturación, suspensión, corte o negativa del contrato.", norma: "Ley 142 de 1994, arts. 154 a 159", url: `${SENADO}/ley_0142_1994.html`,
    verificacion: "VERIFICADA 2026-09-22", consecuenciaOmision: "Pérdida de la vía de reclamación y firmeza de la decisión de la empresa.",
  });
  if (c.area === "CONSUMIDOR") r.push({
    id: "reclamacion_directa_consumidor", requisito: "Reclamación directa previa al productor o proveedor",
    estado: "EXIGIBLE", razon: "Requisito para la acción de protección al consumidor.", norma: "Ley 1480 de 2011, art. 58, num. 5", url: `${SENADO}/ley_1480_2011.html`,
    verificacion: "PENDIENTE de verificación en fuente oficial", consecuenciaOmision: "Inadmisión de la demanda.",
  });
  if (c.area === "PENAL" && c.querellable) r.push({
    id: "conciliacion_preprocesal", requisito: "Conciliación preprocesal en delitos querellables",
    estado: "EXIGIBLE", razon: "Delito querellable.", norma: "Ley 906 de 2004, art. 522", url: `${SENADO}/ley_0906_2004.html`,
    verificacion: "PENDIENTE de verificación en fuente oficial", consecuenciaOmision: "No puede iniciarse la acción penal sin agotar la conciliación.",
  });
  return r;
}

/* ─────────────── Módulo 9 · nulidades procesales (catálogo taxativo) ─────────────── */

export interface CausalNulidad {
  numeral: number;
  causal: string;
  pregunta: string;
  saneable: boolean;
  nota: string | null;
}

/** Art. 133 CGP: "El proceso es nulo, en todo o en parte, solamente en los siguientes casos". */
export const CAUSALES_NULIDAD: CausalNulidad[] = [
  { numeral: 1, causal: "Actuar después de declarar la falta de jurisdicción o de competencia", pregunta: "¿El juez siguió actuando después de declarar su falta de jurisdicción o de competencia?", saneable: true, nota: "La declaración de incompetencia por sí sola no invalida lo actuado: la nulidad es actuar después (art. 16 CGP)." },
  { numeral: 2, causal: "Proceder contra providencia ejecutoriada del superior, revivir un proceso legalmente concluido o pretermitir íntegramente la instancia", pregunta: "¿Se desconoció una providencia ejecutoriada del superior, se revivió un proceso concluido o se omitió toda la instancia?", saneable: false, nota: "Insaneable (art. 136, parágrafo, CGP)." },
  { numeral: 3, causal: "Adelantar el proceso después de ocurrida cualquiera de las causales de interrupción o de suspensión, o reanudarlo antes de la oportunidad debida", pregunta: "¿Se actuó durante una interrupción o suspensión del proceso?", saneable: true, nota: null },
  { numeral: 4, causal: "Indebida representación de alguna de las partes, o actuación del apoderado judicial sin poder", pregunta: "¿Alguna parte fue mal representada o su apoderado actuó sin poder suficiente?", saneable: true, nota: "Solo la alega la persona afectada (art. 135 CGP)." },
  { numeral: 5, causal: "Omitir las oportunidades para solicitar, decretar o practicar pruebas, o la práctica de una prueba obligatoria", pregunta: "¿Se omitió una oportunidad probatoria o una prueba que la ley ordena practicar?", saneable: true, nota: null },
  { numeral: 6, causal: "Omitir la oportunidad para alegar de conclusión o para sustentar un recurso o descorrer su traslado", pregunta: "¿Se privó a una parte de alegar de conclusión o de sustentar o replicar un recurso?", saneable: true, nota: null },
  { numeral: 7, causal: "Proferir sentencia por juez distinto del que escuchó los alegatos de conclusión o la sustentación del recurso", pregunta: "¿La sentencia la dictó un juez distinto del que escuchó los alegatos?", saneable: true, nota: null },
  { numeral: 8, causal: "No practicar en legal forma la notificación del auto admisorio o del mandamiento de pago, o el emplazamiento, o no citar a quienes deben ser citados", pregunta: "¿La notificación del auto admisorio o del mandamiento, o el emplazamiento, se hizo en legal forma y se citó a todos los que debían serlo?", saneable: true, nota: "Es la causal más frecuente en la práctica; verificar cada acto de notificación contra la Ley 2213 de 2022 y los arts. 291 a 293 CGP." },
];

export const NORMA_NULIDADES = { norma: "Ley 1564 de 2012 (CGP), arts. 133 a 138", url: "https://procesal.uexternado.edu.co/codigo-general/articulo-133-causales-de-nulidad/", verificacion: "CONTRASTADA (texto del art. 133 CGP transcrito de fuente académica oficial)" };

export interface RespuestaNulidad {
  numeral: number;
  indicio: "SI" | "NO" | "INCIERTO";
  soporte: string | null;
  observacion: string | null;
  saneada: boolean | null;
}

export interface NulidadEvaluada extends CausalNulidad {
  indicio: "SI" | "NO" | "INCIERTO";
  soporte: string | null;
  observacion: string | null;
  estado: "SIN_INDICIO" | "INDICIO_CON_SOPORTE" | "INDICIO_SIN_SOPORTE" | "SANEADA" | "INCIERTO";
  oportunidad: string;
}

/**
 * Consolida las respuestas del análisis sobre el catálogo cerrado. Una causal
 * marcada sin soporte documental no se reporta como nulidad sino como indicio
 * a verificar; lo que no encaja en el catálogo es irregularidad, no nulidad.
 */
export function consolidarNulidades(respuestas: RespuestaNulidad[]): NulidadEvaluada[] {
  return CAUSALES_NULIDAD.map((c) => {
    const r = respuestas.find((x) => x.numeral === c.numeral) ?? { numeral: c.numeral, indicio: "INCIERTO" as const, soporte: null, observacion: "Sin respuesta del análisis.", saneada: null };
    const estado: NulidadEvaluada["estado"] = r.indicio === "NO" ? "SIN_INDICIO" : r.indicio === "INCIERTO" ? "INCIERTO" : r.saneada && c.saneable ? "SANEADA" : r.soporte ? "INDICIO_CON_SOPORTE" : "INDICIO_SIN_SOPORTE";
    return {
      ...c, indicio: r.indicio, soporte: r.soporte, observacion: r.observacion, estado,
      oportunidad: "Puede alegarse en cualquiera de las instancias antes de la sentencia o durante la actuación posterior a esta si ocurrió en ella; la indebida representación o notificación, también en la ejecución de la sentencia o mediante recurso de revisión (art. 134 CGP; verificar).",
    };
  });
}

/* ─────────────── Módulo 14 · desistimiento tácito ─────────────── */

export interface EntradaDesistimiento {
  ultimaActuacion: string | null; // AAAA-MM-DD
  tieneSentenciaOSeguirAdelante: boolean;
  cargaPendiente: { fechaNotificacionAuto: string; descripcion: string } | null;
}

export function catalogoDesistimiento(e: EntradaDesistimiento): Array<{ terminoId: string; fechaEvento: string; descripcion: string }> {
  const salida: Array<{ terminoId: string; fechaEvento: string; descripcion: string }> = [];
  if (e.ultimaActuacion) salida.push({
    terminoId: e.tieneSentenciaOSeguirAdelante ? "cgp_desistimiento_tacito_inactividad_sentencia" : "cgp_desistimiento_tacito_inactividad",
    fechaEvento: e.ultimaActuacion,
    descripcion: "Reloj de inactividad en secretaría: cualquier actuación de parte o del despacho interrumpe el término.",
  });
  if (e.cargaPendiente) salida.push({ terminoId: "cgp_desistimiento_tacito_carga", fechaEvento: e.cargaPendiente.fechaNotificacionAuto, descripcion: `Carga ordenada: ${e.cargaPendiente.descripcion}` });
  return salida;
}
