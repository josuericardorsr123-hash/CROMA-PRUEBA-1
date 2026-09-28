#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { type Almacen, abrirAlmacen, type Rol } from "@em/almacen";
import { CAPACIDADES, iniciarSimuladorCroma } from "@em/croma";
import { AccionAbogado, crearExpediente, type Entregable, type Expediente, GRAFO, hoyColombia, nuevoId, validarGrafo } from "@em/dominio";
import { capacidadesDocumentales } from "@em/documentos";
import { importarSemilla, RepositorioFuentes } from "@em/fuentes";
import {
  agregarEntrante, CLAVE_CROMA_DEMO, crearInstruccion, datosCromaDemo, ejecutarPipeline, type EventoPipeline, prepararDemostracion,
  type ResultadoEjecucion, type Servicios, serviciosCompartidos, serviciosDeTenant,
} from "@em/pipeline";
import { analizar, type Argumentos, bandera, ErrorUso, requerido, texto } from "./argumentos";

/* CLI `em`: el mismo pipeline que la API, operado desde la terminal por el
 * ABOGADO (USUARIO) o por el operador. Toda salida jurídica queda en BORRADOR
 * hasta que el ABOGADO (USUARIO) la apruebe con `em instruir … APROBAR`. */

const AYUDA = `em — Expediente Maleable (ordenamiento jurídico colombiano, fuentes oficiales vía Croma)

Uso: em <comando> [opciones]

  demo [--salida dir] [--sin-paginar] [--sin-aprobar]
        Ejecuta el expediente de DEMOSTRACIÓN (datos ficticios, Croma simulado) de punta a punta
        y escribe el informe técnico, la pieza procesal y el índice en --salida (./salida-demo).

  procesar <carpeta|archivo…> --usuario correo [--tenant id] [--titulo t] [--cliente nombre]
        [--rol-cliente ROL] [--contraparte nombre] [--objetivo texto] [--notas texto] [--salida dir]
        Crea el expediente, carga los archivos crudos y ejecuta el pipeline hasta la primera decisión.
  reanudar <expediente> [--tenant id] [--salida dir]
  instruir <expediente> <ACCION> --usuario correo [--motivo t] [--datos json] [--reanudar]
        Acciones: ${AccionAbogado.options.join(", ")}
  estado <expediente> [--tenant id]
  entregables <expediente> [--tenant id] --salida dir
  cargar <expediente> <archivo…> --usuario correo [--tenant id]

  usuarios crear --correo c --nombre n --rol ABOGADO|ADMINISTRADOR|AUDITOR --clave k [--tenant id] [--tp num]
  usuarios listar [--tenant id]
  terminos [--tenant id] [--dias 30]            Vencimientos próximos de todos los expedientes
  bitacora verificar [--tenant id]              Verifica la cadena de hashes de la bitácora

  croma herramientas | capacidades | probar     Catálogo y mapeo real (requiere CROMA_API_KEY)
  croma simulador [--puerto 8765]               Servidor MCP simulado con datos ficticios
  grafo validar                                 Valida el grafo del pipeline (nodos, aristas, compuertas)
  herramientas                                  Herramientas documentales disponibles (poppler, qpdf, LibreOffice)
  repositorio importar --skill ruta.jsonl --salida ruta.jsonl [--referencias]
        Importa en tiempo de ejecución la base de conocimiento del despacho (no se versiona).

Variables: ANTHROPIC_API_KEY, CROMA_API_KEY, CROMA_MCP_URL, EM_BASE_DATOS, EM_DIR_DATOS, EM_CLAVE_MAESTRA,
EM_AUTOR_INFORME, EM_PUBLICACION, EM_PERFIL_DESPACHO, EM_REPOSITORIO_JSONL, SMMLV_AJUSTES (ver .env.example).`;

const salida = (t = "") => process.stdout.write(`${t}\n`);
const aviso = (t: string) => process.stderr.write(`${t}\n`);

function eventoEnConsola(e: EventoPipeline): void {
  if (e.tipo === "NODO_TERMINADO") salida(`  ✓ ${e.nodo!.padEnd(15)} ${e.resultado ?? ""} ${e.detalle ? `· ${e.detalle.slice(0, 110)}` : ""}`);
  else if (e.tipo === "RETORNO") salida(`  ↺ ${e.detalle}`);
  else if (e.tipo === "PAUSA") salida(`  ⏸ ${e.nodo}: ${e.detalle}`);
  else if (e.tipo === "ERROR") salida(`  ✗ ${e.nodo ?? ""} ${e.detalle}`);
}

