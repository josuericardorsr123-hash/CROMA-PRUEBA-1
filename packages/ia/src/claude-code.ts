import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { entradaInvalida } from "./anthropic";
import { aEsquemaEstructurado } from "./esquemas";
import {
  type Adjunto, type BloqueContexto, ErrorIA, type Esfuerzo, type LlmPort, type PeticionAgente, type PeticionEstructurada,
  type RespuestaAgente, type RespuestaEstructurada, sumarUso, type TrazaHerramienta, type Uso, USO_CERO,
} from "./puerto";

/* ────────────────────────────────────────────────────────────────────────────
 * Proveedor sobre Claude Code en modo no interactivo (`claude -p`), para uso
 * PERSONAL y LOCAL con la sesión de Claude Code del propio usuario
 * (https://code.claude.com/docs/en/headless). Anthropic no permite ofrecer el
 * inicio de sesión de claude.ai a terceros: este proveedor no debe usarse en
 * un despliegue que atienda a otras personas; para eso, ANTHROPIC_API_KEY.
 *
 *  - Salidas estructuradas con --json-schema (campo structured_output) y
 *    validación zod del lado del sistema, con un reintento.
 *  - Sin herramientas integradas (--tools ""), salvo Read acotado al
 *    directorio temporal cuando hay adjuntos (PDF o imágenes).
 *  - Nunca --bare: ese modo exige clave de API y no usa la suscripción.
 *  - El agente con herramientas se emula con un protocolo JSON por turnos
 *    sobre la misma sesión (--resume); cada llamada la ejecuta el sistema,
 *    no Claude Code, y su entrada se valida contra el esquema.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ResultadoProceso {
  codigo: number | null;
  stdout: string;
  stderr: string;
}

/** Ejecuta el CLI; inyectable para pruebas. */
export type EjecutorCli = (comando: string, args: string[], entrada: string, o: { timeoutMs: number; cwd: string; entorno: NodeJS.ProcessEnv }) => Promise<ResultadoProceso>;

export interface ConfiguracionClaudeCode {
  /** Ruta o nombre del ejecutable (por defecto `claude`). */
  comando?: string;
  /** Alias o nombre completo del modelo (--model); por defecto, el de la sesión de Claude Code. */
  modelo?: string;
  timeoutMs?: number;
  ejecutor?: EjecutorCli;
  entorno?: NodeJS.ProcessEnv;
}

interface SalidaCli {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  session_id?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  modelUsage?: Record<string, unknown>;
}

