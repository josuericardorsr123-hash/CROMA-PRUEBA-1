import {
  AlignmentType, Bookmark, Document, Header, HeadingLevel, InternalHyperlink, LeaderType, Packer, PageBreak,
  Paragraph, Tab, TabStopType, type Table, TextRun,
} from "docx";
import { romano } from "@em/motores";
import {
  ANCHO_UTIL, bloqueADocx, CARTA, type ContadorTablas, estilosBase, firmaEntreGuiones, FUENTE, INTERLINEADO, MARGEN, NEGRO, piePagina, RegistroNotas, SANGRIA, TAB_INDICE, TAMANOS, texto,
} from "./comun";
import type { Bloque, DocumentoInforme, Subseccion } from "./modelo";
import { MARCA_TOC_FIN, MARCA_TOC_INI, posprocesarDocx } from "./ooxml";
import { type EntradaIndice, localizarEncabezados, paginacionDisponible, renderizar } from "./paginacion";

export interface ResultadoInforme {
  docx: Buffer;
  paginas: number | null;
  indice: Array<EntradaIndice & { pagina: number | null }>;
  notasAlPie: number;
  tablas: number;
  pdfVistaPrevia: Buffer | null;
  advertencias: string[];
}

export interface OpcionesInforme {
  /** Paginación real del índice con LibreOffice (por defecto, si está instalado). */
  paginar?: boolean;
  /** Cada sección en romano empieza en página nueva (como el documento de referencia). */
  seccionEnPaginaNueva?: boolean;
}

function entradasIndice(doc: DocumentoInforme): EntradaIndice[] {
  const e: EntradaIndice[] = [];
  const sub = (lista: Subseccion[] | undefined, prefijo: string, idBase: string, nivel: 2 | 3) => {
    (lista ?? []).forEach((s, j) => {
      const num = `${prefijo}.${j + 1}`;
      const id = `${idBase}_${j + 1}`;
      e.push({ id, nivel, texto: `${num} — ${s.titulo}`, iniciaPagina: false });
      if (nivel === 2) sub(s.subsecciones, num, id, 3);
    });
  };
  doc.secciones.forEach((s, i) => {
    e.push({ id: `_Toc_s${i + 1}`, nivel: 1, texto: `${romano(i + 1)}. ${s.titulo.toUpperCase()}`, iniciaPagina: true });
    sub(s.subsecciones, String(i + 1), `_Toc_s${i + 1}`, 2);
  });
  e.push({ id: "_Toc_conclusiones", nivel: 1, texto: "CONCLUSIONES", iniciaPagina: true });
  if (doc.referencias.length) e.push({ id: "_Toc_referencias", nivel: 1, texto: "Referencias", iniciaPagina: true });
  return e;
}

function marca(t: string): TextRun {
  return new TextRun({ text: t, size: 2, color: "FFFFFF", font: FUENTE });
}

/**
 * Número que imprime cada entrada del índice. En la pasada provisional se usa
 * «000» para reservar el ancho de tres dígitos y que el ajuste de líneas sea el
 * mismo que en la versión final; sin paginación real se deja vacío (Word lo
 * completa al actualizar el campo).
 */
type Numeracion = { tipo: "provisional" } | { tipo: "campo" } | { tipo: "real"; paginas: Map<string, number> };

