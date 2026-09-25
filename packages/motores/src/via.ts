/* Módulo 15 · árbol de decisión de vía procesal. Bifurcaciones con condiciones
 * verificables (no apreciaciones) y registro de las vías descartadas. La
 * elección entre dos vías viables sigue siendo del ABOGADO (USUARIO). */

export type TipoPiezaVia =
  | "DEMANDA_VERBAL" | "DEMANDA_VERBAL_SUMARIA" | "DEMANDA_EJECUTIVA" | "DEMANDA_LABORAL_ORDINARIA" | "DEMANDA_CONTENCIOSA_ADMINISTRATIVA"
  | "DEMANDA_FAMILIA" | "CONTESTACION_DEMANDA" | "EXCEPCIONES_EJECUCION" | "RECURSO_REPOSICION" | "RECURSO_APELACION"
  | "RECURSO_REPOSICION_SUBSIDIO_APELACION" | "ACCION_TUTELA" | "IMPUGNACION_TUTELA" | "INCIDENTE_DESACATO" | "DERECHO_PETICION"
  | "RECURSO_ADMINISTRATIVO" | "SOLICITUD_CONCILIACION" | "SOLICITUD_NULIDAD" | "MEMORIAL_IMPULSO_PROCESAL" | "QUERELLA_POLICIVA"
  | "DENUNCIA_PENAL" | "DEMANDA_PROTECCION_CONSUMIDOR" | "RECLAMACION_SERVICIOS_PUBLICOS" | "ACCION_POPULAR" | "ACCION_GRUPO"
  | "ACCION_CUMPLIMIENTO" | "ALEGATOS_CONCLUSION" | "MEMORIAL_GENERICO";

export type EtapaProcesal =
  | "SIN_PROCESO" | "TRASLADO_DEMANDA" | "MANDAMIENTO_NOTIFICADO" | "AUTO_ADVERSO_NOTIFICADO" | "SENTENCIA_ADVERSA" | "FALLO_TUTELA_ADVERSO"
  | "FALLO_TUTELA_INCUMPLIDO" | "INACTIVO" | "ALEGATOS" | "ACTO_ADMINISTRATIVO_NOTIFICADO" | "EN_CURSO_OTRO";

export interface HechosVia {
  area: string;
  rolCliente: string | null;
  etapa: EtapaProcesal;
  autoApelable?: boolean;
  derechoFundamentalComprometido: boolean;
  otroMedioEficaz: boolean | null;
  perjuicioIrremediable: boolean;
  interesColectivo: boolean;
  grupoPlural: boolean;
  tituloEjecutivo: boolean;
  actoAdministrativoParticular: boolean;
  recursosAdministrativosEnTermino: boolean;
  danoAntijuridicoEstatal: boolean;
  incumplimientoNormaOActo: boolean;
  renuenciaConstituida: boolean;
  peticionSinRespuesta: boolean;
  requiereReclamacionPrevia: boolean;
  conductaPenal: boolean;
  perturbacionPosesion: boolean;
  relacionConsumo: boolean;
  reclamacionConsumoAgotada: boolean;
  servicioPublicoDomiciliario: boolean;
  nulidadProcesalConSoporte: boolean;
  conciliacionObligatoriaPendiente: boolean;
  cuantiaCategoria: string | null;
  urgente: boolean;
}

export interface Alternativa {
  via: string;
  pieza: TipoPiezaVia;
  fundamento: string;
}

export interface DecisionVia {
  principal: Alternativa;
  requisitosPrevios: string[];
  concurrentes: Alternativa[];
  descartadas: Array<{ via: string; razon: string }>;
  urgente: boolean;
  ramaRecorrida: string[];
}

const alt = (via: string, pieza: TipoPiezaVia, fundamento: string): Alternativa => ({ via, pieza, fundamento });

