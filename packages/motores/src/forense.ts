/* Reglas de redacción forense para piezas radicables (estándar del despacho):
 * RD_04 sin raya larga como inciso · RD_05 sin repetición excesiva en el párrafo ·
 * RD_09 sin promesas de resultado · RD_27 lenguaje determinado · RD_06 hechos en
 * modo, tiempo y lugar. El informe técnico sigue su propio formato editorial. */

export interface HallazgoRedaccion {
  regla: string;
  severidad: "BLOQUEANTE" | "ADVERTENCIA";
  ubicacion: string;
  detalle: string;
}

const VAGOS = [
  "algunos", "algunas", "a la mayor brevedad", "lo antes posible", "se tomen medidas", "tomar las medidas pertinentes", "informe el procedimiento",
  "en lo posible", "de ser posible", "entre otros", "etcétera", "etc.", "lo que corresponda", "según corresponda",
];
const PROMESAS = ["se garantiza", "garantizamos", "sin lugar a dudas prosperará", "con total certeza", "es seguro que el juez", "ganaremos"];
const VACIAS = new Set(["para", "como", "sobre", "entre", "desde", "hasta", "donde", "cuando", "porque", "según", "según", "dicho", "dicha", "cual", "cuales", "sido", "este", "esta", "estos", "estas", "tiene", "tener", "señor", "señora", "juez", "demanda", "demandado", "demandante", "artículo", "numeral", "proceso", "derecho"]);
const MARCA_TIEMPO = /\b(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|desde|hasta|durante|el\s+d[ií]a|a\s+la\s+fecha|en\s+la\s+fecha)\b/i;

export function validarRedaccionForense(bloques: Array<{ ubicacion: string; texto: string; esHecho?: boolean }>): HallazgoRedaccion[] {
  const salida: HallazgoRedaccion[] = [];
  for (const b of bloques) {
    const t = b.texto ?? "";
    if (/[—–]/.test(t)) salida.push({ regla: "RD_04", severidad: "BLOQUEANTE", ubicacion: b.ubicacion, detalle: "Raya larga o semirraya usada como signo de inciso: sustituir por paréntesis, comas o punto y coma." });
    const bajo = t.toLowerCase();
    for (const v of VAGOS) if (bajo.includes(v)) salida.push({ regla: "RD_27", severidad: "ADVERTENCIA", ubicacion: b.ubicacion, detalle: `Expresión indeterminada: «${v}». Precisar sujeto, conducta, medida y plazo.` });
    for (const p of PROMESAS) if (bajo.includes(p)) salida.push({ regla: "RD_09", severidad: "BLOQUEANTE", ubicacion: b.ubicacion, detalle: `Promesa de resultado: «${p}».` });
    const conteo = new Map<string, number>();
    for (const w of bajo.normalize("NFD").replace(/[̀-ͯ]/g, "").match(/\p{L}{6,}/gu) ?? []) if (!VACIAS.has(w)) conteo.set(w, (conteo.get(w) ?? 0) + 1);
    const repetidas = [...conteo.entries()].filter(([, n]) => n >= 3).map(([w]) => w);
    if (repetidas.length) salida.push({ regla: "RD_05", severidad: "ADVERTENCIA", ubicacion: b.ubicacion, detalle: `Palabras repetidas en el mismo párrafo: ${repetidas.slice(0, 5).join(", ")}.` });
    if (b.esHecho && !MARCA_TIEMPO.test(t)) salida.push({ regla: "RD_06", severidad: "ADVERTENCIA", ubicacion: b.ubicacion, detalle: "Hecho sin circunstancia de tiempo identificable: precisar cuándo (o su regla de determinación)." });
  }
  return salida;
}

/* RD_12 · Derecho de petición. Las fórmulas de apertura y de cierre son propias de
 * cada despacho: se cargan en tiempo de ejecución desde su perfil (EM_PERFIL_DESPACHO)
 * y se reproducen LITERALMENTE. Aquí solo vive una redacción neutra por defecto;
 * los textos del despacho no se versionan en este repositorio. */