/** Última versión de cada entregable por tipo y modo. */
export function vigentes(exp: Expediente): Entregable[] {
  const m = new Map<string, Entregable>();
  for (const e of exp.entregables) {
    const k = `${e.tipo}:${e.modo}`;
    if ((m.get(k)?.version ?? 0) <= e.version) m.set(k, e);
  }
  return [...m.values()];
}

async function escribirEntregables(exp: Expediente, s: Pick<Servicios, "blobs">, dir: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const rutas: string[] = [];
  for (const e of vigentes(exp)) {
    const ruta = join(dir, basename(e.nombreArchivo));
    writeFileSync(ruta, await s.blobs.leer(e.blobId, exp.tenantId));
    rutas.push(ruta);
  }
  return rutas;
}

function resumen(r: ResultadoEjecucion): void {
  const e = r.exp;
  salida();
  salida(`Estado: ${r.estado} · expediente ${e.id} (${e.estado}) · versión ${e.version}`);
  if (r.pausa) {
    salida(`Decisión pendiente en ${r.pausa.nodo}: ${r.pausa.motivo}`);
    salida(`Acciones posibles: ${r.pausa.acciones.join(", ")}  →  em instruir ${e.id} <ACCION> --usuario <correo>`);
  }
  if (r.error) salida(`Error: ${r.error}`);
  salida(`Hechos: ${e.hechos.length} · Fuentes: ${e.fuentes.length} (${e.fuentes.filter((f) => f.resolucion === "TEXTO_OFICIAL").length} con texto oficial) · Citas bloqueadas: ${e.citas.filter((c) => c.estado === "BLOQUEADA").length}`);
  for (const t of e.terminos.slice(0, 6)) salida(`  Término ${t.descripcion}: vence ${t.vencimiento} (${t.estado}, ${t.diasHabilesRestantes} días hábiles)`);
  if (e.estrategia) salida(`Actuación siguiente: ${e.estrategia.piezaSiguiente.tipo}`);
  salida(`Decisiones: ${e.decisiones.map((d) => `${d.compuerta}=${d.decision}${d.anulacionHumana ? "*" : ""}`).join(" · ") || "ninguna"}`);
}

/* ─────────────────────────────── demo ─────────────────────────────── */

async function demo(a: Argumentos): Promise<number> {
  const dir = resolve(texto(a, "salida", "salida-demo")!);
  salida("DEMOSTRACIÓN — datos ficticios, fuentes simuladas (Croma simulado sobre MCP real).");
  const ent = await prepararDemostracion({ config: { paginarInforme: bandera(a, "sin-paginar") ? false : undefined } });
  try {
    const guardar = async (e: Expediente) => ({ ...e, version: e.version + 1 });
    let r = await ejecutarPipeline(ent.expediente, ent.servicios, { guardar, alEvento: eventoEnConsola });
    resumen(r);
    if (r.estado === "PAUSADO" && r.pausa?.nodo === "g_revision" && !bandera(a, "sin-aprobar")) {
      salida("\nEl ABOGADO DE DEMOSTRACIÓN aprueba la revisión (en producción, esta decisión es siempre humana):");
      r = await ejecutarPipeline({ ...r.exp, instrucciones: [...r.exp.instrucciones, crearInstruccion("APROBAR", r.exp.propietarioId, { motivo: "Aprobación de demostración." })] }, ent.servicios, { guardar, alEvento: eventoEnConsola });
      resumen(r);
    }
    const rutas = await escribirEntregables(r.exp, ent.servicios, dir);
    salida(`\nEntregables (${rutas.length}):`);
    for (const p of rutas) salida(`  ${relative(process.cwd(), p)}`);
    return r.estado === "ERROR" ? 1 : 0;
  } finally {
    await ent.cerrar();
  }
}

/* ────────────────────────── expedientes reales ────────────────────────── */

async function conAlmacen<T>(fn: (al: Almacen) => Promise<T>): Promise<T> {
  const al = await abrirAlmacen();
  for (const w of al.advertencias) aviso(`aviso: ${w}`);
  try {
    return await fn(al);
  } finally {
    await al.cerrar();
  }
}

function archivosDe(rutas: string[]): Array<{ nombre: string; contenido: Buffer; rutaRelativa: string }> {
  const salidaArchivos: Array<{ nombre: string; contenido: Buffer; rutaRelativa: string }> = [];
  const recorrer = (base: string, p: string) => {
    const st = statSync(p);
    if (st.isDirectory()) for (const h of readdirSync(p).sort()) recorrer(base, join(p, h));
    else if (st.isFile() && !basename(p).startsWith(".")) salidaArchivos.push({ nombre: basename(p), contenido: readFileSync(p), rutaRelativa: relative(base, p) || basename(p) });
  };
  for (const r of rutas) {
    const abs = resolve(r);
    recorrer(statSync(abs).isDirectory() ? abs : resolve(abs, ".."), abs);
  }
  return salidaArchivos;
}

