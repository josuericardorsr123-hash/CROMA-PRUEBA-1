/* Módulo 21 (extractor) y Módulo 1 (resolutor por número): detecta citas de
 * providencias y normas, las normaliza y construye la URL oficial cuando hay
 * patrón verificado. Patrones verificados el 2026-09-22 (Corte Constitucional:
 * C-150-03, C-816-11, SU611-17, A038-03; Secretaría del Senado: ley_NNNN_AAAA). */

export type ClaseCita = "PROVIDENCIA_CC" | "PROVIDENCIA_CSJ" | "PROVIDENCIA_CE" | "NORMA" | "CODIGO" | "CONCEPTO";

export interface CitaDetectada {
  clase: ClaseCita;
  texto: string;
  /** Identificador canónico estable: "C-836 de 2001", "SC370-2023", "Ley 1564 de 2012", "Ley 1564 de 2012, art. 94". */
  identificador: string;
  /** Identificador de la fuente madre (sin artículo): agrupa citas del mismo cuerpo. */
  identificadorBase: string;
  articulo: string | null;
  url: string | null;
  estadoUrl: string;
  inicio: number;
  fin: number;
  detalle: Record<string, string | number | null>;
}

const SENADO = "http://www.secretariasenado.gov.co/senado/basedoc";

export const CODIGOS: Record<string, { nombre: string; base: string; url: string }> = {
  cp: { nombre: "Constitución Política", base: "Constitución Política de 1991", url: `${SENADO}/constitucion_politica_1991.html` },
  cc: { nombre: "Código Civil", base: "Código Civil", url: `${SENADO}/codigo_civil.html` },
  cco: { nombre: "Código de Comercio", base: "Código de Comercio", url: `${SENADO}/codigo_comercio.html` },
  cgp: { nombre: "Código General del Proceso", base: "Ley 1564 de 2012", url: `${SENADO}/ley_1564_2012.html` },
  cpaca: { nombre: "Código de Procedimiento Administrativo y de lo Contencioso Administrativo", base: "Ley 1437 de 2011", url: `${SENADO}/ley_1437_2011.html` },
  cst: { nombre: "Código Sustantivo del Trabajo", base: "Código Sustantivo del Trabajo", url: `${SENADO}/codigo_sustantivo_trabajo.html` },
  cptss: { nombre: "Código Procesal del Trabajo y de la Seguridad Social", base: "Código Procesal del Trabajo y de la Seguridad Social", url: `${SENADO}/codigo_procedimental_laboral.html` },
  cia: { nombre: "Código de la Infancia y la Adolescencia", base: "Ley 1098 de 2006", url: `${SENADO}/ley_1098_2006.html` },
  cnp: { nombre: "Código Nacional de Seguridad y Convivencia Ciudadana", base: "Ley 1801 de 2016", url: `${SENADO}/ley_1801_2016.html` },
  cpenal: { nombre: "Código Penal", base: "Ley 599 de 2000", url: `${SENADO}/ley_0599_2000.html` },
  cpp: { nombre: "Código de Procedimiento Penal", base: "Ley 906 de 2004", url: `${SENADO}/ley_0906_2004.html` },
  eco: { nombre: "Estatuto del Consumidor", base: "Ley 1480 de 2011", url: `${SENADO}/ley_1480_2011.html` },
  et: { nombre: "Estatuto Tributario", base: "Estatuto Tributario", url: `${SENADO}/estatuto_tributario.html` },
};

