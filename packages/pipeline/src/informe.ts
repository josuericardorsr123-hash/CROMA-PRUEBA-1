import type { AreaDerecho, Expediente, Fuente } from "@em/dominio";
import type { Bloque, DocumentoInforme, NotaPie, Seccion, Segmento, Subseccion } from "@em/docgen";
import { coberturaLiteral, fechaLarga } from "@em/motores";
import { atribucionApa, auditarTexto, etiquetaFuente, referenciaApa, retirarCitas } from "./auditoria";
import type { ConfigPipeline } from "./contexto";
import type { MetadatosInforme, SeccionRedactada } from "./esquemas";

/* ────────────────────────────────────────────────────────────────────────────
 * Composición del informe técnico (formato del despacho):
 *  encabezado editorial · título · autor · subtítulo · resumen · tabla de
 *  contenido · introducción sin numerar · secciones I a XIII en romano ·
 *  CONCLUSIONES · Referencias (APA simplificado) · firma entre guiones largos.
 * Las secciones de datos se componen deterministamente desde el expediente;
 * las narrativas vienen de la redacción asistida ya auditada. Toda afirmación
 * ligada a una fuente lleva su nota al pie en el segmento exacto que sustenta.
 * ──────────────────────────────────────────────────────────────────────────── */

export type ClaveSeccion = "antecedentes" | "expediente" | "oficial" | "hechos" | "problemas" | "normativo" | "precedente" | "analisis" | "terminos" | "riesgos" | "estrategia" | "contradiccion" | "gobernanza";

export const SECCIONES_INFORME: Array<{ clave: ClaveSeccion; titulo: string; narrativa: boolean }> = [
  { clave: "antecedentes", titulo: "Antecedentes y objeto del informe", narrativa: true },
  { clave: "expediente", titulo: "Expediente recibido y organización documental", narrativa: false },
  { clave: "oficial", titulo: "Estado procesal oficial y debida diligencia", narrativa: false },
  { clave: "hechos", titulo: "Hechos jurídicamente relevantes", narrativa: false },
  { clave: "problemas", titulo: "Problemas jurídicos", narrativa: false },
  { clave: "normativo", titulo: "Marco normativo aplicable", narrativa: true },
  { clave: "precedente", titulo: "Precedente judicial y fuerza vinculante", narrativa: true },
  { clave: "analisis", titulo: "Análisis de hecho y de derecho", narrativa: true },
  { clave: "terminos", titulo: "Términos, prescripción y caducidad", narrativa: false },
  { clave: "riesgos", titulo: "Riesgos procesales", narrativa: false },
  { clave: "estrategia", titulo: "Mecanismos alternativos y estrategia", narrativa: true },
  { clave: "contradiccion", titulo: "Contradicción anticipada", narrativa: false },
  { clave: "gobernanza", titulo: "Actuación siguiente, límites y gobernanza", narrativa: false },
];

export interface RedaccionInforme {
  narrativas: Partial<Record<ClaveSeccion, SeccionRedactada>>;
  metadatos: ReturnType<typeof MetadatosInforme.parse>;
}

/** Unidad de trazabilidad (Módulo 22): cada párrafo con sus hechos, soportes y fuentes. */
export interface AfirmacionFuente {
  seccion: string;
  /** SISTEMA: compuesta desde datos verificados del expediente; REDACCION: prosa redactada con asistencia. */
  origen: "SISTEMA" | "REDACCION";
  texto: string;
  hechos: string[];
  fuentes: string[];
  soportes: Array<{ archivoId: string; pagina: number }>;
}

export const ETIQUETA_AREA: Record<AreaDerecho, string> = {
  CIVIL: "Derecho civil", COMERCIAL: "Derecho comercial", FAMILIA: "Derecho de familia", LABORAL: "Derecho laboral", SEGURIDAD_SOCIAL: "Seguridad social",
  ADMINISTRATIVO: "Derecho administrativo", CONSTITUCIONAL: "Derecho constitucional", PENAL: "Derecho penal", POLICIVO: "Derecho policivo", TRIBUTARIO: "Derecho tributario",
  CONSUMIDOR: "Protección al consumidor", SERVICIOS_PUBLICOS: "Servicios públicos domiciliarios", AGRARIO: "Derecho agrario", INSOLVENCIA: "Insolvencia", SOCIETARIO: "Derecho societario",
  DISCIPLINARIO: "Derecho disciplinario", CONTRATACION_ESTATAL: "Contratación estatal", PROPIEDAD_INTELECTUAL: "Propiedad intelectual", OTRO: "Derecho",
};

