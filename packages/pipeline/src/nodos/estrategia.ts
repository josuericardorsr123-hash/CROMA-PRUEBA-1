import { type Cita, nuevoId, type TipoPieza } from "@em/dominio";
import { generarPieza, type BloquePieza, type DocumentoPieza, type NotaPie, type Segmento } from "@em/docgen";
import {
  ADVERTENCIA_BORRADOR, cierrePeticion, componentesDe, decidirVia, evaluarHabilitacion, evaluarMasc, fechaLarga, planDeComunicacion, validarRedaccionForense,
} from "@em/motores";
import { auditarTexto, etiquetaFuente, retirarCitas } from "../auditoria";
import type { ContextoNodo, ManejadorNodo, PerfilAbogado } from "../contexto";
import { Contradiccion, FactoresMasc, HechosViaIA, PiezaRedactada } from "../esquemas";
import { tarea } from "../ia";
import { bloques, vistaAnalisis, vistaCaso, vistaCorrecciones, vistaDocumentos, vistaEstrategia, vistaFuentes, vistaHechos, vistaPartes, vistaTerminos } from "../vistas";
import { aviso, completado, reiniciarAvisos } from "./comun";
import { MIME_DOCX, registrarEntregable } from "./entregables";

/* e5 · Estrategia y acción procesal (Capa C): MASC, vía, pieza siguiente,
 * notificaciones y contradicción anticipada. */

/** Módulo 20 · conciliabilidad, obligatoriedad como requisito (Ley 2220 de 2022) y conveniencia. */
export const m20: ManejadorNodo = async (ctx) => {
  const a = ctx.exp.analisis;
  const f = await tarea(ctx, {
    tarea: "masc", esquema: FactoresMasc, nombreEsquema: "FactoresMasc",
    instruccion: "Evalúa los factores de conveniencia de un mecanismo alternativo de solución de conflictos (conciliación, transacción, amigable composición): si se discuten derechos ciertos e indiscutibles (p. ej. laborales mínimos), si versa sobre estado civil, si hay delito no querellable, el valor de la relación a preservar, la proporción entre cuantía y costo del litigio, la debilidad probatoria propia, la duración estimada del proceso, la disposición manifestada por las partes y cualquier obstáculo no negociable (registral, tributario). Valores de 0 a 1 con su razón.",
    contexto: bloques(vistaCaso(ctx.exp), vistaHechos(ctx.exp), vistaAnalisis(ctx.exp)),
  });
  const conciliacion = a.procedibilidad.find((p) => /concilia/i.test(p.requisito));
  const obligatoria = conciliacion ? (conciliacion.estado === "EXIGIBLE" ? "SI" : conciliacion.estado === "INCIERTO" ? "INCIERTO" : "NO") : "NO";
  const r = evaluarMasc({ area: a.area ?? "OTRO", asunto: f.asunto, derechosCiertosEIndiscutibles: f.derechosCiertosEIndiscutibles, estadoCivil: f.estadoCivil, delitoNoQuerellable: f.delitoNoQuerellable, relacionAPreservar: f.relacionAPreservar, cuantiaFrenteACosto: f.cuantiaFrenteACosto, debilidadProbatoriaPropia: f.debilidadProbatoriaPropia, duracionEstimadaProceso: f.duracionEstimadaProceso, disposicionManifestada: f.disposicionManifestada, obligatoriaComoRequisito: obligatoria, obstaculoNoNegociable: f.obstaculoNoNegociable });
  a.masc = { conciliable: r.conciliable, obligatoriaComoRequisito: r.obligatoriaComoRequisito, puntaje: r.puntaje, factores: r.factores, recomendacion: `${r.recomendacion} Transigir sobre un derecho propio es decisión indelegable del cliente.` };
  return completado(`MASC: ${r.conciliable === "NO" ? "no conciliable" : `puntaje ${r.puntaje}/100`}; obligatoria como requisito: ${r.obligatoriaComoRequisito}.`);
};

