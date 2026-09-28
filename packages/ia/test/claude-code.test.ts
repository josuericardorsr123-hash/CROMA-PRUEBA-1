import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type EjecutorCli, ErrorIA, LlmClaudeCode, type ResultadoProceso } from "../src";

/* Proveedor Claude Code con un ejecutor simulado: se verifica la línea de
 * comandos, el paso de adjuntos, la validación del esquema y el protocolo
 * del agente, sin invocar el CLI real. */

type Llamada = { args: string[]; entrada: string; cwd: string; entorno: NodeJS.ProcessEnv; archivos: Record<string, number> };

function ejecutor(respuestas: Array<Partial<ResultadoProceso> & { json?: unknown }>) {
  const llamadas: Llamada[] = [];
  const fn: EjecutorCli = async (_c, args, entrada, o) => {
    const archivos: Record<string, number> = {};
    for (const m of entrada.matchAll(/\d+\. (\S+adjunto-\d+\.\w+)/g)) if (existsSync(m[1]!)) archivos[m[1]!] = readFileSync(m[1]!).length;
    llamadas.push({ args, entrada, cwd: o.cwd, entorno: o.entorno, archivos });
    const r = respuestas.shift();
    if (!r) throw new Error("sin respuesta preparada");
    return { codigo: r.codigo ?? 0, stdout: r.stdout ?? JSON.stringify(r.json), stderr: r.stderr ?? "" };
  };
  return { fn, llamadas };
}

const exito = (structured_output: unknown, extra: Record<string, unknown> = {}) => ({ json: { type: "result", subtype: "success", is_error: false, result: "", structured_output, session_id: "ses-1", usage: { input_tokens: 100, output_tokens: 20 }, modelUsage: { "claude-opus-5": {} }, ...extra } });
const Esquema = z.object({ tipologia: z.string().min(3), paginas: z.number().int().min(1) });

