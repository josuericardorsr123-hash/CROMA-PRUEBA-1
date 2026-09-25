/* Aritmética de fechas civiles AAAA-MM-DD en UTC: los términos se cuentan por
 * días y una zona horaria mal aplicada corre un vencimiento un día entero. */

export type Fecha = string; // AAAA-MM-DD

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function aDate(f: Fecha): Date {
  const m = RE.exec(f);
  if (!m) throw new Error(`Fecha inválida (AAAA-MM-DD): ${f}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== f) throw new Error(`Fecha inexistente: ${f}`);
  return d;
}

export function aFecha(d: Date): Fecha {
  return d.toISOString().slice(0, 10);
}

export function esFechaValida(f: string): boolean {
  try {
    aDate(f);
    return true;
  } catch {
    return false;
  }
}

export function sumarDias(f: Fecha, dias: number): Fecha {
  const d = aDate(f);
  d.setUTCDate(d.getUTCDate() + dias);
  return aFecha(d);
}

export function diferenciaDias(desde: Fecha, hasta: Fecha): number {
  return Math.round((aDate(hasta).getTime() - aDate(desde).getTime()) / 86_400_000);
}

/** 0 = domingo … 6 = sábado */
export function diaSemana(f: Fecha): number {
  return aDate(f).getUTCDay();
}

export function ultimoDiaDelMes(anio: number, mes1a12: number): number {
  return new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate();
}

/**
 * Suma meses conservando el número del día (art. 67 C.C.; art. 59 Ley 4 de 1913:
 * "El primero y último día de un plazo de meses o años deberán tener un mismo
 * número en los respectivos meses"). Si ese número no existe en el mes de
 * destino, se toma el último día de ese mes.
 */
export function sumarMeses(f: Fecha, meses: number): Fecha {
  const d = aDate(f);
  const total = d.getUTCMonth() + meses;
  const anio = d.getUTCFullYear() + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const dia = Math.min(d.getUTCDate(), ultimoDiaDelMes(anio, mes + 1));
  return aFecha(new Date(Date.UTC(anio, mes, dia)));
}

export function sumarAnios(f: Fecha, anios: number): Fecha {
  return sumarMeses(f, anios * 12);
}

export function maxFecha(a: Fecha, b: Fecha): Fecha {
  return a >= b ? a : b;
}

export function minFecha(a: Fecha, b: Fecha): Fecha {
  return a <= b ? a : b;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "25 de septiembre de 2026" */
export function fechaLarga(f: Fecha): string {
  const d = aDate(f);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** Interpreta fechas en español frecuentes en expedientes: 12/03/2024, 12-03-2024, 12 de marzo de 2024, 2024-03-12. */
export function interpretarFecha(texto: string): Fecha | null {
  const t = texto.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return normalizar(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return normalizar(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de|del)\s+(\d{4})$/.exec(t);
  if (m) {
    const mes = MESES.indexOf(m[2]!.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    if (mes >= 0) return normalizar(Number(m[3]), mes + 1, Number(m[1]));
  }
  return null;
}

function normalizar(anio: number, mes: number, dia: number): Fecha | null {
  const f = `${anio.toString().padStart(4, "0")}-${mes.toString().padStart(2, "0")}-${dia.toString().padStart(2, "0")}`;
  return esFechaValida(f) ? f : null;
}