/** Módulo 15 · árbol de vía procesal con condiciones verificables y registro de descarte. */
export const m15: ManejadorNodo = async (ctx) => {
  const a = ctx.exp.analisis;
  const h = await tarea(ctx, {
    tarea: "estrategia", esquema: HechosViaIA, nombreEsquema: "HechosVia",
    instruccion: "Determina las condiciones verificables que gobiernan la elección de la vía procesal: la etapa en que está el asunto y cada condición booleana según los hechos y el análisis (no según lo que convendría). Indica además el destinatario de la actuación, el objetivo concreto y la pretensión principal en lenguaje determinado.",
    contexto: bloques(vistaCaso(ctx.exp), vistaHechos(ctx.exp), vistaAnalisis(ctx.exp), vistaTerminos(ctx.exp)),
  });
  const riesgo = ctx.exp.ejecucion.ramas.g_riesgo === "si";
  const d = decidirVia({
    area: a.area ?? "OTRO", rolCliente: a.rolCliente, etapa: h.etapa, autoApelable: h.autoApelable, derechoFundamentalComprometido: Boolean(a.derechosFundamentales?.derechos.length),
    otroMedioEficaz: h.otroMedioEficaz, perjuicioIrremediable: Boolean(a.derechosFundamentales?.examen.some((e) => /perjuicio/i.test(e.requisito) && e.cumple === "SI")),
    interesColectivo: h.interesColectivo, grupoPlural: h.grupoPlural, tituloEjecutivo: h.tituloEjecutivo, actoAdministrativoParticular: h.actoAdministrativoParticular, recursosAdministrativosEnTermino: h.recursosAdministrativosEnTermino,
    danoAntijuridicoEstatal: h.danoAntijuridicoEstatal, incumplimientoNormaOActo: h.incumplimientoNormaOActo, renuenciaConstituida: h.renuenciaConstituida, peticionSinRespuesta: h.peticionSinRespuesta,
    requiereReclamacionPrevia: h.requiereReclamacionPrevia, conductaPenal: h.conductaPenal, perturbacionPosesion: h.perturbacionPosesion, relacionConsumo: h.relacionConsumo, reclamacionConsumoAgotada: h.reclamacionConsumoAgotada,
    servicioPublicoDomiciliario: h.servicioPublicoDomiciliario, nulidadProcesalConSoporte: a.nulidades.hallazgos.some((x) => x.gravedad === "ALTA"),
    conciliacionObligatoriaPendiente: a.masc?.obligatoriaComoRequisito === "SI", cuantiaCategoria: a.competencia?.cuantia?.categoria ?? null, urgente: riesgo,
  });
  const requiereAbogado = evaluarHabilitacion({ tipoPieza: d.principal.pieza, representaATercero: true, abogado: { nombre: null, tarjetaProfesional: "x", correoRegistroNacional: null }, poder: null, facultadesRequeridas: [], conflictos: [], terminoVencidoAparente: false, tutelaPreviaMismosHechos: false, cuantiaCategoria: a.competencia?.cuantia?.categoria ?? null }).requierePostulacion;
  const proximo = ctx.exp.terminos.find((t) => t.estado !== "SIN_TERMINO");
  ctx.exp.estrategia = {
    viaPrincipal: d.principal.via, fundamentoVia: `${d.principal.fundamento} Recorrido del árbol: ${d.ramaRecorrida.join(" → ")}.`,
    requisitosPrevios: d.requisitosPrevios,
    rutaTemporal: [d.requisitosPrevios.length ? `Primero: ${d.requisitosPrevios.join("; ")}.` : null, proximo ? `Actuar antes del ${proximo.vencimientoMasTemprano ?? proximo.vencimiento} (${proximo.descripcion}).` : null].filter(Boolean).join(" ") || "Sin términos que condicionen la ruta.",
    concurrentes: d.concurrentes.map((c) => `${c.via}: ${c.fundamento}`), descartadas: d.descartadas, urgente: d.urgente,
    piezaSiguiente: { tipo: d.principal.pieza as TipoPieza, destinatario: h.destinatario, objetivo: h.objetivo, requiereAbogado },
    notificaciones: ctx.exp.estrategia?.notificaciones ?? [], contradictor: [],
  };
  ctx.exp.borradores.pretensionPrincipal = h.pretensionPrincipal;
  return completado(`Vía principal: ${d.principal.via} (${d.principal.pieza}); ${d.concurrentes.length} concurrente(s) y ${d.descartadas.length} descartada(s) con su razón.`);
};

