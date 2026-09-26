import Anthropic from "@anthropic-ai/sdk";
import { aEsquemaEstructurado } from "./esquemas";
import {
  type Adjunto, type BloqueContexto, ErrorIA, type Esfuerzo, type LlmPort, type PeticionAgente, type PeticionEstructurada,
  type RespuestaAgente, type RespuestaEstructurada, sumarUso, type TrazaHerramienta, type Uso, USO_CERO,
} from "./puerto";

export interface RegistroIA {
  info(msg: string, datos?: Record<string, unknown>): void;
  warn(msg: string, datos?: Record<string, unknown>): void;
}

export interface ConfiguracionLlm {
  /** Modelo por defecto: claude-opus-5 (salvo que el operador indique otro). */
  modelo?: string;
  modelosPorTarea?: Record<string, string>;
  esfuerzoPorTarea?: Record<string, Esfuerzo>;
  maxTokens?: number;
  /** Reintento del lado servidor en otro modelo ante rechazo por clasificador (beta server-side-fallback). */
  fallbacks?: boolean;
  apiKey?: string;
  baseURL?: string;
  registro?: RegistroIA;
  cliente?: Anthropic;
}

export const MODELO_POR_DEFECTO = "claude-opus-5";

const ESFUERZO_POR_DEFECTO: Record<string, Esfuerzo> = {
  lectura: "medium", consolidacion: "high", planificacion: "high", investigacion: "high", ficha: "medium",
  analisis: "high", estrategia: "high", redaccion_informe: "high", redaccion_pieza: "high", contradictor: "high",
  sesgo: "medium", retroalimentacion: "low", anonimizacion: "low",
};

type Bloque = Record<string, unknown>;

function bloquesUsuario(contexto: BloqueContexto[] | undefined, adjuntos: Adjunto[] | undefined, instruccion: string): Bloque[] {
  const bloques: Bloque[] = [];
  for (const a of adjuntos ?? []) {
    if (a.tipo === "pdf") bloques.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 }, ...(a.titulo ? { title: a.titulo } : {}) });
    else bloques.push({ type: "image", source: { type: "base64", media_type: a.mediaType, data: a.base64 } });
  }
  (contexto ?? []).forEach((c, i, todos) => {
    bloques.push({ type: "text", text: `<${c.titulo}>\n${c.texto}\n</${c.titulo}>`, ...(i === todos.length - 1 ? { cache_control: { type: "ephemeral" } } : {}) });
  });
  bloques.push({ type: "text", text: instruccion });
  return bloques;
}

function usoDe(u: { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } | undefined): Uso {
  return { entrada: u?.input_tokens ?? 0, salida: u?.output_tokens ?? 0, cacheEscritura: u?.cache_creation_input_tokens ?? 0, cacheLectura: u?.cache_read_input_tokens ?? 0 };
}

type EsquemaJson = { type?: string | string[]; properties?: Record<string, EsquemaJson>; required?: string[]; items?: EsquemaJson; enum?: unknown[] };

const tipoDe = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v);

/**
 * Validación estructural de la entrada de una herramienta contra su esquema
 * JSON (tipos, obligatorios, enumeraciones, anidados). Con la entrada en
 * streaming, un JSON truncado puede llegar parseado a medias: se detecta aquí.
 */
export function entradaInvalida(esquema: unknown, v: unknown, ruta = "entrada"): string | null {
  const e = (esquema ?? {}) as EsquemaJson;
  const tipos = e.type === undefined ? [] : Array.isArray(e.type) ? e.type : [e.type];
  const t = tipoDe(v);
  if (tipos.length && !tipos.some((x) => x === t || (x === "number" && t === "integer"))) return `${ruta}: se esperaba ${tipos.join("|")}, llegó ${t}`;
  if (e.enum && !e.enum.some((x) => JSON.stringify(x) === JSON.stringify(v))) return `${ruta}: valor fuera de la enumeración`;
  if (t === "object") {
    const o = v as Record<string, unknown>;
    for (const r of e.required ?? []) if (o[r] === undefined) return `${ruta}.${r}: obligatorio`;
    for (const [k, sub] of Object.entries(e.properties ?? {})) if (o[k] !== undefined) {
      const m = entradaInvalida(sub, o[k], `${ruta}.${k}`);
      if (m) return m;
    }
  }
  if (t === "array" && e.items) for (const [i, x] of (v as unknown[]).entries()) {
    const m = entradaInvalida(e.items, x, `${ruta}[${i}]`);
    if (m) return m;
  }
  return null;
}

