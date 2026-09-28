import { randomBytes } from "node:crypto";
import { type Almacen, abrirAlmacen, Cifrador } from "@em/almacen";
import { REGISTRO_SILENCIOSO } from "@em/croma";
import { type Compartidos, construirExpedienteDemo, type EntornoDemostracion, prepararDemostracion } from "@em/pipeline";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construirApp } from "../src/app";
import { crearAutenticador } from "../src/autenticacion";
import { BusEventos } from "../src/eventos";
import { Trabajador } from "../src/trabajador";

/* API de extremo a extremo sobre el expediente de DEMOSTRACIÓN (datos
 * ficticios): ingreso, RBAC, carga multiparte, cola de trabajos, pausa para
 * el ABOGADO (USUARIO), aprobación, descarga y bitácora íntegra. */

const T = "despacho";
const CLAVE = "clave-de-prueba-larga";

function multiparte(archivos: Array<{ nombre: string; contenido: Buffer }>) {
  const limite = `----em${randomBytes(8).toString("hex")}`;
  const partes = archivos.flatMap((a) => [
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivos"; filename="${a.nombre}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    a.contenido, Buffer.from("\r\n"),
  ]);
  return { payload: Buffer.concat([...partes, Buffer.from(`--${limite}--\r\n`)]), headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

describe("API REST del ABOGADO (USUARIO)", () => {
  let almacen: Almacen;
  let ent: EntornoDemostracion;
  let app: FastifyInstance;
  let trabajador: Trabajador;
  const tokens: Record<string, string> = {};
  let expId = "";

  const pedir = (metodo: "GET" | "POST" | "PUT" | "DELETE", url: string, quien: string | null, cuerpo?: unknown) =>
    app.inject({ method: metodo, url, headers: quien ? { authorization: `Bearer ${tokens[quien]}` } : {}, ...(cuerpo !== undefined ? { payload: cuerpo as object } : {}) });

  async function esperarTrabajo(): Promise<void> {
    for (let i = 0; i < 600; i++) {
      const r = (await pedir("GET", `/api/v1/expedientes/${expId}/trabajos`, "abogado")).json() as Array<{ estado: string }>;
      if (r.length && r.every((t) => t.estado !== "PENDIENTE" && t.estado !== "EN_CURSO")) return;
      await new Promise((ok) => setTimeout(ok, 50));
    }
    throw new Error("el trabajo no terminó");
  }

  beforeAll(async () => {
    almacen = await abrirAlmacen({ urlBaseDatos: "sqlite::memory:", blobsEnMemoria: true, cifrador: new Cifrador({ kid: "t", material: randomBytes(32) }), scrypt: { N: 2 ** 10, r: 8, p: 1 }, entorno: {} });
    ent = await prepararDemostracion({ config: { paginarInforme: false } });
    const s = ent.servicios;
    const compartidos: Compartidos = { llm: s.llm, croma: s.croma, repositorio: s.repositorio, resolutor: s.resolutor, config: s.config, registro: REGISTRO_SILENCIOSO, advertencias: [] };
    const bus = new BusEventos();
    trabajador = new Trabajador({ almacen, compartidos, bus, registro: REGISTRO_SILENCIOSO, sondeoMs: 30 });
    app = await construirApp({ almacen, compartidos, autenticador: crearAutenticador(randomBytes(32)), bus, trabajador, registro: REGISTRO_SILENCIOSO, limiteIngreso: 100 });
    trabajador.iniciar();
    await almacen.repo.asegurarTenant(T, "Despacho de prueba");
    for (const [clave, rol] of [["abogado", "ABOGADO"], ["otro", "ABOGADO"], ["admin", "ADMINISTRADOR"], ["auditor", "AUDITOR"]] as const) {
      await almacen.repo.crearUsuario({ tenantId: T, correo: `${clave}@ejemplo.test`, nombre: `${clave.toUpperCase()} DE PRUEBA`, rol, clave: CLAVE });
      const r = await pedir("POST", "/api/v1/auth/ingresar", null, { tenant: T, correo: `${clave}@ejemplo.test`, clave: CLAVE });
      expect(r.statusCode).toBe(200);
      tokens[clave] = r.json().token;
    }
  });

  afterAll(async () => {
    await trabajador?.detener();
    await app?.close();
    await ent?.cerrar();
    await almacen?.cerrar();
  });

  it("rechaza credenciales inválidas y peticiones sin sesión", async () => {
    expect((await pedir("POST", "/api/v1/auth/ingresar", null, { tenant: T, correo: "abogado@ejemplo.test", clave: "incorrecta" })).statusCode).toBe(401);
    expect((await pedir("GET", "/api/v1/expedientes", null)).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/expedientes", headers: { authorization: "Bearer falso" } })).statusCode).toBe(401);
    const salud = (await pedir("GET", "/api/v1/salud", null)).json();
    expect(salud).toMatchObject({ estado: "ok", ia: true, croma: { configurado: true } });
  });

  it("el ABOGADO (USUARIO) crea el expediente, carga los archivos crudos y ejecuta", async () => {
    expect((await pedir("PUT", "/api/v1/yo/perfil", "abogado", { identificacion: "000.000.009", tarjetaProfesional: "000009", correoRegistroNacional: "abogado@ejemplo.test", telefono: null, direccion: "Dirección ficticia", ciudad: "Bogotá D.C." })).statusCode).toBe(200);
    expect((await pedir("POST", "/api/v1/expedientes", "auditor", { titulo: "No permitido" })).statusCode).toBe(403);
    const c = await pedir("POST", "/api/v1/expedientes", "abogado", {
      titulo: "Cobro de pagaré (DEMOSTRACIÓN)",
      contexto: { cliente: { nombre: "SOCIEDAD FICTICIA UNO S.A.S.", identificacion: "NIT 000.000.002-0", rol: "EJECUTANTE" }, contraparte: "PERSONA NATURAL FICTICIA" },
    });
    expect(c.statusCode).toBe(201);
    expId = c.json().id;
    const demo = await construirExpedienteDemo();
    const m = multiparte(demo.archivos);
    const carga = await app.inject({ method: "POST", url: `/api/v1/expedientes/${expId}/archivos`, headers: { ...m.headers, authorization: `Bearer ${tokens.abogado}` }, payload: m.payload });
    expect(carga.statusCode).toBe(201);
    expect(carga.json().cargados).toBe(demo.archivos.length);
    expect((await pedir("GET", `/api/v1/expedientes/${expId}`, "otro")).statusCode).toBe(404);
    expect((await pedir("GET", `/api/v1/expedientes/${expId}`, "auditor")).statusCode).toBe(200);

    const ej = await pedir("POST", `/api/v1/expedientes/${expId}/ejecutar`, "abogado");
    expect(ej.statusCode).toBe(202);
    await esperarTrabajo();
    const est = (await pedir("GET", `/api/v1/expedientes/${expId}/estado`, "abogado")).json();
    expect(est.estado).toBe("EN_REVISION");
    expect(est.pausa.nodo).toBe("g_revision");
    expect(est.entregables.some((e: { tipo: string; modo: string }) => e.tipo === "INFORME_TECNICO" && e.modo === "BORRADOR")).toBe(true);
  });

  it("solo el titular instruye; la aprobación genera la pieza radicable firmada con su perfil", async () => {
    expect((await pedir("POST", `/api/v1/expedientes/${expId}/instrucciones`, "auditor", { accion: "APROBAR" })).statusCode).toBe(403);
    expect((await pedir("POST", `/api/v1/expedientes/${expId}/instrucciones`, "abogado", { accion: "NO_EXISTE" })).statusCode).toBe(400);
    const r = await pedir("POST", `/api/v1/expedientes/${expId}/instrucciones`, "abogado", { accion: "APROBAR", motivo: "Revisado." });
    expect(r.statusCode).toBe(201);
    await esperarTrabajo();
    const e = (await pedir("GET", `/api/v1/expedientes/${expId}`, "abogado")).json();
    expect(e.estado).toBe("APROBADO");
    const radicable = e.entregables.find((x: { tipo: string; modo: string }) => x.tipo === "PIEZA_PROCESAL" && x.modo === "RADICABLE");
    expect(radicable).toBeTruthy();
    const d = await pedir("GET", `/api/v1/expedientes/${expId}/entregables/${radicable.id}`, "abogado");
    expect(d.statusCode).toBe(200);
    expect(d.rawPayload.subarray(0, 2).toString()).toBe("PK");
    expect(d.headers["content-disposition"]).toContain("attachment");
    expect((await pedir("GET", `/api/v1/expedientes/${expId}/entregables/${radicable.id}`, "auditor")).statusCode).toBe(403);
  });

  it("términos indexados, bitácora íntegra y supresión reservada al administrador", async () => {
    const t = (await pedir("GET", "/api/v1/terminos?dias=3650", "abogado")).json();
    expect(t.some((x: { expedienteId: string }) => x.expedienteId === expId)).toBe(true);
    expect((await pedir("GET", "/api/v1/terminos?dias=3650", "otro")).json()).toEqual([]);
    const b = (await pedir("GET", "/api/v1/bitacora/verificar", "auditor")).json();
    expect(b.integra).toBe(true);
    const acciones = ((await pedir("GET", `/api/v1/expedientes/${expId}/bitacora`, "admin")).json() as Array<{ accion: string }>).map((x) => x.accion);
    expect(acciones).toEqual(expect.arrayContaining(["expediente.creado", "expediente.carga", "pipeline.solicitado", "expediente.instruccion", "entregable.descargado"]));
    expect((await pedir("DELETE", `/api/v1/expedientes/${expId}`, "abogado", { motivo: "Solicitud del titular de los datos." })).statusCode).toBe(403);
    expect((await pedir("DELETE", `/api/v1/expedientes/${expId}`, "admin", { motivo: "Solicitud del titular de los datos." })).statusCode).toBe(200);
    expect((await pedir("GET", `/api/v1/expedientes/${expId}`, "admin")).statusCode).toBe(404);
  });

  it("el flujo SSE entrega el estado inicial", async () => {
    const c = await pedir("POST", "/api/v1/expedientes", "abogado", { titulo: "Expediente para SSE" });
    const id = c.json().id;
    const url = await app.listen({ port: 0, host: "127.0.0.1" });
    const r = await fetch(`${url}/api/v1/expedientes/${id}/eventos?token=${tokens.abogado}`);
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const lector = r.body!.getReader();
    const { value } = await lector.read();
    expect(new TextDecoder().decode(value)).toMatch(/^event: estado\ndata: .*"id":"exp_/);
    await lector.cancel();
  });
});
