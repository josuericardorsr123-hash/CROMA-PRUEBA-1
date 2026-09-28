import { type ArchivoOriginal, type Entidad, type LecturaPagina, nuevoId, type TipoEntidad } from "@em/dominio";
import {
  type ArchivoRecibido, capacidadesDocumentales, detectarMime, leerJpeg, lotesDePaginas, type PaginaPreparada, pdfDeImagenesJpeg, pdfDeImagenesPng, pdfDeTexto,
  prepararDocumento, recibir,
} from "@em/documentos";
import type { Adjunto } from "@em/ia";
import { interpretarFecha } from "@em/motores";
import type { ContextoNodo, ManejadorNodo } from "../contexto";
import { LecturaLote } from "../esquemas";
import { tarea } from "../ia";
import { aviso, completado, enParalelo, pausa, reiniciarAvisos } from "./comun";

/* e1–e2 · ingreso, recepción (Fase 1), lectura íntegra (Fase 2) y extracción
 * de entidades (Módulo 29). */

export const n_exp: ManejadorNodo = async (ctx) => {
  const pendientes = ctx.exp.entrantes.filter((e) => !e.procesado);
  if (!ctx.exp.entrantes.length && !ctx.exp.archivos.length) {
    return pausa("El expediente no tiene archivos: cargue la carpeta o el comprimido del caso tal como se recibió.", ["CARGAR_DOCUMENTOS"]);
  }
  return completado(`${ctx.exp.entrantes.length} archivo(s) cargado(s); ${pendientes.length} pendiente(s) de recepción.`);
};

function estadoDe(r: ArchivoRecibido): ArchivoOriginal["estado"] {
  if (r.duplicadoDe) return "DUPLICADO";
  if (r.cifrado === "REQUIERE_CLAVE") return "CIFRADO_BLOQUEADO";
  if (!r.soportado) return "NO_SOPORTADO";
  if (r.pdfDescifrado) return "DESCIFRADO";
  return "RECIBIDO";
}

/** Fase 1 · recepción: huella, duplicados, cifrado, formatos y comprimidos. Nada se descarta sin rastro. */
export const f1: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const cap = await capacidadesDocumentales();
  if (!cap.qpdf) aviso(ctx, "qpdf no está instalado: no se detecta ni se retira el cifrado de los PDF.", "MEDIA");
  const porHash = new Map(ctx.exp.archivos.map((a) => [a.sha256, a.rutaRelativa]));
  const idPorRuta = new Map(ctx.exp.archivos.map((a) => [a.rutaRelativa, a.id]));
  let nuevos = 0;
  const conteo: Record<string, number> = {};
  for (const entrante of ctx.exp.entrantes.filter((e) => !e.procesado)) {
    const contenido = await ctx.leerBlob(entrante.blobId);
    const recibidos = await recibir([{ nombre: entrante.nombre, rutaRelativa: entrante.rutaRelativa, contenido }], { hashesPrevios: porHash, qpdf: cap.qpdf, pdfinfo: cap.pdfinfo });
    for (const r of recibidos) {
      const directo = r.rutaRelativa === entrante.rutaRelativa;
      const blobId = directo ? entrante.blobId : (await ctx.guardarBlob(r.contenido, r.mime, r.nombre)).blobId;
      const estado = estadoDe(r);
      const archivo: ArchivoOriginal = {
        id: nuevoId("arc"), nombreOriginal: r.nombre, rutaRelativa: r.rutaRelativa, blobId, sha256: r.sha256, bytes: r.bytes, mime: r.mime, recibidoEn: ctx.ahora(),
        estado, duplicadoDe: r.duplicadoDe ? idPorRuta.get(r.duplicadoDe) ?? r.duplicadoDe : null, pdfCanonicoBlobId: null, paginas: r.paginas,
        originalCifradoBlobId: null, notas: [...r.notas, ...(directo ? [] : [`Extraído del comprimido ${entrante.nombre}.`])],
      };
      if (r.pdfDescifrado) {
        archivo.pdfCanonicoBlobId = (await ctx.guardarBlob(r.pdfDescifrado, "application/pdf", r.nombre)).blobId;
        archivo.originalCifradoBlobId = blobId;
      }
      ctx.exp.archivos.push(archivo);
      if (!r.duplicadoDe) {
        porHash.set(r.sha256, r.rutaRelativa);
        idPorRuta.set(r.rutaRelativa, archivo.id);
      }
      conteo[estado] = (conteo[estado] ?? 0) + 1;
      nuevos += 1;
    }
    entrante.procesado = true;
    entrante.procesadoEn = ctx.ahora();
  }
  const bloqueados = ctx.exp.archivos.filter((a) => a.estado === "CIFRADO_BLOQUEADO");
  for (const b of bloqueados) aviso(ctx, `«${b.nombreOriginal}» está protegido con clave de apertura: se conserva el original; aporte la clave del titular para leerlo.`, "ALTA");
  for (const n of ctx.exp.archivos.filter((a) => a.estado === "NO_SOPORTADO")) aviso(ctx, `«${n.nombreOriginal}»: ${n.notas.join(" ") || "formato no soportado para lectura automática"}`, "MEDIA");
  return completado(`${nuevos} archivo(s) recibido(s): ${Object.entries(conteo).map(([k, v]) => `${v} ${k}`).join(", ") || "sin novedades"}.`);
};

