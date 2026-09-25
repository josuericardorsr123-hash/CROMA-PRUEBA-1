import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/* Posprocesado del paquete OOXML que docx-js no expone: campo TOC con resultado
 * precalculado, campos de página con resultado en run propio y un ZIP ordenado
 * ([Content_Types].xml primero, sin entradas de directorio). */

export const MARCA_TOC_INI = "QQTOCINIQQ";
export const MARCA_TOC_FIN = "QQTOCFINQQ";

const runConMarca = (marca: string) => new RegExp(`<w:r>(?:(?!<w:r>|</w:r>).)*?${marca}(?:(?!</w:r>).)*?</w:r>`, "s");

/** Sustituye los runs marcadores por el inicio y el fin de un campo TOC de Word (actualizable con F9). */
export function envolverCampoToc(xml: string): string {
  if (!xml.includes(MARCA_TOC_INI)) return xml;
  const inicio = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
  const fin = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const nuevo = xml.replace(runConMarca(MARCA_TOC_INI), inicio).replace(runConMarca(MARCA_TOC_FIN), fin);
  if (nuevo.includes(MARCA_TOC_INI) || nuevo.includes(MARCA_TOC_FIN)) throw new Error("No se pudo construir el campo de la tabla de contenido.");
  return nuevo;
}

/**
 * docx-js emite cada campo simple (PAGE, NUMPAGES) dentro de un único run y sin
 * resultado. Se separa en begin / instrucción / separate / resultado / end, cada
 * uno con el formato del run original, para que ningún visor pinte el número con
 * el tamaño predeterminado del documento.
 */
export function camposConResultado(xml: string, resultados: Record<string, string>): string {
  return xml.replace(
    /<w:r>(<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)?<w:fldChar w:fldCharType="begin"\/><w:instrText xml:space="preserve">([^<]*)<\/w:instrText><w:fldChar w:fldCharType="separate"\/><w:fldChar w:fldCharType="end"\/><\/w:r>/gs,
    (_m, rPr: string | undefined, instr: string) => {
      const p = rPr ?? "";
      const conNoProof = p ? p.replace("</w:rPr>", "<w:noProof/></w:rPr>") : "<w:rPr><w:noProof/></w:rPr>";
      const clave = instr.trim().split(/\s+/)[0]!.toUpperCase();
      const resultado = resultados[clave] ?? "1";
      return `<w:r>${p}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${p}<w:instrText xml:space="preserve">${instr}</w:instrText></w:r><w:r>${p}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${conNoProof}<w:t>${resultado}</w:t></w:r><w:r>${p}<w:fldChar w:fldCharType="end"/></w:r>`;
    },
  );
}

export interface OpcionesPosprocesado {
  /** Total de páginas conocido (paginación real): se usa como resultado de NUMPAGES. */
  totalPaginas?: number | null;
}

export function posprocesarDocx(docx: Buffer, o: OpcionesPosprocesado = {}): Buffer {
  const archivos = unzipSync(new Uint8Array(docx));
  const resultados = { PAGE: "1", NUMPAGES: o.totalPaginas ? String(o.totalPaginas) : "1" };
  const salida: Record<string, Uint8Array> = {};
  const nombres = Object.keys(archivos).filter((n) => !n.endsWith("/"));
  nombres.sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0));
  for (const n of nombres) {
    let contenido = archivos[n]!;
    if (n === "word/document.xml") contenido = strToU8(camposConResultado(envolverCampoToc(strFromU8(contenido)), resultados));
    else if (/^word\/(header|footer)\d*\.xml$/.test(n)) contenido = strToU8(camposConResultado(strFromU8(contenido), resultados));
    salida[n] = contenido;
  }
  return Buffer.from(zipSync(salida, { level: 6 }));
}
