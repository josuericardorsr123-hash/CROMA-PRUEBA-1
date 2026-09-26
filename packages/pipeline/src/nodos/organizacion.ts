import { type Hallazgo, type Hecho, nuevoId, type Parte, type PiezaDocumental, sha256, type Soporte } from "@em/dominio";
import { construirIndice, dividirPdf, empaquetar, indiceCsv } from "@em/documentos";
import { evaluarDocumentosRequeridos, nombreDocumento } from "@em/motores";
import type { ContextoNodo, ManejadorNodo } from "../contexto";
import { Consolidacion } from "../esquemas";
import { tarea } from "../ia";
import { bloques, vistaCaso, vistaEstadoProcesal, vistaLecturas, vistaMemoria } from "../vistas";
import { aviso, completado, decision, pausa, reiniciarAvisos } from "./comun";
import { registrarEntregable } from "./entregables";

/* Fase 3 (renombrado, organización cronológica y hechos), Módulo 12 (omisiones
 * de fondo) y compuerta de completitud. */

/** Tipologías que abren el expediente organizado (puerta de entrada documental). */
const PUERTA_DE_ENTRADA = ["PODER", "RELATO_CLIENTE", "SOLICITUD", "DERECHO_DE_PETICION", "QUEJA"];
const ORDEN_LEGIBILIDAD = ["ALTA", "MEDIA", "BAJA", "ILEGIBLE"] as const;

interface Segmento {
  archivoId: string;
  desde: number;
  hasta: number;
}

/** Divide cada archivo leído en documentos lógicos según la lectura (inicio de documento o cambio de tipología). */
export function segmentar(exp: ContextoNodo["exp"]): Segmento[] {
  const salida: Segmento[] = [];
  const archivos = exp.archivos.filter((a) => a.estado === "LEIDO").sort((a, b) => a.rutaRelativa.localeCompare(b.rutaRelativa));
  for (const a of archivos) {
    const paginas = exp.lecturas.filter((l) => l.archivoId === a.id).sort((x, y) => x.pagina - y.pagina);
    let actual: Segmento | null = null;
    let tipo = "";
    for (const l of paginas) {
      const cambia = l.tipologia !== tipo && l.tipologia !== "OTRO" && tipo !== "OTRO" && tipo !== "";
      if (!actual || l.iniciaDocumento || cambia) {
        if (actual) salida.push(actual);
        actual = { archivoId: a.id, desde: l.pagina, hasta: l.pagina };
        tipo = l.tipologia;
      } else actual.hasta = l.pagina;
    }
    if (actual) salida.push(actual);
  }
  return salida;
}

function contenidoDe(lecturas: ContextoNodo["exp"]["lecturas"]): string {
  const primera = lecturas[0]!;
  const actor = primera.actores.find((a) => !/juez|juzgado|notar|despacho/i.test(a.rol))?.nombre;
  return (actor ?? primera.tituloDocumento ?? primera.tipologia).slice(0, 60);
}