export interface PerfilDespacho {
  peticion: {
    /** Pretensiones con que se abre toda petición, en su redacción literal. */
    pretensionesApertura: string[];
    /** Párrafo de cierre literal. Puede usar {calidad} para la calidad del peticionario. */
    cierre: string;
  };
}

export const PERFIL_NEUTRO: PerfilDespacho = {
  peticion: {
    pretensionesApertura: [
      "Solicito que esta petición se resuelva dentro del término de quince (15) días hábiles previsto en el artículo 14 de la Ley 1437 de 2011, sustituido por el artículo 1 de la Ley 1755 de 2015.",
      "Solicito que la respuesta se dé punto por punto, de manera clara, precisa, congruente y de fondo. Si alguna solicitud no puede atenderse, pido que la negativa se motive con indicación expresa de su fundamento constitucional o legal.",
    ],
    cierre: "Estas solicitudes se formulan para esclarecer los hechos y proteger mis derechos como {calidad}. Pido que cada una se resuelva de fondo dentro del término previsto en la Ley 1437 de 2011, en concordancia con la Ley 1755 de 2015.",
  },
};

/** Valida un perfil cargado (JSON del despacho); ante cualquier defecto, lanza con el campo afectado. */
export function validarPerfilDespacho(datos: unknown): PerfilDespacho {
  const p = datos as Partial<PerfilDespacho> | null;
  const apertura = p?.peticion?.pretensionesApertura;
  const cierre = p?.peticion?.cierre;
  if (!Array.isArray(apertura) || !apertura.length || apertura.some((x) => typeof x !== "string" || !x.trim())) throw new Error("Perfil del despacho: peticion.pretensionesApertura debe ser una lista de textos no vacíos.");
  if (typeof cierre !== "string" || !cierre.trim()) throw new Error("Perfil del despacho: peticion.cierre debe ser un texto no vacío.");
  return { peticion: { pretensionesApertura: apertura, cierre } };
}

const CALIDAD_SFC = "consumidor financiero";

/**
 * Si el destinatario no es vigilado por la SFC, la calidad de "consumidor financiero"
 * es impertinente: se sustituye y se advierte. Con {calidad} en el perfil se inserta
 * la calidad que corresponda; sin él, se reemplaza la mención literal.
 */
export function cierrePeticion(destinatarioVigiladoSFC: boolean, calidadAlternativa = "usuario del servicio", perfil: PerfilDespacho = PERFIL_NEUTRO): { texto: string; advertencia: string | null } {
  const plantilla = perfil.peticion.cierre;
  const calidad = destinatarioVigiladoSFC ? CALIDAD_SFC : calidadAlternativa;
  if (plantilla.includes("{calidad}")) {
    return {
      texto: plantilla.replaceAll("{calidad}", calidad),
      advertencia: destinatarioVigiladoSFC ? null : `El destinatario no es una entidad vigilada por la Superintendencia Financiera: la calidad del peticionario se redactó como "${calidadAlternativa}".`,
    };
  }
  if (destinatarioVigiladoSFC || !plantilla.includes(CALIDAD_SFC)) return { texto: plantilla, advertencia: null };
  return {
    texto: plantilla.replaceAll(CALIDAD_SFC, calidadAlternativa),
    advertencia: `El destinatario no es una entidad vigilada por la Superintendencia Financiera: se sustituyó "${CALIDAD_SFC}" por "${calidadAlternativa}". El ABOGADO (USUARIO) puede restablecer el texto original.`,
  };
}

export const ADVERTENCIA_BORRADOR =
  "Borrador elaborado con apoyo de herramientas automatizadas bajo la dirección del ABOGADO (USUARIO). No es un concepto jurídico definitivo ni sustituye su criterio profesional: solo puede radicarse o usarse ante una autoridad después de que el ABOGADO (USUARIO) lo revise, confirme cada norma y providencia citada en su fuente oficial vigente a la fecha de presentación y lo suscriba.";
