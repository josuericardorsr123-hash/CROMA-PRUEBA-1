import type { Expediente, Fuente } from "@em/dominio";
import { type CitaDetectada, claveIdentificador, extraerCitas } from "@em/motores";

/* Módulo 21 aplicado a los borradores: toda cita escrita en el informe o en la
 * pieza debe corresponder a una fuente verificada. La que no corresponde se
 * retira del texto (nunca llega al documento) y queda registrada. */

export interface ResultadoAuditoria {
  exactas: Array<{ cita: CitaDetectada; fuente: Fuente }>;
  /** El artículo citado no se verificó individualmente, pero su cuerpo normativo sí. */
  porCuerpo: Array<{ cita: CitaDetectada; fuente: Fuente }>;
  noVerificadas: CitaDetectada[];
}

export function auditarTexto(exp: Expediente, texto: string): ResultadoAuditoria {
  const verificadas = exp.fuentes.filter((f) => f.resolucion !== "NO_RESUELTA");
  const porClave = new Map(verificadas.map((f) => [claveIdentificador(f.identificador), f]));
  const porBase = new Map<string, Fuente>();
  for (const f of verificadas) {
    const c = extraerCitas(f.identificador)[0];
    if (c && (c.clase === "NORMA" || c.clase === "CODIGO")) porBase.set(claveIdentificador(c.identificadorBase), f);
  }
  const r: ResultadoAuditoria = { exactas: [], porCuerpo: [], noVerificadas: [] };
  for (const c of extraerCitas(texto)) {
    const exacta = porClave.get(claveIdentificador(c.identificador)) ?? porClave.get(claveIdentificador(c.identificadorBase));
    if (exacta) r.exactas.push({ cita: c, fuente: exacta });
    else if ((c.clase === "NORMA" || c.clase === "CODIGO") && porBase.has(claveIdentificador(c.identificadorBase))) r.porCuerpo.push({ cita: c, fuente: porBase.get(claveIdentificador(c.identificadorBase))! });
    else r.noVerificadas.push(c);
  }
  return r;
}

/** Reemplaza en el texto cada cita no verificada por una marca visible. */
export function retirarCitas(texto: string, citas: CitaDetectada[]): string {
  let salida = texto;
  for (const c of [...citas].sort((a, b) => b.inicio - a.inicio)) salida = `${salida.slice(0, c.inicio)}[cita retirada: no verificada en fuente oficial]${salida.slice(c.fin)}`;
  return salida;
}

/** Etiqueta breve y verificable de una fuente para notas al pie. */
export function etiquetaFuente(f: Fuente): string {
  const vigencia = f.clase === "NORMA" || f.clase === "TRATADO" ? ` Vigencia: ${f.vigencia.replace(/_/g, " ").toLowerCase()}${f.condicionamiento ? ` (${f.condicionamiento})` : ""}.` : "";
  const fuerza = f.fuerzaVinculante ? ` Fuerza vinculante: ${f.fuerzaVinculante.replace(/_/g, " ").toLowerCase()}.` : "";
  const resolucion = { TEXTO_OFICIAL: "texto obtenido de la fuente oficial", EXISTENCIA_CONFIRMADA: "existencia confirmada en dominio oficial (sin texto completo)", REPOSITORIO: "ficha verificada del repositorio del despacho", APORTADA_POR_ABOGADO: "fuente aportada por el ABOGADO (USUARIO)", NO_RESUELTA: "no resuelta" }[f.resolucion];
  return `${f.autoridad}, ${f.titulo}${f.titulo.includes(f.identificador) ? "" : ` (${f.identificador})`}. Verificación: ${resolucion}.${vigencia}${fuerza}`;
}

const anio = (f: Fuente) => f.fecha?.slice(0, 4) ?? /\bde\s+(\d{4})\b/.exec(f.identificador)?.[1] ?? /-(\d{2})\b/.exec(f.identificador)?.[1]?.replace(/^/, "20") ?? "s. f.";

/** Referencia en formato APA simplificado. */
export function referenciaApa(f: Fuente): string {
  const titulo = f.clase === "PROVIDENCIA" ? `Sentencia ${f.identificador}` : f.titulo;
  return `${f.autoridad}. (${anio(f)}). ${titulo.replace(/\.$/, "")}.${f.url ? ` ${f.url}` : ""}`;
}

/** Atribución corta de una cita en bloque: autor, año y título. */
export function atribucionApa(f: Fuente): string {
  return `${f.autoridad}. (${anio(f)}). ${f.clase === "PROVIDENCIA" ? `Sentencia ${f.identificador}` : f.titulo}.`;
}
