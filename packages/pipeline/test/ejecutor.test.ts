import { crearExpediente, type DefinicionGrafo, GRAFO, type Nodo } from "@em/dominio";
import { describe, expect, it } from "vitest";
import { type ConfigPipeline, Ejecutor, type ManejadorNodo, MANEJADORES, type Servicios } from "../src";

/* Semántica del ejecutor sobre grafos mínimos: caminos muertos, ramas,
 * retornos con límite, pausas y reanudación, y recuperación tras error. */

const nodo = (id: string, tipo: Nodo["tipo"] = "proceso", extra: Partial<Nodo> = {}): Nodo => ({ id, etapa: "e1", nombre: id, tipo, grupo: "nucleo", recursos: [], hace: "", sirve: "", importa: "", ...extra });

function grafo(nodos: Nodo[], aristas: DefinicionGrafo["aristas"], inicio: string, terminales: string[]): DefinicionGrafo {
  return { nodos, aristas, recursos: [], etapas: GRAFO.etapas, paleta: GRAFO.paleta, aciclico: false, inicio, terminales };
}

const servicios = (config: Partial<ConfigPipeline> = {}) => ({ config: { concurrencia: 4, maxIteraciones: { g_citas: 2, revision: 3 }, ...config }, reloj: () => new Date("2026-09-25T15:00:00Z"), registro: { debug() {}, info() {}, warn() {}, error() {} }, blobs: { guardar: async () => ({ blobId: "blob_x", sha256: "", bytes: 0 }), leer: async () => Buffer.alloc(0) } }) as unknown as Servicios;
const exp = () => crearExpediente({ id: "exp_t", tenantId: "t", propietarioId: "u", titulo: "t", ahora: "2026-09-25T15:00:00Z" });
const guardar = async (e: ReturnType<typeof exp>) => ({ ...e, version: e.version + 1 });
const ok = (orden: string[]): ManejadorNodo => async (ctx) => (orden.push(ctx.nodo.id), { tipo: "COMPLETADO", detalle: "ok" });

