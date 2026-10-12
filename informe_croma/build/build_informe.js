/* Motor del informe DOCX (docx-js 9.x).
 * Uso: node build_informe.js <salida.docx> [paginas.json]
 * El contenido vive en contenido_*.js; aquí solo hay estilo y composición.
 */
const fs = require('fs');
const path = require('path');
const d = require('docx');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer, PageNumber, AlignmentType,
  FootnoteReferenceRun, TabStopType, HeadingLevel, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, VerticalAlign, PageBreak, LevelFormat, TableLayoutType,
} = d;

const AQUI = __dirname;
const DIAG = path.join(AQUI, '..', 'diagramas', 'salida');
const salida = process.argv[2] || path.join(AQUI, '..', 'salida', 'Informe_Croma_Colombia.docx');
const paginas = process.argv[3] && fs.existsSync(process.argv[3]) ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};

// ── Medidas (twips; 1 cm = 567) ───────────────────────────────────────
const PAGINA = { width: 12240, height: 15840 };            // carta
const MARGEN = 1417;                                         // 2,5 cm
const ANCHO = PAGINA.width - 2 * MARGEN;                     // 9406 twips ≈ 16,59 cm
const FUENTE = 'Times New Roman';
const NEGRO = '000000';
const T = {   // tamaños en medios puntos
  titulo: 34, autor: 24, subtitulo: 24, h1: 26, h2: 24, h3: 23, cuerpo: 23,
  tabla: 18, tablaPeq: 16, nota: 18, ref: 21, cabecera: 18, leyenda: 20, cita: 23,
};
const INTERLINEA = 276;   // 1,15
const ESP = { parrafo: 120, antesH1: 480, despuesH1: 160, antesH2: 300, despuesH2: 120, antesCita: 280 };

// ── Notas al pie ──────────────────────────────────────────────────────
const notas = {};
let siguienteNota = 1;
function nota(texto) {
  const id = siguienteNota++;
  notas[id] = { children: [new Paragraph({ spacing: { after: 40, line: 240 }, children: runs(texto, { size: T.nota, enNota: true }) })] };
  return new FootnoteReferenceRun(id);
}

// ── Marcado en línea: **negrita**, *cursiva*, `código`, [^nota] ───────
function runs(texto, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+?`|\[\^[\s\S]+?\^\])/g;
  let ult = 0, m;
  const mk = (t, extra = {}) => new TextRun({ text: t, font: FUENTE, color: NEGRO, size: base.size || T.cuerpo,
    bold: base.bold, italics: base.italics, ...extra });
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ult) out.push(mk(texto.slice(ult, m.index)));
    const tok = m[0];
    if (tok.startsWith('[^')) {
      if (!base.enNota) out.push(nota(tok.slice(2, -2).trim()));
    } else if (tok.startsWith('**')) out.push(mk(tok.slice(2, -2), { bold: true }));
    else if (tok.startsWith('`')) out.push(mk(tok.slice(1, -1), { italics: !base.italics }));
    else out.push(mk(tok.slice(1, -1), { italics: !base.italics }));
    ult = m.index + tok.length;
  }
  if (ult < texto.length) out.push(mk(texto.slice(ult)));
  return out;
}

// ── Bloques ───────────────────────────────────────────────────────────
const toc = [];           // {nivel, texto, clave}
let nFigura = 0, nTabla = 0;

function P(texto, o = {}) {
  return new Paragraph({
    alignment: o.align || AlignmentType.JUSTIFIED,
    spacing: { after: o.after ?? ESP.parrafo, before: o.before || 0, line: o.line || INTERLINEA },
    indent: o.indent, keepNext: o.keepNext, keepLines: o.keepLines,
    children: runs(texto, { size: o.size, bold: o.bold, italics: o.italics }),
  });
}

function encabezado(nivel, num, texto, o = {}) {
  const etiqueta = nivel === 1 ? (num ? `${num}. ${texto}` : texto)
    : (num ? `${num} — ${texto}` : texto);
  const clave = `h${toc.length}`;
  toc.push({ nivel, texto: etiqueta, clave });
  const tam = nivel === 1 ? T.h1 : nivel === 2 ? T.h2 : T.h3;
  return new Paragraph({
    heading: nivel === 1 ? HeadingLevel.HEADING_1 : nivel === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    alignment: AlignmentType.LEFT,
    pageBreakBefore: !!o.nuevaPagina,
    keepNext: true, keepLines: true,
    spacing: {
      before: o.nuevaPagina ? 0 : (nivel === 1 ? ESP.antesH1 : ESP.antesH2),
      after: nivel === 1 ? ESP.despuesH1 : ESP.despuesH2, line: 240,
    },
    children: [new TextRun({ text: etiqueta, font: FUENTE, color: NEGRO, size: tam, bold: true })],
  });
}

function vinetas(items, o = {}) {
  return items.map((t) => new Paragraph({
    numbering: { reference: o.numerada ? 'numeros' : 'vinetas', level: 0, instance: o.instancia },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 60, line: INTERLINEA },
    children: runs(t, { size: o.size }),
  }));
}
let instanciaNum = 1;
function numerada(items, o = {}) { return vinetas(items, { ...o, numerada: true, instancia: instanciaNum++ }); }

