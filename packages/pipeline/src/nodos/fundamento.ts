import { DOMINIOS_OFICIALES, esDominioOficial, type ProcedenciaCroma } from "@em/croma";
import { type Cita, type ClaseFuente, type CuerpoNormativo, type Fuente, nuevoId, type ProblemaJuridico, sha256 } from "@em/dominio";
import type { ResolucionFuente } from "@em/fuentes";
import type { HerramientaAgente } from "@em/ia";
import { type CitaDetectada, claveIdentificador, cuerposSugeridos, evaluarBloque, evaluarFuerzaVinculante, extraerCitas, type EntradaVinculancia } from "@em/motores";
import type { ContextoNodo, ManejadorNodo } from "../contexto";
import { Analogias, Fichas, Plan } from "../esquemas";
import { agente, tarea } from "../ia";
import { bloques, vistaCaso, vistaCorrecciones, vistaFuentes, vistaHechos, vistaMemoria, vistaPartes, vistaProblemas } from "../vistas";
import { aviso, completado, decision, pausa, reiniciarAvisos } from "./comun";

/* e3 · Fundamento (Fase 4 y Capa A). Ninguna cita avanza sin resolverse contra
 * su fuente primaria: repositorio fresco → Croma → fuente oficial directa →
 * búsqueda oficial → NO_RESUELTA (bloquea). */

type PlanGuardado = Plan & { problemaIds: string[] };

interface ResolucionRegistrada {
  identificador: string;
  clase: ClaseFuente;
  resolucion: ResolucionFuente["resolucion"];
  vigencia: ResolucionFuente["vigencia"];
  fuenteId: string | null;
  notas: string[];
  modulo: string;
  planificada: boolean;
}

const plan = (ctx: ContextoNodo) => ctx.exp.borradores.plan as PlanGuardado | undefined;
const resoluciones = (ctx: ContextoNodo) => ((ctx.exp.borradores.resoluciones as ResolucionRegistrada[] | undefined) ??= []);

function registrarResolucion(ctx: ContextoNodo, r: ResolucionRegistrada): void {
  const lista = resoluciones(ctx).filter((x) => !(claveIdentificador(x.identificador) === claveIdentificador(r.identificador) && x.modulo === r.modulo));
  lista.push(r);
  ctx.exp.borradores.resoluciones = lista;
}

const CLASE: Record<CitaDetectada["clase"], ClaseFuente> = { PROVIDENCIA_CC: "PROVIDENCIA", PROVIDENCIA_CSJ: "PROVIDENCIA", PROVIDENCIA_CE: "PROVIDENCIA", NORMA: "NORMA", CODIGO: "NORMA", CONCEPTO: "CONCEPTO" };

async function registrarProcedencias(ctx: ContextoNodo, ps: ProcedenciaCroma[], texto: string | null): Promise<void> {
  let conTexto = false;
  for (const p of ps) {
    const adjunto = !conTexto && p.estado === "OK" && texto ? texto : null;
    if (adjunto) conTexto = true;
    await ctx.procedencia(p, adjunto);
  }
}

function fuenteExistente(ctx: ContextoNodo, identificador: string): Fuente | null {
  const k = claveIdentificador(identificador);
  return ctx.exp.fuentes.find((f) => claveIdentificador(f.identificador) === k && f.resolucion !== "NO_RESUELTA") ?? null;
}

/** Resuelve una cita contra fuente primaria y la incorpora como Fuente (o reutiliza la ya verificada en esta ejecución). */
async function resolverCita(ctx: ContextoNodo, c: CitaDetectada, extra: { modulo: string; problemasIds: string[]; ratio?: string | null; hechosDeterminantes?: string | null; fecha?: string | null; clase?: ClaseFuente; titulo?: string }, planificada: boolean): Promise<Fuente | null> {
  const previa = fuenteExistente(ctx, c.identificador);
  if (previa) {
    previa.problemasIds = [...new Set([...previa.problemasIds, ...extra.problemasIds])];
    if (extra.ratio && !previa.ratio) previa.ratio = extra.ratio;
    registrarResolucion(ctx, { identificador: c.identificador, clase: previa.clase, resolucion: previa.resolucion, vigencia: previa.vigencia, fuenteId: previa.id, notas: ["Reutilizada: ya verificada en esta ejecución."], modulo: extra.modulo, planificada });
    return previa;
  }
  const r = await ctx.s.resolutor.resolver(c);
  await registrarProcedencias(ctx, r.procedencias, r.texto);
  const clase = extra.clase ?? CLASE[c.clase];
  if (r.resolucion === "NO_RESUELTA") {
    registrarResolucion(ctx, { identificador: c.identificador, clase, resolucion: r.resolucion, vigencia: r.vigencia, fuenteId: null, notas: r.notas, modulo: extra.modulo, planificada });
    return null;
  }
  const f: Fuente = {
    id: nuevoId("fte"), clase, identificador: c.identificador, titulo: extra.titulo ?? r.titulo, autoridad: r.autoridad, fecha: extra.fecha ?? null, url: r.url, resolucion: r.resolucion,
    vigencia: r.vigencia, condicionamiento: r.condicionamiento, fuerzaVinculante: null, fundamentoVinculancia: null, textoRelevante: (r.fragmento ?? r.texto)?.slice(0, 12_000) ?? null,
    hashTexto: r.texto ? sha256(r.texto) : null, ratio: extra.ratio ?? null, hechosDeterminantes: extra.hechosDeterminantes ?? null, analogia: null, problemasIds: extra.problemasIds,
    procedencias: r.procedencias.map((p) => p.id), verificadaEn: ctx.ahora(), modulo: extra.modulo, notas: r.notas,
  };
  ctx.exp.fuentes.push(f);
  registrarResolucion(ctx, { identificador: c.identificador, clase, resolucion: r.resolucion, vigencia: r.vigencia, fuenteId: f.id, notas: r.notas, modulo: extra.modulo, planificada });
  return f;
}

