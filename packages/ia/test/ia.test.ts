import { describe, expect, it } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { aEsquemaEstructurado, ErrorIA, LlmAnthropic, LlmSimulado } from "../src";

const Esquema = z.object({
  tipologia: z.string().min(3),
  fecha: z.string().nullable(),
  paginas: z.array(z.object({ numero: z.number().int().min(1), legible: z.boolean() })).min(1),
  nota: z.string().optional(),
});

function clienteFalso(respuestas: Array<Partial<Anthropic.Beta.BetaMessage>>) {
  const enviados: Array<Record<string, unknown>> = [];
  const cliente = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          enviados.push(structuredClone(params));
          const r = respuestas.shift();
          if (!r) throw new Error("sin respuesta preparada");
          return { finalMessage: async () => ({ model: "claude-opus-5", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }, content: [], ...r }) };
        },
      },
    },
  } as unknown as Anthropic;
  return { cliente, enviados };
}

describe("esquema para salidas estructuradas", () => {
  it("elimina restricciones no soportadas y exige todas las propiedades", () => {
    const s = aEsquemaEstructurado(Esquema) as Record<string, any>;
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(["tipologia", "fecha", "paginas", "nota"]);
    expect(JSON.stringify(s)).not.toMatch(/minLength|minimum|minItems|\$schema/);
    expect(s.properties.paginas.items.additionalProperties).toBe(false);
  });
});

describe("proveedor Claude", () => {
  it("envía streaming con pensamiento adaptativo, esfuerzo, formato JSON, sistema cacheado y fallback por defecto", async () => {
    const { cliente, enviados } = clienteFalso([{ content: [{ type: "text", text: JSON.stringify({ tipologia: "PAGARE", fecha: "2024-01-10", paginas: [{ numero: 1, legible: true }], nota: "" }) } as any] }]);
    const llm = new LlmAnthropic({ cliente });
    const r = await llm.estructurado({ tarea: "lectura", sistema: "reglas", contexto: [{ titulo: "expediente", texto: "..." }], adjuntos: [{ tipo: "imagen", mediaType: "image/png", base64: "AAAA" }], instruccion: "Lee", esquema: Esquema, nombreEsquema: "Lectura" });
    expect(r.datos.tipologia).toBe("PAGARE");
    const p = enviados[0]!;
    expect(p.model).toBe("claude-opus-5");
    expect(p.thinking).toEqual({ type: "adaptive" });
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect((p.output_config as any).effort).toBe("medium");
    expect((p.output_config as any).format.type).toBe("json_schema");
    expect((p.system as any)[0].cache_control).toEqual({ type: "ephemeral" });
    const contenido = (p.messages as any)[0].content;
    expect(contenido[0].type).toBe("image");
    expect(contenido[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("reintenta una vez si la salida no cumple el esquema y luego falla con error tipado", async () => {
    const malo = { content: [{ type: "text", text: JSON.stringify({ tipologia: "x", fecha: null, paginas: [] }) } as any] };
    const { cliente, enviados } = clienteFalso([malo, malo]);
    await expect(new LlmAnthropic({ cliente }).estructurado({ tarea: "lectura", sistema: "s", instruccion: "i", esquema: Esquema, nombreEsquema: "Lectura" })).rejects.toMatchObject({ codigo: "ESQUEMA_INVALIDO" });
    expect(enviados).toHaveLength(2);
    expect(JSON.stringify((enviados[1]!.messages as any)[2])).toContain("no cumple el esquema");
  });

  it("trata el rechazo del clasificador como error, nunca como contenido", async () => {
    const { cliente } = clienteFalso([{ stop_reason: "refusal", content: [] }]);
    await expect(new LlmAnthropic({ cliente }).estructurado({ tarea: "analisis", sistema: "s", instruccion: "i", esquema: Esquema, nombreEsquema: "X" })).rejects.toBeInstanceOf(ErrorIA);
  });

  it("ejecuta el bucle de herramientas y devuelve resultados en un solo mensaje", async () => {
    const { cliente, enviados } = clienteFalso([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "buscar", input: { q: "a" } } as any, { type: "tool_use", id: "t2", name: "buscar", input: { q: "b" } } as any] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "listo" } as any] },
    ]);
    const llm = new LlmAnthropic({ cliente });
    const r = await llm.agente({ tarea: "investigacion", sistema: "s", instruccion: "investiga", herramientas: [{ nombre: "buscar", descripcion: "busca", esquema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] }, ejecutar: async (e: any) => ({ contenido: `resultado ${e.q}` }) }] });
    expect(r.texto).toBe("listo");
    expect(r.trazas.map((t) => t.entrada)).toEqual([{ q: "a" }, { q: "b" }]);
    const segundo = (enviados[1]!.messages as any[]);
    expect(segundo[2].content).toHaveLength(2);
    expect(segundo[2].content[0].type).toBe("tool_result");
  });
});

describe("proveedor simulado", () => {
  it("valida los accesorios contra el esquema real", async () => {
    const llm = new LlmSimulado({ lectura: () => ({ tipologia: "PODER", fecha: null, paginas: [{ numero: 1, legible: true }] }) });
    expect((await llm.estructurado({ tarea: "lectura", sistema: "", instruccion: "", esquema: Esquema, nombreEsquema: "L" })).datos.tipologia).toBe("PODER");
    await expect(new LlmSimulado({ lectura: () => ({ tipologia: "X" }) }).estructurado({ tarea: "lectura", sistema: "", instruccion: "", esquema: Esquema, nombreEsquema: "L" })).rejects.toMatchObject({ codigo: "ESQUEMA_INVALIDO" });
  });
});
