import {
  CALENDARIO_POR_DEFECTO, type ConfiguracionCalendario, diasHabilesEntre, motivoInhabil, primerHabilDesde,
  restarDiasHabiles, sumarDiasHabiles,
} from "./calendario";
import { type EntradaTermino, entradaTermino, estaVerificado } from "./catalogo-terminos";
import { type Fecha, fechaLarga, sumarAnios, sumarDias, sumarMeses } from "./fechas";

export type EstadoCalculado = "CORRIENDO" | "RIESGO" | "RIESGO_INMINENTE" | "VENCIDO_APARENTE" | "SIN_TERMINO";

export interface UmbralesRiesgo {
  /** Disparador E1: término que vence en menos de este número de días hábiles. */
  riesgo: number;
  inminente: number;
  alertas: number[];
}

export const UMBRALES_POR_DEFECTO: UmbralesRiesgo = { riesgo: 15, inminente: 5, alertas: [15, 10, 5, 3, 1] };

export interface EntradaCalculo {
  termino: string | EntradaTermino;
  /** Hecho que dispara el cómputo (notificación, exigibilidad, publicación…). */
  fechaEvento: Fecha;
  /** Cuando la fecha no está determinada: extremo tardío del rango (doble cómputo, RD_28 / F9). */
  fechaEventoHasta?: Fecha | null;
  /** Documento o fuente de donde sale la fecha (obligatorio: sin él el cálculo no es auditable). */
  soporteFecha: string;
  fechaProvisional?: boolean;
  hoy: Fecha;
  calendario?: ConfiguracionCalendario;
  umbrales?: UmbralesRiesgo;
}

export interface ResultadoCalculo {
  terminoId: string;
  nombre: string;
  tipo: EntradaTermino["tipo"];
  norma: string;
  url: string | null;
  verificacionNorma: string;
  unidad: EntradaTermino["unidad"];
  cantidad: number;
  fechaEvento: Fecha;
  primerDia: Fecha | null;
  vencimiento: Fecha | null;
  vencimientoMasTemprano: Fecha | null;
  diasHabilesRestantes: number | null;
  estado: EstadoCalculado;
  esEstimacion: boolean;
  margen: string | null;
  alertas: Fecha[];
  explicacion: string[];
  advertencias: string[];
}

function vencimientoDesde(e: EntradaTermino, evento: Fecha, cfg: ConfiguracionCalendario, pasos: string[]): { primerDia: Fecha; vencimiento: Fecha } {
  const primerDia = e.inicioCuenta === "DIA_SIGUIENTE" ? sumarDias(evento, 1) : evento;
  switch (e.unidad) {
    case "DIAS_HABILES": {
      const v = sumarDiasHabiles(evento, e.cantidad, e.calendario, cfg);
      pasos.push(`Término de ${e.cantidad} día(s) hábil(es) contado(s) desde el día hábil siguiente al ${fechaLarga(evento)}; se excluyen fines de semana, festivos${e.calendario === "JUDICIAL" ? ", vacancia judicial y cierres del despacho" : ""}.`);
      pasos.push(`Último día del término: ${fechaLarga(v)}.`);
      return { primerDia, vencimiento: v };
    }
    case "DIAS_CALENDARIO": {
      const bruto = sumarDias(primerDia, e.cantidad - 1);
      const v = primerHabilDesde(bruto, e.calendario, cfg);
      pasos.push(`Término de ${e.cantidad} día(s) calendario desde el ${fechaLarga(primerDia)}: último día ${fechaLarga(bruto)}.`);
      if (v !== bruto) pasos.push(`El último día es inhábil (${motivoInhabil(bruto, e.calendario, cfg)}): se extiende al ${fechaLarga(v)}.`);
      return { primerDia, vencimiento: v };
    }
    case "MESES":
    case "ANIOS": {
      const bruto = e.unidad === "MESES" ? sumarMeses(primerDia, e.cantidad) : sumarAnios(primerDia, e.cantidad);
      const v = primerHabilDesde(bruto, e.calendario, cfg);
      pasos.push(`Término de ${e.cantidad} ${e.unidad === "MESES" ? "mes(es)" : "año(s)"} desde el ${fechaLarga(primerDia)}; el primero y el último día tienen el mismo número (art. 67 C.C.; art. 59 Ley 4 de 1913): ${fechaLarga(bruto)}.`);
      if (v !== bruto) pasos.push(`Ese día es inhábil (${motivoInhabil(bruto, e.calendario, cfg)}): se extiende al primer día hábil siguiente, ${fechaLarga(v)} (art. 118 CGP; art. 62 Ley 4 de 1913).`);
      return { primerDia, vencimiento: v };
    }
    default:
      throw new Error(`Unidad sin cómputo: ${e.unidad}`);
  }
}