export function decidirVia(h: HechosVia): DecisionVia {
  const rama: string[] = [];
  const concurrentes: Alternativa[] = [];
  const descartadas: Array<{ via: string; razon: string }> = [];
  const requisitos: string[] = [];
  let principal: Alternativa | null = null;
  const demandado = h.rolCliente ? ["DEMANDADO", "EJECUTADO", "ACCIONADO", "CONVOCADO", "QUERELLADO", "INDICIADO"].includes(h.rolCliente) : false;

  // 1. Proceso en curso: la actuación siguiente la dicta la etapa.
  if (h.etapa !== "SIN_PROCESO") {
    rama.push(`Proceso en curso · etapa ${h.etapa}`);
    switch (h.etapa) {
      case "MANDAMIENTO_NOTIFICADO":
        principal = alt("Defensa en el proceso ejecutivo: excepciones de mérito", "EXCEPCIONES_EJECUCION", "CGP art. 442, num. 1 (diez días desde la notificación del mandamiento).");
        concurrentes.push(alt("Reposición contra el mandamiento de pago (requisitos formales del título y hechos de excepciones previas)", "RECURSO_REPOSICION", "CGP arts. 430 y 442, num. 3 (tres días)."));
        break;
      case "TRASLADO_DEMANDA":
        principal = alt("Contestación de la demanda con excepciones de mérito", "CONTESTACION_DEMANDA", "CGP art. 96; la prescripción debe alegarse aquí (art. 282).");
        concurrentes.push(alt("Excepciones previas en escrito separado", "MEMORIAL_GENERICO", "CGP arts. 100 y 101."));
        break;
      case "AUTO_ADVERSO_NOTIFICADO":
        principal = h.autoApelable
          ? alt("Reposición y en subsidio apelación contra el auto", "RECURSO_REPOSICION_SUBSIDIO_APELACION", "CGP arts. 318, 321 y 322.")
          : alt("Recurso de reposición contra el auto", "RECURSO_REPOSICION", "CGP art. 318.");
        break;
      case "SENTENCIA_ADVERSA":
        principal = alt("Recurso de apelación contra la sentencia (reparos concretos)", "RECURSO_APELACION", "CGP art. 322.");
        break;
      case "FALLO_TUTELA_ADVERSO":
        principal = alt("Impugnación del fallo de tutela", "IMPUGNACION_TUTELA", "Decreto 2591 de 1991, art. 31 (tres días).");
        break;
      case "FALLO_TUTELA_INCUMPLIDO":
        principal = alt("Incidente de desacato", "INCIDENTE_DESACATO", "Decreto 2591 de 1991, arts. 27 y 52.");
        break;
      case "INACTIVO":
        principal = alt("Memorial de impulso procesal (interrumpe el reloj del desistimiento tácito)", "MEMORIAL_IMPULSO_PROCESAL", "CGP art. 317.");
        break;
      case "ALEGATOS":
        principal = alt("Alegatos de conclusión", "ALEGATOS_CONCLUSION", "Etapa de alegaciones del proceso.");
        break;
      case "ACTO_ADMINISTRATIVO_NOTIFICADO":
        if (h.recursosAdministrativosEnTermino) principal = alt("Recursos en vía administrativa (reposición y apelación)", "RECURSO_ADMINISTRATIVO", "CPACA arts. 74 a 77; la apelación es presupuesto del medio de control (art. 161, num. 2).");
        else principal = alt("Medio de control de nulidad y restablecimiento del derecho", "DEMANDA_CONTENCIOSA_ADMINISTRATIVA", "CPACA arts. 138 y 164.");
        break;
      default:
        principal = alt("Memorial dentro del proceso", "MEMORIAL_GENERICO", "Actuación de parte según la etapa.");
    }
    if (h.nulidadProcesalConSoporte) {
      concurrentes.push(alt("Solicitud de nulidad procesal", "SOLICITUD_NULIDAD", "CGP arts. 133 a 138 (causal taxativa con soporte documental)."));
      rama.push("Nulidad con soporte: se ofrece como actuación concurrente; alegarla es decisión estratégica del ABOGADO (USUARIO).");
    }
    return { principal, requisitosPrevios: requisitos, concurrentes, descartadas, urgente: h.urgente, ramaRecorrida: rama };
  }

  // 2. Sin proceso: se recorren las vías de mayor especificidad a la general.
  rama.push("Sin proceso en curso");
  if (h.derechoFundamentalComprometido) {
    if (h.otroMedioEficaz === false || h.perjuicioIrremediable) {
      principal = alt(h.perjuicioIrremediable && h.otroMedioEficaz !== false ? "Acción de tutela como mecanismo transitorio" : "Acción de tutela", "ACCION_TUTELA", "C.P. art. 86; Decreto 2591 de 1991, arts. 1, 6 y 8.");
      rama.push("Derecho fundamental comprometido sin otro medio eficaz o con perjuicio irremediable → tutela");
    } else {
      descartadas.push({ via: "Acción de tutela", razon: "Existe otro medio de defensa judicial eficaz y no se acredita perjuicio irremediable (subsidiariedad, Decreto 2591 de 1991, art. 6, num. 1)." });
    }
  }
  if (!principal && h.peticionSinRespuesta) {
    principal = alt("Acción de tutela por vulneración del derecho de petición", "ACCION_TUTELA", "C.P. art. 23; Ley 1755 de 2015. La tutela protege la respuesta de fondo, no que sea favorable.");
    rama.push("Petición sin respuesta en término → tutela por derecho de petición");
  }
  if (!principal && h.interesColectivo) {
    principal = alt("Acción popular", "ACCION_POPULAR", "C.P. art. 88; Ley 472 de 1998.");
    requisitos.push("Requerimiento previo a la autoridad o particular (CPACA art. 144), salvo perjuicio irremediable.");
  } else if (h.interesColectivo) descartadas.push({ via: "Acción popular", razon: "Se prioriza la vía principal elegida; evaluar su concurrencia." });
  if (!principal && h.grupoPlural) principal = alt("Acción de grupo", "ACCION_GRUPO", "C.P. art. 88; Ley 472 de 1998, arts. 46 y ss. (dos años de caducidad).");
  if (!principal && h.incumplimientoNormaOActo) {
    principal = alt("Acción de cumplimiento", "ACCION_CUMPLIMIENTO", "C.P. art. 87; Ley 393 de 1997.");
    if (!h.renuenciaConstituida) {
      requisitos.push("Constituir en renuencia a la autoridad (Ley 393 de 1997, art. 8).");
      concurrentes.push(alt("Solicitud de cumplimiento para constituir la renuencia", "DERECHO_PETICION", "Ley 393 de 1997, art. 8."));
    }
  }
  if (!principal && h.servicioPublicoDomiciliario) principal = alt("Reclamación y recursos ante la empresa prestadora", "RECLAMACION_SERVICIOS_PUBLICOS", "Ley 142 de 1994, arts. 152 a 159.");
  if (!principal && h.actoAdministrativoParticular) {
    principal = h.recursosAdministrativosEnTermino
      ? alt("Recursos en vía administrativa", "RECURSO_ADMINISTRATIVO", "CPACA arts. 74 a 77.")
      : alt("Medio de control de nulidad y restablecimiento del derecho", "DEMANDA_CONTENCIOSA_ADMINISTRATIVA", "CPACA arts. 138 y 164.");
    if (!h.recursosAdministrativosEnTermino) requisitos.push("Acreditar recursos obligatorios decididos (CPACA art. 161, num. 2) y conciliación extrajudicial cuando sea exigible.");
  }
  if (!principal && h.danoAntijuridicoEstatal) {
    principal = alt("Medio de control de reparación directa", "DEMANDA_CONTENCIOSA_ADMINISTRATIVA", "C.P. art. 90; CPACA arts. 140 y 164 (dos años).");
    if (h.conciliacionObligatoriaPendiente) {
      requisitos.push("Agotar la conciliación extrajudicial ante el Ministerio Público (CPACA art. 161).");
      concurrentes.push(alt("Solicitud de conciliación extrajudicial (suspende la caducidad)", "SOLICITUD_CONCILIACION", "Ley 2220 de 2022; CPACA art. 161."));
    }
  }
  if (!principal && h.tituloEjecutivo && !demandado) {
    principal = alt("Proceso ejecutivo", "DEMANDA_EJECUTIVA", "CGP arts. 422 y ss.");
    descartadas.push({ via: "Proceso declarativo", razon: "Existe título ejecutivo: el declarativo sería innecesario y más lento." });
  }
  if (!principal && h.conductaPenal) principal = alt("Denuncia o querella penal", "DENUNCIA_PENAL", "Ley 906 de 2004, arts. 66 a 74.");
  if (!principal && h.perturbacionPosesion) principal = alt("Querella policiva de amparo a la posesión o tenencia", "QUERELLA_POLICIVA", "Ley 1801 de 2016 (proceso verbal abreviado).");
  if (!principal && h.relacionConsumo) {
    principal = h.reclamacionConsumoAgotada
      ? alt("Acción de protección al consumidor", "DEMANDA_PROTECCION_CONSUMIDOR", "Ley 1480 de 2011, art. 56 y 58.")
      : alt("Reclamación directa al proveedor (requisito previo)", "DERECHO_PETICION", "Ley 1480 de 2011, art. 58, num. 5.");
  }
  if (!principal && h.requiereReclamacionPrevia) principal = alt("Derecho de petición (reclamación o solicitud previa)", "DERECHO_PETICION", "C.P. art. 23; Ley 1755 de 2015.");
  if (!principal && (h.area === "LABORAL" || h.area === "SEGURIDAD_SOCIAL")) principal = alt("Proceso ordinario laboral", "DEMANDA_LABORAL_ORDINARIA", "CPTSS arts. 25 y ss.");
  if (!principal && h.area === "FAMILIA") principal = h.conciliacionObligatoriaPendiente
    ? alt("Conciliación extrajudicial en familia (requisito de procedibilidad)", "SOLICITUD_CONCILIACION", "Ley 2220 de 2022.")
    : alt("Proceso de familia", "DEMANDA_FAMILIA", "CGP arts. 21, 22 y 368 y ss.");
  if (!principal) {
    if (h.conciliacionObligatoriaPendiente) {
      principal = alt("Conciliación extrajudicial en derecho (requisito de procedibilidad)", "SOLICITUD_CONCILIACION", "Ley 2220 de 2022.");
      concurrentes.push(alt("Demanda declarativa una vez agotada la conciliación", h.cuantiaCategoria === "MINIMA" ? "DEMANDA_VERBAL_SUMARIA" : "DEMANDA_VERBAL", "CGP arts. 368 y 390."));
    } else {
      principal = h.cuantiaCategoria === "MINIMA"
        ? alt("Proceso verbal sumario (mínima cuantía, única instancia)", "DEMANDA_VERBAL_SUMARIA", "CGP art. 390.")
        : alt("Proceso verbal", "DEMANDA_VERBAL", "CGP art. 368.");
    }
  }
  if (h.urgente) {
    rama.push("Término en riesgo: se privilegia la actuación que interrumpe o suspende el término (la demanda presentada y notificada en término interrumpe la prescripción e impide la caducidad, art. 94 CGP; la solicitud de conciliación suspende el término).");
  }
  if (principal.pieza !== "ACCION_TUTELA" && !descartadas.some((d) => d.via === "Acción de tutela")) {
    descartadas.push({ via: "Acción de tutela", razon: h.derechoFundamentalComprometido ? "Se prefiere la vía principal; la tutela solo como transitoria ante perjuicio irremediable." : "No se identifica derecho fundamental comprometido." });
  }
  return { principal, requisitosPrevios: requisitos, concurrentes, descartadas, urgente: h.urgente, ramaRecorrida: rama };
}