function construir(doc: DocumentoInforme, numeracion: Numeracion, o: Required<OpcionesInforme>): { documento: Document; notas: RegistroNotas; tablas: ContadorTablas } {
  const notas = new RegistroNotas();
  const tablas: ContadorTablas = { n: 0 };
  const entradas = entradasIndice(doc);
  const hijos: Array<Paragraph | Table> = [];
  const agregar = (bs: Bloque[]) => bs.forEach((b) => hijos.push(...bloqueADocx(b, notas, tablas)));

  // ── Portada editorial: título, autor, subtítulo, resumen y palabras clave
  hijos.push(new Paragraph({ spacing: { before: 900 }, children: [] }));
  if (doc.leyenda) hijos.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [texto(doc.leyenda, { negrita: true, tamano: 20 })] }));
  hijos.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320, line: INTERLINEADO.titulo }, children: [texto(doc.titulo, { negrita: true, tamano: TAMANOS.titulo })] }));
  hijos.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 260 }, children: [texto(doc.cargoAutor ? `${doc.autor} – ${doc.cargoAutor}` : doc.autor, { tamano: TAMANOS.autor })] }));
  if (doc.subtitulo) hijos.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 420, line: INTERLINEADO.resumen }, children: [texto(doc.subtitulo, { cursiva: true, tamano: TAMANOS.cuerpo })] }));
  hijos.push(new Paragraph({ keepNext: true, spacing: { after: 140 }, children: [texto("Resumen", { negrita: true, tamano: TAMANOS.cuerpo })] }));
  hijos.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 240, line: INTERLINEADO.resumen }, children: [texto(doc.resumen, { tamano: TAMANOS.resumen })] }));
  hijos.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 320, line: INTERLINEADO.resumen }, children: [texto("Palabras clave: ", { negrita: true, tamano: TAMANOS.resumen }), texto(`${doc.palabrasClave.join("; ")}.`, { tamano: TAMANOS.resumen })] }));

  // ── Tabla de contenido con número de página real (campo TOC con resultado precalculado)
  hijos.push(new Paragraph({ pageBreakBefore: true, spacing: { after: 320 }, keepNext: true, children: [texto("TABLA DE CONTENIDO", { negrita: true, tamano: TAMANOS.seccion })] }));
  entradas.forEach((e, i) => {
    const pagina = numeracion.tipo === "real" ? String(numeracion.paginas.get(e.id) ?? "") : numeracion.tipo === "provisional" ? "000" : "";
    const t = e.nivel === 1 ? TAMANOS.cuerpo : TAMANOS.resumen;
    hijos.push(new Paragraph({
      style: `TOC${e.nivel}`,
      tabStops: [{ type: TabStopType.RIGHT, position: TAB_INDICE, leader: LeaderType.DOT }],
      spacing: e.nivel === 1 ? { before: 120, after: 60 } : { after: 40 },
      indent: { left: e.nivel === 1 ? 0 : e.nivel === 2 ? 240 : 480 },
      children: [
        ...(i === 0 ? [marca(MARCA_TOC_INI)] : []),
        new InternalHyperlink({ anchor: e.id, children: [texto(e.texto, { negrita: e.nivel === 1, tamano: t }), new TextRun({ children: [new Tab(), pagina], font: FUENTE, size: t, color: NEGRO })] }),
        ...(i === entradas.length - 1 ? [marca(MARCA_TOC_FIN)] : []),
      ],
    }));
  });
  hijos.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Cuerpo introductorio (sin numeración)
  agregar(doc.introduccion);

  const encabezado = (e: EntradaIndice, estilo: (typeof HeadingLevel)[keyof typeof HeadingLevel], opciones: { pageBreakBefore?: boolean; before?: number; after: number; tamano: number }) =>
    new Paragraph({
      heading: estilo, keepNext: true, pageBreakBefore: opciones.pageBreakBefore, spacing: { before: opciones.before, after: opciones.after },
      children: [new Bookmark({ id: e.id, children: [texto(e.texto, { negrita: true, tamano: opciones.tamano })] })],
    });

  const porId = new Map(entradas.map((e) => [e.id, e]));
  const subsecciones = (lista: Subseccion[] | undefined, idBase: string, nivel: 2 | 3) => {
    (lista ?? []).forEach((s, j) => {
      const id = `${idBase}_${j + 1}`;
      const e = porId.get(id)!;
      hijos.push(encabezado(e, nivel === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, nivel === 2 ? { before: 400, after: 180, tamano: TAMANOS.subseccion } : { before: 380, after: 160, tamano: TAMANOS.subseccion }));
      agregar(s.bloques);
      if (nivel === 2) subsecciones(s.subsecciones, id, 3);
    });
  };
  doc.secciones.forEach((s, i) => {
    const id = `_Toc_s${i + 1}`;
    hijos.push(encabezado(porId.get(id)!, HeadingLevel.HEADING_1, { pageBreakBefore: o.seccionEnPaginaNueva || i === 0, after: 320, tamano: TAMANOS.seccion }));
    agregar(s.bloques);
    subsecciones(s.subsecciones, id, 2);
  });

  // ── Conclusiones y referencias (sangría francesa, APA simplificado)
  hijos.push(encabezado(porId.get("_Toc_conclusiones")!, HeadingLevel.HEADING_1, { pageBreakBefore: true, after: 320, tamano: TAMANOS.seccion }));
  agregar(doc.conclusiones);
  if (doc.referencias.length) {
    hijos.push(encabezado(porId.get("_Toc_referencias")!, HeadingLevel.HEADING_1, { pageBreakBefore: true, after: 320, tamano: TAMANOS.seccion }));
    for (const r of doc.referencias) hijos.push(new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: SANGRIA, hanging: SANGRIA }, spacing: { after: 120, line: INTERLINEADO.referencias }, children: [texto(r, { tamano: TAMANOS.referencias })] }));
  }
  // ── Firma final centrada entre guiones largos
  hijos.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 720 }, children: [texto(firmaEntreGuiones(doc.firma ?? doc.autor), { tamano: TAMANOS.cuerpo })] }));

  const documento = new Document({
    creator: doc.autor,
    title: doc.titulo,
    subject: doc.metadatos?.asunto,
    keywords: doc.metadatos?.palabrasClave ?? doc.palabrasClave.join("; "),
    description: doc.metadatos?.descripcion ?? doc.resumen.slice(0, 250),
    features: { updateFields: numeracion.tipo !== "real" },
    styles: {
      default: estilosBase(INTERLINEADO.cuerpo),
      paragraphStyles: [
        { id: "TOC1", name: "toc 1", basedOn: "Normal", next: "Normal", run: { font: FUENTE, bold: true, color: NEGRO }, paragraph: { spacing: { before: 120, after: 60 } } },
        { id: "TOC2", name: "toc 2", basedOn: "Normal", next: "Normal", run: { font: FUENTE, size: TAMANOS.resumen, color: NEGRO }, paragraph: { indent: { left: 240 } } },
        { id: "TOC3", name: "toc 3", basedOn: "Normal", next: "Normal", run: { font: FUENTE, size: TAMANOS.resumen, color: NEGRO }, paragraph: { indent: { left: 480 } } },
      ],
    },
    footnotes: notas.notas,
    sections: [{
      properties: { page: { size: { width: CARTA.ancho, height: CARTA.alto }, margin: { top: MARGEN, right: MARGEN, bottom: MARGEN, left: MARGEN, header: 850, footer: 850 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [texto(doc.encabezadoEditorial.toUpperCase(), { tamano: TAMANOS.encabezado })] })] }) },
      footers: { default: piePagina() },
      children: hijos,
    }],
  });
  return { documento, notas, tablas };
}

