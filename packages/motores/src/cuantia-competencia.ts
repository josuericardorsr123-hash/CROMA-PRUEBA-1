/* Módulo 11 · cuantía y competencia. El cálculo se muestra siempre, no solo el
 * resultado: una diferencia de valoración desplaza la competencia entera. */

const SENADO = "http://www.secretariasenado.gov.co/senado/basedoc";

/** Salario mínimo legal mensual vigente por año (decretos anuales). Los años sin dato deben configurarse. */
export const SMMLV_BASE: Record<number, number> = {
  2019: 828_116, 2020: 877_803, 2021: 908_526, 2022: 1_000_000, 2023: 1_160_000, 2024: 1_300_000, 2025: 1_423_500,
};

export function smmlvDe(anio: number, ajustes: Record<number, number> = {}): number | null {
  return ajustes[anio] ?? SMMLV_BASE[anio] ?? null;
}

/** Lee ajustes del entorno: SMMLV_AJUSTES="2026=1750905,2027=..." */
export function ajustesSmmlvDesdeEntorno(valor = process.env.SMMLV_AJUSTES ?? ""): Record<number, number> {
  const salida: Record<number, number> = {};
  for (const par of valor.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [a, v] = par.split("=");
    if (a && v && /^\d{4}$/.test(a) && /^\d+$/.test(v)) salida[Number(a)] = Number(v);
  }
  return salida;
}

export type CategoriaCuantia = "MINIMA" | "MENOR" | "MAYOR" | "UNICA_INSTANCIA_LABORAL" | "PRIMERA_INSTANCIA_LABORAL" | "INDETERMINADA" | "SIN_CUANTIA";