async function ejecutar(al: Almacen, exp: Expediente, tenant: string, a: Argumentos): Promise<number> {
  const compartidos = serviciosCompartidos();
  for (const w of compartidos.advertencias) aviso(`aviso: ${w}`);
  const s = serviciosDeTenant(compartidos, al, tenant);
  try {
    const r = await ejecutarPipeline(exp, s, { guardar: (e) => al.repo.guardarExpediente(e, "SISTEMA", "pipeline.punto_control"), alEvento: eventoEnConsola });
    resumen(r);
    const dir = texto(a, "salida");
    if (dir) for (const p of await escribirEntregables(r.exp, s, resolve(dir))) salida(`  ${relative(process.cwd(), p)}`);
    return r.estado === "ERROR" ? 1 : 0;
  } finally {
    await compartidos.croma.cerrar();
  }
}

async function usuarioPorCorreo(al: Almacen, tenant: string, correo: string) {
  const u = await al.repo.usuarioPorCorreo(tenant, correo);
  if (!u || !u.activo) throw new ErrorUso(`No existe un usuario activo ${correo} en el tenant ${tenant} (em usuarios crear …).`);
  return u;
}

async function obtener(al: Almacen, tenant: string, id: string | undefined): Promise<Expediente> {
  if (!id) throw new ErrorUso("Indique el identificador del expediente.");
  const e = await al.repo.obtenerExpediente(tenant, id);
  if (!e) throw new ErrorUso(`Expediente ${id} no encontrado en el tenant ${tenant}.`);
  return e;
}

async function procesar(a: Argumentos): Promise<number> {
  const tenant = texto(a, "tenant", "principal")!;
  const rutas = a.posicionales.slice(1);
  if (!rutas.length) throw new ErrorUso("Indique la carpeta o los archivos del expediente.");
  return conAlmacen(async (al) => {
    await al.repo.asegurarTenant(tenant, tenant);
    const u = await usuarioPorCorreo(al, tenant, requerido(a, "usuario"));
    const ahora = new Date().toISOString();
    const cliente = texto(a, "cliente");
    const exp = crearExpediente({
      id: nuevoId("exp"), tenantId: tenant, propietarioId: u.id, titulo: texto(a, "titulo") ?? basename(resolve(rutas[0]!)), ahora,
      contexto: {
        cliente: cliente ? { nombre: cliente, identificacion: texto(a, "id-cliente") ?? null, rol: (texto(a, "rol-cliente") ?? null) as never } : null,
        contraparte: texto(a, "contraparte") ?? null, objetivo: texto(a, "objetivo") ?? null, notasAbogado: texto(a, "notas") ?? null,
      },
    });
    for (const f of archivosDe(rutas)) await agregarEntrante(exp, al.blobs, f, u.id, ahora);
    const creado = await al.repo.crearExpediente(exp, u.id);
    salida(`Expediente ${creado.id} creado con ${exp.entrantes.length} archivo(s).`);
    return ejecutar(al, creado, tenant, a);
  });
}

async function reanudar(a: Argumentos): Promise<number> {
  const tenant = texto(a, "tenant", "principal")!;
  return conAlmacen(async (al) => ejecutar(al, await obtener(al, tenant, a.posicionales[1]), tenant, a));
}

async function instruir(a: Argumentos): Promise<number> {
  const tenant = texto(a, "tenant", "principal")!;
  const accion = AccionAbogado.parse(a.posicionales[2]);
  return conAlmacen(async (al) => {
    const u = await usuarioPorCorreo(al, tenant, requerido(a, "usuario"));
    if (u.rol === "AUDITOR") throw new ErrorUso("El rol AUDITOR no puede emitir instrucciones.");
    const datos = texto(a, "datos") ? JSON.parse(texto(a, "datos")!) : {};
    const id = a.posicionales[1];
    if (!id) throw new ErrorUso("Indique el identificador del expediente.");
    const exp = await al.repo.actualizarExpediente(tenant, id, u.id, (e) => {
      if (e.propietarioId !== u.id && u.rol !== "ADMINISTRADOR") throw new ErrorUso("Solo el ABOGADO (USUARIO) titular o un administrador puede instruir este expediente.");
      return { ...e, instrucciones: [...e.instrucciones, crearInstruccion(accion, u.id, { motivo: texto(a, "motivo") ?? "", datos })] };
    }, { accion: "expediente.instruccion", detalle: { accion } });
    salida(`Instrucción ${accion} registrada en ${exp.id}.`);
    return bandera(a, "reanudar") ? ejecutar(al, exp, tenant, a) : 0;
  });
}