const primeraCita = (texto: string, clases?: Array<CitaDetectada["clase"]>): CitaDetectada | null => extraerCitas(texto).find((c) => !clases || clases.includes(c.clase)) ?? null;

/* ─────────────────────────── f4 · planificación ─────────────────────────── */

const INSTRUCCION_PLAN = (bloqueadas: string[]) => `Formula el fundamento del informe técnico:
1. "problemas": el problema jurídico principal y los asociados, cada uno con los identificadores de los HECHOS determinantes (hec_…). Formúlalos como preguntas jurídicas precisas.
2. "consultasJurisprudencia": consultas para recuperar precedente por problema (índice del problema en la lista, desde 0) y corte competente.
3. "normasCandidatas": normas que sustentarían cada problema, con identificador citable y verificable (p. ej. "Ley 1564 de 2012, art. 422", "Código Civil, art. 2536", "Decreto 2591 de 1991, art. 6"). Serán verificadas en fuente oficial antes de usarse.
4. "providenciasCandidatas": providencias que conozcas como pertinentes, con identificador exacto (p. ej. "T-323 de 2024", "SU-611 de 2017", "C-836 de 2001"). Solo se usarán si la fuente oficial las confirma; no incluyas identificadores de los que no estés seguro.
5. "cuerposNormativos": cuerpos que concurren y los que se descartan, con la razón y la ruta de integración.
6. Indica si hay un derecho fundamental comprometido, si la protección interna es insuficiente, las materias del bloque de constitucionalidad pertinentes (NNA, DISCAPACIDAD, MUJER_VICTIMA_VIOLENCIA, PERSONA_MAYOR, SALUD, TRABAJO, SEGURIDAD_SOCIAL, DEBIDO_PROCESO, IGUALDAD, PROPIEDAD…) y las autoridades administrativas con doctrina aplicable (DIAN, SIC, SFC, Superservicios, Supersociedades, MinTrabajo…).
${bloqueadas.length ? `\nEn la iteración anterior estas citas NO pudieron verificarse en fuente oficial y bloquean el documento: ${bloqueadas.join("; ")}. Retíralas o reemplázalas por fuentes verificables; no las repitas.` : ""}`;

export const f4: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const bloqueadas = ctx.exp.citas.filter((c) => c.estado === "BLOQUEADA").map((c) => c.texto);
  const retiradas = (ctx.exp.borradores.citasRetiradas as string[] | undefined) ?? [];
  const p = await tarea(ctx, {
    tarea: "planificacion", esquema: Plan, nombreEsquema: "Plan", instruccion: INSTRUCCION_PLAN([...new Set([...bloqueadas, ...retiradas])]),
    contexto: bloques(vistaCaso(ctx.exp), vistaPartes(ctx.exp), vistaHechos(ctx.exp), vistaMemoria(ctx.exp), vistaCorrecciones(ctx.exp)),
  });
  const vetadas = new Set([...bloqueadas, ...retiradas].map(claveIdentificador));
  const limpio = (lista: Plan["normasCandidatas"]) => lista.filter((x) => !vetadas.has(claveIdentificador(x.identificador)));
  const hechos = new Set(ctx.exp.hechos.map((h) => h.id));
  const problemas: ProblemaJuridico[] = p.problemas.map((x) => ({ id: nuevoId("prb"), enunciado: x.enunciado, tipo: x.tipo, hechosDeterminantes: x.hechosDeterminantes.filter((h) => hechos.has(h)) }));
  ctx.exp.problemas = problemas;
  ctx.exp.borradores.plan = { ...p, normasCandidatas: limpio(p.normasCandidatas), providenciasCandidatas: limpio(p.providenciasCandidatas), problemaIds: problemas.map((x) => x.id) } satisfies PlanGuardado;
  // Nueva iteración: se reconstruyen fuentes y citas del fundamento (las verificadas se reutilizan por identificador).
  ctx.exp.citas = ctx.exp.citas.filter((c) => c.entregable !== "INFORME_TECNICO" || c.seccion !== "fundamento");
  ctx.exp.borradores.resoluciones = [];
  return completado(`${problemas.length} problema(s) jurídico(s); ${p.normasCandidatas.length} norma(s) y ${p.providenciasCandidatas.length} providencia(s) candidatas a verificación; ${p.consultasJurisprudencia.length} consulta(s) de precedente.`);
};

