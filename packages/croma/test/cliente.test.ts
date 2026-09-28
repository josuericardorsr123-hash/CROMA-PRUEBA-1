import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClienteCroma, ErrorCroma, iniciarSimuladorCroma, normalizarProceso, type SimuladorCroma, interpretarFuente, mapearCapacidades, aHerramienta, construirArgumentos } from "../src";

const CLAVE = "clave-de-prueba";
const PROCESO = {
  found: true,
  proceso: { llaveProceso: "11001400302320240012300", despacho: "JUZGADO 023 CIVIL MUNICIPAL DE BOGOTÁ", claseProceso: "Ejecutivo Singular", sujetosProcesales: "Demandante: BANCO EJEMPLO S.A. | Demandado: PERSONA FICTICIA" },
  actuaciones: [
    { fechaActuacion: "2026-08-20T00:00:00", actuacion: "Auto libra mandamiento de pago", anotacion: null },
    { fechaActuacion: "2026-09-18T00:00:00", actuacion: "Notificación personal", anotacion: "Mandamiento notificado por correo electrónico (Ley 2213 de 2022)" },
  ],
};

let sim: SimuladorCroma;

beforeAll(async () => {
  sim = await iniciarSimuladorCroma({
    apiKey: CLAVE,
    datos: {
      procesos: { "11001400302320240012300": PROCESO },
      cedulas: { "1000000001": { found: true, estado: "VIGENTE" } },
      normas: { "ley 1564 de 2012|94": { texto: "La presentación de la demanda interrumpe el término para la prescripción e impide que se produzca la caducidad…", url: "http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012.html" } },
    },
    pendientePrimera: ["samai_processes_by_radicado"],
    fallarPrimeras: { rues_company_search: 2, dian_cufe_validation: 1000 },
  });
});

afterAll(async () => {
  await sim.cerrar();
});

const nuevo = (extra: Partial<ConstructorParameters<typeof ClienteCroma>[0]> = {}) =>
  new ClienteCroma({ url: sim.url, apiKey: CLAVE, simulado: true, esperaPendienteMs: 10, esperaReintentoMs: 5, timeoutMs: 10_000, ...extra });

describe("descubrimiento y mapeo de capacidades", () => {
  it("interpreta fuente y país de la descripción", () => {
    expect(interpretarFuente("Hace algo. (Source: RUES; Country: Colombia)")).toEqual({ fuente: "RUES", pais: "Colombia" });
  });

  it("lista el catálogo y asocia capacidades por prefijo, palabras y parámetros", async () => {
    const c = nuevo();
    const herramientas = await c.herramientas();
    expect(herramientas.length).toBeGreaterThanOrEqual(15);
    const mapa = await c.capacidades();
    expect(mapa.get("procesos.por_radicado")!.herramienta.nombre).toBe("rama_judicial_cases_by_radicado");
    expect(mapa.get("procesos.por_nombre")!.herramienta.nombre).toBe("rama_judicial_cases_by_name");
    expect(mapa.get("empresas.rues")!.herramienta.nombre).toBe("rues_company_search");
    expect(mapa.get("normas.texto")!.herramienta.nombre).toBe("legalize_law_article");
    expect(mapa.get("web.extraer")!.herramienta.nombre).toBe("extract_url");
    expect(mapa.get("web.busqueda")!.herramienta.nombre).toBe("web_search");
    expect(mapa.get("identidad.cedula")!.argumentos.documento).toBe("document_number");
    expect(mapa.has("salud.afiliacion")).toBe(false); // el simulador no expone ADRES: queda sin asignar
    await c.cerrar();
  });

  it("respeta el mapeo fijado por configuración", () => {
    const hs = [aHerramienta({ name: "rama_x", description: "(Source: Rama; Country: Colombia)", inputSchema: { type: "object", properties: { numero: { type: "string" } }, required: ["numero"] } })];
    const mapa = mapearCapacidades(hs, { "procesos.por_radicado": { herramienta: "rama_x", argumentos: { radicado: "numero" } } });
    const a = mapa.get("procesos.por_radicado")!;
    expect(a.fijadaPorConfiguracion).toBe(true);
    expect(construirArgumentos(a, { radicado: "123" })).toEqual({ numero: "123" });
  });
});