async function cargar(a: Argumentos): Promise<number> {
  const tenant = texto(a, "tenant", "principal")!;
  return conAlmacen(async (al) => {
    const u = await usuarioPorCorreo(al, tenant, requerido(a, "usuario"));
    const archivos = archivosDe(a.posicionales.slice(2));
    const exp = await al.repo.actualizarExpediente(tenant, a.posicionales[1] ?? "", u.id, async (e) => {
      for (const f of archivos) await agregarEntrante(e, al.blobs, f, u.id);
      return e;
    }, { accion: "expediente.carga", detalle: { archivos: archivos.length } });
    salida(`${archivos.length} archivo(s) cargados en ${exp.id}; ejecute em reanudar ${exp.id}.`);
    return 0;
  });
}

async function estado(a: Argumentos): Promise<number> {
  const tenant = texto(a, "tenant", "principal")!;
  return conAlmacen(async (al) => {
    const e = await obtener(al, tenant, a.posicionales[1]);
    salida(`${e.id} · ${e.titulo} · ${e.estado} · versión ${e.version}`);
    const est = e.ejecucion.estados;
    for (const n of GRAFO.nodos) salida(`  ${n.id.padEnd(15)} ${(est[n.id] ?? "PENDIENTE").padEnd(11)} ${n.nombre}`);
    if (e.ejecucion.pausa) salida(`Decisión pendiente en ${e.ejecucion.pausa.nodo}: ${e.ejecucion.pausa.motivo} [${e.ejecucion.pausa.acciones.join(", ")}]`);
    for (const x of vigentes(e)) salida(`  Entregable ${x.tipo} ${x.modo} v${x.version}: ${x.nombreArchivo}`);
    return 0;
  });
}

async function entregables(a: Argumentos): Promise<number> {
  const tenant = texto(a, "tenant", "principal")!;
  return conAlmacen(async (al) => {
    const e = await obtener(al, tenant, a.posicionales[1]);
    for (const p of await escribirEntregables(e, al, resolve(requerido(a, "salida")))) salida(p);
    return 0;
  });
}

async function usuarios(a: Argumentos): Promise<number> {
  const tenant = texto(a, "tenant", "principal")!;
  return conAlmacen(async (al) => {
    await al.repo.asegurarTenant(tenant, tenant);
    if (a.posicionales[1] === "crear") {
      const rol = requerido(a, "rol") as Rol;
      if (!["ABOGADO", "ADMINISTRADOR", "AUDITOR"].includes(rol)) throw new ErrorUso("--rol debe ser ABOGADO, ADMINISTRADOR o AUDITOR");
      const u = await al.repo.crearUsuario({ tenantId: tenant, correo: requerido(a, "correo"), nombre: requerido(a, "nombre"), rol, clave: requerido(a, "clave"), tarjetaProfesional: texto(a, "tp") ?? null }, "CLI");
      salida(`Usuario ${u.id} (${u.rol}) creado en ${tenant}.`);
    } else for (const u of await al.repo.listarUsuarios(tenant)) salida(`${u.id}  ${u.rol.padEnd(13)} ${u.activo ? "activo  " : "inactivo"} ${u.correo}  ${u.nombre}`);
    return 0;
  });
}

async function terminos(a: Argumentos): Promise<number> {
  const tenant = texto(a, "tenant", "principal")!;
  const dias = Number(texto(a, "dias", "30"));
  return conAlmacen(async (al) => {
    const hasta = new Date(Date.now() + dias * 86_400_000);
    const lista = await al.repo.vencimientos(tenant, hoyColombia(hasta));
    if (!lista.length) salida(`Sin vencimientos en los próximos ${dias} días.`);
    for (const t of lista) salida(`${t.vencimientoMasTemprano ?? "¿?"}  ${String(t.diasHabilesRestantes ?? "-").padStart(4)} días hábiles  ${t.expedienteId}  ${t.descripcion}${t.esEstimacion ? " (estimado)" : ""}`);
    return 0;
  });
}

