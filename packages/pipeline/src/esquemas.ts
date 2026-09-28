import { AreaDerecho, EstadoHecho, EtiquetaConfianza, RolCliente, SujetoEspecialProteccion, TipoCorreccion, TipoPieza } from "@em/dominio";
import { z } from "zod";

/* Esquemas de salida de cada tarea de IA. Todo campo es obligatorio y los
 * opcionales se modelan como null (salidas estructuradas). La validación zod del
 * cliente conserva las restricciones que el esquema enviado no puede expresar. */

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const SoporteIA = z.object({ archivoId: z.string(), pagina: z.number().int().min(1), cita: z.string().nullable() });

/* f2 · lectura íntegra por lotes de páginas */
export const LecturaLote = z.object({
  paginas: z.array(z.object({
    pagina: z.number().int().min(1),
    tipologia: z.string().min(2),
    tituloDocumento: z.string().nullable(),
    iniciaDocumento: z.boolean(),
    fechaDocumento: Fecha,
    fechaTexto: z.string().nullable(),
    actores: z.array(z.object({ nombre: z.string(), rol: z.string(), identificacion: z.string().nullable() })),
    resumen: z.string(),
    transcripcion: z.string(),
    legibilidad: z.enum(["ALTA", "MEDIA", "BAJA", "ILEGIBLE"]),
    relevancia: z.enum(["RELEVANTE", "POSIBLEMENTE_AJENO"]),
    origenFisico: z.enum(["ESCANEADO", "ELECTRONICO", "FOTOGRAFIA", "DESCONOCIDO"]),
    observaciones: z.array(z.string()),
  })),
});
export type LecturaLote = z.infer<typeof LecturaLote>;

/* f3 · consolidación de partes, hechos y calificación del asunto */
export const Consolidacion = z.object({
  resumenCaso: z.string(),
  area: AreaDerecho,
  areasConcurrentes: z.array(AreaDerecho),
  materia: z.string(),
  tipoAsunto: z.string(),
  rolCliente: RolCliente.nullable(),
  objetivoCliente: z.string(),
  partes: z.array(z.object({
    nombre: z.string(),
    identificacion: z.string().nullable(),
    tipoPersona: z.enum(["NATURAL", "JURIDICA", "ENTIDAD_PUBLICA", "DESCONOCIDO"]),
    calidad: z.string(),
    esCliente: z.boolean(),
    representante: z.string().nullable(),
    apoderado: z.string().nullable(),
    correo: z.string().nullable(),
    domicilio: z.string().nullable(),
    proteccionEspecial: z.array(SujetoEspecialProteccion),
    soportes: z.array(SoporteIA),
  })),
  hechos: z.array(z.object({
    descripcion: z.string().min(10),
    fecha: Fecha,
    fechaTexto: z.string().nullable(),
    lugar: z.string().nullable(),
    modo: z.string().nullable(),
    actores: z.array(z.string()),
    estado: EstadoHecho,
    soportes: z.array(SoporteIA),
    relevanciaJuridica: z.string().nullable(),
    discrepancias: z.array(z.object({
      descripcion: z.string(),
      versiones: z.array(z.object({ texto: z.string(), archivoId: z.string().nullable(), pagina: z.number().int().nullable() })),
      resolucion: z.string(),
      criterio: z.string(),
    })),
  })),
  documentosFaltantes: z.array(z.object({ descripcion: z.string(), gravedad: z.enum(["BLOQUEANTE", "ALTA", "MEDIA", "BAJA"]), razon: z.string() })),
});
export type Consolidacion = z.infer<typeof Consolidacion>;

/* f4 · problemas jurídicos y plan de investigación */
export const Plan = z.object({
  problemas: z.array(z.object({ enunciado: z.string().min(10), tipo: z.enum(["PRINCIPAL", "ASOCIADO"]), hechosDeterminantes: z.array(z.string()) })).min(1),
  consultasJurisprudencia: z.array(z.object({ problema: z.number().int().min(0), consulta: z.string(), corte: z.enum(["CC", "CSJ", "CE", "CUALQUIERA"]) })),
  normasCandidatas: z.array(z.object({ identificador: z.string(), problema: z.number().int().min(0), razon: z.string() })),
  providenciasCandidatas: z.array(z.object({ identificador: z.string(), problema: z.number().int().min(0), razon: z.string() })),
  cuerposNormativos: z.array(z.object({ nombre: z.string(), rol: z.enum(["APLICABLE", "CONCURRENTE", "SUPLETORIO", "DESCARTADO"]), razon: z.string(), rutaIntegracion: z.string().nullable() })),
  derechoFundamentalComprometido: z.boolean(),
  proteccionInternaInsuficiente: z.boolean(),
  materiasBloque: z.array(z.string()),
  autoridadesConDoctrina: z.array(z.string()),
});
export type Plan = z.infer<typeof Plan>;