describe("ejecutor del grafo", () => {
  it("cubre con manejadores todos los nodos del grafo validado", () => {
    expect(() => new Ejecutor(MANEJADORES)).not.toThrow();
    expect(Object.keys(MANEJADORES).sort()).toEqual(GRAFO.nodos.map((n) => n.id).sort());
    expect(() => new Ejecutor({ n_exp: MANEJADORES.n_exp! })).toThrow(/sin manejador/);
  });

  it("elimina el camino muerto de la rama no elegida y llega a un terminal", async () => {
    const orden: string[] = [];
    const g = grafo([nodo("a"), nodo("g", "decision", { decision: { si: "s", no: "n", humana: false } }), nodo("x"), nodo("y"), nodo("fin", "entrada_salida", { terminal: true }), nodo("otro", "entrada_salida", { terminal: true })], [
      { o: "a", d: "g", tipo: "flujo" }, { o: "g", d: "x", tipo: "flujo", rama: "si", etiqueta: "s" }, { o: "g", d: "y", tipo: "error", rama: "no", etiqueta: "n" }, { o: "x", d: "fin", tipo: "flujo" }, { o: "y", d: "otro", tipo: "flujo" },
    ], "a", ["fin", "otro"]);
    const e = new Ejecutor({ a: ok(orden), g: async () => ({ tipo: "DECISION", rama: "si", motivo: "porque sí" }), x: ok(orden), y: ok(orden), fin: ok(orden), otro: ok(orden) }, g);
    const r = await e.ejecutar(exp(), servicios(), { guardar });
    expect(r.estado).toBe("TERMINADO");
    expect(orden).toEqual(["a", "x", "fin"]);
    expect(r.exp.ejecucion.estados).toMatchObject({ y: "OMITIDO", otro: "OMITIDO", g: "COMPLETADO" });
    expect(r.exp.estado).toBe("REMITIDO");
  });

  it("un nodo con varias entradas espera a todas y corre en paralelo lo independiente", async () => {
    const orden: string[] = [];
    const lento: ManejadorNodo = async (ctx) => (await new Promise((ok2) => setTimeout(ok2, 20)), orden.push(ctx.nodo.id), { tipo: "COMPLETADO", detalle: "" });
    const g = grafo([nodo("a"), nodo("b"), nodo("c"), nodo("d"), nodo("fin", "entrada_salida")], [
      { o: "a", d: "b", tipo: "flujo" }, { o: "a", d: "c", tipo: "flujo" }, { o: "b", d: "d", tipo: "flujo" }, { o: "c", d: "d", tipo: "datos" }, { o: "d", d: "fin", tipo: "flujo" },
    ], "a", ["fin"]);
    const r = await new Ejecutor({ a: ok(orden), b: lento, c: ok(orden), d: ok(orden), fin: ok(orden) }, g).ejecutar(exp(), servicios(), { guardar });
    expect(r.estado).toBe("TERMINADO");
    expect(orden.indexOf("d")).toBeGreaterThan(orden.indexOf("b"));
    expect(orden.indexOf("c")).toBeLessThan(orden.indexOf("b"));
  });

  it("un retorno reinicia el tramo y el límite de iteraciones se respeta", async () => {
    let pasadas = 0;
    const g = grafo([nodo("a"), nodo("b"), nodo("g_citas", "decision", { decision: { si: "s", no: "n", humana: false } }), nodo("fin", "entrada_salida")], [
      { o: "a", d: "b", tipo: "flujo" }, { o: "b", d: "g_citas", tipo: "flujo" }, { o: "g_citas", d: "b", tipo: "error", rama: "no", retorno: true, etiqueta: "n" }, { o: "g_citas", d: "fin", tipo: "flujo", rama: "si", etiqueta: "s" },
    ], "a", ["fin"]);
    const h = { a: ok([]), b: ok([]), fin: ok([]), g_citas: (async () => (pasadas++, { tipo: "DECISION", rama: pasadas < 3 ? "no" : "si", motivo: `pasada ${pasadas}` })) as ManejadorNodo };
    const r = await new Ejecutor(h, g).ejecutar(exp(), servicios(), { guardar });
    expect(r.estado).toBe("TERMINADO");
    expect(r.exp.ejecucion.iteraciones).toMatchObject({ g_citas: 2, ciclo: 2 });
    expect(r.exp.decisiones.map((d) => d.decision)).toEqual(["no", "no", "si"]);
    pasadas = -10;
    const r2 = await new Ejecutor(h, g).ejecutar(exp(), servicios({ maxIteraciones: { g_citas: 1, revision: 1 } }), { guardar });
    expect(r2.estado).toBe("ERROR");
    expect(r2.error).toMatch(/límite de 1 re-elaboraciones/);
  });

  it("pausa, reanuda desde el mismo nodo y no repite lo completado", async () => {
    const orden: string[] = [];
    const g = grafo([nodo("a"), nodo("g_revision", "decision", { decision: { si: "s", no: "n", humana: true } }), nodo("fin", "entrada_salida"), nodo("dev", "entrada_salida")], [
      { o: "a", d: "g_revision", tipo: "flujo" }, { o: "g_revision", d: "fin", tipo: "flujo", rama: "si", etiqueta: "s" }, { o: "g_revision", d: "dev", tipo: "error", rama: "no", etiqueta: "n" },
    ], "a", ["fin", "dev"]);
    const h: Record<string, ManejadorNodo> = {
      a: ok(orden), fin: ok(orden), dev: ok(orden),
      g_revision: async (ctx) => {
        const i = ctx.instrucciones("APROBAR")[0];
        if (!i) return { tipo: "PAUSA", motivo: "Decida", acciones: ["APROBAR"] };
        ctx.consumir(i);
        return { tipo: "DECISION", rama: "si", motivo: "aprobado", actor: i.usuarioId };
      },
    };
    const e = new Ejecutor(h, g);
    const r1 = await e.ejecutar(exp(), servicios(), { guardar });
    expect(r1).toMatchObject({ estado: "PAUSADO", pausa: { nodo: "g_revision", acciones: ["APROBAR"] } });
    expect(r1.exp.estado).toBe("EN_REVISION");
    const conInstruccion = { ...r1.exp, instrucciones: [{ id: "ins_1", accion: "APROBAR" as const, nodo: null, motivo: "", usuarioId: "usr_1", emitidaEn: "2026-09-25T16:00:00Z", consumida: false, consumidaEn: null }] };
    const r2 = await e.ejecutar(conInstruccion, servicios(), { guardar });
    expect(r2.estado).toBe("TERMINADO");
    expect(orden).toEqual(["a", "fin"]);
    expect(r2.exp.instrucciones[0]!.consumida).toBe(true);
    expect(r2.exp.decisiones.at(-1)).toMatchObject({ actor: "usr_1", decision: "si" });
  });

  it("un error detiene el pipeline con estado ERROR y la reanudación retoma el nodo fallido", async () => {
    let fallar = true;
    const orden: string[] = [];
    const g = grafo([nodo("a"), nodo("b"), nodo("fin", "entrada_salida")], [{ o: "a", d: "b", tipo: "flujo" }, { o: "b", d: "fin", tipo: "flujo" }], "a", ["fin"]);
    const h: Record<string, ManejadorNodo> = { a: ok(orden), fin: ok(orden), b: async (ctx) => { if (fallar) throw new Error("falla determinista"); orden.push(ctx.nodo.id); return { tipo: "COMPLETADO", detalle: "" }; } };
    const e = new Ejecutor(h, g);
    const r1 = await e.ejecutar(exp(), servicios(), { guardar, reintentosNodo: 0 });
    expect(r1.estado).toBe("ERROR");
    expect(r1.error).toMatch(/falla determinista/);
    expect(r1.exp.ejecucion.estados.b).toBe("ERROR");
    fallar = false;
    const r2 = await e.ejecutar(r1.exp, servicios(), { guardar });
    expect(r2.estado).toBe("TERMINADO");
    expect(orden).toEqual(["a", "b", "fin"]);
  });

  it("guarda un punto de control por nodo con la versión devuelta por el almacén", async () => {
    const versiones: number[] = [];
    const g = grafo([nodo("a"), nodo("fin", "entrada_salida")], [{ o: "a", d: "fin", tipo: "flujo" }], "a", ["fin"]);
    const r = await new Ejecutor({ a: ok([]), fin: ok([]) }, g).ejecutar(exp(), servicios(), { guardar: async (e) => (versiones.push(e.version), { ...e, version: e.version + 1 }) });
    expect(versiones).toEqual([0, 1, 2, 3]);
    expect(r.exp.version).toBe(4);
  });
});
