import { definicionCapacidad, ErrorCroma, type IdCapacidad, normalizarProceso, type ResultadoConsulta } from "@em/croma";
import { type EstadoProcesal, type HallazgoDiligencia, nuevoId } from "@em/dominio";
import type { ContextoNodo, ManejadorNodo } from "../contexto";
import { aviso, completado, reiniciarAvisos } from "./comun";

/* e2 · fuentes oficiales de HECHOS vía Croma: vigilancia judicial (M30), debida
 * diligencia (M31) y memoria institucional disociada (M26). Toda ausencia se
 * declara como NO VERIFICADO; nada se suple con memoria del modelo. */

async function consultar(ctx: ContextoNodo, capacidad: IdCapacidad, canonicos: Record<string, unknown>, opciones: { finalidad?: string; autorizada?: boolean } = {}): Promise<ResultadoConsulta | null> {
  try {
    const r = await ctx.s.croma.consultar(capacidad, canonicos, opciones);
    await ctx.procedencia(r.procedencia, r.estado === "OK" || r.estado === "SIN_RESULTADOS" ? r.texto : null);
    return r;
  } catch (e) {
    if (e instanceof ErrorCroma && e.codigo === "NO_AUTORIZADO") {
      aviso(ctx, e.message, "MEDIA");
      return null;
    }
    throw e;
  }
}

/** Módulo 30 · vigilancia judicial: estado procesal y última actuación oficial de cada radicado. */
export const m30: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const radicados = [...new Set(ctx.exp.entidades.filter((e) => e.tipo === "RADICADO").map((e) => e.normalizado).filter((r) => /^\d{23}$/.test(r)))];
  if (!radicados.length) return completado("Sin radicados judiciales de 23 dígitos en el expediente.");
  if (!ctx.s.croma.configurado) {
    aviso(ctx, `Croma no está configurado (CROMA_API_KEY): el estado procesal de ${radicados.length} radicado(s) queda NO VERIFICADO en fuente oficial.`, "ALTA");
    ctx.exp.analisis.estadosProcesales = [];
    return completado("Estado procesal NO VERIFICADO: sin conexión a fuentes oficiales.");
  }
  const estados: EstadoProcesal[] = [];
  for (const radicado of radicados) {
    let r = await consultar(ctx, "procesos.por_radicado", { radicado });
    if ((!r || r.estado !== "OK") && (await ctx.s.croma.disponible("procesos.contencioso"))) r = await consultar(ctx, "procesos.contencioso", { radicado });
    if (r?.estado === "OK") {
      const n = normalizarProceso(r.datos);
      estados.push({
        radicado: n.radicado ?? radicado, despacho: n.despacho, claseProceso: n.claseProceso, sujetos: n.sujetos, ultimaActuacion: n.ultimaActuacion,
        actuaciones: n.actuaciones.slice(0, 200), fuente: `${r.procedencia.herramienta ?? "Croma"} (${r.procedencia.tipo})`, procedencias: [r.procedencia.id], consultadoEn: r.procedencia.consultadoEn,
      });
      if (!n.ultimaActuacion?.fecha) aviso(ctx, `Radicado ${radicado}: la fuente oficial no informa la fecha de la última actuación; el reloj de desistimiento tácito no puede calcularse.`, "MEDIA");
    } else {
      aviso(ctx, `Radicado ${radicado}: ${r?.estado === "SIN_RESULTADOS" ? "la fuente oficial no devolvió resultados" : `consulta fallida (${r?.procedencia.error ?? "sin respuesta"})`}. Estado procesal NO VERIFICADO.`, "MEDIA");
    }
  }
  ctx.exp.analisis.estadosProcesales = estados;
  return completado(`${estados.length} de ${radicados.length} radicado(s) acreditado(s) en fuente oficial.`);
};

