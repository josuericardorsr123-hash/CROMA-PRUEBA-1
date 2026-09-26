/* Generador mínimo de PDF (sin dependencias) para accesorios de prueba, la
 * demostración y la conversión de imágenes PNG a PDF (anexos escaneados).
 * Texto: Helvetica con WinAnsiEncoding (tildes y eñes). Imagen: PNG de 8 bits
 * sin entrelazado incrustado con FlateDecode y predictor PNG. */

function latin1(t: string): string {
  return t.normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x00-\xff]/g, "?");
}

function escaparCadena(t: string): string {
  return latin1(t).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function ensamblar(objetos: Array<Buffer | string>): Buffer {
  const partes: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets: number[] = [];
  let pos = partes[0]!.length;
  objetos.forEach((o, i) => {
    offsets.push(pos);
    const cuerpo = typeof o === "string" ? Buffer.from(o, "latin1") : o;
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), cuerpo, Buffer.from("\nendobj\n", "latin1")]);
    partes.push(b);
    pos += b.length;
  });
  const xref = [`xref\n0 ${objetos.length + 1}\n`, "0000000000 65535 f \n", ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
  return Buffer.concat(partes);
}

/** PDF de texto: una lista de líneas por página (carta, 612 × 792 pt). */
export function pdfDeTexto(paginas: string[][], tamano = 11): Buffer {
  const n = paginas.length;
  const objetos: Array<Buffer | string> = [];
  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = paginas.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objetos.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  paginas.forEach((lineas, i) => {
    const contenido = [`BT /F1 ${tamano} Tf ${Math.round(tamano * 1.35)} TL 60 740 Td`, ...lineas.map((l, j) => `${j ? "T* " : ""}(${escaparCadena(l)}) Tj`), "ET"].join("\n");
    const flujo = Buffer.from(contenido, "latin1");
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objetos.push(Buffer.concat([Buffer.from(`<< /Length ${flujo.length} >>\nstream\n`, "latin1"), flujo, Buffer.from("\nendstream", "latin1")]));
  });
  return ensamblar(objetos);
}

interface InfoPng {
  ancho: number;
  alto: number;
  profundidad: number;
  tipoColor: number;
  idat: Buffer;
}

export function leerPng(png: Buffer): InfoPng {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error("No es un PNG");
  let p = 8;
  let ancho = 0, alto = 0, profundidad = 0, tipoColor = 0, entrelazado = 0;
  const idat: Buffer[] = [];
  while (p < png.length) {
    const largo = png.readUInt32BE(p);
    const tipo = png.subarray(p + 4, p + 8).toString("latin1");
    const datos = png.subarray(p + 8, p + 8 + largo);
    if (tipo === "IHDR") {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      profundidad = datos[8]!;
      tipoColor = datos[9]!;
      entrelazado = datos[12]!;
    } else if (tipo === "IDAT") idat.push(Buffer.from(datos));
    else if (tipo === "IEND") break;
    p += 12 + largo;
  }
  if (entrelazado) throw new Error("PNG entrelazado no soportado");
  if (profundidad !== 8 || ![0, 2].includes(tipoColor)) throw new Error("Solo PNG de 8 bits en escala de grises o RGB sin transparencia");
  return { ancho, alto, profundidad, tipoColor, idat: Buffer.concat(idat) };
}

/** PDF con una imagen PNG por página (simula un escaneo sin capa de texto). */
export function pdfDeImagenesPng(pngs: Buffer[]): Buffer {
  const objetos: Array<Buffer | string> = [];
  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  objetos.push(`<< /Type /Pages /Kids [${pngs.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${pngs.length} >>`);
  pngs.forEach((png, i) => {
    const info = leerPng(png);
    const colores = info.tipoColor === 2 ? 3 : 1;
    const escala = Math.min(612 / info.ancho, 792 / info.alto);
    const w = Math.round(info.ancho * escala);
    const h = Math.round(info.alto * escala);
    const contenido = Buffer.from(`q ${w} 0 0 ${h} ${Math.round((612 - w) / 2)} ${Math.round((792 - h) / 2)} cm /Im0 Do Q`, "latin1");
    const base = 3 + i * 3;
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${base + 2} 0 R >> >> /Contents ${base + 1} 0 R >>`);
    objetos.push(Buffer.concat([Buffer.from(`<< /Length ${contenido.length} >>\nstream\n`, "latin1"), contenido, Buffer.from("\nendstream", "latin1")]));
    objetos.push(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${info.ancho} /Height ${info.alto} /ColorSpace /${colores === 3 ? "DeviceRGB" : "DeviceGray"} /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colores} /BitsPerComponent 8 /Columns ${info.ancho} >> /Length ${info.idat.length} >>\nstream\n`, "latin1"),
      info.idat,
      Buffer.from("\nendstream", "latin1"),
    ]));
  });
  return ensamblar(objetos);
}

/** Dimensiones y componentes de color de un JPEG (marcadores SOF0 a SOF15, salvo DHT/JPG/DAC). */
export function leerJpeg(jpeg: Buffer): { ancho: number; alto: number; componentes: number } {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("No es un JPEG");
  let p = 2;
  while (p + 9 < jpeg.length) {
    if (jpeg[p] !== 0xff) {
      p += 1;
      continue;
    }
    const marcador = jpeg[p + 1]!;
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      p += 2;
      continue;
    }
    const largo = jpeg.readUInt16BE(p + 2);
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { alto: jpeg.readUInt16BE(p + 5), ancho: jpeg.readUInt16BE(p + 7), componentes: jpeg[p + 9]! };
    }
    p += 2 + largo;
  }
  throw new Error("JPEG sin marcador de inicio de cuadro (SOF)");
}

/** PDF con una imagen JPEG por página, incrustada sin recomprimir (DCTDecode). */
export function pdfDeImagenesJpeg(jpegs: Buffer[]): Buffer {
  const objetos: Array<Buffer | string> = [];
  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  objetos.push(`<< /Type /Pages /Kids [${jpegs.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${jpegs.length} >>`);
  jpegs.forEach((jpeg, i) => {
    const info = leerJpeg(jpeg);
    const espacio = info.componentes === 1 ? "DeviceGray" : info.componentes === 4 ? "DeviceCMYK" : "DeviceRGB";
    const escala = Math.min(612 / info.ancho, 792 / info.alto);
    const w = Math.round(info.ancho * escala);
    const h = Math.round(info.alto * escala);
    const contenido = Buffer.from(`q ${w} 0 0 ${h} ${Math.round((612 - w) / 2)} ${Math.round((792 - h) / 2)} cm /Im0 Do Q`, "latin1");
    const base = 3 + i * 3;
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${base + 2} 0 R >> >> /Contents ${base + 1} 0 R >>`);
    objetos.push(Buffer.concat([Buffer.from(`<< /Length ${contenido.length} >>\nstream\n`, "latin1"), contenido, Buffer.from("\nendstream", "latin1")]));
    objetos.push(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${info.ancho} /Height ${info.alto} /ColorSpace /${espacio} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, "latin1"),
      jpeg,
      Buffer.from("\nendstream", "latin1"),
    ]));
  });
  return ensamblar(objetos);
}
