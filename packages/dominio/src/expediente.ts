import { z } from "zod";
import { FechaISO, InstanteISO } from "./comunes";

/* ────────────────────────────────────────────────────────────────────────────
 * Vocabulario del dominio. El sistema sirve para CUALQUIER proceso del
 * ordenamiento jurídico colombiano: no hay catálogo cerrado de materias ni
 * límite de cuantía propio de un consultorio. Quien dirige el sistema y
 * audita cada salida es el ABOGADO (USUARIO).
 * ──────────────────────────────────────────────────────────────────────────── */

export const AreaDerecho = z.enum([
  "CIVIL", "COMERCIAL", "FAMILIA", "LABORAL", "SEGURIDAD_SOCIAL", "ADMINISTRATIVO", "CONSTITUCIONAL",
  "PENAL", "POLICIVO", "TRIBUTARIO", "CONSUMIDOR", "SERVICIOS_PUBLICOS", "AGRARIO", "INSOLVENCIA",
  "SOCIETARIO", "DISCIPLINARIO", "CONTRATACION_ESTATAL", "PROPIEDAD_INTELECTUAL", "OTRO",
]);
export type AreaDerecho = z.infer<typeof AreaDerecho>;

export const RolCliente = z.enum([
  "DEMANDANTE", "DEMANDADO", "ACCIONANTE", "ACCIONADO", "EJECUTANTE", "EJECUTADO", "VICTIMA", "INDICIADO",
  "PETICIONARIO", "CONVOCANTE", "CONVOCADO", "QUERELLANTE", "QUERELLADO", "TERCERO", "CONSULTA_PREVENTIVA", "NEUTRAL",
]);
export type RolCliente = z.infer<typeof RolCliente>;

/** Estado de un hecho según su respaldo (regla de oro: no se disfraza un relato de hecho probado). */
export const EstadoHecho = z.enum([
  "PROBADO_DOCUMENTAL",        // documento del expediente lo respalda (con folio)
  "ACREDITADO_FUENTE_OFICIAL", // consulta oficial (Croma) lo acredita, con procedencia
  "AFIRMADO_POR_CLIENTE",      // solo consta en el relato del cliente
  "INFERIDO",                  // inferencia razonable, con premisas explícitas
  "CONTROVERTIDO",             // fuentes del expediente se contradicen
  "DESCONOCIDO",
]);
export type EstadoHecho = z.infer<typeof EstadoHecho>;

/** Módulo 23 · taxonomía corta y estable de confianza. */
export const EtiquetaConfianza = z.enum([
  "HECHO_PROBADO", "HECHO_OFICIAL", "HECHO_AFIRMADO", "INFERENCIA_RAZONABLE",
  "CONCLUSION_CONSOLIDADA", "CONCLUSION_DISCUTIBLE", "DATO_NO_VERIFICADO",
]);
export type EtiquetaConfianza = z.infer<typeof EtiquetaConfianza>;

/** ¿Existe la fuente y con qué evidencia se resolvió? (Módulos 1, 4 y 21). */
export const EstadoResolucion = z.enum([
  "TEXTO_OFICIAL",          // texto obtenido de la fuente oficial (directa o vía Croma)
  "EXISTENCIA_CONFIRMADA",  // la fuente oficial confirma el identificador, sin texto completo
  "REPOSITORIO",            // ficha verificada del repositorio local (sujeta a frescura)
  "APORTADA_POR_ABOGADO",   // el ABOGADO (USUARIO) aportó texto o enlace y respondió por ello
  "NO_RESUELTA",
]);
export type EstadoResolucion = z.infer<typeof EstadoResolucion>;

/** Módulo 4 · estados de vigencia. NO_VERIFICADA nunca equivale a VIGENTE. */
export const EstadoVigencia = z.enum([
  "VIGENTE", "VIGENTE_CONDICIONADA", "DEROGADA", "INEXEQUIBLE", "NO_VERIFICADA", "NO_APLICA",
]);
export type EstadoVigencia = z.infer<typeof EstadoVigencia>;

