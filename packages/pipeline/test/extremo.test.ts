import { inspeccionarDocx } from "@em/docgen";
import { type Expediente, GRAFO, type Instruccion, nuevoId } from "@em/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type EntornoDemostracion, ejecutarPipeline, prepararDemostracion, verificarAfirmaciones } from "../src";

/* Prueba de extremo a extremo: el expediente de DEMOSTRACIÓN (datos ficticios)
 * recorre los 45 nodos del grafo con Croma simulado sobre MCP real y la IA de
 * demostración; el ABOGADO (USUARIO) devuelve una vez y luego aprueba. */

const RELOJ = () => new Date("2026-09-25T15:00:00Z");
const instruccion = (accion: Instruccion["accion"], datos: unknown = {}, motivo = ""): Instruccion => ({ id: nuevoId("ins"), accion, nodo: null, motivo, datos, usuarioId: "usr_demo", emitidaEn: RELOJ().toISOString(), consumida: false, consumidaEn: null });

describe("pipeline completo sobre el expediente de demostración", () => {
  let ent: EntornoDemostracion;
  let exp: Expediente;
  const guardar = async (e: Expediente) => ({ ...e, version: e.version + 1 });
  const eventos: string[] = [];

  beforeAll(async () => {
    ent = await prepararDemostracion({ reloj: RELOJ, config: { paginarInforme: false } });
    exp = ent.expediente;
  });
  afterAll(async () => ent?.cerrar());

  it("primera ejecución: procesa todo y se detiene en la revisión del ABOGADO (USUARIO)", async () => {
    const r = await ejecutarPipeline(exp, ent.servicios, { guardar, alEvento: (e) => eventos.push(`${e.tipo}:${e.nodo}:${e.resultado ?? ""}`) });
    if (r.estado !== "PAUSADO") throw new Error(`${r.estado}: ${r.error ?? JSON.stringify(r.pausa)}`);
    exp = r.exp;
    expect(r.pausa?.nodo).toBe("g_revision");
    expect(exp.estado).toBe("EN_REVISION");

    // Fase 1: comprimido expandido, duplicado exacto detectado, nada descartado sin rastro
    expect(exp.entrantes.every((e) => e.procesado)).toBe(true);
    expect(exp.archivos).toHaveLength(6);
    expect(exp.archivos.filter((a) => a.estado === "DUPLICADO")).toHaveLength(1);
    // Fase 2: lectura íntegra, incluida la lectura visual del escaneo
    expect(exp.archivos.filter((a) => a.estado === "LEIDO")).toHaveLength(5);
    const escaneo = exp.lecturas.find((l) => l.metodo === "LECTURA_VISUAL");
    expect(escaneo?.tipologia).toBe("PAGARE");
    expect(escaneo?.transcripcion).toContain("pagaré incondicionalmente");
    // Fase 3: organización con puerta de entrada primero y anexos estables
    const organizados = exp.piezas.filter((p) => p.estado === "ORGANIZADO");
    expect(organizados).toHaveLength(5);
    expect(["PODER", "RELATO_CLIENTE"]).toContain(organizados[0]!.tipologia);
    expect(organizados.map((p) => p.anexo).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(organizados.every((p) => /^\d{2}_[A-Z_]+-.+_(\d{2}-\d{2}-\d{4}|SIN_FECHA)\.pdf$/.test(p.nombreArchivo))).toBe(true);
    expect(exp.hechos.length).toBeGreaterThanOrEqual(5);
    expect(exp.hechos.some((h) => h.estado === "AFIRMADO_POR_CLIENTE")).toBe(true);
    expect(exp.hechos.filter((h) => h.estado === "PROBADO_DOCUMENTAL").every((h) => h.soportes.length > 0)).toBe(true);
    // Fuentes oficiales vía Croma (simulado) y auditoría de citas
    expect(exp.analisis.diligencia.some((d) => d.capacidad === "empresas.rues")).toBe(true);
    const normas = exp.fuentes.filter((f) => f.clase === "NORMA");
    expect(normas.map((f) => f.identificador)).toEqual(expect.arrayContaining(["Ley 1564 de 2012, art. 422", "Código de Comercio, art. 789"]));
    expect(normas.every((f) => f.resolucion === "TEXTO_OFICIAL" && f.vigencia === "VIGENTE")).toBe(true);
    expect(exp.procedencias.length).toBeGreaterThan(5);
    expect(exp.procedencias.every((p) => p.tipo === "SIMULADO" || p.tipo === "HTTP_OFICIAL")).toBe(true);
    expect(exp.citas.filter((c) => c.estado === "BLOQUEADA")).toEqual([]);
    // Términos: la prescripción cambiaria corre desde el vencimiento (1 de marzo de 2024 + 3 años)
    const cambiaria = exp.terminos.find((t) => t.catalogoId === "cambiaria_directa");
    expect(cambiaria?.vencimiento).toBe("2027-03-01");
    expect(exp.ejecucion.ramas.g_riesgo).toBe("no");
    // Estrategia y pieza
    expect(exp.estrategia?.piezaSiguiente.tipo).toBe("DEMANDA_EJECUTIVA");
    expect(exp.analisis.masc).not.toBeNull();
    expect(exp.analisis.habilitacion?.habilitada).toBe(true);
    // Gobernanza: cadena de trazabilidad íntegra y etiquetas
    expect(exp.afirmaciones.length).toBeGreaterThan(20);
    expect(verificarAfirmaciones(exp.afirmaciones).integra).toBe(true);
    expect(exp.afirmaciones.some((a) => a.etiqueta === "CONCLUSION_CONSOLIDADA")).toBe(true);
    // Decisiones de compuertas registradas
    expect(exp.decisiones.map((d) => `${d.compuerta}:${d.decision}`)).toEqual(["g_completo:si", "g_citas:si", "g_riesgo:no", "g_habilitacion:si"]);
    expect(eventos.some((e) => e.startsWith("PAUSA:g_revision"))).toBe(true);
  });

  it("los entregables en borrador cumplen el formato y no hay versión radicable sin aprobación", async () => {
    const tipos = exp.entregables.map((e) => `${e.tipo}:${e.modo}`);
    expect(tipos).toEqual(expect.arrayContaining(["INDICE_ELECTRONICO:BORRADOR", "EXPEDIENTE_ORGANIZADO:BORRADOR", "PIEZA_PROCESAL:BORRADOR", "INFORME_TECNICO:BORRADOR", "PAQUETE_ANEXOS:BORRADOR"]));
    expect(tipos.some((t) => t.endsWith("RADICABLE"))).toBe(false);
    const informe = [...exp.entregables].reverse().find((e) => e.tipo === "INFORME_TECNICO")!;
    const i = inspeccionarDocx(await ent.servicios.blobs.leer(informe.blobId, exp.tenantId));
    expect(i.fuentes).toEqual(["Times New Roman"]);
    expect(i.colores).toEqual(["000000"]);
    expect(i.notasAlPie).toBeGreaterThan(10);
    expect(i.campoIndice && i.campoPagina && i.campoTotalPaginas).toBe(true);
    for (const t of ["I. ANTECEDENTES Y OBJETO DEL INFORME", "IV. HECHOS JURÍDICAMENTE RELEVANTES", "VI. MARCO NORMATIVO APLICABLE", "IX. TÉRMINOS, PRESCRIPCIÓN Y CADUCIDAD", "XIII. ACTUACIÓN SIGUIENTE, LÍMITES Y GOBERNANZA", "CONCLUSIONES", "Referencias", "—Josué Ricardo Rojas Silva—", "DEMOSTRACIÓN — datos ficticios, fuentes simuladas", "«Pueden demandarse ejecutivamente"]) expect(i.texto, t).toContain(t);
    expect(i.texto).not.toContain("[cita retirada");
    const pieza = [...exp.entregables].reverse().find((e) => e.tipo === "PIEZA_PROCESAL")!;
    const ip = inspeccionarDocx(await ent.servicios.blobs.leer(pieza.blobId, exp.tenantId));
    expect(ip.encabezado).toContain("BORRADOR PARA REVISIÓN DEL ABOGADO (USUARIO)");
    for (const t of ["I. PARTES", "II. HECHOS", "III. PRETENSIONES", "IV. FUNDAMENTOS DE DERECHO", "ANEXOS", "NOTIFICACIONES", "ADVERTENCIA:"]) expect(ip.texto, t).toContain(t);
  });

  it("el ABOGADO (USUARIO) devuelve: se clasifica la corrección y se re-elabora completo", async () => {
    exp = { ...exp, instrucciones: [...exp.instrucciones, instruccion("DEVOLVER", { observaciones: [{ texto: "Precisar en los hechos la fecha exacta del requerimiento de pago.", seccion: "Hechos" }] })] };
    const r = await ejecutarPipeline(exp, ent.servicios, { guardar });
    if (r.estado !== "PAUSADO") throw new Error(`${r.estado}: ${r.error}`);
    exp = r.exp;
    expect(r.pausa?.nodo).toBe("g_revision");
    expect(exp.correcciones).toHaveLength(1);
    expect(exp.correcciones[0]!.tipo).toBe("HECHO_MAL_ESTABLECIDO");
    expect(exp.ejecucion.iteraciones.revision).toBe(1);
    expect(exp.decisiones.filter((d) => d.compuerta === "g_revision").map((d) => d.decision)).toEqual(["no"]);
    expect(ent.memoria.guardadas.length).toBeGreaterThan(0);
    expect(JSON.stringify(ent.memoria.guardadas)).not.toMatch(/FICTICIA|000\.000/);
    expect(exp.entregables.filter((e) => e.tipo === "PIEZA_PROCESAL" && e.modo === "BORRADOR").length).toBe(2);
  });

  it("el ABOGADO (USUARIO) aprueba: se generan las versiones radicable y final, y termina", async () => {
    exp = { ...exp, instrucciones: [...exp.instrucciones, instruccion("APROBAR", {}, "Revisado.")] };
    const r = await ejecutarPipeline(exp, ent.servicios, { guardar });
    if (r.estado !== "TERMINADO") throw new Error(`${r.estado}: ${r.error ?? JSON.stringify(r.pausa)}`);
    exp = r.exp;
    expect(exp.estado).toBe("APROBADO");
    expect(exp.ejecucion.estados.n_entrega).toBe("COMPLETADO");
    expect(exp.ejecucion.estados.n_remision).toBe("OMITIDO");
    expect(GRAFO.nodos.every((n) => ["COMPLETADO", "OMITIDO"].includes(exp.ejecucion.estados[n.id]!))).toBe(true);
    const radicable = exp.entregables.find((e) => e.tipo === "PIEZA_PROCESAL" && e.modo === "RADICABLE")!;
    const ip = inspeccionarDocx(await ent.servicios.blobs.leer(radicable.blobId, exp.tenantId));
    expect(ip.encabezado).toBe("");
    expect(ip.texto).not.toContain("ADVERTENCIA");
    expect(ip.texto).toContain("ABOGADO DE DEMOSTRACIÓN");
    expect(ip.texto).not.toMatch(/\[NOMBRE\]|\[C\.C\. No\.\]|\[T\.P\. No\.\]/);
    expect(ip.texto).toContain("domiciliada en Bogotá D.C.");
    expect(ip.texto).not.toMatch(/PERSONA FICTICIA DOS \(Representante legal de la acreedora\): dirección física/);
    expect(ip.texto).toMatch(/1 de marzo de 2023 la PERSONA NATURAL FICTICIA suscribió/);
    expect(exp.entregables.some((e) => e.tipo === "INFORME_TECNICO" && e.modo === "RADICABLE")).toBe(true);
    expect(exp.decisiones.at(-1)).toMatchObject({ compuerta: "g_revision", decision: "si", actor: "usr_demo" });
  });
});

describe("compuertas con intervención del ABOGADO (USUARIO)", () => {
  it("sin título ejecutivo la compuerta de completitud se detiene y continúa solo por decisión registrada", async () => {
    const ent = await prepararDemostracion({ reloj: RELOJ, config: { paginarInforme: false }, filtrarArchivos: (n) => !/escaneo/.test(n) });
    try {
      const guardar = async (e: Expediente) => ({ ...e, version: e.version + 1 });
      const r1 = await ejecutarPipeline(ent.expediente, ent.servicios, { guardar });
      expect(r1.estado).toBe("PAUSADO");
      expect(r1.pausa?.nodo).toBe("g_completo");
      expect(r1.pausa?.acciones).toEqual(["CARGAR_DOCUMENTOS", "CONTINUAR_CON_VACIOS"]);
      const r2 = await ejecutarPipeline({ ...r1.exp, instrucciones: [instruccion("CONTINUAR_CON_VACIOS", {}, "El título se aportará en físico.")] }, ent.servicios, { guardar });
      expect(r2.exp.decisiones[0]).toMatchObject({ compuerta: "g_completo", decision: "si", anulacionHumana: true, actor: "usr_demo" });
      expect(r2.exp.ejecucion.estados.f4).toBe("COMPLETADO");
    } finally {
      await ent.cerrar();
    }
  });

  it("una cita no verificable devuelve el fundamento y se retira en la re-elaboración", async () => {
    const url = "https://www.corteconstitucional.gov.co/relatoria/2099/T-998-99.htm";
    const datos = (await import("../src")).datosCromaDemo();
    datos.paginas = { [url]: "Sentencia T-998 de 2099 (texto simulado de prueba). Ratio: el título valor que reúne sus requisitos presta mérito ejecutivo." };
    const ent = await prepararDemostracion({ reloj: RELOJ, config: { paginarInforme: false }, datosCroma: datos, opcionesLlm: { providenciasCandidatas: ["T-998 de 2099", "T-999 de 2099"] } });
    try {
      const r = await ejecutarPipeline(ent.expediente, ent.servicios, { guardar: async (e) => ({ ...e, version: e.version + 1 }) });
      expect(r.estado).toBe("PAUSADO");
      expect(r.exp.decisiones.filter((d) => d.compuerta === "g_citas").map((d) => d.decision)).toEqual(["no", "si"]);
      expect(r.exp.ejecucion.iteraciones.g_citas).toBe(1);
      const t998 = r.exp.fuentes.find((f) => f.identificador === "T-998 de 2099");
      expect(t998).toMatchObject({ resolucion: "TEXTO_OFICIAL" });
      expect(t998?.fuerzaVinculante).not.toBeNull();
      expect(t998?.analogia?.nivel).toBe("MEDIA");
      expect(r.exp.fuentes.some((f) => f.identificador === "T-999 de 2099")).toBe(false);
      expect(r.exp.citas.some((c) => c.estado === "BLOQUEADA")).toBe(false);
    } finally {
      await ent.cerrar();
    }
  });
});