/** Patrón de alerta por capacidad, con negaciones frecuentes de las respuestas oficiales. */
const ALERTAS: Partial<Record<IdCapacidad, RegExp>> = {
  "empresas.rues": /cancelad|liquidaci[oó]n|disuelt|inactiv|no\s+renov/i,
  "tributario.rut": /suspendid|cancelad|inactiv/i,
  "vehiculos.runt": /embargo|prenda|pignora|limitaci[oó]n|hurtad|robad/i,
  "vehiculos.simit": /comparendo|multa|pendiente/i,
  "insolvencia.sicaac": /insolvencia|admitid|aceptad|negociaci[oó]n\s+de\s+deudas/i,
  "antecedentes.procuraduria": /inhabilidad|sanci[oó]n|registra\s+antecedentes/i,
  "antecedentes.contraloria": /responsable\s+fiscal|reportad/i,
  "deudores.contaduria": /moros|reportad/i,
  "antecedentes.policia": /registra\s+antecedentes|requerid/i,
  "disciplinario.abogados": /sanci[oó]n|suspendid|excluid/i,
  "identidad.cedula": /cancelad|no\s+vigente|fallecid|baja/i,
  "procesos.por_nombre": /radicad/i,
};
const NEGACION = /no\s+(registra|tiene|presenta|se\s+encontr|reporta)|sin\s+(antecedentes|registros|resultados)|ning[uú]n/i;

function alertaDe(capacidad: IdCapacidad, texto: string): boolean {
  const re = ALERTAS[capacidad];
  if (!re) return false;
  const coincide = re.test(texto);
  if (!coincide) return false;
  return !(NEGACION.test(texto) && !/\d+\s+(comparendo|multa|proceso)/i.test(texto));
}

