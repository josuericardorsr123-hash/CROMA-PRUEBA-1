import { randomUUID } from "node:crypto";
import { ErrorDominio, Expediente, jsonEstable, nuevoId, sha256, type Termino } from "@em/dominio";
import { type Cifrador } from "./cifrado";
import { evaluarClave, hashClave, type ParametrosScrypt, verificarClave } from "./claves-usuario";
import { migrar } from "./migraciones";
import type { ConexionSql, Consulta, Fila, Valor } from "./sql";

/* ────────────────────────────────────────────────────────────────────────────
 * Repositorio único sobre SQLite o PostgreSQL:
 *  - expedientes cifrados con control optimista de versión e historial;
 *  - usuarios (ABOGADO (USUARIO), administrador, auditor) con scrypt y bloqueo
 *    por intentos fallidos;
 *  - bitácora de auditoría encadenada por hash, verificable sin la clave;
 *  - cola de trabajos con arrendamiento (varios procesos trabajadores);
 *  - índice de términos de todos los expedientes (Módulo 18);
 *  - memoria institucional disociada (Módulo 26).
 * ──────────────────────────────────────────────────────────────────────────── */

export type Rol = "ABOGADO" | "ADMINISTRADOR" | "AUDITOR";

export interface Usuario {
  id: string;
  tenantId: string;
  correo: string;
  nombre: string;
  rol: Rol;
  tarjetaProfesional: string | null;
  activo: boolean;
  creado: string;
}

/** Datos profesionales con que se firman las piezas radicables (se guardan cifrados). */
export interface PerfilProfesional {
  identificacion: string | null;
  tarjetaProfesional: string | null;
  correoRegistroNacional: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
}

export interface ResumenExpediente {
  id: string;
  tenantId: string;
  propietarioId: string;
  titulo: string;
  estado: string;
  version: number;
  creado: string;
  actualizado: string;
  bytes: number;
}

export interface EntradaBitacora {
  tenantId: string;
  seq: number;
  instante: string;
  actor: string;
  accion: string;
  objeto: string | null;
  detalle: unknown;
  huella: string;
  anterior: string;
}

export interface VerificacionBitacora {
  integra: boolean;
  entradas: number;
  primeraRotura: number | null;
  motivo: string | null;
  cabeza: string;
}

export type EstadoTrabajo = "PENDIENTE" | "EN_CURSO" | "COMPLETADO" | "FALLIDO" | "CANCELADO";

export interface Trabajo {
  id: string;
  tenantId: string;
  expedienteId: string | null;
  tipo: string;
  estado: EstadoTrabajo;
  carga: unknown;
  intentos: number;
  maxIntentos: number;
  disponibleEn: string;
  bloqueadoPor: string | null;
  bloqueadoHasta: string | null;
  error: string | null;
  resultado: unknown;
  creado: string;
  actualizado: string;
}

export interface TerminoIndexado {
  expedienteId: string;
  terminoId: string;
  tipo: string;
  estado: string;
  vencimiento: string;
  vencimientoMasTemprano: string | null;
  diasHabilesRestantes: number | null;
  esEstimacion: boolean;
  descripcion: string;
}

export interface Leccion {
  id: string;
  tipo: string;
  area: string | null;
  contenido: unknown;
  usos: number;
  creado: string;
}

export interface OpcionesRepositorio {
  /** Versiones anteriores de cada expediente que se conservan (auditoría y reversión). */
  versionesRetenidas?: number;
  scrypt?: ParametrosScrypt;
  maxIntentosAcceso?: number;
  bloqueoMinutos?: number;
  reloj?: () => Date;
}

const GENESIS = "0".repeat(64);
const b = (v: unknown): Buffer => (Buffer.isBuffer(v) ? v : Buffer.from(v as Uint8Array));
const n = (v: unknown): number => Number(v);

function huellaEntrada(e: { tenantId: string; seq: number; instante: string; actor: string; accion: string; objeto: string | null; detalleCifrado: Buffer | null; anterior: string }): string {
  return sha256(jsonEstable({ tenantId: e.tenantId, seq: e.seq, instante: e.instante, actor: e.actor, accion: e.accion, objeto: e.objeto, detalle: e.detalleCifrado ? sha256(e.detalleCifrado) : null, anterior: e.anterior }));
}

export class RepositorioSql {
  private hashFicticio: Promise<string> | null = null;
  private readonly o: Required<Omit<OpcionesRepositorio, "scrypt">> & { scrypt?: ParametrosScrypt };

  constructor(readonly conexion: ConexionSql, private readonly cifrador: Cifrador, opciones: OpcionesRepositorio = {}) {
    this.o = { versionesRetenidas: opciones.versionesRetenidas ?? 20, scrypt: opciones.scrypt, maxIntentosAcceso: opciones.maxIntentosAcceso ?? 5, bloqueoMinutos: opciones.bloqueoMinutos ?? 15, reloj: opciones.reloj ?? (() => new Date()) };
  }

  private ahora(): string {
    return this.o.reloj().toISOString();
  }

