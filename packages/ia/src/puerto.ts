import type { z } from "zod";

export type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

export interface Adjunto {
  tipo: "imagen" | "pdf";
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "application/pdf";
  base64: string;
  titulo?: string;
}

export interface BloqueContexto {
  titulo: string;
  texto: string;
}

export interface PeticionEstructurada<T> {
  /** Tarea lógica: selecciona modelo y esfuerzo, y enruta el proveedor simulado. */
  tarea: string;
  sistema: string;
  /** Contexto estable y extenso (expediente, fuentes): va antes de la instrucción y se cachea. */
  contexto?: BloqueContexto[];
  adjuntos?: Adjunto[];
  instruccion: string;
  esquema: z.ZodType<T>;
  nombreEsquema: string;
  maxTokens?: number;
  esfuerzo?: Esfuerzo;
}

export interface Uso {
  entrada: number;
  salida: number;
  cacheEscritura: number;
  cacheLectura: number;
}

export interface RespuestaEstructurada<T> {
  datos: T;
  uso: Uso;
  modelo: string;
  detencion: string;
  fallbackUsado: boolean;
}

export interface HerramientaAgente {
  nombre: string;
  descripcion: string;
  esquema: Record<string, unknown>;
  ejecutar(entrada: unknown): Promise<{ contenido: string; esError?: boolean }>;
}

export interface PeticionAgente {
  tarea: string;
  sistema: string;
  contexto?: BloqueContexto[];
  instruccion: string;
  herramientas: HerramientaAgente[];
  maxTurnos?: number;
  esfuerzo?: Esfuerzo;
  maxTokens?: number;
}

export interface TrazaHerramienta {
  herramienta: string;
  entrada: unknown;
  esError: boolean;
  resumen: string;
}

export interface RespuestaAgente {
  texto: string;
  trazas: TrazaHerramienta[];
  turnos: number;
  uso: Uso;
  modelo: string;
}

/** Puerto de IA: el dominio no depende del proveedor concreto. */
export interface LlmPort {
  readonly nombre: string;
  estructurado<T>(p: PeticionEstructurada<T>): Promise<RespuestaEstructurada<T>>;
  agente(p: PeticionAgente): Promise<RespuestaAgente>;
}

export class ErrorIA extends Error {
  constructor(public readonly codigo: "RECHAZO" | "TRUNCADO" | "ESQUEMA_INVALIDO" | "LIMITE_TURNOS" | "SIN_CREDENCIAL" | "SIN_SIMULACION" | "API", mensaje: string, public readonly detalle?: unknown) {
    super(mensaje);
    this.name = "ErrorIA";
  }
}

export const USO_CERO: Uso = { entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 0 };

export function sumarUso(a: Uso, b: Uso): Uso {
  return { entrada: a.entrada + b.entrada, salida: a.salida + b.salida, cacheEscritura: a.cacheEscritura + b.cacheEscritura, cacheLectura: a.cacheLectura + b.cacheLectura };
}
