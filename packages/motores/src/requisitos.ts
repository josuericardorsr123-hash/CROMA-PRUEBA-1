import { normalizarTexto } from "./texto";

/* Módulo 12 · omisiones de fondo.
 * (a) Documentos que el tipo de asunto normalmente exige en el expediente.
 * (b) Componentes que cada pieza procesal debe contener. */

export type GravedadRequisito = "BLOQUEANTE" | "ALTA" | "MEDIA" | "BAJA";

export interface DocumentoRequerido {
  id: string;
  descripcion: string;
  /** Palabras clave de tipología que satisfacen el requisito (comparación sin tildes). */
  tipologias: string[];
  gravedad: GravedadRequisito;
  razon: string;
}

export const DOCUMENTOS_REQUERIDOS: Record<string, DocumentoRequerido[]> = {
  COMUN: [
    { id: "identificacion_cliente", descripcion: "Documento de identidad del cliente o certificado de existencia y representación", tipologias: ["CEDULA", "IDENTIDAD", "CERTIFICADO DE EXISTENCIA", "CAMARA DE COMERCIO", "RUT"], gravedad: "MEDIA", razon: "Legitimación y datos de notificación (art. 82, num. 2 CGP)." },
    { id: "poder", descripcion: "Poder conferido al ABOGADO (USUARIO)", tipologias: ["PODER"], gravedad: "ALTA", razon: "Sin poder suficiente el apoderado actúa sin representación (arts. 74 a 77 CGP; art. 5 Ley 2213 de 2022)." },
  ],
  EJECUTIVO_DEMANDANTE: [
    { id: "titulo_ejecutivo", descripcion: "Título ejecutivo (título valor, sentencia, acta de conciliación, contrato u otro documento que contenga obligación clara, expresa y exigible)", tipologias: ["PAGARE", "LETRA", "CHEQUE", "FACTURA", "TITULO", "SENTENCIA", "ACTA DE CONCILIACION", "CONTRATO"], gravedad: "BLOQUEANTE", razon: "Sin título no hay mandamiento de pago (art. 422 CGP)." },
  ],
  EJECUTIVO_DEMANDADO: [
    { id: "mandamiento", descripcion: "Mandamiento de pago y demanda ejecutiva", tipologias: ["MANDAMIENTO", "AUTO", "DEMANDA"], gravedad: "BLOQUEANTE", razon: "Define las obligaciones ejecutadas y el objeto de la defensa." },
    { id: "notificacion", descripcion: "Constancia de notificación del mandamiento de pago", tipologias: ["NOTIFICACION", "CITATORIO", "AVISO", "CORREO"], gravedad: "ALTA", razon: "Fija el inicio de los términos de pago, reposición y excepciones (arts. 431, 430 y 442 CGP)." },
  ],
  DEMANDADO: [
    { id: "demanda_traslado", descripcion: "Demanda y auto admisorio notificados", tipologias: ["DEMANDA", "AUTO ADMISORIO", "AUTO"], gravedad: "BLOQUEANTE", razon: "Sin la demanda no puede contestarse punto por punto (art. 96 CGP)." },
    { id: "notificacion_admisorio", descripcion: "Constancia de notificación del auto admisorio", tipologias: ["NOTIFICACION", "CORREO", "AVISO", "CITATORIO"], gravedad: "ALTA", razon: "Fija el traslado para contestar." },
  ],
  LABORAL: [
    { id: "prueba_relacion", descripcion: "Prueba de la relación laboral (contrato, certificaciones, desprendibles de pago)", tipologias: ["CONTRATO", "CERTIFICACION LABORAL", "DESPRENDIBLE", "NOMINA", "CERTIFICADO LABORAL"], gravedad: "ALTA", razon: "Base de las pretensiones laborales." },
    { id: "terminacion", descripcion: "Carta de terminación, renuncia o liquidación", tipologias: ["CARTA", "TERMINACION", "RENUNCIA", "LIQUIDACION", "DESPIDO"], gravedad: "MEDIA", razon: "Fija la fecha de exigibilidad y la causa de terminación." },
  ],
  TUTELA: [
    { id: "prueba_vulneracion", descripcion: "Prueba de la acción u omisión vulneradora", tipologias: ["RESPUESTA", "DERECHO DE PETICION", "HISTORIA CLINICA", "ORDEN", "NEGACION", "ACTO", "CORREO", "COMUNICACION"], gravedad: "ALTA", razon: "La procedencia exige acreditar la vulneración o amenaza (Decreto 2591 de 1991, art. 14)." },
  ],
  CONTENCIOSO_NULIDAD: [
    { id: "acto_acusado", descripcion: "Copia del acto administrativo acusado", tipologias: ["RESOLUCION", "ACTO ADMINISTRATIVO", "DECRETO", "OFICIO", "DECISION"], gravedad: "BLOQUEANTE", razon: "Anexo obligatorio de la demanda (art. 166 CPACA)." },
    { id: "constancia_notificacion_acto", descripcion: "Constancia de comunicación, notificación, publicación o ejecución del acto", tipologias: ["NOTIFICACION", "CONSTANCIA", "PUBLICACION", "EDICTO", "AVISO"], gravedad: "ALTA", razon: "Fija el inicio de la caducidad de cuatro meses (art. 164 CPACA)." },
  ],
  REPARACION_DIRECTA: [
    { id: "prueba_dano", descripcion: "Prueba del daño y de la fecha de los hechos", tipologias: ["HISTORIA CLINICA", "INFORME", "DICTAMEN", "REGISTRO DE DEFUNCION", "DENUNCIA", "FOTOGRAFIA", "CERTIFICADO"], gravedad: "ALTA", razon: "Sin fecha de los hechos no puede calcularse la caducidad de dos años." },
  ],
  SUCESION: [
    { id: "defuncion", descripcion: "Registro civil de defunción del causante", tipologias: ["DEFUNCION"], gravedad: "BLOQUEANTE", razon: "Prueba de la apertura de la sucesión." },
    { id: "parentesco", descripcion: "Pruebas del parentesco o calidad de heredero", tipologias: ["REGISTRO CIVIL", "NACIMIENTO", "MATRIMONIO", "TESTAMENTO"], gravedad: "ALTA", razon: "Legitimación de los herederos." },
    { id: "bienes", descripcion: "Pruebas de los bienes del inventario (certificados de libertad, licencias de tránsito, extractos)", tipologias: ["CERTIFICADO DE LIBERTAD", "TRADICION", "LICENCIA DE TRANSITO", "TARJETA DE PROPIEDAD", "ESCRITURA", "EXTRACTO"], gravedad: "MEDIA", razon: "Inventario y avalúo." },
  ],
  ALIMENTOS: [
    { id: "registro_nna", descripcion: "Registro civil de nacimiento del alimentario", tipologias: ["REGISTRO CIVIL", "NACIMIENTO"], gravedad: "BLOQUEANTE", razon: "Prueba del vínculo que origina la obligación alimentaria." },
    { id: "capacidad", descripcion: "Prueba de la capacidad económica del alimentante y de las necesidades del alimentario", tipologias: ["CERTIFICADO LABORAL", "DESPRENDIBLE", "FACTURA", "RECIBO", "EXTRACTO"], gravedad: "MEDIA", razon: "Fijación proporcional de la cuota." },
  ],
  CONSUMIDOR: [
    { id: "prueba_compra", descripcion: "Factura o prueba de la relación de consumo", tipologias: ["FACTURA", "RECIBO", "CONTRATO", "ORDEN DE COMPRA"], gravedad: "ALTA", razon: "Acredita la relación de consumo." },
    { id: "reclamacion_previa", descripcion: "Reclamación directa al proveedor y su respuesta", tipologias: ["RECLAMACION", "PQR", "DERECHO DE PETICION", "RESPUESTA", "CORREO"], gravedad: "ALTA", razon: "Requisito de la acción de protección al consumidor (art. 58 Ley 1480)." },
  ],
  SERVICIOS_PUBLICOS: [
    { id: "factura_spd", descripcion: "Factura o acto de la empresa prestadora", tipologias: ["FACTURA", "ORDEN DE SUSPENSION", "DECISION EMPRESARIAL", "RESPUESTA"], gravedad: "ALTA", razon: "Objeto de la reclamación (art. 154 Ley 142)." },
  ],
};

