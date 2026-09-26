import { readFileSync } from "node:fs";
import { ajustesSmmlvDesdeEntorno, CALENDARIO_POR_DEFECTO, PERFIL_NEUTRO, type PerfilDespacho, UMBRALES_POR_DEFECTO, validarPerfilDespacho } from "@em/motores";
import type { ConfigPipeline } from "./contexto";

export const AUTOR_POR_DEFECTO = "Josué Ricardo Rojas Silva";

function perfilDesdeArchivo(ruta: string | undefined): PerfilDespacho {
  if (!ruta) return PERFIL_NEUTRO;
  return validarPerfilDespacho(JSON.parse(readFileSync(ruta, "utf8")));
}

/** Lista de fechas AAAA-MM-DD separadas por comas; rechaza cualquier valor mal formado. */
function fechasDesdeEntorno(nombre: string, valor: string | undefined): string[] {
  const lista = (valor ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const f of lista) if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(`${f}T00:00:00Z`))) throw new Error(`${nombre}: fecha inválida «${f}» (use AAAA-MM-DD).`);
  return lista;
}

/** Configuración del despacho desde el entorno (todo es configurable; nada queda cableado al caso). */
export function configDesdeEntorno(entorno: NodeJS.ProcessEnv = process.env, extra: Partial<ConfigPipeline> = {}): ConfigPipeline {
  return {
    autorInforme: entorno.EM_AUTOR_INFORME ?? AUTOR_POR_DEFECTO,
    cargoAutor: entorno.EM_CARGO_AUTOR ?? null,
    publicacion: entorno.EM_PUBLICACION ?? "Expediente Maleable · Informe técnico",
    ciudad: entorno.EM_CIUDAD ?? "Bogotá D.C.",
    perfilDespacho: perfilDesdeArchivo(entorno.EM_PERFIL_DESPACHO),
    calendario: { ...CALENDARIO_POR_DEFECTO, cierres: fechasDesdeEntorno("EM_CIERRES_JUDICIALES", entorno.EM_CIERRES_JUDICIALES), habilitados: fechasDesdeEntorno("EM_DIAS_HABILITADOS", entorno.EM_DIAS_HABILITADOS) },
    umbrales: UMBRALES_POR_DEFECTO,
    smmlvAjustes: ajustesSmmlvDesdeEntorno(entorno.SMMLV_AJUSTES ?? ""),
    maxIteraciones: { g_citas: Number(entorno.EM_MAX_ITER_CITAS ?? 2), revision: Number(entorno.EM_MAX_ITER_REVISION ?? 6) },
    concurrencia: Number(entorno.EM_CONCURRENCIA_PIPELINE ?? 4),
    dpiLectura: Number(entorno.EM_DPI_LECTURA ?? 150),
    maxPaginasPorArchivo: Number(entorno.EM_MAX_PAGINAS_ARCHIVO ?? 2000),
    paginarInforme: entorno.EM_PAGINAR_INFORME ? entorno.EM_PAGINAR_INFORME === "1" : undefined,
    demostracion: entorno.EM_DEMOSTRACION === "1",
    ...extra,
  };
}