export const ejecutarCli: EjecutorCli = (comando, args, entrada, o) =>
  new Promise((ok, falla) => {
    const hijo = spawn(comando, args, { cwd: o.cwd, env: o.entorno, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const reloj = setTimeout(() => hijo.kill("SIGTERM"), o.timeoutMs);
    hijo.stdout.on("data", (d) => (stdout += d));
    hijo.stderr.on("data", (d) => (stderr += d));
    hijo.on("error", (e) => {
      clearTimeout(reloj);
      falla((e as NodeJS.ErrnoException).code === "ENOENT" ? new ErrorIA("SIN_CREDENCIAL", `No se encontró el ejecutable «${comando}». Instale Claude Code e inicie sesión (claude), o configure EM_CLAUDE_COMANDO.`) : e);
    });
    hijo.on("close", (codigo) => {
      clearTimeout(reloj);
      ok({ codigo, stdout, stderr });
    });
    hijo.stdin.end(entrada);
  });

const EXT: Record<Adjunto["mediaType"], string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };

function usoDe(u: SalidaCli["usage"]): Uso {
  return { entrada: u?.input_tokens ?? 0, salida: u?.output_tokens ?? 0, cacheEscritura: u?.cache_creation_input_tokens ?? 0, cacheLectura: u?.cache_read_input_tokens ?? 0 };
}

function textoContexto(contexto: BloqueContexto[] | undefined): string {
  return (contexto ?? []).map((c) => `<${c.titulo}>\n${c.texto}\n</${c.titulo}>`).join("\n\n");
}

/** Primer objeto JSON presente en un texto (respaldo si structured_output no llega). */
function jsonEnTexto(t: string | undefined): unknown {
  if (!t) return undefined;
  const limpio = t.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(limpio);
  } catch {
    const i = limpio.indexOf("{");
    const j = limpio.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try {
        return JSON.parse(limpio.slice(i, j + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

const ESQUEMA_TURNO = {
  type: "object",
  properties: {
    accion: { type: "string", enum: ["HERRAMIENTA", "FINAL"] },
    herramienta: { type: ["string", "null"] },
    entrada: { type: ["object", "null"] },
    texto: { type: "string" },
  },
  required: ["accion", "herramienta", "entrada", "texto"],
  additionalProperties: false,
} as const;

interface Turno {
  accion: "HERRAMIENTA" | "FINAL";
  herramienta: string | null;
  entrada: Record<string, unknown> | null;
  texto: string;
}

export class LlmClaudeCode implements LlmPort {
  readonly nombre = "claude-code";
  private readonly comando: string;
  private readonly timeoutMs: number;
  private readonly ejecutor: EjecutorCli;
  private readonly entorno: NodeJS.ProcessEnv;

  constructor(private readonly cfg: ConfiguracionClaudeCode = {}) {
    this.comando = cfg.comando ?? "claude";
    this.timeoutMs = cfg.timeoutMs ?? 20 * 60_000;
    this.ejecutor = cfg.ejecutor ?? ejecutarCli;
    // Sin ANTHROPIC_API_KEY en el entorno del hijo: este proveedor usa la sesión de Claude Code del usuario.
    const { ANTHROPIC_API_KEY: _omitida, ...resto } = cfg.entorno ?? process.env;
    this.entorno = resto;
  }

  private comunes(esfuerzo: Esfuerzo | undefined): string[] {
    return ["-p", "--output-format", "json", "--strict-mcp-config", ...(this.cfg.modelo ? ["--model", this.cfg.modelo] : []), ...(esfuerzo ? ["--effort", esfuerzo] : [])];
  }

  private async invocar(args: string[], entrada: string, cwd: string): Promise<SalidaCli> {
    const r = await this.ejecutor(this.comando, args, entrada, { timeoutMs: this.timeoutMs, cwd, entorno: this.entorno });
    let salida: SalidaCli | undefined;
    try {
      salida = JSON.parse(r.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "") as SalidaCli;
    } catch {
      salida = undefined;
    }
    const mensaje = `${salida?.result ?? ""} ${r.stderr}`.trim();
    if (!salida || r.codigo !== 0 || salida.is_error) {
      if (/log ?in|not logged|authenticat|\/login|credential/i.test(mensaje)) throw new ErrorIA("SIN_CREDENCIAL", "Claude Code no tiene sesión iniciada: ejecute `claude` una vez e inicie sesión con su cuenta.", mensaje.slice(0, 500));
      if (/usage limit|rate limit|limit reached|too many requests/i.test(mensaje)) throw new ErrorIA("API", "Se alcanzó el límite de uso de su plan de Claude; reintente cuando se restablezca.", mensaje.slice(0, 500));
      if (r.codigo === null) throw new ErrorIA("API", `Claude Code no respondió en ${Math.round(this.timeoutMs / 1000)} s.`);
      throw new ErrorIA("API", `Claude Code terminó con error${r.codigo !== null ? ` (código ${r.codigo})` : ""}: ${mensaje.slice(0, 300) || "sin detalle"}`, mensaje.slice(0, 2000));
    }
    if (salida.subtype === "error_max_turns") throw new ErrorIA("LIMITE_TURNOS", "Claude Code agotó sus turnos internos.");
    return salida;
  }

  private modeloDe(s: SalidaCli): string {
    return Object.keys(s.modelUsage ?? {})[0] ?? this.cfg.modelo ?? "claude-code";
  }

  async estructurado<T>(p: PeticionEstructurada<T>): Promise<RespuestaEstructurada<T>> {
    const esquema = aEsquemaEstructurado(p.esquema);
    const dir = await mkdtemp(join(tmpdir(), "em-cc-"));
    try {
      const rutas: string[] = [];
      for (const [i, a] of (p.adjuntos ?? []).entries()) {
        const ruta = join(dir, `adjunto-${String(i + 1).padStart(3, "0")}.${EXT[a.mediaType]}`);
        await writeFile(ruta, Buffer.from(a.base64, "base64"));
        rutas.push(ruta);
      }
      const herramientas = rutas.length ? ["--tools", "Read", "--allowedTools", "Read", "--add-dir", dir] : ["--tools", ""];
      const adjuntos = rutas.length
        ? `\n\nADJUNTOS (léalos completos con la herramienta Read, en este orden; la «imagen adjunta n.º k» es el archivo k):\n${rutas.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
        : "";
      let instruccion = `${textoContexto(p.contexto)}${adjuntos}\n\n${p.instruccion}\n\nResponde únicamente con el objeto JSON que cumple el esquema ${p.nombreEsquema}.`;
      let uso = USO_CERO;
      for (let intento = 0; intento < 2; intento++) {
        const s = await this.invocar([...this.comunes(p.esfuerzo), "--no-session-persistence", "--system-prompt", p.sistema, "--json-schema", JSON.stringify(esquema), ...herramientas], instruccion, dir);
        uso = sumarUso(uso, usoDe(s.usage));
        const bruto = s.structured_output ?? jsonEnTexto(s.result);
        const r = p.esquema.safeParse(bruto);
        if (r.success) return { datos: r.data, uso, modelo: this.modeloDe(s), detencion: s.subtype ?? "success", fallbackUsado: false };
        instruccion += `\n\nTu respuesta anterior no cumple el esquema: ${r.error.issues.slice(0, 8).map((x) => `${x.path.join(".") || "raíz"}: ${x.message}`).join("; ")}. Corrígela y responde de nuevo con el objeto completo.`;
      }
      throw new ErrorIA("ESQUEMA_INVALIDO", `La salida de la tarea ${p.tarea} no cumplió el esquema ${p.nombreEsquema} tras dos intentos (Claude Code).`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async agente(p: PeticionAgente): Promise<RespuestaAgente> {
    const dir = await mkdtemp(join(tmpdir(), "em-cc-"));
    const trazas: TrazaHerramienta[] = [];
    let uso = USO_CERO;
    let sesion: string | null = null;
    let modelo = this.cfg.modelo ?? "claude-code";
    const catalogo = p.herramientas.map((h) => `- ${h.nombre}: ${h.descripcion}\n  esquema de entrada: ${JSON.stringify(h.esquema)}`).join("\n");
    let mensaje = `${textoContexto(p.contexto)}\n\n${p.instruccion}\n\nHERRAMIENTAS DISPONIBLES (las ejecuta el sistema; tú solo las solicitas):\n${catalogo}\n\n`
      + "Protocolo: en cada respuesta devuelve un objeto JSON. Para usar una herramienta: accion=HERRAMIENTA, herramienta=<nombre>, entrada=<objeto que cumple su esquema>, texto=<por qué>. "
      + "Cuando termines: accion=FINAL, herramienta=null, entrada=null, texto=<respuesta final completa>. Una herramienta por turno; recibirás su resultado en el mensaje siguiente.";
    const max = p.maxTurnos ?? 12;
    try {
      for (let turno = 1; turno <= max; turno++) {
        const args = [...this.comunes(p.esfuerzo), "--tools", "", "--json-schema", JSON.stringify(ESQUEMA_TURNO), ...(sesion ? ["--resume", sesion] : ["--system-prompt", p.sistema])];
        const s = await this.invocar(args, mensaje, dir);
        uso = sumarUso(uso, usoDe(s.usage));
        sesion = s.session_id ?? sesion;
        modelo = this.modeloDe(s);
        const t = (s.structured_output ?? jsonEnTexto(s.result)) as Turno | undefined;
        if (!t || (t.accion !== "HERRAMIENTA" && t.accion !== "FINAL")) {
          mensaje = "Tu respuesta no siguió el protocolo JSON. Responde de nuevo con accion, herramienta, entrada y texto.";
          continue;
        }
        if (t.accion === "FINAL") return { texto: t.texto, trazas, turnos: turno, uso, modelo };
        const h = p.herramientas.find((x) => x.nombre === t.herramienta);
        const invalida = h ? entradaInvalida(h.esquema, t.entrada) : null;
        let r: { contenido: string; esError?: boolean };
        try {
          r = !h ? { contenido: `Herramienta desconocida: ${t.herramienta}. Disponibles: ${p.herramientas.map((x) => x.nombre).join(", ")}.`, esError: true }
            : invalida ? { contenido: `INVALID_JSON: la entrada de ${h.nombre} no cumple su esquema (${invalida}).`, esError: true }
            : await h.ejecutar(t.entrada);
        } catch (e) {
          r = { contenido: `Error ejecutando ${t.herramienta}: ${String((e as Error).message ?? e)}`, esError: true };
        }
        trazas.push({ herramienta: t.herramienta ?? "?", entrada: t.entrada, esError: Boolean(r.esError), resumen: r.contenido.slice(0, 200) });
        mensaje = `RESULTADO DE ${t.herramienta}${r.esError ? " (ERROR)" : ""}:\n${r.contenido}\n\nContinúa según el protocolo.`;
      }
      throw new ErrorIA("LIMITE_TURNOS", `El agente de ${p.tarea} alcanzó ${max} turnos sin concluir (Claude Code).`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