export function claveAsunto(tipoAsunto: string, rolCliente: string | null): string[] {
  const t = normalizarTexto(tipoAsunto);
  const demandado = rolCliente ? ["DEMANDADO", "EJECUTADO", "ACCIONADO", "CONVOCADO", "QUERELLADO"].includes(rolCliente) : false;
  const claves = ["COMUN"];
  if (t.includes("EJECUTIV")) claves.push(demandado ? "EJECUTIVO_DEMANDADO" : "EJECUTIVO_DEMANDANTE");
  else if (demandado) claves.push("DEMANDADO");
  if (t.includes("LABORAL") || t.includes("PRESTACION")) claves.push("LABORAL");
  if (t.includes("TUTELA")) claves.push("TUTELA");
  if (t.includes("NULIDAD Y RESTABLECIMIENTO") || t.includes("ACTO ADMINISTRATIVO")) claves.push("CONTENCIOSO_NULIDAD");
  if (t.includes("REPARACION DIRECTA")) claves.push("REPARACION_DIRECTA");
  if (t.includes("SUCESION")) claves.push("SUCESION");
  if (t.includes("ALIMENTO")) claves.push("ALIMENTOS");
  if (t.includes("CONSUMIDOR") || t.includes("GARANTIA")) claves.push("CONSUMIDOR");
  if (t.includes("SERVICIO PUBLICO") || t.includes("SERVICIOS PUBLICOS")) claves.push("SERVICIOS_PUBLICOS");
  return [...new Set(claves)];
}

