import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { conDirectorioTemporal, convertirAPdf, paginasPdf, renderizarPagina, textoPagina } from "./herramientas";
import type { ArchivoRecibido } from "./recepcion";

/* Fase 2 · preparación de la lectura íntegra. Cada página se entrega con su
 * texto embebido y, cuando es un escaneo (sin texto útil), con su imagen para
 * lectura visual. Nunca se da un documento por ilegible sin haberlo intentado. */

export interface PaginaPreparada {
  pagina: number;
  texto: string;
  metodo: "TEXTO_EMBEBIDO" | "LECTURA_VISUAL";
  imagen: { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string } | null;
}

export interface DocumentoPreparado {
  pdfCanonico: Buffer | null;
  paginas: PaginaPreparada[];
  notas: string[];
}

/** Umbral de caracteres útiles por debajo del cual una página se considera escaneada. */
export const UMBRAL_TEXTO_UTIL = 80;

function caracteresUtiles(t: string): number {
  return (t.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

export async function prepararDocumento(a: ArchivoRecibido, opciones: { dpi?: number; maxPaginas?: number } = {}): Promise<DocumentoPreparado> {
  const notas: string[] = [];
  if (a.clase === "IMAGEN") {
    return { pdfCanonico: null, paginas: [{ pagina: 1, texto: "", metodo: "LECTURA_VISUAL", imagen: { mediaType: a.mime as "image/png", base64: a.contenido.toString("base64") } }], notas };
  }
  if (a.clase === "TEXTO") {
    const texto = a.contenido.toString("utf8");
    const bloques = texto.match(/[\s\S]{1,6000}(?=\n|$)/g) ?? [texto];
    return { pdfCanonico: null, paginas: bloques.map((t, i) => ({ pagina: i + 1, texto: t.trim(), metodo: "TEXTO_EMBEBIDO" as const, imagen: null })), notas };
  }
  let pdf: Buffer;
  if (a.clase === "OFIMATICA") {
    pdf = await convertirAPdf(a.contenido, a.nombre);
    notas.push("Convertido a PDF con LibreOffice para lectura y foliación.");
  } else {
    pdf = a.pdfDescifrado ?? a.contenido;
  }
  return conDirectorioTemporal(async (dir) => {
    const ruta = join(dir, "doc.pdf");
    await writeFile(ruta, pdf);
    const total = await paginasPdf(ruta);
    const limite = Math.min(total, opciones.maxPaginas ?? 2000);
    if (limite < total) notas.push(`Se prepararon ${limite} de ${total} páginas (límite configurado).`);
    const paginas: PaginaPreparada[] = [];
    for (let p = 1; p <= limite; p++) {
      const texto = await textoPagina(ruta, p);
      if (caracteresUtiles(texto) >= UMBRAL_TEXTO_UTIL) {
        paginas.push({ pagina: p, texto, metodo: "TEXTO_EMBEBIDO", imagen: null });
      } else {
        const png = await renderizarPagina(ruta, p, opciones.dpi ?? 150);
        paginas.push({ pagina: p, texto, metodo: "LECTURA_VISUAL", imagen: { mediaType: "image/png", base64: png.toString("base64") } });
      }
    }
    return { pdfCanonico: pdf, paginas, notas };
  });
}

/** Agrupa páginas en lotes para la lectura por IA (menos llamadas, contexto acotado). */
export function lotesDePaginas(paginas: PaginaPreparada[], maxPorLote = 8, maxCaracteres = 60_000): PaginaPreparada[][] {
  const lotes: PaginaPreparada[][] = [];
  let actual: PaginaPreparada[] = [];
  let caracteres = 0;
  for (const p of paginas) {
    const peso = p.imagen ? 4000 : p.texto.length;
    if (actual.length && (actual.length >= maxPorLote || caracteres + peso > maxCaracteres)) {
      lotes.push(actual);
      actual = [];
      caracteres = 0;
    }
    actual.push(p);
    caracteres += peso;
  }
  if (actual.length) lotes.push(actual);
  return lotes;
}