/** Módulo 2 · escala de fuerza vinculante (doctrina probable derogada por la Ley 2430 de 2024). */
export const NivelVinculante = z.enum([
  "VINCULANTE_ERGA_OMNES", "PRECEDENTE_REFORZADO", "PRECEDENTE_VINCULANTE", "PRECEDENTE_HORIZONTAL",
  "PERSUASIVO", "NO_VINCULANTE",
]);
export type NivelVinculante = z.infer<typeof NivelVinculante>;

export const Gravedad = z.enum(["BLOQUEANTE", "ALTA", "MEDIA", "BAJA", "INFORMATIVA"]);
export type Gravedad = z.infer<typeof Gravedad>;

/** Catálogo de piezas que el sistema puede producir como "actuación siguiente". */
export const TipoPieza = z.enum([
  "DEMANDA_VERBAL", "DEMANDA_VERBAL_SUMARIA", "DEMANDA_EJECUTIVA", "DEMANDA_LABORAL_ORDINARIA",
  "DEMANDA_CONTENCIOSA_ADMINISTRATIVA", "DEMANDA_FAMILIA", "CONTESTACION_DEMANDA", "EXCEPCIONES_EJECUCION",
  "RECURSO_REPOSICION", "RECURSO_APELACION", "RECURSO_REPOSICION_SUBSIDIO_APELACION", "ACCION_TUTELA",
  "IMPUGNACION_TUTELA", "INCIDENTE_DESACATO", "DERECHO_PETICION", "RECURSO_ADMINISTRATIVO",
  "SOLICITUD_CONCILIACION", "SOLICITUD_NULIDAD", "MEMORIAL_IMPULSO_PROCESAL", "QUERELLA_POLICIVA",
  "DENUNCIA_PENAL", "DEMANDA_PROTECCION_CONSUMIDOR", "RECLAMACION_SERVICIOS_PUBLICOS", "ACCION_POPULAR",
  "ACCION_GRUPO", "ACCION_CUMPLIMIENTO", "ALEGATOS_CONCLUSION", "MEMORIAL_GENERICO",
]);
export type TipoPieza = z.infer<typeof TipoPieza>;

/* ──────────────────────────── Documentos ──────────────────────────── */

/** Ubicación exacta de un respaldo: el documento y la página. */
export const Soporte = z.object({
  archivoId: z.string(),
  pagina: z.number().int().positive(),
  piezaId: z.string().nullable().default(null),
  cita: z.string().nullable().default(null),
});
export type Soporte = z.infer<typeof Soporte>;

export const EstadoArchivo = z.enum([
  "RECIBIDO", "DUPLICADO", "CIFRADO_BLOQUEADO", "DESCIFRADO", "NO_SOPORTADO", "LEIDO", "ERROR",
]);

export const ArchivoOriginal = z.object({
  id: z.string(),
  nombreOriginal: z.string(),
  rutaRelativa: z.string(),
  blobId: z.string(),
  sha256: z.string(),
  bytes: z.number().int().nonnegative(),
  mime: z.string(),
  recibidoEn: InstanteISO,
  estado: EstadoArchivo,
  duplicadoDe: z.string().nullable().default(null),
  /** PDF canónico (descifrado o convertido desde DOCX/imagen) sobre el que se lee y se divide. */
  pdfCanonicoBlobId: z.string().nullable().default(null),
  paginas: z.number().int().nonnegative().default(0),
  /** El original cifrado se conserva siempre (nunca se descarta sin rastro). */
  originalCifradoBlobId: z.string().nullable().default(null),
  notas: z.array(z.string()).default([]),
});
export type ArchivoOriginal = z.infer<typeof ArchivoOriginal>;

export const Legibilidad = z.enum(["ALTA", "MEDIA", "BAJA", "ILEGIBLE"]);

export const Actor = z.object({
  nombre: z.string(),
  rol: z.string(),
  identificacion: z.string().nullable().default(null),
});

/** Fase 2 · lectura íntegra de cada página (texto embebido o lectura visual). */
export const LecturaPagina = z.object({
  archivoId: z.string(),
  pagina: z.number().int().positive(),
  metodo: z.enum(["TEXTO_EMBEBIDO", "LECTURA_VISUAL"]),
  tipologia: z.string(),
  tituloDocumento: z.string().nullable().default(null),
  iniciaDocumento: z.boolean(),
  fechaDocumento: FechaISO.nullable().default(null),
  fechaTexto: z.string().nullable().default(null),
  actores: z.array(Actor).default([]),
  resumen: z.string(),
  transcripcion: z.string(),
  legibilidad: Legibilidad,
  relevancia: z.enum(["RELEVANTE", "POSIBLEMENTE_AJENO"]).default("RELEVANTE"),
  observaciones: z.array(z.string()).default([]),
});
export type LecturaPagina = z.infer<typeof LecturaPagina>;

