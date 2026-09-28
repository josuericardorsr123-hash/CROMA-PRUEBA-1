import { resolve } from "node:path";
import { abrirAlmacen } from "@em/almacen";
import type { Registro } from "@em/croma";
import { randomBytes } from "node:crypto";
import { type Compartidos, PERFIL_DEMO, prepararDemostracion, serviciosCompartidos } from "@em/pipeline";
import { construirApp } from "./app";
import { crearAutenticador, secretoDesdeEntorno } from "./autenticacion";
import { BusEventos } from "./eventos";
import { Trabajador } from "./trabajador";

/* Proceso servidor: API + trabajador de fondo (EM_TRABAJADOR=0 para separar
 * réplicas de API y de trabajo sobre la misma base de datos). */

const registro: Registro = {
  debug: () => undefined,
  info: (m, d) => console.log(JSON.stringify({ nivel: "info", m, ...d })),
  warn: (m, d) => console.warn(JSON.stringify({ nivel: "warn", m, ...d })),
  error: (m, d) => console.error(JSON.stringify({ nivel: "error", m, ...d })),
};

if ((process.env.EM_PROVEEDOR_IA ?? "").toLowerCase() === "claude-code" && process.env.NODE_ENV === "production")
  throw new Error("EM_PROVEEDOR_IA=claude-code es solo para uso personal y local: el servidor en producción atiende a terceros y debe usar ANTHROPIC_API_KEY.");
const almacen = await abrirAlmacen();
const demostracion = process.env.EM_MODO === "demostracion";
if (demostracion && process.env.NODE_ENV === "production" && process.env.EM_PERMITIR_DEMO !== "1") throw new Error("EM_MODO=demostracion no se admite con NODE_ENV=production (use EM_PERMITIR_DEMO=1 para una instancia de muestra aislada).");
let cerrarDemo: (() => Promise<void>) | null = null;
let compartidos: Compartidos;
if (demostracion) {
  // Croma simulado (MCP real sobre datos ficticios) e IA de demostración: sin claves ni datos reales.
  const ent = await prepararDemostracion();
  cerrarDemo = ent.cerrar;
  const s = ent.servicios;
  compartidos = { llm: s.llm, croma: s.croma, repositorio: s.repositorio, resolutor: s.resolutor, config: s.config, registro, advertencias: ["MODO DEMOSTRACIÓN: datos ficticios, fuentes simuladas."] };
  const clave = process.env.EM_CLAVE_DEMO ?? randomBytes(9).toString("base64url");
  await almacen.repo.asegurarTenant("demo", "Despacho de demostración");
  if (!(await almacen.repo.usuarioPorCorreo("demo", PERFIL_DEMO.correo))) {
    const u = await almacen.repo.crearUsuario({ tenantId: "demo", correo: PERFIL_DEMO.correo, nombre: PERFIL_DEMO.nombre, rol: "ABOGADO", clave, tarjetaProfesional: PERFIL_DEMO.tarjetaProfesional });
    await almacen.repo.actualizarPerfil("demo", u.id, { identificacion: PERFIL_DEMO.identificacion, tarjetaProfesional: PERFIL_DEMO.tarjetaProfesional, correoRegistroNacional: PERFIL_DEMO.correoRegistroNacional, telefono: null, direccion: PERFIL_DEMO.direccion, ciudad: PERFIL_DEMO.ciudad }, "SISTEMA");
    registro.warn("demostracion.usuario", { tenant: "demo", correo: PERFIL_DEMO.correo, clave: process.env.EM_CLAVE_DEMO ? "(EM_CLAVE_DEMO)" : clave });
  }
} else compartidos = serviciosCompartidos({ registro });
const { secreto, advertencia } = secretoDesdeEntorno(process.env);
for (const w of [...almacen.advertencias, ...compartidos.advertencias, ...(advertencia ? [advertencia] : [])]) registro.warn("arranque.aviso", { detalle: w });

const bus = new BusEventos();
const trabajador = process.env.EM_TRABAJADOR === "0" ? null : new Trabajador({ almacen, compartidos, bus, registro, concurrencia: Number(process.env.EM_CONCURRENCIA_TRABAJOS ?? 2) });
const app = await construirApp({
  almacen, compartidos, autenticador: crearAutenticador(secreto, Number(process.env.EM_SESION_MINUTOS ?? 480)), bus, trabajador, registro, logger: true,
  dirWeb: process.env.EM_DIR_WEB ?? resolve("apps/web/dist"), maxArchivoMb: Number(process.env.EM_MAX_ARCHIVO_MB ?? 200),
});

trabajador?.iniciar();
const puerto = Number(process.env.PORT ?? 8080);
await app.listen({ port: puerto, host: process.env.HOST ?? "0.0.0.0" });
registro.info("arranque.listo", { puerto, motor: almacen.motor, trabajador: Boolean(trabajador) });

let cerrando = false;
for (const senal of ["SIGINT", "SIGTERM"] as const) {
  process.on(senal, async () => {
    if (cerrando) return;
    cerrando = true;
    registro.info("apagado", { senal });
    await app.close();
    await trabajador?.detener();
    await compartidos.croma.cerrar();
    await cerrarDemo?.();
    await almacen.cerrar();
    process.exit(0);
  });
}
