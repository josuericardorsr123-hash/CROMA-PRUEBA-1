import {
  AlignmentType, BorderStyle, Footer, FootnoteReferenceRun, type IStylesOptions, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { esFechaValida, fechaLarga } from "@em/motores";
import type { Bloque, NotaPie, Segmento } from "./modelo";

/* Especificación tipográfica (formato del informe técnico del despacho; valores
 * tomados del documento de referencia del usuario). Medidas en DXA (1/20 pt) y
 * tamaños en medios puntos. */
export const FUENTE = "Times New Roman";
export const NEGRO = "000000";
export const CARTA = { ancho: 12240, alto: 15840 };
export const MARGEN = 1417; // 2,5 cm
export const ANCHO_UTIL = CARTA.ancho - 2 * MARGEN; // 9406
export const TAB_INDICE = 9396;
export const SANGRIA = 709; // 1,25 cm (citas en bloque y sangría francesa)

export const TAMANOS = {
  titulo: 34, // 17 pt (16–18)
  autor: 24, // 12 pt (11–12)
  seccion: 26, // 13 pt (12–13)
  subseccion: 24,
  cuerpo: 24, // 12 pt (11–12)
  resumen: 23, // 11,5 pt
  cita: 23,
  atribucion: 20,
  referencias: 22, // 11 pt (10–11)
  nota: 20, // 10 pt
  encabezado: 18, // 9 pt (fuente pequeña)
  pie: 20,
  tabla: 20,
};

export const INTERLINEADO = { cuerpo: 336, resumen: 300, titulo: 340, referencias: 276 };

/**
 * Sustituye TODOS los estilos predeterminados de docx-js (que traen títulos en
 * azul y Calibri) para que ningún elemento, ni siquiera al regenerar el índice en
 * Word, salga de Times New Roman negro.
 */
export function estilosBase(interlineado: number): NonNullable<IStylesOptions["default"]> {
  const negro = { font: FUENTE, color: NEGRO };
  const encabezado = (size: number, outlineLevel: number, spacing: { before?: number; after: number }) => ({ run: { ...negro, size, bold: true }, paragraph: { outlineLevel, keepNext: true, spacing } });
  return {
    document: { run: { ...negro, size: TAMANOS.cuerpo }, paragraph: { spacing: { line: interlineado } } },
    title: { run: { ...negro, size: TAMANOS.titulo, bold: true }, paragraph: { alignment: AlignmentType.CENTER } },
    heading1: encabezado(TAMANOS.seccion, 0, { after: 320 }),
    heading2: encabezado(TAMANOS.subseccion, 1, { before: 400, after: 180 }),
    heading3: encabezado(TAMANOS.subseccion, 2, { before: 380, after: 160 }),
    heading4: encabezado(TAMANOS.cuerpo, 3, { before: 240, after: 120 }),
    heading5: encabezado(TAMANOS.cuerpo, 4, { before: 240, after: 120 }),
    heading6: encabezado(TAMANOS.cuerpo, 5, { before: 240, after: 120 }),
    hyperlink: { run: { ...negro } },
    footnoteText: { run: { ...negro, size: TAMANOS.nota }, paragraph: { spacing: { after: 0, line: 240 } } },
    footnoteTextChar: { run: { ...negro, size: TAMANOS.nota } },
    endnoteText: { run: { ...negro, size: TAMANOS.nota }, paragraph: { spacing: { after: 0, line: 240 } } },
    endnoteTextChar: { run: { ...negro, size: TAMANOS.nota } },
  };
}

export const texto = (t: string, o: Partial<{ negrita: boolean; cursiva: boolean; tamano: number; color: string }> = {}) =>
  new TextRun({ text: t, bold: o.negrita, italics: o.cursiva, size: o.tamano, font: FUENTE, color: o.color ?? NEGRO });

/**
 * Pie de página: solo «Página X de Y», inferior y centrado. Cada campo va en su
 * propio run con formato explícito; en un run compartido, LibreOffice pinta el
 * resultado del campo con el tamaño predeterminado.
 */
export function piePagina(): Footer {
  const run = (o: { text?: string; children?: Array<string | (typeof PageNumber)[keyof typeof PageNumber]> }) => new TextRun({ ...o, font: FUENTE, size: TAMANOS.pie, color: NEGRO });
  return new Footer({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run({ text: "Página " }), run({ children: [PageNumber.CURRENT] }), run({ text: " de " }), run({ children: [PageNumber.TOTAL_PAGES] })] })],
  });
}

