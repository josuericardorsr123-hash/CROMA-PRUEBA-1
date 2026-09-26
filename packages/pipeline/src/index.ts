import type { Expediente } from "@em/dominio";
import type { ManejadorNodo, Servicios } from "./contexto";
import { Ejecutor, type OpcionesEjecucion, type ResultadoEjecucion } from "./ejecutor";
import { f5, g_riesgo, m08, m09, m10, m11, m13, m14, m18 } from "./nodos/analisis";
import { f6 } from "./nodos/entrega";
import { m15, m16, m17, m19, m20 } from "./nodos/estrategia";
import { f4, g_citas, m01, m02, m03, m04, m05, m06, m07, m21 } from "./nodos/fundamento";
import { g_habilitacion, g_revision, m22, m23, m24, m25, m27, m28 } from "./nodos/gobernanza";
import { f1, f2, m29, n_exp } from "./nodos/ingreso";
import { m26, m30, m31 } from "./nodos/oficiales";
import { f3, g_completo, m12 } from "./nodos/organizacion";
import { n_entrega, n_remision } from "./nodos/salida";

export * from "./contexto";
export * from "./config";
export * from "./ejecutor";
export * from "./esquemas";
export * from "./informe";
export * from "./auditoria";
export { SISTEMA } from "./ia";
export { etiquetar, verificarAfirmaciones, disociar } from "./nodos/gobernanza";
export { segmentar } from "./nodos/organizacion";
export { PATRONES } from "./nodos/ingreso";

/** Registro completo: un manejador por cada nodo del grafo validado (el ejecutor rechaza un grafo con nodos sin manejador). */
export const MANEJADORES: Record<string, ManejadorNodo> = {
  n_exp, f1, f2, m29, m30, m31, m26, f3, m12, g_completo,
  f4, m01, m02, m07, m03, m04, m05, m06, m21, g_citas,
  f5, m08, m09, m10, m11, m13, m14, m18, g_riesgo,
  m20, m15, m16, m17, m19, f6,
  m28, m22, m23, m25, m24, g_habilitacion, g_revision, m27,
  n_entrega, n_remision,
};

let ejecutor: Ejecutor | null = null;

/** Ejecuta (o reanuda) el pipeline completo de un expediente. */
export function ejecutarPipeline(exp: Expediente, servicios: Servicios, opciones: OpcionesEjecucion): Promise<ResultadoEjecucion> {
  ejecutor ??= new Ejecutor(MANEJADORES);
  return ejecutor.ejecutar(exp, servicios, opciones);
}

export { crearLlmDemostracion, type OpcionesDemostracion } from "./demostracion/llm";
export { construirExpedienteDemo, datosCromaDemo, PARTES_DEMO, TEXTOS_DEMO } from "./demostracion/expediente";
export { prepararDemostracion, PERFIL_DEMO, CLAVE_CROMA_DEMO, type EntornoDemostracion, type OpcionesEntorno } from "./demostracion/entorno";
