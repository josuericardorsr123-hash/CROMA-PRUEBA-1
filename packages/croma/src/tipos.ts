export interface Registro {
  debug(msg: string, datos?: Record<string, unknown>): void;
  info(msg: string, datos?: Record<string, unknown>): void;
  warn(msg: string, datos?: Record<string, unknown>): void;
  error(msg: string, datos?: Record<string, unknown>): void;
}

export const REGISTRO_SILENCIOSO: Registro = { debug() {}, info() {}, warn() {}, error() {} };

export interface EsquemaJson {
  type?: string | string[];
  properties?: Record<string, EsquemaJson & { description?: string }>;
  required?: string[];
  items?: EsquemaJson;
  description?: string;
  enum?: unknown[];
  [clave: string]: unknown;
}

/** Herramienta publicada por Croma. Fuente y país vienen al final de la descripción: "(Source: X; Country: Y)". */
export interface HerramientaCroma {
  nombre: string;
  titulo: string;
  descripcion: string;
  fuente: string;
  pais: string;
  prefijo: string;
  esquemaEntrada: EsquemaJson;
}

export type EstadoConsulta = "OK" | "SIN_RESULTADOS" | "PENDIENTE" | "ERROR";

/** Registro de procedencia (sin el blob, que lo persiste la capa de almacenamiento). */
export interface ProcedenciaCroma {
  id: string;
  tipo: "CROMA" | "HTTP_OFICIAL" | "SIMULADO";
  herramienta: string | null;
  capacidad: string | null;
  argumentos: unknown;
  url: string | null;
  consultadoEn: string;
  finalidad: string;
  estado: EstadoConsulta;
  hashResultado: string | null;
  resumen: string | null;
  latenciaMs: number;
  error: string | null;
  desdeCache: boolean;
}

export interface ResultadoConsulta {
  estado: EstadoConsulta;
  /** Texto íntegro devuelto por la fuente (base del cotejo literal y del hash). */
  texto: string;
  /** JSON interpretado cuando la fuente devuelve datos estructurados. */
  datos: unknown;
  procedencia: ProcedenciaCroma;
}

export class ErrorCroma extends Error {
  constructor(public readonly codigo: "SIN_CREDENCIAL" | "CAPACIDAD_NO_DISPONIBLE" | "CIRCUITO_ABIERTO" | "TIEMPO_AGOTADO" | "TRANSPORTE" | "NO_AUTORIZADO" | "FINALIDAD_REQUERIDA" | "HERRAMIENTA", mensaje: string) {
    super(mensaje);
    this.name = "ErrorCroma";
  }
}
