/* Módulos 5 y 10 · bloque de constitucionalidad y tamizaje de tutela. */

export interface ExamenTutela {
  legitimacionActiva: { cumple: boolean | null; razon: string };
  legitimacionPasiva: { cumple: boolean | null; razon: string };
  inmediatez: { mesesDesdeElHecho: number | null; vulneracionContinuada: boolean; justificacionDemora: string | null };
  subsidiariedad: { existeOtroMedio: boolean | null; medioEsEficaz: boolean | null };
  perjuicioIrremediable: { inminente: boolean; urgente: boolean; grave: boolean; impostergable: boolean };
  contraProvidenciaJudicial: boolean;
  tutelaPreviaMismosHechos: boolean;
  sujetoEspecialProteccion: boolean;
}

export interface ResultadoTutela {
  resultado: "PROCEDENTE" | "PROCEDENTE_TRANSITORIA" | "IMPROCEDENTE" | "FUERA_DE_ALCANCE";
  examen: Array<{ requisito: string; cumple: "SI" | "NO" | "INCIERTO"; razon: string }>;
  advertencias: string[];
}

const SI_NO = (v: boolean | null): "SI" | "NO" | "INCIERTO" => (v === null ? "INCIERTO" : v ? "SI" : "NO");

/**
 * Examen completo de procedencia, incluidos los requisitos que NO se cumplen
 * (RD_13: la improcedencia se informa con la misma diligencia que la procedencia).
 */
export function evaluarTutela(e: ExamenTutela): ResultadoTutela {
  const examen: ResultadoTutela["examen"] = [];
  const advertencias: string[] = [];
  if (e.contraProvidenciaJudicial) {
    return {
      resultado: "FUERA_DE_ALCANCE",
      examen: [{ requisito: "Tutela contra providencia judicial", cumple: "INCIERTO", razon: "Exige requisitos generales y causales específicas reforzadas (C-590 de 2005): análisis reservado al ABOGADO (USUARIO)." }],
      advertencias: ["La tutela contra providencias judiciales queda fuera del alcance del examen automático."],
    };
  }
  examen.push({ requisito: "Legitimación por activa", cumple: SI_NO(e.legitimacionActiva.cumple), razon: e.legitimacionActiva.razon });
  examen.push({ requisito: "Legitimación por pasiva", cumple: SI_NO(e.legitimacionPasiva.cumple), razon: e.legitimacionPasiva.razon });
  const meses = e.inmediatez.mesesDesdeElHecho;
  const inmediatez = e.inmediatez.vulneracionContinuada ? true : meses === null ? null : meses <= 6 ? true : Boolean(e.inmediatez.justificacionDemora);
  examen.push({
    requisito: "Inmediatez (plazo razonable)", cumple: SI_NO(inmediatez),
    razon: e.inmediatez.vulneracionContinuada ? "La vulneración es continuada o actual." : meses === null ? "Sin fecha del hecho vulnerador." : `${meses} mes(es) desde el hecho${meses > 6 ? (e.inmediatez.justificacionDemora ? `; demora justificada: ${e.inmediatez.justificacionDemora}` : "; sin justificación de la demora") : ""}.`,
  });
  const pi = e.perjuicioIrremediable;
  const perjuicio = pi.inminente && pi.urgente && pi.grave && pi.impostergable;
  examen.push({ requisito: "Perjuicio irremediable (inminente, urgente, grave e impostergable)", cumple: perjuicio ? "SI" : "NO", razon: `Inminente: ${pi.inminente ? "sí" : "no"}; urgente: ${pi.urgente ? "sí" : "no"}; grave: ${pi.grave ? "sí" : "no"}; impostergable: ${pi.impostergable ? "sí" : "no"}.` });
  const subsidiariedad = e.subsidiariedad.existeOtroMedio === false ? true : e.subsidiariedad.existeOtroMedio === null ? null : e.subsidiariedad.medioEsEficaz === false;
  examen.push({ requisito: "Subsidiariedad", cumple: SI_NO(subsidiariedad), razon: e.subsidiariedad.existeOtroMedio === false ? "No existe otro medio de defensa judicial." : e.subsidiariedad.medioEsEficaz === false ? "El otro medio existe pero no es eficaz en el caso concreto." : e.subsidiariedad.existeOtroMedio === null ? "Determinar si existe otro medio." : "Existe otro medio de defensa judicial eficaz." });
  if (e.tutelaPreviaMismosHechos) advertencias.push("Existe tutela previa por los mismos hechos: riesgo de temeridad (Decreto 2591 de 1991, art. 38).");
  if (e.sujetoEspecialProteccion) advertencias.push("Sujeto de especial protección constitucional: el examen de subsidiariedad e inmediatez se flexibiliza.");

  const legit = e.legitimacionActiva.cumple !== false && e.legitimacionPasiva.cumple !== false;
  let resultado: ResultadoTutela["resultado"];
  if (!legit || inmediatez === false || e.tutelaPreviaMismosHechos) resultado = "IMPROCEDENTE";
  else if (subsidiariedad === true) resultado = "PROCEDENTE";
  else if (perjuicio) resultado = "PROCEDENTE_TRANSITORIA";
  else resultado = "IMPROCEDENTE";
  if (resultado === "IMPROCEDENTE") advertencias.push("Improcedente: indicar la vía ordinaria correspondiente en lugar de radicar una tutela débil.");
  return { resultado, examen, advertencias };
}