function clasificar(vencimiento: Fecha, hoy: Fecha, e: EntradaTermino, cfg: ConfiguracionCalendario, u: UmbralesRiesgo): { estado: EstadoCalculado; restantes: number } {
  if (hoy > vencimiento) return { estado: "VENCIDO_APARENTE", restantes: -diasHabilesEntre(vencimiento, hoy, e.calendario, cfg) };
  const restantes = diasHabilesEntre(hoy, vencimiento, e.calendario, cfg);
  if (restantes <= u.inminente) return { estado: "RIESGO_INMINENTE", restantes };
  if (restantes <= u.riesgo) return { estado: "RIESGO", restantes };
  return { estado: "CORRIENDO", restantes };
}

/**
 * Módulo 8 · cálculo auditable de un término. Siempre devuelve la norma, la
 * fecha inicial, el documento de donde salió y el paso a paso. Nunca concluye
 * que una acción está perdida: eso lo afirma el ABOGADO (USUARIO).
 */
export function calcularTermino(entrada: EntradaCalculo): ResultadoCalculo {
  const e = typeof entrada.termino === "string" ? entradaTermino(entrada.termino) : entrada.termino;
  const cfg = entrada.calendario ?? CALENDARIO_POR_DEFECTO;
  const u = entrada.umbrales ?? UMBRALES_POR_DEFECTO;
  const explicacion: string[] = [`Norma: ${e.norma}. Hecho inicial: ${e.inicio}.`, `Fecha inicial tomada: ${fechaLarga(entrada.fechaEvento)} (fuente: ${entrada.soporteFecha}).`];
  const advertencias: string[] = [];
  if (!estaVerificado(e)) advertencias.push(`Término con verificación ${e.verificacion}: confirmar en fuente oficial antes de radicar con base en él.`);
  if (e.seAlega) advertencias.push("La prescripción debe alegarse; no se declara de oficio (art. 282 CGP). Verificar interrupción y suspensión.");
  if (e.deOficio) advertencias.push("La caducidad opera de oficio y no admite renuncia; solo se suspende en supuestos taxativos.");
  if (entrada.fechaProvisional) advertencias.push("La fecha inicial es provisional (extracción automática no confirmada): el resultado es una estimación.");
  for (const n of e.notas ?? []) advertencias.push(n);

  const base = {
    terminoId: e.id, nombre: e.nombre, tipo: e.tipo, norma: e.norma, url: e.url, verificacionNorma: e.verificacion,
    unidad: e.unidad, cantidad: e.cantidad, fechaEvento: entrada.fechaEvento,
  };

  if (e.unidad === "SIN_TERMINO") {
    explicacion.push("La ley no fija término de caducidad para esta acción.");
    return { ...base, primerDia: null, vencimiento: null, vencimientoMasTemprano: null, diasHabilesRestantes: null, estado: "SIN_TERMINO", esEstimacion: false, margen: null, alertas: [], explicacion, advertencias };
  }

  const principal = vencimientoDesde(e, entrada.fechaEvento, cfg, explicacion);
  let vencimiento = principal.vencimiento;
  let vencimientoMasTemprano: Fecha | null = null;
  let margen: string | null = null;
  let esEstimacion = Boolean(entrada.fechaProvisional) || e.tipo === "INMEDIATEZ";

  if (entrada.fechaEventoHasta && entrada.fechaEventoHasta !== entrada.fechaEvento) {
    const pasosTarde: string[] = [];
    const tardio = vencimientoDesde(e, entrada.fechaEventoHasta, cfg, pasosTarde);
    vencimientoMasTemprano = principal.vencimiento;
    vencimiento = tardio.vencimiento;
    esEstimacion = true;
    margen = `Fecha inicial no determinada entre ${fechaLarga(entrada.fechaEvento)} y ${fechaLarga(entrada.fechaEventoHasta)}: actuar antes del ${fechaLarga(vencimientoMasTemprano)} (escenario más desfavorable); el ${fechaLarga(vencimiento)} solo puede argumentarse con la carga de la prueba de la fecha a cargo de quien la conoce (art. 167 CGP).`;
    explicacion.push(`Doble cómputo por fecha no determinada. Escenario tardío: ${pasosTarde.join(" ")}`);
  }

  const referencia = vencimientoMasTemprano ?? vencimiento;
  const { estado, restantes } = clasificar(referencia, entrada.hoy, e, cfg, u);
  const alertas = u.alertas.map((k) => restarDiasHabiles(referencia, k, e.calendario, cfg)).filter((f) => f >= entrada.hoy).sort();
  if (estado === "VENCIDO_APARENTE") advertencias.unshift("Término APARENTEMENTE vencido: verificar interrupciones, suspensiones y reglas de modulación antes de cualquier conclusión; decide el ABOGADO (USUARIO).");
  if (estado === "RIESGO_INMINENTE" || estado === "RIESGO") advertencias.unshift(`Disparador E1: vence en ${restantes} día(s) hábil(es). La actuación que interrumpe o preserva el término tiene prioridad sobre el análisis de fondo.`);
  if (e.tipo === "INMEDIATEZ") advertencias.unshift("Referencia orientativa de inmediatez, no término legal de caducidad.");

  return { ...base, primerDia: principal.primerDia, vencimiento, vencimientoMasTemprano, diasHabilesRestantes: restantes, estado, esEstimacion, margen, alertas, explicacion, advertencias };
}