/** Registro de notas al pie numeradas en orden de aparición. */
export class RegistroNotas {
  private siguiente = 1;
  readonly notas: Record<string, { children: Paragraph[] }> = {};

  /**
   * La nota identifica la fuente del fragmento exacto al que se ancla. El texto
   * va justificado; la línea de consulta (fecha y enlace) va en párrafo propio
   * alineado a la izquierda, porque una URL indivisible estira la línea
   * justificada que la precede.
   */
  crear(n: NotaPie): FootnoteReferenceRun {
    const id = this.siguiente++;
    const cuerpo = n.texto.trim().replace(/\s*\.?$/, ".");
    const fecha = n.fecha && esFechaValida(n.fecha) ? fechaLarga(n.fecha) : n.fecha;
    const consulta = n.url ? `${fecha ? `Consultado el ${fecha} en ` : "Disponible en "}${n.url}` : fecha ? `Consultado el ${fecha}.` : null;
    const hijos = [new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: consulta && n.url ? 0 : 60, line: 240 }, children: [texto(` ${cuerpo}${consulta && !n.url ? ` ${consulta}` : ""}`, { tamano: TAMANOS.nota })] })];
    if (consulta && n.url) hijos.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 60, line: 240 }, children: [texto(consulta, { tamano: TAMANOS.nota })] }));
    this.notas[String(id)] = { children: hijos };
    return new FootnoteReferenceRun(id);
  }

  get total(): number {
    return this.siguiente - 1;
  }
}

/** Firma final del autor: centrada y entre guiones largos (—Nombre—). */
export function firmaEntreGuiones(nombre: string): string {
  return `—${nombre.replace(/^[\s—–-]+|[\s—–-]+$/g, "")}—`;
}

/** Formato en línea mínimo: **negrita** y *cursiva* dentro de un segmento. */
export function runsDeTexto(t: string, base: { tamano: number; negrita?: boolean; cursiva?: boolean }): TextRun[] {
  const salida: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let ultimo = 0;
  for (const m of t.matchAll(re)) {
    if (m.index! > ultimo) salida.push(texto(t.slice(ultimo, m.index), base));
    const tok = m[0];
    if (tok.startsWith("**")) salida.push(texto(tok.slice(2, -2), { ...base, negrita: true }));
    else salida.push(texto(tok.slice(1, -1), { ...base, cursiva: true }));
    ultimo = m.index! + tok.length;
  }
  if (ultimo < t.length) salida.push(texto(t.slice(ultimo), base));
  return salida.length ? salida : [texto("", base)];
}

export function hijosDeSegmentos(segmentos: Segmento[], notas: RegistroNotas, tamano = TAMANOS.cuerpo): Array<TextRun | FootnoteReferenceRun> {
  const hijos: Array<TextRun | FootnoteReferenceRun> = [];
  for (const s of segmentos) {
    hijos.push(...runsDeTexto(s.texto, { tamano, negrita: s.negrita, cursiva: s.cursiva }));
    if (s.nota) hijos.push(notas.crear(s.nota));
  }
  return hijos;
}

