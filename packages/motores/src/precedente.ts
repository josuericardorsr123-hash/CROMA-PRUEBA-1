/* Módulo 2 · fuerza vinculante del precedente y líneas jurisprudenciales.
 * Reglas (fuentes verificadas el 2026-09-22 en la base de conocimiento del
 * despacho): art. 10 CPACA con preferencia constitucional (C-634 de 2011);
 * vinculación de autoridades administrativas (C-539 de 2011, matizada por la
 * C-816 de 2011); apartamiento judicial con cargas de transparencia y
 * suficiencia (C-816 de 2011, C-461 de 2013); unificación del Consejo de
 * Estado (art. 270 CPACA; C-588 de 2012). La doctrina probable (art. 4 Ley 169
 * de 1896) fue DEROGADA por el art. 92 de la Ley 2430 de 2024. */

export type Nivel = "VINCULANTE_ERGA_OMNES" | "PRECEDENTE_REFORZADO" | "PRECEDENTE_VINCULANTE" | "PRECEDENTE_HORIZONTAL" | "PERSUASIVO" | "NO_VINCULANTE";
export const NIVELES: Nivel[] = ["VINCULANTE_ERGA_OMNES", "PRECEDENTE_REFORZADO", "PRECEDENTE_VINCULANTE", "PRECEDENTE_HORIZONTAL", "PERSUASIVO", "NO_VINCULANTE"];

export interface EntradaVinculancia {
  autoridad: "CC" | "CE" | "CSJ" | "TRIBUNAL" | "JUEZ" | "SUPERINTENDENCIA" | "COMISION" | "AUTORIDAD_ADMINISTRATIVA" | "DOCTRINA" | "CIDH";
  tipo: string; // C, SU, T, A, unificacion, seccion, casacion, tutela, concepto, sentencia
  esUnificacion?: boolean;
  destinatario?: "juez" | "autoridad_administrativa" | "particular";
  mismaAutoridadQueDecide?: boolean;
  similitudFactica?: number | null;
  esRatioDecidendi?: boolean | null;
  fueModificadaOSuperada?: boolean;
}

export interface ResultadoVinculancia {
  nivel: Nivel;
  orden: number;
  fundamentos: string[];
  analogia: "ALTA" | "MEDIA" | "BAJA" | null;
  reglaApartamiento: string;
  usoRecomendado: string;
}

const USO: Record<Nivel, string> = {
  VINCULANTE_ERGA_OMNES: "Premisa normativa obligatoria",
  PRECEDENTE_REFORZADO: "Argumento principal",
  PRECEDENTE_VINCULANTE: "Argumento principal si hay analogía fáctica",
  PRECEDENTE_HORIZONTAL: "Exigir coherencia al mismo despacho",
  PERSUASIVO: "Argumento de apoyo",
  NO_VINCULANTE: "Ilustración",
};