export interface ResultadoCuantia {
  valor: number | null;
  anio: number;
  smmlv: number | null;
  enSalarios: number | null;
  categoria: CategoriaCuantia;
  norma: string;
  verificacion: string;
  calculo: string;
  advertencias: string[];
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

/** CGP art. 25: mínima ≤ 40 SMMLV; menor > 40 y ≤ 150; mayor > 150 (al momento de presentar la demanda, art. 26). */
export function clasificarCuantiaCGP(valor: number | null, anio: number, ajustes: Record<number, number> = {}): ResultadoCuantia {
  const norma = "Ley 1564 de 2012 (CGP), arts. 25 y 26";
  const verificacion = "PENDIENTE de verificación en fuente oficial";
  if (valor === null) return { valor, anio, smmlv: null, enSalarios: null, categoria: "SIN_CUANTIA", norma, verificacion, calculo: "Pretensiones no patrimoniales o cuantía no estimada.", advertencias: ["Si hay pretensiones patrimoniales, estimar la cuantía (y el juramento estimatorio, art. 206 CGP)."] };
  const s = smmlvDe(anio, ajustes);
  if (!s) return { valor, anio, smmlv: null, enSalarios: null, categoria: "INDETERMINADA", norma, verificacion, calculo: `No hay SMMLV configurado para ${anio}.`, advertencias: [`Configure SMMLV_AJUSTES con el salario mínimo de ${anio} (decreto anual) para clasificar la cuantía.`] };
  const n = valor / s;
  const categoria: CategoriaCuantia = n <= 40 ? "MINIMA" : n <= 150 ? "MENOR" : "MAYOR";
  return {
    valor, anio, smmlv: s, enSalarios: Number(n.toFixed(2)), categoria, norma, verificacion,
    calculo: `${pesos(valor)} ÷ ${pesos(s)} (SMMLV ${anio}) = ${n.toFixed(2)} SMMLV → ${categoria === "MINIMA" ? "mínima (≤ 40)" : categoria === "MENOR" ? "menor (> 40 y ≤ 150)" : "mayor (> 150)"} cuantía.`,
    advertencias: ["La cuantía se determina por el valor de todas las pretensiones al tiempo de la demanda, sin frutos, intereses, multas o perjuicios que se causen con posterioridad (art. 26 CGP): verificar la regla aplicable."],
  };
}

/** CPTSS art. 12 (modificado por la Ley 1395 de 2010): única instancia hasta 20 SMMLV. */
export function clasificarCuantiaLaboral(valor: number | null, anio: number, ajustes: Record<number, number> = {}): ResultadoCuantia {
  const norma = "Código Procesal del Trabajo y de la Seguridad Social, art. 12 (modificado por la Ley 1395 de 2010, art. 46)";
  const verificacion = "PENDIENTE de verificación en fuente oficial";
  if (valor === null) return { valor, anio, smmlv: null, enSalarios: null, categoria: "SIN_CUANTIA", norma, verificacion, calculo: "Cuantía no estimada.", advertencias: [] };
  const s = smmlvDe(anio, ajustes);
  if (!s) return { valor, anio, smmlv: null, enSalarios: null, categoria: "INDETERMINADA", norma, verificacion, calculo: `No hay SMMLV configurado para ${anio}.`, advertencias: [`Configure SMMLV_AJUSTES para ${anio}.`] };
  const n = valor / s;
  return {
    valor, anio, smmlv: s, enSalarios: Number(n.toFixed(2)), categoria: n <= 20 ? "UNICA_INSTANCIA_LABORAL" : "PRIMERA_INSTANCIA_LABORAL", norma, verificacion,
    calculo: `${pesos(valor)} ÷ ${pesos(s)} = ${n.toFixed(2)} SMMLV → ${n <= 20 ? "única instancia (≤ 20 SMMLV)" : "primera instancia (> 20 SMMLV)"}.`,
    advertencias: [],
  };
}

export interface HechosCompetencia {
  area: string;
  asunto: "CONTENCIOSO_PATRIMONIAL" | "EJECUTIVO" | "SUCESION" | "FAMILIA" | "LABORAL_ORDINARIO" | "SEGURIDAD_SOCIAL" | "CONTENCIOSO_ADMINISTRATIVO" | "TUTELA" | "POLICIVO" | "PENAL" | "CONSUMIDOR" | "OTRO";
  valor: number | null;
  anio: number;
  domicilioDemandado?: string | null;
  lugarCumplimiento?: string | null;
  ubicacionInmueble?: string | null;
  ultimoDomicilioCausante?: string | null;
  domicilioMenor?: string | null;
  lugarPrestacionServicio?: string | null;
  entidadPublicaDemandada?: string | null;
  lugarVulneracion?: string | null;
  involucraNNA?: boolean;
}

export interface ResultadoCompetencia {
  juez: string;
  territorio: string;
  cadena: string[];
  cuantia: ResultadoCuantia | null;
  advertencias: string[];
  improrrogables: string[];
}

const t = (x?: string | null) => (x && x.trim()) || "[por determinar]";

/**
 * Recorre los factores en orden (materia/naturaleza → cuantía → territorio) y
 * devuelve la cadena que llevó al despacho, con las reglas especiales. Las
 * tablas del CPACA no se automatizan: se remiten a verificación expresa.
 */
export function determinarCompetencia(h: HechosCompetencia, ajustes: Record<number, number> = {}): ResultadoCompetencia {
  const cadena: string[] = [];
  const advertencias: string[] = ["Los factores objetivo y territorial son prorrogables por el silencio de las partes; el subjetivo y el funcional no (art. 16 CGP)."];
  const improrrogables = ["subjetivo", "funcional"];
  let juez = "[por determinar]";
  let territorio = "[por determinar]";
  let cuantia: ResultadoCuantia | null = null;

  switch (h.asunto) {
    case "CONTENCIOSO_PATRIMONIAL":
    case "EJECUTIVO":
    case "CONSUMIDOR": {
      cuantia = clasificarCuantiaCGP(h.valor, h.anio, ajustes);
      cadena.push(`Materia: ${h.area.toLowerCase()} (jurisdicción ordinaria, cláusula general residual del CGP).`, `Cuantía: ${cuantia.calculo}`);
      juez = cuantia.categoria === "MINIMA" ? "Juez Civil Municipal en única instancia (o de Pequeñas Causas y Competencia Múltiple donde exista)"
        : cuantia.categoria === "MENOR" ? "Juez Civil Municipal en primera instancia"
        : cuantia.categoria === "MAYOR" ? "Juez Civil del Circuito en primera instancia" : "[cuantía indeterminada]";
      if (h.asunto === "CONSUMIDOR") cadena.push("Protección al consumidor: además del juez civil, la Superintendencia de Industria y Comercio ejerce funciones jurisdiccionales (Ley 1480 de 2011, art. 58; CGP art. 24); la elección condiciona trámite y tiempos.");
      if (h.entidadPublicaDemandada) {
        territorio = `Privativo: juez del domicilio de la entidad pública (${t(h.entidadPublicaDemandada)}) (art. 28, num. 10 CGP).`;
      } else if (h.ubicacionInmueble) {
        territorio = `Privativo: juez del lugar del inmueble (${t(h.ubicacionInmueble)}) si se ejercen derechos reales (art. 28, num. 7 CGP).`;
      } else {
        territorio = `Domicilio del demandado (${t(h.domicilioDemandado)})${h.lugarCumplimiento ? ` o, en procesos originados en contrato, también el lugar de cumplimiento (${h.lugarCumplimiento})` : ""} (art. 28, nums. 1 y 3 CGP).`;
      }
      break;
    }
    case "SUCESION": {
      cuantia = clasificarCuantiaCGP(h.valor, h.anio, ajustes);
      cadena.push("Materia: sucesión (jurisdicción ordinaria civil y de familia).", `Cuantía del activo: ${cuantia.calculo}`);
      juez = cuantia.categoria === "MAYOR" ? "Juez de Familia en primera instancia (sucesión de mayor cuantía)" : "Juez Civil Municipal (sucesión de mínima o menor cuantía)";
      territorio = `Último domicilio del causante en el territorio nacional (${t(h.ultimoDomicilioCausante)}) (art. 28, num. 12 CGP).`;
      if (cuantia.categoria === "MAYOR") cadena.push("Fuero de atracción: el juez de la sucesión de mayor cuantía conoce de validez del testamento, petición de herencia, reivindicación de bienes hereditarios y controversias sucesorias (art. 23 CGP).");
      break;
    }
    case "FAMILIA": {
      cadena.push("Materia: familia (jueces de familia; en su defecto, civiles o promiscuos municipales según los arts. 17, 21 y 22 CGP).");
      juez = "Juez de Familia (verificar asignación en única o primera instancia, arts. 21 y 22 CGP)";
      territorio = h.involucraNNA
        ? `Privativo: juez del domicilio o residencia del niño, niña o adolescente (${t(h.domicilioMenor)}) (art. 28, num. 2 CGP).`
        : `Domicilio del demandado (${t(h.domicilioDemandado)}) o domicilio común anterior mientras el demandante lo conserve, según el asunto (art. 28, num. 2 CGP).`;
      break;
    }
    case "LABORAL_ORDINARIO":
    case "SEGURIDAD_SOCIAL": {
      cuantia = clasificarCuantiaLaboral(h.valor, h.anio, ajustes);
      cadena.push("Materia: laboral y de seguridad social (CPTSS, art. 2).", `Cuantía: ${cuantia.calculo}`);
      juez = cuantia.categoria === "UNICA_INSTANCIA_LABORAL" ? "Juez Municipal de Pequeñas Causas Laborales (o civil/promiscuo municipal donde no exista) en única instancia" : "Juez Laboral del Circuito en primera instancia";
      territorio = h.asunto === "SEGURIDAD_SOCIAL"
        ? `A elección del demandante: domicilio de la entidad de seguridad social o lugar donde se surtió la reclamación (CPTSS, art. 11).`
        : `A elección del demandante: último lugar de prestación del servicio (${t(h.lugarPrestacionServicio)}) o domicilio del demandado (${t(h.domicilioDemandado)}) (CPTSS, art. 5).`;
      break;
    }
    case "CONTENCIOSO_ADMINISTRATIVO": {
      cadena.push("Materia: jurisdicción de lo contencioso administrativo (CPACA, arts. 104 y 105).");
      juez = "Juzgado Administrativo, Tribunal Administrativo o Consejo de Estado según medio de control y cuantía (CPACA, arts. 149 a 158, modificados por la Ley 2080 de 2021): verificar la tabla vigente.";
      territorio = "Reglas del art. 156 CPACA según el medio de control (p. ej. lugar de expedición del acto, lugar de los hechos o sede de la entidad).";
      advertencias.push("El sistema no automatiza los umbrales de competencia del CPACA: requieren verificación expresa de la norma vigente.");
      break;
    }
    case "TUTELA": {
      cadena.push("Acción de tutela: competencia a prevención del juez con jurisdicción donde ocurre la vulneración o amenaza o donde se producen sus efectos (Decreto 2591 de 1991, art. 37) y reglas de reparto (Decreto 1069 de 2015, modificado por el Decreto 333 de 2021).");
      juez = "Juez de la República con jurisdicción en el lugar de la vulneración, según reglas de reparto por naturaleza del accionado";
      territorio = `Lugar de la vulneración o de sus efectos (${t(h.lugarVulneracion)}).`;
      break;
    }
    case "POLICIVO": {
      cadena.push("Proceso policivo (Ley 1801 de 2016): inspección de policía del lugar de los hechos; alcaldía en segunda instancia.");
      juez = "Inspector de Policía del lugar de los hechos";
      territorio = `Lugar de la perturbación (${t(h.ubicacionInmueble ?? h.lugarVulneracion)}).`;
      break;
    }
    case "PENAL": {
      cadena.push("Materia penal (Ley 906 de 2004): denuncia o querella ante la Fiscalía General de la Nación; juez según factor territorial del lugar de los hechos.");
      juez = "Fiscalía General de la Nación (etapa de indagación); juez penal competente según el delito";
      territorio = `Lugar de comisión de la conducta (${t(h.lugarVulneracion)}).`;
      break;
    }
    default:
      cadena.push("Asunto sin regla automática: requiere determinación del ABOGADO (USUARIO).");
  }
  return { juez, territorio, cadena, cuantia, advertencias, improrrogables };
}

export const FUENTES_COMPETENCIA = {
  cgp: `${SENADO}/ley_1564_2012.html`,
  cptss: `${SENADO}/codigo_procedimental_laboral.html`,
  cpaca: `${SENADO}/ley_1437_2011.html`,
};