/** Fase 3 · documento lógico ya dividido, renombrado y ordenado (con número de anexo estable). */
export const PiezaDocumental = z.object({
  id: z.string(),
  orden: z.number().int().nonnegative(),
  anexo: z.number().int().positive().nullable().default(null),
  tipologia: z.string(),
  contenido: z.string(),
  fecha: FechaISO.nullable().default(null),
  nombreArchivo: z.string(),
  archivoId: z.string(),
  paginaInicio: z.number().int().positive(),
  paginaFin: z.number().int().positive(),
  paginas: z.number().int().positive(),
  blobId: z.string().nullable().default(null),
  sha256: z.string().nullable().default(null),
  estado: z.enum(["ORGANIZADO", "DUPLICADO", "NO_RELACIONADO"]),
  duplicadoDe: z.string().nullable().default(null),
  puertaDeEntrada: z.boolean().default(false),
  legibilidad: Legibilidad,
  origenFisico: z.enum(["ESCANEADO", "ELECTRONICO", "FOTOGRAFIA", "DESCONOCIDO"]).default("DESCONOCIDO"),
  resumen: z.string().default(""),
});
export type PiezaDocumental = z.infer<typeof PiezaDocumental>;

/* ──────────────────────── Módulo 29 · entidades ──────────────────────── */

export const TipoEntidad = z.enum([
  "PERSONA", "ORGANIZACION", "AUTORIDAD", "FECHA", "MONTO", "BIEN", "RADICADO", "CEDULA", "NIT",
  "CORREO", "TELEFONO", "DIRECCION", "PLACA", "MATRICULA_INMOBILIARIA", "CUFE", "OTRO",
]);
export type TipoEntidad = z.infer<typeof TipoEntidad>;

export const Entidad = z.object({
  id: z.string(),
  tipo: TipoEntidad,
  valor: z.string(),
  normalizado: z.string(),
  atributos: z.record(z.string(), z.string()).default({}),
  soportes: z.array(Soporte).default([]),
  confianza: z.number().min(0).max(1),
  /** Crítica: gobierna términos o cuantía; exige confirmación humana antes de sustentar un cálculo definitivo. */
  critica: z.boolean().default(false),
  verificacion: z.enum(["PROVISIONAL", "CONFIRMADA_ABOGADO", "CORREGIDA_ABOGADO"]).default("PROVISIONAL"),
  extractor: z.enum(["REGLA", "IA", "ABOGADO"]),
});
export type Entidad = z.infer<typeof Entidad>;

/* ──────────────────────────── Partes y hechos ──────────────────────────── */

export const SujetoEspecialProteccion = z.enum([
  "NNA", "PERSONA_MAYOR", "DISCAPACIDAD", "MUJER_VICTIMA_VIOLENCIA", "MUJER_CABEZA_FAMILIA", "VICTIMA_CONFLICTO",
  "PERTENENCIA_ETNICA", "MIGRANTE", "POBREZA_EXTREMA", "SALUD_CATASTROFICA",
]);

export const Parte = z.object({
  id: z.string(),
  nombre: z.string(),
  identificacion: z.string().nullable().default(null),
  tipoPersona: z.enum(["NATURAL", "JURIDICA", "ENTIDAD_PUBLICA", "DESCONOCIDO"]),
  calidad: z.string(),
  esCliente: z.boolean(),
  representante: z.string().nullable().default(null),
  apoderado: z.string().nullable().default(null),
  correo: z.string().nullable().default(null),
  domicilio: z.string().nullable().default(null),
  proteccionEspecial: z.array(SujetoEspecialProteccion).default([]),
  soportes: z.array(Soporte).default([]),
});
export type Parte = z.infer<typeof Parte>;

export const Discrepancia = z.object({
  descripcion: z.string(),
  versiones: z.array(z.object({ texto: z.string(), soporte: Soporte.nullable() })),
  resolucion: z.string(),
  criterio: z.string(),
});