/* m01 · fichas de providencias halladas por el agente de investigación */
export const Fichas = z.object({
  providencias: z.array(z.object({
    identificador: z.string(),
    autoridad: z.enum(["CC", "CE", "CSJ", "TRIBUNAL", "JUEZ", "SUPERINTENDENCIA", "COMISION", "AUTORIDAD_ADMINISTRATIVA", "CIDH"]),
    tipo: z.string(),
    fecha: Fecha,
    url: z.string().nullable(),
    problema: z.number().int().min(0),
    esUnificacion: z.boolean(),
    ratio: z.string().nullable(),
    hechosDeterminantes: z.string().nullable(),
    razonPertinencia: z.string(),
  })),
  vacios: z.array(z.string()),
});
export type Fichas = z.infer<typeof Fichas>;

/* m07 · analogía fáctica y ratio decidendi */
export const Analogias = z.object({
  evaluaciones: z.array(z.object({
    fuenteId: z.string(),
    nivel: z.enum(["ALTA", "MEDIA", "BAJA"]),
    similitud: z.number().min(0).max(1),
    ratio: z.string().nullable(),
    esRatioDecidendi: z.boolean().nullable(),
    coincidencias: z.array(z.string()),
    divergencias: z.array(z.string()),
    distincion: z.string().nullable(),
  })),
});

/* f5 · subsunción */
export const Subsuncion = z.object({
  bloques: z.array(z.object({
    problemaId: z.string(),
    regla: z.string(),
    fuenteIds: z.array(z.string()),
    hechoIds: z.array(z.string()),
    premisaFactica: z.string(),
    conclusion: z.string(),
    etiqueta: z.enum(["CONCLUSION_CONSOLIDADA", "CONCLUSION_DISCUTIBLE", "INFERENCIA_RAZONABLE", "DATO_NO_VERIFICADO"]),
    eslabonMasDebil: z.string().nullable(),
    figurasDistinguidas: z.array(z.object({ figura: z.string(), noSeConfundeCon: z.string(), razon: z.string() })),
  })),
  zonasGrises: z.array(z.string()),
});

/* m08 · términos aplicables del catálogo */
export const TerminosAplicables = z.object({
  terminos: z.array(z.object({
    catalogoId: z.string(),
    fechaEvento: Fecha,
    fechaEventoHasta: Fecha,
    soporte: z.string(),
    fechaProvisional: z.boolean(),
    razon: z.string(),
  })),
  observaciones: z.array(z.string()),
});

/* m09 · nulidades, causal por causal */
export const Nulidades = z.object({
  aplica: z.boolean(),
  razon: z.string(),
  respuestas: z.array(z.object({ numeral: z.number().int().min(1).max(8), indicio: z.enum(["SI", "NO", "INCIERTO"]), soporte: z.string().nullable(), observacion: z.string().nullable(), saneada: z.boolean().nullable() })),
});

/* m10 · tamizaje de derechos fundamentales */
export const Tamizaje = z.object({
  derechos: z.array(z.string()),
  aplica: z.boolean(),
  legitimacionActiva: z.object({ cumple: z.boolean().nullable(), razon: z.string() }),
  legitimacionPasiva: z.object({ cumple: z.boolean().nullable(), razon: z.string() }),
  mesesDesdeElHecho: z.number().nullable(),
  vulneracionContinuada: z.boolean(),
  justificacionDemora: z.string().nullable(),
  existeOtroMedio: z.boolean().nullable(),
  medioEsEficaz: z.boolean().nullable(),
  perjuicio: z.object({ inminente: z.boolean(), urgente: z.boolean(), grave: z.boolean(), impostergable: z.boolean() }),
  contraProvidenciaJudicial: z.boolean(),
  tutelaPreviaMismosHechos: z.boolean(),
  viaOrdinaria: z.string().nullable(),
});

