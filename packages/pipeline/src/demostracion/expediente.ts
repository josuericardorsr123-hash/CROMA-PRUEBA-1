import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DatosSimulados } from "@em/croma";
import { capacidadesDocumentales, conDirectorioTemporal, ejecutar, empaquetar, pdfDeImagenesPng, pdfDeTexto } from "@em/documentos";

/* ────────────────────────────────────────────────────────────────────────────
 * Expediente de DEMOSTRACIÓN con datos 100 % ficticios: ninguna persona,
 * sociedad, número o radicado corresponde a la realidad. Reproduce un caso
 * típico (cobro de un pagaré vencido) con los defectos habituales de un
 * expediente real: un escaneo sin capa de texto, un comprimido y un duplicado.
 * Los textos normativos del simulador de Croma se limitan a artículos cuya
 * redacción es estable; aun así, todo queda marcado como fuente SIMULADA.
 * ──────────────────────────────────────────────────────────────────────────── */

export const PARTES_DEMO = {
  acreedor: "SOCIEDAD FICTICIA UNO S.A.S.",
  nitAcreedor: "000.000.002-0",
  representante: "PERSONA FICTICIA DOS",
  deudora: "PERSONA NATURAL FICTICIA",
  ccDeudora: "000.000.001",
};

const envolver = (texto: string, ancho = 88) => texto.split("\n").flatMap((l) => (l.length <= ancho ? [l] : l.match(new RegExp(`.{1,${ancho}}(\\s|$)`, "g"))!.map((x) => x.trimEnd())));

export const TEXTOS_DEMO = {
  relato: `RELATO DEL CLIENTE (DEMOSTRACIÓN - DATOS FICTICIOS)
Bogotá D.C., 2 de septiembre de 2026

La ${PARTES_DEMO.acreedor}, NIT ${PARTES_DEMO.nitAcreedor}, representada legalmente por ${PARTES_DEMO.representante}, solicita el cobro del pagaré No. DEMO-001.
El pagaré fue suscrito por ${PARTES_DEMO.deudora}, identificada con C.C. ${PARTES_DEMO.ccDeudora}, por la suma de $10.000.000, con vencimiento el 1 de marzo de 2024.
La deudora no ha pagado ninguna suma, pese al requerimiento enviado el 15 de abril de 2024.
La deudora tiene su domicilio en Bogotá D.C. y su correo electrónico es deudora@ejemplo.test.
La sociedad desea recuperar el capital y los intereses, y pide que se soliciten medidas cautelares.`,
  poder: `PODER ESPECIAL (DEMOSTRACIÓN - DATOS FICTICIOS)
Señor
JUEZ CIVIL MUNICIPAL DE BOGOTÁ D.C. (REPARTO)
E. S. D.

${PARTES_DEMO.representante}, en calidad de representante legal de la ${PARTES_DEMO.acreedor}, NIT ${PARTES_DEMO.nitAcreedor},
confiere poder especial, amplio y suficiente al abogado [NOMBRE], identificado con C.C. [C.C. No.] y T.P. [T.P. No.],
para que inicie y lleve hasta su terminación proceso ejecutivo contra ${PARTES_DEMO.deudora}, C.C. ${PARTES_DEMO.ccDeudora},
con fundamento en el pagaré No. DEMO-001.
El apoderado queda facultado para recibir, transigir, conciliar, desistir, sustituir y reasumir.
Correo electrónico del apoderado: abogado@ejemplo.test. Se otorga por mensaje de datos (Ley 2213 de 2022, artículo 5).
Bogotá D.C., 3 de septiembre de 2026.`,
  pagare: `PAGARÉ No. DEMO-001 (DEMOSTRACIÓN - DATOS FICTICIOS)
Valor: $10.000.000
Yo, ${PARTES_DEMO.deudora}, identificada con C.C. ${PARTES_DEMO.ccDeudora}, pagaré incondicionalmente a la orden de la
${PARTES_DEMO.acreedor}, NIT ${PARTES_DEMO.nitAcreedor}, la suma de DIEZ MILLONES DE PESOS ($10.000.000),
el 1 de marzo de 2024, en la ciudad de Bogotá D.C.
En caso de mora reconoceré intereses moratorios a la tasa máxima legal permitida.
Suscrito en Bogotá D.C., el 1 de marzo de 2023.
[firma] ${PARTES_DEMO.deudora}`,
  requerimiento: `Bogotá D.C., 15 de abril de 2024

Señora
${PARTES_DEMO.deudora}
Correo: deudora@ejemplo.test

Asunto: Requerimiento de pago del pagaré No. DEMO-001 (DEMOSTRACIÓN - DATOS FICTICIOS)

La ${PARTES_DEMO.acreedor} le recuerda que el pagaré No. DEMO-001 por $10.000.000 venció el 1 de marzo de 2024
sin que se haya efectuado el pago. Le solicitamos pagar dentro de los diez días siguientes al recibo de esta comunicación.

${PARTES_DEMO.representante}
Representante legal`,
  certificado: `CÁMARA DE COMERCIO FICTICIA (DEMOSTRACIÓN)
CERTIFICADO DE EXISTENCIA Y REPRESENTACIÓN LEGAL
Fecha de expedición: 1 de septiembre de 2026
Razón social: ${PARTES_DEMO.acreedor}
NIT ${PARTES_DEMO.nitAcreedor}
Estado de la matrícula: ACTIVA
Representante legal: ${PARTES_DEMO.representante}
Facultades del representante legal: sin limitaciones para otorgar poderes.`,
};

