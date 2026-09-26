import { resolve } from "node:path";
import { abrirAlmacen } from "@em/almacen";
import type { Registro } from "@em/croma";
import { serviciosCompartidos } from "@em/pipeline";
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

const almacen = await abrirAlmacen();
const compartidos = serviciosCompartidos({ registro });
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
    await almacen.cerrar();
    process.exit(0);
  });
}