/* ───────────────────── M16 · redactor de la pieza siguiente ───────────────────── */

type PiezaGuardada = { redactada: ReturnType<typeof PiezaRedactada.parse>; tipo: TipoPieza; hallazgos: Array<{ regla: string; severidad: string; ubicacion: string; detalle: string }>; faltantes: string[] };

function notasDe(ctx: ContextoNodo, fuenteIds: string[]): NotaPie[] {
  return fuenteIds.map((id) => ctx.exp.fuentes.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => ({ texto: etiquetaFuente(f), url: f.url, fecha: f.verificadaEn.slice(0, 10) }));
}

function segmentosCon(texto: string, notas: NotaPie[]): Segmento[] {
  if (!notas.length) return [{ texto }];
  return [{ texto, nota: notas[0] }, ...notas.slice(1).map((n) => ({ texto: "", nota: n }))];
}

async function perfil(ctx: ContextoNodo): Promise<PerfilAbogado | null> {
  return ctx.s.abogados ? ctx.s.abogados.perfil(ctx.exp.propietarioId) : null;
}

export function firmaPieza(p: PerfilAbogado | null): DocumentoPieza["firma"] {
  return {
    nombre: p?.nombre ?? "[NOMBRE]", identificacion: p?.identificacion ? `C.C. ${p.identificacion.replace(/^C\.?C\.?\s*/i, "")}` : "C.C. [C.C. No.]",
    tarjeta: p?.tarjetaProfesional ? `T.P. ${p.tarjetaProfesional.replace(/^T\.?P\.?\s*/i, "")} del C. S. de la J.` : "T.P. [T.P. No.] del C. S. de la J.",
    calidad: "Apoderado(a)", contacto: [p?.correoRegistroNacional ?? p?.correo ?? "[CORREO]", p?.direccion ?? "[DIRECCIÓN]", p?.telefono].filter(Boolean).join(" · "),
  };
}

/** Completa los campos abiertos del apoderado con el perfil verificado del ABOGADO (USUARIO); los que no consten quedan abiertos. */
export function completarCampos(texto: string, p: PerfilAbogado | null): string {
  if (!p) return texto;
  const campos: Array<[RegExp, string | null]> = [
    [/\[NOMBRE\]/g, p.nombre || null],
    [/\[C\.C\. No\.\]/g, p.identificacion?.replace(/^C\.?C\.?\s*/i, "") || null],
    [/\[T\.P\. No\.\]/g, p.tarjetaProfesional?.replace(/^T\.?P\.?\s*/i, "") || null],
    [/\[CORREO\]/g, p.correoRegistroNacional || p.correo || null],
    [/\[DIRECCI[ÓO]N\]/g, p.direccion || null],
  ];
  return campos.reduce((t, [re, v]) => (v ? t.replace(re, v) : t), texto);
}