const ALIAS_CODIGOS: Array<[RegExp, keyof typeof CODIGOS]> = [
  [/\b(?:la\s+)?constituci[oó]n(?:\s+pol[ií]tica)?(?:\s+de\s+colombia)?\b|\bC\.\s?P\.(?!\s?P)/gi, "cp"],
  [/\bc[oó]digo\s+civil\b|\bC\.\s?C\.(?!o)/gi, "cc"],
  [/\bc[oó]digo\s+de\s+comercio\b|\bC\.\s?Co\.?/gi, "cco"],
  [/\bc[oó]digo\s+general\s+del\s+proceso\b|\bCGP\b|\bC\.G\.P\.?/gi, "cgp"],
  [/\bCPACA\b|\bc[oó]digo\s+de\s+procedimiento\s+administrativo\s+y\s+de\s+lo\s+contencioso\s+administrativo\b/gi, "cpaca"],
  [/\bc[oó]digo\s+sustantivo\s+del\s+trabajo\b|\bCST\b|\bC\.S\.T\.?/gi, "cst"],
  [/\bc[oó]digo\s+procesal\s+del\s+trabajo(?:\s+y\s+de\s+la\s+seguridad\s+social)?\b|\bCPTSS\b|\bCPT\b/gi, "cptss"],
  [/\bc[oó]digo\s+de\s+la\s+infancia\s+y\s+la\s+adolescencia\b/gi, "cia"],
  [/\bc[oó]digo\s+nacional\s+de\s+(?:seguridad\s+y\s+convivencia\s+ciudadana|polic[ií]a)\b/gi, "cnp"],
  [/\bc[oó]digo\s+penal\b/gi, "cpenal"],
  [/\bc[oó]digo\s+de\s+procedimiento\s+penal\b/gi, "cpp"],
  [/\bestatuto\s+del\s+consumidor\b/gi, "eco"],
  [/\bestatuto\s+tributario\b/gi, "et"],
];

function anioCompleto(a: string): number {
  const n = Number(a);
  return n > 1000 ? n : n >= 91 ? 1900 + n : 2000 + n;
}

export function urlCorteConstitucional(tipo: string, numero: number, anio: number): string {
  const t = tipo.toUpperCase();
  const aa = String(anio).slice(2);
  const nnn = String(numero).padStart(3, "0");
  if (t === "A") return `https://www.corteconstitucional.gov.co/relatoria/autos/${anio}/A${nnn}-${aa}.htm`;
  if (t === "SU") return `https://www.corteconstitucional.gov.co/relatoria/${anio}/SU${nnn}-${aa}.htm`;
  return `https://www.corteconstitucional.gov.co/relatoria/${anio}/${t}-${nnn}-${aa}.htm`;
}

export function urlLeySenado(tipo: "ley" | "decreto", numero: number, anio: number): string {
  return `${SENADO}/${tipo}_${String(numero).padStart(4, "0")}_${anio}.html`;
}

const SALAS_CSJ: Record<string, string> = {
  SC: "Civil", STC: "Civil (tutela)", AC: "Civil (auto)", ATC: "Civil (auto de tutela)", SL: "Laboral", STL: "Laboral (tutela)",
  AL: "Laboral (auto)", SP: "Penal", STP: "Penal (tutela)", AP: "Penal (auto)",
};

/** Busca el artículo citado inmediatamente antes de la norma: "artículo 94 del Código General del Proceso", "art. 2536 del C.C.". */
function articuloPrevio(texto: string, inicioNorma: number): { articulo: string; inicio: number } | null {
  const ventana = texto.slice(Math.max(0, inicioNorma - 80), inicioNorma);
  const m = /(?:art[ií]culos?|arts?\.)\s*(\d+[A-Za-z]?(?:\s*(?:,|y|e)\s*\d+[A-Za-z]?)*)(?:\s*(?:,|\()?\s*(?:num(?:eral)?\.?|inc(?:iso)?\.?|par[aá]grafo|lit(?:eral)?\.?)\s*[\w°º]+\)?)*\s*,?\s*(?:del?|de\s+la|de\s+el)?\s*$/i.exec(ventana);
  if (!m) return null;
  return { articulo: m[1]!.replace(/\s+/g, " "), inicio: Math.max(0, inicioNorma - 80) + m.index };
}

function articuloPosterior(texto: string, finNorma: number): { articulo: string; fin: number } | null {
  const ventana = texto.slice(finNorma, finNorma + 40);
  const m = /^\s*,?\s*(?:art[ií]culos?|arts?\.)\s*(\d+[A-Za-z]?)/i.exec(ventana);
  if (!m) return null;
  return { articulo: m[1]!, fin: finNorma + m[0].length };
}