const ESTADO_HECHO: Record<string, string> = {
  PROBADO_DOCUMENTAL: "probado documentalmente", ACREDITADO_FUENTE_OFICIAL: "acreditado en fuente oficial", AFIRMADO_POR_CLIENTE: "afirmado por el cliente",
  INFERIDO: "inferido", CONTROVERTIDO: "controvertido", DESCONOCIDO: "sin determinar",
};

const legible = (t: string) => t.replace(/_/g, " ").toLowerCase();

class Compositor {
  readonly afirmaciones: AfirmacionFuente[] = [];
  readonly fuentesUsadas = new Set<string>();
  readonly retiradas: string[] = [];

  constructor(private readonly exp: Expediente) {}

  fuente(id: string | null | undefined): Fuente | null {
    if (!id) return null;
    return this.exp.fuentes.find((f) => f.id === id && f.resolucion !== "NO_RESUELTA") ?? null;
  }

  notaFuente(f: Fuente): NotaPie {
    this.fuentesUsadas.add(f.id);
    return { texto: etiquetaFuente(f), url: f.url, fecha: fechaLarga(f.verificadaEn.slice(0, 10)) };
  }

  etiquetaAnexo(archivoId: string, pagina: number): string {
    const p = this.exp.piezas.find((x) => x.archivoId === archivoId && pagina >= x.paginaInicio && pagina <= x.paginaFin);
    if (p?.anexo) return `Anexo ${p.anexo} («${p.nombreArchivo}»), página ${pagina - p.paginaInicio + 1}`;
    const a = this.exp.archivos.find((x) => x.id === archivoId);
    return `${a ? `«${a.nombreOriginal}»` : archivoId}, página ${pagina}`;
  }

  notaSoportes(soportes: Array<{ archivoId: string; pagina: number }>): NotaPie | null {
    const unicos = [...new Map(soportes.map((s) => [`${s.archivoId}#${s.pagina}`, s])).values()];
    if (!unicos.length) return null;
    return { texto: `Soporte documental: ${unicos.slice(0, 6).map((s) => this.etiquetaAnexo(s.archivoId, s.pagina)).join("; ")}${unicos.length > 6 ? `; y ${unicos.length - 6} más` : ""}` };
  }

  /** Texto auditado: una cita que no corresponde a una fuente verificada no llega al documento. */
  auditar(texto: string, seccion: string): { texto: string; fuentes: Fuente[] } {
    const a = auditarTexto(this.exp, texto);
    for (const c of a.noVerificadas) this.retiradas.push(`${seccion}: ${c.texto}`);
    return { texto: a.noVerificadas.length ? retirarCitas(texto, a.noVerificadas) : texto, fuentes: [...a.exactas, ...a.porCuerpo].map((x) => x.fuente) };
  }

  parrafo(segmentos: Array<{ texto: string; fuenteId?: string | null }>, seccion: string, hechoIds: string[] = []): Bloque {
    const salida: Segmento[] = [];
    const fuentes: string[] = [];
    for (const s of segmentos) {
      const { texto } = this.auditar(s.texto, seccion);
      const f = this.fuente(s.fuenteId);
      if (f) fuentes.push(f.id);
      salida.push({ texto, nota: f ? this.notaFuente(f) : null });
    }
    const hechos = this.exp.hechos.filter((h) => hechoIds.includes(h.id));
    const soportes = hechos.flatMap((h) => h.soportes.map((x) => ({ archivoId: x.archivoId, pagina: x.pagina })));
    const nota = this.notaSoportes(soportes);
    if (nota) salida.push({ texto: "", nota });
    this.afirmaciones.push({ seccion, origen: "REDACCION", texto: salida.map((x) => x.texto).join(""), hechos: hechos.map((h) => h.id), fuentes, soportes });
    return { tipo: "parrafo", segmentos: salida };
  }

  simple(texto: string, seccion: string, notas: NotaPie[] = [], registro: Partial<AfirmacionFuente> = {}): Bloque {
    const t = this.auditar(texto, seccion).texto;
    this.afirmaciones.push({ seccion, origen: "SISTEMA", texto: t, hechos: registro.hechos ?? [], fuentes: registro.fuentes ?? [], soportes: registro.soportes ?? [] });
    return { tipo: "parrafo", segmentos: notas.length ? [{ texto: t, nota: notas[0] }, ...notas.slice(1).map((n) => ({ texto: "", nota: n }))] : [{ texto: t }] };
  }