/* m11 · hechos de competencia */
export const HechosCompetenciaIA = z.object({
  asunto: z.enum(["CONTENCIOSO_PATRIMONIAL", "EJECUTIVO", "SUCESION", "FAMILIA", "LABORAL_ORDINARIO", "SEGURIDAD_SOCIAL", "CONTENCIOSO_ADMINISTRATIVO", "TUTELA", "POLICIVO", "PENAL", "CONSUMIDOR", "OTRO"]),
  valor: z.number().nullable(),
  anio: z.number().int(),
  calculoValor: z.string(),
  domicilioDemandado: z.string().nullable(),
  lugarCumplimiento: z.string().nullable(),
  ubicacionInmueble: z.string().nullable(),
  ultimoDomicilioCausante: z.string().nullable(),
  domicilioMenor: z.string().nullable(),
  lugarPrestacionServicio: z.string().nullable(),
  entidadPublicaDemandada: z.string().nullable(),
  lugarVulneracion: z.string().nullable(),
  involucraNNA: z.boolean(),
  irregularidades: z.array(z.object({ titulo: z.string(), detalle: z.string(), prorrogable: z.boolean() })),
});

/* m13 · matriz probatoria */
export const MatrizProbatoria = z.object({
  filas: z.array(z.object({
    hechoId: z.string(),
    medio: z.string().nullable(),
    soporte: SoporteIA.nullable(),
    pertinencia: z.enum(["ALTA", "MEDIA", "BAJA", "N/A"]),
    conducencia: z.enum(["ALTA", "MEDIA", "BAJA", "N/A"]),
    utilidad: z.enum(["ALTA", "MEDIA", "BAJA", "N/A"]),
    licitud: z.enum(["LICITA", "DUDOSA", "ILICITA", "N/A"]),
    riesgoTacha: z.string().nullable(),
    vacio: z.boolean(),
    gestionSugerida: z.string().nullable(),
  })),
});

/* m14 · trampas procesales y procedibilidad */
export const Trampas = z.object({
  via: z.string(),
  asuntoConciliable: z.boolean().nullable(),
  pideMedidasCautelares: z.boolean(),
  demandadoEntidadPublica: z.boolean(),
  asuntoLaboralOPensional: z.boolean(),
  querellable: z.boolean(),
  tieneSentenciaOSeguirAdelante: z.boolean(),
  cargaPendiente: z.object({ fechaNotificacionAuto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), descripcion: z.string() }).nullable(),
  otras: z.array(z.object({ titulo: z.string(), detalle: z.string(), gravedad: z.enum(["BLOQUEANTE", "ALTA", "MEDIA", "BAJA", "INFORMATIVA"]), fundamento: z.string().nullable() })),
});

/* m20 · factores de MASC */
export const FactoresMasc = z.object({
  asunto: z.string(),
  derechosCiertosEIndiscutibles: z.boolean(),
  estadoCivil: z.boolean(),
  delitoNoQuerellable: z.boolean(),
  relacionAPreservar: z.number().min(0).max(1),
  cuantiaFrenteACosto: z.number().min(0).max(1),
  debilidadProbatoriaPropia: z.number().min(0).max(1),
  duracionEstimadaProceso: z.number().min(0).max(1),
  disposicionManifestada: z.number().min(0).max(1),
  obstaculoNoNegociable: z.boolean(),
  razones: z.array(z.string()),
});

/* m15 · hechos para el árbol de vía procesal */
export const HechosViaIA = z.object({
  etapa: z.enum(["SIN_PROCESO", "TRASLADO_DEMANDA", "MANDAMIENTO_NOTIFICADO", "AUTO_ADVERSO_NOTIFICADO", "SENTENCIA_ADVERSA", "FALLO_TUTELA_ADVERSO", "FALLO_TUTELA_INCUMPLIDO", "INACTIVO", "ALEGATOS", "ACTO_ADMINISTRATIVO_NOTIFICADO", "EN_CURSO_OTRO"]),
  autoApelable: z.boolean(),
  otroMedioEficaz: z.boolean().nullable(),
  interesColectivo: z.boolean(),
  grupoPlural: z.boolean(),
  tituloEjecutivo: z.boolean(),
  actoAdministrativoParticular: z.boolean(),
  recursosAdministrativosEnTermino: z.boolean(),
  danoAntijuridicoEstatal: z.boolean(),
  incumplimientoNormaOActo: z.boolean(),
  renuenciaConstituida: z.boolean(),
  peticionSinRespuesta: z.boolean(),
  requiereReclamacionPrevia: z.boolean(),
  conductaPenal: z.boolean(),
  perturbacionPosesion: z.boolean(),
  relacionConsumo: z.boolean(),
  reclamacionConsumoAgotada: z.boolean(),
  servicioPublicoDomiciliario: z.boolean(),
  destinatario: z.string(),
  objetivo: z.string(),
  pretensionPrincipal: z.string(),
});