const problemaId = (ctx: ContextoNodo, i: number) => plan(ctx)?.problemaIds[i] ?? plan(ctx)?.problemaIds[0] ?? "prb_sin_plan";

/* ──────────────────── M01 · jurisprudencia vinculante ──────────────────── */

const DOMINIOS_CORTE: Record<string, string[]> = {
  CC: ["corteconstitucional.gov.co"], CSJ: ["cortesuprema.gov.co"], CE: ["consejodeestado.gov.co", "ramajudicial.gov.co"],
  CUALQUIERA: ["corteconstitucional.gov.co", "cortesuprema.gov.co", "consejodeestado.gov.co"],
};

function herramientasInvestigacion(ctx: ContextoNodo, registro: Array<{ herramienta: string; entrada: unknown; salida: string }>): HerramientaAgente[] {
  const anotar = (herramienta: string, entrada: unknown, salida: string) => (registro.push({ herramienta, entrada, salida: salida.slice(0, 8000) }), salida);
  const h: HerramientaAgente[] = [
    {
      nombre: "buscar_repositorio", descripcion: "Busca en el repositorio normativo y jurisprudencial verificado del despacho (BM25). Devuelve identificador, título, fragmento y si la ficha está fresca.",
      esquema: { type: "object", properties: { consulta: { type: "string", description: "Términos jurídicos de búsqueda" } }, required: ["consulta"], additionalProperties: false },
      ejecutar: async (e) => {
        const { consulta } = e as { consulta: string };
        const r = ctx.s.repositorio.buscar(consulta, 6).map((x) => ({ identificador: x.ficha.identificador, titulo: x.ficha.titulo, autoridad: x.ficha.autoridad, url: x.ficha.url, fresca: x.fresca, fragmento: x.fragmento }));
        return { contenido: anotar("buscar_repositorio", e, JSON.stringify(r)) };
      },
    },
  ];
  if (ctx.s.croma.configurado) {
    h.push({
      nombre: "buscar_fuente_oficial", descripcion: "Busca en los dominios oficiales de las altas cortes (vía Croma). Solo devuelve resultados de dominios .gov.co oficiales.",
      esquema: { type: "object", properties: { consulta: { type: "string" }, corte: { type: "string", enum: ["CC", "CSJ", "CE", "CUALQUIERA"] } }, required: ["consulta", "corte"], additionalProperties: false },
      ejecutar: async (e) => {
        const { consulta, corte } = e as { consulta: string; corte: string };
        const r = await ctx.s.resolutor.buscarOficial(consulta, DOMINIOS_CORTE[corte] ?? DOMINIOS_OFICIALES.slice(0, 3));
        await registrarProcedencias(ctx, r.procedencias, null);
        return { contenido: anotar("buscar_fuente_oficial", e, JSON.stringify(r.resultados.slice(0, 8))) };
      },
    });
    h.push({
      nombre: "leer_fuente_oficial", descripcion: "Obtiene el texto de una URL de un dominio oficial (relatorías, Secretaría del Senado, SUIN). Rechaza dominios no oficiales.",
      esquema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
      ejecutar: async (e) => {
        const { url } = e as { url: string };
        if (!esDominioOficial(url)) return { contenido: anotar("leer_fuente_oficial", e, "Dominio no oficial: no se consulta."), esError: true };
        const r = await ctx.s.resolutor.obtenerTexto(url);
        await registrarProcedencias(ctx, r.procedencias, r.texto);
        return { contenido: anotar("leer_fuente_oficial", e, r.texto ? r.texto.slice(0, 6000) : "No se obtuvo el texto de la fuente."), esError: !r.texto };
      },
    });
  }
  return h;
}

const INSTRUCCION_INVESTIGACION = `Investiga el precedente judicial pertinente para cada problema jurídico. Usa primero el repositorio verificado y luego las fuentes oficiales. Para cada providencia relevante identifica: identificador exacto (tipo, número y año, o radicado), corte, fecha, dirección oficial donde la encontraste, ratio decidendi y hechos determinantes. Prioriza sentencias de unificación y de control abstracto. No cites nada de memoria: si una providencia no aparece en las fuentes consultadas, no la reportes como hallazgo. Si no encuentras precedente para un problema, dilo expresamente. Termina con un resumen ordenado por problema.`;