function cita(texto, referencia) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { left: 851, right: 851 },
      spacing: { before: ESP.antesCita, after: 80, line: INTERLINEA },
      keepNext: true,
      children: runs(`«${texto}»`, { italics: true, size: T.cita }),
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { left: 851, right: 851 },
      spacing: { after: ESP.antesCita, line: 240 },
      children: runs(referencia, { size: T.ref }),
    }),
  ];
}

function rotulo(tipo, titulo, o = {}) {
  const n = tipo === 'Figura' ? ++nFigura : ++nTabla;
  return new Paragraph({
    alignment: AlignmentType.LEFT, keepNext: true,
    spacing: { before: o.before ?? 200, after: 80, line: 240 },
    children: [
      new TextRun({ text: `${tipo} ${n}. `, font: FUENTE, color: NEGRO, size: T.leyenda, bold: true }),
      ...runs(titulo, { size: T.leyenda, italics: true }),
    ],
  });
}

const BORDE = { style: BorderStyle.SINGLE, size: 4, color: '8C8C8C' };
const BORDES = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };

function tabla({ titulo, anchos, cabecera, filas, size = T.tabla, alinear = [], sinRotulo = false, nota: notaTabla, juntas }) {
  // Control de viudas y huérfanas en tablas: la cabecera viaja con las tres primeras filas y las tres
  // últimas filas viajan juntas con la nota; las tablas de hasta seis filas no se parten.
  const n = filas.length;
  const unir = (k) => (juntas ?? n <= 6) || k < 2 || (k >= n - 3 && (k < n - 1 || !!notaTabla));
  const total = anchos.reduce((a, b) => a + b, 0);
  const esc = ANCHO / total;
  const w = anchos.map((x) => Math.round(x * esc));
  w[w.length - 1] = ANCHO - w.slice(0, -1).reduce((a, b) => a + b, 0);
  const celda = (txt, i, cab, kn) => new TableCell({
    width: { size: w[i], type: WidthType.DXA },
    borders: BORDES,
    shading: cab ? { fill: 'E6E6E6', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    verticalAlign: VerticalAlign.CENTER,
    children: String(txt).split('\n').map((linea) => new Paragraph({
      alignment: cab ? AlignmentType.LEFT : (alinear[i] || AlignmentType.LEFT),
      spacing: { after: 0, line: 240 }, keepNext: kn, keepLines: true,
      children: runs(linea, { size, bold: cab }),
    })),
  });
  const out = [];
  if (!sinRotulo) out.push(rotulo('Tabla', titulo));
  out.push(new Table({
    width: { size: ANCHO, type: WidthType.DXA },
    columnWidths: w,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: cabecera.map((c, i) => celda(c, i, true, true)) }),
      ...filas.map((f, k) => new TableRow({ cantSplit: true,
        children: f.map((c, i) => celda(c, i, false, unir(k) && (k < n - 1 || !!notaTabla))) })),
    ],
  }));
  out.push(new Paragraph({
    spacing: { before: 60, after: 200, line: 240 }, alignment: AlignmentType.LEFT,
    children: notaTabla ? runs(`*Nota.* ${notaTabla}`, { size: T.nota }) : [],
  }));
  return out;
}

function caja(lineas) {   // recuadro sobrio para plantillas
  return [new Table({
    width: { size: ANCHO, type: WidthType.DXA }, columnWidths: [ANCHO], layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [new TableCell({
      width: { size: ANCHO, type: WidthType.DXA }, borders: BORDES,
      shading: { fill: 'F4F4F4', type: ShadingType.CLEAR, color: 'auto' },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children: lineas.map((l) => new Paragraph({ spacing: { after: 60, line: 252 }, alignment: AlignmentType.LEFT,
        children: runs(l, { size: 21 }) })),
    })] })],
  }), new Paragraph({ spacing: { after: 160 }, children: [] })];
}

function medidasSvg(clave) {
  const svg = fs.readFileSync(path.join(DIAG, `${clave}.svg`), 'utf8').slice(0, 3000);
  const w = parseFloat(svg.match(/width="([\d.]+)pt"/)[1]) / 72;
  const h = parseFloat(svg.match(/height="([\d.]+)pt"/)[1]) / 72;
  return { w, h };
}

function figura(clave, titulo, notaFig, o = {}) {
  const { w, h } = medidasSvg(clave);
  const maxW = 6.45, maxH = o.maxH || 7.55;           // pulgadas útiles en la página
  const esc = Math.min(maxW / w, maxH / h, 1);
  const px = (inch) => Math.round(inch * 96);
  return [
    rotulo('Figura', titulo, { before: 60 }),
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 60 },
      children: [new ImageRun({
        type: 'svg', data: fs.readFileSync(path.join(DIAG, `${clave}.svg`)),
        fallback: { type: 'png', data: fs.readFileSync(path.join(DIAG, `${clave}.png`)) },
        transformation: { width: px(w * esc), height: px(h * esc) },
        altText: { title: titulo, description: `Diagrama ${clave}: ${titulo}`, name: clave },
      })],
    }),
    new Paragraph({ spacing: { after: 120, line: 240 }, alignment: AlignmentType.JUSTIFIED,
      children: runs(`*Nota.* ${notaFig}`, { size: T.nota }) }),
  ];
}