/** PDF canónico de una imagen (para foliar, dividir y anexar). */
function pdfDeImagen(contenido: Buffer, mime: string): Buffer | null {
  try {
    if (mime === "image/png") return pdfDeImagenesPng([contenido]);
    if (mime === "image/jpeg") {
      leerJpeg(contenido);
      return pdfDeImagenesJpeg([contenido]);
    }
  } catch {
    return null;
  }
  return null;
}

function textoAPaginas(texto: string): string[][] {
  const lineas = texto.split(/\r?\n/).flatMap((l) => (l.length ? l.match(/.{1,95}(\s|$)|\S+/g) ?? [l] : [""]));
  const paginas: string[][] = [];
  for (let i = 0; i < lineas.length; i += 48) paginas.push(lineas.slice(i, i + 48));
  return paginas.length ? paginas : [[""]];
}

const INSTRUCCION_LECTURA = (etiquetas: string[], anterior: string | null) => `Lee íntegramente las páginas de este lote de un expediente y devuelve una entrada por cada página, sin omitir ninguna.

Páginas del lote:
${etiquetas.join("\n")}
${anterior ? `\nContinuidad: la página inmediatamente anterior a este lote era ${anterior}.` : ""}

Reglas de lectura:
- Nunca des una página por ilegible sin intentarlo. Transcribe lo legible y marca [ilegible] donde no se pueda leer; legibilidad ILEGIBLE solo si no se puede leer nada útil.
- "transcripcion": en páginas VISUAL transcribe fielmente todo el texto visible, incluidos sellos, firmas (como [firma]) y anotaciones manuscritas; en páginas TEXTO devuelve cadena vacía (el texto embebido ya se conserva).
- "iniciaDocumento": true si la página abre un documento lógico distinto del de la página anterior (nuevo título, membrete, fecha, destinatario o tipo de documento).
- "tipologia": en mayúsculas y sin tildes, del catálogo PODER, CEDULA, CERTIFICADO_EXISTENCIA, RUT, PAGARE, LETRA, CHEQUE, FACTURA, CONTRATO, OTROSI, ACTA, DEMANDA, CONTESTACION, MEMORIAL, AUTO, MANDAMIENTO_DE_PAGO, SENTENCIA, NOTIFICACION, CITATORIO, CORREO, DERECHO_DE_PETICION, RESPUESTA, QUEJA, RECURSO, ACTO_ADMINISTRATIVO, CERTIFICADO, REGISTRO_CIVIL, HISTORIA_CLINICA, DICTAMEN, RECIBO, EXTRACTO, LIQUIDACION, CONSTANCIA, DECLARACION, FOTOGRAFIA, RELATO_CLIENTE, OTRO; usa una más precisa solo si ninguna corresponde.
- "fechaDocumento": fecha de expedición o de firma del documento (no la de hechos que menciona), AAAA-MM-DD; si no se puede determinar, null, y en "fechaTexto" lo que diga el documento.
- "actores": personas, entidades y autoridades que aparecen, con su rol en el documento y su identificación solo si consta.
- "resumen": dos a cuatro frases con el contenido jurídicamente relevante de la página.
- "relevancia": POSIBLEMENTE_AJENO solo si la página es claramente ajena al caso.
- "origenFisico": ESCANEADO, ELECTRONICO, FOTOGRAFIA o DESCONOCIDO.
- "observaciones": tachaduras, enmendaduras, sellos de recibido, firmas faltantes, páginas incompletas o cualquier irregularidad visible.`;

