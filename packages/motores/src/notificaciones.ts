import { CALENDARIO_POR_DEFECTO, type ConfiguracionCalendario, siguienteHabil, sumarDiasHabiles } from "./calendario";
import { type Fecha, fechaLarga, maxFecha, minFecha } from "./fechas";

/* Módulo 17 · notificaciones y comunicaciones procesales (Ley 2213 de 2022 y CGP). */

export interface ResultadoNotificacionElectronica {
  surtidaPorEnvio: Fecha;
  surtidaPorAcuse: Fecha | null;
  terminosDesdePorEnvio: Fecha;
  terminosDesdePorAcuse: Fecha | null;
  referenciaDeTrabajo: Fecha;
  perspectiva: "RECEPTOR" | "REMITENTE";
  explicacion: string;
}

/**
 * Art. 8 Ley 2213 de 2022: la notificación personal por mensaje de datos se
 * entiende realizada transcurridos dos días hábiles siguientes al envío; los
 * términos corren desde el día siguiente. Con acuse de recibo o constancia de
 * acceso se calcula también esa fecha. Se toma la más conservadora según quién
 * soporta el riesgo: quien recibe (la más temprana) o quien notifica y debe
 * probarla (la más tardía).
 */
export function notificacionElectronica(envio: Fecha, acuse: Fecha | null, perspectiva: "RECEPTOR" | "REMITENTE", cfg: ConfiguracionCalendario = CALENDARIO_POR_DEFECTO): ResultadoNotificacionElectronica {
  const surtidaPorEnvio = sumarDiasHabiles(envio, 2, "JUDICIAL", cfg);
  const terminosDesdePorEnvio = siguienteHabil(surtidaPorEnvio, "JUDICIAL", cfg);
  const surtidaPorAcuse = acuse ? sumarDiasHabiles(acuse, 2, "JUDICIAL", cfg) : null;
  const terminosDesdePorAcuse = surtidaPorAcuse ? siguienteHabil(surtidaPorAcuse, "JUDICIAL", cfg) : null;
  const referenciaDeTrabajo = terminosDesdePorAcuse
    ? (perspectiva === "RECEPTOR" ? minFecha(terminosDesdePorEnvio, terminosDesdePorAcuse) : maxFecha(terminosDesdePorEnvio, terminosDesdePorAcuse))
    : terminosDesdePorEnvio;
  return {
    surtidaPorEnvio, surtidaPorAcuse, terminosDesdePorEnvio, terminosDesdePorAcuse, referenciaDeTrabajo, perspectiva,
    explicacion: `Envío ${fechaLarga(envio)} → notificación surtida el ${fechaLarga(surtidaPorEnvio)}; términos desde el ${fechaLarga(terminosDesdePorEnvio)}.${acuse ? ` Con acuse del ${fechaLarga(acuse)}: surtida el ${fechaLarga(surtidaPorAcuse!)}, términos desde el ${fechaLarga(terminosDesdePorAcuse!)}.` : " Sin acuse de recibo registrado."} Referencia de trabajo (${perspectiva === "RECEPTOR" ? "quien recibe asume el riesgo: fecha más temprana" : "quien notifica debe probarla: fecha más tardía"}): ${fechaLarga(referenciaDeTrabajo)}.`,
  };
}

export interface PlanComunicacion {
  sujeto: string;
  forma: string;
  fundamento: string;
  obligacion: string;
}

/** Deberes de comunicación de la pieza que se radica (Ley 2213 de 2022, arts. 3, 5, 6 y 8). */
export function planDeComunicacion(tipoPieza: string, piden_medidas_cautelares: boolean): PlanComunicacion[] {
  const plan: PlanComunicacion[] = [];
  const esDemanda = tipoPieza.startsWith("DEMANDA") || tipoPieza === "ACCION_POPULAR" || tipoPieza === "ACCION_GRUPO";
  if (esDemanda) {
    plan.push({ sujeto: "Despacho judicial (reparto)", forma: "Radicación como mensaje de datos por el canal digital del despacho u oficina de reparto", fundamento: "Ley 2213 de 2022, art. 6", obligacion: "Indicar el canal digital de notificación de partes, representantes, apoderados, testigos y peritos." });
    if (!piden_medidas_cautelares) plan.push({ sujeto: "Demandado(s)", forma: "Envío simultáneo de la demanda y sus anexos por medio electrónico (o físico si se desconoce el canal digital)", fundamento: "Ley 2213 de 2022, art. 6, inc. 4", obligacion: "Aportar constancia del envío; su omisión es causal de inadmisión." });
    plan.push({ sujeto: "Demandado(s)", forma: "Notificación personal del auto admisorio por mensaje de datos a la dirección electrónica informada, con la manifestación bajo juramento de que es la utilizada por la persona", fundamento: "Ley 2213 de 2022, art. 8", obligacion: "Informar cómo se obtuvo la dirección y aportar las evidencias." });
  } else if (["ACCION_TUTELA", "DERECHO_PETICION", "RECLAMACION_SERVICIOS_PUBLICOS", "RECURSO_ADMINISTRATIVO", "QUERELLA_POLICIVA", "DENUNCIA_PENAL", "ACCION_CUMPLIMIENTO"].includes(tipoPieza)) {
    plan.push({ sujeto: "Autoridad o destinatario", forma: "Radicación por el canal oficial (sede electrónica, correo de notificaciones judiciales o ventanilla), conservando el número de radicado y la constancia", fundamento: "Ley 1437 de 2011, arts. 5 y 15 (Ley 1755 de 2015); Ley 2213 de 2022", obligacion: "Registrar la fecha de radicación: desde ella corre el término de respuesta." });
  } else {
    plan.push({ sujeto: "Despacho judicial", forma: "Memorial por el canal digital del despacho", fundamento: "Ley 2213 de 2022, art. 3", obligacion: "Enviar simultáneamente copia a los demás sujetos procesales." });
    plan.push({ sujeto: "Demás sujetos procesales", forma: "Copia del memorial por su canal digital", fundamento: "Ley 2213 de 2022, arts. 3 y 9 (el traslado se entiende surtido dos días hábiles después del envío)", obligacion: "Conservar la constancia de envío." });
  }
  return plan;
}
