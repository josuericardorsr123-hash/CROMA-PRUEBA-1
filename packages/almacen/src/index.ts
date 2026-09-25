import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { type AlmacenBlobs, BlobsEnDisco, BlobsEnMemoria } from "./blobs";
import { type Cifrador, cifradorDesdeEntorno } from "./cifrado";
import { RepositorioSql, type OpcionesRepositorio } from "./repositorio";
import { abrirConexion } from "./sql";

export * from "./cifrado";
export * from "./blobs";
export * from "./sql";
export * from "./migraciones";
export * from "./claves-usuario";
export * from "./repositorio";

export interface Almacen {
  repo: RepositorioSql;
  blobs: AlmacenBlobs;
  cifrador: Cifrador;
  /** Descripción sin credenciales del motor en uso (para /salud y la bitácora de arranque). */
  motor: string;
  advertencias: string[];
  cerrar(): Promise<void>;
}

export interface OpcionesAlmacen extends OpcionesRepositorio {
  /** `sqlite:ruta.db`, `sqlite::memory:` o `postgres://…`. Por defecto EM_BASE_DATOS o SQLite en el directorio de datos. */
  urlBaseDatos?: string;
  /** Directorio de datos (blobs cifrados y base SQLite). Por defecto EM_DIR_DATOS o `.em-data`. */
  dirDatos?: string;
  blobsEnMemoria?: boolean;
  cifrador?: Cifrador;
  entorno?: NodeJS.ProcessEnv;
}

/** Abre el almacén completo, aplica migraciones y devuelve repositorio, blobs y cifrador. */
export async function abrirAlmacen(o: OpcionesAlmacen = {}): Promise<Almacen> {
  const entorno = o.entorno ?? process.env;
  const dir = resolve(o.dirDatos ?? entorno.EM_DIR_DATOS ?? ".em-data");
  const advertencias: string[] = [];
  let cifrador = o.cifrador;
  if (!cifrador) {
    const c = cifradorDesdeEntorno(entorno, join(dir, "clave-desarrollo.key"));
    cifrador = c.cifrador;
    if (c.advertencia) advertencias.push(c.advertencia);
  }
  const url = o.urlBaseDatos ?? entorno.EM_BASE_DATOS ?? `sqlite:${join(dir, "expediente-maleable.db")}`;
  if (url.startsWith("sqlite:") && !url.includes(":memory:")) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const conexion = abrirConexion(url);
  const repo = new RepositorioSql(conexion, cifrador, o);
  await repo.migrar();
  const blobs = o.blobsEnMemoria ? new BlobsEnMemoria(cifrador) : new BlobsEnDisco(join(dir, "blobs"), cifrador);
  return {
    repo, blobs, cifrador, advertencias,
    motor: conexion.dialecto === "postgres" ? `postgres (${url.replace(/\/\/[^@]*@/, "//***@")})` : `sqlite (${url.replace(/^sqlite:/, "")})`,
    cerrar: () => repo.cerrar(),
  };
}
