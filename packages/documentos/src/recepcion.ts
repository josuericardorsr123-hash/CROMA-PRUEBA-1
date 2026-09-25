import { createHash } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { conDirectorioTemporal, descifrarPdf, estadoCifrado, type EstadoCifrado, paginasPdf } from "./herramientas";

/* Fase 1 · Recepción. Nada se descarta sin rastro: los duplicados se marcan
 * contra su original, los cifrados conservan el original y los formatos no
 * soportados quedan registrados con su razón. */

export interface ArchivoEntrante {
  nombre: string;
  rutaRelativa?: string;
  contenido: Buffer;
}

export type ClaseArchivo = "PDF" | "IMAGEN" | "OFIMATICA" | "TEXTO" | "COMPRIMIDO" | "DESCONOCIDO";

export interface ArchivoRecibido {
  nombre: string;
  rutaRelativa: string;
  sha256: string;
  bytes: number;
  mime: string;
  clase: ClaseArchivo;
  contenido: Buffer;
  duplicadoDe: string | null;
  cifrado: EstadoCifrado | null;
  /** PDF descifrado cuando el original tenía restricciones sin clave de apertura. */
  pdfDescifrado: Buffer | null;
  paginas: number;
  notas: string[];
  soportado: boolean;
}

export interface LimitesRecepcion {
  maxArchivos: number;
  maxBytesTotal: number;
  maxBytesArchivo: number;
}

export const LIMITES_POR_DEFECTO: LimitesRecepcion = { maxArchivos: 500, maxBytesTotal: 2_000_000_000, maxBytesArchivo: 300_000_000 };