async function bitacora(a: Argumentos): Promise<number> {
  const tenant = texto(a, "tenant", "principal")!;
  return conAlmacen(async (al) => {
    const v = await al.repo.verificarBitacora(tenant);
    salida(JSON.stringify(v, null, 2));
    return v.integra ? 0 : 2;
  });
}

/* ─────────────────────────── Croma y utilidades ─────────────────────────── */

async function croma(a: Argumentos): Promise<number> {
  const sub = a.posicionales[1];
  if (sub === "simulador") {
    const sim = await iniciarSimuladorCroma({ apiKey: CLAVE_CROMA_DEMO, puerto: Number(texto(a, "puerto", "8765")), datos: datosCromaDemo() });
    salida(`Simulador Croma (datos ficticios) en ${sim.url}\nCROMA_MCP_URL=${sim.url} CROMA_API_KEY=${CLAVE_CROMA_DEMO}\nCtrl+C para detener.`);
    await new Promise<void>((ok) => process.once("SIGINT", () => ok()));
    await sim.cerrar();
    return 0;
  }
  const c = serviciosCompartidos({ llm: null, repositorio: new RepositorioFuentes() });
  try {
    if (!c.croma.configurado) throw new ErrorUso("CROMA_API_KEY no está configurada (https://usecroma.com).");
    if (sub === "herramientas") for (const h of await c.croma.herramientas(true)) salida(`${h.nombre.padEnd(40)} ${h.fuente ?? ""} ${h.descripcion.slice(0, 90)}`);
    else if (sub === "capacidades") {
      const m = await c.croma.capacidades();
      for (const cap of CAPACIDADES) {
        const as = m.get(cap.id);
        salida(`${cap.id.padEnd(28)} ${as ? `→ ${as.herramienta} (puntaje ${as.puntaje})` : "NO DISPONIBLE"}`);
      }
    } else if (sub === "probar") salida(JSON.stringify(await c.croma.estado(), null, 2));
    else throw new ErrorUso("croma herramientas | capacidades | probar | simulador");
    return 0;
  } finally {
    await c.croma.cerrar();
  }
}

function grafo(): number {
  const r = validarGrafo();
  salida(`Grafo: ${r.nodos} nodos, ${r.aristas} aristas, ${r.compuertas} compuertas, ${r.recursos} recursos → ${r.conforme ? "CONFORME" : "NO CONFORME"}`);
  for (const v of r.verificaciones) salida(`  ${v.conforme ? "✓" : "✗"} ${v.descripcion}${v.conforme ? "" : `: ${v.detalle}`}`);
  return r.conforme ? 0 : 1;
}

async function herramientas(): Promise<number> {
  const c = await capacidadesDocumentales();
  for (const [k, v] of Object.entries(c)) salida(`${k.padEnd(10)} ${v ? "disponible" : "NO DISPONIBLE"}`);
  return Object.values(c).every(Boolean) ? 0 : 1;
}

function repositorio(a: Argumentos): number {
  if (a.posicionales[1] !== "importar") throw new ErrorUso("repositorio importar --skill ruta.jsonl --salida ruta.jsonl");
  const fichas = importarSemilla(requerido(a, "skill"), { incluirReferencias: bandera(a, "referencias") });
  const repo = new RepositorioFuentes(fichas);
  const destino = resolve(requerido(a, "salida"));
  writeFileSync(destino, repo.exportarJsonl(), { mode: 0o600 });
  salida(`${repo.tamano} fichas importadas en ${destino}. Configure EM_REPOSITORIO_JSONL=${destino}`);
  return 0;
}

const COMANDOS: Record<string, (a: Argumentos) => Promise<number> | number> = {
  demo, procesar, reanudar, instruir, cargar, estado, entregables, usuarios, terminos, bitacora, croma, grafo, herramientas, repositorio,
};

export async function principal(argv: string[]): Promise<number> {
  const a = analizar(argv);
  const cmd = a.posicionales[0];
  if (!cmd || cmd === "ayuda" || bandera(a, "help") || bandera(a, "ayuda")) {
    salida(AYUDA);
    return 0;
  }
  const fn = COMANDOS[cmd];
  if (!fn) {
    aviso(`Comando desconocido: ${cmd}\n`);
    salida(AYUDA);
    return 64;
  }
  try {
    return await fn(a);
  } catch (e) {
    if (e instanceof ErrorUso) {
      aviso(`error: ${e.message}`);
      return 64;
    }
    aviso(`error: ${(e as Error).stack ?? e}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || /[\\/](main\.ts|em\.mjs)$/.test(process.argv[1] ?? "")) {
  principal(process.argv.slice(2)).then((c) => process.exit(c));
}