/** Hecho en modo, tiempo y lugar: solo hechos; las calificaciones van en los fundamentos. */
export const Hecho = z.object({
  id: z.string(),
  numero: z.number().int().positive(),
  descripcion: z.string(),
  fecha: FechaISO.nullable().default(null),
  fechaTexto: z.string().nullable().default(null),
  lugar: z.string().nullable().default(null),
  modo: z.string().nullable().default(null),
  actores: z.array(z.string()).default([]),
  estado: EstadoHecho,
  soportes: z.array(Soporte).default([]),
  procedencias: z.array(z.string()).default([]),
  relevanciaJuridica: z.string().nullable().default(null),
  discrepancias: z.array(Discrepancia).default([]),
});
export type Hecho = z.infer<typeof Hecho>;

export const ProblemaJuridico = z.object({
  id: z.string(),
  enunciado: z.string(),
  tipo: z.enum(["PRINCIPAL", "ASOCIADO"]),
  hechosDeterminantes: z.array(z.string()).default([]),
});
export type ProblemaJuridico = z.infer<typeof ProblemaJuridico>;

/** Módulo 3 · cuerpos normativos considerados, incluidos los descartados. */
export const CuerpoNormativo = z.object({
  id: z.string(),
  nombre: z.string(),
  rol: z.enum(["APLICABLE", "CONCURRENTE", "SUPLETORIO", "DESCARTADO"]),
  razon: z.string(),
  rutaIntegracion: z.string().nullable().default(null),
});
export type CuerpoNormativo = z.infer<typeof CuerpoNormativo>;

/* ──────────────────── Fuentes, procedencia y citas ──────────────────── */

/** Registro inmutable de toda consulta externa: qué se consultó, cuándo, para qué y con qué resultado. */
export const Procedencia = z.object({
  id: z.string(),
  tipo: z.enum(["CROMA", "HTTP_OFICIAL", "REPOSITORIO", "ABOGADO", "SIMULADO"]),
  herramienta: z.string().nullable().default(null),
  capacidad: z.string().nullable().default(null),
  argumentos: z.unknown().optional(),
  url: z.string().nullable().default(null),
  consultadoEn: InstanteISO,
  finalidad: z.string(),
  estado: z.enum(["OK", "SIN_RESULTADOS", "PENDIENTE", "ERROR"]),
  hashResultado: z.string().nullable().default(null),
  blobResultadoId: z.string().nullable().default(null),
  resumen: z.string().nullable().default(null),
  latenciaMs: z.number().nonnegative().default(0),
  error: z.string().nullable().default(null),
});
export type Procedencia = z.infer<typeof Procedencia>;

export const ClaseFuente = z.enum(["NORMA", "PROVIDENCIA", "CONCEPTO", "TRATADO", "DOCTRINA"]);
export type ClaseFuente = z.infer<typeof ClaseFuente>;

export const Analogia = z.object({
  nivel: z.enum(["ALTA", "MEDIA", "BAJA"]),
  coincidencias: z.array(z.string()),
  divergencias: z.array(z.string()),
  distincion: z.string().nullable().default(null),
  decisionAbogado: z.enum(["CONFIRMADA", "RECHAZADA"]).nullable().default(null),
});

/** Fuente verificada que puede sustentar el informe o la pieza. */
export const Fuente = z.object({
  id: z.string(),
  clase: ClaseFuente,
  identificador: z.string(),
  titulo: z.string(),
  autoridad: z.string(),
  fecha: FechaISO.nullable().default(null),
  url: z.string().nullable().default(null),
  resolucion: EstadoResolucion,
  vigencia: EstadoVigencia,
  condicionamiento: z.string().nullable().default(null),
  fuerzaVinculante: NivelVinculante.nullable().default(null),
  fundamentoVinculancia: z.string().nullable().default(null),
  textoRelevante: z.string().nullable().default(null),
  hashTexto: z.string().nullable().default(null),
  ratio: z.string().nullable().default(null),
  hechosDeterminantes: z.string().nullable().default(null),
  analogia: Analogia.nullable().default(null),
  problemasIds: z.array(z.string()).default([]),
  procedencias: z.array(z.string()).default([]),
  verificadaEn: InstanteISO,
  modulo: z.string(),
  notas: z.array(z.string()).default([]),
});
export type Fuente = z.infer<typeof Fuente>;

