/* Interpretación tolerante de las respuestas: Croma devuelve contenido MCP (texto,
 * a menudo JSON). "found: false" es una respuesta definitiva, no un error;
 * "status: pending" con job_id exige repetir la consulta con los mismos argumentos. */

export interface ContenidoMcp {
  content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export function textoDe(r: ContenidoMcp): string {
  const partes = (r.content ?? []).filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text as string);
  if (partes.length) return partes.join("\n");
  if (r.structuredContent !== undefined) return JSON.stringify(r.structuredContent);
  return "";
}

export function interpretarJson(texto: string): unknown {
  const t = texto.trim();
  if (!t || !(t.startsWith("{") || t.startsWith("["))) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function datosDe(r: ContenidoMcp): unknown {
  return r.structuredContent ?? interpretarJson(textoDe(r));
}

export function esPendiente(datos: unknown): boolean {
  if (!datos || typeof datos !== "object") return false;
  const d = datos as Record<string, unknown>;
  return String(d.status ?? d.estado ?? "").toLowerCase() === "pending" && Boolean(d.job_id ?? d.jobId);
}

export function esSinResultados(datos: unknown, texto: string): boolean {
  if (datos && typeof datos === "object" && !Array.isArray(datos)) {
    const d = datos as Record<string, unknown>;
    if (d.found === false || d.encontrado === false) return true;
    for (const k of ["results", "resultados", "items", "data", "procesos", "records"]) if (Array.isArray(d[k]) && (d[k] as unknown[]).length === 0) return true;
  }
  if (Array.isArray(datos) && datos.length === 0) return true;
  return /\b(no se encontr|sin resultados|no results|not found)\b/i.test(texto) && texto.length < 400;
}

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Busca en profundidad el primer valor cuya clave coincide con alguno de los patrones. */
export function buscarCampo(obj: unknown, patrones: RegExp[], profundidad = 4): unknown {
  if (!obj || typeof obj !== "object" || profundidad < 0) return undefined;
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const v = buscarCampo(x, patrones, profundidad - 1);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (patrones.some((p) => p.test(norm(k))) && v !== null && v !== undefined && typeof v !== "object") return v;
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const r = buscarCampo(v, patrones, profundidad - 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

/** Encuentra el arreglo de objetos más probable según las claves que debe tener. */
export function buscarArreglo(obj: unknown, clavesEsperadas: RegExp[], profundidad = 4): Array<Record<string, unknown>> {
  let mejor: Array<Record<string, unknown>> = [];
  let mejorPuntaje = 0;
  const visitar = (x: unknown, nivel: number) => {
    if (!x || typeof x !== "object" || nivel < 0) return;
    if (Array.isArray(x)) {
      const objetos = x.filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object" && !Array.isArray(e));
      if (objetos.length) {
        const claves = Object.keys(objetos[0]!).map(norm);
        const puntaje = clavesEsperadas.filter((p) => claves.some((c) => p.test(c))).length;
        if (puntaje > mejorPuntaje) {
          mejor = objetos;
          mejorPuntaje = puntaje;
        }
      }
      for (const e of x) visitar(e, nivel - 1);
      return;
    }
    for (const v of Object.values(x as Record<string, unknown>)) visitar(v, nivel - 1);
  };
  visitar(obj, profundidad);
  return mejor;
}

export function aFechaISO(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

export interface ProcesoNormalizado {
  radicado: string | null;
  despacho: string | null;
  claseProceso: string | null;
  sujetos: string[];
  actuaciones: Array<{ fecha: string | null; actuacion: string; anotacion: string | null }>;
  ultimaActuacion: { fecha: string | null; actuacion: string; anotacion: string | null } | null;
}

/** Normaliza la respuesta de una consulta de procesos (Rama Judicial / SAMAI). */
export function normalizarProceso(datos: unknown): ProcesoNormalizado {
  const radicado = buscarCampo(datos, [/radicad/, /llaveproceso/, /casenumber/, /numeroproceso/]);
  const despacho = buscarCampo(datos, [/despacho/, /juzgado/, /court/, /office/]);
  const clase = buscarCampo(datos, [/claseproceso/, /tipoproceso/, /casetype/, /clase/]);
  const sujetosArr = buscarArreglo(datos, [/nombre|name|razon/, /tipo|rol|role|calidad/]);
  const sujetos = sujetosArr.map((s) => String(buscarCampo(s, [/nombre|name|razonsocial/], 0) ?? "")).filter(Boolean);
  const actsArr = buscarArreglo(datos, [/fecha|date/, /actuacion|action|descripcion|description/]);
  const actuaciones = actsArr.map((a) => ({
    fecha: aFechaISO(buscarCampo(a, [/fechaactuacion/, /^fecha$/, /date/, /fecha/], 0)),
    actuacion: String(buscarCampo(a, [/^actuacion$/, /action/, /descripcion/, /description/, /tipo/], 0) ?? "Actuación"),
    anotacion: (buscarCampo(a, [/anotacion/, /note/, /detalle/, /observ/], 0) as string | undefined) ?? null,
  }));
  actuaciones.sort((x, y) => (y.fecha ?? "").localeCompare(x.fecha ?? ""));
  const sujetosTexto = sujetos.length ? sujetos : typeof buscarCampo(datos, [/sujetos/]) === "string" ? String(buscarCampo(datos, [/sujetos/])).split(/[|;]/).map((s) => s.trim()).filter(Boolean) : [];
  return {
    radicado: radicado ? String(radicado) : null,
    despacho: despacho ? String(despacho) : null,
    claseProceso: clase ? String(clase) : null,
    sujetos: sujetosTexto,
    actuaciones,
    ultimaActuacion: actuaciones[0] ?? null,
  };
}

export interface ResultadoBusquedaWeb {
  titulo: string;
  url: string;
  fragmento: string;
}

export function normalizarBusqueda(datos: unknown, texto: string): ResultadoBusquedaWeb[] {
  const arr = buscarArreglo(datos, [/url|link/, /title|titulo/]);
  if (arr.length) {
    return arr.map((r) => ({
      titulo: String(buscarCampo(r, [/title|titulo/], 0) ?? ""),
      url: String(buscarCampo(r, [/^url$|link|href/], 0) ?? ""),
      fragmento: String(buscarCampo(r, [/snippet|fragment|content|description|resumen/], 0) ?? ""),
    })).filter((r) => r.url);
  }
  return [...texto.matchAll(/https?:\/\/[^\s)\]"]+/g)].map((m) => ({ titulo: "", url: m[0], fragmento: "" }));
}
