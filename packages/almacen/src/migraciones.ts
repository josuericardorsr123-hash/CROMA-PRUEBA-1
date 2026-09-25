import type { ConexionSql } from "./sql";

/* Migraciones versionadas e idempotentes, comunes a SQLite y PostgreSQL. Los
 * datos personales (títulos, expedientes, detalles de bitácora, descripciones
 * de términos, memoria) se guardan cifrados en columnas {{BIN}}; en claro solo
 * quedan identificadores, estados y fechas necesarios para consultar. */

export const MIGRACIONES: Array<{ version: number; descripcion: string; sql: string }> = [
  {
    version: 1,
    descripcion: "Esquema inicial: tenants, usuarios, expedientes con versiones, bitácora encadenada, trabajos, términos y memoria",
    sql: `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  creado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  correo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL,
  hash_clave TEXT NOT NULL,
  tarjeta_profesional TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TEXT,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL,
  UNIQUE (tenant_id, correo)
);
CREATE TABLE IF NOT EXISTS expedientes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  propietario_id TEXT NOT NULL,
  titulo {{BIN}} NOT NULL,
  estado TEXT NOT NULL,
  version INTEGER NOT NULL,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL,
  datos {{BIN}} NOT NULL,
  bytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_expedientes_tenant ON expedientes (tenant_id, actualizado);
CREATE TABLE IF NOT EXISTS expedientes_versiones (
  expediente_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  tenant_id TEXT NOT NULL,
  guardado TEXT NOT NULL,
  actor TEXT NOT NULL,
  datos {{BIN}} NOT NULL,
  PRIMARY KEY (expediente_id, version)
);
CREATE TABLE IF NOT EXISTS cadenas (
  tenant_id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  huella TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bitacora (
  tenant_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  instante TEXT NOT NULL,
  actor TEXT NOT NULL,
  accion TEXT NOT NULL,
  objeto TEXT,
  detalle {{BIN}},
  huella TEXT NOT NULL,
  anterior TEXT NOT NULL,
  PRIMARY KEY (tenant_id, seq)
);
CREATE INDEX IF NOT EXISTS ix_bitacora_objeto ON bitacora (tenant_id, objeto);
CREATE TABLE IF NOT EXISTS trabajos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  expediente_id TEXT,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL,
  carga TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  max_intentos INTEGER NOT NULL DEFAULT 3,
  disponible_en TEXT NOT NULL,
  bloqueado_por TEXT,
  bloqueado_hasta TEXT,
  error TEXT,
  resultado TEXT,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_trabajos_cola ON trabajos (estado, disponible_en);
CREATE INDEX IF NOT EXISTS ix_trabajos_expediente ON trabajos (tenant_id, expediente_id);
CREATE TABLE IF NOT EXISTS terminos (
  expediente_id TEXT NOT NULL,
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL,
  vencimiento TEXT NOT NULL,
  vencimiento_temprano TEXT,
  dias_habiles INTEGER,
  es_estimacion INTEGER NOT NULL,
  descripcion {{BIN}} NOT NULL,
  actualizado TEXT NOT NULL,
  PRIMARY KEY (expediente_id, id)
);
CREATE INDEX IF NOT EXISTS ix_terminos_vencimiento ON terminos (tenant_id, vencimiento);
CREATE TABLE IF NOT EXISTS memoria (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  area TEXT,
  clave TEXT NOT NULL,
  contenido {{BIN}} NOT NULL,
  origen TEXT NOT NULL,
  usos INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL,
  UNIQUE (tenant_id, clave)
);
CREATE INDEX IF NOT EXISTS ix_memoria_area ON memoria (tenant_id, area, tipo)`,
  },
];

/** Identificador del candado consultivo de PostgreSQL que serializa migraciones entre instancias. */
const CANDADO_MIGRACIONES = 7_402_190_531;

/**
 * Aplica, en una transacción por versión, las migraciones pendientes. En
 * PostgreSQL toma un candado consultivo: varias instancias que arrancan a la vez
 * no aplican dos veces la misma versión.
 */
export async function migrar(c: ConexionSql): Promise<number[]> {
  await c.transaccion(async (tx) => {
    if (tx.dialecto === "postgres") await tx.consultar("SELECT pg_advisory_xact_lock(?)", [CANDADO_MIGRACIONES]);
    await tx.ejecutar("CREATE TABLE IF NOT EXISTS migraciones (version INTEGER PRIMARY KEY, descripcion TEXT NOT NULL, aplicada TEXT NOT NULL)");
  });
  const nuevas: number[] = [];
  for (const m of MIGRACIONES) {
    const aplicada = await c.transaccion(async (tx) => {
      if (tx.dialecto === "postgres") await tx.consultar("SELECT pg_advisory_xact_lock(?)", [CANDADO_MIGRACIONES]);
      if ((await tx.consultar("SELECT version FROM migraciones WHERE version = ?", [m.version])).length) return false;
      for (const sentencia of m.sql.split(";").map((s) => s.trim()).filter(Boolean)) await tx.ejecutar(sentencia);
      await tx.ejecutar("INSERT INTO migraciones (version, descripcion, aplicada) VALUES (?, ?, ?)", [m.version, m.descripcion, new Date().toISOString()]);
      return true;
    });
    if (aplicada) nuevas.push(m.version);
  }
  return nuevas;
}