async function organizar(ctx: ContextoNodo): Promise<void> {
  const segmentos = segmentar(ctx.exp);
  const previas = new Map(ctx.exp.piezas.map((p) => [`${p.archivoId}|${p.paginaInicio}|${p.paginaFin}`, p]));
  const piezas: PiezaDocumental[] = segmentos.map((s) => {
    const ls = ctx.exp.lecturas.filter((l) => l.archivoId === s.archivoId && l.pagina >= s.desde && l.pagina <= s.hasta).sort((a, b) => a.pagina - b.pagina);
    const previa = previas.get(`${s.archivoId}|${s.desde}|${s.hasta}`);
    const legibilidad = ORDEN_LEGIBILIDAD[Math.max(...ls.map((l) => ORDEN_LEGIBILIDAD.indexOf(l.legibilidad)))] ?? "MEDIA";
    return {
      id: previa?.id ?? nuevoId("pza"), orden: 0, anexo: previa?.anexo ?? null, tipologia: ls[0]!.tipologia, contenido: contenidoDe(ls), fecha: ls.find((l) => l.fechaDocumento)?.fechaDocumento ?? null,
      nombreArchivo: "", archivoId: s.archivoId, paginaInicio: s.desde, paginaFin: s.hasta, paginas: s.hasta - s.desde + 1, blobId: previa?.blobId ?? null, sha256: previa?.sha256 ?? null,
      estado: ls.every((l) => l.relevancia === "POSIBLEMENTE_AJENO") ? "NO_RELACIONADO" : "ORGANIZADO", duplicadoDe: null,
      puertaDeEntrada: PUERTA_DE_ENTRADA.includes(ls[0]!.tipologia), legibilidad, origenFisico: ls[0]!.origenFisico, resumen: ls.map((l) => l.resumen).filter(Boolean).join(" ").slice(0, 900),
    };
  });
  // Orden: puerta de entrada primero; luego cronológico; sin fecha al final (estable por archivo y página).
  const posicion = new Map(segmentos.map((s, i) => [`${s.archivoId}|${s.desde}`, i]));
  piezas.sort((a, b) => Number(b.puertaDeEntrada) - Number(a.puertaDeEntrada) || (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || posicion.get(`${a.archivoId}|${a.paginaInicio}`)! - posicion.get(`${b.archivoId}|${b.paginaInicio}`)!);
  // División física (qpdf) y duplicados por huella del documento dividido.
  const porHuella = new Map<string, string>();
  for (const p of piezas) {
    const archivo = ctx.exp.archivos.find((a) => a.id === p.archivoId)!;
    if (!p.blobId && archivo.pdfCanonicoBlobId) {
      try {
        const pdf = await ctx.leerBlob(archivo.pdfCanonicoBlobId);
        const parte = p.paginaInicio === 1 && p.paginaFin === archivo.paginas ? pdf : await dividirPdf(pdf, p.paginaInicio, p.paginaFin);
        const g = await ctx.guardarBlob(parte, "application/pdf");
        p.blobId = g.blobId;
        p.sha256 = g.sha256;
      } catch (e) {
        aviso(ctx, `No se pudo dividir «${archivo.nombreOriginal}» (páginas ${p.paginaInicio}-${p.paginaFin}): ${(e as Error).message}`, "MEDIA");
      }
    }
    if (p.sha256 && p.estado === "ORGANIZADO") {
      const original = porHuella.get(p.sha256);
      if (original) p.estado = "DUPLICADO", p.duplicadoDe = original;
      else porHuella.set(p.sha256, p.id);
    }
  }
  // Numeración estable: un anexo asignado nunca cambia; los nuevos continúan la serie.
  let siguiente = piezas.reduce((m, p) => Math.max(m, p.anexo ?? 0), 0) + 1;
  piezas.forEach((p, i) => {
    p.orden = i + 1;
    if (p.estado === "ORGANIZADO" && p.anexo === null) p.anexo = siguiente++;
    if (p.estado !== "ORGANIZADO") p.anexo = null;
    p.nombreArchivo = nombreDocumento(p.orden, p.tipologia, p.contenido, p.fecha, "pdf");
  });
  ctx.exp.piezas = piezas;
}

function indiceElectronico(ctx: ContextoNodo) {
  const filas = construirIndice(ctx.exp.piezas.map((p) => {
    const archivo = ctx.exp.archivos.find((a) => a.id === p.archivoId);
    return {
      orden: p.orden, anexo: p.anexo, nombreDocumento: p.nombreArchivo, tipologia: p.tipologia, fechaDocumento: p.fecha, fechaIncorporacion: (archivo?.recibidoEn ?? ctx.ahora()).slice(0, 10),
      paginas: p.paginas, formato: "PDF", bytes: archivo?.bytes ?? 0, origen: p.origenFisico === "ELECTRONICO" ? "Electrónico" : p.origenFisico === "DESCONOCIDO" ? "No determinado" : "Digitalizado",
      sha256: p.sha256 ?? archivo?.sha256 ?? "", observaciones: [p.estado !== "ORGANIZADO" ? p.estado : "", p.legibilidad !== "ALTA" ? `Legibilidad ${p.legibilidad}` : "", p.duplicadoDe ? `Duplicado de ${ctx.exp.piezas.find((x) => x.id === p.duplicadoDe)?.nombreArchivo ?? p.duplicadoDe}` : ""].filter(Boolean).join("; "),
    };
  }));
  return filas;
}

const INSTRUCCION_CONSOLIDACION = `Con las lecturas página por página, el estado procesal oficial, la debida diligencia y el contexto que aportó el ABOGADO (USUARIO), consolida el caso:
- "partes": toda persona natural o jurídica con interés en el asunto, con su calidad (demandante, demandado, deudor, acreedor, empleador, trabajador, causante, heredero, autoridad…), si es el cliente, y su soporte documental. La identificación y los datos de contacto solo si constan.
- "hechos": cronología de hechos jurídicamente relevantes, en modo, tiempo y lugar, uno por evento, sin calificaciones jurídicas. Cada hecho con su estado (PROBADO_DOCUMENTAL solo si un documento lo respalda con su página; ACREDITADO_FUENTE_OFICIAL si lo acredita la consulta oficial; AFIRMADO_POR_CLIENTE si solo consta en el relato; INFERIDO con la premisa explícita; CONTROVERTIDO si las fuentes se contradicen, registrando la discrepancia).
- Los soportes deben citar exactamente archivoId y página tal como aparecen en LECTURAS.
- "area", "areasConcurrentes", "materia" y "tipoAsunto" según los hechos (no según la carátula del expediente), "rolCliente" desde la perspectiva del cliente y "objetivoCliente" en términos verificables.
- "documentosFaltantes": piezas que el asunto exige y no constan (poder, título, notificación, prueba de agotamiento, etc.), con gravedad y razón.`;

function soporteValido(ctx: ContextoNodo, s: { archivoId: string; pagina: number; cita: string | null }): Soporte | null {
  const a = ctx.exp.archivos.find((x) => x.id === s.archivoId);
  if (!a || s.pagina < 1 || (a.paginas && s.pagina > a.paginas)) return null;
  const pieza = ctx.exp.piezas.find((p) => p.archivoId === s.archivoId && s.pagina >= p.paginaInicio && s.pagina <= p.paginaFin);
  return { archivoId: s.archivoId, pagina: s.pagina, piezaId: pieza?.id ?? null, cita: s.cita };
}

/** Fase 3 · división, renombrado, orden cronológico, índice electrónico y reconstrucción de hechos. */
export const f3: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  await organizar(ctx);
  const c = await tarea(ctx, {
    tarea: "consolidacion", esquema: Consolidacion, nombreEsquema: "Consolidacion", instruccion: INSTRUCCION_CONSOLIDACION,
    contexto: bloques(vistaCaso(ctx.exp), vistaEstadoProcesal(ctx.exp), vistaMemoria(ctx.exp), vistaLecturas(ctx.exp, { maxCaracteres: 160_000 })),
  });
  const a = ctx.exp.analisis;
  Object.assign(a, { resumenCaso: c.resumenCaso, area: ctx.exp.contexto.area ?? c.area, areasConcurrentes: c.areasConcurrentes, materia: c.materia, tipoAsunto: c.tipoAsunto, rolCliente: ctx.exp.contexto.cliente?.rol ?? c.rolCliente, objetivoCliente: ctx.exp.contexto.objetivo ?? c.objetivoCliente });
  const hayOficial = ctx.exp.procedencias.some((p) => p.estado === "OK");
  ctx.exp.partes = c.partes.map((p): Parte => ({ id: nuevoId("par"), ...p, soportes: p.soportes.map((s) => soporteValido(ctx, s)).filter((s): s is Soporte => Boolean(s)) }));
  let degradados = 0;
  const hechos: Hecho[] = c.hechos.map((h) => {
    const soportes = h.soportes.map((s) => soporteValido(ctx, s)).filter((s): s is Soporte => Boolean(s));
    let estado = h.estado;
    // Un hecho solo se da por probado si un documento lo respalda con su folio.
    if ((estado === "PROBADO_DOCUMENTAL" && !soportes.length) || (estado === "ACREDITADO_FUENTE_OFICIAL" && !hayOficial)) estado = "INFERIDO", degradados++;
    return {
      id: nuevoId("hec"), numero: 0, descripcion: h.descripcion, fecha: h.fecha, fechaTexto: h.fechaTexto, lugar: h.lugar, modo: h.modo, actores: h.actores, estado, soportes,
      procedencias: estado === "ACREDITADO_FUENTE_OFICIAL" ? ctx.exp.procedencias.filter((p) => p.estado === "OK").map((p) => p.id) : [], relevanciaJuridica: h.relevanciaJuridica,
      discrepancias: h.discrepancias.map((d) => ({ descripcion: d.descripcion, resolucion: d.resolucion, criterio: d.criterio, versiones: d.versiones.map((v) => ({ texto: v.texto, soporte: v.archivoId && v.pagina ? soporteValido(ctx, { archivoId: v.archivoId, pagina: v.pagina, cita: null }) : null })) })),
    };
  });
  hechos.sort((x, y) => (x.fecha ?? "9999").localeCompare(y.fecha ?? "9999"));
  hechos.forEach((h, i) => (h.numero = i + 1));
  ctx.exp.hechos = hechos;
  if (degradados) aviso(ctx, `${degradados} hecho(s) sin soporte verificable se reclasificaron como INFERIDOS (no se presentan como probados).`, "MEDIA");
  ctx.exp.borradores.faltantesSugeridos = c.documentosFaltantes;

  // Entregables de la Fase 3: expediente organizado e índice electrónico.
  const filas = indiceElectronico(ctx);
  const csv = indiceCsv(filas);
  await registrarEntregable(ctx, { tipo: "INDICE_ELECTRONICO", modo: "BORRADOR", contenido: Buffer.from(csv, "utf8"), nombreArchivo: "00_INDICE_ELECTRONICO.csv", mime: "text/csv" });
  const archivos: Array<{ ruta: string; contenido: Buffer | string }> = [{ ruta: "00_INDICE_ELECTRONICO.csv", contenido: csv }];
  for (const p of ctx.exp.piezas.filter((x) => x.blobId && x.estado !== "DUPLICADO")) archivos.push({ ruta: `${p.estado === "ORGANIZADO" ? "" : "NO_RELACIONADOS/"}${p.nombreArchivo}`, contenido: await ctx.leerBlob(p.blobId!) });
  await registrarEntregable(ctx, { tipo: "EXPEDIENTE_ORGANIZADO", modo: "BORRADOR", contenido: empaquetar(archivos), nombreArchivo: "EXPEDIENTE_ORGANIZADO.zip", mime: "application/zip" });
  const organizados = ctx.exp.piezas.filter((p) => p.estado === "ORGANIZADO").length;
  return completado(`${organizados} documento(s) organizado(s) y renombrado(s), ${ctx.exp.partes.length} parte(s) y ${hechos.length} hecho(s) reconstruido(s) con soporte.`);
};