describe("consultas con procedencia", () => {
  it("consulta un proceso por radicado y normaliza actuaciones", async () => {
    const c = nuevo();
    const r = await c.consultar("procesos.por_radicado", { radicado: "11001400302320240012300" });
    expect(r.estado).toBe("OK");
    expect(r.procedencia.tipo).toBe("SIMULADO");
    expect(r.procedencia.hashResultado).toMatch(/^[a-f0-9]{64}$/);
    expect(r.procedencia.finalidad).toContain("Vigilancia judicial");
    const p = normalizarProceso(r.datos);
    expect(p.despacho).toContain("CIVIL MUNICIPAL");
    expect(p.ultimaActuacion!.fecha).toBe("2026-09-18");
    expect(p.sujetos).toHaveLength(2);
    // Segunda consulta: caché, sin nueva llamada al servidor
    const llamadas = sim.llamadas.length;
    const r2 = await c.consultar("procesos.por_radicado", { radicado: "11001400302320240012300" });
    expect(r2.procedencia.desdeCache).toBe(true);
    expect(sim.llamadas.length).toBe(llamadas);
    await c.cerrar();
  });

  it("\"found: false\" es respuesta definitiva (SIN_RESULTADOS), no error", async () => {
    const c = nuevo();
    expect((await c.consultar("procesos.por_radicado", { radicado: "99999999999999999999999" })).estado).toBe("SIN_RESULTADOS");
    await c.cerrar();
  });

  it("repite la consulta cuando la fuente responde pending", async () => {
    const c = nuevo();
    const r = await c.consultar("procesos.contencioso", { radicado: "11001400302320240012300" });
    expect(r.estado).toBe("OK");
    expect(sim.llamadas.filter((l) => l.herramienta === "samai_processes_by_radicado").length).toBe(2);
    await c.cerrar();
  });

  it("reintenta ante fallas transitorias (503)", async () => {
    const c = nuevo({ reintentos: 2 });
    const r = await c.consultar("empresas.rues", { nit: "900000001" });
    expect(["OK", "SIN_RESULTADOS"]).toContain(r.estado);
    await c.cerrar();
  });

  it("abre el cortacircuitos tras fallas consecutivas y no insiste", async () => {
    const c = nuevo({ reintentos: 0, umbralCircuito: 2, enfriamientoCircuitoMs: 60_000 });
    await c.consultar("tributario.factura_cufe", { cufe: "a1" });
    await c.consultar("tributario.factura_cufe", { cufe: "a2" });
    const antes = sim.llamadas.length;
    const r = await c.consultar("tributario.factura_cufe", { cufe: "a3" });
    expect(r.estado).toBe("ERROR");
    expect(r.procedencia.error).toContain("Cortacircuitos abierto");
    expect(sim.llamadas.length).toBe(antes);
    await c.cerrar();
  });

  it("exige autorización expresa para datos personales de debida diligencia", async () => {
    const c = nuevo();
    await expect(c.consultar("identidad.cedula", { documento: "1000000001" })).rejects.toBeInstanceOf(ErrorCroma);
    const r = await c.consultar("identidad.cedula", { documento: "1000000001" }, { autorizada: true, finalidad: "Verificar vigencia de la cédula del causante (sucesión)" });
    expect(r.estado).toBe("OK");
    expect(r.procedencia.finalidad).toContain("causante");
    await c.cerrar();
  });

  it("exige finalidad en llamadas directas", async () => {
    const c = nuevo();
    await expect(c.llamarHerramienta("web_search", { query: "x" }, { finalidad: " " })).rejects.toBeInstanceOf(ErrorCroma);
    await c.cerrar();
  });

  it("verifica texto normativo con la capacidad normas.texto", async () => {
    const c = nuevo();
    const r = await c.consultar("normas.texto", { norma: "Ley 1564 de 2012", articulo: "94" });
    expect(r.estado).toBe("OK");
    expect(JSON.stringify(r.datos)).toContain("interrumpe el término");
    await c.cerrar();
  });

  it("rechaza credenciales inválidas sin tumbar el sistema", async () => {
    const c = new ClienteCroma({ url: sim.url, apiKey: "clave-incorrecta", simulado: true, reintentos: 0, timeoutMs: 5000 });
    const r = await c.consultar("procesos.por_radicado", { radicado: "11001400302320240012300" });
    expect(r.estado).toBe("ERROR");
    expect(r.procedencia.error).toBeTruthy();
    await c.cerrar();
  });

  it("sin clave, toda consulta queda NO VERIFICADA (ERROR declarado)", async () => {
    const c = new ClienteCroma({ url: sim.url, apiKey: null });
    const r = await c.consultar("procesos.por_radicado", { radicado: "1" });
    expect(r.estado).toBe("ERROR");
    expect(r.procedencia.error).toContain("no configurada");
    const e = await c.estado();
    expect(e.configurado).toBe(false);
  });
});