/* ─────────────── Módulo 5 · bloque de constitucionalidad ─────────────── */

export interface Instrumento {
  id: string;
  nombre: string;
  leyAprobatoria: string;
  materias: string[];
  verificacion: string;
}

export const INSTRUMENTOS: Instrumento[] = [
  { id: "cadh", nombre: "Convención Americana sobre Derechos Humanos", leyAprobatoria: "Ley 16 de 1972", materias: ["GENERAL", "DEBIDO_PROCESO", "PROPIEDAD", "PROTECCION_JUDICIAL"], verificacion: "PENDIENTE de verificación en fuente oficial" },
  { id: "pidcp", nombre: "Pacto Internacional de Derechos Civiles y Políticos", leyAprobatoria: "Ley 74 de 1968", materias: ["GENERAL", "DEBIDO_PROCESO", "IGUALDAD"], verificacion: "PENDIENTE de verificación en fuente oficial" },
  { id: "pidesc", nombre: "Pacto Internacional de Derechos Económicos, Sociales y Culturales", leyAprobatoria: "Ley 74 de 1968", materias: ["SALUD", "TRABAJO", "SEGURIDAD_SOCIAL", "VIVIENDA", "EDUCACION"], verificacion: "PENDIENTE de verificación en fuente oficial" },
  { id: "san_salvador", nombre: "Protocolo Adicional a la CADH en materia de DESC (Protocolo de San Salvador)", leyAprobatoria: "Ley 319 de 1996", materias: ["SALUD", "TRABAJO", "SEGURIDAD_SOCIAL"], verificacion: "PENDIENTE de verificación en fuente oficial" },
  { id: "cdn", nombre: "Convención sobre los Derechos del Niño", leyAprobatoria: "Ley 12 de 1991", materias: ["NNA"], verificacion: "PENDIENTE de verificación en fuente oficial" },
  { id: "cedaw", nombre: "Convención sobre la Eliminación de Todas las Formas de Discriminación contra la Mujer", leyAprobatoria: "Ley 51 de 1981", materias: ["MUJER_VICTIMA_VIOLENCIA", "MUJER_CABEZA_FAMILIA", "IGUALDAD"], verificacion: "PENDIENTE de verificación en fuente oficial" },
  { id: "belem", nombre: "Convención Interamericana para Prevenir, Sancionar y Erradicar la Violencia contra la Mujer (Belém do Pará)", leyAprobatoria: "Ley 248 de 1995", materias: ["MUJER_VICTIMA_VIOLENCIA"], verificacion: "PENDIENTE de verificación en fuente oficial" },
  { id: "cdpd", nombre: "Convención sobre los Derechos de las Personas con Discapacidad", leyAprobatoria: "Ley 1346 de 2009", materias: ["DISCAPACIDAD"], verificacion: "PENDIENTE de verificación en fuente oficial" },
  { id: "mayores", nombre: "Convención Interamericana sobre la Protección de los Derechos Humanos de las Personas Mayores", leyAprobatoria: "Ley 2055 de 2020", materias: ["PERSONA_MAYOR"], verificacion: "PENDIENTE de verificación en fuente oficial" },
  { id: "oit169", nombre: "Convenio 169 de la OIT sobre pueblos indígenas y tribales", leyAprobatoria: "Ley 21 de 1991", materias: ["PERTENENCIA_ETNICA"], verificacion: "PENDIENTE de verificación en fuente oficial" },
  { id: "cat", nombre: "Convención contra la Tortura y Otros Tratos o Penas Crueles, Inhumanos o Degradantes", leyAprobatoria: "Ley 70 de 1986", materias: ["INTEGRIDAD"], verificacion: "PENDIENTE de verificación en fuente oficial" },
];

export interface EntradaBloque {
  derechoFundamentalComprometido: boolean;
  proteccionInternaInsuficiente: boolean;
  sujetos: string[];
  materias: string[];
}

/**
 * Se activa solo si concurren derecho fundamental comprometido y protección
 * interna insuficiente o sujeto de especial protección. La abstención también
 * es un resultado: invocar el bloque sin necesidad diluye el argumento.
 */
export function evaluarBloque(e: EntradaBloque): { activado: boolean; razones: string[]; instrumentos: Instrumento[] } {
  const razones: string[] = [];
  if (!e.derechoFundamentalComprometido) return { activado: false, razones: ["No hay derecho fundamental comprometido: el módulo no se activa."], instrumentos: [] };
  if (!e.proteccionInternaInsuficiente && e.sujetos.length === 0) return { activado: false, razones: ["La protección interna es suficiente y no hay sujetos de especial protección: no se activa."], instrumentos: [] };
  if (e.proteccionInternaInsuficiente) razones.push("Protección interna insuficiente o ambigua frente al derecho comprometido.");
  if (e.sujetos.length) razones.push(`Sujetos de especial protección: ${e.sujetos.join(", ")}.`);
  const claves = new Set([...e.sujetos, ...e.materias]);
  const instrumentos = INSTRUMENTOS.filter((i) => i.materias.some((m) => claves.has(m)));
  if (!instrumentos.length) instrumentos.push(INSTRUMENTOS.find((i) => i.id === "cadh")!);
  return { activado: true, razones, instrumentos };
}
