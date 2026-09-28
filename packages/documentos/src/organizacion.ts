import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { conDirectorioTemporal, extraerPaginas } from "./herramientas";

/* Fase 3 · división por tipología, renombrado estable e índice electrónico
 * (Protocolo para la gestión de documentos electrónicos y conformación del
 * expediente, CSJ-CENDOJ): nombre, fechas, orden, páginas, formato, tamaño,
 * origen y huella de cada documento. */

export async function dividirPdf(pdf: Buffer, desde: number, hasta: number): Promise<Buffer> {
  return conDirectorioTemporal(async (dir) => {
    const entrada = join(dir, "in.pdf");
    const salida = join(dir, "out.pdf");
    await writeFile(entrada, pdf);
    await extraerPaginas(entrada, desde, hasta, salida);
    return readFile(salida);
  });
}

export interface FilaIndice {
  orden: number;
  anexo: number | null;
  nombreDocumento: string;
  tipologia: string;
  fechaDocumento: string | null;
  fechaIncorporacion: string;
  paginas: number;
  paginaInicio: number;
  paginaFin: number;
  formato: string;
  bytes: number;
  origen: string;
  sha256: string;
  observaciones: string;
}

/** Numera la foliación continua del expediente (página inicial y final de cada documento). */
export function construirIndice(docs: Array<Omit<FilaIndice, "paginaInicio" | "paginaFin">>): FilaIndice[] {
  let pagina = 1;
  return [...docs].sort((a, b) => a.orden - b.orden).map((d) => {
    const fila = { ...d, paginaInicio: pagina, paginaFin: pagina + d.paginas - 1 };
    pagina += d.paginas;
    return fila;
  });
}

const csv = (v: unknown) => {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function indiceCsv(filas: FilaIndice[]): string {
  const cab = ["Orden", "Anexo", "Nombre del documento", "Tipología", "Fecha del documento", "Fecha de incorporación", "Número de páginas", "Página inicio", "Página fin", "Formato", "Tamaño (bytes)", "Origen", "Huella SHA-256", "Observaciones"];
  const filasTexto = filas.map((f) => [f.orden, f.anexo ?? "", f.nombreDocumento, f.tipologia, f.fechaDocumento ?? "", f.fechaIncorporacion, f.paginas, f.paginaInicio, f.paginaFin, f.formato, f.bytes, f.origen, f.sha256, f.observaciones].map(csv).join(";"));
  return `﻿${[cab.join(";"), ...filasTexto].join("\r\n")}\r\n`;
}

export function sha256(b: Buffer | Uint8Array): string {
  return createHash("sha256").update(b).digest("hex");
}

/** Paquete ZIP del expediente organizado (documentos renombrados + índice electrónico). */
export function empaquetar(archivos: Array<{ ruta: string; contenido: Buffer | Uint8Array | string }>): Buffer {
  const mapa: Record<string, Uint8Array> = {};
  for (const a of archivos) mapa[a.ruta] = typeof a.contenido === "string" ? strToU8(a.contenido) : new Uint8Array(a.contenido);
  return Buffer.from(zipSync(mapa, { level: 6 }));
}
