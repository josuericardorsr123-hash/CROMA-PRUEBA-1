import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

/** Identificador con prefijo legible: `exp_4f1c…`, `doc_…`, `fte_…`. */
export function nuevoId(prefijo: string): string {
  return `${prefijo}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** SHA-256 hexadecimal de un texto o buffer. */
export function sha256(dato: string | Uint8Array): string {
  return createHash("sha256").update(dato).digest("hex");
}

/** Serialización JSON estable (claves ordenadas): base de huellas y encadenamiento. */
export function jsonEstable(valor: unknown): string {
  return JSON.stringify(ordenar(valor));
}

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const clave of Object.keys(valor as Record<string, unknown>).sort()) {
      const v = (valor as Record<string, unknown>)[clave];
      if (v !== undefined) salida[clave] = ordenar(v);
    }
    return salida;
  }
  return valor;
}

/** Fecha civil AAAA-MM-DD (sin zona horaria: los términos se cuentan por días). */
export const FechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
export type FechaISO = z.infer<typeof FechaISO>;

/** Instante ISO-8601 completo. */
export const InstanteISO = z.string();
export type InstanteISO = z.infer<typeof InstanteISO>;

export function ahoraISO(): string {
  return new Date().toISOString();
}

/** Fecha civil de hoy en Colombia (UTC-5, sin horario de verano). */
export function hoyColombia(ahora: Date = new Date()): FechaISO {
  const bogota = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return bogota.toISOString().slice(0, 10);
}

/** Error de dominio con código estable para la API y la bitácora. */
export class ErrorDominio extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly detalle?: unknown,
  ) {
    super(mensaje);
    this.name = "ErrorDominio";
  }
}
