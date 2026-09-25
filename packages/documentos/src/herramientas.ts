import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

/* Envoltorios de Poppler, qpdf y LibreOffice con tiempo máximo y sin shell. */

export interface ResultadoProceso {
  codigo: number;
  salida: string;
  error: string;
}

export function ejecutar(bin: string, args: string[], opciones: { timeoutMs?: number; binario?: boolean } = {}): Promise<ResultadoProceso & { buffer?: Buffer }> {
  return new Promise((resolver) => {
    execFile(bin, args, { timeout: opciones.timeoutMs ?? 120_000, maxBuffer: 256 * 1024 * 1024, encoding: opciones.binario ? "buffer" : "utf8" }, (err, stdout, stderr) => {
      const codigo = err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === "number" ? ((err as unknown as { code: number }).code) : 1) : 0;
      resolver({ codigo, salida: opciones.binario ? "" : String(stdout ?? ""), error: String(stderr ?? ""), ...(opciones.binario ? { buffer: stdout as unknown as Buffer } : {}) });
    });
  });
}

export async function disponible(bin: string): Promise<boolean> {
  const r = await ejecutar("sh", ["-c", `command -v ${bin}`], { timeoutMs: 5000 });
  return r.codigo === 0 && r.salida.trim().length > 0;
}

export interface Capacidades {
  pdfinfo: boolean;
  pdftotext: boolean;
  pdftoppm: boolean;
  qpdf: boolean;
  soffice: boolean;
}

let cache: Capacidades | null = null;

export async function capacidadesDocumentales(): Promise<Capacidades> {
  if (cache) return cache;
  const [pdfinfo, pdftotext, pdftoppm, qpdf, soffice] = await Promise.all(["pdfinfo", "pdftotext", "pdftoppm", "qpdf", "soffice"].map(disponible));
  // El binario puede existir sin el componente Writer (paquete libreoffice-core
  // solo): se exige una conversión real antes de declararlo disponible.
  cache = { pdfinfo: pdfinfo!, pdftotext: pdftotext!, pdftoppm: pdftoppm!, qpdf: qpdf!, soffice: soffice! && (await libreOfficeConvierte()) };
  return cache;
}

async function libreOfficeConvierte(): Promise<boolean> {
  try {
    const pdf = await convertirAPdf(Buffer.from("prueba", "utf8"), "prueba.txt");
    return pdf.subarray(0, 5).toString("latin1") === "%PDF-";
  } catch {
    return false;
  }
}

export async function conDirectorioTemporal<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "em-doc-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function paginasPdf(ruta: string): Promise<number> {
  const r = await ejecutar("pdfinfo", [ruta], { timeoutMs: 30_000 });
  const m = /Pages:\s+(\d+)/.exec(r.salida);
  if (!m) throw new Error(`pdfinfo no pudo leer ${basename(ruta)}: ${r.error.slice(0, 200)}`);
  return Number(m[1]);
}

export type EstadoCifrado = "NO_CIFRADO" | "CIFRADO_SIN_CLAVE_DE_APERTURA" | "REQUIERE_CLAVE" | "DESCONOCIDO";

/** qpdf --requires-password: 0 requiere clave, 2 no cifrado, 3 cifrado sin clave de apertura. */
export async function estadoCifrado(ruta: string): Promise<EstadoCifrado> {
  const r = await ejecutar("qpdf", ["--requires-password", ruta], { timeoutMs: 30_000 });
  if (r.codigo === 0) return "REQUIERE_CLAVE";
  if (r.codigo === 2) return "NO_CIFRADO";
  if (r.codigo === 3) return "CIFRADO_SIN_CLAVE_DE_APERTURA";
  return "DESCONOCIDO";
}

export async function descifrarPdf(entrada: string, salida: string, clave?: string): Promise<boolean> {
  const args = clave ? [`--password=${clave}`, "--decrypt", entrada, salida] : ["--decrypt", entrada, salida];
  const r = await ejecutar("qpdf", args, { timeoutMs: 60_000 });
  return r.codigo === 0 || r.codigo === 3;
}

export async function textoPagina(ruta: string, pagina: number): Promise<string> {
  const r = await ejecutar("pdftotext", ["-f", String(pagina), "-l", String(pagina), "-layout", "-enc", "UTF-8", ruta, "-"], { timeoutMs: 60_000 });
  return r.codigo === 0 ? r.salida.replace(/\f/g, "").trim() : "";
}

export async function renderizarPagina(ruta: string, pagina: number, dpi = 150): Promise<Buffer> {
  return conDirectorioTemporal(async (dir) => {
    const prefijo = join(dir, "p");
    const r = await ejecutar("pdftoppm", ["-f", String(pagina), "-l", String(pagina), "-r", String(dpi), "-png", "-singlefile", ruta, prefijo], { timeoutMs: 120_000 });
    if (r.codigo !== 0) throw new Error(`pdftoppm falló en la página ${pagina}: ${r.error.slice(0, 200)}`);
    return readFile(`${prefijo}.png`);
  });
}

/** Extrae un rango de páginas a un PDF nuevo (qpdf --pages). */
export async function extraerPaginas(entrada: string, desde: number, hasta: number, salida: string): Promise<void> {
  const r = await ejecutar("qpdf", ["--empty", "--pages", entrada, `${desde}-${hasta}`, "--", salida], { timeoutMs: 120_000 });
  if (r.codigo !== 0 && r.codigo !== 3) throw new Error(`qpdf no pudo extraer ${desde}-${hasta}: ${r.error.slice(0, 200)}`);
}

/** Convierte ofimática o imágenes a PDF con LibreOffice sin interfaz. */
export async function convertirAPdf(buffer: Buffer, nombre: string): Promise<Buffer> {
  return conDirectorioTemporal(async (dir) => {
    const entrada = join(dir, nombre.replace(/[^\w.-]/g, "_"));
    await writeFile(entrada, buffer);
    const perfil = join(dir, "perfil");
    const r = await ejecutar("soffice", [`-env:UserInstallation=file://${perfil}`, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", dir, entrada], { timeoutMs: 180_000 });
    const pdf = (await readdir(dir)).find((f) => f.toLowerCase().endsWith(".pdf") && f !== basename(entrada));
    if (!pdf) throw new Error(`LibreOffice no convirtió ${nombre}: ${r.error.slice(0, 300)}`);
    return readFile(join(dir, pdf));
  });
}

export function extension(nombre: string): string {
  return extname(nombre).toLowerCase().replace(".", "");
}
