/* Módulos 20 (MASC) y 3 (normograma cruzado). */

export interface EntradaMasc {
  area: string;
  asunto: string;
  derechosCiertosEIndiscutibles: boolean;
  estadoCivil: boolean;
  delitoNoQuerellable: boolean;
  relacionAPreservar: number; // 0 a 1
  cuantiaFrenteACosto: number; // 0 (cuantía muy superior al costo) a 1 (litigio desproporcionado frente a la cuantía)
  debilidadProbatoriaPropia: number; // 0 (prueba sólida) a 1 (prueba débil)
  duracionEstimadaProceso: number; // 0 (rápido) a 1 (muy lento)
  disposicionManifestada: number; // 0 a 1
  obligatoriaComoRequisito: "SI" | "NO" | "INCIERTO";
  obstaculoNoNegociable: boolean; // p. ej. trámite registral o tributario pendiente
}

export interface ResultadoMasc {
  conciliable: "SI" | "NO" | "PARCIAL";
  obligatoriaComoRequisito: "SI" | "NO" | "INCIERTO";
  puntaje: number;
  factores: Array<{ factor: string; peso: number; valor: number; razon: string }>;
  recomendacion: string;
}

export function evaluarMasc(e: EntradaMasc): ResultadoMasc {
  const noConciliable = e.estadoCivil || e.delitoNoQuerellable;
  const parcial = e.derechosCiertosEIndiscutibles;
  const conciliable: ResultadoMasc["conciliable"] = noConciliable ? "NO" : parcial ? "PARCIAL" : "SI";
  const factores = [
    { factor: "Relación entre las partes que conviene preservar", peso: 0.2, valor: e.relacionAPreservar, razon: "Un acuerdo protege relaciones que el litigio deteriora." },
    { factor: "Costo del litigio frente a la cuantía", peso: 0.2, valor: e.cuantiaFrenteACosto, razon: "Cuanto más desproporcionado el costo, más conveniente el acuerdo." },
    { factor: "Debilidad de la prueba propia", peso: 0.25, valor: e.debilidadProbatoriaPropia, razon: "Con prueba débil, el acuerdo reduce el riesgo de perder (Módulo 13)." },
    { factor: "Duración estimada del proceso", peso: 0.15, valor: e.duracionEstimadaProceso, razon: "Un proceso largo aumenta el costo de oportunidad." },
    { factor: "Disposición manifestada por el cliente", peso: 0.2, valor: e.disposicionManifestada, razon: "Transigir sobre un derecho propio es decisión indelegable del cliente." },
  ];
  let puntaje = Math.round(factores.reduce((s, f) => s + f.peso * Math.max(0, Math.min(1, f.valor)), 0) * 100);
  if (noConciliable) puntaje = 0;
  if (e.obstaculoNoNegociable) puntaje = Math.min(puntaje, 25);
  const recomendacion = noConciliable
    ? "El asunto no es conciliable: la vía es judicial o administrativa."
    : e.obstaculoNoNegociable
      ? "El obstáculo principal no depende de la voluntad de las partes (trámite registral, tributario o administrativo pendiente): conciliar no lo remueve."
      : puntaje >= 60 ? "Conveniencia alta de intentar un acuerdo antes de litigar, con los márgenes que autorice el cliente."
      : puntaje >= 35 ? "Conveniencia media: intentar acuerdo sin sacrificar términos."
      : "Conveniencia baja: priorizar la vía litigiosa.";
  return { conciliable, obligatoriaComoRequisito: e.obligatoriaComoRequisito, puntaje, factores, recomendacion: `${recomendacion}${e.obligatoriaComoRequisito === "SI" ? " ADVERTENCIA: la conciliación es requisito de procedibilidad en este asunto." : ""}${parcial ? " Los derechos ciertos e indiscutibles no son conciliables." : ""}` };
}

/* ─────────────── Módulo 3 · normograma cruzado ─────────────── */

export interface CuerpoNormativoCatalogo {
  id: string;
  nombre: string;
  areas: string[];
  url: string;
}

export interface Remision {
  desde: string;
  hacia: string;
  tipo: "SUPLETORIEDAD" | "REMISION_EXPRESA" | "INTEGRACION" | "APLICACION_SUPLETORIA_LIMITADA";
  norma: string;
  descripcion: string;
  verificacion: string;
}

const SENADO = "http://www.secretariasenado.gov.co/senado/basedoc";

