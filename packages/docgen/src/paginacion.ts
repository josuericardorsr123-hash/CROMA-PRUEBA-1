import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { capacidadesDocumentales, conDirectorioTemporal, convertirAPdf, paginasPdf, textoPagina } from "@em/documentos";

/* Paginación real con LibreOffice: se renderiza el DOCX a PDF y se localiza en
 * qué página comienza cada encabezado, para imprimir un índice con números de
 * página verdaderos (no un campo vacío que dependa de que Word lo actualice). */

export interface EntradaIndice {
  id: string;
  nivel: 1 | 2 | 3;
  texto: string;
  /** Los encabezados de nivel 1 empiezan página: se buscan al inicio del cuerpo. */
  iniciaPagina: boolean;
}

export interface Render {
  paginas: number;
  textos: string[];
  pdf: Buffer;
}

export async function renderizar(docx: Buffer): Promise<Render> {
  const pdf = await convertirAPdf(docx, "documento.docx");
  return conDirectorioTemporal(async (dir) => {
    const ruta = join(dir, "d.pdf");
    await writeFile(ruta, pdf);
    const n = await paginasPdf(ruta);
    const textos: string[] = [];
    for (let p = 1; p <= n; p++) textos.push(await textoPagina(ruta, p));
    return { paginas: n, textos, pdf };
  });
}

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function lineasCuerpo(t: string, encabezado: string): string[] {
  const enc = norm(encabezado).slice(0, 30);
  return t.split("\n").map((l) => l.trim()).filter((l) => l && !(enc && norm(l).startsWith(enc)));
}

function coincideEnLinea(lineas: string[], i: number, objetivo: string): boolean {
  if (lineas[i]!.includes("....") || lineas[i]!.includes("…")) return false;
  const ventana = norm(lineas.slice(i, i + 3).join(" "));
  return ventana.startsWith(objetivo);
}

/**
 * Página en que empieza cada entrada. Los niveles 1 se buscan como primera línea
 * del cuerpo de la página (empiezan página); los niveles 2 y 3, en orden, desde
 * la página de la entrada anterior. Las líneas con puntos guía (el propio índice)
 * nunca cuentan como encabezado.
 */
export function localizarEncabezados(textos: string[], entradas: EntradaIndice[], encabezadoEditorial: string): Map<string, number> {
  const mapa = new Map<string, number>();
  let desde = 0;
  for (const e of entradas) {
    const objetivo = norm(e.texto).slice(0, 60);
    for (let p = desde; p < textos.length; p++) {
      const lineas = lineasCuerpo(textos[p]!, encabezadoEditorial);
      const hallado = e.iniciaPagina ? lineas.length > 0 && coincideEnLinea(lineas, 0, objetivo) : lineas.some((_, i) => coincideEnLinea(lineas, i, objetivo));
      if (hallado) {
        mapa.set(e.id, p + 1);
        desde = p;
        break;
      }
    }
  }
  return mapa;
}

export async function paginacionDisponible(): Promise<boolean> {
  const c = await capacidadesDocumentales();
  return c.soffice && c.pdftotext && c.pdfinfo;
}
