import { strFromU8, unzipSync } from "fflate";

/* Inspección estructural de un DOCX generado: control de calidad automático del
 * formato (fuente, tamaños, notas al pie, encabezado, numeración de páginas). */

export interface Inspeccion {
  texto: string;
  fuentes: string[];
  tamanosMedioPunto: number[];
  notasAlPie: number;
  encabezado: string;
  pie: string;
  campoPagina: boolean;
  campoTotalPaginas: boolean;
  campoIndice: boolean;
  marcadores: number;
  hipervinculosInternos: number;
  sangriasFrancesas: number;
  /** Párrafos con sangría de primera línea (la especificación exige cero). */
  sangriasPrimeraLinea: number;
  /** Párrafos de cita en bloque («…») justificados (la especificación exige cero). */
  citasJustificadas: number;
  tamanoPagina: { ancho: number; alto: number } | null;
  margenes: number[];
  colores: string[];
}

const textoDe = (xml: string) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]!).join("");

export function inspeccionarDocx(docx: Buffer): Inspeccion {
  const a = unzipSync(new Uint8Array(docx));
  const leer = (n: string) => (a[n] ? strFromU8(a[n]!) : "");
  const doc = leer("word/document.xml");
  const estilos = leer("word/styles.xml");
  const notas = leer("word/footnotes.xml");
  const encabezados = Object.keys(a).filter((k) => /^word\/header\d*\.xml$/.test(k)).map(leer).join("");
  const pies = Object.keys(a).filter((k) => /^word\/footer\d*\.xml$/.test(k)).map(leer).join("");
  const todo = doc + estilos + notas + encabezados + pies;
  const fuentes = [...new Set([...todo.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]!))];
  const tamanos = [...new Set([...todo.matchAll(/<w:sz w:val="(\d+)"/g)].map((m) => Number(m[1])))].sort((x, y) => x - y);
  const colores = [...new Set([...todo.matchAll(/<w:color w:val="([0-9A-Fa-f]{6}|auto)"/g)].map((m) => m[1]!.toUpperCase()))];
  const pgSz = /<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/.exec(doc);
  const pgMar = /<w:pgMar([^>]*)\/>/.exec(doc);
  const margenes = pgMar ? ["top", "right", "bottom", "left"].map((k) => Number(new RegExp(`w:${k}="(\\d+)"`).exec(pgMar[1]!)?.[1] ?? 0)) : [];
  return {
    texto: textoDe(doc),
    fuentes,
    tamanosMedioPunto: tamanos,
    notasAlPie: [...notas.matchAll(/<w:footnote (?:[^>]*?)w:id="(\d+)"/g)].filter((m) => Number(m[1]) > 0).length,
    encabezado: textoDe(encabezados),
    pie: textoDe(pies),
    campoPagina: /PAGE(?!S)/.test(pies),
    campoTotalPaginas: /NUMPAGES/.test(pies),
    campoIndice: /instrText[^>]*>\s*TOC\b/.test(doc),
    marcadores: (doc.match(/<w:bookmarkStart /g) ?? []).length,
    hipervinculosInternos: (doc.match(/<w:hyperlink [^>]*w:anchor=/g) ?? []).length,
    sangriasFrancesas: (doc.match(/w:hanging="709"/g) ?? []).length,
    sangriasPrimeraLinea: (doc.match(/w:firstLine="[1-9]\d*"/g) ?? []).length,
    citasJustificadas: [...doc.matchAll(/<w:p>(?:(?!<\/w:p>).)*?<\/w:p>/gs)].filter((m) => /<w:t(?: [^>]*)?>«/.test(m[0]) && /<w:jc w:val="both"\/>/.test(m[0])).length,
    tamanoPagina: pgSz ? { ancho: Number(pgSz[1]), alto: Number(pgSz[2]) } : null,
    margenes,
    colores,
  };
}
