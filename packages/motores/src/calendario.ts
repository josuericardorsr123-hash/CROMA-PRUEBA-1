import { aDate, aFecha, diaSemana, sumarDias, type Fecha } from "./fechas";

/* ────────────────────────────────────────────────────────────────────────────
 * Calendario judicial colombiano.
 *  - Festivos: Ley 51 de 1983 (traslado al lunes) y festivos móviles de Pascua.
 *  - Términos de días: se excluyen vacancia judicial y días de cierre del
 *    despacho (art. 118 CGP). La vacancia colectiva y la de Semana Santa se
 *    modelan como configuración verificable, porque dependen del régimen del
 *    despacho y de los acuerdos del Consejo Superior de la Judicatura.
 * ──────────────────────────────────────────────────────────────────────────── */

export type TipoCalendario = "JUDICIAL" | "ADMINISTRATIVO" | "CALENDARIO";

export interface ConfiguracionCalendario {
  /** Vacancia colectiva (por defecto 20 de diciembre a 10 de enero, inclusive). */
  vacanciaColectiva: { desdeMesDia: string; hastaMesDia: string } | null;
  /** Lunes, martes y miércoles santos como vacancia judicial. */
  vacanciaSemanaSanta: boolean;
  /** Cierres extraordinarios (paros, suspensión de términos, traslados de sede): AAAA-MM-DD. */
  cierres: Fecha[];
  /** Días hábiles adicionales que por acuerdo se habilitan (excepcional). */
  habilitados: Fecha[];
}

export const CALENDARIO_POR_DEFECTO: ConfiguracionCalendario = {
  vacanciaColectiva: { desdeMesDia: "12-20", hastaMesDia: "01-10" },
  vacanciaSemanaSanta: true,
  cierres: [],
  habilitados: [],
};

export function domingoDePascua(anio: number): Fecha {
  // Algoritmo gregoriano anónimo (Meeus/Jones/Butcher)
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return aFecha(new Date(Date.UTC(anio, mes - 1, dia)));
}

function lunesSiguiente(f: Fecha): Fecha {
  const ds = diaSemana(f);
  return ds === 1 ? f : sumarDias(f, (8 - ds) % 7);
}

const cacheFestivos = new Map<number, Map<Fecha, string[]>>();