  /** Cita en bloque: solo si el fragmento aparece literalmente en el texto verificado de la fuente. */
  citaBloque(fuenteId: string, fragmento: string, descripcion: string, seccion: string): Bloque | null {
    const f = this.fuente(fuenteId);
    if (!f?.textoRelevante || f.resolucion === "EXISTENCIA_CONFIRMADA") return null;
    if (coberturaLiteral(f.textoRelevante, fragmento) < 0.92) {
      this.retiradas.push(`${seccion}: cita textual de ${f.identificador} que no coincide literalmente con la fuente`);
      return null;
    }
    this.fuentesUsadas.add(f.id);
    this.afirmaciones.push({ seccion, origen: "SISTEMA", texto: fragmento, hechos: [], fuentes: [f.id], soportes: [] });
    return { tipo: "cita", texto: fragmento, descripcion, fuente: atribucionApa(f), url: f.url, nota: { texto: `Cita textual cotejada literalmente con ${etiquetaFuente(f)}`, url: f.url, fecha: fechaLarga(f.verificadaEn.slice(0, 10)) } };
  }

  narrativa(r: SeccionRedactada | undefined, seccion: string): { bloques: Bloque[]; subsecciones: Subseccion[] } {
    if (!r) return { bloques: [], subsecciones: [] };
    const bloques: Bloque[] = [];
    r.parrafos.forEach((p, i) => {
      bloques.push(this.parrafo(p.segmentos, seccion, p.hechoIds));
      for (const c of r.citas.filter((x) => x.despuesDelParrafo === i)) {
        const b = this.citaBloque(c.fuenteId, c.fragmento, c.descripcion, seccion);
        if (b) bloques.push(b);
      }
    });
    for (const c of r.citas.filter((x) => x.despuesDelParrafo >= r.parrafos.length)) {
      const b = this.citaBloque(c.fuenteId, c.fragmento, c.descripcion, seccion);
      if (b) bloques.push(b);
    }
    const subsecciones: Subseccion[] = r.subsecciones.map((s) => ({
      titulo: s.titulo, bloques: s.parrafos.map((p) => this.parrafo(p.segmentos, seccion, p.hechoIds)),
      subsecciones: s.subsecciones.map((x) => ({ titulo: x.titulo, bloques: x.parrafos.map((p) => this.parrafo(p.segmentos, seccion, p.hechoIds)) })),
    }));
    return { bloques, subsecciones };
  }
}

const tabla = (titulo: string, columnas: string[], filas: string[][], proporciones?: number[], nota?: string | null): Bloque => ({ tipo: "tabla", titulo, columnas, filas, proporciones, nota: nota ?? null });
const lista = (items: string[], ordenada = false): Bloque => ({ tipo: "lista", ordenada, items: items.map((t) => [{ texto: t }]) });

export interface OpcionesComposicion {
  modo: "BORRADOR" | "FINAL" | "DICTAMEN";
  hoy: string;
  config: ConfigPipeline;
  /** Huella de la cadena de trazabilidad (Módulo 22), si ya se calculó. */
  cabezaTrazabilidad?: string | null;
  motivoDictamen?: string[];
}

