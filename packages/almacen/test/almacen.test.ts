import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearExpediente, ErrorDominio, type Termino } from "@em/dominio";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  abrirConexion, adaptar, BlobsEnDisco, BlobsEnMemoria, Cifrador, cifradorDesdeEntorno, claveAleatoria, decodificarClave, hashClave, RepositorioSql, verificarClave,
} from "../src";

const clave = (kid: string) => ({ kid, material: decodificarClave(claveAleatoria()) });
const RAPIDO = { N: 2 ** 10, r: 8, p: 1 };
const AHORA = "2026-09-25T15:00:00.000Z";

describe("cifrado en reposo", () => {
  const c = new Cifrador(clave("k1"));

  it("cifra y descifra atado al registro (AAD)", () => {
    const t = c.cifrar("expediente de Persona Ficticia", "expediente", "t1/exp_1");
    expect(t.includes(Buffer.from("Persona Ficticia"))).toBe(false);
    expect(c.descifrarTexto(t, "expediente", "t1/exp_1")).toBe("expediente de Persona Ficticia");
    expect(() => c.descifrar(t, "expediente", "t1/exp_2")).toThrow(ErrorDominio);
    expect(() => c.descifrar(t, "blob", "t1/exp_1")).toThrow(/integridad/);
  });

  it("detecta alteraciones del texto cifrado", () => {
    const t = c.cifrar("dato", "blob", "x");
    t[t.length - 1]! ^= 0x01;
    expect(() => c.descifrar(t, "blob", "x")).toThrow(/integridad/);
  });

  it("rota claves: lo cifrado con la anterior sigue legible y lo nuevo usa la actual", () => {
    const vieja = clave("k1");
    const nueva = clave("k2");
    const antes = new Cifrador(vieja).cifrar("histórico", "memoria", "a");
    const rotado = new Cifrador(nueva, [vieja]);
    expect(rotado.descifrarTexto(antes, "memoria", "a")).toBe("histórico");
    expect(Cifrador.kidDe(rotado.cifrar("nuevo", "memoria", "a"))).toBe("k2");
    expect(() => new Cifrador(nueva).descifrar(antes, "memoria", "a")).toThrow(/k1/);
  });

  it("exige la clave maestra en producción y protege la clave de desarrollo", async () => {
    expect(() => cifradorDesdeEntorno({ NODE_ENV: "production" })).toThrow(/obligatoria en producción/);
    const dir = await mkdtemp(join(tmpdir(), "em-clave-"));
    const archivo = join(dir, "clave.key");
    const r = cifradorDesdeEntorno({ NODE_ENV: "development" }, archivo);
    expect(r.origen).toBe("ARCHIVO_DESARROLLO");
    expect(r.advertencia).toMatch(/No cargue expedientes reales/);
    expect((await stat(archivo)).mode & 0o777).toBe(0o600);
    expect(cifradorDesdeEntorno({ EM_CLAVE_MAESTRA: claveAleatoria(), EM_CLAVE_ID: "prod1" }).cifrador.kidActual).toBe("prod1");
    await rm(dir, { recursive: true, force: true });
  });
});

describe("blobs cifrados", () => {
  const c = new Cifrador(clave("k1"));

  it("en disco: nada en claro, integridad verificada y aislamiento por tenant", async () => {
    const dir = await mkdtemp(join(tmpdir(), "em-blobs-"));
    const blobs = new BlobsEnDisco(dir, c);
    const secreto = Buffer.from("PAGARÉ suscrito por PERSONA NATURAL FICTICIA por $10.000.000");
    const g = await blobs.guardar(secreto, { tenantId: "t1", mime: "text/plain" });
    expect(await blobs.leer(g.blobId, "t1")).toEqual(secreto);
    const archivos: string[] = [];
    const recorrer = async (d: string): Promise<void> => {
      for (const e of await readdir(d, { withFileTypes: true })) e.isDirectory() ? await recorrer(join(d, e.name)) : archivos.push(join(d, e.name));
    };
    await recorrer(dir);
    expect(archivos).toHaveLength(1);
    const crudo = await readFile(archivos[0]!);
    expect(crudo.includes(Buffer.from("FICTICIA"))).toBe(false);
    await expect(blobs.leer(g.blobId, "t2")).rejects.toThrow();
    crudo[crudo.length - 3]! ^= 0xff;
    await writeFile(archivos[0]!, crudo);
    await expect(blobs.leer(g.blobId, "t1")).rejects.toThrow(/integridad/);
    await expect(blobs.leer("../../etc/passwd", "t1")).rejects.toThrow(/inválido/);
    await rm(dir, { recursive: true, force: true });
  });

  it("en memoria cifra igual", async () => {
    const m = new BlobsEnMemoria(c);
    const g = await m.guardar(Buffer.from("hola mundo"), { tenantId: "t1" });
    expect(m.crudo(g.blobId, "t1")!.includes(Buffer.from("hola"))).toBe(false);
    expect((await m.leer(g.blobId, "t1")).toString()).toBe("hola mundo");
  });
});