/** Módulo 21 · resultado de auditar una cita hallada en un borrador. */
export const Cita = z.object({
  id: z.string(),
  texto: z.string(),
  clase: ClaseFuente,
  identificadorNormalizado: z.string(),
  fuenteId: z.string().nullable().default(null),
  entregable: z.enum(["INFORME_TECNICO", "PIEZA_PROCESAL"]),
  seccion: z.string(),
  estado: z.enum(["VERIFICADA", "VERIFICADA_CON_ADVERTENCIA", "BLOQUEADA"]),
  motivo: z.string(),
  citaTextual: z.string().nullable().default(null),
  coincidenciaTextual: z.boolean().nullable().default(null),
  auditadaEn: InstanteISO,
});
export type Cita = z.infer<typeof Cita>;

/* ──────────────────────────── Términos ──────────────────────────── */

export const UnidadTermino = z.enum(["DIAS_HABILES", "DIAS_CALENDARIO", "MESES", "ANIOS"]);
export type UnidadTermino = z.infer<typeof UnidadTermino>;

export const EstadoTermino = z.enum([
  "CORRIENDO", "RIESGO", "RIESGO_INMINENTE", "VENCIDO_APARENTE", "CUMPLIDO", "SUSPENDIDO", "SIN_TERMINO",
]);
export type EstadoTermino = z.infer<typeof EstadoTermino>;

export const Termino = z.object({
  id: z.string(),
  tipo: z.enum(["PRESCRIPCION", "CADUCIDAD", "PROCESAL", "DESISTIMIENTO_TACITO", "RESPUESTA_AUTORIDAD", "NOTIFICACION", "INMEDIATEZ", "OTRO"]),
  descripcion: z.string(),
  norma: z.string(),
  catalogoId: z.string().nullable().default(null),
  verificacionNorma: z.string(),
  fechaInicio: FechaISO,
  fechaInicioSoporte: z.string(),
  unidad: UnidadTermino,
  cantidad: z.number().int().nonnegative(),
  vencimiento: FechaISO,
  /** Doble cómputo cuando la fecha inicial no está determinada: se actúa antes del vencimiento más temprano. */
  vencimientoMasTemprano: FechaISO.nullable().default(null),
  diasHabilesRestantes: z.number().int(),
  estado: EstadoTermino,
  esEstimacion: z.boolean(),
  margen: z.string().nullable().default(null),
  accionQueInterrumpe: z.string().nullable().default(null),
  alertas: z.array(FechaISO).default([]),
  modulo: z.string(),
  calculadoEn: InstanteISO,
  advertencias: z.array(z.string()).default([]),
});
export type Termino = z.infer<typeof Termino>;

/* ──────────────────────── Hallazgos y análisis ──────────────────────── */

export const Hallazgo = z.object({
  id: z.string(),
  modulo: z.string(),
  titulo: z.string(),
  detalle: z.string(),
  gravedad: Gravedad,
  soportes: z.array(Soporte).default([]),
  fundamento: z.string().nullable().default(null),
  recomendacion: z.string().nullable().default(null),
});
export type Hallazgo = z.infer<typeof Hallazgo>;

export const Actuacion = z.object({
  fecha: FechaISO.nullable(),
  actuacion: z.string(),
  anotacion: z.string().nullable().default(null),
});

export const EstadoProcesal = z.object({
  radicado: z.string(),
  despacho: z.string().nullable().default(null),
  claseProceso: z.string().nullable().default(null),
  sujetos: z.array(z.string()).default([]),
  ultimaActuacion: Actuacion.nullable().default(null),
  actuaciones: z.array(Actuacion).default([]),
  fuente: z.string(),
  procedencias: z.array(z.string()).default([]),
  consultadoEn: InstanteISO,
});
export type EstadoProcesal = z.infer<typeof EstadoProcesal>;

export const HallazgoDiligencia = z.object({
  id: z.string(),
  sujeto: z.string(),
  fuente: z.string(),
  capacidad: z.string(),
  finalidad: z.string(),
  resultado: z.string(),
  relevancia: z.string(),
  alerta: z.boolean(),
  procedencias: z.array(z.string()).default([]),
});
export type HallazgoDiligencia = z.infer<typeof HallazgoDiligencia>;