/** Compone el modelo del informe (determinista a partir del expediente y de la redacción guardada). */
export function componerInforme(exp: Expediente, redaccion: RedaccionInforme, o: OpcionesComposicion): { documento: DocumentoInforme; afirmaciones: AfirmacionFuente[]; retiradas: string[] } {
  const c = new Compositor(exp);
  const a = exp.analisis;
  const secciones: Seccion[] = [];
  const agregar = (clave: ClaveSeccion, contenido: { bloques: Bloque[]; subsecciones: Subseccion[] }) => {
    const def = SECCIONES_INFORME.find((s) => s.clave === clave)!;
    secciones.push({ titulo: def.titulo, bloques: contenido.bloques.length ? contenido.bloques : [c.simple("Sin contenido para esta sección en el expediente.", def.titulo)], subsecciones: contenido.subsecciones });
  };
  const n = redaccion.narrativas;

  // I. Antecedentes
  agregar("antecedentes", c.narrativa(n.antecedentes, "I"));

  // II. Expediente recibido
  {
    const org = exp.piezas.filter((p) => p.estado === "ORGANIZADO");
    const visuales = exp.lecturas.filter((l) => l.metodo === "LECTURA_VISUAL").length;
    const bloques: Bloque[] = [
      c.simple(`Se recibieron ${exp.archivos.length} archivo(s), de los cuales ${exp.archivos.filter((x) => x.estado === "DUPLICADO").length} son duplicados exactos (misma huella SHA-256), ${exp.archivos.filter((x) => x.estado === "CIFRADO_BLOQUEADO").length} están protegidos con clave de apertura y ${exp.archivos.filter((x) => x.estado === "NO_SOPORTADO").length} tienen formato no soportado. Se leyeron íntegramente ${exp.lecturas.length} página(s), ${visuales} de ellas por lectura visual, y se organizaron ${org.length} documento(s) con número de anexo estable, en orden cronológico y con la puerta de entrada documental al inicio.`, "II",
        [{ texto: "Índice electrónico del expediente con nombre, fechas, orden, páginas, formato, tamaño, origen y huella de cada documento, conforme al Protocolo para la gestión de documentos electrónicos, digitalización y conformación del expediente del Consejo Superior de la Judicatura." }]),
    ];
    if (org.length) bloques.push(tabla("Documentos organizados del expediente", ["Anexo", "Documento", "Tipología", "Fecha", "Págs."], org.map((p) => [String(p.anexo ?? ""), p.nombreArchivo, legible(p.tipologia), p.fecha ? fechaLarga(p.fecha) : "Sin fecha", String(p.paginas)]), [0.8, 4.2, 1.8, 1.8, 0.7], "La numeración de anexos es estable: un número asignado no cambia en versiones posteriores."));
    const subs: Subseccion[] = [{ titulo: "Omisiones y vacíos documentales", bloques: a.omisiones.length ? [lista(a.omisiones.map((x) => `${x.titulo} (${x.gravedad.toLowerCase()}): ${x.detalle}`))] : [c.simple("No se detectaron omisiones documentales frente a lo que el tipo de asunto exige.", "II")] }];
    const limites = a.avisos.filter((x) => ["f1", "f2", "f3"].includes(x.modulo));
    if (limites.length) subs.push({ titulo: "Límites de la recepción y de la lectura", bloques: [lista(limites.map((x) => x.texto))] });
    agregar("expediente", { bloques, subsecciones: subs });
  }

  // III. Estado procesal oficial y debida diligencia
  {
    const bloques: Bloque[] = [];
    if (a.estadosProcesales.length) {
      bloques.push(tabla("Procesos consultados en fuente oficial", ["Radicado", "Despacho", "Clase", "Última actuación", "Fecha"], a.estadosProcesales.map((e) => [e.radicado, e.despacho ?? "No informado", e.claseProceso ?? "No informada", e.ultimaActuacion?.actuacion ?? "No informada", e.ultimaActuacion?.fecha ? fechaLarga(e.ultimaActuacion.fecha) : "Sin fecha"]), [2.6, 2.4, 1.4, 2.2, 1.4]));
      for (const e of a.estadosProcesales) {
        const p = exp.procedencias.find((x) => e.procedencias.includes(x.id));
        bloques.push(c.simple(`El radicado ${e.radicado} se consultó en ${e.fuente}; la última actuación registrada es «${e.ultimaActuacion?.actuacion ?? "no informada"}»${e.ultimaActuacion?.fecha ? ` del ${fechaLarga(e.ultimaActuacion.fecha)}` : ""}.`, "III", p ? [{ texto: `Consulta oficial con finalidad «${p.finalidad}»; huella SHA-256 del resultado ${p.hashResultado?.slice(0, 16) ?? "no disponible"}.`, url: p.url, fecha: fechaLarga(p.consultadoEn.slice(0, 10)) }] : []));
      }
    } else bloques.push(c.simple("No se acreditó en fuente oficial el estado procesal de ningún radicado.", "III"));
    const subs: Subseccion[] = [];
    if (a.diligencia.length) subs.push({ titulo: "Debida diligencia de las partes", bloques: [tabla("Consultas de debida diligencia", ["Sujeto", "Fuente", "Resultado", "Alerta"], a.diligencia.map((d) => [d.sujeto, d.fuente, d.resultado.slice(0, 220), d.alerta ? "Sí" : "No"]), [2, 2, 4.4, 0.8], "Cada consulta se hizo con finalidad declarada (Ley 1581 de 2012) y queda registrada con su procedencia.")] });
    const avisos = a.avisos.filter((x) => ["m30", "m31"].includes(x.modulo));
    if (avisos.length) subs.push({ titulo: "Ausencias declaradas", bloques: [lista(avisos.map((x) => x.texto))] });
    agregar("oficial", { bloques, subsecciones: subs });
  }

  // IV. Hechos
  {
    const bloques = exp.hechos.map((h) => c.simple(`**${h.numero}.** ${h.fecha ? `${fechaLarga(h.fecha)}. ` : h.fechaTexto ? `${h.fechaTexto}. ` : ""}${h.descripcion}${h.lugar ? ` Lugar: ${h.lugar}.` : ""} *(${ESTADO_HECHO[h.estado] ?? h.estado})*`, "IV", [c.notaSoportes(h.soportes) ?? { texto: "Hecho sin soporte documental: no se presenta como probado." }], { hechos: [h.id], soportes: h.soportes.map((s) => ({ archivoId: s.archivoId, pagina: s.pagina })) }));
    const discrepantes = exp.hechos.filter((h) => h.discrepancias.length);
    agregar("hechos", { bloques, subsecciones: discrepantes.length ? [{ titulo: "Discrepancias entre fuentes", bloques: [lista(discrepantes.flatMap((h) => h.discrepancias.map((d) => `Hecho ${h.numero}: ${d.descripcion}. Resolución: ${d.resolucion} (criterio: ${d.criterio}).`)))] }] : [] });
  }

  // V. Problemas jurídicos
  agregar("problemas", { bloques: [lista(exp.problemas.map((p, i) => `${p.tipo === "PRINCIPAL" ? "Problema principal" : `Problema asociado ${i}`}: ${p.enunciado}`), true)], subsecciones: [] });

  // VI. Marco normativo
  {
    const r = c.narrativa(n.normativo, "VI");
    const normas = exp.fuentes.filter((f) => (f.clase === "NORMA" || f.clase === "TRATADO") && f.resolucion !== "NO_RESUELTA");
    if (normas.length) r.bloques.push(tabla("Normas verificadas y su vigencia", ["Disposición", "Vigencia", "Verificación"], normas.map((f) => [f.identificador, legible(f.vigencia), legible(f.resolucion)]), [4, 2, 3], "NO VERIFICADA nunca equivale a vigente: la vigencia se afirma solo con nota oficial."));
    const descartados = exp.cuerposNormativos.filter((x) => x.rol === "DESCARTADO");
    r.subsecciones.push({ titulo: "Cuerpos normativos concurrentes y descartados", bloques: [lista(exp.cuerposNormativos.map((x) => `${x.nombre} (${legible(x.rol)}): ${x.razon}`))] });
    if (a.bloqueConstitucionalidad?.activado) r.subsecciones.push({ titulo: "Bloque de constitucionalidad", bloques: [lista([...a.bloqueConstitucionalidad.razones, ...a.bloqueConstitucionalidad.instrumentos.map((i) => `${i.instrumento} (${i.leyAprobatoria}): ${i.disposicion}`)])] });
    if (a.conceptosAdministrativos && (a.conceptosAdministrativos.autoridades.length || a.conceptosAdministrativos.consultaSugerida)) r.subsecciones.push({ titulo: "Doctrina de autoridades administrativas", bloques: [c.simple(`Autoridades con competencia: ${a.conceptosAdministrativos.autoridades.join(", ") || "ninguna identificada"}. ${a.conceptosAdministrativos.consultados.length ? `Conceptos recuperados: ${a.conceptosAdministrativos.consultados.join(", ")}.` : "No se recuperó doctrina publicada."} ${a.conceptosAdministrativos.consultaSugerida ?? ""}`.trim(), "VI")] });
    if (descartados.length === 0 && !normas.length) r.bloques.push(c.simple("No se verificó ninguna norma en fuente oficial: el marco normativo queda pendiente y ninguna conclusión se apoya en normas no verificadas.", "VI"));
    agregar("normativo", r);
  }

  // VII. Precedente
  {
    const r = c.narrativa(n.precedente, "VII");
    const providencias = exp.fuentes.filter((f) => f.clase === "PROVIDENCIA" && f.resolucion !== "NO_RESUELTA");
    if (providencias.length) r.bloques.push(tabla("Precedente verificado", ["Providencia", "Autoridad", "Fuerza vinculante", "Analogía"], providencias.map((f) => [f.identificador, f.autoridad, legible(f.fuerzaVinculante ?? "sin calificar"), f.analogia ? `${legible(f.analogia.nivel)}${f.analogia.decisionAbogado ? ` (${legible(f.analogia.decisionAbogado)} por el abogado)` : ""}` : "Sin evaluar"]), [2.2, 2.6, 2.6, 2], "La doctrina probable fue derogada por la Ley 2430 de 2024; la similitud fáctica la confirma el ABOGADO (USUARIO)."));
    else r.bloques.push(c.simple("No se verificó precedente en fuente oficial para los problemas planteados; el vacío se declara y no se suple con memoria.", "VII"));
    agregar("precedente", r);
  }

  // VIII. Análisis
  agregar("analisis", c.narrativa(n.analisis, "VIII"));

  // IX. Términos
  {
    const bloques: Bloque[] = [];
    if (exp.terminos.length) {
      bloques.push(tabla("Términos calculados", ["Término", "Norma", "Inicio", "Vencimiento", "Estado"], exp.terminos.map((t) => [t.descripcion, t.norma, fechaLarga(t.fechaInicio), `${fechaLarga(t.vencimientoMasTemprano ?? t.vencimiento)}${t.esEstimacion ? " (estimado)" : ""}`, legible(t.estado)]), [2.8, 2.6, 1.6, 1.8, 1.3], "Días hábiles sin festivos (Ley 51 de 1983), vacancia judicial ni cierres del despacho; meses y años conservan el mismo número de día (art. 67 C.C.)."));
      for (const t of exp.terminos) bloques.push(c.simple(`${t.descripcion}: vence el ${fechaLarga(t.vencimientoMasTemprano ?? t.vencimiento)}${t.vencimientoMasTemprano && t.vencimientoMasTemprano !== t.vencimiento ? ` (extremo tardío: ${fechaLarga(t.vencimiento)}; se actúa antes del más temprano)` : ""}. ${t.accionQueInterrumpe ? `Interrupción: ${t.accionQueInterrumpe}` : ""}`.trim(), "IX", [{ texto: `${t.norma}. Verificación de la norma: ${t.verificacionNorma}. Fecha inicial tomada de: ${t.fechaInicioSoporte}.${t.advertencias.filter((x) => !x.startsWith("Cómputo:")).map((x) => ` ${x}`).join("")}` }]));
    } else bloques.push(c.simple("No se calcularon términos: faltan fechas determinables o el catálogo no cubre el asunto. El cómputo requiere verificación manual antes de actuar.", "IX"));
    const avisos = a.avisos.filter((x) => ["m08", "m14"].includes(x.modulo));
    agregar("terminos", { bloques, subsecciones: avisos.length ? [{ titulo: "Datos pendientes para el cómputo", bloques: [lista(avisos.map((x) => x.texto))] }] : [] });
  }

  // X. Riesgos procesales
  {
    const subs: Subseccion[] = [];
    subs.push({ titulo: "Nulidades procesales", bloques: [a.nulidades.aplica && a.nulidades.hallazgos.length ? lista(a.nulidades.hallazgos.map((h) => `${h.titulo}. ${h.detalle}`)) : c.simple(a.nulidades.aplica ? "Recorrido el catálogo taxativo del artículo 133 del CGP, no se encontraron indicios de nulidad." : "No hay actuación judicial en curso: el catálogo de nulidades no se aplica.", "X")] });
    if (a.competencia) subs.push({ titulo: "Competencia y jurisdicción", bloques: [c.simple(`Juez competente: ${a.competencia.juez}. Territorio: ${a.competencia.territorio}.${a.competencia.cuantia ? ` Cuantía: ${a.competencia.cuantia.calculo}` : ""}`, "X"), lista(a.competencia.cadena), ...(a.competencia.irregularidades.length ? [lista(a.competencia.irregularidades.map((i) => `${i.titulo}: ${i.detalle}`))] : [])] });
    if (a.derechosFundamentales && a.derechosFundamentales.resultado !== "NO_APLICA") subs.push({ titulo: "Derechos fundamentales", bloques: [c.simple(`Derechos comprometidos: ${a.derechosFundamentales.derechos.join(", ")}. Resultado del examen de procedencia de la tutela: ${legible(a.derechosFundamentales.resultado)}.${a.derechosFundamentales.viaOrdinaria ? ` Vía ordinaria: ${a.derechosFundamentales.viaOrdinaria}.` : ""}`, "X"), tabla("Examen de procedencia", ["Requisito", "Cumple", "Razón"], a.derechosFundamentales.examen.map((e) => [e.requisito, e.cumple, e.razon]), [2.4, 0.9, 5.4])] });
    if (a.matrizProbatoria.length) subs.push({ titulo: "Matriz de riesgo probatorio", bloques: [tabla("Hechos y medios de prueba", ["Hecho", "Medio", "Pert.", "Cond.", "Util.", "Licitud", "Vacío"], a.matrizProbatoria.map((f) => [String(exp.hechos.find((h) => h.id === f.hechoId)?.numero ?? "?"), f.medio ?? "Sin medio", f.pertinencia, f.conducencia, f.utilidad, f.licitud, f.vacio ? `Sí: ${f.gestionSugerida ?? ""}` : "No"]), [0.7, 2.6, 0.8, 0.8, 0.8, 0.9, 2.6], "Una fila vacía indica la gestión probatoria concreta que falta.")] });
    if (a.trampas.length) subs.push({ titulo: "Trampas procesales y requisitos de procedibilidad", bloques: [lista(a.trampas.map((t) => `${t.titulo}. ${t.detalle}${t.fundamento ? ` (${t.fundamento})` : ""}`))] });
    agregar("riesgos", { bloques: [c.simple("Se examinaron, con los motores de reglas del sistema, las nulidades del catálogo taxativo, la competencia por factores, los derechos fundamentales, la prueba disponible y las cargas procesales con plazo.", "X")], subsecciones: subs });
  }

  // XI. Estrategia
  {
    const r = c.narrativa(n.estrategia, "XI");
    if (a.masc) r.subsecciones.push({ titulo: "Mecanismos alternativos de solución de conflictos", bloques: [c.simple(`Conciliable: ${legible(a.masc.conciliable)}. Obligatoria como requisito de procedibilidad: ${legible(a.masc.obligatoriaComoRequisito)}. Puntaje de conveniencia: ${a.masc.puntaje}/100. ${a.masc.recomendacion}`, "XI"), tabla("Factores de conveniencia", ["Factor", "Peso", "Valor", "Razón"], a.masc.factores.map((f) => [f.factor, String(f.peso), String(f.valor), f.razon]), [2.2, 0.8, 0.8, 5])] });
    const e = exp.estrategia;
    if (e) {
      r.subsecciones.push({ titulo: "Vía procesal", bloques: [c.simple(`Vía principal: ${e.viaPrincipal}. ${e.fundamentoVia}${e.requisitosPrevios.length ? ` Requisitos previos: ${e.requisitosPrevios.join("; ")}.` : ""} Ruta temporal: ${e.rutaTemporal}`, "XI"), ...(e.concurrentes.length ? [lista(e.concurrentes.map((x) => `Concurrente: ${x}`))] : []), ...(e.descartadas.length ? [tabla("Vías descartadas", ["Vía", "Razón del descarte"], e.descartadas.map((d) => [d.via, d.razon]), [2.5, 6])] : [])] });
      if (e.notificaciones.length) r.subsecciones.push({ titulo: "Notificaciones y comunicaciones", bloques: [lista(e.notificaciones.map((x) => `${x.sujeto}: ${x.forma} (${x.fundamento})`))] });
    }
    agregar("estrategia", r);
  }

  // XII. Contradicción anticipada
  {
    const ataques = exp.estrategia?.contradictor ?? [];
    agregar("contradiccion", ataques.length
      ? { bloques: [tabla("Ataques previsibles de la contraparte", ["Ataque", "Severidad", "Resiste", "Réplica"], ataques.map((x) => [x.descripcion, legible(x.severidad), x.resiste, x.replica ?? (x.riesgoAsumido ? "Riesgo asumido por el ABOGADO (USUARIO)" : "Sin réplica: requiere decisión")]), [3.4, 1, 0.9, 3.4])], subsecciones: [] }
      : { bloques: [c.simple("No se simuló la contradicción: no hay borrador de pieza.", "XII")], subsecciones: [] });
  }

  // XIII. Actuación siguiente, límites y gobernanza
  {
    const subs: Subseccion[] = [];
    const e = exp.estrategia;
    if (e) subs.push({ titulo: "Actuación siguiente", bloques: [c.simple(`${legible(e.piezaSiguiente.tipo).replace(/^./, (x) => x.toUpperCase())} dirigida a ${e.piezaSiguiente.destinatario}, con el objetivo de ${e.piezaSiguiente.objetivo.replace(/\.$/, "")}. ${e.piezaSiguiente.requiereAbogado ? "Requiere derecho de postulación: la firma el ABOGADO (USUARIO)." : "No exige derecho de postulación."} El borrador se entrega por separado y solo se convierte en versión radicable con la aprobación expresa del ABOGADO (USUARIO).`, "XIII")] });
    if (a.zonasGrises.length) subs.push({ titulo: "Zonas grises", bloques: [lista(a.zonasGrises)] });
    const etiquetas = exp.afirmaciones.reduce<Record<string, number>>((acc, x) => ((acc[x.etiqueta] = (acc[x.etiqueta] ?? 0) + 1), acc), {});
    if (Object.keys(etiquetas).length) subs.push({ titulo: "Etiquetas de confianza", bloques: [c.simple(`Distribución de las afirmaciones del informe y de la pieza: ${Object.entries(etiquetas).map(([k, v]) => `${legible(k)} (${v})`).join("; ")}.`, "XIII")] });
    if (a.sesgo) subs.push({ titulo: "Sesgo y equidad", bloques: [tabla("Lista de verificación con enfoque diferencial", ["Pregunta", "Respuesta"], a.sesgo.checklist.map((x) => [x.pregunta, x.respuesta]), [4, 5]), ...(a.sesgo.observaciones.length ? [lista(a.sesgo.observaciones)] : [])] });
    if (a.habilitacion) subs.push({ titulo: "Control del ejercicio profesional", bloques: [c.simple(`${a.habilitacion.habilitada ? "Actuación habilitada" : "Actuación NO habilitada"}${a.habilitacion.requierePostulacion ? "; requiere derecho de postulación" : ""}.`, "XIII"), ...(a.habilitacion.hallazgos.length ? [lista(a.habilitacion.hallazgos.map((h) => `${legible(h.tipo).replace(/^./, (x) => x.toUpperCase())}: ${h.descripcion} ${h.accion} (${h.fundamento})`))] : [])] });
    const limites = a.avisos.filter((x) => !["f1", "f2", "f3", "m30", "m31", "m08", "m14"].includes(x.modulo));
    if (limites.length) subs.push({ titulo: "Ausencias declaradas y límites del análisis", bloques: [lista(limites.map((x) => x.texto))] });
    if (o.cabezaTrazabilidad) subs.push({ titulo: "Trazabilidad", bloques: [c.simple(`Cada afirmación del informe y de la pieza queda registrada con su hecho, documento y página, fuente y conclusión, encadenada por huellas SHA-256. Huella de cierre de la cadena: ${o.cabezaTrazabilidad}.`, "XIII")] });
    if (o.modo === "DICTAMEN" && o.motivoDictamen?.length) subs.unshift({ titulo: "Dictamen de no radicación o remisión", bloques: [lista(o.motivoDictamen)] });
    agregar("gobernanza", { bloques: [c.simple(o.modo === "DICTAMEN" ? "Este informe se emite como dictamen: la actuación no debe radicarse en las condiciones actuales. El trabajo hecho se conserva para su remisión o para una actuación posterior." : "El sistema preparó el análisis y los borradores; la decisión, la aprobación y la firma corresponden al ABOGADO (USUARIO).", "XIII")], subsecciones: subs });
  }

  const m = redaccion.metadatos;
  const introduccion = m.introduccion.map((p) => c.parrafo(p.segmentos, "Introducción", p.hechoIds));
  const conclusiones = m.conclusiones.map((p) => c.parrafo(p.segmentos, "Conclusiones", p.hechoIds));
  const usadas = exp.fuentes.filter((f) => c.fuentesUsadas.has(f.id));
  const referencias = [...new Set((usadas.length ? usadas : exp.fuentes.filter((f) => f.resolucion !== "NO_RESUELTA")).map(referenciaApa))].sort((x, y) => x.localeCompare(y, "es"));
  const categoria = ETIQUETA_AREA[a.area ?? "OTRO"];
  const documento: DocumentoInforme = {
    encabezadoEditorial: `${o.config.publicacion} · ${categoria} · ${fechaLarga(o.hoy)}`,
    titulo: m.titulo, autor: o.config.autorInforme, cargoAutor: o.config.cargoAutor, subtitulo: m.subtitulo, resumen: m.resumen, palabrasClave: m.palabrasClave,
    introduccion, secciones, conclusiones, referencias, firma: o.config.autorInforme,
    leyenda: o.config.demostracion ? "DEMOSTRACIÓN — datos ficticios, fuentes simuladas" : o.modo === "BORRADOR" ? "BORRADOR PARA REVISIÓN DEL ABOGADO (USUARIO)" : o.modo === "DICTAMEN" ? "DICTAMEN DE NO RADICACIÓN O REMISIÓN" : null,
    metadatos: { asunto: `${categoria}: ${a.tipoAsunto || a.materia}`, palabrasClave: m.palabrasClave.join("; "), descripcion: m.resumen.slice(0, 250) },
  };
  return { documento, afirmaciones: c.afirmaciones, retiradas: c.retiradas };
}