export const m01: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const p = plan(ctx);
  if (!p) return completado("Sin plan de investigación.");
  const registro: Array<{ herramienta: string; entrada: unknown; salida: string }> = [];
  // Paso 0: repositorio para cada consulta planificada.
  for (const q of p.consultasJurisprudencia) {
    const r = ctx.s.repositorio.buscar(q.consulta, 4, (f) => f.tipo === "PROVIDENCIA");
    if (r.length) registro.push({ herramienta: "repositorio", entrada: q, salida: JSON.stringify(r.map((x) => ({ identificador: x.ficha.identificador, titulo: x.ficha.titulo, fresca: x.fresca, fragmento: x.fragmento }))) });
  }
  let textoAgente = "";
  if (p.consultasJurisprudencia.length) {
    const r = await agente(ctx, {
      tarea: "investigacion", instruccion: INSTRUCCION_INVESTIGACION, herramientas: herramientasInvestigacion(ctx, registro), maxTurnos: 10,
      contexto: bloques(vistaProblemas(ctx.exp), { titulo: "CONSULTAS PLANIFICADAS", texto: JSON.stringify(p.consultasJurisprudencia) }, vistaHechos(ctx.exp)),
    });
    textoAgente = r.texto;
  }
  if (!ctx.s.croma.configurado) aviso(ctx, "Croma no está configurado: la investigación jurisprudencial se limitó al repositorio local verificado.", "MEDIA");
  const fichas = await tarea(ctx, {
    tarea: "ficha", esquema: Fichas, nombreEsquema: "Fichas",
    instruccion: "Extrae las providencias efectivamente halladas en la investigación (resultados de herramientas y resumen del agente) y las candidatas del plan. Para cada una: identificador exacto, autoridad, tipo (C, SU, T, A, casacion, unificacion, seccion, tutela), fecha, dirección oficial si se obtuvo, problema (índice), si es de unificación, ratio y hechos determinantes solo si constan en el texto consultado (si no, null). Registra en 'vacios' los problemas sin precedente hallado.",
    contexto: bloques(vistaProblemas(ctx.exp), { titulo: "HALLAZGOS DE LA INVESTIGACIÓN", texto: JSON.stringify(registro).slice(0, 120_000) }, { titulo: "RESUMEN DEL AGENTE", texto: textoAgente || "(sin agente)" }, { titulo: "CANDIDATAS DEL PLAN", texto: JSON.stringify(p.providenciasCandidatas) }),
  });
  let verificadas = 0;
  const planificadas = new Set(p.providenciasCandidatas.map((x) => claveIdentificador(x.identificador)));
  const candidatas = [...fichas.providencias, ...p.providenciasCandidatas.filter((x) => !fichas.providencias.some((f) => claveIdentificador(f.identificador) === claveIdentificador(x.identificador))).map((x) => ({ identificador: x.identificador, problema: x.problema, ratio: null, hechosDeterminantes: null, fecha: null, url: null }))];
  for (const f of candidatas) {
    const cita = primeraCita(f.identificador, ["PROVIDENCIA_CC", "PROVIDENCIA_CSJ", "PROVIDENCIA_CE"]);
    const esPlanificada = planificadas.has(claveIdentificador(f.identificador));
    if (!cita) {
      if (esPlanificada) registrarResolucion(ctx, { identificador: f.identificador, clase: "PROVIDENCIA", resolucion: "NO_RESUELTA", vigencia: "NO_APLICA", fuenteId: null, notas: ["El identificador no tiene un formato de providencia reconocible."], modulo: "m01", planificada: true });
      else aviso(ctx, `Providencia «${f.identificador}» con identificador no reconocible: no se usa.`, "BAJA");
      continue;
    }
    if (f.url && esDominioOficial(f.url) && !cita.url) cita.url = f.url;
    const fuente = await resolverCita(ctx, cita, { modulo: "m01", problemasIds: [problemaId(ctx, f.problema)], ratio: f.ratio, hechosDeterminantes: f.hechosDeterminantes, fecha: f.fecha }, esPlanificada);
    if (fuente) verificadas++;
    else if (!esPlanificada) aviso(ctx, `Providencia «${f.identificador}» no verificada en fuente oficial: no se usa.`, "BAJA");
  }
  for (const v of fichas.vacios) aviso(ctx, `Vacío de precedente: ${v}`, "MEDIA");
  return completado(`${verificadas} providencia(s) verificada(s) en fuente primaria de ${candidatas.length} candidata(s).`);
};

/* ──────────────────────── M02 · fuerza vinculante ──────────────────────── */