async function empaquetar(doc: DocumentoInforme, numeracion: Numeracion, o: Required<OpcionesInforme>, totalPaginas: number | null = null) {
  const { documento, notas, tablas } = construir(doc, numeracion, o);
  return { docx: posprocesarDocx(await Packer.toBuffer(documento), { totalPaginas }), notas: notas.total, tablas: tablas.n };
}

/**
 * Genera el informe técnico. Con LibreOffice disponible: (1) maqueta con
 * números provisionales, (2) renderiza y localiza cada encabezado, (3) maqueta
 * con los números reales y (4) verifica que coinciden; si no, corrige y repite.
 */
export async function generarInforme(doc: DocumentoInforme, opciones: OpcionesInforme = {}): Promise<ResultadoInforme> {
  const o: Required<OpcionesInforme> = { paginar: opciones.paginar ?? (await paginacionDisponible()), seccionEnPaginaNueva: opciones.seccionEnPaginaNueva ?? true };
  const entradas = entradasIndice(doc);
  const advertencias: string[] = [];
  if (!o.paginar) {
    const r = await empaquetar(doc, { tipo: "campo" }, o);
    advertencias.push(`${opciones.paginar === false ? "Paginación real desactivada" : "LibreOffice (Writer) no está disponible"}: el índice queda como campo que Word actualiza al abrir, sin números precalculados.`);
    return { docx: r.docx, paginas: null, indice: entradas.map((e) => ({ ...e, pagina: null })), notasAlPie: r.notas, tablas: r.tablas, pdfVistaPrevia: null, advertencias };
  }
  const provisional = await empaquetar(doc, { tipo: "provisional" }, o);
  let render = await renderizar(provisional.docx);
  let mapa = localizarEncabezados(render.textos, entradas, doc.encabezadoEditorial);
  let final = provisional;
  let impreso = mapa; // números que imprime el DOCX devuelto
  let discrepancias: EntradaIndice[] = [];
  for (let intento = 0; intento < 3; intento++) {
    final = await empaquetar(doc, { tipo: "real", paginas: mapa }, o, render.paginas);
    impreso = mapa;
    render = await renderizar(final.docx);
    const verificado = localizarEncabezados(render.textos, entradas, doc.encabezadoEditorial);
    discrepancias = entradas.filter((e) => verificado.get(e.id) !== impreso.get(e.id));
    if (!discrepancias.length) break;
    mapa = verificado;
  }
  if (discrepancias.length) advertencias.push(`El índice no convergió en ${discrepancias.length} entrada(s) (${discrepancias.map((d) => d.texto).join("; ")}); actualice el campo en Word antes de entregar.`);
  const faltantes = entradas.filter((e) => !impreso.has(e.id));
  if (faltantes.length) advertencias.push(`No se localizó la página de: ${faltantes.map((f) => f.texto).join("; ")}.`);
  return { docx: final.docx, paginas: render.paginas, indice: entradas.map((e) => ({ ...e, pagina: impreso.get(e.id) ?? null })), notasAlPie: final.notas, tablas: final.tablas, pdfVistaPrevia: render.pdf, advertencias };
}

export { ANCHO_UTIL };
