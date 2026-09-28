import { existsSync } from "node:fs";
import type { Almacen, Rol } from "@em/almacen";
import type { Registro } from "@em/croma";
import { AccionAbogado, ContextoInicial, crearExpediente, ErrorDominio, type Expediente, GRAFO, hoyColombia, nuevoId } from "@em/dominio";
import { capacidadesDocumentales } from "@em/documentos";
import { agregarEntrante, type Compartidos, crearInstruccion } from "@em/pipeline";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { type Autenticador, ErrorHttp, exigirRol, exigirSesion, type Sesion, tokenDe } from "./autenticacion";
import type { BusEventos } from "./eventos";
import { TIPO_PIPELINE, type Trabajador } from "./trabajador";

/* API REST + SSE. Todo bajo /api/v1, con sesión obligatoria salvo /salud e
 * /auth/ingresar. Reglas de acceso:
 *  - ABOGADO: solo sus expedientes; dirige el pipeline (carga, ejecuta, instruye).
 *  - ADMINISTRADOR: todos los expedientes del tenant, usuarios y supresión.
 *  - AUDITOR: lectura de expedientes y bitácora; no instruye ni descarga piezas radicables.
 * Cada acción queda en la bitácora encadenada del tenant. */

export interface OpcionesApp {
  almacen: Almacen;
  compartidos: Compartidos;
  autenticador: Autenticador;
  bus: BusEventos;
  trabajador: Trabajador | null;
  registro: Registro;
  dirWeb?: string | null;
  maxArchivoMb?: number;
  logger?: boolean;
  limiteIngreso?: number;
}

const Ingreso = z.object({ tenant: z.string().min(1).max(64), correo: z.string().email(), clave: z.string().min(1).max(512) });
const NuevoExpediente = z.object({ titulo: z.string().min(3).max(300), contexto: ContextoInicial.partial().optional(), ejecutar: z.boolean().optional() });
const NuevaInstruccion = z.object({ accion: AccionAbogado, motivo: z.string().max(4000).default(""), datos: z.unknown().optional(), nodo: z.string().nullable().optional(), reanudar: z.boolean().default(true) });
const Perfil = z.object({
  identificacion: z.string().max(40).nullable(), tarjetaProfesional: z.string().max(40).nullable(), correoRegistroNacional: z.string().email().nullable(),
  telefono: z.string().max(40).nullable(), direccion: z.string().max(300).nullable(), ciudad: z.string().max(120).nullable(),
});
const NuevoUsuario = z.object({ correo: z.string().email(), nombre: z.string().min(3).max(200), rol: z.enum(["ABOGADO", "ADMINISTRADOR", "AUDITOR"]), clave: z.string().min(12).max(512), tarjetaProfesional: z.string().max(40).nullable().optional() });
const Supresion = z.object({ motivo: z.string().min(10).max(2000) });