export interface FaltanteDocumental {
  requisito: DocumentoRequerido;
  presente: boolean;
  piezasQueLoSatisfacen: string[];
}

/** Contrasta las tipologías del expediente organizado con lo que el asunto exige. */
export function evaluarDocumentosRequeridos(tipoAsunto: string, rolCliente: string | null, piezas: Array<{ id: string; tipologia: string; contenido: string }>): FaltanteDocumental[] {
  const req = claveAsunto(tipoAsunto, rolCliente).flatMap((k) => DOCUMENTOS_REQUERIDOS[k] ?? []);
  return req.map((r) => {
    const satisface = piezas.filter((p) => {
      const texto = normalizarTexto(`${p.tipologia} ${p.contenido}`);
      return r.tipologias.some((k) => texto.includes(normalizarTexto(k)));
    });
    return { requisito: r, presente: satisface.length > 0, piezasQueLoSatisfacen: satisface.map((p) => p.id) };
  });
}

/* ───────────── (b) Componentes obligatorios por tipo de pieza ───────────── */

export interface ComponentePieza {
  id: string;
  descripcion: string;
  norma: string;
  gravedad: GravedadRequisito;
  consecuencia: string;
}

const C = (id: string, descripcion: string, norma: string, gravedad: GravedadRequisito, consecuencia: string): ComponentePieza => ({ id, descripcion, norma, gravedad, consecuencia });