/**
 * Proveedor Claude (API de Anthropic, SDK oficial). Toda petición va en
 * streaming (salidas largas sin agotar tiempos HTTP), con pensamiento adaptativo,
 * esfuerzo por tarea, sistema cacheado y fallback del lado servidor ante un
 * rechazo del clasificador. Revisa `stop_reason` antes de leer el contenido.
 */
export class LlmAnthropic implements LlmPort {
  readonly nombre = "anthropic";
  private readonly cliente: Anthropic;

  constructor(private readonly cfg: ConfiguracionLlm = {}) {
    this.cliente = cfg.cliente ?? new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, maxRetries: 3, timeout: 30 * 60 * 1000 });
  }

  private modelo(tarea: string): string {
    return this.cfg.modelosPorTarea?.[tarea] ?? this.cfg.modelo ?? MODELO_POR_DEFECTO;
  }

  private esfuerzo(tarea: string, pedido?: Esfuerzo): Esfuerzo {
    return pedido ?? this.cfg.esfuerzoPorTarea?.[tarea] ?? ESFUERZO_POR_DEFECTO[tarea] ?? "high";
  }

  private comunes(tarea: string) {
    const conFallback = this.cfg.fallbacks !== false;
    return {
      model: this.modelo(tarea),
      ...(conFallback ? { betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const } : {}),
      thinking: { type: "adaptive" as const },
    };
  }

  private async enviar(params: Record<string, unknown>): Promise<Anthropic.Beta.BetaMessage> {
    try {
      const stream = this.cliente.beta.messages.stream(params as unknown as Parameters<Anthropic["beta"]["messages"]["stream"]>[0]);
      return await stream.finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new ErrorIA("SIN_CREDENCIAL", "ANTHROPIC_API_KEY inválida o ausente.", e.message);
      if (e instanceof Anthropic.RateLimitError) throw new ErrorIA("API", "Límite de tasa de la API de Anthropic alcanzado; reintentar más tarde.", e.message);
      if (e instanceof Anthropic.BadRequestError) throw new ErrorIA("API", `Petición rechazada por la API: ${e.message}`, e.message);
      if (e instanceof Anthropic.APIError) throw new ErrorIA("API", `Error de la API (${e.status ?? "?"}): ${e.message}`, e.message);
      throw e;
    }
  }

  private revisarDetencion(m: Anthropic.Beta.BetaMessage): void {
    if (m.stop_reason === "refusal") {
      const cat = (m as unknown as { stop_details?: { category?: string | null } }).stop_details?.category ?? null;
      throw new ErrorIA("RECHAZO", `El modelo declinó la tarea${cat ? ` (categoría ${cat})` : ""}.`, cat);
    }
    if (m.stop_reason === "max_tokens") throw new ErrorIA("TRUNCADO", "La respuesta alcanzó max_tokens: dividir la tarea o ampliar el límite.");
  }

  private fallbackUsado(m: Anthropic.Beta.BetaMessage): boolean {
    const iter = (m.usage as unknown as { iterations?: Array<{ type?: string }> }).iterations ?? [];
    return iter.some((x) => x.type === "fallback_message");
  }

  async estructurado<T>(p: PeticionEstructurada<T>): Promise<RespuestaEstructurada<T>> {
    const schema = aEsquemaEstructurado(p.esquema);
    const mensajes: Array<{ role: "user" | "assistant"; content: unknown }> = [{ role: "user", content: bloquesUsuario(p.contexto, p.adjuntos, p.instruccion) }];
    let uso = USO_CERO;
    for (let intento = 0; intento < 2; intento++) {
      const m = await this.enviar({
        ...this.comunes(p.tarea),
        max_tokens: p.maxTokens ?? this.cfg.maxTokens ?? 64_000,
        output_config: { effort: this.esfuerzo(p.tarea, p.esfuerzo), format: { type: "json_schema", schema } },
        system: [{ type: "text", text: p.sistema, cache_control: { type: "ephemeral" } }],
        messages: mensajes,
      });
      uso = sumarUso(uso, usoDe(m.usage));
      this.revisarDetencion(m);
      const texto = m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
      let crudo: unknown;
      try {
        crudo = JSON.parse(texto);
      } catch {
        crudo = undefined;
      }
      const r = p.esquema.safeParse(crudo);
      if (r.success) {
        this.cfg.registro?.info("ia.estructurado", { tarea: p.tarea, modelo: m.model, uso });
        return { datos: r.data, uso, modelo: m.model, detencion: m.stop_reason ?? "end_turn", fallbackUsado: this.fallbackUsado(m) };
      }
      this.cfg.registro?.warn("ia.esquema_invalido", { tarea: p.tarea, intento, errores: r.error.issues.slice(0, 5) });
      mensajes.push({ role: "assistant", content: m.content }, { role: "user", content: [{ type: "text", text: `La salida anterior no cumple el esquema ${p.nombreEsquema}: ${JSON.stringify(r.error.issues.slice(0, 8))}. Genera nuevamente la salida completa y válida.` }] });
    }
    throw new ErrorIA("ESQUEMA_INVALIDO", `La salida de la tarea ${p.tarea} no cumplió el esquema ${p.nombreEsquema} tras dos intentos.`);
  }

  /** Bucle de herramientas (manual, para interceptar cada llamada y registrar su procedencia). */
  async agente(p: PeticionAgente): Promise<RespuestaAgente> {
    // Entrada de herramientas en streaming: el cliente valida cada entrada antes de ejecutarla.
    const herramientas = p.herramientas.map((h) => ({ name: h.nombre, description: h.descripcion, input_schema: h.esquema, eager_input_streaming: true }));
    const mensajes: Array<{ role: "user" | "assistant"; content: unknown }> = [{ role: "user", content: bloquesUsuario(p.contexto, undefined, p.instruccion) }];
    const trazas: TrazaHerramienta[] = [];
    let uso = USO_CERO;
    let modelo = this.modelo(p.tarea);
    const max = p.maxTurnos ?? 12;
    for (let turno = 1; turno <= max; turno++) {
      const m = await this.enviar({
        ...this.comunes(p.tarea),
        max_tokens: p.maxTokens ?? 32_000,
        output_config: { effort: this.esfuerzo(p.tarea, p.esfuerzo) },
        system: [{ type: "text", text: p.sistema, cache_control: { type: "ephemeral" } }],
        tools: herramientas,
        tool_choice: { type: "auto" },
        messages: mensajes,
      });
      uso = sumarUso(uso, usoDe(m.usage));
      modelo = m.model;
      if (m.stop_reason === "refusal") this.revisarDetencion(m);
      mensajes.push({ role: "assistant", content: m.content });
      if (m.stop_reason === "pause_turn") continue;
      const usos = m.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!usos.length) {
        const texto = m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
        return { texto, trazas, turnos: turno, uso, modelo };
      }
      if (m.stop_reason === "max_tokens") throw new ErrorIA("TRUNCADO", "Una llamada a herramienta quedó truncada por max_tokens.");
      const resultados = await Promise.all(usos.map(async (u) => {
        const h = p.herramientas.find((x) => x.nombre === u.name);
        let r: { contenido: string; esError?: boolean };
        try {
          const invalida = h ? entradaInvalida(h.esquema, u.input) : null;
          r = !h ? { contenido: `Herramienta desconocida: ${u.name}`, esError: true }
            : invalida ? { contenido: `INVALID_JSON: la entrada de ${u.name} no cumple su esquema (${invalida}). Reenvíe la llamada completa.`, esError: true }
            : await h.ejecutar(u.input);
        } catch (e) {
          r = { contenido: `Error ejecutando ${u.name}: ${String((e as Error).message ?? e)}`, esError: true };
        }
        trazas.push({ herramienta: u.name, entrada: u.input, esError: Boolean(r.esError), resumen: r.contenido.slice(0, 200) });
        return { type: "tool_result", tool_use_id: u.id, content: r.contenido, ...(r.esError ? { is_error: true } : {}) };
      }));
      mensajes.push({ role: "user", content: resultados });
    }
    throw new ErrorIA("LIMITE_TURNOS", `El agente de ${p.tarea} alcanzó ${max} turnos sin concluir.`);
  }
}
