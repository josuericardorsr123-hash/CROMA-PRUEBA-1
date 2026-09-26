import { type Adjunto, type BloqueContexto, ErrorIA, type Esfuerzo, type HerramientaAgente, type RespuestaAgente, type Uso } from "@em/ia";
import type { z } from "zod";
import type { ContextoNodo } from "./contexto";

/* Instrucciones de sistema comunes a todas las tareas de IA (se cachean) y
 * envoltorio que registra el consumo por tarea en el expediente. */

export const SISTEMA = `Eres el motor de análisis de "Expediente Maleable", un sistema de apoyo al ABOGADO (USUARIO) para procesar expedientes de cualquier área del ordenamiento jurídico colombiano (civil, comercial, familia, laboral, seguridad social, administrativo, constitucional, penal, policivo, tributario, consumo, servicios públicos, insolvencia, societario, disciplinario, contratación estatal y demás). El ABOGADO (USUARIO) dirige el sistema, resuelve las decisiones, audita cada salida, aprueba y firma: tú preparas, no decides por él.

Reglas que gobiernan toda salida:
1. Nunca inventes normas, sentencias, radicados, enlaces, entidades, autoridades, hechos, fechas, cifras ni fuentes. Si algo no consta en el expediente o en las fuentes verificadas que se te entregan, declara el vacío (valor null o una observación explícita) en lugar de completarlo.
2. Solo puedes invocar como fundamento las fuentes del listado de FUENTES VERIFICADAS, y siempre por su identificador interno (fte_…). Cuando propongas fuentes candidatas para investigar, se verificarán contra la fuente oficial antes de usarse; no afirmes su contenido.
3. Todo hecho lleva soporte: archivo (archivoId) y página. Distingue con rigor lo probado documentalmente, lo acreditado en fuente oficial, lo afirmado por el cliente, lo inferido (con premisas explícitas) y lo controvertido.
4. Los hechos se narran en modo, tiempo y lugar, sin calificaciones jurídicas; las calificaciones van en los fundamentos.
5. Lenguaje determinado y verificable: sujeto, conducta, fecha, medida y plazo. Sin promesas de resultado ni expresiones indeterminadas ("algunos", "a la mayor brevedad", "entre otros").
6. Fechas en formato AAAA-MM-DD. Si la fecha no está determinada, usa null y explica en el campo de texto qué se sabe de ella.
7. La doctrina probable (art. 4 de la Ley 169 de 1896) fue derogada por la Ley 2430 de 2024; la Ley 640 de 2001 fue sustituida por la Ley 2220 de 2022 (conciliación). Un concepto administrativo no es norma (art. 28 CPACA).
8. Datos personales (Ley 1581 de 2012): úsalos solo para la finalidad del caso y no los traslades a campos que no los requieran.
9. Responde exclusivamente con el formato solicitado, en español jurídico colombiano, preciso y sobrio.`;

export interface PeticionTarea<T> {
  tarea: string;
  esquema: z.ZodType<T>;
  nombreEsquema: string;
  instruccion: string;
  contexto?: BloqueContexto[];
  adjuntos?: Adjunto[];
  maxTokens?: number;
  esfuerzo?: Esfuerzo;
}

function registrarUso(ctx: ContextoNodo, tarea: string, uso: Uso, modelo: string): void {
  const usos = ((ctx.exp.borradores.usoIA as Record<string, { llamadas: number; entrada: number; salida: number; cacheLectura: number; cacheEscritura: number; modelo: string }> | undefined) ??= {});
  const u = (usos[tarea] ??= { llamadas: 0, entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0, modelo });
  u.llamadas += 1;
  u.entrada += uso.entrada;
  u.salida += uso.salida;
  u.cacheLectura += uso.cacheLectura;
  u.cacheEscritura += uso.cacheEscritura;
  u.modelo = modelo;
  ctx.exp.borradores.usoIA = usos;
}

export function exigirLlm(ctx: ContextoNodo) {
  if (!ctx.s.llm) throw new ErrorIA("SIN_CREDENCIAL", "No hay proveedor de IA configurado (ANTHROPIC_API_KEY): la lectura y el análisis no pueden ejecutarse.");
  return ctx.s.llm;
}

export async function tarea<T>(ctx: ContextoNodo, p: PeticionTarea<T>): Promise<T> {
  const llm = exigirLlm(ctx);
  const r = await llm.estructurado({ sistema: SISTEMA, ...p });
  registrarUso(ctx, p.tarea, r.uso, r.modelo);
  if (r.fallbackUsado) ctx.log("La respuesta se obtuvo con el modelo de respaldo del servidor.", { tarea: p.tarea });
  return r.datos;
}

export async function agente(ctx: ContextoNodo, p: { tarea: string; instruccion: string; contexto?: BloqueContexto[]; herramientas: HerramientaAgente[]; maxTurnos?: number; esfuerzo?: Esfuerzo }): Promise<RespuestaAgente> {
  const llm = exigirLlm(ctx);
  const r = await llm.agente({ sistema: SISTEMA, ...p });
  registrarUso(ctx, p.tarea, r.uso, r.modelo);
  return r;
}