export const FilaProbatoria = z.object({
  hechoId: z.string(),
  medio: z.string().nullable(),
  soporte: Soporte.nullable().default(null),
  pertinencia: z.enum(["ALTA", "MEDIA", "BAJA", "N/A"]),
  conducencia: z.enum(["ALTA", "MEDIA", "BAJA", "N/A"]),
  utilidad: z.enum(["ALTA", "MEDIA", "BAJA", "N/A"]),
  licitud: z.enum(["LICITA", "DUDOSA", "ILICITA", "N/A"]),
  riesgoTacha: z.string().nullable().default(null),
  vacio: z.boolean(),
  gestionSugerida: z.string().nullable().default(null),
});
export type FilaProbatoria = z.infer<typeof FilaProbatoria>;

export const Analisis = z.object({
  resumenCaso: z.string().default(""),
  area: AreaDerecho.nullable().default(null),
  materia: z.string().default(""),
  tipoAsunto: z.string().default(""),
  rolCliente: RolCliente.nullable().default(null),
  objetivoCliente: z.string().default(""),
  estadosProcesales: z.array(EstadoProcesal).default([]),
  diligencia: z.array(HallazgoDiligencia).default([]),
  omisiones: z.array(Hallazgo).default([]),
  nulidades: z.object({ aplica: z.boolean(), hallazgos: z.array(Hallazgo) }).default({ aplica: false, hallazgos: [] }),
  derechosFundamentales: z.object({
    derechos: z.array(z.string()),
    resultado: z.enum(["PROCEDENTE", "PROCEDENTE_TRANSITORIA", "IMPROCEDENTE", "NO_APLICA", "FUERA_DE_ALCANCE"]),
    examen: z.array(z.object({ requisito: z.string(), cumple: z.enum(["SI", "NO", "INCIERTO"]), razon: z.string() })),
    viaOrdinaria: z.string().nullable(),
  }).nullable().default(null),
  competencia: z.object({
    cuantia: z.object({ valor: z.number().nullable(), smmlv: z.number().nullable(), anio: z.number().int(), categoria: z.string(), calculo: z.string() }).nullable(),
    juez: z.string(),
    territorio: z.string(),
    cadena: z.array(z.string()),
    irregularidades: z.array(Hallazgo),
  }).nullable().default(null),
  matrizProbatoria: z.array(FilaProbatoria).default([]),
  trampas: z.array(Hallazgo).default([]),
  masc: z.object({
    conciliable: z.enum(["SI", "NO", "PARCIAL"]),
    obligatoriaComoRequisito: z.enum(["SI", "NO", "INCIERTO"]),
    puntaje: z.number().min(0).max(100),
    factores: z.array(z.object({ factor: z.string(), peso: z.number(), valor: z.number(), razon: z.string() })),
    recomendacion: z.string(),
  }).nullable().default(null),
  bloqueConstitucionalidad: z.object({
    activado: z.boolean(),
    razones: z.array(z.string()),
    instrumentos: z.array(z.object({ instrumento: z.string(), leyAprobatoria: z.string(), disposicion: z.string() })),
  }).nullable().default(null),
  conceptosAdministrativos: z.object({
    autoridades: z.array(z.string()),
    consultados: z.array(z.string()),
    consultaSugerida: z.string().nullable(),
  }).nullable().default(null),
  sesgo: z.object({
    checklist: z.array(z.object({ pregunta: z.string(), respuesta: z.string() })),
    observaciones: z.array(z.string()),
  }).nullable().default(null),
  zonasGrises: z.array(z.string()).default([]),
});
export type Analisis = z.infer<typeof Analisis>;

export const Ataque = z.object({
  descripcion: z.string(),
  tipo: z.string(),
  severidad: z.enum(["ALTA", "MEDIA", "BAJA"]),
  resiste: z.enum(["SI", "PARCIAL", "NO"]),
  replica: z.string().nullable(),
  riesgoAsumido: z.boolean().default(false),
});