function saltoPagina() { return new Paragraph({ children: [new PageBreak()] }); }
function espacio(after = 240) { return new Paragraph({ spacing: { after }, children: [] }); }

function firma(nombre) {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480, after: 240 },
    children: [new TextRun({ text: `—${nombre}—`, font: FUENTE, color: NEGRO, size: T.autor })] });
}

function referencias(lista) {
  return lista.map((r) => new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left: 709, hanging: 709 },                // sangría francesa 1,25 cm
    spacing: { after: 100, line: INTERLINEA },
    children: runs(r, { size: T.ref }),
  }));
}

function indice() {
  const out = [];
  for (const e of toc) {
    if (e.nivel > 2) continue;
    const pag = paginas[e.texto] ? String(paginas[e.texto]) : '—';
    out.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: ANCHO, leader: 'dot' }],
      indent: e.nivel === 2 ? { left: 425 } : undefined,
      spacing: { before: e.nivel === 1 ? 100 : 0, after: e.nivel === 1 ? 30 : 10, line: 240 },
      children: [
        new TextRun({ text: e.texto, font: FUENTE, color: NEGRO, size: e.nivel === 1 ? 21 : 20, bold: e.nivel === 1 }),
        new TextRun({ text: `\t${pag}`, font: FUENTE, color: NEGRO, size: e.nivel === 1 ? 21 : 20, bold: e.nivel === 1 }),
      ],
    }));
  }
  return out;
}

// ── Contexto para el contenido ────────────────────────────────────────
const datos = (f) => JSON.parse(fs.readFileSync(path.join(AQUI, 'datos', f), 'utf8'));
const ctx = {
  P, H1: (n, t, o) => encabezado(1, n, t, o), H2: (n, t, o) => encabezado(2, n, t, o), H3: (n, t, o) => encabezado(3, n, t, o),
  vinetas, numerada, cita, tabla, caja, figura, saltoPagina, espacio, firma, referencias,
  AlignmentType, T, datos, ANCHO,
};

const contenido = [
  ...require('./contenido_a.js')(ctx),
  ...require('./contenido_b.js')(ctx),
  ...require('./contenido_c.js')(ctx),
];
// El índice se arma al final (necesita todos los encabezados) y se inserta en su marcador.
const pos = contenido.findIndex((x) => x === 'INDICE');
contenido.splice(pos, 1, ...indice());

const ENCABEZADO = 'Cuadernos LegalTech Colombia · Informe técnico · Datos públicos e inteligencia artificial · 12 de octubre de 2026';

const doc = new Document({
  creator: 'Josué Ricardo Rojas Silva',
  title: 'Croma, la API de datos de gobierno: arquitectura, atajos, límites y productos en Colombia',
  description: 'Informe técnico sobre la API y el servidor MCP de Croma con foco en Colombia',
  styles: {
    default: { document: { run: { font: FUENTE, size: T.cuerpo, color: NEGRO } } },
    paragraphStyles: [
      { id: 'PiePagina', name: 'Pie de pagina', basedOn: 'Normal', quickFormat: true,
        run: { size: T.cabecera, font: FUENTE, color: NEGRO }, paragraph: { spacing: { before: 0, after: 0 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: T.h1, bold: true, font: FUENTE, color: NEGRO }, paragraph: { outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: T.h2, bold: true, font: FUENTE, color: NEGRO }, paragraph: { outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: T.h3, bold: true, font: FUENTE, color: NEGRO }, paragraph: { outlineLevel: 2 } },
      { id: 'FootnoteText', name: 'footnote text', basedOn: 'Normal',
        run: { size: T.nota, font: FUENTE, color: NEGRO }, paragraph: { spacing: { after: 40, line: 240 } } },
    ],
  },
  numbering: {
    config: [
      { reference: 'vinetas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 567, hanging: 283 } }, run: { font: FUENTE } } }] },
      { reference: 'numeros', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 567, hanging: 340 } }, run: { font: FUENTE } } }] },
    ],
  },
  footnotes: notas,
  sections: [{
    properties: {
      page: { size: PAGINA, margin: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN, header: 708, footer: 708 } },
    },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 },
      children: [new TextRun({ text: ENCABEZADO, font: FUENTE, color: NEGRO, size: T.cabecera })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, style: 'PiePagina',
      children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], font: FUENTE, color: NEGRO, size: T.cabecera })] })] }) },
    children: contenido,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, buf);
  fs.writeFileSync(path.join(AQUI, 'datos', 'toc.json'), JSON.stringify(toc, null, 1));
  console.log(`OK ${salida} · ${toc.length} encabezados · ${siguienteNota - 1} notas · ${nFigura} figuras · ${nTabla} tablas`);
});