const DEMANDA_CGP: ComponentePieza[] = [
  C("juez", "Designación del juez a quien se dirige", "CGP art. 82, num. 1", "ALTA", "Inadmisión (art. 90 CGP)."),
  C("partes", "Nombre, identificación y domicilio de las partes y sus representantes", "CGP art. 82, num. 2", "ALTA", "Inadmisión."),
  C("apoderado", "Nombre del apoderado judicial", "CGP art. 82, num. 3", "MEDIA", "Inadmisión."),
  C("pretensiones", "Pretensiones expresadas con precisión y claridad (principales y subsidiarias)", "CGP art. 82, num. 4", "BLOQUEANTE", "Inadmisión; pretensión difusa produce orden difusa."),
  C("hechos", "Hechos determinados, clasificados y numerados (modo, tiempo y lugar)", "CGP art. 82, num. 5", "BLOQUEANTE", "Inadmisión."),
  C("pruebas", "Petición de pruebas e indicación de documentos en poder del demandado", "CGP art. 82, num. 6", "ALTA", "Pérdida de la oportunidad probatoria."),
  C("juramento_estimatorio", "Juramento estimatorio cuando se reclama indemnización, compensación, frutos o mejoras", "CGP arts. 82, num. 7 y 206", "ALTA", "Inadmisión."),
  C("fundamentos_derecho", "Fundamentos de derecho", "CGP art. 82, num. 8", "ALTA", "Inadmisión."),
  C("cuantia", "Cuantía, cuando es necesaria para determinar competencia o trámite", "CGP arts. 82, num. 9 y 26", "MEDIA", "Inadmisión."),
  C("notificaciones", "Lugar, dirección física y electrónica para notificaciones de partes, representantes y apoderado", "CGP art. 82, num. 10; Ley 2213 de 2022, art. 6", "ALTA", "Inadmisión."),
  C("anexos", "Anexos: poder, prueba de existencia y representación, pruebas documentales", "CGP art. 84", "ALTA", "Inadmisión."),
  C("envio_simultaneo", "Constancia de envío simultáneo de la demanda y anexos al demandado (salvo medidas cautelares)", "Ley 2213 de 2022, art. 6, inc. 4", "MEDIA", "Inadmisión."),
];