  async migrar(): Promise<number[]> {
    return migrar(this.conexion);
  }

  /* ─────────────────────────── Tenants y usuarios ─────────────────────────── */

  async asegurarTenant(id: string, nombre: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new ErrorDominio("TENANT_INVALIDO", `Tenant inválido: ${id}`);
    await this.conexion.ejecutar("INSERT INTO tenants (id, nombre, creado) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING", [id, nombre, this.ahora()]);
  }

  private usuarioDe(f: Fila): Usuario {
    return { id: String(f.id), tenantId: String(f.tenant_id), correo: String(f.correo), nombre: String(f.nombre), rol: f.rol as Rol, tarjetaProfesional: (f.tarjeta_profesional as string | null) ?? null, activo: n(f.activo) === 1, creado: String(f.creado) };
  }

  async crearUsuario(d: { tenantId: string; correo: string; nombre: string; rol: Rol; clave: string; tarjetaProfesional?: string | null }, actor = "SISTEMA"): Promise<Usuario> {
    const problema = evaluarClave(d.clave);
    if (problema) throw new ErrorDominio("CLAVE_DEBIL", problema);
    const correo = d.correo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorDominio("CORREO_INVALIDO", "Correo electrónico inválido.");
    if (await this.usuarioPorCorreo(d.tenantId, correo)) throw new ErrorDominio("USUARIO_EXISTE", "Ya existe un usuario con ese correo en el tenant.");
    const id = nuevoId("usr");
    const ahora = this.ahora();
    await this.conexion.ejecutar(
      "INSERT INTO usuarios (id, tenant_id, correo, nombre, rol, hash_clave, tarjeta_profesional, activo, intentos_fallidos, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)",
      [id, d.tenantId, correo, d.nombre.trim(), d.rol, await hashClave(d.clave, this.o.scrypt), d.tarjetaProfesional ?? null, ahora, ahora],
    );
    await this.registrar(d.tenantId, { actor, accion: "usuario.creado", objeto: id, detalle: { rol: d.rol } });
    return (await this.usuarioPorId(d.tenantId, id))!;
  }

  async usuarioPorCorreo(tenantId: string, correo: string): Promise<Usuario | null> {
    const f = (await this.conexion.consultar("SELECT * FROM usuarios WHERE tenant_id = ? AND correo = ?", [tenantId, correo.trim().toLowerCase()]))[0];
    return f ? this.usuarioDe(f) : null;
  }

  async usuarioPorId(tenantId: string, id: string): Promise<Usuario | null> {
    const f = (await this.conexion.consultar("SELECT * FROM usuarios WHERE tenant_id = ? AND id = ?", [tenantId, id]))[0];
    return f ? this.usuarioDe(f) : null;
  }

  async listarUsuarios(tenantId: string): Promise<Usuario[]> {
    return (await this.conexion.consultar("SELECT * FROM usuarios WHERE tenant_id = ? ORDER BY creado", [tenantId])).map((f) => this.usuarioDe(f));
  }

  async cambiarEstadoUsuario(tenantId: string, id: string, activo: boolean, actor: string): Promise<void> {
    await this.conexion.ejecutar("UPDATE usuarios SET activo = ?, actualizado = ? WHERE tenant_id = ? AND id = ?", [activo ? 1 : 0, this.ahora(), tenantId, id]);
    await this.registrar(tenantId, { actor, accion: activo ? "usuario.activado" : "usuario.desactivado", objeto: id, detalle: null });
  }

  async actualizarPerfil(tenantId: string, id: string, perfil: PerfilProfesional, actor: string): Promise<void> {
    const cifrado = this.cifrador.cifrarTexto(JSON.stringify(perfil), "secreto", `${tenantId}/perfil/${id}`);
    const filas = await this.conexion.ejecutar("UPDATE usuarios SET perfil = ?, tarjeta_profesional = ?, actualizado = ? WHERE tenant_id = ? AND id = ?", [cifrado, perfil.tarjetaProfesional, this.ahora(), tenantId, id]);
    if (filas !== 1) throw new ErrorDominio("USUARIO_INEXISTENTE", `No existe el usuario ${id}.`);
    await this.registrar(tenantId, { actor, accion: "usuario.perfil_actualizado", objeto: id, detalle: null });
  }

  async perfilProfesional(tenantId: string, id: string): Promise<PerfilProfesional | null> {
    const f = (await this.conexion.consultar("SELECT perfil, tarjeta_profesional FROM usuarios WHERE tenant_id = ? AND id = ?", [tenantId, id]))[0];
    if (!f) return null;
    if (!f.perfil) return { identificacion: null, tarjetaProfesional: (f.tarjeta_profesional as string | null) ?? null, correoRegistroNacional: null, telefono: null, direccion: null, ciudad: null };
    return JSON.parse(this.cifrador.descifrarTexto(b(f.perfil), "secreto", `${tenantId}/perfil/${id}`)) as PerfilProfesional;
  }

