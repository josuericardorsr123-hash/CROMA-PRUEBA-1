import { CAPACIDADES, type DefinicionCapacidad, type IdCapacidad } from "./capacidades";
import type { EsquemaJson, HerramientaCroma } from "./tipos";

const norm = (t: string) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const claveProp = (t: string) => norm(t).replace(/[^a-z0-9]/g, "");

/** "(Source: SUNAT; Country: Peru)" al final de la descripción, convención del catálogo de Croma. */
export function interpretarFuente(descripcion: string): { fuente: string | null; pais: string | null } {
  const m = /\(Source:\s*([^;]+);\s*Country:\s*([^.)]+)/i.exec(descripcion ?? "");
  return { fuente: m?.[1]?.trim() ?? null, pais: m?.[2]?.trim() ?? null };
}

export function aHerramienta(t: { name: string; title?: string; description?: string; inputSchema?: unknown }): HerramientaCroma {
  const descripcion = t.description ?? "";
  const { fuente, pais } = interpretarFuente(descripcion);
  const prefijo = t.name.split("_")[0] ?? t.name;
  return {
    nombre: t.name,
    titulo: t.title ?? t.name,
    descripcion,
    fuente: fuente ?? prefijo,
    pais: pais ?? "Global",
    prefijo,
    esquemaEntrada: (t.inputSchema as EsquemaJson) ?? { type: "object", properties: {} },
  };
}

export interface AsignacionCapacidad {
  capacidad: IdCapacidad;
  herramienta: HerramientaCroma;
  puntaje: number;
  /** Parámetro canónico → propiedad del esquema de la herramienta. */
  argumentos: Record<string, string>;
  fijadaPorConfiguracion: boolean;
}

export interface MapeoConfigurado {
  [capacidad: string]: { herramienta: string; argumentos?: Record<string, string> };
}

function propiedadPara(esquema: EsquemaJson, sinonimos: string[]): string | null {
  const props = Object.keys(esquema.properties ?? {});
  for (const s of sinonimos) {
    const exacta = props.find((p) => claveProp(p) === claveProp(s));
    if (exacta) return exacta;
  }
  for (const s of sinonimos) {
    const parcial = props.find((p) => claveProp(p).includes(claveProp(s)) && claveProp(s).length >= 4);
    if (parcial) return parcial;
  }
  return null;
}

export function puntuar(c: DefinicionCapacidad, h: HerramientaCroma): { puntaje: number; argumentos: Record<string, string> } {
  const nombre = norm(h.nombre);
  const texto = `${nombre} ${norm(h.descripcion)} ${norm(h.titulo)}`;
  const prefijoOk = c.prefijos.some((p) => h.prefijo.toLowerCase() === p || nombre.startsWith(`${p}_`) || nombre === p);
  if (c.prefijos.length && !prefijoOk) return { puntaje: -1, argumentos: {} };
  if (!c.paises.includes(h.pais) && !(h.pais === "Global" && c.paises.includes("Global"))) {
    // Herramientas sin país declarado se aceptan solo por prefijo exacto.
    if (h.pais !== "Global" || !prefijoOk) return { puntaje: -1, argumentos: {} };
  }
  let puntaje = prefijoOk ? 5 : 0;
  for (const p of c.palabras) {
    const k = norm(p);
    if (nombre.includes(k)) puntaje += 2;
    else if (texto.includes(k)) puntaje += 1;
  }
  const argumentos: Record<string, string> = {};
  const requeridos = new Set(h.esquemaEntrada.required ?? []);
  for (const [canonico, sinonimos] of Object.entries(c.parametros)) {
    const prop = propiedadPara(h.esquemaEntrada, sinonimos);
    if (prop) {
      argumentos[canonico] = prop;
      puntaje += 3;
    }
  }
  // Penaliza herramientas que exigen parámetros que la capacidad no sabe llenar.
  const mapeadas = new Set(Object.values(argumentos));
  for (const r of requeridos) if (!mapeadas.has(r)) puntaje -= 2;
  return { puntaje, argumentos };
}

const UMBRAL = 7;

/**
 * Asocia cada capacidad con la herramienta de mayor puntaje. Una capacidad sin
 * herramienta suficiente queda sin asignar: el módulo que la necesita lo
 * declarará como fuente no disponible, nunca como consulta exitosa.
 */
export function mapearCapacidades(herramientas: HerramientaCroma[], configurado: MapeoConfigurado = {}): Map<IdCapacidad, AsignacionCapacidad> {
  const salida = new Map<IdCapacidad, AsignacionCapacidad>();
  for (const c of CAPACIDADES) {
    const fijo = configurado[c.id];
    if (fijo) {
      const h = herramientas.find((x) => x.nombre === fijo.herramienta);
      if (h) {
        const auto = puntuar(c, h);
        salida.set(c.id, { capacidad: c.id, herramienta: h, puntaje: 100, argumentos: { ...auto.argumentos, ...(fijo.argumentos ?? {}) }, fijadaPorConfiguracion: true });
        continue;
      }
    }
    let mejor: AsignacionCapacidad | null = null;
    for (const h of herramientas) {
      const { puntaje, argumentos } = puntuar(c, h);
      if (puntaje < UMBRAL) continue;
      if (!mejor || puntaje > mejor.puntaje || (puntaje === mejor.puntaje && h.nombre.length < mejor.herramienta.nombre.length)) {
        mejor = { capacidad: c.id, herramienta: h, puntaje, argumentos, fijadaPorConfiguracion: false };
      }
    }
    if (mejor) salida.set(c.id, mejor);
  }
  return salida;
}

/** Construye los argumentos de la herramienta a partir de valores canónicos. */
export function construirArgumentos(asignacion: AsignacionCapacidad, canonicos: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const props = asignacion.herramienta.esquemaEntrada.properties ?? {};
  for (const [canonico, valor] of Object.entries(canonicos)) {
    if (valor === undefined || valor === null || valor === "") continue;
    const prop = asignacion.argumentos[canonico];
    if (prop) {
      const tipo = props[prop]?.type;
      args[prop] = tipo === "array" && !Array.isArray(valor) ? [valor] : tipo === "number" || tipo === "integer" ? Number(valor) : valor;
    }
  }
  // Una herramienta con una sola propiedad requerida de tipo texto recibe el primer valor canónico si nada coincidió.
  const requeridas = asignacion.herramienta.esquemaEntrada.required ?? [];
  if (!Object.keys(args).length && requeridas.length === 1) {
    const primero = Object.values(canonicos).find((v) => v !== undefined && v !== null && v !== "");
    if (primero !== undefined) args[requeridas[0]!] = primero;
  }
  return args;
}
