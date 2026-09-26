import { createHash } from "node:crypto";
import type { BloqueContexto, PeticionEstructurada } from "@em/ia";
import { type GuionAgente, LlmSimulado, type ManejadorSimulado } from "@em/ia";
import { extraerCitas, fechaLarga, interpretarFecha } from "@em/motores";

/* ────────────────────────────────────────────────────────────────────────────
 * Proveedor de IA de DEMOSTRACIÓN: determinista y anclado exclusivamente en lo
 * que el contexto de cada petición contiene (texto de las páginas, hechos,
 * fuentes verificadas). No sustituye al modelo real: permite ejecutar el
 * pipeline completo sin clave, en pruebas y en la demostración, y valida cada
 * salida contra el mismo esquema que usaría Claude.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface OpcionesDemostracion {
  /** Transcripción por huella SHA-256 del PNG de cada página escaneada; la clave «*» se usa cuando la página se re-rasterizó y su huella cambió. */
  transcripciones?: Record<string, string>;
  /** Providencias que el plan propondrá como candidatas (se verifican antes de usarse). */
  providenciasCandidatas?: string[];
  /** Normas adicionales a proponer en el plan. */
  normasAdicionales?: string[];
}

type Json = Record<string, unknown>;
const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const RE_FECHA = new RegExp(`\\b(\\d{1,2}\\s+de\\s+(?:${MESES})\\s+(?:de|del)\\s+\\d{4})\\b`, "gi");

const bloque = (p: { contexto?: BloqueContexto[] }, titulo: string) => p.contexto?.find((c) => c.titulo.startsWith(titulo))?.texto ?? "";
function lineas<T = Json>(texto: string): T[] {
  return texto.split("\n").flatMap((l) => {
    try {
      const v = JSON.parse(l);
      return v && typeof v === "object" ? [v as T] : [];
    } catch {
      return [];
    }
  });
}
function jsonDe<T = Json>(texto: string): T | null {
  try {
    return JSON.parse(texto) as T;
  } catch {
    return null;
  }
}
const fechas = (t: string) => [...t.matchAll(RE_FECHA)].map((m) => interpretarFecha(m[1]!)).filter((f): f is string => Boolean(f));
const montos = (t: string) => [...t.matchAll(/\$\s?(\d{1,3}(?:\.\d{3})+)/g)].map((m) => Number(m[1]!.replace(/\./g, "")));
const pesos = (n: number) => `$${n.toLocaleString("es-CO")}`;
const limpiar = (t: string) => t.replace(/\s*\(DEMOSTRACI[ÓO]N[^)]*\)/gi, "").replace(/\s+/g, " ").trim();

/* ─────────────────────────────── Lectura ─────────────────────────────── */

function tipologiaDe(t: string): string {
  if (/PODER ESPECIAL|confiere poder/i.test(t)) return "PODER";
  if (/RELATO DEL CLIENTE/i.test(t)) return "RELATO_CLIENTE";
  if (/^\s*PAGAR[ÉE]\s+No\.|pagar[ée] incondicionalmente/i.test(t)) return "PAGARE";
  if (/CERTIFICADO DE EXISTENCIA/i.test(t)) return "CERTIFICADO_EXISTENCIA";
  if (/requerimiento de pago/i.test(t)) return "REQUERIMIENTO_DE_PAGO";
  if (/MANDAMIENTO DE PAGO/i.test(t)) return "MANDAMIENTO_DE_PAGO";
  if (/\bSENTENCIA\b/.test(t)) return "SENTENCIA";
  if (/\bAUTO\b/.test(t)) return "AUTO";
  if (/\bDEMANDA\b/.test(t)) return "DEMANDA";
  if (/NOTIFICACI[ÓO]N/i.test(t)) return "NOTIFICACION";
  return "OTRO";
}