/** Fase 2 · lectura íntegra de cada página: texto embebido o lectura visual; nunca se simula la lectura. */
export const f2: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const cap = await capacidadesDocumentales();
  const porLeer = ctx.exp.archivos.filter((a) => a.estado === "RECIBIDO" || a.estado === "DESCIFRADO");
  let paginasLeidas = 0;
  for (const archivo of porLeer) {
    const original = await ctx.leerBlob(archivo.blobId);
    const contenido = archivo.pdfCanonicoBlobId ? await ctx.leerBlob(archivo.pdfCanonicoBlobId) : original;
    const { mime, clase } = detectarMime(contenido, archivo.nombreOriginal);
    if (clase === "OFIMATICA" && !cap.soffice) {
      aviso(ctx, `«${archivo.nombreOriginal}»: LibreOffice (Writer) no está disponible para convertirlo a PDF; no se pudo leer.`, "ALTA");
      archivo.notas.push("Pendiente de lectura: requiere LibreOffice para la conversión.");
      continue;
    }
    const recibido: ArchivoRecibido = { nombre: archivo.nombreOriginal, rutaRelativa: archivo.rutaRelativa, sha256: archivo.sha256, bytes: contenido.length, mime, clase, contenido, duplicadoDe: null, cifrado: null, pdfDescifrado: null, paginas: archivo.paginas, notas: [], soportado: true };
    const preparado = await prepararDocumento(recibido, { dpi: ctx.s.config.dpiLectura, maxPaginas: ctx.s.config.maxPaginasPorArchivo });
    archivo.notas.push(...preparado.notas.filter((n) => !archivo.notas.includes(n)));
    // PDF canónico: base de la foliación, la división por tipología y los anexos.
    let pdf: Buffer | null = preparado.pdfCanonico;
    if (!pdf && clase === "IMAGEN") pdf = pdfDeImagen(contenido, mime);
    if (!pdf && clase === "TEXTO") pdf = pdfDeTexto(textoAPaginas(contenido.toString("utf8")));
    if (pdf && !archivo.pdfCanonicoBlobId) archivo.pdfCanonicoBlobId = pdf === original ? archivo.blobId : (await ctx.guardarBlob(pdf, "application/pdf", `${archivo.nombreOriginal}.pdf`)).blobId;
    if (!pdf) aviso(ctx, `«${archivo.nombreOriginal}»: no fue posible obtener un PDF canónico; se leerá, pero no podrá dividirse ni foliarse.`, "MEDIA");

    const lecturas = await leerPaginas(ctx, archivo.id, preparado.paginas);
    ctx.exp.lecturas = [...ctx.exp.lecturas.filter((l) => l.archivoId !== archivo.id), ...lecturas];
    archivo.paginas = preparado.paginas.length;
    archivo.estado = "LEIDO";
    paginasLeidas += lecturas.length;
    const ilegibles = lecturas.filter((l) => l.legibilidad === "ILEGIBLE").length;
    if (ilegibles) aviso(ctx, `«${archivo.nombreOriginal}»: ${ilegibles} página(s) ilegible(s) tras intentar la lectura visual; requieren revisión humana o un mejor escaneo.`, "ALTA");
  }
  return completado(`${porLeer.length} archivo(s) y ${paginasLeidas} página(s) leídas (${ctx.exp.lecturas.filter((l) => l.metodo === "LECTURA_VISUAL").length} por lectura visual).`);
};