function entradaVinculancia(ctx: ContextoNodo, f: Fuente): EntradaVinculancia {
  const id = f.identificador.toUpperCase();
  const autoridad: EntradaVinculancia["autoridad"] = /CORTE CONSTITUCIONAL/i.test(f.autoridad) || /^(C|SU|T|A)-?\s*\d/.test(id) ? "CC" : /SUPREMA/i.test(f.autoridad) ? "CSJ" : /CONSEJO DE ESTADO/i.test(f.autoridad) ? "CE" : "JUEZ";
  const tipo = autoridad === "CC" ? (id.match(/^(SU|C|T|A)/)?.[1] ?? "T") : autoridad === "CSJ" ? "casacion" : "sentencia";
  const destinatario = ctx.exp.analisis.area === "ADMINISTRATIVO" && !ctx.exp.analisis.estadosProcesales.length ? "autoridad_administrativa" : "juez";
  return { autoridad, tipo, esUnificacion: tipo === "SU" || /unificaci/i.test(`${f.titulo} ${f.ratio ?? ""}`), destinatario, similitudFactica: null, esRatioDecidendi: null, fueModificadaOSuperada: false };
}

export const m02: ManejadorNodo = async (ctx) => {
  const providencias = ctx.exp.fuentes.filter((f) => f.clase === "PROVIDENCIA");
  for (const f of providencias) {
    const r = evaluarFuerzaVinculante(entradaVinculancia(ctx, f));
    f.fuerzaVinculante = r.nivel;
    f.fundamentoVinculancia = [...r.fundamentos, `Apartamiento: ${r.reglaApartamiento}`, `Uso recomendado: ${r.usoRecomendado}.`].join(" ");
  }
  return completado(`${providencias.length} providencia(s) calificada(s) en la escala de fuerza vinculante.`);
};

/* ─────────────── M07 · similitud fáctica y ratio decidendi ─────────────── */

export const m07: ManejadorNodo = async (ctx) => {
  const providencias = ctx.exp.fuentes.filter((f) => f.clase === "PROVIDENCIA" && f.textoRelevante);
  if (!providencias.length) return completado("Sin providencias con texto para comparar.");
  const r = await tarea(ctx, {
    tarea: "analogia", esquema: Analogias, nombreEsquema: "Analogias",
    instruccion: "Compara, campo por campo, los hechos determinantes del caso con los de cada providencia (según su texto verificado). Aísla la ratio decidendi solo si consta en el texto. Califica la analogía (ALTA, MEDIA, BAJA) y su similitud (0 a 1), lista coincidencias y divergencias y, si la providencia no gobierna el caso, redacta la distinción. La similitud computacional no es analogía jurídica: sé conservador.",
    contexto: bloques(vistaHechos(ctx.exp), vistaProblemas(ctx.exp), vistaFuentes({ ...ctx.exp, fuentes: providencias }, { conTexto: true, maxPorFuente: 6000 })),
  });
  let evaluadas = 0;
  for (const e of r.evaluaciones) {
    const f = providencias.find((x) => x.id === e.fuenteId);
    if (!f) continue;
    const decisionPrevia = f.analogia?.decisionAbogado ?? null;
    f.analogia = { nivel: e.nivel, coincidencias: e.coincidencias, divergencias: e.divergencias, distincion: e.distincion, decisionAbogado: decisionPrevia };
    if (e.ratio && !f.ratio) f.ratio = e.ratio;
    const v = evaluarFuerzaVinculante({ ...entradaVinculancia(ctx, f), similitudFactica: e.similitud, esRatioDecidendi: e.esRatioDecidendi });
    f.fuerzaVinculante = v.nivel;
    f.fundamentoVinculancia = [...v.fundamentos, `Apartamiento: ${v.reglaApartamiento}`, `Uso recomendado: ${v.usoRecomendado}.`].join(" ");
    evaluadas++;
  }
  for (const i of ctx.instrucciones(["CONFIRMAR_ANALOGIA", "RECHAZAR_ANALOGIA"])) {
    const f = ctx.exp.fuentes.find((x) => x.id === (i.datos as { fuenteId?: string } | undefined)?.fuenteId);
    if (f?.analogia) f.analogia.decisionAbogado = i.accion === "CONFIRMAR_ANALOGIA" ? "CONFIRMADA" : "RECHAZADA";
    ctx.consumir(i);
  }
  return completado(`${evaluadas} providencia(s) comparada(s) con los hechos del caso.`);
};

/* ─────────────────────── M03 · normograma cruzado ─────────────────────── */

export const m03: ManejadorNodo = async (ctx) => {
  const a = ctx.exp.analisis;
  const areas = [a.area ?? "OTRO", ...a.areasConcurrentes.filter((x) => x !== a.area)];
  const cuerpos = new Map<string, CuerpoNormativo>();
  for (const s of cuerposSugeridos(areas)) {
    cuerpos.set(s.cuerpo.nombre.toLowerCase(), { id: nuevoId("cno"), nombre: s.cuerpo.nombre, rol: s.rol, razon: s.razon, rutaIntegracion: s.remisiones.map((r) => `${r.norma}: ${r.descripcion} [${r.verificacion}]`).join(" ") || null });
  }
  for (const c of plan(ctx)?.cuerposNormativos ?? []) {
    const k = c.nombre.toLowerCase();
    const existente = [...cuerpos.entries()].find(([n]) => n.includes(k.slice(0, 18)) || k.includes(n.slice(0, 18)));
    if (existente) {
      if (c.rol === "DESCARTADO") existente[1].rol = "DESCARTADO", existente[1].razon = c.razon;
      else if (c.rutaIntegracion && !existente[1].rutaIntegracion) existente[1].rutaIntegracion = c.rutaIntegracion;
    } else cuerpos.set(k, { id: nuevoId("cno"), nombre: c.nombre, rol: c.rol, razon: c.razon, rutaIntegracion: c.rutaIntegracion });
  }
  ctx.exp.cuerposNormativos = [...cuerpos.values()];
  const descartados = ctx.exp.cuerposNormativos.filter((c) => c.rol === "DESCARTADO").length;
  return completado(`${ctx.exp.cuerposNormativos.length} cuerpo(s) normativo(s) considerado(s), ${descartados} descartado(s) con su razón.`);
};