/** Tabla con estilo APA: filete superior grueso, filete bajo el encabezado y filete de cierre. */
export function tablaApa(columnas: string[], filas: string[][], proporciones?: number[]): Table {
  const prop = proporciones && proporciones.length === columnas.length ? proporciones : columnas.map(() => 1);
  const suma = prop.reduce((a, b) => a + b, 0);
  const anchos = prop.map((p) => Math.floor((ANCHO_UTIL * p) / suma));
  anchos[anchos.length - 1]! += ANCHO_UTIL - anchos.reduce((a, b) => a + b, 0);
  const nada = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const celda = (t: string, i: number, fila: number, total: number) => new TableCell({
    width: { size: anchos[i]!, type: WidthType.DXA },
    margins: { top: 70, bottom: 70, left: 90, right: 90 },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "FFFFFF" },
    borders: {
      top: fila === 0 ? { style: BorderStyle.SINGLE, size: 12, color: NEGRO } : nada,
      bottom: fila === 0 ? { style: BorderStyle.SINGLE, size: 6, color: NEGRO } : fila === total - 1 ? { style: BorderStyle.SINGLE, size: 12, color: NEGRO } : nada,
      left: nada, right: nada,
    },
    children: [new Paragraph({ alignment: fila === 0 ? AlignmentType.CENTER : AlignmentType.LEFT, children: runsDeTexto(t ?? "", { tamano: TAMANOS.tabla, negrita: fila === 0 }) })],
  });
  const todas = [columnas, ...filas];
  return new Table({
    width: { size: ANCHO_UTIL, type: WidthType.DXA },
    columnWidths: anchos,
    rows: todas.map((f, r) => new TableRow({ tableHeader: r === 0, cantSplit: true, children: columnas.map((_, i) => celda(String(f[i] ?? ""), i, r, todas.length)) })),
  });
}

export interface ContadorTablas {
  n: number;
}

/** Convierte un bloque del modelo en elementos docx (párrafos y tablas). */
export function bloqueADocx(b: Bloque, notas: RegistroNotas, tablas: ContadorTablas): Array<Paragraph | Table> {
  switch (b.tipo) {
    case "parrafo":
      return [new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 140, line: INTERLINEADO.cuerpo }, children: hijosDeSegmentos(b.segmentos, notas) })];
    case "cita": {
      const atribucion = [texto(`${b.descripcion.trim().replace(/\.?$/, ".")} `, { tamano: TAMANOS.atribucion, cursiva: true }), texto(`${b.fuente.trim()}${b.url ? ` ${b.url}` : ""}`, { tamano: TAMANOS.atribucion })];
      if (b.nota) atribucion.push(notas.crear(b.nota) as unknown as TextRun);
      return [
        // Especificación: justificado en todo el documento EXCEPTO títulos y citas (cita levemente indentada, alineada a la izquierda).
        new Paragraph({ alignment: AlignmentType.LEFT, keepNext: true, keepLines: true, indent: { left: SANGRIA, right: SANGRIA }, spacing: { before: 320, after: 120, line: INTERLINEADO.cuerpo }, children: [texto(`«${b.texto.trim().replace(/^[«"“]|[»"”]$/g, "")}»`, { tamano: TAMANOS.cita, cursiva: true })] }),
        new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: SANGRIA, right: SANGRIA }, spacing: { after: 320 }, children: atribucion }),
      ];
    }
    case "lista":
      return b.items.map((item, i) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: { left: SANGRIA, hanging: 360 }, spacing: { after: 100, line: INTERLINEADO.cuerpo }, children: [texto(b.ordenada ? `${i + 1}. ` : "• ", { tamano: TAMANOS.cuerpo }), ...hijosDeSegmentos(item, notas)] }));
    case "tabla": {
      tablas.n += 1;
      const salida: Array<Paragraph | Table> = [
        new Paragraph({ keepNext: true, spacing: { before: 280, after: 60 }, children: [texto(`Tabla ${tablas.n}`, { negrita: true, tamano: TAMANOS.cuerpo })] }),
        new Paragraph({ keepNext: true, spacing: { after: 160 }, children: [texto(b.titulo, { cursiva: true, tamano: TAMANOS.cuerpo })] }),
        tablaApa(b.columnas, b.filas, b.proporciones),
      ];
      salida.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 80, after: 320 }, children: b.nota ? [texto("Nota. ", { cursiva: true, tamano: TAMANOS.atribucion }), texto(b.nota, { tamano: TAMANOS.atribucion })] : [] }));
      return salida;
    }
  }
}
