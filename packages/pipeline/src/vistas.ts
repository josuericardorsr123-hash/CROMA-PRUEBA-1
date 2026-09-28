import type { Expediente } from "@em/dominio";
import type { BloqueContexto } from "@em/ia";

/* Vistas compactas del expediente para los prompts: cada elemento lleva su
 * identificador (archivoId, hechoId, fuenteId) para que la salida pueda citarlo,
 * y cada vista tiene presupuesto de caracteres para no desbordar el contexto. */

const j = (v: unknown) => JSON.stringify(v, null, 0);

function recortar(t: string, max: number): string {
  return t.length <= max ? t : `${t.slice(0, max)}… [recortado: ${t.length - max} caracteres]`;
}

export function vistaCaso(exp: Expediente): BloqueContexto {
  const a = exp.analisis;
  return {
    titulo: "CASO",
    texto: j({
      titulo: exp.titulo,
      contextoInicial: exp.contexto,
      area: a.area, areasConcurrentes: a.areasConcurrentes, materia: a.materia, tipoAsunto: a.tipoAsunto, rolCliente: a.rolCliente, objetivoCliente: a.objetivoCliente,
      resumen: a.resumenCaso,
    }),
  };
}

export function vistaPartes(exp: Expediente): BloqueContexto {
  return { titulo: "PARTES", texto: exp.partes.map((p) => j({ id: p.id, nombre: p.nombre, identificacion: p.identificacion, tipo: p.tipoPersona, calidad: p.calidad, esCliente: p.esCliente, apoderado: p.apoderado, domicilio: p.domicilio, correo: p.correo, proteccionEspecial: p.proteccionEspecial })).join("\n") || "(sin partes identificadas)" };
}

export function vistaHechos(exp: Expediente): BloqueContexto {
  return {
    titulo: "HECHOS",
    texto: exp.hechos.map((h) => j({ id: h.id, n: h.numero, fecha: h.fecha, fechaTexto: h.fechaTexto, lugar: h.lugar, descripcion: h.descripcion, estado: h.estado, soportes: h.soportes.map((s) => `${s.archivoId}#p${s.pagina}`), relevancia: h.relevanciaJuridica })).join("\n") || "(sin hechos reconstruidos)",
  };
}

export function vistaDocumentos(exp: Expediente): BloqueContexto {
  const piezas = exp.piezas.filter((p) => p.estado === "ORGANIZADO");
  const filas = piezas.length
    ? piezas.map((p) => j({ anexo: p.anexo, orden: p.orden, nombre: p.nombreArchivo, tipologia: p.tipologia, fecha: p.fecha, archivoId: p.archivoId, paginas: `${p.paginaInicio}-${p.paginaFin}`, resumen: p.resumen }))
    : exp.archivos.map((a) => j({ archivoId: a.id, nombre: a.nombreOriginal, estado: a.estado, paginas: a.paginas }));
  return { titulo: "DOCUMENTOS", texto: filas.join("\n") || "(sin documentos)" };
}

/** Lecturas por página: resumen siempre; transcripción mientras quepa en el presupuesto. */
export function vistaLecturas(exp: Expediente, o: { maxCaracteres?: number; archivos?: string[]; soloRelevantes?: boolean } = {}): BloqueContexto {
  const max = o.maxCaracteres ?? 120_000;
  let usados = 0;
  const lineas: string[] = [];
  const lecturas = exp.lecturas.filter((l) => (!o.archivos || o.archivos.includes(l.archivoId)) && (!o.soloRelevantes || l.relevancia === "RELEVANTE"));
  for (const l of lecturas) {
    const base = { archivoId: l.archivoId, pagina: l.pagina, tipologia: l.tipologia, titulo: l.tituloDocumento, fecha: l.fechaDocumento, fechaTexto: l.fechaTexto, actores: l.actores, legibilidad: l.legibilidad, resumen: l.resumen };
    const disponible = Math.max(0, max - usados - 600);
    const transcripcion = disponible > 200 ? recortar(l.transcripcion, Math.min(disponible, 6000)) : "";
    const linea = j({ ...base, transcripcion });
    usados += linea.length;
    lineas.push(linea);
  }
  return { titulo: "LECTURAS", texto: lineas.join("\n") || "(sin lecturas)" };
}

