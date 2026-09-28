import { createHash, randomUUID } from "node:crypto";
import { esDominioOficial, type ProcedenciaCroma } from "@em/croma";
import { htmlATexto, pareceHtml } from "./html";

export interface OpcionesHttpOficial {
  habilitado: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  agente?: string;
}

export interface ResultadoHttp {
  estado: "OK" | "SIN_RESULTADOS" | "ERROR";
  texto: string;
  procedencia: ProcedenciaCroma;
}

/**
 * Descarga directa de una URL oficial (dominios .gov.co del allowlist). Es la
 * segunda vía de verificación cuando Croma no expone la fuente; si el portal
 * bloquea el acceso automatizado, el resultado es ERROR (no verificado).
 */
export async function obtenerOficial(url: string, finalidad: string, o: OpcionesHttpOficial): Promise<ResultadoHttp> {
  const inicio = Date.now();
  const base = (estado: ResultadoHttp["estado"], extra: Partial<ProcedenciaCroma> = {}): ProcedenciaCroma => ({
    id: `prc_${randomUUID().replace(/-/g, "").slice(0, 20)}`, tipo: "HTTP_OFICIAL", herramienta: null, capacidad: "http.oficial", argumentos: { url }, url,
    consultadoEn: new Date().toISOString(), finalidad, estado, hashResultado: null, resumen: null, latenciaMs: Date.now() - inicio, error: null, desdeCache: false, ...extra,
  });
  if (!o.habilitado) return { estado: "ERROR", texto: "", procedencia: base("ERROR", { error: "Descarga directa de fuentes oficiales deshabilitada (FUENTES_HTTP_DIRECTO=0)." }) };
  if (!esDominioOficial(url)) return { estado: "ERROR", texto: "", procedencia: base("ERROR", { error: "Dominio fuera del listado de fuentes oficiales." }) };
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(o.timeoutMs ?? 20_000), headers: { "user-agent": o.agente ?? "ExpedienteMaleable/1.0 (verificacion de fuentes juridicas)", accept: "text/html,application/xhtml+xml,text/plain" }, redirect: "follow" });
    if (!r.ok) return { estado: r.status === 404 ? "SIN_RESULTADOS" : "ERROR", texto: "", procedencia: base(r.status === 404 ? "SIN_RESULTADOS" : "ERROR", { error: `HTTP ${r.status}` }) };
    const tipo = r.headers.get("content-type") ?? "";
    if (/pdf/i.test(tipo)) return { estado: "ERROR", texto: "", procedencia: base("ERROR", { error: "La fuente es PDF: se requiere extracción documental." }) };
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length > (o.maxBytes ?? 15_000_000)) return { estado: "ERROR", texto: "", procedencia: base("ERROR", { error: "Documento excede el tamaño máximo." }) };
    const decodificado = new TextDecoder(/iso-8859-1|latin1|windows-1252/i.test(tipo) ? "latin1" : "utf-8").decode(buffer);
    const texto = pareceHtml(decodificado) ? htmlATexto(decodificado) : decodificado;
    return { estado: "OK", texto, procedencia: base("OK", { hashResultado: createHash("sha256").update(texto).digest("hex"), resumen: texto.slice(0, 280) }) };
  } catch (e) {
    return { estado: "ERROR", texto: "", procedencia: base("ERROR", { error: String((e as Error).message ?? e).slice(0, 300) }) };
  }
}