/** PNG en escala de grises desde el render de una página (pdftoppm), para simular un escaneo sin capa de texto. */
async function escanear(pdf: Buffer): Promise<Buffer | null> {
  const cap = await capacidadesDocumentales();
  if (!cap.pdftoppm) return null;
  return conDirectorioTemporal(async (dir) => {
    await writeFile(join(dir, "p.pdf"), pdf);
    const r = await ejecutar("pdftoppm", ["-f", "1", "-l", "1", "-r", "110", "-gray", "-png", "-singlefile", join(dir, "p.pdf"), join(dir, "img")], { timeoutMs: 60_000 });
    return r.codigo === 0 ? readFile(join(dir, "img.png")) : null;
  });
}

export interface ArchivoDemo {
  nombre: string;
  contenido: Buffer;
}

export interface ExpedienteDemo {
  archivos: ArchivoDemo[];
  /** Transcripción de cada imagen escaneada, por huella del PNG (el simulador «lee» lo que el modelo real leería). */
  transcripciones: Record<string, string>;
}

export const huellaImagen = (base64: string) => createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");

/** Construye los archivos crudos del expediente de demostración, tal como los entregaría un cliente. */
export async function construirExpedienteDemo(): Promise<ExpedienteDemo> {
  const pdf = (t: string) => pdfDeTexto([envolver(t)], 10);
  const transcripciones: Record<string, string> = {};
  const pagareTexto = pdf(TEXTOS_DEMO.pagare);
  const png = await escanear(pagareTexto);
  let pagare: Buffer = pagareTexto;
  if (png) {
    // pdfDeImagenesPng exige PNG de 8 bits; pdftoppm -gray lo produce. Si falla, se usa el PDF con texto.
    try {
      pagare = pdfDeImagenesPng([png]);
      transcripciones[createHash("sha256").update(png).digest("hex")] = TEXTOS_DEMO.pagare;
      // La lectura re-rasteriza a otra resolución: la huella del PNG cambia y se usa la transcripción por defecto.
      transcripciones["*"] = TEXTOS_DEMO.pagare;
    } catch {
      pagare = pagareTexto;
    }
  }
  const poder = pdf(TEXTOS_DEMO.poder);
  const certificado = pdf(TEXTOS_DEMO.certificado);
  return {
    archivos: [
      { nombre: "relato del cliente.txt", contenido: Buffer.from(TEXTOS_DEMO.relato, "utf8") },
      { nombre: "escaneo_001.pdf", contenido: pagare },
      { nombre: "carta cobro abril.pdf", contenido: pdf(TEXTOS_DEMO.requerimiento) },
      { nombre: "PODER firmado.pdf", contenido: poder },
      { nombre: "documentos empresa.zip", contenido: empaquetar([{ ruta: "certificado camara.pdf", contenido: certificado }, { ruta: "poder (copia).pdf", contenido: poder }]) },
    ],
    transcripciones,
  };
}

const SENADO = "http://www.secretariasenado.gov.co/senado/basedoc";

/** Datos del simulador de Croma para la demostración (todo SIMULADO y así marcado en la procedencia). */
export function datosCromaDemo(): DatosSimulados {
  return {
    empresas: {
      "000000002": { found: true, razon_social: PARTES_DEMO.acreedor, nit: PARTES_DEMO.nitAcreedor, estado: "ACTIVA", matricula: "DEMO-0001", ultimo_ano_renovado: 2026, representantes: [{ nombre: PARTES_DEMO.representante, cargo: "Representante legal" }], fuente: "Registro simulado para demostración" },
    },
    normas: {
      "ley 1564 de 2012|422": { texto: "ARTÍCULO 422. TÍTULO EJECUTIVO. Pueden demandarse ejecutivamente las obligaciones expresas, claras y exigibles que consten en documentos que provengan del deudor o de su causante, y constituyan plena prueba contra él, o las que emanen de una sentencia de condena proferida por juez o tribunal de cualquier jurisdicción, o de otra providencia judicial, o de las providencias que en procesos de policía aprueben liquidación de costas o señalen honorarios de auxiliares de la justicia, y los demás documentos que señale la ley.", vigencia: "VIGENTE", url: `${SENADO}/ley_1564_2012.html` },
      "ley 1564 de 2012|430": { texto: "ARTÍCULO 430. MANDAMIENTO EJECUTIVO. Presentada la demanda acompañada de documento que preste mérito ejecutivo, el juez librará mandamiento ordenando al demandado que cumpla la obligación en la forma pedida, si fuere procedente, o en la que aquel considere legal.", vigencia: "VIGENTE", url: `${SENADO}/ley_1564_2012.html` },
      "codigo de comercio|621": { texto: "ARTÍCULO 621. REQUISITOS PARA LOS TÍTULOS VALORES. Además de lo dispuesto para cada título-valor en particular, los títulos-valores deberán llenar los requisitos siguientes: 1) La mención del derecho que en el título se incorpora, y 2) La firma de quién lo crea.", vigencia: "VIGENTE", url: `${SENADO}/codigo_comercio.html` },
      "codigo de comercio|709": { texto: "ARTÍCULO 709. REQUISITOS DEL PAGARÉ. El pagaré debe contener, además de los requisitos que establece el artículo 621, los siguientes: 1) La promesa incondicional de pagar una suma determinada de dinero; 2) El nombre de la persona a quien deba hacerse el pago; 3) La indicación de ser pagadero a la orden o al portador, y 4) La forma del vencimiento.", vigencia: "VIGENTE", url: `${SENADO}/codigo_comercio.html` },
      "codigo de comercio|789": { texto: "ARTÍCULO 789. PRESCRIPCIÓN DE LA ACCIÓN CAMBIARIA DIRECTA. La acción cambiaria directa prescribe en tres años a partir del día del vencimiento.", vigencia: "VIGENTE", url: `${SENADO}/codigo_comercio.html` },
    },
    busquedas: [],
    paginas: {},
  };
}