const RANGO = { BLOQUEANTE: 0, ALTA: 1, MEDIA: 2, BAJA: 3, INFORMATIVA: 4 } as const;

/** Módulo 12 · omisiones de fondo: catálogo del tipo de asunto + faltantes señalados en la consolidación + límites de lectura. */
export const m12: ManejadorNodo = async (ctx) => {
  const a = ctx.exp.analisis;
  const organizadas = ctx.exp.piezas.filter((p) => p.estado === "ORGANIZADO");
  const hallazgos: Hallazgo[] = [];
  for (const f of evaluarDocumentosRequeridos(a.tipoAsunto || a.materia, a.rolCliente, organizadas).filter((x) => !x.presente)) {
    hallazgos.push(ctx.hallazgo({ modulo: "m12", titulo: `Falta: ${f.requisito.descripcion}`, detalle: f.requisito.razon, gravedad: f.requisito.gravedad, recomendacion: "Solicitar el documento al cliente o registrar la decisión de continuar sin él." }));
  }
  for (const f of (ctx.exp.borradores.faltantesSugeridos as Array<{ descripcion: string; gravedad: "BLOQUEANTE" | "ALTA" | "MEDIA" | "BAJA"; razon: string }> | undefined) ?? []) {
    if (hallazgos.some((h) => h.titulo.toLowerCase().includes(f.descripcion.toLowerCase().slice(0, 25)))) continue;
    // La calificación BLOQUEANTE la reserva el catálogo verificable; la sugerida por el análisis se toma como ALTA.
    hallazgos.push(ctx.hallazgo({ modulo: "m12", titulo: `Posible faltante: ${f.descripcion}`, detalle: f.razon, gravedad: f.gravedad === "BLOQUEANTE" ? "ALTA" : f.gravedad, recomendacion: "Verificar con el cliente." }));
  }
  for (const b of ctx.exp.archivos.filter((x) => x.estado === "CIFRADO_BLOQUEADO")) hallazgos.push(ctx.hallazgo({ modulo: "m12", titulo: `Documento no legible: ${b.nombreOriginal}`, detalle: "Protegido con clave de apertura.", gravedad: "ALTA", recomendacion: "Aportar la clave del titular." }));
  const ilegibles = ctx.exp.lecturas.filter((l) => l.legibilidad === "ILEGIBLE");
  if (ilegibles.length) hallazgos.push(ctx.hallazgo({ modulo: "m12", titulo: `${ilegibles.length} página(s) ilegible(s)`, detalle: ilegibles.slice(0, 10).map((l) => `${ctx.exp.archivos.find((x) => x.id === l.archivoId)?.nombreOriginal ?? l.archivoId}, p. ${l.pagina}`).join("; "), gravedad: "MEDIA", soportes: ilegibles.slice(0, 10).map((l) => ({ archivoId: l.archivoId, pagina: l.pagina, piezaId: null, cita: null })), recomendacion: "Solicitar un mejor escaneo o el original." }));
  hallazgos.sort((x, y) => RANGO[x.gravedad] - RANGO[y.gravedad]);
  a.omisiones = hallazgos;
  const bloqueantes = hallazgos.filter((h) => h.gravedad === "BLOQUEANTE").length;
  return completado(`${hallazgos.length} omisión(es) detectada(s), ${bloqueantes} bloqueante(s).`);
};