/* m16 · pieza procesal redactada */
const ParrafoPieza = z.object({ texto: z.string().min(1), fuenteIds: z.array(z.string()), hechoIds: z.array(z.string()), soportes: z.array(SoporteIA) });
export const PiezaRedactada = z.object({
  destinatario: z.array(z.string()).min(1),
  referencia: z.array(z.object({ etiqueta: z.string(), valor: z.string() })),
  asunto: z.string(),
  apertura: z.string(),
  secciones: z.array(z.object({ titulo: z.string(), componentes: z.array(z.string()), numerarParrafos: z.boolean(), parrafos: z.array(ParrafoPieza) })).min(1),
  cierre: z.string(),
});
export type PiezaRedactada = z.infer<typeof PiezaRedactada>;

/* m19 · contradictor */
export const Contradiccion = z.object({
  ataques: z.array(z.object({ descripcion: z.string(), tipo: z.string(), severidad: z.enum(["ALTA", "MEDIA", "BAJA"]), resiste: z.enum(["SI", "PARCIAL", "NO"]), replica: z.string().nullable() })),
});

/* f6 · redacción del informe por sección */
const SegmentoIA = z.object({ texto: z.string(), fuenteId: z.string().nullable() });
const ParrafoIA = z.object({ segmentos: z.array(SegmentoIA).min(1), hechoIds: z.array(z.string()) });
export const SeccionRedactada = z.object({
  parrafos: z.array(ParrafoIA),
  citas: z.array(z.object({ fuenteId: z.string(), fragmento: z.string(), descripcion: z.string(), despuesDelParrafo: z.number().int().min(0) })),
  subsecciones: z.array(z.object({
    titulo: z.string(),
    parrafos: z.array(ParrafoIA),
    subsecciones: z.array(z.object({ titulo: z.string(), parrafos: z.array(ParrafoIA) })),
  })),
});
export type SeccionRedactada = z.infer<typeof SeccionRedactada>;

export const MetadatosInforme = z.object({
  titulo: z.string(),
  subtitulo: z.string(),
  resumen: z.string(),
  palabrasClave: z.array(z.string()).min(3),
  introduccion: z.array(ParrafoIA),
  conclusiones: z.array(ParrafoIA).min(1),
});

/* m25 · sesgo y equidad */
export const Sesgo = z.object({ checklist: z.array(z.object({ pregunta: z.string(), respuesta: z.string() })), observaciones: z.array(z.string()) });

/* m24 · poder conferido */
export const PoderLeido = z.object({
  existe: z.boolean(),
  poderdante: z.string().nullable(),
  apoderado: z.string().nullable(),
  facultadesExpresas: z.array(z.string()),
  correoApoderado: z.string().nullable(),
  porMensajeDeDatos: z.boolean().nullable(),
  objeto: z.string().nullable(),
});

/* m27 · retroalimentación del ABOGADO (USUARIO) */
export const Retroalimentacion = z.object({
  correcciones: z.array(z.object({ tipo: TipoCorreccion, clase: z.enum(["ERROR", "ESTILO"]), generalizable: z.boolean(), descripcion: z.string(), seccionAfectada: z.string().nullable(), leccion: z.string().nullable() })),
});

/* m27 → m26 · lección disociada */
export const LeccionesDisociadas = z.object({
  lecciones: z.array(z.object({ tipo: z.enum(["RUTA", "ERROR_FRECUENTE", "ESTILO", "PRUEBA", "TERMINO", "FUENTE"]), area: AreaDerecho.nullable(), clave: z.string(), leccion: z.string() })),
});

export { EtiquetaConfianza, TipoPieza };