export const CUERPOS_NORMATIVOS: CuerpoNormativoCatalogo[] = [
  { id: "cp", nombre: "Constitución Política de 1991", areas: ["*"], url: `${SENADO}/constitucion_politica_1991.html` },
  { id: "cc", nombre: "Código Civil", areas: ["CIVIL", "FAMILIA", "COMERCIAL", "AGRARIO"], url: `${SENADO}/codigo_civil.html` },
  { id: "cco", nombre: "Código de Comercio", areas: ["COMERCIAL", "SOCIETARIO", "CONSUMIDOR"], url: `${SENADO}/codigo_comercio.html` },
  { id: "cgp", nombre: "Código General del Proceso (Ley 1564 de 2012)", areas: ["CIVIL", "COMERCIAL", "FAMILIA", "AGRARIO", "CONSUMIDOR", "INSOLVENCIA"], url: `${SENADO}/ley_1564_2012.html` },
  { id: "cpaca", nombre: "CPACA (Ley 1437 de 2011)", areas: ["ADMINISTRATIVO", "CONTRATACION_ESTATAL", "TRIBUTARIO"], url: `${SENADO}/ley_1437_2011.html` },
  { id: "cst", nombre: "Código Sustantivo del Trabajo", areas: ["LABORAL"], url: `${SENADO}/codigo_sustantivo_trabajo.html` },
  { id: "cptss", nombre: "Código Procesal del Trabajo y de la Seguridad Social", areas: ["LABORAL", "SEGURIDAD_SOCIAL"], url: `${SENADO}/codigo_procedimental_laboral.html` },
  { id: "l100", nombre: "Ley 100 de 1993 (Sistema de Seguridad Social Integral)", areas: ["SEGURIDAD_SOCIAL"], url: `${SENADO}/ley_0100_1993.html` },
  { id: "cia", nombre: "Código de la Infancia y la Adolescencia (Ley 1098 de 2006)", areas: ["FAMILIA"], url: `${SENADO}/ley_1098_2006.html` },
  { id: "eco", nombre: "Estatuto del Consumidor (Ley 1480 de 2011)", areas: ["CONSUMIDOR"], url: `${SENADO}/ley_1480_2011.html` },
  { id: "l142", nombre: "Régimen de servicios públicos domiciliarios (Ley 142 de 1994)", areas: ["SERVICIOS_PUBLICOS"], url: `${SENADO}/ley_0142_1994.html` },
  { id: "cnp", nombre: "Código Nacional de Seguridad y Convivencia Ciudadana (Ley 1801 de 2016)", areas: ["POLICIVO"], url: `${SENADO}/ley_1801_2016.html` },
  { id: "cpenal", nombre: "Código Penal (Ley 599 de 2000)", areas: ["PENAL"], url: `${SENADO}/ley_0599_2000.html` },
  { id: "cpp", nombre: "Código de Procedimiento Penal (Ley 906 de 2004)", areas: ["PENAL"], url: `${SENADO}/ley_0906_2004.html` },
  { id: "l2213", nombre: "Ley 2213 de 2022 (justicia digital)", areas: ["*"], url: `${SENADO}/ley_2213_2022.html` },
  { id: "l2220", nombre: "Ley 2220 de 2022 (Estatuto de Conciliación)", areas: ["CIVIL", "COMERCIAL", "FAMILIA", "ADMINISTRATIVO", "LABORAL"], url: `${SENADO}/ley_2220_2022.html` },
  { id: "d2591", nombre: "Decreto 2591 de 1991 (acción de tutela)", areas: ["CONSTITUCIONAL"], url: `${SENADO}/decreto_2591_1991.html` },
  { id: "l472", nombre: "Ley 472 de 1998 (acciones populares y de grupo)", areas: ["CONSTITUCIONAL"], url: `${SENADO}/ley_0472_1998.html` },
  { id: "l1581", nombre: "Ley 1581 de 2012 (protección de datos personales)", areas: ["*"], url: `${SENADO}/ley_1581_2012.html` },
  { id: "et", nombre: "Estatuto Tributario", areas: ["TRIBUTARIO"], url: `${SENADO}/estatuto_tributario.html` },
  { id: "l1116", nombre: "Ley 1116 de 2006 (régimen de insolvencia empresarial)", areas: ["INSOLVENCIA", "SOCIETARIO"], url: `${SENADO}/ley_1116_2006.html` },
  { id: "l80", nombre: "Ley 80 de 1993 y Ley 1150 de 2007 (contratación estatal)", areas: ["CONTRATACION_ESTATAL"], url: `${SENADO}/ley_0080_1993.html` },
];