/* ─────────────────────── M04 · vigencia y derogatoria ─────────────────────── */

export const m04: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const p = plan(ctx);
  if (!p) return completado("Sin normas candidatas.");
  let verificadas = 0;
  for (const n of p.normasCandidatas) {
    const cita = primeraCita(n.identificador, ["NORMA", "CODIGO"]);
    if (!cita) {
      registrarResolucion(ctx, { identificador: n.identificador, clase: "NORMA", resolucion: "NO_RESUELTA", vigencia: "NO_VERIFICADA", fuenteId: null, notas: ["El identificador no tiene un formato normativo reconocible (tipo, número, año y artículo)."], modulo: "m04", planificada: true });
      continue;
    }
    const f = await resolverCita(ctx, cita, { modulo: "m04", problemasIds: [problemaId(ctx, n.problema)] }, true);
    if (!f) continue;
    verificadas++;
    if (f.vigencia === "DEROGADA" || f.vigencia === "INEXEQUIBLE") aviso(ctx, `${f.identificador}: ${f.vigencia}. Solo puede invocarse por ultraactividad o para contextualizar; nunca como norma vigente.`, "ALTA");
    if (f.vigencia === "NO_VERIFICADA") aviso(ctx, `${f.identificador}: texto obtenido sin nota de vigencia; la vigencia queda NO VERIFICADA (no se presenta como vigente).`, "MEDIA");
  }
  return completado(`${verificadas} de ${p.normasCandidatas.length} norma(s) resuelta(s) a su texto oficial con estado de vigencia.`);
};

/* ─────────────────── M05 · bloque de constitucionalidad ─────────────────── */

export const m05: ManejadorNodo = async (ctx) => {
  const p = plan(ctx);
  const sujetos = [...new Set(ctx.exp.partes.flatMap((x) => x.proteccionEspecial))];
  const r = evaluarBloque({ derechoFundamentalComprometido: p?.derechoFundamentalComprometido ?? false, proteccionInternaInsuficiente: p?.proteccionInternaInsuficiente ?? false, sujetos, materias: p?.materiasBloque ?? [] });
  const instrumentos: Array<{ instrumento: string; leyAprobatoria: string; disposicion: string }> = [];
  if (r.activado) {
    for (const i of r.instrumentos) {
      const cita = primeraCita(i.leyAprobatoria, ["NORMA"]);
      const f = cita ? await resolverCita(ctx, cita, { modulo: "m05", problemasIds: plan(ctx)?.problemaIds.slice(0, 1) ?? [], clase: "TRATADO", titulo: `${i.nombre} (aprobada por la ${i.leyAprobatoria})` }, true) : null;
      instrumentos.push({ instrumento: i.nombre, leyAprobatoria: i.leyAprobatoria, disposicion: f ? `Ley aprobatoria verificada (${f.resolucion}).` : "Ley aprobatoria NO verificada en fuente oficial." });
    }
  }
  ctx.exp.analisis.bloqueConstitucionalidad = { activado: r.activado, razones: r.razones, instrumentos };
  return completado(r.activado ? `Bloque activado: ${instrumentos.length} instrumento(s).` : `No se activa: ${r.razones[0]}`);
};

/* ─────────────────── M06 · conceptos de autoridades ─────────────────── */

const AUTORIDAD_POR_AREA: Record<string, string> = {
  TRIBUTARIO: "DIAN", CONSUMIDOR: "Superintendencia de Industria y Comercio", SERVICIOS_PUBLICOS: "Superintendencia de Servicios Públicos Domiciliarios",
  LABORAL: "Ministerio del Trabajo", SEGURIDAD_SOCIAL: "Ministerio del Trabajo / Superintendencia Nacional de Salud", SOCIETARIO: "Superintendencia de Sociedades",
  INSOLVENCIA: "Superintendencia de Sociedades", CONTRATACION_ESTATAL: "Colombia Compra Eficiente", ADMINISTRATIVO: "Departamento Administrativo de la Función Pública",
};