const RE_ACTOR = /\b(SOCIEDAD FICTICIA [A-ZÁÉÍÓÚÑ]+(?: [A-ZÁÉÍÓÚÑ]+)*? S\.A\.S\.|PERSONA NATURAL FICTICIA|PERSONA FICTICIA [A-ZÁÉÍÓÚÑ]+|JUEZ [A-ZÁÉÍÓÚÑ ]+?(?=\s*\(|\n|$))/g;

function actoresDe(t: string): Array<{ nombre: string; rol: string; identificacion: string | null }> {
  const vistos = new Map<string, { nombre: string; rol: string; identificacion: string | null }>();
  for (const m of t.matchAll(RE_ACTOR)) {
    const nombre = m[1]!.trim();
    if (vistos.has(nombre)) continue;
    const despues = t.slice(m.index! + nombre.length, m.index! + nombre.length + 80);
    const id = /^\s*,?\s*(?:identificad[oa] con\s+)?(?:C\.C\.|NIT)\s*([\d.]+(?:-\d)?)/i.exec(despues)?.[1] ?? null;
    const rol = /^JUEZ/.test(nombre) ? "autoridad destinataria" : /SOCIEDAD/.test(nombre) ? (/pagar[ée]/i.test(t) ? "beneficiaria del título" : "sociedad mencionada") : /NATURAL/.test(nombre) ? (/pagar[ée]/i.test(t) ? "suscriptora del título" : "persona mencionada") : "representante legal";
    vistos.set(nombre, { nombre, rol, identificacion: id ? `${/NIT/i.test(despues.slice(0, 20)) ? "NIT " : "C.C. "}${id}` : null });
  }
  return [...vistos.values()];
}

function leerPagina(n: number, texto: string, visual: boolean) {
  const t = texto.trim();
  const tipologia = tipologiaDe(t);
  const suscripcion = /suscrito[^.]*?(\d{1,2} de [a-záéíóú]+ de \d{4})/i.exec(t)?.[1];
  const fecha = (suscripcion ? interpretarFecha(suscripcion) : null) ?? (tipologia === "CERTIFICADO_EXISTENCIA" ? fechas(t)[0] ?? null : fechas(t)[0] ?? null);
  const titulo = limpiar(t.split("\n").find((l) => l.trim()) ?? "") || null;
  return {
    pagina: n, tipologia, tituloDocumento: titulo, iniciaDocumento: n === 1, fechaDocumento: fecha, fechaTexto: fecha ? null : "Sin fecha legible en el documento",
    actores: actoresDe(t), resumen: t ? `${tipologia.replace(/_/g, " ").toLowerCase().replace(/^./, (x) => x.toUpperCase())}: ${limpiar(t).slice(0, 260)}` : "Página sin texto legible.",
    transcripcion: visual ? t : "", legibilidad: t.length > 80 ? "ALTA" : t ? "MEDIA" : "BAJA", relevancia: "RELEVANTE", origenFisico: visual ? "ESCANEADO" : "ELECTRONICO",
    observaciones: visual && !t ? ["Simulador: no hay transcripción registrada para esta imagen."] : [],
  };
}

/* ──────────────────────────── Consolidación ──────────────────────────── */

interface LecturaVista { archivoId: string; pagina: number; tipologia: string; titulo: string | null; fecha: string | null; actores: Array<{ nombre: string; rol: string; identificacion: string | null }>; resumen: string; transcripcion: string }

function consolidar(p: PeticionEstructurada<unknown>) {
  const ls = lineas<LecturaVista>(bloque(p, "LECTURAS"));
  const texto = (tip: string) => ls.filter((l) => l.tipologia === tip).map((l) => l.transcripcion || l.resumen).join("\n");
  const primera = (tip: string) => ls.find((l) => l.tipologia === tip);
  const sop = (l: LecturaVista | undefined, cita: string | null = null) => (l ? [{ archivoId: l.archivoId, pagina: l.pagina, cita }] : []);
  const pagare = primera("PAGARE");
  const relato = primera("RELATO_CLIENTE");
  const todo = ls.map((l) => l.transcripcion || l.resumen).join("\n");
  const ejecutivo = Boolean(pagare) || /pagar[ée]|letra de cambio|t[íi]tulo valor/i.test(todo);
  const capital = montos(texto("PAGARE") || todo)[0] ?? null;
  const vencimiento = /(?:el|pagar[ée][^.]*?)\s(\d{1,2} de [a-záéíóú]+ de \d{4}),\s*en la ciudad/i.exec(texto("PAGARE"))?.[1] ?? /vencimiento el (\d{1,2} de [a-záéíóú]+ de \d{4})/i.exec(todo)?.[1] ?? null;
  const fVenc = vencimiento ? interpretarFecha(vencimiento) : null;
  const actores = new Map<string, { nombre: string; rol: string; identificacion: string | null; soportes: ReturnType<typeof sop> }>();
  for (const l of ls) for (const a of l.actores) {
    if (/autoridad/.test(a.rol)) continue;
    const x = actores.get(a.nombre) ?? { ...a, soportes: [] };
    if (!x.identificacion && a.identificacion) x.identificacion = a.identificacion;
    x.soportes.push(...sop(l));
    actores.set(a.nombre, x);
  }
  const correo = (nombre: string) => (/NATURAL/.test(nombre) ? /correo electr[óo]nico es ([^\s,.;]+@[^\s,;]+\.[a-z]{2,})/i.exec(todo)?.[1] ?? null : null);
  const partes = [...actores.values()].map((a) => ({
    nombre: a.nombre, identificacion: a.identificacion, tipoPersona: /S\.A\.S\.|LTDA|S\.A\./.test(a.nombre) ? "JURIDICA" as const : "NATURAL" as const,
    calidad: /SOCIEDAD/.test(a.nombre) ? (ejecutivo ? "Acreedora beneficiaria del título" : "Parte") : /NATURAL/.test(a.nombre) ? (ejecutivo ? "Deudora suscriptora del título" : "Parte") : "Representante legal de la acreedora",
    esCliente: /SOCIEDAD/.test(a.nombre), representante: /SOCIEDAD/.test(a.nombre) ? [...actores.keys()].find((k) => /PERSONA FICTICIA/.test(k) && !/NATURAL/.test(k)) ?? null : null,
    apoderado: null, correo: correo(a.nombre), domicilio: /NATURAL/.test(a.nombre) && /domicilio en ([A-ZÁÉÍÓÚ][^.,]+)/.exec(todo) ? /domicilio en ([A-ZÁÉÍÓÚ][^.,]+(?:D\.C\.)?)/.exec(todo)![1]!.trim() : null,
    proteccionEspecial: [], soportes: a.soportes.slice(0, 4),
  }));
  const acreedora = partes.find((x) => x.esCliente)?.nombre ?? "la parte solicitante";
  const deudora = partes.find((x) => /NATURAL/.test(x.nombre))?.nombre ?? "la contraparte";
  const hechos: Array<Json> = [];
  const hecho = (descripcion: string, fecha: string | null, estado: string, soportes: ReturnType<typeof sop>, relevancia: string | null) =>
    hechos.push({ descripcion, fecha, fechaTexto: fecha ? null : "Sin fecha determinada", lugar: /Bogot/.test(todo) ? "Bogotá D.C." : null, modo: null, actores: [], estado, soportes, relevanciaJuridica: relevancia, discrepancias: [] });
  if (pagare) {
    hecho(`El ${pagare.fecha ? fechaLarga(pagare.fecha) : "[fecha no determinada]"} la ${deudora} suscribió a la orden de la ${acreedora} el pagaré No. DEMO-001 por ${capital ? pesos(capital) : "[monto no determinado]"}, con vencimiento el ${fVenc ? fechaLarga(fVenc) : "[fecha no determinada]"}.`, pagare.fecha, "PROBADO_DOCUMENTAL", sop(pagare, "Pagaré No. DEMO-001"), "Título valor base de la ejecución.");
    if (fVenc) hecho(`El ${fechaLarga(fVenc)} se cumplió el vencimiento del pagaré No. DEMO-001.`, fVenc, "PROBADO_DOCUMENTAL", sop(pagare, "Fecha de vencimiento"), "Hace exigible la obligación e inicia el término de prescripción de la acción cambiaria directa.");
  }
  const req = primera("REQUERIMIENTO_DE_PAGO");
  if (req) hecho(`El ${req.fecha ? fechaLarga(req.fecha) : "[fecha no determinada]"} la ${acreedora} requirió por escrito a la ${deudora} el pago del pagaré No. DEMO-001.`, req.fecha, "PROBADO_DOCUMENTAL", sop(req), "Acredita el cobro extrajudicial previo.");
  const certificado = primera("CERTIFICADO_EXISTENCIA");
  if (certificado) hecho(`El ${certificado.fecha ? fechaLarga(certificado.fecha) : "[fecha no determinada]"} se expidió el certificado de existencia y representación legal de la ${acreedora}, con matrícula activa.`, certificado.fecha, "PROBADO_DOCUMENTAL", sop(certificado), "Acredita la existencia y la representación de la demandante.");
  const poder = primera("PODER");
  if (poder) hecho(`El ${poder.fecha ? fechaLarga(poder.fecha) : "[fecha no determinada]"} la ${acreedora}, por medio de su representante legal, confirió poder especial para iniciar el proceso ejecutivo.`, poder.fecha, "PROBADO_DOCUMENTAL", sop(poder), "Habilita la actuación del apoderado.");
  if (relato && /no ha pagado/i.test(texto("RELATO_CLIENTE"))) hecho(`A la fecha del relato, la ${acreedora} afirma que la ${deudora} no ha pagado ninguna suma.`, relato.fecha, "AFIRMADO_POR_CLIENTE", sop(relato), "El no pago se afirma; la carga de probar el pago corresponde a la deudora.");
  if (!hechos.length) for (const l of ls.filter((x) => x.pagina === 1)) hecho(`${l.fecha ? `El ${fechaLarga(l.fecha)} s` : "S"}e expidió el documento «${l.titulo ?? l.tipologia}».`, l.fecha, "PROBADO_DOCUMENTAL", sop(l), null);
  return {
    resumenCaso: ejecutivo ? `La ${acreedora} busca el cobro judicial del pagaré No. DEMO-001 por ${capital ? pesos(capital) : "una suma determinada"}, vencido${fVenc ? ` el ${fechaLarga(fVenc)}` : ""} y no pagado por la ${deudora}.` : "Asunto por calificar a partir de los documentos aportados.",
    area: ejecutivo ? "COMERCIAL" : "CIVIL", areasConcurrentes: ejecutivo ? ["CIVIL"] : [], materia: ejecutivo ? "Títulos valores: cobro de pagaré" : "Por determinar",
    tipoAsunto: ejecutivo ? "Proceso ejecutivo singular por título valor" : "Por determinar", rolCliente: ejecutivo ? "EJECUTANTE" : null,
    objetivoCliente: ejecutivo ? `Obtener el pago del capital${capital ? ` de ${pesos(capital)}` : ""} y de los intereses moratorios del pagaré.` : "Por determinar con el cliente.",
    partes, hechos,
    documentosFaltantes: poder ? [] : [{ descripcion: "Poder especial conferido al apoderado", gravedad: "ALTA", razon: "Sin poder el apoderado actúa sin representación." }],
  };
}

/* ─────────────────────────── Plan y análisis ─────────────────────────── */

interface HechoVista { id: string; n: number; fecha: string | null; descripcion: string; estado: string; soportes: string[] }
interface FuenteVista { id: string; clase: string; identificador: string; titulo: string; autoridad: string; vigencia: string; texto?: string; ratio?: string | null }
interface ProblemaVista { id: string; enunciado: string; tipo: string; hechosDeterminantes: string[] }

const hechosDe = (p: PeticionEstructurada<unknown>) => lineas<HechoVista>(bloque(p, "HECHOS"));
const fuentesDe = (p: PeticionEstructurada<unknown>) => lineas<FuenteVista>(bloque(p, "FUENTES VERIFICADAS"));
const problemasDe = (p: PeticionEstructurada<unknown>) => lineas<ProblemaVista>(bloque(p, "PROBLEMAS"));

function plan(p: PeticionEstructurada<unknown>, o: OpcionesDemostracion) {
  const caso = jsonDe<{ tipoAsunto?: string; objetivoCliente?: string }>(bloque(p, "CASO")) ?? {};
  const hs = hechosDe(p);
  const con = (re: RegExp) => hs.filter((h) => re.test(h.descripcion)).map((h) => h.id);
  const ejecutivo = /ejecutiv/i.test(caso.tipoAsunto ?? "");
  const vetadas = /no pudieron verificarse[^:]*: ([^\n]+)/.exec(p.instruccion)?.[1] ?? "";
  const permitida = (id: string) => !vetadas.includes(id);
  if (!ejecutivo) {
    return {
      problemas: [{ enunciado: `¿Qué actuación procede para ${caso.objetivoCliente ?? "atender la pretensión del cliente"}?`, tipo: "PRINCIPAL", hechosDeterminantes: hs.slice(0, 3).map((h) => h.id) }],
      consultasJurisprudencia: [], normasCandidatas: (o.normasAdicionales ?? []).filter(permitida).map((identificador) => ({ identificador, problema: 0, razon: "Norma propuesta para verificación." })),
      providenciasCandidatas: (o.providenciasCandidatas ?? []).filter(permitida).map((identificador) => ({ identificador, problema: 0, razon: "Precedente propuesto para verificación." })),
      cuerposNormativos: [], derechoFundamentalComprometido: false, proteccionInternaInsuficiente: false, materiasBloque: [], autoridadesConDoctrina: [],
    };
  }
  const normas = [
    { identificador: "Ley 1564 de 2012, art. 422", problema: 0, razon: "Define el título ejecutivo: obligación clara, expresa y exigible." },
    { identificador: "Ley 1564 de 2012, art. 430", problema: 0, razon: "Regula el mandamiento ejecutivo." },
    { identificador: "Código de Comercio, art. 621", problema: 0, razon: "Requisitos generales de los títulos valores." },
    { identificador: "Código de Comercio, art. 709", problema: 0, razon: "Requisitos particulares del pagaré." },
    { identificador: "Código de Comercio, art. 789", problema: 1, razon: "Prescripción de la acción cambiaria directa." },
    ...(o.normasAdicionales ?? []).map((identificador) => ({ identificador, problema: 0, razon: "Norma adicional propuesta para verificación." })),
  ].filter((x) => permitida(x.identificador));
  return {
    problemas: [
      { enunciado: "¿El pagaré aportado reúne los requisitos generales y particulares de los títulos valores y contiene una obligación clara, expresa y exigible que permita librar mandamiento de pago?", tipo: "PRINCIPAL", hechosDeterminantes: con(/suscribió|vencimiento/) },
      { enunciado: "¿Está vigente la acción cambiaria directa frente al término de prescripción de tres años contado desde el vencimiento del título?", tipo: "ASOCIADO", hechosDeterminantes: con(/vencimiento/) },
    ],
    consultasJurisprudencia: [{ problema: 0, consulta: "requisitos del pagaré mérito ejecutivo título valor", corte: "CSJ" }],
    normasCandidatas: normas,
    providenciasCandidatas: (o.providenciasCandidatas ?? []).filter(permitida).map((identificador) => ({ identificador, problema: 0, razon: "Precedente propuesto para verificación." })),
    cuerposNormativos: [
      { nombre: "Código de Comercio (Decreto 410 de 1971)", rol: "APLICABLE", razon: "Regula los títulos valores y el pagaré.", rutaIntegracion: null },
      { nombre: "Código General del Proceso (Ley 1564 de 2012)", rol: "APLICABLE", razon: "Regula el proceso ejecutivo y el mandamiento de pago.", rutaIntegracion: null },
      { nombre: "Estatuto del Consumidor (Ley 1480 de 2011)", rol: "DESCARTADO", razon: "No se acreditó una relación de consumo entre las partes.", rutaIntegracion: null },
    ],
    derechoFundamentalComprometido: false, proteccionInternaInsuficiente: false, materiasBloque: [], autoridadesConDoctrina: [],
  };
}

const fuentesPara = (fs: FuenteVista[], enunciado: string) => {
  const re = /prescrip/i.test(enunciado) ? /789|prescrip/i : /(422|430|621|709)/;
  const seleccion = fs.filter((f) => re.test(f.identificador));
  return seleccion.length ? seleccion : fs.filter((f) => f.clase === "PROVIDENCIA").slice(0, 1);
};

function subsuncion(p: PeticionEstructurada<unknown>) {
  const fs = fuentesDe(p);
  return {
    bloques: problemasDe(p).map((pr) => {
      const sel = fuentesPara(fs, pr.enunciado);
      const prescripcion = /prescrip/i.test(pr.enunciado);
      return {
        problemaId: pr.id,
        regla: sel.length ? `${sel.map((f) => f.identificador).join("; ")}: ${prescripcion ? "la acción cambiaria directa prescribe en tres años desde el vencimiento" : "presta mérito ejecutivo la obligación clara, expresa y exigible que conste en documento proveniente del deudor; el pagaré exige los requisitos generales y particulares de los títulos valores"}.` : "Sin fuente verificada para la regla.",
        fuenteIds: sel.map((f) => f.id), hechoIds: pr.hechosDeterminantes,
        premisaFactica: prescripcion ? "El título venció en la fecha que consta en el documento; la acción se ejerce antes de cumplirse tres años desde entonces." : "El pagaré contiene la promesa incondicional de pagar una suma determinada, a la orden de la acreedora, con fecha cierta de vencimiento, y está firmado por la deudora.",
        conclusion: prescripcion ? "La acción cambiaria directa está vigente a la fecha de corte, siempre que la demanda se presente y notifique a tiempo." : "El pagaré presta mérito ejecutivo y procede solicitar mandamiento de pago por capital e intereses moratorios.",
        etiqueta: sel.length ? "CONCLUSION_CONSOLIDADA" : "DATO_NO_VERIFICADO",
        eslabonMasDebil: prescripcion ? "La fecha de notificación del mandamiento, que determina la interrupción de la prescripción." : "La autenticidad de la firma, que la deudora podría tachar o desconocer en el trámite.",
        figurasDistinguidas: prescripcion ? [{ figura: "Prescripción de la acción cambiaria directa", noSeConfundeCon: "Caducidad", razon: "La prescripción debe alegarse por el demandado; no se declara de oficio." }] : [{ figura: "Acción cambiaria", noSeConfundeCon: "Acción causal", razon: "La cambiaria se funda en el título; la causal, en el negocio subyacente." }],
      };
    }),
    zonasGrises: ["La tasa de interés moratorio aplicable a cada periodo debe liquidarse con la certificación vigente de la Superintendencia Financiera."],
  };
}

/* ─────────────────────────────── Pieza ─────────────────────────────── */

function pieza(p: PeticionEstructurada<unknown>) {
  const componentes = [...p.instruccion.matchAll(/^([a-z_]+): /gm)].map((m) => m[1]!);
  const hs = hechosDe(p).filter((h) => h.estado !== "INFERIDO");
  const fs = fuentesDe(p).filter((f) => f.clase === "NORMA");
  const partes = lineas<{ nombre: string; identificacion: string | null; calidad: string; esCliente: boolean; domicilio: string | null }>(bloque(p, "PARTES"));
  const documentos = lineas<{ anexo: number | null; nombre: string; tipologia: string }>(bloque(p, "DOCUMENTOS"));
  const cliente = partes.find((x) => x.esCliente);
  const contraparte = partes.find((x) => !x.esCliente && /Deudora/.test(x.calidad));
  const pretension = bloque(p, "PRETENSIÓN PRINCIPAL") || "Que se libre mandamiento de pago por las sumas adeudadas.";
  const soportesDe = (h: HechoVista) => h.soportes.map((s) => { const [archivoId, pag] = s.split("#p"); return { archivoId: archivoId!, pagina: Number(pag), cita: null }; });
  const tiene = (id: string) => componentes.includes(id);
  const secciones = [
    { titulo: "Partes", componentes: ["juez", "partes", "apoderado"].filter(tiene), numerarParrafos: false, parrafos: [
      { texto: `Demandante: ${cliente?.nombre ?? "[DEMANDANTE]"}${cliente?.identificacion ? `, identificada con ${cliente.identificacion}` : ""}, representada legalmente según el certificado de existencia y representación que se anexa.`, fuenteIds: [], hechoIds: [], soportes: [] },
      { texto: `Demandada: ${contraparte?.nombre ?? "[DEMANDADA]"}${contraparte?.identificacion ? `, identificada con ${contraparte.identificacion}` : ""}, domiciliada en ${contraparte?.domicilio ?? "[DOMICILIO]"}.`, fuenteIds: [], hechoIds: [], soportes: [] },
    ] },
    { titulo: "Hechos", componentes: ["hechos"].filter(tiene), numerarParrafos: true, parrafos: hs.map((h) => ({ texto: h.descripcion, fuenteIds: [], hechoIds: [h.id], soportes: soportesDe(h) })) },
    { titulo: "Pretensiones", componentes: ["pretensiones"].filter(tiene), numerarParrafos: true, parrafos: [
      { texto: pretension.replace(/\.$/, "") + ".", fuenteIds: [], hechoIds: [], soportes: [] },
      { texto: "Que se condene a la demandada al pago de las costas y agencias en derecho del proceso.", fuenteIds: [], hechoIds: [], soportes: [] },
    ] },
    { titulo: "Fundamentos de derecho", componentes: ["fundamentos_derecho", "titulo"].filter(tiene), numerarParrafos: false, parrafos: fs.length
      ? fs.map((f) => ({ texto: `${f.identificador.replace(/^(.*), art\. (\d+)$/, "El artículo $2 del $1")}: ${(f.texto ?? f.titulo).replace(/^ART[ÍI]CULO \d+\.\s*[^.]*\.\s*/i, "").slice(0, 320)}`, fuenteIds: [f.id], hechoIds: [], soportes: [] }))
      : [{ texto: "Los fundamentos de derecho quedan pendientes de verificación en fuente oficial.", fuenteIds: [], hechoIds: [], soportes: [] }] },
    { titulo: "Pruebas", componentes: ["pruebas"].filter(tiene), numerarParrafos: false, parrafos: [{ texto: `Documentales: ${documentos.filter((d) => d.anexo).map((d) => `anexo ${d.anexo} (${d.tipologia.replace(/_/g, " ").toLowerCase()})`).join("; ") || "las que se anexan"}.`, fuenteIds: [], hechoIds: [], soportes: [] }] },
    { titulo: "Cuantía, competencia y trámite", componentes: ["cuantia"].filter(tiene), numerarParrafos: false, parrafos: [{ texto: "La cuantía corresponde al capital adeudado más los intereses moratorios causados a la fecha de presentación de la demanda. Por la naturaleza del asunto y el domicilio de la demandada, es competente el juez civil municipal del lugar, y el trámite es el del proceso ejecutivo singular.", fuenteIds: [], hechoIds: [], soportes: [] }] },
    { titulo: "Medidas cautelares", componentes: ["envio_simultaneo"].filter(tiene), numerarParrafos: false, parrafos: [{ texto: "En escrito separado se solicitan el embargo y el secuestro de bienes de la demandada, conforme al artículo 599 del Código General del Proceso. Por solicitarse medidas cautelares, no se remite copia previa de la demanda a la demandada.", fuenteIds: [], hechoIds: [], soportes: [] }] },
  ];
  return {
    destinatario: ["Señor(a)", "JUEZ CIVIL MUNICIPAL DE BOGOTÁ D.C. (REPARTO)", "E. S. D."],
    referencia: [{ etiqueta: "Proceso", valor: "Ejecutivo singular" }, { etiqueta: "Demandante", valor: cliente?.nombre ?? "[DEMANDANTE]" }, { etiqueta: "Demandada", valor: contraparte?.nombre ?? "[DEMANDADA]" }],
    asunto: "Demanda ejecutiva con solicitud de medidas cautelares",
    apertura: `[NOMBRE], mayor de edad, identificado(a) con la cédula de ciudadanía [C.C. No.], abogado(a) en ejercicio con tarjeta profesional [T.P. No.], en calidad de apoderado(a) especial de la ${cliente?.nombre ?? "[DEMANDANTE]"}, según el poder que se anexa, formulo DEMANDA EJECUTIVA SINGULAR contra ${contraparte?.nombre ?? "[DEMANDADA]"}, con fundamento en lo siguiente:`,
    secciones, cierre: "Del señor(a) Juez, respetuosamente,",
  };
}

/* ───────────────────────────── Informe ───────────────────────────── */

const seg = (texto: string, fuenteId: string | null = null) => ({ texto, fuenteId });
const par = (segmentos: Array<{ texto: string; fuenteId: string | null }>, hechoIds: string[] = []) => ({ segmentos, hechoIds });

function seccionInforme(p: PeticionEstructurada<unknown>) {
  const i = p.instruccion;
  const caso = jsonDe<{ titulo?: string; resumen?: string; objetivoCliente?: string; tipoAsunto?: string }>(bloque(p, "CASO")) ?? {};
  const fs = fuentesDe(p);
  const vacia = { parrafos: [] as ReturnType<typeof par>[], citas: [] as Array<{ fuenteId: string; fragmento: string; descripcion: string; despuesDelParrafo: number }>, subsecciones: [] as Array<{ titulo: string; parrafos: ReturnType<typeof par>[]; subsecciones: Array<{ titulo: string; parrafos: ReturnType<typeof par>[] }> }> };
  if (i.includes("«I. ANTECEDENTES")) {
    const partes = lineas<{ nombre: string; calidad: string; esCliente: boolean }>(bloque(p, "PARTES"));
    const docs = lineas(bloque(p, "DOCUMENTOS"));
    return { ...vacia, parrafos: [
      par([seg(`Consulta la ${partes.find((x) => x.esCliente)?.nombre ?? "parte interesada"}, en calidad de ${partes.find((x) => x.esCliente)?.calidad.toLowerCase() ?? "cliente"}. ${caso.resumen ?? ""}`)]),
      par([seg(`Su objetivo es ${(caso.objetivoCliente ?? "obtener una solución jurídica").replace(/^Obtener/, "obtener").replace(/\.$/, "")}. Para ello se recibieron y organizaron ${docs.length} documento(s) que conforman el expediente.`)]),
      par([seg("El informe determina los hechos jurídicamente relevantes con su soporte, verifica cada fuente contra su origen oficial, calcula los términos y propone la actuación siguiente. No sustituye el criterio del ABOGADO (USUARIO), quien decide, aprueba y firma.")]),
    ] };
  }
  if (i.includes("«VI. MARCO NORMATIVO")) {
    const problemas = problemasDe(p);
    const art422 = fs.find((f) => /422/.test(f.identificador));
    return {
      parrafos: [par([seg("El caso se gobierna por el régimen de los títulos valores del Código de Comercio y por las reglas del proceso ejecutivo del Código General del Proceso. Cada disposición se verificó en fuente oficial con indicación de su vigencia.")])],
      citas: art422?.texto ? [{ fuenteId: art422.id, fragmento: "Pueden demandarse ejecutivamente las obligaciones expresas, claras y exigibles que consten en documentos que provengan del deudor o de su causante, y constituyan plena prueba contra él", descripcion: "Título ejecutivo", despuesDelParrafo: 0 }] : [],
      subsecciones: problemas.map((pr) => ({
        titulo: /prescrip/i.test(pr.enunciado) ? "Prescripción de la acción cambiaria" : "Mérito ejecutivo del pagaré",
        parrafos: fuentesPara(fs.filter((f) => f.clase !== "PROVIDENCIA"), pr.enunciado).map((f) => par([seg(`${f.identificador} (vigencia: ${f.vigencia.toLowerCase().replace(/_/g, " ")}) dispone: `, null), seg(`«${(f.texto ?? f.titulo).replace(/^ART[ÍI]CULO \d+\.\s*[^.]*\.\s*/i, "").slice(0, 240).trim()}»`, f.id)])),
        subsecciones: [],
      })),
    };
  }
  if (i.includes("«VII. PRECEDENTE")) {
    const ps = fs.filter((f) => f.clase === "PROVIDENCIA");
    return { ...vacia, parrafos: ps.length ? ps.map((f) => par([seg(`La ${f.autoridad}, en la providencia ${f.identificador}, `), seg(`fijó una regla pertinente para el caso${f.ratio ? `: ${f.ratio}` : ""}.`, f.id)])) : [par([seg("No se verificó en fuente oficial precedente judicial específico para los problemas planteados. El vacío se declara expresamente y no se suple con memoria; el fundamento descansa en las normas verificadas.")])] };
  }
  if (i.includes("«VIII. ANÁLISIS")) {
    const analisis = jsonDe<{ subsuncion?: Array<{ problemaId: string; regla: string; fuenteIds: string[]; hechoIds: string[]; premisaFactica: string; conclusion: string; eslabonMasDebil: string | null }> }>(bloque(p, "ANÁLISIS")) ?? {};
    const problemas = problemasDe(p);
    return { ...vacia, parrafos: [par([seg("El análisis conecta cada hecho soportado con la regla verificada que lo gobierna y expresa el grado de confianza de cada conclusión.")])],
      subsecciones: (analisis.subsuncion ?? []).map((b) => ({
        titulo: problemas.find((x) => x.id === b.problemaId)?.enunciado.slice(0, 90) ?? "Problema",
        parrafos: [par([seg("Regla: "), seg(b.regla, b.fuenteIds[0] ?? null)]), par([seg(`Hechos: ${b.premisaFactica}`)], b.hechoIds), par([seg(`Conclusión: ${b.conclusion}${b.eslabonMasDebil ? ` El eslabón más débil es ${b.eslabonMasDebil.charAt(0).toLowerCase()}${b.eslabonMasDebil.slice(1)}` : ""}`)])],
        subsecciones: [],
      })) };
  }
  if (i.includes("«XI. MECANISMOS")) {
    const e = jsonDe<{ viaPrincipal?: string; requisitosPrevios?: string[]; rutaTemporal?: string }>(bloque(p, "ESTRATEGIA")) ?? {};
    const a = jsonDe<{ masc?: { recomendacion?: string; puntaje?: number } | null }>(bloque(p, "ANÁLISIS")) ?? {};
    return { ...vacia, parrafos: [
      par([seg(`Sobre los mecanismos alternativos: ${a.masc?.recomendacion ?? "no se evaluaron."}`)]),
      par([seg(`La vía principal recomendada es ${e.viaPrincipal ?? "la que resulte del árbol de decisión"}.${e.requisitosPrevios?.length ? ` Antes de actuar deben cumplirse: ${e.requisitosPrevios.join("; ")}.` : ""}`)]),
      par([seg(`Ruta temporal: ${e.rutaTemporal ?? "sin términos que la condicionen."}`)]),
    ] };
  }
  return vacia;
}

function metadatos(p: PeticionEstructurada<unknown>) {
  const caso = jsonDe<{ resumen?: string; tipoAsunto?: string }>(bloque(p, "CASO")) ?? {};
  const fs = fuentesDe(p);
  const ejecutivo = /ejecutiv/i.test(caso.tipoAsunto ?? "");
  const f422 = fs.find((f) => /422/.test(f.identificador))?.id ?? null;
  const f789 = fs.find((f) => /789/.test(f.identificador))?.id ?? null;
  return {
    titulo: ejecutivo ? "Cobro ejecutivo de un pagaré vencido: mérito ejecutivo, prescripción y ruta procesal" : "Informe técnico del expediente",
    subtitulo: "Análisis de hecho y de derecho con fuentes verificadas y actuación siguiente",
    resumen: `${caso.resumen ?? "Se analiza el expediente recibido."} El informe reconstruye los hechos con su soporte documental, verifica cada norma en fuente oficial con su estado de vigencia, examina el mérito ejecutivo del título y el término de prescripción de la acción cambiaria, evalúa los riesgos procesales y los mecanismos alternativos, y propone como actuación siguiente la demanda ejecutiva con solicitud de medidas cautelares. Cada afirmación queda trazada a su hecho, documento, página y fuente, con etiqueta de confianza, y las ausencias de información se declaran en lugar de suplirse. La decisión final, la aprobación y la firma corresponden al abogado responsable, que revisa el borrador de la pieza y este informe antes de cualquier radicación.`,
    palabrasClave: ejecutivo ? ["proceso ejecutivo", "pagaré", "título valor", "prescripción cambiaria", "medidas cautelares", "trazabilidad"] : ["informe técnico", "análisis jurídico", "trazabilidad"],
    introduccion: [par([seg("Este informe presenta el resultado del procesamiento integral del expediente: recepción, lectura, organización, investigación en fuentes oficiales, análisis y estrategia.")]), par([seg("Su propósito es ofrecer al abogado responsable una base verificable para decidir la actuación siguiente, con cada fuente y cada hecho identificados.")])],
    conclusiones: ejecutivo
      ? [par([seg("Primera: el pagaré reúne, en principio, los requisitos para prestar mérito ejecutivo", f422), seg(", sujeto a la verificación del original por el abogado responsable.")]), par([seg("Segunda: la acción cambiaria directa está vigente a la fecha de corte", f789), seg("; la demanda debe presentarse y notificarse antes del vencimiento del término.")]), par([seg("Tercera: se recomienda la demanda ejecutiva singular con solicitud de medidas cautelares, cuyo borrador se entrega para revisión.")])]
      : [par([seg("Primera: el análisis debe completarse con la información pendiente señalada en el informe.")])],
  };
}

/* ───────────────────────────── Registro ───────────────────────────── */

export function crearLlmDemostracion(o: OpcionesDemostracion = {}): LlmSimulado {
  const transcripciones = o.transcripciones ?? {};
  const manejadores: Record<string, ManejadorSimulado> = {
    lectura: (p) => {
      const cuerpo = p.instruccion.split(/\n(?:Continuidad:|Reglas de lectura:)/)[0]!;
      return {
        paginas: [...cuerpo.matchAll(/=== PÁGINA (\d+) \((TEXTO|VISUAL)\)(?:: imagen adjunta n\.º (\d+))? ===\n?([\s\S]*?)(?=\n=== PÁGINA |$)/g)].map((m) => {
          const visual = m[2] === "VISUAL";
          const adjunto = visual ? p.adjuntos?.[Number(m[3]) - 1] : undefined;
          const texto = visual ? (adjunto ? transcripciones[createHash("sha256").update(Buffer.from(adjunto.base64, "base64")).digest("hex")] ?? transcripciones["*"] ?? "" : "") : m[4] ?? "";
          return leerPagina(Number(m[1]), texto, visual);
        }),
      };
    },
    consolidacion: consolidar,
    planificacion: (p) => plan(p, o),
    ficha: (p) => {
      const hallazgos = jsonDe<Array<{ salida: string }>>(bloque(p, "HALLAZGOS")) ?? [];
      const candidatas = jsonDe<Array<{ identificador: string; problema: number }>>(bloque(p, "CANDIDATAS")) ?? [];
      const encontradas = hallazgos.flatMap((h) => (jsonDe<Array<{ identificador?: string; titulo?: string; url?: string | null }>>(h.salida) ?? []).filter((x) => x && typeof x === "object"))
        .flatMap((x) => extraerCitas(`${x.identificador ?? ""} ${x.titulo ?? ""}`).filter((c) => c.clase.startsWith("PROVIDENCIA")).map((c) => ({ c, url: x.url ?? null })));
      const todas = [...encontradas.map((e) => ({ identificador: e.c.identificador, url: e.url, problema: 0 })), ...candidatas.map((c) => ({ identificador: c.identificador, url: null, problema: c.problema }))];
      const unicas = [...new Map(todas.map((x) => [x.identificador, x])).values()];
      return {
        providencias: unicas.map((x) => ({ identificador: x.identificador, autoridad: /^(C|T|SU|A)-/.test(x.identificador) ? "CC" : "CSJ", tipo: x.identificador.split("-")[0] ?? "T", fecha: null, url: x.url, problema: x.problema, esUnificacion: /^SU-/.test(x.identificador), ratio: null, hechosDeterminantes: null, razonPertinencia: "Hallada en la investigación o propuesta en el plan." })),
        vacios: unicas.length ? [] : ["No se halló precedente verificable para el problema principal en las fuentes consultadas."],
      };
    },
    analogia: (p) => ({ evaluaciones: fuentesDe(p).filter((f) => f.clase === "PROVIDENCIA").map((f) => ({ fuenteId: f.id, nivel: "MEDIA", similitud: 0.6, ratio: f.ratio ?? null, esRatioDecidendi: true, coincidencias: ["Se discute el mérito ejecutivo de un título."], divergencias: ["Las partes, las fechas y los montos son distintos."], distincion: null })) }),
    analisis: subsuncion,
    terminos: (p) => {
      const catalogo = lineas<{ id: string }>(bloque(p, "CATÁLOGO"));
      const venc = hechosDe(p).find((h) => /vencimiento/.test(h.descripcion) && h.fecha);
      return { terminos: catalogo.some((c) => c.id === "cambiaria_directa") && venc ? [{ catalogoId: "cambiaria_directa", fechaEvento: venc.fecha, fechaEventoHasta: null, soporte: `Pagaré No. DEMO-001, fecha de vencimiento (${venc.soportes[0] ?? "expediente"})`, fechaProvisional: false, razon: "La acción cambiaria directa prescribe desde el vencimiento del título." }] : [], observaciones: [] };
    },
    nulidades: () => ({ aplica: false, razon: "No hay actuación judicial.", respuestas: [1, 2, 3, 4, 5, 6, 7, 8].map((numeral) => ({ numeral, indicio: "NO", soporte: null, observacion: null, saneada: null })) }),
    tutela: () => ({ derechos: [], aplica: false, legitimacionActiva: { cumple: null, razon: "No aplica." }, legitimacionPasiva: { cumple: null, razon: "No aplica." }, mesesDesdeElHecho: null, vulneracionContinuada: false, justificacionDemora: null, existeOtroMedio: true, medioEsEficaz: true, perjuicio: { inminente: false, urgente: false, grave: false, impostergable: false }, contraProvidenciaJudicial: false, tutelaPreviaMismosHechos: false, viaOrdinaria: "Proceso ejecutivo" }),
    competencia: (p) => {
      const valor = montos(bloque(p, "HECHOS"))[0] ?? null;
      return { asunto: "EJECUTIVO", valor, anio: Number(/\((\d{4})/.exec(p.instruccion)?.[1] ?? new Date().getUTCFullYear()), calculoValor: valor ? `Capital de ${pesos(valor)}; los intereses moratorios causados se liquidan a la fecha de la demanda.` : "Sin monto determinado.", domicilioDemandado: "Bogotá D.C.", lugarCumplimiento: "Bogotá D.C.", ubicacionInmueble: null, ultimoDomicilioCausante: null, domicilioMenor: null, lugarPrestacionServicio: null, entidadPublicaDemandada: null, lugarVulneracion: null, involucraNNA: false, irregularidades: [] };
    },
    prueba: (p) => ({ filas: hechosDe(p).map((h) => {
      const afirmado = h.estado === "AFIRMADO_POR_CLIENTE";
      const [archivoId, pag] = (h.soportes[0] ?? "").split("#p");
      return { hechoId: h.id, medio: afirmado ? "Relato del cliente" : "Documento del expediente", soporte: archivoId && pag ? { archivoId, pagina: Number(pag), cita: null } : null, pertinencia: "ALTA", conducencia: afirmado ? "BAJA" : "ALTA", utilidad: afirmado ? "MEDIA" : "ALTA", licitud: "LICITA", riesgoTacha: afirmado ? null : "Desconocimiento o tacha del documento por la contraparte.", vacio: afirmado, gestionSugerida: afirmado ? "Aportar certificación contable o extractos que acrediten la ausencia de pagos, o solicitar interrogatorio de parte." : null };
    }) }),
    trampas: () => ({ via: "DEMANDA_EJECUTIVA", asuntoConciliable: true, pideMedidasCautelares: true, demandadoEntidadPublica: false, asuntoLaboralOPensional: false, querellable: false, tieneSentenciaOSeguirAdelante: false, cargaPendiente: null, otras: [{ titulo: "Custodia del original del título", detalle: "El despacho puede requerir la exhibición del original del pagaré: debe conservarse en custodia y disponible.", gravedad: "MEDIA", fundamento: null }] }),
    masc: () => ({ asunto: "Cobro de pagaré", derechosCiertosEIndiscutibles: false, estadoCivil: false, delitoNoQuerellable: false, relacionAPreservar: 0.3, cuantiaFrenteACosto: 0.3, debilidadProbatoriaPropia: 0.2, duracionEstimadaProceso: 0.6, disposicionManifestada: 0.2, obstaculoNoNegociable: false, razones: ["No hay relación comercial que preservar.", "La prueba documental es sólida.", "La deudora no respondió al requerimiento."] }),
    estrategia: (p) => {
      const venc = hechosDe(p).find((h) => /vencimiento/.test(h.descripcion) && h.fecha)?.fecha;
      const mora = venc ? fechaLarga(new Date(Date.parse(`${venc}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) : "[fecha de mora]";
      return { etapa: "SIN_PROCESO", autoApelable: false, otroMedioEficaz: null, interesColectivo: false, grupoPlural: false, tituloEjecutivo: true, actoAdministrativoParticular: false, recursosAdministrativosEnTermino: false, danoAntijuridicoEstatal: false, incumplimientoNormaOActo: false, renuenciaConstituida: false, peticionSinRespuesta: false, requiereReclamacionPrevia: false, conductaPenal: false, perturbacionPosesion: false, relacionConsumo: false, reclamacionConsumoAgotada: false, servicioPublicoDomiciliario: false, destinatario: "Juez Civil Municipal de Bogotá D.C. (reparto)", objetivo: "obtener mandamiento de pago por el capital y los intereses moratorios del pagaré", pretensionPrincipal: `Que se libre mandamiento de pago a favor de la demandante y en contra de la demandada por el capital del pagaré No. DEMO-001, más los intereses moratorios liquidados desde el ${mora} hasta el pago total` };
    },
    redaccion_pieza: pieza,
    contradictor: () => ({ ataques: [
      { descripcion: "Excepción de prescripción de la acción cambiaria directa.", tipo: "MERITO", severidad: "ALTA", resiste: "SI", replica: "La demanda se presenta antes de cumplirse tres años desde el vencimiento; la notificación oportuna del mandamiento interrumpe el término." },
      { descripcion: "Tacha o desconocimiento de la firma del pagaré.", tipo: "PROBATORIO", severidad: "ALTA", resiste: "PARCIAL", replica: "Si se propone, solicitar el cotejo o dictamen grafológico y la exhibición del original." },
      { descripcion: "Alegación de pagos parciales no reconocidos por la acreedora.", tipo: "MERITO", severidad: "MEDIA", resiste: "NO", replica: null },
    ] }),
    redaccion_informe: (p) => (p.nombreEsquema === "MetadatosInforme" ? metadatos(p) : seccionInforme(p)),
    sesgo: () => ({ checklist: [
      { pregunta: "¿Se valoran con el mismo estándar las pruebas de ambas partes?", respuesta: "Sí: la matriz probatoria marca como vacío el no pago afirmado por la acreedora." },
      { pregunta: "¿Hay lenguaje estereotipado?", respuesta: "No se identificó." },
      { pregunta: "¿Se consideraron sujetos de especial protección?", respuesta: "No se identificaron en el expediente." },
      { pregunta: "¿Alguna inferencia descansa en generalizaciones sobre grupos?", respuesta: "No." },
      { pregunta: "¿El relato del cliente se trata como hecho sin soporte?", respuesta: "No: se etiqueta como afirmado por el cliente." },
      { pregunta: "¿Se omitió alguna vía favorable a la parte más débil?", respuesta: "No aplica: no hay asimetría de protección identificada." },
    ], observaciones: [] }),
    habilitacion: (p) => {
      const t = bloque(p, "PODER");
      const existe = /confiere poder|otorgo poder|poder especial/i.test(t);
      return { existe, poderdante: /^(.+?), en calidad de representante/m.exec(t)?.[1] ?? null, apoderado: /al abogado ([^,]+)/.exec(t)?.[1] ?? null, facultadesExpresas: ["recibir", "transigir", "conciliar", "desistir", "sustituir", "reasumir", "allanarse"].filter((f) => new RegExp(`\\b${f}\\b`, "i").test(t)), correoApoderado: /apoderado:\s*([^\s]+@[^\s]+?)\.?(?:\s|$)/i.exec(t)?.[1] ?? null, porMensajeDeDatos: /mensaje de datos/i.test(t) ? true : null, objeto: existe ? "Iniciar y llevar hasta su terminación el proceso ejecutivo." : null };
    },
    retroalimentacion: (p) => ({ correcciones: (jsonDe<Array<{ texto: string; seccion?: string | null }>>(bloque(p, "OBSERVACIONES")) ?? []).map((o) => {
      const tipo = /cita|sentencia|norma/i.test(o.texto) ? "CITA_INCORRECTA" : /hecho/i.test(o.texto) ? "HECHO_MAL_ESTABLECIDO" : /pretensi/i.test(o.texto) ? "OMISION_DE_PRETENSION" : /estilo|redacci|forma/i.test(o.texto) ? "ESTILO" : "DESACIERTO_DE_ESTRATEGIA";
      return { tipo, clase: tipo === "ESTILO" ? "ESTILO" : "ERROR", generalizable: true, descripcion: o.texto, seccionAfectada: o.seccion ?? null, leccion: `Verificar antes de entregar: ${o.texto.replace(/\.$/, "")}.` };
    }) }),
    anonimizacion: (p) => ({ lecciones: bloque(p, "LECCIONES").split("\n").filter(Boolean).map((l) => ({ tipo: "ERROR_FRECUENTE", area: null, clave: l.slice(0, 80), leccion: l })) }),
  };
  const guiones: Record<string, GuionAgente> = {
    investigacion: async (p, usar) => {
      const consultas = jsonDe<Array<{ consulta: string; corte: string }>>(bloque(p, "CONSULTAS")) ?? [];
      const hallados: string[] = [];
      for (const c of consultas) {
        hallados.push(await usar("buscar_repositorio", { consulta: c.consulta }));
        if (p.herramientas.some((h) => h.nombre === "buscar_fuente_oficial")) hallados.push(await usar("buscar_fuente_oficial", { consulta: c.consulta, corte: c.corte }));
      }
      const con = hallados.filter((h) => h.length > 2 && h !== "[]").length;
      return con ? `Se consultaron el repositorio y las fuentes oficiales para ${consultas.length} consulta(s); ${con} devolvieron resultados.` : "Se consultaron el repositorio y las fuentes oficiales; no se hallaron providencias verificables para los problemas planteados.";
    },
  };
  return new LlmSimulado(manejadores, guiones);
}