  async cambiarClave(tenantId: string, id: string, nueva: string, actor: string): Promise<void> {
    const problema = evaluarClave(nueva);
    if (problema) throw new ErrorDominio("CLAVE_DEBIL", problema);
    await this.conexion.ejecutar("UPDATE usuarios SET hash_clave = ?, intentos_fallidos = 0, bloqueado_hasta = NULL, actualizado = ? WHERE tenant_id = ? AND id = ?", [await hashClave(nueva, this.o.scrypt), this.ahora(), tenantId, id]);
    await this.registrar(tenantId, { actor, accion: "usuario.clave_cambiada", objeto: id, detalle: null });
  }

  /**
   * Autentica con bloqueo temporal tras intentos fallidos. Ante un correo
   * inexistente se ejecuta igualmente un scrypt para no revelar, por tiempo de
   * respuesta, qué correos existen.
   */
  async autenticar(tenantId: string, correo: string, clave: string): Promise<{ usuario: Usuario | null; motivo: "OK" | "CREDENCIALES" | "BLOQUEADO" | "INACTIVO" }> {
    const f = (await this.conexion.consultar("SELECT * FROM usuarios WHERE tenant_id = ? AND correo = ?", [tenantId, correo.trim().toLowerCase()]))[0];
    if (!f) {
      this.hashFicticio ??= hashClave(randomUUID(), this.o.scrypt);
      await verificarClave(clave, await this.hashFicticio);
      return { usuario: null, motivo: "CREDENCIALES" };
    }
    const ahora = this.o.reloj();
    if (f.bloqueado_hasta && new Date(String(f.bloqueado_hasta)) > ahora) return { usuario: null, motivo: "BLOQUEADO" };
    const valida = await verificarClave(clave, String(f.hash_clave));
    if (!valida) {
      const intentos = n(f.intentos_fallidos) + 1;
      const bloquear = intentos >= this.o.maxIntentosAcceso;
      await this.conexion.ejecutar("UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ?, actualizado = ? WHERE id = ?", [bloquear ? 0 : intentos, bloquear ? new Date(ahora.getTime() + this.o.bloqueoMinutos * 60_000).toISOString() : null, ahora.toISOString(), f.id as string]);
      await this.registrar(tenantId, { actor: String(f.id), accion: bloquear ? "acceso.bloqueado" : "acceso.fallido", objeto: String(f.id), detalle: { intentos } });
      return { usuario: null, motivo: bloquear ? "BLOQUEADO" : "CREDENCIALES" };
    }
    if (n(f.activo) !== 1) return { usuario: null, motivo: "INACTIVO" };
    await this.conexion.ejecutar("UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?", [f.id as string]);
    await this.registrar(tenantId, { actor: String(f.id), accion: "acceso.exitoso", objeto: String(f.id), detalle: null });
    return { usuario: this.usuarioDe(f), motivo: "OK" };
  }

  /* ─────────────────────────────── Expedientes ─────────────────────────────── */

  private aadExpediente(tenantId: string, id: string) {
    return `${tenantId}/${id}`;
  }

  private cifrarExpediente(e: Expediente): { titulo: Buffer; datos: Buffer; bytes: number } {
    const json = JSON.stringify(e);
    return {
      titulo: this.cifrador.cifrarTexto(e.titulo, "titulo", this.aadExpediente(e.tenantId, e.id)),
      datos: this.cifrador.cifrarTexto(json, "expediente", this.aadExpediente(e.tenantId, e.id)),
      bytes: Buffer.byteLength(json),
    };
  }

