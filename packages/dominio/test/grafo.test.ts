import { describe, expect, it } from "vitest";
import { GRAFO, type DefinicionGrafo, contraste, validarGrafo, crearExpediente, Expediente } from "../src";

const clonar = (g: DefinicionGrafo): DefinicionGrafo => structuredClone(g);

describe("grafo del sistema", () => {
  it("supera las catorce verificaciones estructurales", () => {
    const r = validarGrafo();
    const fallidas = r.verificaciones.filter((v) => !v.conforme);
    expect(fallidas, JSON.stringify(fallidas, null, 2)).toEqual([]);
    expect(r.conforme).toBe(true);
    expect(r.compuertas).toBe(5);
    expect(r.nodos).toBeGreaterThanOrEqual(45);
  });

  it("declara exactamente tres bucles intencionales", () => {
    expect(GRAFO.aristas.filter((a) => a.retorno).map((a) => `${a.o}→${a.d}`).sort()).toEqual(["g_citas→f4", "g_completo→f1", "m27→f4"]);
  });

  it("no existe ruta al terminal favorable que esquive la aprobación del ABOGADO (USUARIO)", () => {
    const entradas = GRAFO.aristas.filter((a) => a.d === "n_entrega" && a.tipo !== "dependencia");
    expect(entradas).toHaveLength(1);
    expect(entradas[0]!.o).toBe("g_revision");
    expect(GRAFO.nodos.find((n) => n.id === "g_revision")!.decision!.humana).toBe(true);
  });

  it("detecta un recurso huérfano", () => {
    const g = clonar(GRAFO);
    g.recursos.push({ id: "r_fantasma", tipo: "dato", detalle: "", criticidad: "BAJA", riesgo: "" });
    expect(validarGrafo(g).verificaciones.find((v) => v.id === "recursos_usados")!.conforme).toBe(false);
  });

  it("detecta una violación de la regla de capas", () => {
    const g = clonar(GRAFO);
    g.aristas.push({ o: "f4", d: "m21", tipo: "dependencia" });
    expect(validarGrafo(g).verificaciones.find((v) => v.id === "capas")!.conforme).toBe(false);
  });

  it("detecta un ciclo no declarado", () => {
    const g = clonar(GRAFO);
    g.aristas.push({ o: "m19", d: "m15", tipo: "flujo" });
    expect(validarGrafo(g).verificaciones.find((v) => v.id === "ciclos")!.conforme).toBe(false);
  });

  it("detecta una compuerta con una sola rama", () => {
    const g = clonar(GRAFO);
    g.aristas = g.aristas.filter((a) => !(a.o === "g_riesgo" && a.rama === "no"));
    expect(validarGrafo(g).verificaciones.find((v) => v.id === "ramas")!.conforme).toBe(false);
  });

  it("calcula contraste WCAG", () => {
    expect(contraste("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });
});

describe("expediente", () => {
  it("crea un agregado válido con valores por defecto", () => {
    const e = crearExpediente({ id: "exp_1", tenantId: "t", propietarioId: "u", titulo: "Caso", ahora: new Date().toISOString() });
    expect(Expediente.parse(e).estado).toBe("BORRADOR");
    expect(e.analisis.omisiones).toEqual([]);
    expect(e.ejecucion.estados).toEqual({});
  });
});
