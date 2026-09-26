import type { AlmacenBlobs, BlobGuardado, Leccion, PerfilProfesional } from "@em/almacen";
import type { ClienteCroma, ProcedenciaCroma, Registro } from "@em/croma";
import type { AccionAbogado, Expediente, FechaISO, Hallazgo, Instruccion, Nodo } from "@em/dominio";
import type { RepositorioFuentes, ResolutorFuentes } from "@em/fuentes";
import type { LlmPort } from "@em/ia";
import type { ConfiguracionCalendario, PerfilDespacho, UmbralesRiesgo } from "@em/motores";

/* Contratos del orquestador: servicios que recibe cada nodo, configuración del
 * despacho y forma de los resultados. Los nodos no conocen la base de datos ni
 * la API: reciben puertos, lo que permite ejecutar el mismo pipeline en el
 * servidor, en la CLI y en las pruebas. */

export interface ConfigPipeline {
  /** Autor del informe técnico (firma final entre guiones largos). */
  autorInforme: string;
  cargoAutor: string | null;
  /** Primera parte del encabezado editorial (publicación); se completa con la categoría y la fecha. */
  publicacion: string;
  ciudad: string;
  perfilDespacho: PerfilDespacho;
  calendario: ConfiguracionCalendario;
  umbrales: UmbralesRiesgo;
  smmlvAjustes: Record<number, number>;
  maxIteraciones: { g_citas: number; revision: number };
  concurrencia: number;
  dpiLectura: number;
  maxPaginasPorArchivo: number;
  /** Paginación real del índice con LibreOffice: por defecto, si está instalado. */
  paginarInforme?: boolean;
  /** Marca visible «DEMOSTRACIÓN — datos ficticios, fuentes simuladas». */
  demostracion: boolean;
}

export interface PerfilAbogado extends PerfilProfesional {
  usuarioId: string;
  nombre: string;
  correo: string;
}

export interface PuertoMemoria {
  lecciones(area: string | null): Promise<Leccion[]>;
  guardar(l: { tipo: string; area: string | null; clave: string; contenido: unknown; expedienteOrigen: string }): Promise<void>;
}

export interface PuertoAbogados {
  perfil(usuarioId: string): Promise<PerfilAbogado | null>;
}

export interface PuertoTerminos {
  indexar(exp: Expediente): Promise<void>;
}

export interface Servicios {
  llm: LlmPort | null;
  croma: ClienteCroma;
  resolutor: ResolutorFuentes;
  repositorio: RepositorioFuentes;
  blobs: AlmacenBlobs;
  memoria: PuertoMemoria | null;
  abogados: PuertoAbogados | null;
  terminos: PuertoTerminos | null;
  config: ConfigPipeline;
  reloj: () => Date;
  registro: Registro;
}

export type ResultadoNodo =
  | { tipo: "COMPLETADO"; detalle: string }
  | { tipo: "OMITIDO"; detalle: string }
  | { tipo: "DECISION"; rama: "si" | "no"; motivo: string; actor?: string; anulacionHumana?: boolean }
  | { tipo: "PAUSA"; motivo: string; acciones: Array<AccionAbogado | "CARGAR_DOCUMENTOS" | "CONFIGURAR">; detalle?: unknown };

export interface ContextoNodo {
  /** Copia de trabajo del expediente: cada nodo escribe solo sus propios campos. */
  exp: Expediente;
  nodo: Nodo;
  s: Servicios;
  /** Número de re-elaboraciones (bucles) que ha recorrido el pipeline. */
  iteracion: number;
  ahora(): string;
  hoy(): FechaISO;
  /** Registra una procedencia (consulta externa) y guarda cifrado su resultado íntegro. */
  procedencia(p: ProcedenciaCroma, textoResultado?: string | null): Promise<string>;
  guardarBlob(datos: Buffer | Uint8Array, mime: string, nombre?: string): Promise<BlobGuardado>;
  leerBlob(blobId: string): Promise<Buffer>;
  /** Instrucciones del ABOGADO (USUARIO) aún no consumidas. */
  instrucciones(accion?: AccionAbogado | AccionAbogado[]): Instruccion[];
  consumir(i: Instruccion): void;
  hallazgo(h: Omit<Hallazgo, "id" | "soportes" | "fundamento" | "recomendacion"> & Partial<Pick<Hallazgo, "soportes" | "fundamento" | "recomendacion">>): Hallazgo;
  log(mensaje: string, datos?: Record<string, unknown>): void;
}

export type ManejadorNodo = (ctx: ContextoNodo) => Promise<ResultadoNodo>;

export class ErrorPipeline extends Error {
  constructor(public readonly codigo: "SIN_MANEJADOR" | "BLOQUEO" | "LIMITE" | "CONFIGURACION" | "DATOS", mensaje: string) {
    super(mensaje);
    this.name = "ErrorPipeline";
  }
}