describe("contraseñas", () => {
  it("scrypt con parámetros en el formato y comparación constante", async () => {
    const h = await hashClave("clave-segura-2026", RAPIDO);
    expect(h).toMatch(/^scrypt\$1024\$8\$1\$/);
    expect(await verificarClave("clave-segura-2026", h)).toBe(true);
    expect(await verificarClave("clave-segura-2027", h)).toBe(false);
    expect(await verificarClave("x", "formato-invalido")).toBe(false);
  });

  it("adapta marcadores y tipos binarios por dialecto", () => {
    expect(adaptar("SELECT ? , ? FROM t WHERE b = {{BIN}}", "postgres")).toBe("SELECT $1 , $2 FROM t WHERE b = BYTEA");
    expect(adaptar("x {{BIN}} ?", "sqlite")).toBe("x BLOB ?");
  });
});

/* ── Repositorio: la misma batería sobre SQLite y, si está configurado, PostgreSQL ── */

const URL_PG = process.env.EM_TEST_POSTGRES_URL;
const motores: Array<[string, () => Promise<{ url: string; limpiar: () => Promise<void> }>]> = [
  ["sqlite", async () => ({ url: "sqlite::memory:", limpiar: async () => undefined })],
];
if (URL_PG) {
  motores.push(["postgres", async () => {
    const esquema = `t_${Math.random().toString(36).slice(2, 10)}`;
    const admin = new pg.Client({ connectionString: URL_PG });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${esquema}`);
    await admin.end();
    const sep = URL_PG.includes("?") ? "&" : "?";
    return {
      url: `${URL_PG}${sep}options=${encodeURIComponent(`-c search_path=${esquema}`)}`,
      limpiar: async () => {
        const a = new pg.Client({ connectionString: URL_PG });
        await a.connect();
        await a.query(`DROP SCHEMA ${esquema} CASCADE`);
        await a.end();
      },
    };
  }]);
}

describe.each(motores)("repositorio sobre %s", (_nombre, preparar) => {
  let repo: RepositorioSql;
  let limpiar: () => Promise<void>;
  let reloj = new Date(AHORA);
  const cifrador = new Cifrador(clave("k1"));

  beforeAll(async () => {
    const p = await preparar();
    limpiar = p.limpiar;
    repo = new RepositorioSql(abrirConexion(p.url), cifrador, { scrypt: RAPIDO, versionesRetenidas: 3, reloj: () => reloj });
    expect(await repo.migrar()).toEqual([1, 2]);
    expect(await repo.migrar()).toEqual([]);
    await repo.asegurarTenant("t1", "Despacho de prueba");
    await repo.asegurarTenant("t2", "Otro despacho");
  });

  afterAll(async () => {
    await repo.cerrar();
    await limpiar();
  });

  const nuevo = (id: string, titulo = "Ejecutivo de SOCIEDAD FICTICIA UNO contra PERSONA NATURAL FICTICIA") =>
    crearExpediente({ id, tenantId: "t1", propietarioId: "usr_1", titulo, ahora: AHORA, contexto: { cliente: { nombre: "SOCIEDAD FICTICIA UNO S.A.S.", identificacion: "900000000", rol: "EJECUTANTE" } } });

  it("usuarios: política de clave, autenticación, bloqueo e inactividad", async () => {
    await expect(repo.crearUsuario({ tenantId: "t1", correo: "abogado@ejemplo.test", nombre: "Abogado", rol: "ABOGADO", clave: "corta" })).rejects.toThrow(/12 caracteres/);
    const u = await repo.crearUsuario({ tenantId: "t1", correo: "Abogado@Ejemplo.test", nombre: "Abogado de prueba", rol: "ABOGADO", clave: "clave-segura-2026", tarjetaProfesional: "T.P. 000000" });
    expect(u.correo).toBe("abogado@ejemplo.test");
    await expect(repo.crearUsuario({ tenantId: "t1", correo: "abogado@ejemplo.test", nombre: "x", rol: "ABOGADO", clave: "clave-segura-2026" })).rejects.toThrow(/Ya existe/);
    expect((await repo.autenticar("t1", "abogado@ejemplo.test", "clave-segura-2026")).motivo).toBe("OK");
    expect((await repo.autenticar("t2", "abogado@ejemplo.test", "clave-segura-2026")).motivo).toBe("CREDENCIALES");
    for (let i = 0; i < 4; i++) expect((await repo.autenticar("t1", "abogado@ejemplo.test", "incorrecta-00000")).motivo).toBe("CREDENCIALES");
    expect((await repo.autenticar("t1", "abogado@ejemplo.test", "incorrecta-00000")).motivo).toBe("BLOQUEADO");
    expect((await repo.autenticar("t1", "abogado@ejemplo.test", "clave-segura-2026")).motivo).toBe("BLOQUEADO");
    reloj = new Date(reloj.getTime() + 16 * 60_000);
    expect((await repo.autenticar("t1", "abogado@ejemplo.test", "clave-segura-2026")).motivo).toBe("OK");
    await repo.actualizarPerfil("t1", u.id, { identificacion: "C.C. 0000000", tarjetaProfesional: "T.P. 000000", correoRegistroNacional: "abogado@ejemplo.test", telefono: null, direccion: "Calle Ficticia 1", ciudad: "Bogotá D.C." }, "admin");
    expect((await repo.perfilProfesional("t1", u.id))!.direccion).toBe("Calle Ficticia 1");
    const crudoPerfil = await repo.conexion.consultar<{ perfil: Buffer }>("SELECT perfil FROM usuarios WHERE id = ?", [u.id]);
    expect(Buffer.from(crudoPerfil[0]!.perfil).includes(Buffer.from("Ficticia"))).toBe(false);
    await repo.cambiarEstadoUsuario("t1", u.id, false, "admin");
    expect((await repo.autenticar("t1", "abogado@ejemplo.test", "clave-segura-2026")).motivo).toBe("INACTIVO");
  });

  it("expedientes cifrados con control optimista de versión", async () => {
    const creado = await repo.crearExpediente(nuevo("exp_a"), "usr_1");
    expect(creado.version).toBe(1);
    const crudo = await repo.conexion.consultar<{ titulo: Buffer; datos: Buffer }>("SELECT titulo, datos FROM expedientes WHERE id = ?", ["exp_a"]);
    const bytes = Buffer.concat([Buffer.from(crudo[0]!.titulo), Buffer.from(crudo[0]!.datos)]);
    expect(bytes.includes(Buffer.from("FICTICIA"))).toBe(false);
    expect(bytes.includes(Buffer.from("900000000"))).toBe(false);

    const leido = (await repo.obtenerExpediente("t1", "exp_a"))!;
    expect(leido.contexto.cliente?.nombre).toBe("SOCIEDAD FICTICIA UNO S.A.S.");
    expect(await repo.obtenerExpediente("t2", "exp_a")).toBeNull();

    const v2 = await repo.guardarExpediente({ ...leido, estado: "EN_PROCESO" }, "usr_1");
    expect(v2.version).toBe(2);
    await expect(repo.guardarExpediente({ ...leido, estado: "ERROR" }, "usr_1")).rejects.toMatchObject({ codigo: "CONFLICTO_VERSION" });
    const v3 = await repo.actualizarExpediente("t1", "exp_a", "usr_1", (e) => ({ ...e, lecciones: [...e.lecciones, "nota"] }));
    expect(v3.version).toBe(3);
    const lista = await repo.listarExpedientes("t1");
    expect(lista.map((x) => [x.id, x.titulo, x.version])).toEqual([["exp_a", "Ejecutivo de SOCIEDAD FICTICIA UNO contra PERSONA NATURAL FICTICIA", 3]]);
  });

  it("historial de versiones acotado e íntegro frente a la bitácora", async () => {
    for (let i = 0; i < 3; i++) await repo.actualizarExpediente("t1", "exp_a", "usr_1", (e) => ({ ...e, lecciones: [...e.lecciones, `n${i}`] }));
    const versiones = await repo.versiones("t1", "exp_a");
    expect(versiones.map((v) => v.version)).toEqual([4, 5, 6]);
    expect((await repo.obtenerVersion("t1", "exp_a", 5))!.lecciones).toEqual(["nota", "n0", "n1"]);
    expect(await repo.obtenerVersion("t1", "exp_a", 2)).toBeNull();
    // Sustituir la instantánea 5 por la 4 se detecta contra la huella encadenada.
    await repo.conexion.ejecutar("UPDATE expedientes_versiones SET datos = (SELECT datos FROM expedientes_versiones WHERE expediente_id = ? AND version = 4) WHERE expediente_id = ? AND version = 5", ["exp_a", "exp_a"]);
    await expect(repo.obtenerVersion("t1", "exp_a", 5)).rejects.toThrow(/huella registrada/);
  });

  it("bitácora encadenada: íntegra, y detecta alteración y supresión", async () => {
    const v = await repo.verificarBitacora("t1");
    expect(v.integra).toBe(true);
    expect(v.entradas).toBeGreaterThan(10);
    const entradas = await repo.bitacora("t1", { objeto: "exp_a" });
    expect(entradas[0]!.accion).toBe("expediente.creado");
    expect((entradas[0]!.detalle as { huellaDatos: string }).huellaDatos).toMatch(/^[0-9a-f]{64}$/);
    expect((await repo.verificarBitacora("t2")).integra).toBe(true);

    await repo.conexion.ejecutar("UPDATE bitacora SET actor = ? WHERE tenant_id = ? AND seq = ?", ["intruso", "t1", 3]);
    const alterada = await repo.verificarBitacora("t1");
    expect(alterada).toMatchObject({ integra: false, primeraRotura: 3 });
    expect(alterada.motivo).toMatch(/huella/);
  });

  it("bitácora: la supresión de las últimas entradas no pasa inadvertida", async () => {
    await repo.registrar("t2", { actor: "a", accion: "x" });
    await repo.registrar("t2", { actor: "a", accion: "y", detalle: { dato: "sensible" } });
    const crudo = await repo.conexion.consultar<{ detalle: Buffer }>("SELECT detalle FROM bitacora WHERE tenant_id = ? AND accion = ?", ["t2", "y"]);
    expect(Buffer.from(crudo[0]!.detalle).includes(Buffer.from("sensible"))).toBe(false);
    expect((await repo.verificarBitacora("t2")).integra).toBe(true);
    await repo.conexion.ejecutar("DELETE FROM bitacora WHERE tenant_id = ? AND accion = ?", ["t2", "y"]);
    expect((await repo.verificarBitacora("t2")).motivo).toMatch(/cabeza de la cadena/);
  });

  it("cola de trabajos con arriendo, reintento exponencial y agotamiento", async () => {
    const t = await repo.encolar({ tenantId: "t1", expedienteId: "exp_a", tipo: "pipeline", carga: { desde: "n_exp" }, maxIntentos: 2 });
    const a = await repo.tomarTrabajo("w1", 60_000);
    expect(a?.id).toBe(t.id);
    expect(await repo.tomarTrabajo("w2", 60_000)).toBeNull();
    reloj = new Date(reloj.getTime() + 61_000);
    const b = await repo.tomarTrabajo("w2", 60_000);
    expect(b).toMatchObject({ id: t.id, bloqueadoPor: "w2", intentos: 2 });
    await repo.completarTrabajo(t.id, "w1", { ok: true });
    expect((await repo.trabajo(t.id))!.estado).toBe("EN_CURSO");
    const f = await repo.fallarTrabajo(t.id, "w2", "Croma no disponible");
    expect(f).toMatchObject({ estado: "FALLIDO", error: "Croma no disponible" });

    const r = await repo.encolar({ tenantId: "t1", tipo: "vigilancia", maxIntentos: 3 });
    await repo.tomarTrabajo("w1", 1000, ["vigilancia"]);
    const reintento = await repo.fallarTrabajo(r.id, "w1", "falla transitoria", 1000);
    expect(reintento!.estado).toBe("PENDIENTE");
    expect(await repo.tomarTrabajo("w1", 1000, ["vigilancia"])).toBeNull();
    reloj = new Date(reloj.getTime() + 1500);
    const tomado = await repo.tomarTrabajo("w1", 1000, ["vigilancia"]);
    expect(tomado!.intentos).toBe(2);
    await repo.completarTrabajo(r.id, "w1", { vistos: 1 });
    expect(await repo.trabajo(r.id)).toMatchObject({ estado: "COMPLETADO", resultado: { vistos: 1 } });
  });

  it("índice de términos del despacho (Módulo 18)", async () => {
    const termino = (id: string, vencimiento: string, estado: Termino["estado"]): Termino => ({
      id, tipo: "PROCESAL", descripcion: `Traslado ${id}`, norma: "CGP art. 369", catalogoId: null, verificacionNorma: "VERIFICADA", fechaInicio: "2026-09-01", fechaInicioSoporte: "folio 3",
      unidad: "DIAS_HABILES", cantidad: 20, vencimiento, vencimientoMasTemprano: null, diasHabilesRestantes: 5, estado, esEstimacion: false, margen: null, accionQueInterrumpe: null, alertas: [], modulo: "m18", calculadoEn: AHORA, advertencias: [],
    });
    await repo.indexarTerminos("t1", "exp_a", [termino("a", "2026-10-02", "RIESGO"), termino("b", "2026-12-01", "CORRIENDO")]);
    const proximos = await repo.vencimientos("t1", "2026-10-31");
    expect(proximos.map((x) => [x.terminoId, x.descripcion])).toEqual([["a", "Traslado a (CGP art. 369)"]]);
    expect(await repo.vencimientos("t2", "2027-01-01")).toEqual([]);
    await repo.indexarTerminos("t1", "exp_a", [termino("c", "2026-10-01", "RIESGO_INMINENTE")]);
    expect((await repo.vencimientos("t1", "2027-01-01")).map((x) => x.terminoId)).toEqual(["c"]);
  });

  it("memoria disociada con supresión en cascada (Ley 1581)", async () => {
    await repo.crearExpediente(nuevo("exp_b", "Otro caso ficticio"), "usr_1");
    expect((await repo.guardarLeccion("t1", { tipo: "RUTA", area: "CIVIL", clave: "Verificar poder especial", contenido: { leccion: "Verificar poder especial" }, expedienteOrigen: "exp_b" })).nueva).toBe(true);
    expect((await repo.guardarLeccion("t1", { tipo: "RUTA", area: "CIVIL", clave: "verificar poder especial ", contenido: { leccion: "x" }, expedienteOrigen: "exp_b" })).nueva).toBe(false);
    const l = await repo.lecciones("t1", { area: "CIVIL" });
    expect(l).toHaveLength(1);
    expect(l[0]!.usos).toBe(2);
    const origen = await repo.conexion.consultar<{ origen: string }>("SELECT origen FROM memoria");
    expect(origen[0]!.origen).not.toContain("exp_b");

    const exp = (await repo.obtenerExpediente("t1", "exp_b"))!;
    await repo.guardarExpediente({ ...exp, entregables: [{ id: "ent_1", tipo: "INFORME_TECNICO", version: 1, modo: "BORRADOR", blobId: "blob_0123456789abcdef0123456789abcdef", nombreArchivo: "x.docx", mime: "application/docx", sha256: "0".repeat(64), paginas: 3, generadoEn: AHORA }] }, "usr_1");
    await repo.encolar({ tenantId: "t1", expedienteId: "exp_b", tipo: "pipeline" });
    const s = await repo.suprimirExpediente("t1", "exp_b", "usr_1", "Solicitud de supresión del titular");
    expect(s.blobs).toEqual(["blob_0123456789abcdef0123456789abcdef"]);
    expect(await repo.obtenerExpediente("t1", "exp_b")).toBeNull();
    expect(await repo.lecciones("t1", { area: "CIVIL" })).toEqual([]);
    expect((await repo.trabajosDe("t1", "exp_b")).map((x) => x.estado)).toEqual(["CANCELADO"]);
    expect((await repo.bitacora("t1", { objeto: "exp_b" })).at(-1)!.accion).toBe("expediente.suprimido");
  });
});
