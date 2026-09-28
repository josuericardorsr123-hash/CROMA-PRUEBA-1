import { z } from "zod";

const NO_SOPORTADAS = [
  "$schema", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minItems", "maxItems", "uniqueItems", "pattern", "default", "examples", "title", "minProperties", "maxProperties",
];
const FORMATOS_SOPORTADOS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

function sanear(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(sanear);
  if (!nodo || typeof nodo !== "object") return nodo;
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(nodo as Record<string, unknown>)) {
    if (NO_SOPORTADAS.includes(k)) continue;
    if (k === "format" && typeof v === "string" && !FORMATOS_SOPORTADOS.has(v)) continue;
    salida[k] = sanear(v);
  }
  if (salida.type === "object" || salida.properties) {
    const props = (salida.properties ?? {}) as Record<string, unknown>;
    salida.properties = props;
    salida.required = Object.keys(props);
    salida.additionalProperties = false;
  }
  return salida;
}

/**
 * JSON Schema compatible con salidas estructuradas: sin restricciones
 * numéricas ni de longitud, `additionalProperties: false` en todo objeto y
 * todas las propiedades requeridas (los opcionales se modelan como nullable).
 * Las restricciones eliminadas se siguen validando del lado del cliente con zod.
 */
export function aEsquemaEstructurado(esquema: z.ZodType): Record<string, unknown> {
  const bruto = z.toJSONSchema(esquema, { target: "draft-2020-12", io: "output", unrepresentable: "any" }) as Record<string, unknown>;
  return sanear(bruto) as Record<string, unknown>;
}