/** Compuerta · ¿expediente completo? Continuar con vacíos solo por decisión expresa y registrada del ABOGADO (USUARIO). */
export const g_completo: ManejadorNodo = async (ctx) => {
  const bloqueantes = ctx.exp.analisis.omisiones.filter((o) => o.gravedad === "BLOQUEANTE");
  if (!bloqueantes.length) return decision("si", "Sin omisiones bloqueantes: hay material suficiente para el informe.");
  const continuar = ctx.instrucciones("CONTINUAR_CON_VACIOS")[0];
  if (continuar) {
    ctx.consumir(continuar);
    return decision("si", `El ABOGADO (USUARIO) decidió continuar con ${bloqueantes.length} vacío(s) bloqueante(s): ${continuar.motivo || "sin motivo adicional"}.`, { actor: continuar.usuarioId, anulacionHumana: true });
  }
  if (ctx.exp.entrantes.some((e) => !e.procesado)) return decision("no", "Se cargaron documentos nuevos: el expediente vuelve a recepción para incorporarlos.");
  return pausa(`Faltan piezas bloqueantes: ${bloqueantes.map((b) => b.titulo.replace(/^Falta: /, "")).join("; ")}. Cargue los documentos o decida continuar con los vacíos (la decisión queda registrada).`, ["CARGAR_DOCUMENTOS", "CONTINUAR_CON_VACIOS"], { faltantes: bloqueantes.map((b) => ({ titulo: b.titulo, detalle: b.detalle })) });
};

export { sha256 };