async function leerPaginas(ctx: ContextoNodo, archivoId: string, paginas: PaginaPreparada[]): Promise<LecturaPagina[]> {
  const lotes = lotesDePaginas(paginas);
  const resultados = await enParalelo(lotes, 3, async (lote, i) => {
    const previa = i > 0 ? lotes[i - 1]!.at(-1)! : null;
    // Cada petición numera sus propias imágenes: la etiqueta n.º k corresponde al k-ésimo adjunto.
    const pedir = (pags: PaginaPreparada[]) => {
      const adjuntos: Adjunto[] = [];
      const etiquetas = pags.map((p) => {
        if (p.imagen) {
          adjuntos.push({ tipo: "imagen", mediaType: p.imagen.mediaType, base64: p.imagen.base64, titulo: `Página ${p.pagina}` });
          return `=== PÁGINA ${p.pagina} (VISUAL): imagen adjunta n.º ${adjuntos.length} ===`;
        }
        return `=== PÁGINA ${p.pagina} (TEXTO) ===\n${p.texto.slice(0, 12_000)}`;
      });
      return tarea(ctx, { tarea: "lectura", esquema: LecturaLote, nombreEsquema: "LecturaLote", adjuntos, instruccion: INSTRUCCION_LECTURA(etiquetas, previa ? `la ${previa.pagina}${previa.metodo === "LECTURA_VISUAL" ? " (visual)" : ""}` : null) });
    };
    const enLote = (n: number, pags: PaginaPreparada[]) => pags.some((p) => p.pagina === n);
    let devueltas = (await pedir(lote)).paginas.filter((x) => enLote(x.pagina, lote));
    const faltantes = lote.filter((p) => !devueltas.some((x) => x.pagina === p.pagina));
    if (faltantes.length) devueltas = [...devueltas, ...(await pedir(faltantes)).paginas.filter((x) => enLote(x.pagina, faltantes))];
    return lote.map((p): LecturaPagina => {
      const x = devueltas.find((y) => y.pagina === p.pagina);
      if (!x) {
        return { archivoId, pagina: p.pagina, metodo: p.metodo, tipologia: "OTRO", tituloDocumento: null, iniciaDocumento: p.pagina === 1, fechaDocumento: null, fechaTexto: null, actores: [], resumen: "", transcripcion: p.texto, legibilidad: p.metodo === "TEXTO_EMBEBIDO" ? "MEDIA" : "ILEGIBLE", relevancia: "RELEVANTE", origenFisico: "DESCONOCIDO", observaciones: ["La lectura automática no devolvió esta página tras dos intentos: requiere revisión humana."] };
      }
      return {
        archivoId, pagina: p.pagina, metodo: p.metodo, tipologia: normalizarTipologia(x.tipologia), tituloDocumento: x.tituloDocumento,
        iniciaDocumento: p.pagina === 1 ? true : x.iniciaDocumento, fechaDocumento: x.fechaDocumento, fechaTexto: x.fechaTexto,
        actores: x.actores.map((a) => ({ nombre: a.nombre, rol: a.rol, identificacion: a.identificacion })), resumen: x.resumen,
        transcripcion: p.metodo === "TEXTO_EMBEBIDO" ? p.texto : x.transcripcion, legibilidad: x.legibilidad, relevancia: x.relevancia, origenFisico: x.origenFisico, observaciones: x.observaciones,
      };
    });
  });
  return resultados.flat();
}

