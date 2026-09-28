/* Modelo de documento independiente de docx-js: el pipeline compone el
 * contenido (verificado y trazado) y los generadores lo maquetan. */

export interface NotaPie {
  texto: string;
  url?: string | null;
  fecha?: string | null;
}

export interface Segmento {
  texto: string;
  negrita?: boolean;
  cursiva?: boolean;
  /** Nota al pie anclada al final de este segmento. */
  nota?: NotaPie | null;
}

export type Bloque =
  | { tipo: "parrafo"; segmentos: Segmento[] }
  | { tipo: "cita"; texto: string; descripcion: string; fuente: string; url?: string | null; nota?: NotaPie | null }
  | { tipo: "lista"; ordenada: boolean; items: Segmento[][] }
  | { tipo: "tabla"; titulo: string; columnas: string[]; filas: string[][]; proporciones?: number[]; nota?: string | null };

export interface Subseccion {
  titulo: string;
  bloques: Bloque[];
  subsecciones?: Subseccion[];
}

export interface Seccion {
  titulo: string;
  bloques: Bloque[];
  subsecciones: Subseccion[];
}

export interface DocumentoInforme {
  encabezadoEditorial: string;
  titulo: string;
  autor: string;
  cargoAutor?: string | null;
  subtitulo?: string | null;
  resumen: string;
  palabrasClave: string[];
  introduccion: Bloque[];
  secciones: Seccion[];
  conclusiones: Bloque[];
  referencias: string[];
  /** Nombre de quien firma; se imprime centrado entre guiones largos. Por defecto, el autor. */
  firma?: string | null;
  /** Leyenda visible (p. ej. "BORRADOR PARA REVISIÓN" o "DEMOSTRACIÓN — datos ficticios y fuentes simuladas"). */
  leyenda?: string | null;
  metadatos?: { asunto?: string; palabrasClave?: string; descripcion?: string };
}

export interface BloquePieza {
  titulo: string | null;
  numerado: "ROMANO" | "NINGUNO";
  bloques: Bloque[];
}

export interface DocumentoPieza {
  ciudadFecha: string;
  destinatario: string[];
  referencia: Array<{ etiqueta: string; valor: string }>;
  asunto: string;
  apertura: Segmento[];
  cuerpo: BloquePieza[];
  cierre: string;
  firma: { nombre: string; identificacion: string; tarjeta: string | null; calidad: string; contacto: string | null };
  modo: "BORRADOR" | "RADICABLE";
  advertencia?: string | null;
  titulo: string;
}