export function evaluarFuerzaVinculante(p: EntradaVinculancia): ResultadoVinculancia {
  const tipo = (p.tipo || "").toLowerCase();
  const fundamentos: string[] = [];
  let nivel: Nivel = "PERSUASIVO";

  if (tipo === "concepto" || ["SUPERINTENDENCIA", "COMISION", "AUTORIDAD_ADMINISTRATIVA"].includes(p.autoridad)) {
    nivel = "NO_VINCULANTE";
    fundamentos.push("Concepto administrativo, incluidos los de la Sala de Consulta y Servicio Civil: por regla general carece de fuerza obligatoria y no constituye precedente (art. 28 CPACA, en la redacción de la Ley 1755 de 2015). Excepción de régimen especial: los conceptos escritos vigentes de la DIAN pueden servir de soporte a la actuación del contribuyente.");
  } else if (p.autoridad === "CC" && tipo === "c") {
    nivel = "VINCULANTE_ERGA_OMNES";
    fundamentos.push("Control abstracto de constitucionalidad: efectos erga omnes y cosa juzgada constitucional (art. 243 C.P.). Revisar si el fallo moduló sus efectos.");
  } else if (p.autoridad === "CC" && tipo === "su") {
    nivel = "PRECEDENTE_REFORZADO";
    fundamentos.push("Sentencia SU de la Corte Constitucional: el precedente de mayor peso en materia de derechos fundamentales.");
  } else if (p.autoridad === "CC" && ["t", "tutela"].includes(tipo)) {
    nivel = "PRECEDENTE_VINCULANTE";
    fundamentos.push("Tutela: la parte resolutiva obliga a las partes; la ratio decidendi es precedente para casos con los mismos hechos determinantes.");
  } else if (p.autoridad === "CC" && tipo === "a") {
    nivel = "PERSUASIVO";
    fundamentos.push("Auto de la Corte Constitucional: valorar su contenido (nulidades, seguimiento); no es, por regla general, precedente de fondo.");
  } else if (p.autoridad === "CE" && (p.esUnificacion || tipo === "unificacion")) {
    nivel = "PRECEDENTE_REFORZADO";
    fundamentos.push("Sentencia de unificación del Consejo de Estado (art. 270 CPACA): las autoridades deben aplicarla (art. 10 CPACA) y sobre ella procede la extensión de jurisprudencia (arts. 102 y 269 CPACA).");
  } else if (p.autoridad === "CE") {
    nivel = "PRECEDENTE_VINCULANTE";
    fundamentos.push("Sentencia del órgano de cierre de lo contencioso administrativo: conserva valor de precedente aunque no sea de unificación (C-588 de 2012).");
  } else if (p.autoridad === "CSJ" && ["casacion", "sentencia", "sc", "sl", "sp"].includes(tipo)) {
    nivel = "PRECEDENTE_VINCULANTE";
    fundamentos.push("Sentencia de casación de la Corte Suprema: precedente del órgano de cierre de la jurisdicción ordinaria (C-461 de 2013). Desde la Ley 2430 de 2024, que derogó el art. 4 de la Ley 169 de 1896 (doctrina probable), ya no se requieren tres decisiones uniformes; sí debe comprobarse que la regla siga vigente.");
  } else if (p.autoridad === "CSJ") {
    nivel = tipo === "tutela" ? "PERSUASIVO" : "PRECEDENTE_VINCULANTE";
    fundamentos.push("Providencia de la Corte Suprema en sede distinta de casación: valorar su ratio y su sala.");
  } else if (p.autoridad === "TRIBUNAL" || p.autoridad === "JUEZ") {
    nivel = p.mismaAutoridadQueDecide ? "PRECEDENTE_HORIZONTAL" : "PERSUASIVO";
    fundamentos.push(nivel === "PRECEDENTE_HORIZONTAL" ? "Precedente horizontal: el mismo despacho debe sostener su criterio o explicar por qué lo cambia." : "Decisión de otro juez de instancia: valor persuasivo.");
  } else if (p.autoridad === "CIDH") {
    nivel = "PERSUASIVO";
    fundamentos.push("Jurisprudencia interamericana: parámetro de interpretación y de control de convencionalidad; su fuerza en el caso concreto se argumenta con el bloque de constitucionalidad (art. 93 C.P.).");
  } else if (p.autoridad === "DOCTRINA") {
    nivel = "NO_VINCULANTE";
    fundamentos.push("Doctrina: criterio auxiliar (art. 230 C.P.), nunca fuente vinculante.");
  }

  if (p.esRatioDecidendi === false && nivel !== "NO_VINCULANTE" && nivel !== "VINCULANTE_ERGA_OMNES") {
    fundamentos.push("El fragmento que se invoca es obiter dictum: solo persuade, aunque la providencia en su conjunto sea vinculante.");
    nivel = "PERSUASIVO";
  }
  if (p.fueModificadaOSuperada) {
    fundamentos.push("La regla fue modificada o superada: identificar la regla VIGENTE antes de usarla.");
    if (nivel !== "NO_VINCULANTE") nivel = "PERSUASIVO";
  }

  const sim = p.similitudFactica;
  const analogia = sim === null || sim === undefined ? null : sim >= 0.75 ? "ALTA" : sim >= 0.5 ? "MEDIA" : "BAJA";
  if (analogia === "BAJA" && (nivel === "PRECEDENTE_REFORZADO" || nivel === "PRECEDENTE_VINCULANTE")) fundamentos.push("Analogía fáctica baja: la contraparte puede distinguir el caso, de modo que el precedente no se aplica por sí solo.");

  let reglaApartamiento: string;
  if (p.destinatario === "autoridad_administrativa" && ["VINCULANTE_ERGA_OMNES", "PRECEDENTE_REFORZADO", "PRECEDENTE_VINCULANTE"].includes(nivel)) {
    reglaApartamiento = "Las altas cortes vinculan con su precedente a las autoridades administrativas (C-539 de 2011; art. 10 CPACA, leído con preferencia de la jurisprudencia constitucional, C-634 de 2011). Apartarse es excepcional y exige decisión expresa, reglada y motivada (C-816 de 2011).";
  } else if (nivel === "VINCULANTE_ERGA_OMNES") {
    reglaApartamiento = "Frente a una parte resolutiva con efectos generales no cabe apartamiento; únicamente puede distinguirse el caso por sus hechos.";
  } else if (["PRECEDENTE_REFORZADO", "PRECEDENTE_VINCULANTE", "PRECEDENTE_HORIZONTAL"].includes(nivel)) {
    reglaApartamiento = "El juez solo puede apartarse si cumple dos cargas: transparencia (identificar expresamente el precedente que no seguirá) y suficiencia (mostrar diferencias fácticas relevantes, un desacuerdo interpretativo o una discrepancia con la regla), y argumenta que su solución protege mejor los derechos y principios constitucionales (C-634 de 2011; C-816 de 2011; C-461 de 2013). Si no las cumple, incurre en defecto por desconocimiento del precedente.";
  } else {
    reglaApartamiento = "No vincula: puede usarse como argumento de apoyo.";
  }
  return { nivel, orden: NIVELES.indexOf(nivel), fundamentos, analogia, reglaApartamiento, usoRecomendado: USO[nivel] };
}

