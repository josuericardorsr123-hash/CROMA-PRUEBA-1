import { AlignmentType, Document, Header, Packer, Paragraph, type Table } from "docx";
import { romano } from "@em/motores";
import { bloqueADocx, CARTA, type ContadorTablas, estilosBase, hijosDeSegmentos, MARGEN, piePagina, RegistroNotas, TAMANOS, texto } from "./comun";
import type { DocumentoPieza } from "./modelo";
import { posprocesarDocx } from "./ooxml";

export interface ResultadoPieza {
  docx: Buffer;
  notasAlPie: number;
  secciones: number;
}

const LINEA = 312; // interlineado 1,3 (estándar de piezas radicables del despacho)

/**
 * Pieza procesal (demanda, contestación, tutela, petición, recursos…). En modo
 * BORRADOR lleva encabezado de revisión y la advertencia final; en modo
 * RADICABLE (solo tras la aprobación del ABOGADO (USUARIO)) sale limpia, con su
 * firma y sus datos profesionales.
 */
export async function generarPieza(p: DocumentoPieza): Promise<ResultadoPieza> {
  const notas = new RegistroNotas();
  const tablas: ContadorTablas = { n: 0 };
  const hijos: Array<Paragraph | Table> = [];
  const parrafo = (t: string, o: { negrita?: boolean; after?: number; alineacion?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
    new Paragraph({ alignment: o.alineacion ?? AlignmentType.LEFT, spacing: { after: o.after ?? 0, line: LINEA }, children: [texto(t, { negrita: o.negrita, tamano: TAMANOS.cuerpo })] });

  hijos.push(parrafo(p.ciudadFecha, { after: 360 }));
  p.destinatario.forEach((l, i) => hijos.push(parrafo(l, { negrita: i === 1, after: i === p.destinatario.length - 1 ? 360 : 0 })));
  for (const r of p.referencia) hijos.push(new Paragraph({ spacing: { after: 40, line: LINEA }, indent: { left: 2835, hanging: 2835 }, children: [texto(`${r.etiqueta}: `, { negrita: true, tamano: TAMANOS.cuerpo }), texto(r.valor, { tamano: TAMANOS.cuerpo })] }));
  hijos.push(new Paragraph({ spacing: { before: 200, after: 360, line: LINEA }, indent: { left: 2835, hanging: 2835 }, children: [texto("Asunto: ", { negrita: true, tamano: TAMANOS.cuerpo }), texto(p.asunto, { negrita: true, tamano: TAMANOS.cuerpo })] }));
  hijos.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 240, line: LINEA }, children: hijosDeSegmentos(p.apertura, notas) }));

  let n = 0;
  for (const b of p.cuerpo) {
    if (b.titulo) {
      if (b.numerado === "ROMANO") n += 1;
      hijos.push(new Paragraph({ keepNext: true, spacing: { before: 320, after: 160, line: LINEA }, children: [texto(b.numerado === "ROMANO" ? `${romano(n)}. ${b.titulo.toUpperCase()}` : b.titulo.toUpperCase(), { negrita: true, tamano: TAMANOS.cuerpo })] }));
    }
    for (const bloque of b.bloques) hijos.push(...bloqueADocx(bloque, notas, tablas));
  }

  // Cierre y bloque de firma inseparables: nunca queda una línea de la firma sola en otra página.
  hijos.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, keepNext: true, spacing: { before: 240, after: 120, line: LINEA }, children: [texto(p.cierre, { tamano: TAMANOS.cuerpo })] }));
  hijos.push(new Paragraph({ keepNext: true, spacing: { before: 900 }, alignment: AlignmentType.CENTER, children: [texto("________________________________________", { tamano: TAMANOS.cuerpo })] }));
  const lineasFirma = [p.firma.identificacion, p.firma.tarjeta, p.firma.calidad, p.firma.contacto].filter(Boolean) as string[];
  hijos.push(new Paragraph({ keepNext: lineasFirma.length > 0, alignment: AlignmentType.CENTER, children: [texto(`- ${p.firma.nombre} -`, { negrita: true, tamano: TAMANOS.cuerpo })] }));
  lineasFirma.forEach((l, i) => hijos.push(new Paragraph({ keepNext: i < lineasFirma.length - 1, alignment: AlignmentType.CENTER, children: [texto(l, { tamano: 22 })] })));

  if (p.modo === "BORRADOR" && p.advertencia) {
    // Separación por espacio, no por líneas (misma regla visual del informe).
    hijos.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED, spacing: { before: 720, line: 264 },
      children: [texto("ADVERTENCIA: ", { negrita: true, tamano: 19 }), texto(p.advertencia, { tamano: 19 })],
    }));
  }

  const documento = new Document({
    creator: p.firma.nombre,
    title: p.titulo,
    styles: { default: estilosBase(LINEA) },
    footnotes: notas.notas,
    sections: [{
      properties: { page: { size: { width: CARTA.ancho, height: CARTA.alto }, margin: { top: MARGEN, right: MARGEN, bottom: MARGEN, left: MARGEN, header: 708, footer: 708 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: p.modo === "BORRADOR" ? [texto("BORRADOR PARA REVISIÓN DEL ABOGADO (USUARIO) · NO RADICAR", { negrita: true, tamano: 16 })] : [] })] }) },
      footers: { default: piePagina() },
      children: hijos,
    }],
  });
  return { docx: posprocesarDocx(await Packer.toBuffer(documento)), notasAlPie: notas.total, secciones: n };
}