function cuerpo<T>(esquema: z.ZodType<T>, datos: unknown): T {
  const r = esquema.safeParse(datos);
  if (!r.success) throw new ErrorHttp(400, "SOLICITUD_INVALIDA", r.error.issues.map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`).join("; "));
  return r.data;
}

function resumenEstado(e: Expediente) {
  return {
    id: e.id, titulo: e.titulo, estado: e.estado, version: e.version, actualizadoEn: e.actualizadoEn, propietarioId: e.propietarioId,
    pausa: e.ejecucion.pausa, error: e.ejecucion.error, estados: e.ejecucion.estados,
    entregables: e.entregables.map(({ id, tipo, version, modo, nombreArchivo, paginas, generadoEn }) => ({ id, tipo, version, modo, nombreArchivo, paginas, generadoEn })),
  };
}

export async function construirApp(o: OpcionesApp): Promise<FastifyInstance> {
  const { repo, blobs } = o.almacen;
  const app = Fastify({
    logger: o.logger ? { level: process.env.EM_NIVEL_LOG ?? "info", redact: ["req.headers.authorization", "req.query.token"] } : false,
    bodyLimit: 2 * 1024 * 1024, trustProxy: process.env.EM_CONFIAR_PROXY === "1", genReqId: () => nuevoId("req"),
  });

  app.decorateRequest("sesion", null);
  await app.register(rateLimit, { global: true, max: Number(process.env.EM_LIMITE_MINUTO ?? 300), timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: (o.maxArchivoMb ?? 200) * 1024 * 1024, files: 500, fields: 20 } });

  app.addHook("onSend", async (_req, rep, carga) => {
    rep.header("X-Content-Type-Options", "nosniff").header("Referrer-Policy", "no-referrer").header("X-Frame-Options", "DENY")
      .header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");
    return carga;
  });

  app.addHook("onRequest", async (req) => {
    if (!req.url.startsWith("/api/")) return;
    const t = tokenDe(req);
    if (!t) return;
    const s = await o.autenticador.verificar(t);
    if (!s) return;
    const u = await repo.usuarioPorId(s.tenantId, s.usuarioId);
    req.sesion = u?.activo ? { ...s, rol: u.rol } : null;
  });

  app.setErrorHandler((e, req, rep) => {
    if (e instanceof ErrorHttp) return rep.code(e.estado).send({ error: e.codigo, mensaje: e.message });
    if (e instanceof ErrorDominio) {
      const estado = e.codigo === "CONFLICTO_VERSION" ? 409 : e.codigo.endsWith("INEXISTENTE") ? 404 : 422;
      return rep.code(estado).send({ error: e.codigo, mensaje: e.message });
    }
    const conEstado = e as { statusCode?: number; code?: string; message: string };
    if (conEstado.statusCode && conEstado.statusCode < 500) return rep.code(conEstado.statusCode).send({ error: conEstado.code ?? "SOLICITUD_INVALIDA", mensaje: conEstado.message });
    o.registro.error("api.error", { req: req.id, error: String((e as Error)?.stack ?? e) });
    return rep.code(500).send({ error: "ERROR_INTERNO", mensaje: "Error interno; consulte el identificador de la solicitud.", solicitud: req.id });
  });

  const auditar = (s: Sesion, accion: string, objeto: string | null, detalle?: unknown) => repo.registrar(s.tenantId, { actor: s.usuarioId, accion, objeto, detalle });

  async function expediente(req: FastifyRequest, modo: "leer" | "escribir"): Promise<{ s: Sesion; e: Expediente }> {
    const s = modo === "leer" ? exigirSesion(req) : exigirRol(req, "ABOGADO", "ADMINISTRADOR");
    const id = (req.params as { id: string }).id;
    const e = await repo.obtenerExpediente(s.tenantId, id);
    if (!e || (s.rol === "ABOGADO" && e.propietarioId !== s.usuarioId)) throw new ErrorHttp(404, "EXPEDIENTE_INEXISTENTE", `No existe el expediente ${id} o no tiene acceso.`);
    return { s, e };
  }

  async function ocupado(s: Sesion, id: string): Promise<boolean> {
    return (await repo.trabajosDe(s.tenantId, id)).some((t) => t.tipo === TIPO_PIPELINE && (t.estado === "PENDIENTE" || t.estado === "EN_CURSO"));
  }

  async function encolar(s: Sesion, e: Expediente) {
    if (await ocupado(s, e.id)) throw new ErrorHttp(409, "PIPELINE_EN_CURSO", "El pipeline de este expediente ya está en cola o en ejecución.");
    const t = await repo.encolar({ tenantId: s.tenantId, expedienteId: e.id, tipo: TIPO_PIPELINE, carga: { solicitadoPor: s.usuarioId }, maxIntentos: 3 });
    o.bus.publicar({ tipo: "ENCOLADO", expedienteId: e.id, tenantId: s.tenantId, instante: new Date().toISOString(), detalle: t.id });
    o.trabajador?.despertar();
    return t;
  }

  /* ───────────────────────────── Salud y sesión ───────────────────────────── */

  app.get("/api/v1/salud", async () => {
    const croma = await o.compartidos.croma.estado().catch(() => null);
    return {
      estado: "ok", motor: o.almacen.motor, ia: Boolean(o.compartidos.llm), croma: { configurado: o.compartidos.croma.configurado, conectado: croma?.conectado ?? false, circuito: croma?.circuito ?? null },
      herramientas: await capacidadesDocumentales(), repositorioFuentes: o.compartidos.repositorio.tamano, trabajador: Boolean(o.trabajador), advertencias: o.compartidos.advertencias,
    };
  });

  app.post("/api/v1/auth/ingresar", { config: { rateLimit: { max: o.limiteIngreso ?? 10, timeWindow: "1 minute" } } }, async (req, rep) => {
    const d = cuerpo(Ingreso, req.body);
    const r = await repo.autenticar(d.tenant, d.correo, d.clave);
    if (!r.usuario) {
      await repo.registrar(d.tenant, { actor: "ANONIMO", accion: "auth.rechazado", objeto: null, detalle: { motivo: r.motivo } }).catch(() => undefined);
      return rep.code(r.motivo === "BLOQUEADO" ? 423 : 401).send({ error: r.motivo, mensaje: r.motivo === "BLOQUEADO" ? "Cuenta bloqueada temporalmente por intentos fallidos." : "Credenciales inválidas." });
    }
    const t = await o.autenticador.emitir(r.usuario);
    await repo.registrar(d.tenant, { actor: r.usuario.id, accion: "auth.ingreso", objeto: r.usuario.id });
    return { ...t, usuario: r.usuario };
  });

  app.get("/api/v1/yo", async (req) => {
    const s = exigirSesion(req);
    return { usuario: await repo.usuarioPorId(s.tenantId, s.usuarioId), perfil: await repo.perfilProfesional(s.tenantId, s.usuarioId) };
  });

  app.put("/api/v1/yo/perfil", async (req) => {
    const s = exigirRol(req, "ABOGADO", "ADMINISTRADOR");
    await repo.actualizarPerfil(s.tenantId, s.usuarioId, cuerpo(Perfil, req.body), s.usuarioId);
    return { ok: true };
  });

  /* ───────────────────────────── Usuarios ───────────────────────────── */

  app.get("/api/v1/usuarios", async (req) => repo.listarUsuarios(exigirRol(req, "ADMINISTRADOR").tenantId));

  app.post("/api/v1/usuarios", async (req, rep) => {
    const s = exigirRol(req, "ADMINISTRADOR");
    const d = cuerpo(NuevoUsuario, req.body);
    const u = await repo.crearUsuario({ tenantId: s.tenantId, ...d, rol: d.rol as Rol, tarjetaProfesional: d.tarjetaProfesional ?? null }, s.usuarioId);
    return rep.code(201).send(u);
  });

  app.put("/api/v1/usuarios/:uid/estado", async (req) => {
    const s = exigirRol(req, "ADMINISTRADOR");
    const { activo } = cuerpo(z.object({ activo: z.boolean() }), req.body);
    await repo.cambiarEstadoUsuario(s.tenantId, (req.params as { uid: string }).uid, activo, s.usuarioId);
    return { ok: true };
  });

  /* ───────────────────────────── Expedientes ───────────────────────────── */

  app.get("/api/v1/expedientes", async (req) => {
    const s = exigirSesion(req);
    const q = req.query as { estado?: string; limite?: string };
    return repo.listarExpedientes(s.tenantId, { propietarioId: s.rol === "ABOGADO" ? s.usuarioId : undefined, estado: q.estado, limite: Math.min(Number(q.limite ?? 100), 500) });
  });

  app.post("/api/v1/expedientes", async (req, rep) => {
    const s = exigirRol(req, "ABOGADO");
    const d = cuerpo(NuevoExpediente, req.body);
    const e = crearExpediente({ id: nuevoId("exp"), tenantId: s.tenantId, propietarioId: s.usuarioId, titulo: d.titulo, ahora: new Date().toISOString(), contexto: d.contexto });
    const creado = await repo.crearExpediente(e, s.usuarioId);
    return rep.code(201).send(resumenEstado(creado));
  });

  app.get("/api/v1/expedientes/:id", async (req) => (await expediente(req, "leer")).e);
  app.get("/api/v1/expedientes/:id/estado", async (req) => resumenEstado((await expediente(req, "leer")).e));

  app.put("/api/v1/expedientes/:id/contexto", async (req) => {
    const { s, e } = await expediente(req, "escribir");
    if (await ocupado(s, e.id)) throw new ErrorHttp(409, "PIPELINE_EN_CURSO", "Espere a que el pipeline se detenga para modificar el contexto.");
    const contexto = cuerpo(ContextoInicial.partial(), req.body);
    const g = await repo.actualizarExpediente(s.tenantId, e.id, s.usuarioId, (x) => ({ ...x, contexto: ContextoInicial.parse({ ...x.contexto, ...contexto }) }), { accion: "expediente.contexto" });
    return resumenEstado(g);
  });

  app.post("/api/v1/expedientes/:id/archivos", async (req, rep) => {
    const { s, e } = await expediente(req, "escribir");
    if (await ocupado(s, e.id)) throw new ErrorHttp(409, "PIPELINE_EN_CURSO", "Espere a que el pipeline se detenga para cargar archivos.");
    const recibidos: Array<{ nombre: string; contenido: Buffer; rutaRelativa: string }> = [];
    for await (const parte of req.files()) {
      const contenido = await parte.toBuffer();
      if (!contenido.length) continue;
      const nombre = parte.filename.split(/[\\/]/).pop()!.slice(0, 255) || "archivo";
      recibidos.push({ nombre, contenido, rutaRelativa: parte.filename.replace(/\.\.[\\/]/g, "").slice(0, 500) || nombre });
    }
    if (!recibidos.length) throw new ErrorHttp(400, "SIN_ARCHIVOS", "No se recibió ningún archivo.");
    const ahora = new Date().toISOString();
    const g = await repo.actualizarExpediente(s.tenantId, e.id, s.usuarioId, async (x) => {
      for (const a of recibidos) await agregarEntrante(x, blobs, a, s.usuarioId, ahora);
      return x;
    }, { accion: "expediente.carga", detalle: { archivos: recibidos.length, bytes: recibidos.reduce((t, a) => t + a.contenido.length, 0) } });
    return rep.code(201).send({ cargados: recibidos.length, entrantes: g.entrantes.filter((x) => !x.procesado).map(({ id, nombre, bytes, sha256 }) => ({ id, nombre, bytes, sha256 })) });
  });

  app.post("/api/v1/expedientes/:id/ejecutar", async (req, rep) => {
    const { s, e } = await expediente(req, "escribir");
    const t = await encolar(s, e);
    await auditar(s, "pipeline.solicitado", e.id, { trabajo: t.id });
    return rep.code(202).send({ trabajo: t.id });
  });

  app.post("/api/v1/expedientes/:id/cancelar", async (req) => {
    const { s, e } = await expediente(req, "escribir");
    const trabajos = (await repo.trabajosDe(s.tenantId, e.id)).filter((t) => t.estado === "PENDIENTE");
    for (const t of trabajos) await repo.cancelarTrabajo(t.id);
    const enCurso = o.trabajador?.cancelar(e.id) ?? false;
    await auditar(s, "pipeline.cancelado", e.id, { pendientes: trabajos.length, enCurso });
    return { cancelados: trabajos.length, enCurso };
  });

  app.post("/api/v1/expedientes/:id/instrucciones", async (req, rep) => {
    const { s, e } = await expediente(req, "escribir");
    if (s.rol !== "ADMINISTRADOR" && e.propietarioId !== s.usuarioId) throw new ErrorHttp(403, "PROHIBIDO", "Solo el ABOGADO (USUARIO) titular instruye el expediente.");
    if (await ocupado(s, e.id)) throw new ErrorHttp(409, "PIPELINE_EN_CURSO", "El pipeline está en ejecución; la instrucción se emite cuando se detenga en una decisión.");
    const d = cuerpo(NuevaInstruccion, req.body);
    const ins = crearInstruccion(d.accion, s.usuarioId, { motivo: d.motivo, datos: d.datos, nodo: d.nodo ?? null });
    const g = await repo.actualizarExpediente(s.tenantId, e.id, s.usuarioId, (x) => ({ ...x, instrucciones: [...x.instrucciones, ins] }), { accion: "expediente.instruccion", detalle: { accion: d.accion, nodo: e.ejecucion.pausa?.nodo ?? null } });
    const t = d.reanudar ? await encolar(s, g) : null;
    return rep.code(201).send({ instruccion: ins.id, trabajo: t?.id ?? null });
  });

  app.get("/api/v1/expedientes/:id/eventos", async (req, rep) => {
    const { s, e } = await expediente(req, "leer");
    rep.hijack();
    const r = rep.raw;
    r.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const enviar = (evento: string, datos: unknown) => r.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
    enviar("estado", resumenEstado(e));
    const quitar = o.bus.suscribir(s.tenantId, e.id, (ev) => enviar("pipeline", ev));
    const latido = setInterval(() => r.write(": latido\n\n"), 15_000);
    req.raw.on("close", () => {
      clearInterval(latido);
      quitar();
    });
  });

  app.get("/api/v1/expedientes/:id/entregables/:eid", async (req, rep) => {
    const { s, e } = await expediente(req, "leer");
    const ent = e.entregables.find((x) => x.id === (req.params as { eid: string }).eid);
    if (!ent) throw new ErrorHttp(404, "ENTREGABLE_INEXISTENTE", "Entregable no encontrado.");
    if (s.rol === "AUDITOR" && ent.modo === "RADICABLE") throw new ErrorHttp(403, "PROHIBIDO", "El rol AUDITOR no descarga piezas radicables.");
    const datos = await blobs.leer(ent.blobId, e.tenantId);
    await auditar(s, "entregable.descargado", e.id, { entregable: ent.id, tipo: ent.tipo, modo: ent.modo });
    return rep.header("Content-Type", ent.mime).header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(ent.nombreArchivo)}`).send(datos);
  });

  app.get("/api/v1/expedientes/:id/versiones", async (req) => {
    const { s, e } = await expediente(req, "leer");
    return repo.versiones(s.tenantId, e.id);
  });

  app.get("/api/v1/expedientes/:id/bitacora", async (req) => {
    const { s, e } = await expediente(req, "leer");
    return repo.bitacora(s.tenantId, { objeto: e.id, limite: 500 });
  });

  app.get("/api/v1/expedientes/:id/trabajos", async (req) => {
    const { s, e } = await expediente(req, "leer");
    return repo.trabajosDe(s.tenantId, e.id);
  });

  app.delete("/api/v1/expedientes/:id", async (req) => {
    const s = exigirRol(req, "ADMINISTRADOR");
    const id = (req.params as { id: string }).id;
    const { motivo } = cuerpo(Supresion, req.body);
    o.trabajador?.cancelar(id);
    const { blobs: lista } = await repo.suprimirExpediente(s.tenantId, id, s.usuarioId, motivo);
    for (const b of lista) await blobs.eliminar(b, s.tenantId).catch(() => undefined);
    return { suprimido: id, blobs: lista.length };
  });

  /* ───────────────────────────── Transversales ───────────────────────────── */

  app.get("/api/v1/terminos", async (req) => {
    const s = exigirSesion(req);
    const dias = Math.min(Number((req.query as { dias?: string }).dias ?? 30), 3650);
    const lista = await repo.vencimientos(s.tenantId, hoyColombia(new Date(Date.now() + dias * 86_400_000)));
    if (s.rol !== "ABOGADO") return lista;
    const propios = new Set((await repo.listarExpedientes(s.tenantId, { propietarioId: s.usuarioId, limite: 10_000 })).map((x) => x.id));
    return lista.filter((t) => propios.has(t.expedienteId));
  });

  app.get("/api/v1/bitacora/verificar", async (req) => repo.verificarBitacora(exigirRol(req, "ADMINISTRADOR", "AUDITOR").tenantId));
  app.get("/api/v1/grafo", async (req) => (exigirSesion(req), GRAFO));

  app.all("/api/*", async (_req, rep) => rep.code(404).send({ error: "RUTA_INEXISTENTE", mensaje: "Ruta no encontrada." }));

  /* ───────────────────────────── Consola web ───────────────────────────── */

  if (o.dirWeb && existsSync(o.dirWeb)) {
    await app.register(fastifyStatic, { root: o.dirWeb, index: "index.html", maxAge: "1h" });
    app.setNotFoundHandler((req, rep) => (req.method === "GET" && !req.url.startsWith("/api/") ? rep.sendFile("index.html") : rep.code(404).send({ error: "RUTA_INEXISTENTE" })));
  }
  return app;
}