export interface ProvidenciaLinea {
  id: string;
  autoridad: EntradaVinculancia["autoridad"];
  tipo: string;
  fecha: string;
  regla: string;
  sentido: "favorable" | "desfavorable" | "mixto";
  esUnificacion?: boolean;
}

export function construirLineaJurisprudencial(ps: ProvidenciaLinea[]) {
  if (!ps.length) return null;
  const orden = [...ps].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const peso = (x: ProvidenciaLinea) => evaluarFuerzaVinculante({ autoridad: x.autoridad, tipo: x.tipo, esUnificacion: x.esUnificacion }).orden;
  const cambios: Array<{ desde: string; hacia: string }> = [];
  const linea = orden.map((x, i) => {
    const roles: string[] = [];
    if (i === 0) roles.push("FUNDADORA (la más antigua del conjunto)");
    if (x.esUnificacion || ["SU", "C"].includes(x.tipo.toUpperCase())) roles.push("HITO (unificación o control abstracto)");
    const previa = orden[i - 1];
    if (previa && x.sentido !== previa.sentido) {
      roles.push("CAMBIO DE POSTURA");
      cambios.push({ desde: previa.id, hacia: x.id });
    }
    if (orden.slice(0, i).filter((y) => y.sentido === x.sentido).length >= 2 && !roles.includes("CAMBIO DE POSTURA")) roles.push("CONSOLIDADORA (reitera la subregla)");
    return { ...x, roles: roles.length ? roles : ["REITERACIÓN"] };
  });
  const mayorJerarquia = [...orden].sort((a, b) => peso(a) - peso(b) || b.fecha.localeCompare(a.fecha))[0]!;
  const sentidos = new Set(orden.map((x) => x.sentido));
  const estado = sentidos.size === 1 && orden.length >= 3 ? "CONSOLIDADA" : cambios.length > 1 ? "EN_DISPUTA" : cambios.length ? "CAMBIANTE" : "INCIPIENTE";
  return {
    linea, cambios, estado, decisionDeMayorJerarquia: mayorJerarquia.id, decisionMasReciente: orden[orden.length - 1]!.id,
    regla: "Rige la subregla de la decisión más reciente del órgano de mayor jerarquía, mientras otra de igual jerarquía no la modifique expresamente. Revisar providencias posteriores a la fecha de corte.",
  };
}