/** Construye el modelo de la pieza a partir del borrador redactado (se reutiliza en la versión radicable). */
export function documentoPieza(ctx: ContextoNodo, g: PiezaGuardada, modo: DocumentoPieza["modo"], p: PerfilAbogado | null): DocumentoPieza {
  const c = (t: string) => completarCampos(t, p);
  const r = { ...g.redactada, apertura: c(g.redactada.apertura), cierre: c(g.redactada.cierre), secciones: g.redactada.secciones.map((s) => ({ ...s, parrafos: s.parrafos.map((x) => ({ ...x, texto: c(x.texto) })) })) };
  const cuerpo: BloquePieza[] = r.secciones.map((s) => ({
    titulo: s.titulo, numerado: "ROMANO",
    bloques: s.numerarParrafos
      ? [{ tipo: "lista", ordenada: true, items: s.parrafos.map((x) => segmentosCon(x.texto, notasDe(ctx, x.fuenteIds))) }]
      : s.parrafos.map((x) => ({ tipo: "parrafo" as const, segmentos: segmentosCon(x.texto, notasDe(ctx, x.fuenteIds)) })),
  }));
  const anexos = ctx.exp.piezas.filter((x) => x.estado === "ORGANIZADO" && x.anexo !== null).sort((a, b) => a.anexo! - b.anexo!);
  if (anexos.length) cuerpo.push({ titulo: "Anexos", numerado: "ROMANO", bloques: [{ tipo: "lista", ordenada: false, items: anexos.map((x) => [{ texto: `Anexo ${x.anexo}. ${x.nombreArchivo} (${x.paginas} ${x.paginas === 1 ? "página" : "páginas"}).` }]) }] });
  const contrapartes = ctx.exp.partes.filter((x) => !x.esCliente);
  const firma = firmaPieza(p);
  cuerpo.push({
    titulo: "Notificaciones", numerado: "ROMANO",
    bloques: [
      ...contrapartes.map((x) => ({ tipo: "parrafo" as const, segmentos: [{ texto: `${x.nombre} (${x.calidad}): dirección física ${x.domicilio ?? "[DIRECCIÓN]"}; canal digital ${x.correo ?? "[CORREO ELECTRÓNICO] (manifiesto bajo juramento que es el utilizado por la persona y cómo se obtuvo, art. 8 de la Ley 2213 de 2022)"}.` }] })),
      { tipo: "parrafo" as const, segmentos: [{ texto: `El suscrito apoderado recibirá notificaciones en ${firma.contacto}.` }] },
    ],
  });
  return {
    titulo: `${g.tipo.replace(/_/g, " ").toLowerCase()} · ${ctx.exp.titulo}`, ciudadFecha: `${ctx.s.config.ciudad}, ${fechaLarga(ctx.hoy())}`, destinatario: r.destinatario, referencia: r.referencia, asunto: r.asunto,
    apertura: [{ texto: r.apertura }], cuerpo, cierre: r.cierre, firma, modo, advertencia: modo === "BORRADOR" ? ADVERTENCIA_BORRADOR : null,
  };
}

const INSTRUCCION_PIEZA = (tipo: string, componentes: string, extra: string) => `Redacta la actuación siguiente del caso: ${tipo.replace(/_/g, " ")}.
Componentes exigidos (identificador: descripción · norma):
${componentes}

Reglas de redacción forense:
- Estructura propia del tipo de actuación; cada sección declara en "componentes" los identificadores que satisface.
- Hechos determinados, clasificados y numerados, en modo, tiempo y lugar, con sus soportes (archivoId y página) y sin calificaciones jurídicas.
- Pretensiones precisas y en lenguaje determinado; incluye subsidiarias cuando una negativa sea previsible.
- Fundamentos solo con FUENTES VERIFICADAS, citadas por su identificador interno en "fuenteIds" y por su nombre oficial en el texto. No menciones ninguna norma o providencia que no esté en ese listado.
- Pruebas: refiérete a los documentos por su número de anexo del listado DOCUMENTOS; no inventes documentos.
- No redactes las secciones de anexos ni de notificaciones: el sistema las genera con el índice electrónico y los datos verificados.
- Sin raya larga como signo de inciso, sin promesas de resultado y sin expresiones indeterminadas.
- Los datos del apoderado van como campos abiertos: [NOMBRE], [C.C. No.], [T.P. No.].${extra}`;

function auditarPieza(ctx: ContextoNodo, r: ReturnType<typeof PiezaRedactada.parse>): { noVerificadas: Array<{ seccion: string; texto: string }>; r: ReturnType<typeof PiezaRedactada.parse> } {
  const noVerificadas: Array<{ seccion: string; texto: string }> = [];
  for (const s of r.secciones) for (const p of s.parrafos) {
    const a = auditarTexto(ctx.exp, p.texto);
    for (const c of a.noVerificadas) noVerificadas.push({ seccion: s.titulo, texto: c.texto });
    p.fuenteIds = [...new Set([...p.fuenteIds.filter((id) => ctx.exp.fuentes.some((f) => f.id === id && f.resolucion !== "NO_RESUELTA")), ...a.exactas.map((x) => x.fuente.id), ...a.porCuerpo.map((x) => x.fuente.id)])];
  }
  return { noVerificadas, r };
}