export const COMPONENTES_POR_PIEZA: Record<string, ComponentePieza[]> = {
  DEMANDA_VERBAL: DEMANDA_CGP,
  DEMANDA_VERBAL_SUMARIA: DEMANDA_CGP,
  DEMANDA_FAMILIA: DEMANDA_CGP,
  DEMANDA_EJECUTIVA: [...DEMANDA_CGP.filter((c) => c.id !== "juramento_estimatorio"), C("titulo", "Título ejecutivo con obligación clara, expresa y exigible", "CGP art. 422", "BLOQUEANTE", "Negativa del mandamiento de pago.")],
  DEMANDA_LABORAL_ORDINARIA: [
    C("juez", "Designación del juez", "CPTSS art. 25, num. 1", "ALTA", "Devolución de la demanda (art. 28 CPTSS)."),
    C("partes", "Nombre de las partes, representantes, domicilio y dirección", "CPTSS art. 25, nums. 2 y 3", "ALTA", "Devolución."),
    C("clase_proceso", "Indicación de la clase de proceso", "CPTSS art. 25, num. 5", "MEDIA", "Devolución."),
    C("pretensiones", "Pretensiones expresadas con precisión y claridad, por separado", "CPTSS art. 25, num. 6", "BLOQUEANTE", "Devolución."),
    C("hechos", "Hechos clasificados y enumerados", "CPTSS art. 25, num. 7", "BLOQUEANTE", "Devolución."),
    C("fundamentos_derecho", "Fundamentos y razones de derecho", "CPTSS art. 25, num. 8", "ALTA", "Devolución."),
    C("pruebas", "Petición de pruebas", "CPTSS art. 25, num. 9", "ALTA", "Pérdida de la oportunidad probatoria."),
    C("cuantia", "Cuantía, cuando sea necesaria para fijar competencia", "CPTSS art. 25, num. 10", "MEDIA", "Devolución."),
    C("anexos", "Poder, pruebas, existencia y representación y agotamiento de la reclamación administrativa cuando aplique", "CPTSS art. 26", "ALTA", "Devolución."),
    C("notificaciones", "Canal digital de notificación", "Ley 2213 de 2022, art. 6", "ALTA", "Inadmisión."),
  ],
  DEMANDA_CONTENCIOSA_ADMINISTRATIVA: [
    C("partes", "Designación de las partes y sus representantes", "CPACA art. 162, num. 1", "ALTA", "Inadmisión (art. 170 CPACA)."),
    C("pretensiones", "Lo que se pretende, expresado con precisión y claridad", "CPACA art. 162, num. 2", "BLOQUEANTE", "Inadmisión."),
    C("hechos", "Hechos y omisiones debidamente determinados, clasificados y numerados", "CPACA art. 162, num. 3", "BLOQUEANTE", "Inadmisión."),
    C("fundamentos_derecho", "Fundamentos de derecho; normas violadas y concepto de la violación cuando se pide nulidad", "CPACA art. 162, num. 4", "BLOQUEANTE", "Inadmisión."),
    C("pruebas", "Petición de pruebas", "CPACA art. 162, num. 5", "ALTA", "Pérdida de la oportunidad probatoria."),
    C("cuantia", "Estimación razonada de la cuantía", "CPACA art. 162, num. 6", "ALTA", "Inadmisión."),
    C("notificaciones", "Lugar y dirección, incluido correo electrónico, para notificaciones", "CPACA art. 162, num. 7", "ALTA", "Inadmisión."),
    C("envio_simultaneo", "Envío simultáneo de la demanda a los demandados (salvo medidas cautelares)", "CPACA art. 162, num. 8 (Ley 2080 de 2021)", "MEDIA", "Inadmisión."),
    C("anexos", "Copia del acto acusado con constancias, poder y pruebas", "CPACA art. 166", "ALTA", "Inadmisión."),
    C("procedibilidad", "Prueba del agotamiento de requisitos de procedibilidad", "CPACA art. 161", "BLOQUEANTE", "Inadmisión y rechazo."),
  ],
  CONTESTACION_DEMANDA: [
    C("partes", "Nombre del demandado, domicilio y apoderado", "CGP art. 96, num. 1", "ALTA", "Posible inadmisión de la contestación."),
    C("pronunciamiento_pretensiones", "Pronunciamiento expreso y concreto sobre las pretensiones", "CGP art. 96, num. 2", "ALTA", "Presunciones en contra."),
    C("pronunciamiento_hechos", "Pronunciamiento sobre cada hecho (admite, niega, no le consta) con razones", "CGP art. 96, num. 2", "BLOQUEANTE", "Se presumen ciertos los hechos no contestados de forma expresa (art. 97 CGP)."),
    C("excepciones", "Excepciones de mérito con sus fundamentos (la prescripción debe alegarse aquí)", "CGP arts. 96, num. 3 y 282", "BLOQUEANTE", "Pérdida de las excepciones no alegadas."),
    C("pruebas", "Pruebas que se pretenden hacer valer", "CGP art. 96, num. 4", "ALTA", "Pérdida de la oportunidad probatoria."),
    C("objecion_juramento", "Objeción al juramento estimatorio, especificando la inexactitud", "CGP art. 206", "MEDIA", "El juramento hace prueba del monto."),
    C("notificaciones", "Dirección física y electrónica para notificaciones", "CGP art. 96, num. 5", "ALTA", "Irregularidad."),
  ],
  EXCEPCIONES_EJECUCION: [
    C("identificacion", "Identificación del proceso y del ejecutado", "CGP art. 442", "ALTA", "Irregularidad."),
    C("excepciones", "Excepciones de mérito con expresión de los hechos en que se fundan", "CGP art. 442, num. 1", "BLOQUEANTE", "Rechazo de plano de las excepciones sin hechos."),
    C("pruebas", "Pruebas relacionadas con las excepciones", "CGP art. 442, num. 1", "ALTA", "Excepción sin prueba."),
  ],
  RECURSO_REPOSICION: [
    C("providencia", "Identificación de la providencia recurrida", "CGP art. 318", "ALTA", "Improcedencia."),
    C("sustentacion", "Expresión de las razones que sustentan el recurso", "CGP art. 318, inc. 3", "BLOQUEANTE", "Rechazo por falta de sustentación."),
    C("oportunidad", "Interposición dentro de los tres días siguientes a la notificación", "CGP art. 318", "BLOQUEANTE", "Rechazo por extemporáneo."),
  ],
  RECURSO_APELACION: [
    C("providencia", "Identificación de la providencia apelada", "CGP art. 322", "ALTA", "Improcedencia."),
    C("reparos", "Precisión breve de los reparos concretos", "CGP art. 322, num. 3", "BLOQUEANTE", "Declaratoria de desierto."),
    C("oportunidad", "Interposición oportuna", "CGP art. 322, num. 1", "BLOQUEANTE", "Rechazo por extemporáneo."),
  ],
  RECURSO_REPOSICION_SUBSIDIO_APELACION: [
    C("providencia", "Identificación de la providencia recurrida", "CGP arts. 318 y 322", "ALTA", "Improcedencia."),
    C("sustentacion", "Razones del recurso de reposición", "CGP art. 318", "BLOQUEANTE", "Rechazo."),
    C("reparos", "Reparos concretos para la apelación subsidiaria", "CGP art. 322, num. 3", "BLOQUEANTE", "Desierto."),
    C("oportunidad", "Interposición oportuna", "CGP arts. 318 y 322", "BLOQUEANTE", "Rechazo."),
  ],
  ACCION_TUTELA: [
    C("accion_omision", "Acción u omisión que la motiva", "Decreto 2591 de 1991, art. 14", "BLOQUEANTE", "Solicitud de corrección en tres días (art. 17)."),
    C("derecho", "Derecho que se considera violado o amenazado", "Decreto 2591 de 1991, art. 14", "BLOQUEANTE", "Corrección."),
    C("accionado", "Autoridad o particular autor de la amenaza o agravio", "Decreto 2591 de 1991, art. 14", "BLOQUEANTE", "Corrección."),
    C("hechos", "Descripción de los hechos relevantes", "Decreto 2591 de 1991, art. 14", "BLOQUEANTE", "Corrección."),
    C("solicitante", "Nombre y lugar de residencia del solicitante", "Decreto 2591 de 1991, art. 14", "ALTA", "Corrección."),
    C("juramento", "Manifestación bajo juramento de no haber presentado otra tutela por los mismos hechos", "Decreto 2591 de 1991, art. 37", "ALTA", "Riesgo de temeridad (art. 38)."),
    C("procedencia", "Argumentación de legitimación, inmediatez y subsidiariedad", "Jurisprudencia constitucional", "ALTA", "Improcedencia."),
    C("pruebas", "Pruebas", "Decreto 2591 de 1991", "MEDIA", "Negación por falta de prueba."),
  ],
  DERECHO_PETICION: [
    C("destinatario", "Designación de la autoridad o particular destinatario", "Ley 1437 de 2011, art. 16 (Ley 1755 de 2015)", "ALTA", "Devolución o remisión."),
    C("peticionario", "Nombres, identificación, dirección y correo del peticionario", "Ley 1437 de 2011, art. 16", "ALTA", "Requerimiento para completar (art. 17)."),
    C("objeto", "Objeto de la petición", "Ley 1437 de 2011, art. 16", "BLOQUEANTE", "Requerimiento."),
    C("razones", "Razones en que se fundamenta", "Ley 1437 de 2011, art. 16", "ALTA", "Requerimiento."),
    C("pretensiones_apertura", "Pretensiones de apertura literales del estándar del despacho", "Regla interna RD_12", "ALTA", "Incumple el estándar de la firma."),
    C("documentos", "Relación de documentos que se acompañan", "Ley 1437 de 2011, art. 16", "MEDIA", "—"),
  ],
  RECURSO_ADMINISTRATIVO: [
    C("oportunidad", "Interposición dentro del plazo legal", "CPACA art. 77, num. 1", "BLOQUEANTE", "Rechazo (art. 78)."),
    C("sustentacion", "Sustentación con expresión concreta de los motivos de inconformidad", "CPACA art. 77, num. 2", "BLOQUEANTE", "Rechazo."),
    C("pruebas", "Solicitud y aporte de pruebas", "CPACA art. 77, num. 3", "MEDIA", "—"),
    C("recurrente", "Nombre, dirección y correo del recurrente", "CPACA art. 77, num. 4", "ALTA", "Rechazo."),
  ],
  SOLICITUD_CONCILIACION: [
    C("partes", "Identificación de convocante y convocado, con datos de notificación", "Ley 2220 de 2022", "ALTA", "Devolución de la solicitud."),
    C("hechos", "Hechos en que se funda", "Ley 2220 de 2022", "BLOQUEANTE", "Devolución."),
    C("pretensiones", "Pretensiones y su cuantía", "Ley 2220 de 2022", "BLOQUEANTE", "Devolución."),
    C("pruebas", "Relación de pruebas", "Ley 2220 de 2022", "MEDIA", "—"),
  ],
  SOLICITUD_NULIDAD: [
    C("legitimacion", "Legitimación para proponerla", "CGP art. 135", "BLOQUEANTE", "Rechazo de plano."),
    C("causal", "Causal invocada (solo las del art. 133)", "CGP arts. 133 y 135", "BLOQUEANTE", "Rechazo de plano."),
    C("hechos", "Hechos en que se fundamenta", "CGP art. 135", "BLOQUEANTE", "Rechazo."),
    C("pruebas", "Pruebas", "CGP art. 135", "ALTA", "—"),
  ],
  MEMORIAL_IMPULSO_PROCESAL: [
    C("proceso", "Identificación del proceso (radicado, partes, despacho)", "CGP art. 82 (por analogía)", "ALTA", "Imposibilidad de tramitar."),
    C("solicitud", "Solicitud concreta que impulsa el proceso", "CGP art. 317", "BLOQUEANTE", "No interrumpe la inactividad."),
  ],
  QUERELLA_POLICIVA: [
    C("querellante", "Identificación y datos del querellante", "Ley 1801 de 2016", "ALTA", "—"),
    C("hechos", "Hechos constitutivos del comportamiento contrario a la convivencia", "Ley 1801 de 2016", "BLOQUEANTE", "—"),
    C("pretension", "Medida solicitada", "Ley 1801 de 2016", "ALTA", "—"),
    C("pruebas", "Pruebas", "Ley 1801 de 2016", "MEDIA", "—"),
  ],
  DENUNCIA_PENAL: [
    C("hechos", "Relato de los hechos con circunstancias de modo, tiempo y lugar", "Ley 906 de 2004, art. 69", "BLOQUEANTE", "—"),
    C("autores", "Indicación de autores o partícipes si se conocen", "Ley 906 de 2004, art. 69", "MEDIA", "—"),
    C("juramento", "Manifestación bajo juramento", "Ley 906 de 2004, art. 69", "ALTA", "—"),
  ],
  DEMANDA_PROTECCION_CONSUMIDOR: [...DEMANDA_CGP.filter((c) => !["juramento_estimatorio", "envio_simultaneo"].includes(c.id)), C("reclamacion_previa", "Prueba de la reclamación directa previa", "Ley 1480 de 2011, art. 58, num. 5", "BLOQUEANTE", "Inadmisión.")],
  RECLAMACION_SERVICIOS_PUBLICOS: [
    C("identificacion", "Identificación del suscriptor o usuario y del servicio", "Ley 142 de 1994, art. 152", "ALTA", "—"),
    C("acto", "Factura o decisión objeto de reclamación", "Ley 142 de 1994, art. 154", "BLOQUEANTE", "—"),
    C("motivos", "Motivos de inconformidad", "Ley 142 de 1994, art. 154", "BLOQUEANTE", "—"),
    C("oportunidad", "Dentro de los cinco días hábiles siguientes a la notificación, para los recursos", "Ley 142 de 1994, art. 154", "BLOQUEANTE", "Rechazo por extemporáneo."),
  ],
  ACCION_POPULAR: [
    C("derecho_colectivo", "Indicación del derecho o interés colectivo amenazado", "Ley 472 de 1998, art. 18", "BLOQUEANTE", "Inadmisión."),
    C("hechos", "Hechos, actos, acciones u omisiones que motivan la petición", "Ley 472 de 1998, art. 18", "BLOQUEANTE", "Inadmisión."),
    C("pretensiones", "Enunciación de las pretensiones", "Ley 472 de 1998, art. 18", "BLOQUEANTE", "Inadmisión."),
    C("responsable", "Indicación de la persona natural o jurídica responsable", "Ley 472 de 1998, art. 18", "ALTA", "Inadmisión."),
    C("pruebas", "Pruebas", "Ley 472 de 1998, art. 18", "MEDIA", "—"),
    C("requerimiento", "Prueba del requerimiento previo", "CPACA art. 144", "BLOQUEANTE", "Rechazo."),
  ],
  ACCION_GRUPO: [
    C("grupo", "Identificación del grupo (al menos veinte personas) y criterios que lo conforman", "Ley 472 de 1998, arts. 46 y 52", "BLOQUEANTE", "Inadmisión."),
    C("hechos", "Hechos que causaron el daño en condiciones uniformes", "Ley 472 de 1998, art. 52", "BLOQUEANTE", "Inadmisión."),
    C("pretensiones", "Estimación del valor de los perjuicios", "Ley 472 de 1998, art. 52", "BLOQUEANTE", "Inadmisión."),
    C("demandado", "Identificación del demandado", "Ley 472 de 1998, art. 52", "ALTA", "Inadmisión."),
    C("pruebas", "Pruebas", "Ley 472 de 1998, art. 52", "MEDIA", "—"),
  ],
  ACCION_CUMPLIMIENTO: [
    C("norma", "Norma con fuerza material de ley o acto administrativo incumplido", "Ley 393 de 1997, art. 10", "BLOQUEANTE", "Rechazo."),
    C("hechos", "Narración de los hechos", "Ley 393 de 1997, art. 10", "BLOQUEANTE", "Corrección."),
    C("renuencia", "Prueba de la renuencia", "Ley 393 de 1997, arts. 8 y 10", "BLOQUEANTE", "Rechazo."),
    C("juramento", "Manifestación bajo juramento de no haber presentado otra solicitud por los mismos hechos", "Ley 393 de 1997, art. 10", "ALTA", "—"),
  ],
  IMPUGNACION_TUTELA: [C("fallo", "Identificación del fallo impugnado", "Decreto 2591 de 1991, art. 31", "ALTA", "—"), C("razones", "Razones de la impugnación", "Decreto 2591 de 1991, art. 31", "ALTA", "—")],
  INCIDENTE_DESACATO: [C("fallo", "Identificación del fallo y de la orden incumplida", "Decreto 2591 de 1991, art. 52", "BLOQUEANTE", "—"), C("incumplimiento", "Prueba del incumplimiento", "Decreto 2591 de 1991, art. 52", "ALTA", "—")],
  ALEGATOS_CONCLUSION: [C("sintesis", "Síntesis de hechos probados y valoración de la prueba", "Práctica procesal", "ALTA", "—"), C("conclusion", "Conclusiones y solicitud", "Práctica procesal", "ALTA", "—")],
  MEMORIAL_GENERICO: [C("proceso", "Identificación del proceso", "Práctica procesal", "ALTA", "—"), C("solicitud", "Solicitud concreta", "Práctica procesal", "ALTA", "—")],
};

export function componentesDe(tipoPieza: string): ComponentePieza[] {
  return COMPONENTES_POR_PIEZA[tipoPieza] ?? COMPONENTES_POR_PIEZA.MEMORIAL_GENERICO!;
}