export const m06: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const a = ctx.exp.analisis;
  const autoridades = [...new Set([...(a.area && AUTORIDAD_POR_AREA[a.area] ? [AUTORIDAD_POR_AREA[a.area]!] : []), ...a.areasConcurrentes.map((x) => AUTORIDAD_POR_AREA[x]).filter((x): x is string => Boolean(x)), ...(plan(ctx)?.autoridadesConDoctrina ?? [])])];
  const consultados: string[] = [];
  if ((a.area === "TRIBUTARIO" || a.areasConcurrentes.includes("TRIBUTARIO")) && (await ctx.s.croma.disponible("tributario.doctrina"))) {
    for (const prob of ctx.exp.problemas.slice(0, 3)) {
      const r = await ctx.s.croma.consultar("tributario.doctrina", { consulta: prob.enunciado.slice(0, 300) });
      await ctx.procedencia(r.procedencia, r.estado === "OK" ? r.texto : null);
      if (r.estado !== "OK") continue;
      for (const cita of extraerCitas(r.texto).filter((c) => c.clase === "CONCEPTO").slice(0, 3)) {
        const f: Fuente = {
          id: nuevoId("fte"), clase: "CONCEPTO", identificador: cita.identificador, titulo: `Concepto DIAN ${cita.identificador}`, autoridad: "DIAN", fecha: null, url: null, resolucion: "TEXTO_OFICIAL",
          vigencia: "NO_VERIFICADA", condicionamiento: null, fuerzaVinculante: "NO_VINCULANTE", fundamentoVinculancia: "Concepto administrativo: no es norma ni precedente (art. 28 CPACA); los conceptos vigentes de la DIAN pueden amparar la actuación del contribuyente.",
          textoRelevante: r.texto.slice(0, 6000), hashTexto: sha256(r.texto), ratio: null, hechosDeterminantes: null, analogia: null, problemasIds: [prob.id], procedencias: [r.procedencia.id], verificadaEn: ctx.ahora(), modulo: "m06", notas: ["Vigencia del concepto NO VERIFICADA: comprobar que no fue revocado."],
        };
        if (!fuenteExistente(ctx, f.identificador)) ctx.exp.fuentes.push(f), consultados.push(f.identificador);
      }
    }
  }
  const consultaSugerida = autoridades.length && !consultados.length
    ? `Si no existe doctrina publicada sobre el punto, formular consulta a ${autoridades[0]} en los términos del artículo 14, numeral 2, del CPACA (sustituido por la Ley 1755 de 2015), que prevé treinta (30) días para resolver consultas, con la pregunta jurídica concreta: «${ctx.exp.problemas[0]?.enunciado ?? "[problema jurídico]"}».`
    : null;
  a.conceptosAdministrativos = { autoridades, consultados, consultaSugerida };
  if (autoridades.length && !consultados.length) aviso(ctx, `No se consultó doctrina publicada de ${autoridades.join(", ")}${ctx.s.croma.configurado ? " (Croma no expone esa fuente)" : " (Croma no configurado)"}; se propone consulta formal.`, "BAJA");
  return completado(`${autoridades.length} autoridad(es) con competencia; ${consultados.length} concepto(s) recuperado(s).`);
};

/* ─────────────────────── M21 · auditoría de citas ─────────────────────── */

function citaDe(ctx: ContextoNodo, r: ResolucionRegistrada): Cita {
  const advertencias = [
    r.resolucion === "EXISTENCIA_CONFIRMADA" ? "Existencia confirmada en dominio oficial sin texto completo: no admite cita textual." : null,
    r.resolucion === "APORTADA_POR_ABOGADO" ? "Fuente aportada por el ABOGADO (USUARIO), bajo su responsabilidad." : null,
    r.vigencia === "DEROGADA" || r.vigencia === "INEXEQUIBLE" ? `Norma ${r.vigencia}: no puede invocarse como vigente.` : null,
    r.vigencia === "NO_VERIFICADA" ? "Vigencia no verificada." : null,
    r.vigencia === "VIGENTE_CONDICIONADA" ? "Exequibilidad condicionada: debe transcribirse el condicionamiento." : null,
  ].filter((x): x is string => Boolean(x));
  const estado: Cita["estado"] = r.resolucion === "NO_RESUELTA" ? "BLOQUEADA" : advertencias.length ? "VERIFICADA_CON_ADVERTENCIA" : "VERIFICADA";
  return {
    id: nuevoId("cit"), texto: r.identificador, clase: r.clase, identificadorNormalizado: claveIdentificador(r.identificador), fuenteId: r.fuenteId, entregable: "INFORME_TECNICO", seccion: "fundamento",
    estado, motivo: estado === "BLOQUEADA" ? r.notas.join(" ") || "No se pudo resolver contra ninguna fuente oficial." : [`Resuelta: ${r.resolucion}.`, ...advertencias].join(" "), citaTextual: null, coincidenciaTextual: null, auditadaEn: ctx.ahora(),
  };
}