export const Estrategia = z.object({
  viaPrincipal: z.string(),
  fundamentoVia: z.string(),
  requisitosPrevios: z.array(z.string()).default([]),
  rutaTemporal: z.string().default(""),
  concurrentes: z.array(z.string()).default([]),
  descartadas: z.array(z.object({ via: z.string(), razon: z.string() })).default([]),
  urgente: z.boolean().default(false),
  piezaSiguiente: z.object({ tipo: TipoPieza, destinatario: z.string(), objetivo: z.string(), requiereAbogado: z.boolean() }),
  notificaciones: z.array(z.object({ sujeto: z.string(), forma: z.string(), fundamento: z.string(), fechaSurtida: FechaISO.nullable(), terminoDesde: FechaISO.nullable() })).default([]),
  contradictor: z.array(Ataque).default([]),
});
export type Estrategia = z.infer<typeof Estrategia>;

/* ─────────────────── Trazabilidad, entregables y gobierno ─────────────────── */

/** Módulo 22 · cadena hecho → prueba → norma → conclusión, encadenada por hash (inmutable). */
export const Afirmacion = z.object({
  id: z.string(),
  entregable: z.enum(["INFORME_TECNICO", "PIEZA_PROCESAL"]),
  seccion: z.string(),
  texto: z.string(),
  hechos: z.array(z.string()).default([]),
  soportes: z.array(Soporte).default([]),
  fuentes: z.array(z.string()).default([]),
  conclusion: z.string().nullable().default(null),
  etiqueta: EtiquetaConfianza,
  huella: z.string(),
  anterior: z.string(),
});
export type Afirmacion = z.infer<typeof Afirmacion>;

export const Entregable = z.object({
  id: z.string(),
  tipo: z.enum(["INFORME_TECNICO", "PIEZA_PROCESAL", "INDICE_ELECTRONICO", "PAQUETE_ANEXOS", "DICTAMEN_REMISION", "EXPEDIENTE_ORGANIZADO"]),
  version: z.number().int().positive(),
  modo: z.enum(["BORRADOR", "RADICABLE"]),
  blobId: z.string(),
  nombreArchivo: z.string(),
  mime: z.string(),
  sha256: z.string(),
  paginas: z.number().int().nullable().default(null),
  generadoEn: InstanteISO,
});
export type Entregable = z.infer<typeof Entregable>;

export const IdCompuerta = z.enum(["g_completo", "g_citas", "g_riesgo", "g_habilitacion", "g_revision"]);
export type IdCompuerta = z.infer<typeof IdCompuerta>;

export const DecisionCompuerta = z.object({
  compuerta: IdCompuerta,
  decision: z.enum(["si", "no"]),
  motivo: z.string(),
  actor: z.string(), // "SISTEMA" o id del ABOGADO (USUARIO)
  decididoEn: InstanteISO,
  anulacionHumana: z.boolean().default(false),
  iteracion: z.number().int().nonnegative(),
});
export type DecisionCompuerta = z.infer<typeof DecisionCompuerta>;

/** Módulo 27 · tipología de devoluciones del ABOGADO (USUARIO). */
export const TipoCorreccion = z.enum([
  "HECHO_MAL_ESTABLECIDO", "NORMA_MAL_APLICADA", "CITA_INCORRECTA", "OMISION_DE_PRETENSION", "ERROR_DE_FORMA",
  "DESACIERTO_DE_ESTRATEGIA", "PRUEBA_MAL_VALORADA", "ESTILO",
]);
export type TipoCorreccion = z.infer<typeof TipoCorreccion>;

export const Correccion = z.object({
  id: z.string(),
  usuarioId: z.string(),
  fecha: InstanteISO,
  tipo: TipoCorreccion,
  clase: z.enum(["ERROR", "ESTILO"]),
  generalizable: z.boolean(),
  descripcion: z.string(),
  seccionAfectada: z.string().nullable().default(null),
  leccion: z.string().nullable().default(null),
  promovidaAMemoria: z.boolean().default(false),
});
export type Correccion = z.infer<typeof Correccion>;

export const EstadoNodo = z.enum(["PENDIENTE", "EN_CURSO", "COMPLETADO", "OMITIDO", "ESPERANDO", "ERROR"]);
export type EstadoNodo = z.infer<typeof EstadoNodo>;

export const Pausa = z.object({
  nodo: z.string(),
  motivo: z.string(),
  acciones: z.array(z.string()),
  detalle: z.unknown().optional(),
  desde: InstanteISO,
});
export type Pausa = z.infer<typeof Pausa>;