export const REMISIONES: Remision[] = [
  { desde: "cgp", hacia: "*", tipo: "SUPLETORIEDAD", norma: "CGP art. 1", descripcion: "El CGP se aplica a los asuntos de cualquier jurisdicción o especialidad en lo no regulado expresamente en otras leyes.", verificacion: "CONTRASTADA (arquitectura del sistema)" },
  { desde: "cgp", hacia: "cgp", tipo: "INTEGRACION", norma: "CGP art. 12", descripcion: "Los vacíos se llenan con las normas que regulen casos análogos.", verificacion: "CONTRASTADA (texto transcrito del art. 12 CGP)" },
  { desde: "cptss", hacia: "cgp", tipo: "REMISION_EXPRESA", norma: "CPTSS art. 145", descripcion: "A falta de disposiciones especiales en el procedimiento del trabajo se aplican las normas análogas y, en su defecto, las del procedimiento civil (hoy CGP).", verificacion: "PENDIENTE de verificación en fuente oficial" },
  { desde: "cpaca", hacia: "cgp", tipo: "REMISION_EXPRESA", norma: "CPACA art. 306", descripcion: "En los aspectos no contemplados en el CPACA se sigue el procedimiento civil (hoy CGP) en lo compatible.", verificacion: "PENDIENTE de verificación en fuente oficial" },
  { desde: "cco", hacia: "cc", tipo: "REMISION_EXPRESA", norma: "C.Co. arts. 2 y 822", descripcion: "Los principios que gobiernan la formación de los actos y contratos y las obligaciones de derecho civil se aplican a las obligaciones y negocios mercantiles.", verificacion: "PENDIENTE de verificación en fuente oficial" },
  { desde: "cia", hacia: "cp", tipo: "INTEGRACION", norma: "Ley 1098 de 2006, art. 6", descripcion: "Las normas constitucionales y los tratados de derechos humanos ratificados, en especial la Convención sobre los Derechos del Niño, hacen parte integral del Código y guían su interpretación.", verificacion: "CONTRASTADA (arquitectura del sistema)" },
  { desde: "eco", hacia: "l142", tipo: "APLICACION_SUPLETORIA_LIMITADA", norma: "Ley 1480 de 2011, art. 2", descripcion: "El Estatuto del Consumidor se aplica supletoriamente a los regímenes especiales, entre ellos los servicios públicos domiciliarios.", verificacion: "VERIFICADA 2026-09-22 (base de conocimiento del despacho)" },
  { desde: "cpp", hacia: "cgp", tipo: "REMISION_EXPRESA", norma: "Ley 906 de 2004, art. 25", descripcion: "En materias no reguladas se aplican otros ordenamientos procesales cuando no se opongan a la naturaleza del procedimiento penal.", verificacion: "PENDIENTE de verificación en fuente oficial" },
  { desde: "l2213", hacia: "*", tipo: "INTEGRACION", norma: "Ley 2213 de 2022", descripcion: "Uso de tecnologías de la información en las actuaciones judiciales en las jurisdicciones ordinaria (civil, laboral, familia), contencioso administrativa, constitucional y disciplinaria, y en actuaciones de autoridades administrativas con funciones jurisdiccionales.", verificacion: "PENDIENTE de verificación en fuente oficial" },
];

export function cuerposSugeridos(areas: string[]): Array<{ cuerpo: CuerpoNormativoCatalogo; rol: "APLICABLE" | "CONCURRENTE" | "SUPLETORIO"; razon: string; remisiones: Remision[] }> {
  const principales = new Set(areas);
  return CUERPOS_NORMATIVOS.filter((c) => c.areas.includes("*") || c.areas.some((a) => principales.has(a))).map((c) => {
    const remisiones = REMISIONES.filter((r) => r.desde === c.id || r.hacia === c.id);
    const rol = c.areas.includes("*") ? (c.id === "cp" ? "APLICABLE" : "SUPLETORIO") : c.areas.some((a) => a === areas[0]) ? "APLICABLE" : "CONCURRENTE";
    return { cuerpo: c, rol, razon: rol === "APLICABLE" ? `Regula el área principal (${areas[0]}).` : rol === "CONCURRENTE" ? "Concurre por una de las áreas identificadas en los hechos." : "Aplicación transversal o supletoria.", remisiones };
  });
}