  async crearExpediente(e: Expediente, actor: string): Promise<Expediente> {
    const valido = Expediente.parse(e);
    const guardado = { ...valido, version: 1, actualizadoEn: this.ahora() };
    const c = this.cifrarExpediente(guardado);
    await this.conexion.transaccion(async (tx) => {
      await tx.ejecutar("INSERT INTO expedientes (id, tenant_id, propietario_id, titulo, estado, version, creado, actualizado, datos, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [guardado.id, guardado.tenantId, guardado.propietarioId, c.titulo, guardado.estado, 1, guardado.creadoEn, guardado.actualizadoEn, c.datos, c.bytes]);
      await this.guardarVersion(tx, guardado, actor, c.datos);
      await this.registrarEn(tx, guardado.tenantId, { actor, accion: "expediente.creado", objeto: guardado.id, detalle: { version: 1, estado: guardado.estado, huellaDatos: sha256(c.datos) } });
    });
    return guardado;
  }

  /** Instantánea de la versión; su huella queda en la bitácora encadenada, que así protege también el historial. */
  private async guardarVersion(tx: Consulta, e: Expediente, actor: string, datos: Buffer): Promise<void> {
    await tx.ejecutar("INSERT INTO expedientes_versiones (expediente_id, version, tenant_id, guardado, actor, datos) VALUES (?, ?, ?, ?, ?, ?)", [e.id, e.version, e.tenantId, e.actualizadoEn, actor, datos]);
    await tx.ejecutar("DELETE FROM expedientes_versiones WHERE expediente_id = ? AND version <= ?", [e.id, e.version - this.o.versionesRetenidas]);
  }

  async obtenerExpediente(tenantId: string, id: string): Promise<Expediente | null> {
    const f = (await this.conexion.consultar("SELECT datos FROM expedientes WHERE tenant_id = ? AND id = ?", [tenantId, id]))[0];
    if (!f) return null;
    return Expediente.parse(JSON.parse(this.cifrador.descifrarTexto(b(f.datos), "expediente", this.aadExpediente(tenantId, id))));
  }

  /**
   * Guarda con control optimista: si otro proceso guardó antes (versión
   * distinta de la esperada), falla con CONFLICTO_VERSION y no sobrescribe.
   */
  async guardarExpediente(e: Expediente, actor: string, accion = "expediente.actualizado", detalle: unknown = null): Promise<Expediente> {
    const valido = Expediente.parse(e);
    const esperada = valido.version;
    const guardado = { ...valido, version: esperada + 1, actualizadoEn: this.ahora() };
    const c = this.cifrarExpediente(guardado);
    await this.conexion.transaccion(async (tx) => {
      const filas = await tx.ejecutar("UPDATE expedientes SET titulo = ?, estado = ?, version = ?, actualizado = ?, datos = ?, bytes = ?, propietario_id = ? WHERE tenant_id = ? AND id = ? AND version = ?", [c.titulo, guardado.estado, guardado.version, guardado.actualizadoEn, c.datos, c.bytes, guardado.propietarioId, guardado.tenantId, guardado.id, esperada]);
      if (filas !== 1) {
        const actual = (await tx.consultar("SELECT version FROM expedientes WHERE tenant_id = ? AND id = ?", [guardado.tenantId, guardado.id]))[0];
        if (!actual) throw new ErrorDominio("EXPEDIENTE_INEXISTENTE", `No existe el expediente ${guardado.id}.`);
        throw new ErrorDominio("CONFLICTO_VERSION", `El expediente ${guardado.id} fue modificado por otro proceso (versión ${n(actual.version)}, se esperaba ${esperada}).`, { actual: n(actual.version), esperada });
      }
      await this.guardarVersion(tx, guardado, actor, c.datos);
      const extra = detalle && typeof detalle === "object" && !Array.isArray(detalle) ? (detalle as Record<string, unknown>) : detalle === null ? {} : { detalle };
      await this.registrarEn(tx, guardado.tenantId, { actor, accion, objeto: guardado.id, detalle: { ...extra, version: guardado.version, estado: guardado.estado, huellaDatos: sha256(c.datos) } });
    });
    return guardado;
  }

  /** Lee, modifica y guarda con reintento ante conflicto de versión. */
  async actualizarExpediente(tenantId: string, id: string, actor: string, fn: (e: Expediente) => Expediente | Promise<Expediente>, opciones: { accion?: string; detalle?: unknown; reintentos?: number } = {}): Promise<Expediente> {
    for (let intento = 0; ; intento++) {
      const actual = await this.obtenerExpediente(tenantId, id);
      if (!actual) throw new ErrorDominio("EXPEDIENTE_INEXISTENTE", `No existe el expediente ${id}.`);
      try {
        return await this.guardarExpediente(await fn(structuredClone(actual)), actor, opciones.accion, opciones.detalle);
      } catch (e) {
        if (!(e instanceof ErrorDominio && e.codigo === "CONFLICTO_VERSION") || intento >= (opciones.reintentos ?? 3)) throw e;
      }
    }
  }

  async listarExpedientes(tenantId: string, filtro: { propietarioId?: string; estado?: string; limite?: number } = {}): Promise<ResumenExpediente[]> {
    const condiciones = ["tenant_id = ?"];
    const params: Valor[] = [tenantId];
    if (filtro.propietarioId) condiciones.push("propietario_id = ?"), params.push(filtro.propietarioId);
    if (filtro.estado) condiciones.push("estado = ?"), params.push(filtro.estado);
    params.push(filtro.limite ?? 200);
    const filas = await this.conexion.consultar(`SELECT id, tenant_id, propietario_id, titulo, estado, version, creado, actualizado, bytes FROM expedientes WHERE ${condiciones.join(" AND ")} ORDER BY actualizado DESC LIMIT ?`, params);
    return filas.map((f) => ({
      id: String(f.id), tenantId: String(f.tenant_id), propietarioId: String(f.propietario_id),
      titulo: this.cifrador.descifrarTexto(b(f.titulo), "titulo", this.aadExpediente(tenantId, String(f.id))),
      estado: String(f.estado), version: n(f.version), creado: String(f.creado), actualizado: String(f.actualizado), bytes: n(f.bytes),
    }));
  }

  async versiones(tenantId: string, id: string): Promise<Array<{ version: number; guardado: string; actor: string }>> {
    return (await this.conexion.consultar("SELECT version, guardado, actor FROM expedientes_versiones WHERE tenant_id = ? AND expediente_id = ? ORDER BY version", [tenantId, id])).map((f) => ({ version: n(f.version), guardado: String(f.guardado), actor: String(f.actor) }));
  }

  async obtenerVersion(tenantId: string, id: string, version: number): Promise<Expediente | null> {
    const f = (await this.conexion.consultar("SELECT datos FROM expedientes_versiones WHERE tenant_id = ? AND expediente_id = ? AND version = ?", [tenantId, id, version]))[0];
    if (!f) return null;
    const datos = b(f.datos);
    const registrada = (await this.bitacora(tenantId, { objeto: id, limite: 100_000 })).find((x) => (x.detalle as { version?: number } | null)?.version === version);
    const huella = (registrada?.detalle as { huellaDatos?: string } | undefined)?.huellaDatos;
    if (huella && huella !== sha256(datos)) throw new ErrorDominio("INTEGRIDAD", `La versión ${version} del expediente ${id} no coincide con la huella registrada en la bitácora.`);
    const e = Expediente.parse(JSON.parse(this.cifrador.descifrarTexto(datos, "expediente", this.aadExpediente(tenantId, id))));
    if (e.version !== version) throw new ErrorDominio("INTEGRIDAD", `La instantánea guardada como versión ${version} contiene la versión ${e.version}.`);
    return e;
  }

  /**
   * Supresión (Ley 1581 de 2012, art. 8 lit. e): borra el expediente, sus
   * versiones, sus términos indexados y las lecciones derivadas; devuelve los
   * blobs que el llamador debe eliminar. La bitácora conserva el hecho, no el contenido.
   */
  async suprimirExpediente(tenantId: string, id: string, actor: string, motivo: string): Promise<{ blobs: string[] }> {
    const e = await this.obtenerExpediente(tenantId, id);
    if (!e) throw new ErrorDominio("EXPEDIENTE_INEXISTENTE", `No existe el expediente ${id}.`);
    const blobs = [...new Set([
      ...e.archivos.flatMap((a) => [a.blobId, a.pdfCanonicoBlobId, a.originalCifradoBlobId]),
      ...e.piezas.map((p) => p.blobId), ...e.entregables.map((x) => x.blobId), ...e.procedencias.map((p) => p.blobResultadoId),
    ].filter((x): x is string => Boolean(x)))];
    const origenes = this.cifrador.huellasPrivadas(`${tenantId}/${id}`, "memoria");
    await this.conexion.transaccion(async (tx) => {
      await tx.ejecutar("DELETE FROM expedientes WHERE tenant_id = ? AND id = ?", [tenantId, id]);
      await tx.ejecutar("DELETE FROM expedientes_versiones WHERE tenant_id = ? AND expediente_id = ?", [tenantId, id]);
      await tx.ejecutar("DELETE FROM terminos WHERE tenant_id = ? AND expediente_id = ?", [tenantId, id]);
      await tx.ejecutar(`DELETE FROM memoria WHERE tenant_id = ? AND origen IN (${origenes.map(() => "?").join(", ")})`, [tenantId, ...origenes]);
      await tx.ejecutar("UPDATE trabajos SET estado = 'CANCELADO', actualizado = ? WHERE tenant_id = ? AND expediente_id = ? AND estado IN ('PENDIENTE', 'EN_CURSO')", [this.ahora(), tenantId, id]);
      await this.registrarEn(tx, tenantId, { actor, accion: "expediente.suprimido", objeto: id, detalle: { motivo, blobs: blobs.length } });
    });
    return { blobs };
  }

  /* ──────────────────────────────── Bitácora ──────────────────────────────── */

  async registrar(tenantId: string, e: { actor: string; accion: string; objeto?: string | null; detalle?: unknown }): Promise<EntradaBitacora> {
    return this.conexion.transaccion((tx) => this.registrarEn(tx, tenantId, e));
  }

  /** Añade una entrada encadenada dentro de una transacción ya abierta. */
  async registrarEn(tx: Consulta, tenantId: string, e: { actor: string; accion: string; objeto?: string | null; detalle?: unknown }): Promise<EntradaBitacora> {
    await tx.ejecutar("INSERT INTO cadenas (tenant_id, seq, huella) VALUES (?, 0, ?) ON CONFLICT (tenant_id) DO NOTHING", [tenantId, GENESIS]);
    const cabeza = (await tx.consultar(`SELECT seq, huella FROM cadenas WHERE tenant_id = ?${tx.dialecto === "postgres" ? " FOR UPDATE" : ""}`, [tenantId]))[0]!;
    const seq = n(cabeza.seq) + 1;
    const anterior = String(cabeza.huella);
    const instante = this.ahora();
    const detalleCifrado = e.detalle === undefined || e.detalle === null ? null : this.cifrador.cifrarTexto(jsonEstable(e.detalle), "bitacora", `${tenantId}#${seq}`);
    const entrada = { tenantId, seq, instante, actor: e.actor, accion: e.accion, objeto: e.objeto ?? null, detalleCifrado, anterior };
    const huella = huellaEntrada(entrada);
    await tx.ejecutar("INSERT INTO bitacora (tenant_id, seq, instante, actor, accion, objeto, detalle, huella, anterior) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [tenantId, seq, instante, e.actor, e.accion, entrada.objeto, detalleCifrado, huella, anterior]);
    await tx.ejecutar("UPDATE cadenas SET seq = ?, huella = ? WHERE tenant_id = ?", [seq, huella, tenantId]);
    return { tenantId, seq, instante, actor: e.actor, accion: e.accion, objeto: entrada.objeto, detalle: e.detalle ?? null, huella, anterior };
  }

  async bitacora(tenantId: string, filtro: { objeto?: string; desdeSeq?: number; limite?: number } = {}): Promise<EntradaBitacora[]> {
    const condiciones = ["tenant_id = ?"];
    const params: Valor[] = [tenantId];
    if (filtro.objeto) condiciones.push("objeto = ?"), params.push(filtro.objeto);
    if (filtro.desdeSeq) condiciones.push("seq >= ?"), params.push(filtro.desdeSeq);
    params.push(filtro.limite ?? 500);
    const filas = await this.conexion.consultar(`SELECT * FROM bitacora WHERE ${condiciones.join(" AND ")} ORDER BY seq LIMIT ?`, params);
    return filas.map((f) => ({
      tenantId, seq: n(f.seq), instante: String(f.instante), actor: String(f.actor), accion: String(f.accion), objeto: (f.objeto as string | null) ?? null,
      detalle: f.detalle ? JSON.parse(this.cifrador.descifrarTexto(b(f.detalle), "bitacora", `${tenantId}#${n(f.seq)}`)) : null,
      huella: String(f.huella), anterior: String(f.anterior),
    }));
  }

  /**
   * Recalcula la cadena completa. No necesita la clave: la huella cubre el
   * detalle cifrado, de modo que un auditor externo puede verificar la
   * integridad sin acceder al contenido.
   */
  async verificarBitacora(tenantId: string): Promise<VerificacionBitacora> {
    let anterior = GENESIS;
    let entradas = 0;
    let desde = 0;
    for (;;) {
      const filas = await this.conexion.consultar("SELECT * FROM bitacora WHERE tenant_id = ? AND seq > ? ORDER BY seq LIMIT 1000", [tenantId, desde]);
      if (!filas.length) break;
      for (const f of filas) {
        const seq = n(f.seq);
        const esperadaSeq = entradas + 1;
        const rotura = (motivo: string): VerificacionBitacora => ({ integra: false, entradas, primeraRotura: seq, motivo, cabeza: anterior });
        if (seq !== esperadaSeq) return rotura(`Falta la entrada ${esperadaSeq} (se encontró ${seq}).`);
        if (String(f.anterior) !== anterior) return rotura(`La entrada ${seq} no enlaza con la anterior.`);
        const calculada = huellaEntrada({ tenantId, seq, instante: String(f.instante), actor: String(f.actor), accion: String(f.accion), objeto: (f.objeto as string | null) ?? null, detalleCifrado: f.detalle ? b(f.detalle) : null, anterior });
        if (calculada !== String(f.huella)) return rotura(`La huella de la entrada ${seq} no corresponde a su contenido.`);
        anterior = calculada;
        entradas += 1;
        desde = seq;
      }
    }
    const cabeza = (await this.conexion.consultar("SELECT seq, huella FROM cadenas WHERE tenant_id = ?", [tenantId]))[0];
    if (cabeza && (n(cabeza.seq) !== entradas || String(cabeza.huella) !== anterior)) return { integra: false, entradas, primeraRotura: entradas + 1, motivo: "La cabeza de la cadena no coincide con la última entrada (posible supresión de entradas finales).", cabeza: anterior };
    return { integra: true, entradas, primeraRotura: null, motivo: null, cabeza: anterior };
  }

  /* ──────────────────────────── Cola de trabajos ──────────────────────────── */

  private trabajoDe(f: Fila): Trabajo {
    return {
      id: String(f.id), tenantId: String(f.tenant_id), expedienteId: (f.expediente_id as string | null) ?? null, tipo: String(f.tipo), estado: f.estado as EstadoTrabajo,
      carga: f.carga ? JSON.parse(String(f.carga)) : null, intentos: n(f.intentos), maxIntentos: n(f.max_intentos), disponibleEn: String(f.disponible_en),
      bloqueadoPor: (f.bloqueado_por as string | null) ?? null, bloqueadoHasta: (f.bloqueado_hasta as string | null) ?? null, error: (f.error as string | null) ?? null,
      resultado: f.resultado ? JSON.parse(String(f.resultado)) : null, creado: String(f.creado), actualizado: String(f.actualizado),
    };
  }

  /** La carga de un trabajo no lleva datos personales: solo identificadores y parámetros. */
  async encolar(d: { tenantId: string; expedienteId?: string | null; tipo: string; carga?: unknown; disponibleEn?: Date; maxIntentos?: number }): Promise<Trabajo> {
    const id = `trb_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const ahora = this.ahora();
    await this.conexion.ejecutar("INSERT INTO trabajos (id, tenant_id, expediente_id, tipo, estado, carga, intentos, max_intentos, disponible_en, creado, actualizado) VALUES (?, ?, ?, ?, 'PENDIENTE', ?, 0, ?, ?, ?, ?)", [id, d.tenantId, d.expedienteId ?? null, d.tipo, d.carga === undefined ? null : JSON.stringify(d.carga), d.maxIntentos ?? 3, (d.disponibleEn ?? this.o.reloj()).toISOString(), ahora, ahora]);
    return (await this.trabajo(id))!;
  }

  async trabajo(id: string): Promise<Trabajo | null> {
    const f = (await this.conexion.consultar("SELECT * FROM trabajos WHERE id = ?", [id]))[0];
    return f ? this.trabajoDe(f) : null;
  }

  async trabajosDe(tenantId: string, expedienteId: string): Promise<Trabajo[]> {
    return (await this.conexion.consultar("SELECT * FROM trabajos WHERE tenant_id = ? AND expediente_id = ? ORDER BY creado", [tenantId, expedienteId])).map((f) => this.trabajoDe(f));
  }

  /** Arrienda el siguiente trabajo disponible (o uno cuyo arriendo venció). Varios procesos pueden tomar trabajos sin duplicarlos. */
  async tomarTrabajo(trabajador: string, arriendoMs: number, tipos?: string[]): Promise<Trabajo | null> {
    return this.conexion.transaccion(async (tx) => {
      const ahora = this.ahora();
      const filtroTipo = tipos?.length ? ` AND tipo IN (${tipos.map(() => "?").join(", ")})` : "";
      const candidato = (await tx.consultar(
        `SELECT id FROM trabajos WHERE ((estado = 'PENDIENTE' AND disponible_en <= ?) OR (estado = 'EN_CURSO' AND bloqueado_hasta < ?))${filtroTipo} ORDER BY disponible_en LIMIT 1${tx.dialecto === "postgres" ? " FOR UPDATE SKIP LOCKED" : ""}`,
        [ahora, ahora, ...(tipos ?? [])],
      ))[0];
      if (!candidato) return null;
      const hasta = new Date(this.o.reloj().getTime() + arriendoMs).toISOString();
      await tx.ejecutar("UPDATE trabajos SET estado = 'EN_CURSO', bloqueado_por = ?, bloqueado_hasta = ?, intentos = intentos + 1, actualizado = ? WHERE id = ?", [trabajador, hasta, ahora, String(candidato.id)]);
      return this.trabajoDe((await tx.consultar("SELECT * FROM trabajos WHERE id = ?", [String(candidato.id)]))[0]!);
    });
  }

  async renovarArriendo(id: string, trabajador: string, arriendoMs: number): Promise<boolean> {
    return (await this.conexion.ejecutar("UPDATE trabajos SET bloqueado_hasta = ?, actualizado = ? WHERE id = ? AND bloqueado_por = ? AND estado = 'EN_CURSO'", [new Date(this.o.reloj().getTime() + arriendoMs).toISOString(), this.ahora(), id, trabajador])) === 1;
  }

  async completarTrabajo(id: string, trabajador: string, resultado: unknown = null): Promise<void> {
    await this.conexion.ejecutar("UPDATE trabajos SET estado = 'COMPLETADO', resultado = ?, bloqueado_por = NULL, bloqueado_hasta = NULL, error = NULL, actualizado = ? WHERE id = ? AND bloqueado_por = ?", [JSON.stringify(resultado), this.ahora(), id, trabajador]);
  }

  /** Falla con reintento exponencial hasta agotar los intentos; después queda FALLIDO. */
  async fallarTrabajo(id: string, trabajador: string, error: string, baseMs = 30_000): Promise<Trabajo | null> {
    await this.conexion.transaccion(async (tx) => {
      const f = (await tx.consultar("SELECT * FROM trabajos WHERE id = ? AND bloqueado_por = ?", [id, trabajador]))[0];
      if (!f) return;
      const agotado = n(f.intentos) >= n(f.max_intentos);
      const siguiente = new Date(this.o.reloj().getTime() + baseMs * 2 ** Math.max(0, n(f.intentos) - 1)).toISOString();
      await tx.ejecutar("UPDATE trabajos SET estado = ?, error = ?, disponible_en = ?, bloqueado_por = NULL, bloqueado_hasta = NULL, actualizado = ? WHERE id = ?", [agotado ? "FALLIDO" : "PENDIENTE", error.slice(0, 2000), agotado ? String(f.disponible_en) : siguiente, this.ahora(), id]);
    });
    return this.trabajo(id);
  }

  async cancelarTrabajo(id: string): Promise<void> {
    await this.conexion.ejecutar("UPDATE trabajos SET estado = 'CANCELADO', bloqueado_por = NULL, bloqueado_hasta = NULL, actualizado = ? WHERE id = ? AND estado IN ('PENDIENTE', 'EN_CURSO')", [this.ahora(), id]);
  }

  /* ───────────────────────── Índice de términos (M18) ───────────────────────── */

  /** Reemplaza los términos indexados de un expediente (la descripción se cifra). */
  async indexarTerminos(tenantId: string, expedienteId: string, terminos: Termino[]): Promise<void> {
    const ahora = this.ahora();
    await this.conexion.transaccion(async (tx) => {
      await tx.ejecutar("DELETE FROM terminos WHERE tenant_id = ? AND expediente_id = ?", [tenantId, expedienteId]);
      for (const t of terminos) {
        await tx.ejecutar(
          "INSERT INTO terminos (expediente_id, id, tenant_id, tipo, estado, vencimiento, vencimiento_temprano, dias_habiles, es_estimacion, descripcion, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [expedienteId, t.id, tenantId, t.tipo, t.estado, t.vencimiento, t.vencimientoMasTemprano, t.diasHabilesRestantes, t.esEstimacion ? 1 : 0, this.cifrador.cifrarTexto(`${t.descripcion} (${t.norma})`, "termino", `${tenantId}/${expedienteId}/${t.id}`), ahora],
        );
      }
    });
  }

  /** Vencimientos de todos los expedientes del tenant hasta una fecha (tablero de términos). */
  async vencimientos(tenantId: string, hasta: string, estados?: string[]): Promise<TerminoIndexado[]> {
    const filtro = estados?.length ? ` AND estado IN (${estados.map(() => "?").join(", ")})` : "";
    const filas = await this.conexion.consultar(`SELECT * FROM terminos WHERE tenant_id = ? AND COALESCE(vencimiento_temprano, vencimiento) <= ?${filtro} ORDER BY COALESCE(vencimiento_temprano, vencimiento)`, [tenantId, hasta, ...(estados ?? [])]);
    return filas.map((f) => ({
      expedienteId: String(f.expediente_id), terminoId: String(f.id), tipo: String(f.tipo), estado: String(f.estado), vencimiento: String(f.vencimiento),
      vencimientoMasTemprano: (f.vencimiento_temprano as string | null) ?? null, diasHabilesRestantes: f.dias_habiles === null ? null : n(f.dias_habiles), esEstimacion: n(f.es_estimacion) === 1,
      descripcion: this.cifrador.descifrarTexto(b(f.descripcion), "termino", `${tenantId}/${String(f.expediente_id)}/${String(f.id)}`),
    }));
  }

  /* ─────────────────────── Memoria institucional (M26) ─────────────────────── */

  /**
   * Guarda una lección YA disociada. El expediente de origen solo queda como
   * huella con clave: permite suprimir sus lecciones sin poder identificarlo.
   */
  async guardarLeccion(tenantId: string, d: { tipo: string; area: string | null; clave: string; contenido: unknown; expedienteOrigen: string }): Promise<{ id: string; nueva: boolean }> {
    const clave = sha256(`${d.tipo}|${d.area ?? ""}|${d.clave.trim().toLowerCase()}`);
    const existente = (await this.conexion.consultar("SELECT id FROM memoria WHERE tenant_id = ? AND clave = ?", [tenantId, clave]))[0];
    if (existente) {
      await this.conexion.ejecutar("UPDATE memoria SET usos = usos + 1 WHERE id = ?", [String(existente.id)]);
      return { id: String(existente.id), nueva: false };
    }
    const id = nuevoId("mem");
    await this.conexion.ejecutar("INSERT INTO memoria (id, tenant_id, tipo, area, clave, contenido, origen, usos, creado) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)", [id, tenantId, d.tipo, d.area, clave, this.cifrador.cifrarTexto(JSON.stringify(d.contenido), "memoria", `${tenantId}/${id}`), this.cifrador.huellaPrivada(`${tenantId}/${d.expedienteOrigen}`, "memoria"), this.ahora()]);
    return { id, nueva: true };
  }

  async lecciones(tenantId: string, filtro: { area?: string | null; tipo?: string; limite?: number } = {}): Promise<Leccion[]> {
    const condiciones = ["tenant_id = ?"];
    const params: Valor[] = [tenantId];
    if (filtro.area) condiciones.push("(area = ? OR area IS NULL)"), params.push(filtro.area);
    if (filtro.tipo) condiciones.push("tipo = ?"), params.push(filtro.tipo);
    params.push(filtro.limite ?? 50);
    const filas = await this.conexion.consultar(`SELECT * FROM memoria WHERE ${condiciones.join(" AND ")} ORDER BY usos DESC, creado DESC LIMIT ?`, params);
    return filas.map((f) => ({ id: String(f.id), tipo: String(f.tipo), area: (f.area as string | null) ?? null, contenido: JSON.parse(this.cifrador.descifrarTexto(b(f.contenido), "memoria", `${tenantId}/${String(f.id)}`)), usos: n(f.usos), creado: String(f.creado) }));
  }

  async cerrar(): Promise<void> {
    await this.conexion.cerrar();
  }
}