export function vistaFuentes(exp: Expediente, o: { conTexto?: boolean; maxPorFuente?: number } = {}): BloqueContexto {
  const utilizables = exp.fuentes.filter((f) => f.resolucion !== "NO_RESUELTA");
  return {
    titulo: "FUENTES VERIFICADAS",
    texto: utilizables.map((f) => j({
      id: f.id, clase: f.clase, identificador: f.identificador, titulo: f.titulo, autoridad: f.autoridad, fecha: f.fecha, url: f.url, resolucion: f.resolucion, vigencia: f.vigencia,
      condicionamiento: f.condicionamiento, fuerzaVinculante: f.fuerzaVinculante, analogia: f.analogia?.nivel ?? null, ratio: f.ratio,
      ...(o.conTexto ? { texto: recortar(f.textoRelevante ?? "", o.maxPorFuente ?? 3000) } : {}),
    })).join("\n") || "(no hay fuentes verificadas: no se puede invocar fundamento alguno)",
  };
}

export function vistaProblemas(exp: Expediente): BloqueContexto {
  return { titulo: "PROBLEMAS JURÍDICOS", texto: exp.problemas.map((p) => j(p)).join("\n") || "(sin problemas formulados)" };
}

export function vistaEstadoProcesal(exp: Expediente): BloqueContexto {
  const a = exp.analisis;
  return { titulo: "ESTADO PROCESAL OFICIAL Y DEBIDA DILIGENCIA", texto: j({ procesos: a.estadosProcesales.map((e) => ({ ...e, actuaciones: e.actuaciones.slice(0, 15) })), diligencia: a.diligencia }) };
}

export function vistaTerminos(exp: Expediente): BloqueContexto {
  return { titulo: "TÉRMINOS", texto: exp.terminos.map((t) => j({ id: t.id, tipo: t.tipo, descripcion: t.descripcion, norma: t.norma, inicio: t.fechaInicio, soporte: t.fechaInicioSoporte, vencimiento: t.vencimiento, masTemprano: t.vencimientoMasTemprano, estado: t.estado, diasHabiles: t.diasHabilesRestantes, estimacion: t.esEstimacion })).join("\n") || "(sin términos calculados)" };
}

export function vistaAnalisis(exp: Expediente): BloqueContexto {
  const a = exp.analisis;
  return {
    titulo: "ANÁLISIS",
    texto: j({
      subsuncion: a.subsuncion, zonasGrises: a.zonasGrises, omisiones: a.omisiones.map((o) => ({ titulo: o.titulo, gravedad: o.gravedad })), nulidades: a.nulidades,
      derechosFundamentales: a.derechosFundamentales, competencia: a.competencia, matrizProbatoria: a.matrizProbatoria, trampas: a.trampas.map((t) => ({ titulo: t.titulo, gravedad: t.gravedad, detalle: t.detalle })),
      procedibilidad: a.procedibilidad.map((p) => ({ requisito: p.requisito, estado: p.estado, norma: p.norma })), masc: a.masc, bloque: a.bloqueConstitucionalidad, conceptos: a.conceptosAdministrativos,
    }),
  };
}

export function vistaEstrategia(exp: Expediente): BloqueContexto {
  return { titulo: "ESTRATEGIA", texto: exp.estrategia ? j(exp.estrategia) : "(sin estrategia)" };
}

export function vistaCorrecciones(exp: Expediente): BloqueContexto | null {
  if (!exp.correcciones.length && !exp.lecciones.length) return null;
  return { titulo: "CORRECCIONES DEL ABOGADO (USUARIO) QUE DEBEN ATENDERSE", texto: j({ correcciones: exp.correcciones.map((c) => ({ tipo: c.tipo, clase: c.clase, descripcion: c.descripcion, seccion: c.seccionAfectada })), lecciones: exp.lecciones }) };
}

export function vistaMemoria(exp: Expediente): BloqueContexto | null {
  const m = exp.borradores.memoria as Array<{ tipo: string; contenido: unknown }> | undefined;
  return m?.length ? { titulo: "MEMORIA INSTITUCIONAL (disociada)", texto: m.map((x) => j(x)).join("\n") } : null;
}

export const bloques = (...b: Array<BloqueContexto | null | undefined>): BloqueContexto[] => b.filter((x): x is BloqueContexto => Boolean(x));