export const normalizarTipologia = (t: string) => t.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "OTRO";

/* ─────────────── Módulo 29 · extracción a datos estructurados ─────────────── */

interface Patron {
  tipo: TipoEntidad;
  re: RegExp;
  normalizar: (m: RegExpMatchArray) => string | null;
  critica?: boolean;
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");

export const PATRONES: Patron[] = [
  { tipo: "RADICADO", re: /\b(\d{5})[-\s.]?(\d{2})[-\s.]?(\d{2})[-\s.]?(\d{3})[-\s.]?(\d{4})[-\s.]?(\d{5})[-\s.]?(\d{2})\b/g, normalizar: (m) => m.slice(1, 8).join("") },
  { tipo: "CEDULA", re: /\b(?:C\.?\s?C\.?|c[ée]dula(?:\s+de\s+ciudadan[íi]a)?)(?:\s*(?:No\.?|n[úu]mero|n\.?\s?[º°o]))?\s*:?\s*(\d{1,3}(?:[.\s]?\d{3}){1,3})\b/gi, normalizar: (m) => soloDigitos(m[1]!) },
  { tipo: "NIT", re: /\bNIT\.?\s*(?:No\.?|n[úu]mero)?\s*:?\s*(\d{3}[.\s]?\d{3}[.\s]?\d{3})\s*[-–]\s*(\d)\b/gi, normalizar: (m) => `${soloDigitos(m[1]!)}-${m[2]}` },
  { tipo: "PLACA", re: /\bplaca\s*(?:No\.?|n[úu]mero)?\s*:?\s*([A-Z]{3}[-\s]?\d{2,3}[A-Z]?)\b/gi, normalizar: (m) => m[1]!.toUpperCase().replace(/[-\s]/g, "") },
  { tipo: "CORREO", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, normalizar: (m) => m[0].toLowerCase() },
  { tipo: "TELEFONO", re: /(?<!\d)(?:\+?57[\s-]?)?(3\d{2})[\s-]?(\d{3})[\s-]?(\d{4})(?!\d)/g, normalizar: (m) => `${m[1]}${m[2]}${m[3]}` },
  { tipo: "MONTO", re: /\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?(?!\d)/g, normalizar: (m) => String(Number(soloDigitos(m[1]!))), critica: true },
  { tipo: "CUFE", re: /\b[0-9a-f]{96}\b/gi, normalizar: (m) => m[0].toLowerCase() },
  { tipo: "MATRICULA_INMOBILIARIA", re: /\bmatr[íi]cula\s+inmobiliaria\s*(?:No\.?|n[úu]mero)?\s*:?\s*(\d{2,3}\s?-\s?\d{2,8})\b/gi, normalizar: (m) => m[1]!.replace(/\s/g, "") },
  { tipo: "FECHA", re: /\b(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de|del)\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/gi, normalizar: (m) => interpretarFecha(m[1]!), critica: true },
];

function tipoActor(rol: string): TipoEntidad {
  const r = rol.toLowerCase();
  if (/juez|juzgado|tribunal|corte|superintend|alcald|fiscal|procurad|notar|inspecci|comisar|registrador|ministerio|secretar[ií]a/.test(r)) return "AUTORIDAD";
  if (/empresa|sociedad|entidad|banco|eps|aseguradora|s\.a\.s|ltda|s\.a\./.test(r)) return "ORGANIZACION";
  return "PERSONA";
}

/** Módulo 29 · entidades con su fuente documental. Las críticas (fechas, montos) no sustentan cálculos definitivos sin confirmación. */
export const m29: ManejadorNodo = async (ctx) => {
  const previas = new Map(ctx.exp.entidades.filter((e) => e.verificacion !== "PROVISIONAL" || e.extractor === "ABOGADO").map((e) => [`${e.tipo}|${e.normalizado}`, e]));
  const mapa = new Map<string, Entidad>();
  const agregar = (tipo: TipoEntidad, valor: string, normalizado: string, soporte: { archivoId: string; pagina: number; cita: string | null }, confianza: number, critica = false, atributos: Record<string, string> = {}) => {
    const clave = `${tipo}|${normalizado}`;
    const e = mapa.get(clave) ?? previas.get(clave) ?? { id: nuevoId("ent"), tipo, valor, normalizado, atributos: {}, soportes: [], confianza, critica, verificacion: "PROVISIONAL" as const, extractor: "REGLA" as const };
    if (!e.soportes.some((s) => s.archivoId === soporte.archivoId && s.pagina === soporte.pagina)) e.soportes.push({ ...soporte, piezaId: null });
    e.confianza = Math.max(e.confianza, confianza);
    Object.assign(e.atributos, atributos);
    mapa.set(clave, e);
  };
  for (const l of ctx.exp.lecturas) {
    const texto = `${l.transcripcion}\n${l.resumen}`;
    const soporte = { archivoId: l.archivoId, pagina: l.pagina, cita: null };
    for (const p of PATRONES) {
      for (const m of texto.matchAll(p.re)) {
        const n = p.normalizar(m);
        if (!n) continue;
        if (p.tipo === "CEDULA" && (n.length < 6 || n.length > 10)) continue;
        agregar(p.tipo, m[0].trim(), n, { ...soporte, cita: texto.slice(Math.max(0, m.index! - 60), m.index! + m[0].length + 60).replace(/\s+/g, " ").trim() }, 0.9, p.critica ?? false);
      }
    }
    for (const a of l.actores) {
      const tipo = tipoActor(a.rol);
      agregar(tipo, a.nombre, a.nombre.trim().toUpperCase().replace(/\s+/g, " "), soporte, 0.7, false, { rol: a.rol });
      if (a.identificacion) agregar(/nit/i.test(a.identificacion) ? "NIT" : "CEDULA", a.identificacion, soloDigitos(a.identificacion), soporte, 0.75, false, { titular: a.nombre });
    }
    if (l.fechaDocumento) agregar("FECHA", l.fechaTexto ?? l.fechaDocumento, l.fechaDocumento, soporte, 0.8, true, { documento: l.tituloDocumento ?? l.tipologia });
  }
  for (const r of ctx.exp.contexto.radicados) agregar("RADICADO", r, soloDigitos(r) || r, { archivoId: "contexto", pagina: 1, cita: "Radicado informado por el ABOGADO (USUARIO)." }, 1);
  // Correcciones y confirmaciones del ABOGADO (USUARIO)
  for (const i of ctx.instrucciones(["CONFIRMAR_ENTIDAD", "CORREGIR_ENTIDAD"])) {
    const d = (i.datos ?? {}) as { entidadId?: string; valor?: string };
    const e = [...mapa.values()].find((x) => x.id === d.entidadId);
    if (e) {
      e.verificacion = i.accion === "CONFIRMAR_ENTIDAD" ? "CONFIRMADA_ABOGADO" : "CORREGIDA_ABOGADO";
      if (i.accion === "CORREGIR_ENTIDAD" && d.valor) e.valor = d.valor, e.normalizado = d.valor;
    }
    ctx.consumir(i);
  }
  ctx.exp.entidades = [...mapa.values()];
  const criticas = ctx.exp.entidades.filter((e) => e.critica && e.verificacion === "PROVISIONAL").length;
  const porTipo = ctx.exp.entidades.reduce<Record<string, number>>((acc, e) => ((acc[e.tipo] = (acc[e.tipo] ?? 0) + 1), acc), {});
  return completado(`${ctx.exp.entidades.length} entidad(es): ${Object.entries(porTipo).map(([k, v]) => `${v} ${k}`).join(", ")}; ${criticas} crítica(s) pendiente(s) de confirmación.`);
};