describe("proveedor Claude Code (claude -p)", () => {
  it("pide salida estructurada sin herramientas, sin --bare y sin la clave de API en el entorno", async () => {
    const { fn, llamadas } = ejecutor([exito({ tipologia: "PODER", paginas: 2 })]);
    const llm = new LlmClaudeCode({ ejecutor: fn, modelo: "opus", entorno: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-no-usar" } });
    const r = await llm.estructurado({ tarea: "lectura", sistema: "SISTEMA", contexto: [{ titulo: "CASO", texto: "datos" }], instruccion: "Lee.", esquema: Esquema, nombreEsquema: "Lectura", esfuerzo: "medium" });
    expect(r.datos).toEqual({ tipologia: "PODER", paginas: 2 });
    expect(r.modelo).toBe("claude-opus-5");
    expect(r.uso.entrada).toBe(100);
    const a = llamadas[0]!.args;
    expect(a.slice(0, 3)).toEqual(["-p", "--output-format", "json"]);
    expect(a).not.toContain("--bare");
    expect(a[a.indexOf("--tools") + 1]).toBe("");
    expect(a[a.indexOf("--model") + 1]).toBe("opus");
    expect(a[a.indexOf("--effort") + 1]).toBe("medium");
    expect(a[a.indexOf("--system-prompt") + 1]).toBe("SISTEMA");
    expect(JSON.parse(a[a.indexOf("--json-schema") + 1]!).required).toEqual(["tipologia", "paginas"]);
    expect(llamadas[0]!.entrada).toContain("<CASO>\ndatos\n</CASO>");
    expect(llamadas[0]!.entorno.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("entrega los adjuntos como archivos legibles solo con Read y los borra al terminar", async () => {
    const { fn, llamadas } = ejecutor([exito({ tipologia: "PAGARE", paginas: 1 })]);
    await new LlmClaudeCode({ ejecutor: fn }).estructurado({ tarea: "lectura", sistema: "s", instruccion: "Lee.", adjuntos: [{ tipo: "imagen", mediaType: "image/png", base64: Buffer.from("png-falso").toString("base64") }], esquema: Esquema, nombreEsquema: "L" });
    const a = llamadas[0]!.args;
    expect(a[a.indexOf("--tools") + 1]).toBe("Read");
    expect(a[a.indexOf("--add-dir") + 1]).toBe(llamadas[0]!.cwd);
    expect(Object.values(llamadas[0]!.archivos)).toEqual([9]);
    expect(existsSync(llamadas[0]!.cwd)).toBe(false);
  });

  it("reintenta una vez con el error del esquema y luego falla con ESQUEMA_INVALIDO", async () => {
    const { fn, llamadas } = ejecutor([exito({ tipologia: "X", paginas: 0 }), exito({ tipologia: "X" })]);
    await expect(new LlmClaudeCode({ ejecutor: fn }).estructurado({ tarea: "lectura", sistema: "s", instruccion: "i", esquema: Esquema, nombreEsquema: "L" })).rejects.toMatchObject({ codigo: "ESQUEMA_INVALIDO" });
    expect(llamadas[1]!.entrada).toContain("no cumple el esquema");
  });

  it("acepta el JSON en result cuando no llega structured_output", async () => {
    const { fn } = ejecutor([{ json: { type: "result", subtype: "success", result: "```json\n{\"tipologia\":\"AUTO\",\"paginas\":3}\n```" } }]);
    expect((await new LlmClaudeCode({ ejecutor: fn }).estructurado({ tarea: "t", sistema: "s", instruccion: "i", esquema: Esquema, nombreEsquema: "L" })).datos.tipologia).toBe("AUTO");
  });

  it("traduce sesión no iniciada y límite de uso en errores explicativos", async () => {
    const sinSesion = ejecutor([{ codigo: 1, stdout: JSON.stringify({ is_error: true, result: "Not logged in · Please run /login" }) }]);
    await expect(new LlmClaudeCode({ ejecutor: sinSesion.fn }).estructurado({ tarea: "t", sistema: "s", instruccion: "i", esquema: Esquema, nombreEsquema: "L" })).rejects.toMatchObject({ codigo: "SIN_CREDENCIAL" });
    const limite = ejecutor([{ codigo: 1, stdout: JSON.stringify({ is_error: true, result: "Claude usage limit reached" }) }]);
    const e = await new LlmClaudeCode({ ejecutor: limite.fn }).estructurado({ tarea: "t", sistema: "s", instruccion: "i", esquema: Esquema, nombreEsquema: "L" }).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorIA);
    expect(e.message).toMatch(/límite de uso/);
  });

  it("emula el agente: valida la entrada, ejecuta la herramienta del sistema y reanuda la sesión", async () => {
    const { fn, llamadas } = ejecutor([
      exito({ accion: "HERRAMIENTA", herramienta: "buscar", entrada: {}, texto: "sin q" }),
      exito({ accion: "HERRAMIENTA", herramienta: "buscar", entrada: { q: "art. 422" }, texto: "busco" }),
      exito({ accion: "FINAL", herramienta: null, entrada: null, texto: "Listo: art. 422 verificado." }),
    ]);
    const ejecutadas: unknown[] = [];
    const r = await new LlmClaudeCode({ ejecutor: fn }).agente({
      tarea: "investigacion", sistema: "SIS", instruccion: "Investiga.",
      herramientas: [{ nombre: "buscar", descripcion: "busca", esquema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] }, ejecutar: async (e) => (ejecutadas.push(e), { contenido: "texto oficial" }) }],
    });
    expect(r.texto).toBe("Listo: art. 422 verificado.");
    expect(r.turnos).toBe(3);
    expect(ejecutadas).toEqual([{ q: "art. 422" }]);
    expect(r.trazas.map((t) => t.esError)).toEqual([true, false]);
    expect(llamadas[1]!.entrada).toMatch(/INVALID_JSON/);
    expect(llamadas[0]!.args).toContain("--system-prompt");
    expect(llamadas[1]!.args[llamadas[1]!.args.indexOf("--resume") + 1]).toBe("ses-1");
    expect(llamadas[2]!.entrada).toContain("texto oficial");
  });
});
