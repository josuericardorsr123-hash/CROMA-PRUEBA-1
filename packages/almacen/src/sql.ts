import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import pg from "pg";

/* Capa SQL mínima con dos controladores (SQLite embebido y PostgreSQL) y un
 * único repositorio encima. Las sentencias se escriben con marcadores «?» y con
 * el token {{BIN}} para columnas binarias; cada controlador las adapta. */

export type Valor = string | number | bigint | boolean | null | undefined | Buffer | Uint8Array;
export type Fila = Record<string, unknown>;

export interface Consulta {
  readonly dialecto: "sqlite" | "postgres";
  consultar<T extends Fila = Fila>(sql: string, params?: Valor[]): Promise<T[]>;
  ejecutar(sql: string, params?: Valor[]): Promise<number>;
}

export interface ConexionSql extends Consulta {
  /** Transacción serializable respecto de otras escrituras del mismo proceso. */
  transaccion<T>(fn: (tx: Consulta) => Promise<T>): Promise<T>;
  /** Sentencias DDL separadas por «;». */
  ejecutarScript(sql: string): Promise<void>;
  cerrar(): Promise<void>;
}

const BIN = { sqlite: "BLOB", postgres: "BYTEA" } as const;

export function adaptar(sql: string, dialecto: "sqlite" | "postgres"): string {
  const conTipos = sql.replaceAll("{{BIN}}", BIN[dialecto]);
  if (dialecto === "sqlite") return conTipos;
  let i = 0;
  return conTipos.replace(/\?/g, () => `$${++i}`);
}

/** Candado asíncrono: SQLite embebido es síncrono y de una sola conexión; sin él, una transacción abierta se entrelazaría con otras operaciones. */
class Candado {
  private cola: Promise<void> = Promise.resolve();

  async con<T>(fn: () => Promise<T>): Promise<T> {
    const previo = this.cola;
    let liberar!: () => void;
    this.cola = new Promise((r) => (liberar = r));
    await previo;
    try {
      return await fn();
    } finally {
      liberar();
    }
  }
}

function aSqlite(v: Valor): SQLInputValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v as SQLInputValue;
}

function normalizarFila(f: Record<string, unknown>): Fila {
  const salida: Fila = {};
  for (const [k, v] of Object.entries(f)) salida[k] = v instanceof Uint8Array && !Buffer.isBuffer(v) ? Buffer.from(v) : v;
  return salida;
}

export class ConexionSqlite implements ConexionSql {
  readonly dialecto = "sqlite" as const;
  private readonly db: DatabaseSync;
  private readonly candado = new Candado();

  constructor(ruta: string) {
    this.db = new DatabaseSync(ruta);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  }

  private directa(): Consulta {
    return {
      dialecto: "sqlite",
      consultar: async <T extends Fila = Fila>(sql: string, params: Valor[] = []) => this.db.prepare(adaptar(sql, "sqlite")).all(...params.map(aSqlite)).map((f) => normalizarFila(f as Record<string, unknown>)) as T[],
      ejecutar: async (sql: string, params: Valor[] = []) => Number(this.db.prepare(adaptar(sql, "sqlite")).run(...params.map(aSqlite)).changes),
    };
  }

  consultar<T extends Fila = Fila>(sql: string, params?: Valor[]): Promise<T[]> {
    return this.candado.con(() => this.directa().consultar<T>(sql, params));
  }

  ejecutar(sql: string, params?: Valor[]): Promise<number> {
    return this.candado.con(() => this.directa().ejecutar(sql, params));
  }

  transaccion<T>(fn: (tx: Consulta) => Promise<T>): Promise<T> {
    return this.candado.con(async () => {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const r = await fn(this.directa());
        this.db.exec("COMMIT");
        return r;
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    });
  }

  ejecutarScript(sql: string): Promise<void> {
    return this.candado.con(async () => this.db.exec(adaptar(sql, "sqlite")));
  }

  async cerrar(): Promise<void> {
    await this.candado.con(async () => this.db.close());
  }
}

/** int8 (BIGINT, COUNT) como número: los contadores del sistema caben en 2^53. */
const tipos = {
  getTypeParser: (oid: number, formato?: string) => (oid === 20 ? (v: string) => Number(v) : pg.types.getTypeParser(oid, formato as "text")),
};

export class ConexionPostgres implements ConexionSql {
  readonly dialecto = "postgres" as const;
  private readonly pool: pg.Pool;

  constructor(url: string, opciones: { maxConexiones?: number } = {}) {
    this.pool = new pg.Pool({ connectionString: url, max: opciones.maxConexiones ?? 10, types: tipos as pg.CustomTypesConfig });
  }

  private sobre(c: pg.Pool | pg.PoolClient): Consulta {
    return {
      dialecto: "postgres",
      consultar: async <T extends Fila = Fila>(sql: string, params: Valor[] = []) => (await c.query(adaptar(sql, "postgres"), params.map((v) => (v === undefined ? null : v)))).rows as T[],
      ejecutar: async (sql: string, params: Valor[] = []) => (await c.query(adaptar(sql, "postgres"), params.map((v) => (v === undefined ? null : v)))).rowCount ?? 0,
    };
  }

  consultar<T extends Fila = Fila>(sql: string, params?: Valor[]): Promise<T[]> {
    return this.sobre(this.pool).consultar<T>(sql, params);
  }

  ejecutar(sql: string, params?: Valor[]): Promise<number> {
    return this.sobre(this.pool).ejecutar(sql, params);
  }

  async transaccion<T>(fn: (tx: Consulta) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("BEGIN");
      const r = await fn(this.sobre(cliente));
      await cliente.query("COMMIT");
      return r;
    } catch (e) {
      await cliente.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      cliente.release();
    }
  }

  async ejecutarScript(sql: string): Promise<void> {
    await this.pool.query(adaptar(sql, "postgres"));
  }

  async cerrar(): Promise<void> {
    await this.pool.end();
  }
}

/** `sqlite:ruta/al/archivo.db`, `sqlite::memory:` o `postgres://usuario:clave@host/base`. */
export function abrirConexion(url: string): ConexionSql {
  if (/^postgres(ql)?:\/\//i.test(url)) return new ConexionPostgres(url);
  const m = /^sqlite:(?:\/\/)?(.+)$/i.exec(url);
  if (!m) throw new Error(`URL de base de datos no soportada: ${url.replace(/:[^:@/]+@/, ":***@")}`);
  return new ConexionSqlite(m[1] === ":memory:" ? ":memory:" : m[1]!);
}