export function detectarMime(b: Buffer, nombre: string): { mime: string; clase: ClaseArchivo } {
  const h = b.subarray(0, 12);
  const n = nombre.toLowerCase();
  if (h.subarray(0, 4).toString("latin1") === "%PDF") return { mime: "application/pdf", clase: "PDF" };
  if (h[0] === 0x89 && h.subarray(1, 4).toString("latin1") === "PNG") return { mime: "image/png", clase: "IMAGEN" };
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return { mime: "image/jpeg", clase: "IMAGEN" };
  if (h.subarray(0, 4).toString("latin1") === "GIF8") return { mime: "image/gif", clase: "IMAGEN" };
  if (h.subarray(0, 4).toString("latin1") === "RIFF" && h.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", clase: "IMAGEN" };
  if (h.subarray(4, 12).toString("latin1").startsWith("ftyphei") || h.subarray(4, 12).toString("latin1").startsWith("ftypmif")) return { mime: "image/heic", clase: "DESCONOCIDO" };
  if (h[0] === 0x50 && h[1] === 0x4b) {
    if (/\.(docx|xlsx|pptx|odt|ods|odp)$/.test(n)) return { mime: "application/vnd.openxmlformats-officedocument", clase: "OFIMATICA" };
    return { mime: "application/zip", clase: "COMPRIMIDO" };
  }
  if (h.readUInt32BE(0) === 0xd0cf11e0) return { mime: "application/msword", clase: "OFIMATICA" };
  if (/\.(rtf)$/.test(n) || h.subarray(0, 5).toString("latin1") === "{\\rtf") return { mime: "application/rtf", clase: "OFIMATICA" };
  const muestra = b.subarray(0, 4096).toString("utf8");
  if (/\.(txt|md|csv|eml|html?)$/.test(n) || (!muestra.includes("\u0000") && /^[\p{L}\p{N}\p{P}\p{S}\s]*$/u.test(muestra.slice(0, 1000)))) return { mime: n.endsWith(".eml") ? "message/rfc822" : "text/plain", clase: "TEXTO" };
  return { mime: "application/octet-stream", clase: "DESCONOCIDO" };
}

/** Expande comprimidos sin salir de la carpeta del caso (sin rutas absolutas ni "..") y con límites contra bombas zip. */
export function expandirComprimido(a: ArchivoEntrante, limites: LimitesRecepcion): ArchivoEntrante[] {
  let total = 0;
  const salida: ArchivoEntrante[] = [];
  const entradas = unzipSync(new Uint8Array(a.contenido), {
    filter: (f) => {
      total += f.originalSize;
      if (total > limites.maxBytesTotal) throw new Error(`El comprimido ${a.nombre} excede el tamaño máximo expandido.`);
      return !f.name.endsWith("/") && !f.name.startsWith("__MACOSX/") && !/(^|\/)\.[^/]+$/.test(f.name);
    },
  });
  for (const [ruta, datos] of Object.entries(entradas)) {
    const limpia = ruta.replace(/\\/g, "/").split("/").filter((s) => s && s !== "." && s !== "..").join("/");
    if (!limpia) continue;
    if (salida.length >= limites.maxArchivos) throw new Error(`El comprimido ${a.nombre} excede el número máximo de archivos.`);
    salida.push({ nombre: limpia.split("/").pop()!, rutaRelativa: `${a.rutaRelativa ?? a.nombre}/${limpia}`, contenido: Buffer.from(datos) });
  }
  return salida;
}

export async function recibir(entrantes: ArchivoEntrante[], opciones: { limites?: LimitesRecepcion; hashesPrevios?: Map<string, string>; qpdf?: boolean; pdfinfo?: boolean } = {}): Promise<ArchivoRecibido[]> {
  const limites = opciones.limites ?? LIMITES_POR_DEFECTO;
  const cola: ArchivoEntrante[] = [];
  for (const e of entrantes) {
    const { clase } = detectarMime(e.contenido, e.nombre);
    if (clase === "COMPRIMIDO") cola.push(...expandirComprimido(e, limites));
    else cola.push(e);
  }
  if (cola.length > limites.maxArchivos) throw new Error(`Se recibieron ${cola.length} archivos; el máximo es ${limites.maxArchivos}.`);
  const vistos = new Map<string, string>(opciones.hashesPrevios ?? []);
  const salida: ArchivoRecibido[] = [];
  for (const e of cola) {
    const sha256 = createHash("sha256").update(e.contenido).digest("hex");
    const { mime, clase } = detectarMime(e.contenido, e.nombre);
    const rutaRelativa = e.rutaRelativa ?? e.nombre;
    const r: ArchivoRecibido = { nombre: e.nombre, rutaRelativa, sha256, bytes: e.contenido.length, mime, clase, contenido: e.contenido, duplicadoDe: vistos.get(sha256) ?? null, cifrado: null, pdfDescifrado: null, paginas: 0, notas: [], soportado: clase !== "DESCONOCIDO" };
    if (e.contenido.length > limites.maxBytesArchivo) {
      r.soportado = false;
      r.notas.push("Archivo excede el tamaño máximo por archivo.");
    }
    if (r.duplicadoDe) r.notas.push(`Duplicado exacto (SHA-256) de ${r.duplicadoDe}.`);
    else vistos.set(sha256, rutaRelativa);
    if (!r.soportado && clase === "DESCONOCIDO") r.notas.push(mime === "image/heic" ? "Formato HEIC: convertir a JPG o PDF antes de cargar." : "Formato no soportado para lectura automática.");
    if (clase === "PDF" && !r.duplicadoDe && opciones.qpdf !== false) {
      await conDirectorioTemporal(async (dir) => {
        const ruta = join(dir, "entrada.pdf");
        await writeFile(ruta, e.contenido);
        r.cifrado = await estadoCifrado(ruta);
        if (r.cifrado === "CIFRADO_SIN_CLAVE_DE_APERTURA") {
          const salidaPdf = join(dir, "descifrado.pdf");
          if (await descifrarPdf(ruta, salidaPdf)) {
            r.pdfDescifrado = await readFile(salidaPdf);
            r.notas.push("PDF con restricciones sin clave de apertura: se retiró el cifrado y el original se conserva.");
          }
        } else if (r.cifrado === "REQUIERE_CLAVE") {
          r.soportado = false;
          r.notas.push("PDF protegido con clave de apertura: se conserva el original; aportar la clave del titular para leerlo.");
        }
        if (r.soportado && opciones.pdfinfo !== false) {
          try {
            r.paginas = await paginasPdf(r.pdfDescifrado ? join(dir, "descifrado.pdf") : ruta);
          } catch (err) {
            r.notas.push(`No se pudo leer la estructura del PDF: ${(err as Error).message}`);
          }
        }
      });
    }
    salida.push(r);
  }
  return salida;
}