export const m16: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const e = ctx.exp.estrategia;
  if (!e) return completado("Sin estrategia: no hay pieza que redactar.");
  const tipo = e.piezaSiguiente.tipo;
  const comps = componentesDe(tipo);
  const peticion = tipo === "DERECHO_PETICION"
    ? `\n- Las pretensiones deben comenzar, literalmente, con: ${ctx.s.config.perfilDespacho.peticion.pretensionesApertura.map((x) => `«${x}»`).join(" ")} y cerrar con el párrafo de cierre que agrega el sistema.`
    : "";
  const contexto = bloques(vistaCaso(ctx.exp), vistaPartes(ctx.exp), vistaHechos(ctx.exp), vistaDocumentos(ctx.exp), vistaFuentes(ctx.exp, { conTexto: true, maxPorFuente: 1500 }), vistaAnalisis(ctx.exp), vistaEstrategia(ctx.exp), vistaTerminos(ctx.exp), vistaCorrecciones(ctx.exp), { titulo: "PRETENSIÓN PRINCIPAL", texto: String(ctx.exp.borradores.pretensionPrincipal ?? e.piezaSiguiente.objetivo) });
  const pedir = (extra = "") => tarea(ctx, { tarea: "redaccion_pieza", esquema: PiezaRedactada, nombreEsquema: "PiezaRedactada", instruccion: INSTRUCCION_PIEZA(tipo, comps.map((c) => `${c.id}: ${c.descripcion} · ${c.norma}`).join("\n"), peticion + extra), contexto, esfuerzo: "high" });
  let { r, noVerificadas } = auditarPieza(ctx, await pedir());
  if (noVerificadas.length) {
    ({ r, noVerificadas } = auditarPieza(ctx, await pedir(`\n\nEn la versión anterior se citaron fuentes que NO están verificadas: ${noVerificadas.map((x) => x.texto).join("; ")}. Retíralas o reemplázalas por fuentes del listado.`)));
  }
  // Toda cita no verificada que persista se retira del texto y queda registrada.
  const registradas: Cita[] = [];
  for (const s of r.secciones) for (const p of s.parrafos) {
    const a = auditarTexto(ctx.exp, p.texto);
    if (a.noVerificadas.length) {
      p.texto = retirarCitas(p.texto, a.noVerificadas);
      for (const c of a.noVerificadas) registradas.push({ id: nuevoId("cit"), texto: c.texto, clase: c.clase.startsWith("PROVIDENCIA") ? "PROVIDENCIA" : "NORMA", identificadorNormalizado: c.identificador, fuenteId: null, entregable: "PIEZA_PROCESAL", seccion: s.titulo, estado: "VERIFICADA_CON_ADVERTENCIA", motivo: "Cita no verificada retirada automáticamente del borrador.", citaTextual: null, coincidenciaTextual: null, auditadaEn: ctx.ahora() });
    }
  }
  if (tipo === "DERECHO_PETICION") {
    const vigilado = ctx.exp.partes.some((p) => !p.esCliente && /banco|financier|asegurador|fiduciari|comisionista|cooperativa financiera/i.test(`${p.nombre} ${p.calidad}`));
    const c = cierrePeticion(vigilado, "usuario", ctx.s.config.perfilDespacho);
    r.cierre = `${c.texto}\n${r.cierre}`;
    if (c.advertencia) aviso(ctx, c.advertencia, "INFORMATIVA");
  }
  ctx.exp.citas = [...ctx.exp.citas.filter((c) => c.entregable !== "PIEZA_PROCESAL"), ...registradas];
  for (const c of registradas) aviso(ctx, `Se retiró del borrador (sección ${c.seccion}) la cita «${c.texto}»: no está verificada en fuente oficial.`, "ALTA");
  // Validaciones de forma: redacción forense y componentes exigidos.
  for (const s of r.secciones) for (const p of s.parrafos) p.texto = p.texto.replace(/(\S)\s*[—–]\s*(?=\S)/g, (m, a) => (/\d/.test(a) ? m : `${a}, `));
  const hallazgos = validarRedaccionForense(r.secciones.flatMap((s) => s.parrafos.map((p, i) => ({ ubicacion: `${s.titulo} ¶${i + 1}`, texto: p.texto, esHecho: /hecho/i.test(s.titulo) }))));
  const presentes = new Set([...r.secciones.flatMap((s) => s.componentes), "anexos", "notificaciones"]);
  const faltantes = comps.filter((c) => !presentes.has(c.id)).map((c) => `${c.descripcion} (${c.norma}; ${c.gravedad}): ${c.consecuencia}`);
  for (const f of faltantes) aviso(ctx, `Componente exigido no identificado en la pieza: ${f}`, "ALTA");
  for (const h of hallazgos.filter((x) => x.severidad === "BLOQUEANTE")) aviso(ctx, `${h.regla} en ${h.ubicacion}: ${h.detalle}`, "ALTA");
  const guardada: PiezaGuardada = { redactada: r, tipo, hallazgos, faltantes };
  ctx.exp.borradores.pieza = guardada;
  const p = await perfil(ctx);
  const doc = await generarPieza(documentoPieza(ctx, guardada, "BORRADOR", p));
  const version = ctx.exp.entregables.filter((x) => x.tipo === "PIEZA_PROCESAL" && x.modo === "BORRADOR").length + 1;
  await registrarEntregable(ctx, { tipo: "PIEZA_PROCESAL", modo: "BORRADOR", contenido: doc.docx, nombreArchivo: `${tipo}_BORRADOR_v${version}.docx`, mime: MIME_DOCX });
  return completado(`Borrador de ${tipo.replace(/_/g, " ").toLowerCase()} con ${r.secciones.length} sección(es), ${doc.notasAlPie} nota(s) al pie; ${faltantes.length} componente(s) faltante(s) y ${hallazgos.length} observación(es) de redacción.`);
};