/** Festivos nacionales del año: {fecha → nombres} (dos festivos pueden coincidir, p. ej. 30 de junio de 2025). */
export function festivosColombia(anio: number): Map<Fecha, string[]> {
  const guardado = cacheFestivos.get(anio);
  if (guardado) return guardado;
  const salida = new Map<Fecha, string[]>();
  const add = (f: Fecha, nombre: string) => salida.set(f, [...(salida.get(f) ?? []), nombre]);
  const p = (mes: number, dia: number) => `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  // Fijos
  add(p(1, 1), "Año Nuevo");
  add(p(5, 1), "Día del Trabajo");
  add(p(7, 20), "Independencia de Colombia");
  add(p(8, 7), "Batalla de Boyacá");
  add(p(12, 8), "Inmaculada Concepción");
  add(p(12, 25), "Navidad");
  // Trasladables al lunes (Ley 51 de 1983)
  add(lunesSiguiente(p(1, 6)), "Reyes Magos");
  add(lunesSiguiente(p(3, 19)), "San José");
  add(lunesSiguiente(p(6, 29)), "San Pedro y San Pablo");
  add(lunesSiguiente(p(8, 15)), "Asunción de la Virgen");
  add(lunesSiguiente(p(10, 12)), "Día de la Raza");
  add(lunesSiguiente(p(11, 1)), "Todos los Santos");
  add(lunesSiguiente(p(11, 11)), "Independencia de Cartagena");
  // Móviles ligados a la Pascua
  const pascua = domingoDePascua(anio);
  add(sumarDias(pascua, -3), "Jueves Santo");
  add(sumarDias(pascua, -2), "Viernes Santo");
  add(sumarDias(pascua, 43), "Ascensión del Señor");
  add(sumarDias(pascua, 64), "Corpus Christi");
  add(sumarDias(pascua, 71), "Sagrado Corazón de Jesús");
  const ordenado = new Map([...salida.entries()].sort(([a], [b]) => a.localeCompare(b)));
  cacheFestivos.set(anio, ordenado);
  return ordenado;
}

export function esFestivo(f: Fecha): boolean {
  return festivosColombia(Number(f.slice(0, 4))).has(f);
}

export function esFinDeSemana(f: Fecha): boolean {
  const d = diaSemana(f);
  return d === 0 || d === 6;
}

export function enVacanciaColectiva(f: Fecha, cfg: ConfiguracionCalendario): boolean {
  if (!cfg.vacanciaColectiva) return false;
  const md = f.slice(5);
  const { desdeMesDia: desde, hastaMesDia: hasta } = cfg.vacanciaColectiva;
  return desde <= hasta ? md >= desde && md <= hasta : md >= desde || md <= hasta;
}

export function enVacanciaSemanaSanta(f: Fecha, cfg: ConfiguracionCalendario): boolean {
  if (!cfg.vacanciaSemanaSanta) return false;
  const pascua = domingoDePascua(Number(f.slice(0, 4)));
  return f >= sumarDias(pascua, -6) && f <= sumarDias(pascua, -4); // lunes a miércoles santos
}

/** Motivo por el cual un día no es hábil en el calendario indicado; null si es hábil. */
export function motivoInhabil(f: Fecha, tipo: TipoCalendario, cfg: ConfiguracionCalendario = CALENDARIO_POR_DEFECTO): string | null {
  if (cfg.habilitados.includes(f)) return null;
  if (esFinDeSemana(f)) return diaSemana(f) === 0 ? "domingo" : "sábado";
  const festivo = festivosColombia(Number(f.slice(0, 4))).get(f);
  if (festivo) return `festivo (${festivo.join(" y ")})`;
  if (tipo === "JUDICIAL") {
    if (enVacanciaColectiva(f, cfg)) return "vacancia judicial colectiva";
    if (enVacanciaSemanaSanta(f, cfg)) return "vacancia judicial de Semana Santa";
    if (cfg.cierres.includes(f)) return "cierre del despacho o suspensión de términos";
  }
  return null;
}

export function esHabil(f: Fecha, tipo: TipoCalendario = "JUDICIAL", cfg: ConfiguracionCalendario = CALENDARIO_POR_DEFECTO): boolean {
  return motivoInhabil(f, tipo, cfg) === null;
}

/** Último día de un término de n días hábiles cuyo cómputo arranca el primer día hábil posterior al evento. */
export function sumarDiasHabiles(evento: Fecha, n: number, tipo: TipoCalendario = "JUDICIAL", cfg: ConfiguracionCalendario = CALENDARIO_POR_DEFECTO): Fecha {
  if (n <= 0) return evento;
  let d = evento;
  let contados = 0;
  let guardia = 0;
  while (contados < n) {
    d = sumarDias(d, 1);
    if (esHabil(d, tipo, cfg)) contados += 1;
    if (++guardia > 20_000) throw new Error("Cómputo de días hábiles desbordado");
  }
  return d;
}

/** n días hábiles antes de la fecha (para alertas escalonadas). */
export function restarDiasHabiles(f: Fecha, n: number, tipo: TipoCalendario = "JUDICIAL", cfg: ConfiguracionCalendario = CALENDARIO_POR_DEFECTO): Fecha {
  let d = f;
  let contados = 0;
  let guardia = 0;
  while (contados < n) {
    d = sumarDias(d, -1);
    if (esHabil(d, tipo, cfg)) contados += 1;
    if (++guardia > 20_000) throw new Error("Cómputo de días hábiles desbordado");
  }
  return d;
}

/** Días hábiles transcurridos después de `desde` y hasta `hasta` inclusive (negativo si hasta < desde). */
export function diasHabilesEntre(desde: Fecha, hasta: Fecha, tipo: TipoCalendario = "JUDICIAL", cfg: ConfiguracionCalendario = CALENDARIO_POR_DEFECTO): number {
  if (hasta === desde) return 0;
  const signo = hasta > desde ? 1 : -1;
  const [a, b] = signo === 1 ? [desde, hasta] : [hasta, desde];
  let cuenta = 0;
  for (let d = sumarDias(a, 1); d <= b; d = sumarDias(d, 1)) if (esHabil(d, tipo, cfg)) cuenta += 1;
  return cuenta * signo;
}

/** Si el día es inhábil, se extiende al primer día hábil siguiente (art. 118 CGP; art. 62 Ley 4 de 1913). */
export function primerHabilDesde(f: Fecha, tipo: TipoCalendario = "JUDICIAL", cfg: ConfiguracionCalendario = CALENDARIO_POR_DEFECTO): Fecha {
  let d = f;
  let guardia = 0;
  while (!esHabil(d, tipo, cfg)) {
    d = sumarDias(d, 1);
    if (++guardia > 400) throw new Error("No se encontró día hábil");
  }
  return d;
}

/** Día hábil siguiente (estrictamente posterior) al indicado. */
export function siguienteHabil(f: Fecha, tipo: TipoCalendario = "JUDICIAL", cfg: ConfiguracionCalendario = CALENDARIO_POR_DEFECTO): Fecha {
  return primerHabilDesde(sumarDias(f, 1), tipo, cfg);
}

export function listarInhabiles(anio: number, tipo: TipoCalendario = "JUDICIAL", cfg: ConfiguracionCalendario = CALENDARIO_POR_DEFECTO): Array<{ fecha: Fecha; motivo: string }> {
  const salida: Array<{ fecha: Fecha; motivo: string }> = [];
  for (let d = `${anio}-01-01`; d <= `${anio}-12-31`; d = sumarDias(d, 1)) {
    if (esFinDeSemana(d)) continue;
    const m = motivoInhabil(d, tipo, cfg);
    if (m) salida.push({ fecha: d, motivo: m });
  }
  return salida;
}

export { aDate };