/** Módulo 31 · debida diligencia de partes, con finalidad declarada por consulta. */
export const m31: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const plan: Array<{ capacidad: IdCapacidad; canonicos: Record<string, unknown>; sujeto: string; finalidad: string; autorizada: boolean; relevancia: string }> = [];
  const vistos = new Set<string>();
  const agregar = (x: (typeof plan)[number]) => {
    const k = `${x.capacidad}|${JSON.stringify(x.canonicos)}`;
    if (!vistos.has(k)) vistos.add(k), plan.push(x);
  };
  // Registros públicos: solo si el dato consta en el expediente.
  for (const e of ctx.exp.entidades) {
    if (e.tipo === "NIT") {
      const nit = e.normalizado.split("-")[0]!;
      agregar({ capacidad: "empresas.rues", canonicos: { nit }, sujeto: e.atributos.titular ?? `NIT ${e.normalizado}`, finalidad: definicionCapacidad("empresas.rues").finalidad, autorizada: false, relevancia: "Existencia, estado y representación legal de una parte persona jurídica." });
    }
    if (e.tipo === "PLACA") {
      agregar({ capacidad: "vehiculos.runt", canonicos: { placa: e.normalizado }, sujeto: `Vehículo ${e.normalizado}`, finalidad: definicionCapacidad("vehiculos.runt").finalidad, autorizada: false, relevancia: "Estado registral del vehículo del caso (titularidad, limitaciones)." });
      agregar({ capacidad: "vehiculos.simit", canonicos: { placa: e.normalizado }, sujeto: `Vehículo ${e.normalizado}`, finalidad: definicionCapacidad("vehiculos.simit").finalidad, autorizada: false, relevancia: "Obligaciones de tránsito que afectan el bien." });
    }
    if (e.tipo === "CUFE") agregar({ capacidad: "tributario.factura_cufe", canonicos: { cufe: e.normalizado }, sujeto: "Factura electrónica", finalidad: definicionCapacidad("tributario.factura_cufe").finalidad, autorizada: false, relevancia: "Validez de la factura aportada como título o prueba." });
  }
  // Datos personales: solo sujetos y capacidades autorizados expresamente por el ABOGADO (USUARIO).
  for (const d of ctx.exp.contexto.diligencia) {
    for (const cap of d.capacidades) {
      let def;
      try {
        def = definicionCapacidad(cap as IdCapacidad);
      } catch {
        aviso(ctx, `Capacidad de diligencia desconocida: ${cap}.`, "BAJA");
        continue;
      }
      const canonicos: Record<string, unknown> = {};
      if ("documento" in def.parametros && d.identificacion) canonicos.documento = d.identificacion.replace(/\D/g, "");
      if ("nit" in def.parametros && d.identificacion && d.tipoIdentificacion === "NIT") canonicos.nit = d.identificacion.replace(/\D/g, "").slice(0, 9);
      if ("nombre" in def.parametros) canonicos.nombre = d.sujeto;
      if (!Object.keys(canonicos).length) {
        aviso(ctx, `${def.descripcion}: falta la identificación de ${d.sujeto} para consultar.`, "BAJA");
        continue;
      }
      agregar({ capacidad: def.id, canonicos, sujeto: d.sujeto, finalidad: d.finalidad || def.finalidad, autorizada: true, relevancia: d.finalidad });
    }
  }
  if (!plan.length) {
    ctx.exp.analisis.diligencia = [];
    return completado("Sin consultas de debida diligencia pertinentes o autorizadas.");
  }
  if (!ctx.s.croma.configurado) {
    aviso(ctx, `Croma no está configurado: ${plan.length} consulta(s) de debida diligencia quedan NO VERIFICADAS.`, "MEDIA");
    ctx.exp.analisis.diligencia = [];
    return completado("Debida diligencia NO VERIFICADA: sin conexión a fuentes oficiales.");
  }
  const hallazgos: HallazgoDiligencia[] = [];
  for (const c of plan) {
    if (!(await ctx.s.croma.disponible(c.capacidad))) {
      aviso(ctx, `Croma no expone la capacidad ${c.capacidad} (${definicionCapacidad(c.capacidad).descripcion}): consulta NO VERIFICADA para ${c.sujeto}.`, "BAJA");
      continue;
    }
    const r = await consultar(ctx, c.capacidad, c.canonicos, { finalidad: c.finalidad, autorizada: c.autorizada });
    if (!r) continue;
    const resultado = r.estado === "OK" ? (r.procedencia.resumen ?? r.texto.slice(0, 280)) : r.estado === "SIN_RESULTADOS" ? "Sin registros en la fuente oficial." : `NO VERIFICADO: ${r.procedencia.error ?? r.estado}`;
    hallazgos.push({
      id: nuevoId("dil"), sujeto: c.sujeto, fuente: r.procedencia.herramienta ?? definicionCapacidad(c.capacidad).descripcion, capacidad: c.capacidad, finalidad: c.finalidad,
      resultado, relevancia: c.relevancia, alerta: r.estado === "OK" && alertaDe(c.capacidad, r.texto), procedencias: [r.procedencia.id],
    });
  }
  ctx.exp.analisis.diligencia = hallazgos;
  const alertas = hallazgos.filter((h) => h.alerta);
  for (const a of alertas) aviso(ctx, `Debida diligencia · ${a.sujeto}: ${a.resultado}`, "ALTA");
  return completado(`${hallazgos.length} consulta(s) de debida diligencia; ${alertas.length} con alerta.`);
};

/** Módulo 26 · memoria institucional: lecciones disociadas aplicables al área del caso. */
export const m26: ManejadorNodo = async (ctx) => {
  if (!ctx.s.memoria) return completado("Memoria institucional no configurada en este despliegue.");
  const area = ctx.exp.analisis.area ?? ctx.exp.contexto.area ?? null;
  const lecciones = await ctx.s.memoria.lecciones(area);
  ctx.exp.borradores.memoria = lecciones.map((l) => ({ tipo: l.tipo, area: l.area, contenido: l.contenido, usos: l.usos }));
  return completado(`${lecciones.length} lección(es) disociada(s) recuperada(s)${area ? ` para el área ${area}` : ""}.`);
};