/** Módulo 17 · forma de notificación y deberes de comunicación de la pieza (Ley 2213 de 2022). */
export const m17: ManejadorNodo = async (ctx) => {
  const e = ctx.exp.estrategia;
  if (!e) return completado("Sin pieza que comunicar.");
  const cautelares = ctx.exp.analisis.procedibilidad.some((p) => /cautelar/i.test(p.razon) && p.estado === "NO_EXIGIBLE");
  const plan = planDeComunicacion(e.piezaSiguiente.tipo, cautelares);
  e.notificaciones = plan.map((p) => ({ sujeto: p.sujeto, forma: `${p.forma}. ${p.obligacion}`, fundamento: p.fundamento, fechaSurtida: null, terminoDesde: null }));
  return completado(`${plan.length} deber(es) de comunicación; la fecha de referencia de trabajo será siempre la más conservadora.`);
};

/** Módulo 19 · simulador del contradictor sobre el borrador de la pieza. */
export const m19: ManejadorNodo = async (ctx) => {
  const e = ctx.exp.estrategia;
  const g = ctx.exp.borradores.pieza as PiezaGuardada | undefined;
  if (!e || !g) return completado("Sin borrador que contradecir.");
  const r = await tarea(ctx, {
    tarea: "contradictor", esquema: Contradiccion, nombreEsquema: "Contradiccion",
    instruccion: "Actúa como el apoderado más diligente de la contraparte: ataca el borrador con las excepciones previas y de mérito previsibles, tachas y desconocimiento de documentos, objeciones al juramento estimatorio, falta de legitimación, prescripción o caducidad, y debilidades narrativas o probatorias. Ordena los ataques por severidad, indica si el borrador resiste (SI, PARCIAL, NO) y propón la réplica concreta cuando exista.",
    contexto: bloques(vistaCaso(ctx.exp), vistaHechos(ctx.exp), vistaAnalisis(ctx.exp), { titulo: "BORRADOR DE LA PIEZA", texto: JSON.stringify(g.redactada) }),
  });
  e.contradictor = r.ataques.map((a) => ({ ...a, riesgoAsumido: false }));
  const graves = e.contradictor.filter((a) => a.severidad === "ALTA" && a.resiste !== "SI" && !a.replica).length;
  return completado(`${r.ataques.length} ataque(s) previsible(s); ${graves} severo(s) sin réplica que exigen decisión expresa del ABOGADO (USUARIO).`);
};