export const m21: ManejadorNodo = async (ctx) => {
  const rs = resoluciones(ctx).filter((r) => r.planificada);
  const citas = rs.map((r) => citaDe(ctx, r));
  ctx.exp.citas = [...ctx.exp.citas.filter((c) => !(c.entregable === "INFORME_TECNICO" && c.seccion === "fundamento")), ...citas];
  const bloqueadas = citas.filter((c) => c.estado === "BLOQUEADA").length;
  return completado(`${citas.length} cita(s) del fundamento auditada(s): ${citas.length - bloqueadas} resuelta(s), ${bloqueadas} bloqueada(s).`);
};

/** Aplica las decisiones del ABOGADO (USUARIO) sobre citas bloqueadas: aportar la fuente o retirar la cita. */
function aplicarDecisionesCitas(ctx: ContextoNodo): number {
  let aplicadas = 0;
  for (const i of ctx.instrucciones(["APORTAR_FUENTE", "RETIRAR_CITA"])) {
    const d = (i.datos ?? {}) as { identificador?: string; texto?: string; url?: string | null };
    const cita = ctx.exp.citas.find((c) => c.estado === "BLOQUEADA" && claveIdentificador(c.texto) === claveIdentificador(d.identificador ?? ""));
    if (cita && i.accion === "RETIRAR_CITA") {
      ctx.exp.citas = ctx.exp.citas.filter((c) => c.id !== cita.id);
      ctx.exp.borradores.citasRetiradas = [...((ctx.exp.borradores.citasRetiradas as string[] | undefined) ?? []), cita.texto];
      const p = plan(ctx);
      if (p) {
        const k = claveIdentificador(cita.texto);
        p.normasCandidatas = p.normasCandidatas.filter((x) => claveIdentificador(x.identificador) !== k);
        p.providenciasCandidatas = p.providenciasCandidatas.filter((x) => claveIdentificador(x.identificador) !== k);
      }
      aplicadas++;
    } else if (cita && i.accion === "APORTAR_FUENTE" && d.texto) {
      const detectada = primeraCita(cita.texto) ?? { clase: "NORMA", texto: cita.texto, identificador: cita.texto, identificadorBase: cita.texto, articulo: null, url: d.url ?? null, estadoUrl: "", inicio: 0, fin: 0, detalle: {} } as CitaDetectada;
      const r = ctx.s.resolutor.aportada(detectada, d.texto, d.url ?? null, i.usuarioId);
      const f: Fuente = {
        id: nuevoId("fte"), clase: cita.clase, identificador: cita.texto, titulo: r.titulo, autoridad: r.autoridad, fecha: null, url: r.url, resolucion: "APORTADA_POR_ABOGADO", vigencia: r.vigencia,
        condicionamiento: null, fuerzaVinculante: null, fundamentoVinculancia: null, textoRelevante: d.texto.slice(0, 12_000), hashTexto: sha256(d.texto), ratio: null, hechosDeterminantes: null, analogia: null,
        problemasIds: plan(ctx)?.problemaIds.slice(0, 1) ?? [], procedencias: [], verificadaEn: ctx.ahora(), modulo: "m21", notas: r.notas,
      };
      ctx.exp.fuentes.push(f);
      Object.assign(cita, { estado: "VERIFICADA_CON_ADVERTENCIA", fuenteId: f.id, motivo: `Fuente aportada por el ABOGADO (USUARIO) ${i.usuarioId}, bajo su responsabilidad.`, auditadaEn: ctx.ahora() });
      aplicadas++;
    }
    ctx.consumir(i);
  }
  return aplicadas;
}

/** Compuerta · ¿toda cita verificada? Una sola bloqueada devuelve el documento al fundamento. */
export const g_citas: ManejadorNodo = async (ctx) => {
  const aplicadas = aplicarDecisionesCitas(ctx);
  const bloqueadas = ctx.exp.citas.filter((c) => c.estado === "BLOQUEADA");
  if (!bloqueadas.length) return decision("si", aplicadas ? `Todas las citas resueltas (${aplicadas} decisión(es) del ABOGADO (USUARIO) aplicadas).` : "Todas las citas del fundamento se resolvieron contra su fuente primaria.");
  const hechas = ctx.exp.ejecucion.iteraciones.g_citas ?? 0;
  if (hechas < ctx.s.config.maxIteraciones.g_citas) return decision("no", `${bloqueadas.length} cita(s) sin verificar: ${bloqueadas.map((c) => c.texto).join("; ")}. Vuelve al fundamento para retirarlas o reemplazarlas.`);
  return pausa(`Tras ${hechas} re-elaboración(es) persisten ${bloqueadas.length} cita(s) sin verificar. Aporte la fuente (texto y enlace oficial) o retire cada cita.`, ["APORTAR_FUENTE", "RETIRAR_CITA"], { citas: bloqueadas.map((c) => ({ identificador: c.texto, motivo: c.motivo })) });
};