export const EventoEjecucion = z.object({
  nodo: z.string(),
  inicio: InstanteISO,
  fin: InstanteISO,
  resultado: z.enum(["COMPLETADO", "OMITIDO", "PAUSA", "ERROR", "DECISION"]),
  detalle: z.string(),
  iteracion: z.number().int().nonnegative(),
});

export const Ejecucion = z.object({
  estados: z.record(z.string(), EstadoNodo).default({}),
  ramas: z.record(z.string(), z.enum(["si", "no"])).default({}),
  iteraciones: z.record(z.string(), z.number().int().nonnegative()).default({}),
  historial: z.array(EventoEjecucion).default([]),
  pausa: Pausa.nullable().default(null),
  error: z.string().nullable().default(null),
  iniciadaEn: InstanteISO.nullable().default(null),
  finalizadaEn: InstanteISO.nullable().default(null),
});
export type Ejecucion = z.infer<typeof Ejecucion>;

export const EstadoExpediente = z.enum([
  "BORRADOR", "EN_PROCESO", "REQUIERE_ACCION", "EN_REVISION", "APROBADO", "REMITIDO", "ERROR", "ARCHIVADO",
]);
export type EstadoExpediente = z.infer<typeof EstadoExpediente>;

export const ContextoInicial = z.object({
  cliente: z.object({ nombre: z.string(), identificacion: z.string().nullable().default(null), rol: RolCliente.nullable().default(null) }).nullable().default(null),
  contraparte: z.string().nullable().default(null),
  objetivo: z.string().nullable().default(null),
  notasAbogado: z.string().nullable().default(null),
  area: AreaDerecho.nullable().default(null),
  radicados: z.array(z.string()).default([]),
  /** Consultas de debida diligencia autorizadas por el ABOGADO (USUARIO) (finalidad, Ley 1581 de 2012). */
  diligenciaAutorizada: z.array(z.string()).default([]),
});
export type ContextoInicial = z.infer<typeof ContextoInicial>;

export const Expediente = z.object({
  id: z.string(),
  tenantId: z.string(),
  propietarioId: z.string(),
  titulo: z.string(),
  creadoEn: InstanteISO,
  actualizadoEn: InstanteISO,
  version: z.number().int().nonnegative(),
  estado: EstadoExpediente,
  contexto: ContextoInicial,
  archivos: z.array(ArchivoOriginal).default([]),
  lecturas: z.array(LecturaPagina).default([]),
  piezas: z.array(PiezaDocumental).default([]),
  entidades: z.array(Entidad).default([]),
  partes: z.array(Parte).default([]),
  hechos: z.array(Hecho).default([]),
  problemas: z.array(ProblemaJuridico).default([]),
  cuerposNormativos: z.array(CuerpoNormativo).default([]),
  fuentes: z.array(Fuente).default([]),
  procedencias: z.array(Procedencia).default([]),
  citas: z.array(Cita).default([]),
  terminos: z.array(Termino).default([]),
  analisis: Analisis.default(Analisis.parse({})),
  estrategia: Estrategia.nullable().default(null),
  borradores: z.record(z.string(), z.unknown()).default({}),
  afirmaciones: z.array(Afirmacion).default([]),
  entregables: z.array(Entregable).default([]),
  decisiones: z.array(DecisionCompuerta).default([]),
  correcciones: z.array(Correccion).default([]),
  lecciones: z.array(z.string()).default([]),
  ejecucion: Ejecucion.default(Ejecucion.parse({})),
});
export type Expediente = z.infer<typeof Expediente>;

/** Crea un expediente vacío y válido. */
export function crearExpediente(datos: {
  id: string;
  tenantId: string;
  propietarioId: string;
  titulo: string;
  contexto?: Partial<ContextoInicial>;
  ahora: string;
}): Expediente {
  return Expediente.parse({
    id: datos.id,
    tenantId: datos.tenantId,
    propietarioId: datos.propietarioId,
    titulo: datos.titulo,
    creadoEn: datos.ahora,
    actualizadoEn: datos.ahora,
    version: 0,
    estado: "BORRADOR",
    contexto: ContextoInicial.parse(datos.contexto ?? {}),
  });
}