/**
 * Extrae todas las citas de un texto. Devuelve cada ocurrencia (no deduplica)
 * con su posición, para que la auditoría pueda ubicarlas en el borrador.
 */
export function extraerCitas(texto: string): CitaDetectada[] {
  const t = texto ?? "";
  const salida: CitaDetectada[] = [];
  const ocupado: Array<[number, number]> = [];
  const libre = (a: number, b: number) => !ocupado.some(([x, y]) => a < y && b > x);
  const agregar = (c: CitaDetectada) => {
    if (!libre(c.inicio, c.fin)) return;
    ocupado.push([c.inicio, c.fin]);
    salida.push(c);
  };

  // Corte Constitucional: C-836 de 2001 · C-836/01 · SU-611 de 2017 · SU611-17 · T-323 de 2024 · A-038 de 2003
  for (const m of t.matchAll(/\b(?:[Ss]entencia\s+|[Aa]uto\s+)?(SU|C|T|A)\s*[-–]?\s*(\d{1,4})\s*(?:\s+de\s+|\/|-)\s*(\d{2,4})\b/g)) {
    const tipo = m[1]!.toUpperCase();
    const numero = Number(m[2]);
    const anio = anioCompleto(m[3]!);
    if (anio < 1992 || anio > 2100) continue;
    const inicio = m.index! + (m[0].length - m[0].trimStart().length);
    const id = `${tipo}-${String(numero).padStart(3, "0")} de ${anio}`;
    agregar({ clase: "PROVIDENCIA_CC", texto: m[0].trim(), identificador: id, identificadorBase: id, articulo: null, url: urlCorteConstitucional(tipo, numero, anio), estadoUrl: "patrón verificado 2026-09-22", inicio, fin: m.index! + m[0].length, detalle: { tipo, numero, anio } });
  }
  // Corte Suprema: SC370-2023 · STC1234-2024 · SL567-2022
  for (const m of t.matchAll(/\b(SC|STC|STP|STL|SL|SP|AC|ATC|AL|AP)\s*(\d{1,5})\s*[-–]\s*(\d{4})\b/g)) {
    const id = `${m[1]}${m[2]}-${m[3]}`;
    agregar({ clase: "PROVIDENCIA_CSJ", texto: m[0], identificador: id, identificadorBase: id, articulo: null, url: null, estadoUrl: "sin patrón directo: resolver por búsqueda en cortesuprema.gov.co", inicio: m.index!, fin: m.index! + m[0].length, detalle: { sala: SALAS_CSJ[m[1]!] ?? m[1]!, numero: Number(m[2]), anio: Number(m[3]) } });
  }
  // Consejo de Estado: radicado de 23 dígitos (con o sin guiones) y número interno entre paréntesis
  for (const m of t.matchAll(/\b(\d{5})[-\s]?(\d{2})[-\s]?(\d{2})[-\s]?(\d{3})[-\s]?(\d{4})[-\s]?(\d{5})[-\s]?(\d{2})\b(?:\s*\((\d{3,6})\))?/g)) {
    const g = m.slice(1, 8);
    const id = g.join("-");
    agregar({ clase: "PROVIDENCIA_CE", texto: m[0], identificador: id, identificadorBase: id, articulo: null, url: null, estadoUrl: "sin patrón directo: resolver en SAMAI o por búsqueda", inicio: m.index!, fin: m.index! + m[0].length, detalle: { radicado: id, numeroInterno: m[8] ?? null, anioRadicacion: Number(g[4]) } });
  }
  // Leyes y decretos: Ley 1564 de 2012 · Decreto 2591 de 1991 · Decreto Ley 196 de 1971
  for (const m of t.matchAll(/\b(Ley|Decreto(?:\s+Ley|\s+Legislativo|-Ley)?)\s+(?:Estatutaria\s+)?(\d{1,4})\s+de\s+(\d{4})\b/gi)) {
    const esDecreto = /^decreto/i.test(m[1]!);
    const base = `${esDecreto ? "Decreto" : "Ley"} ${Number(m[2])} de ${m[3]}`;
    const previo = articuloPrevio(t, m.index!);
    const posterior = previo ? null : articuloPosterior(t, m.index! + m[0].length);
    const articulo = previo?.articulo ?? posterior?.articulo ?? null;
    const inicio = previo?.inicio ?? m.index!;
    const fin = posterior?.fin ?? m.index! + m[0].length;
    agregar({ clase: "NORMA", texto: t.slice(inicio, fin), identificador: articulo ? `${base}, art. ${articulo}` : base, identificadorBase: base, articulo, url: urlLeySenado(esDecreto ? "decreto" : "ley", Number(m[2]), Number(m[3])), estadoUrl: "patrón de la Secretaría del Senado; confirmar existencia", inicio, fin, detalle: { numero: Number(m[2]), anio: Number(m[3]) } });
  }
  // Códigos citados con artículo: "artículo 94 del CGP", "art. 2536 del Código Civil", "arts. 318 y 322 CGP"
  for (const [re, clave] of ALIAS_CODIGOS) {
    for (const m of t.matchAll(new RegExp(re.source, re.flags))) {
      const previo = articuloPrevio(t, m.index!);
      const posterior = previo ? null : articuloPosterior(t, m.index! + m[0].length);
      const articulo = previo?.articulo ?? posterior?.articulo ?? null;
      const cod = CODIGOS[clave]!;
      const inicio = previo?.inicio ?? m.index!;
      const fin = posterior?.fin ?? m.index! + m[0].length;
      if (!articulo) continue; // la sola mención de un código no es una cita auditable
      agregar({ clase: "CODIGO", texto: t.slice(inicio, fin), identificador: `${cod.base}, art. ${articulo}`, identificadorBase: cod.base, articulo, url: cod.url, estadoUrl: "código oficial (Secretaría del Senado)", inicio, fin, detalle: { codigo: clave } });
    }
  }
  // Conceptos administrativos: "Concepto 12345 de 2020 de la DIAN", "Oficio 23605 de 2015"
  for (const m of t.matchAll(/\b(Concepto|Oficio|Circular(?:\s+Externa)?)\s+(?:No\.?\s*)?(\d{1,6}(?:-\d+)?)\s+de\s+(\d{4})\b/gi)) {
    const id = `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1).toLowerCase()} ${m[2]} de ${m[3]}`;
    agregar({ clase: "CONCEPTO", texto: m[0], identificador: id, identificadorBase: id, articulo: null, url: null, estadoUrl: "resolver en el normograma de la autoridad", inicio: m.index!, fin: m.index! + m[0].length, detalle: { numero: m[2]!, anio: Number(m[3]) } });
  }
  return salida.sort((a, b) => a.inicio - b.inicio);
}

/** Citas únicas por identificador (para resolver cada fuente una sola vez). */
export function citasUnicas(texto: string): CitaDetectada[] {
  const vistos = new Map<string, CitaDetectada>();
  for (const c of extraerCitas(texto)) if (!vistos.has(c.identificador)) vistos.set(c.identificador, c);
  return [...vistos.values()];
}

/** Clave de comparación entre una cita y una fuente registrada (tolerante a formato). */
export function claveIdentificador(id: string): string {
  return id
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/sentencia|auto/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/\b0+(\d)/g, "$1")
    .trim();
}

/** Citas entre comillas «…» o "…" con la fuente citada a continuación (para el cotejo literal). */
export function extraerCitasTextuales(texto: string): Array<{ cita: string; inicio: number; fin: number }> {
  const salida: Array<{ cita: string; inicio: number; fin: number }> = [];
  for (const m of (texto ?? "").matchAll(/[«“"]([^«»“”"]{20,})[»”"]/g)) salida.push({ cita: m[1]!.trim(), inicio: m.index!, fin: m.index! + m[0].length });
  return salida;
}
