import type { Expediente } from "@em/dominio";

/* Cliente de la API. El token vive solo en memoria de la pestaña y en
 * sessionStorage (se pierde al cerrarla); nunca en localStorage. */

export type Rol = "ABOGADO" | "ADMINISTRADOR" | "AUDITOR";
export interface Usuario { id: string; tenantId: string; correo: string; nombre: string; rol: Rol; tarjetaProfesional: string | null; activo: boolean }
export interface Perfil { identificacion: string | null; tarjetaProfesional: string | null; correoRegistroNacional: string | null; telefono: string | null; direccion: string | null; ciudad: string | null }
export interface Resumen { id: string; titulo: string; estado: string; version: number; creado: string; actualizado: string }
export interface TerminoIndexado { expedienteId: string; vencimientoMasTemprano: string | null; diasHabilesRestantes: number | null; esEstimacion: boolean; descripcion: string; estado?: string }
export interface Trabajo { id: string; estado: string; intentos: number; error: string | null; creado: string; actualizado: string }
export interface EntradaBitacora { seq: number; instante: string; actor: string; accion: string; objeto: string | null }
export type { Expediente };

const CLAVE = "em.sesion";

export class ErrorApi extends Error {
  constructor(readonly estado: number, readonly codigo: string, mensaje: string) {
    super(mensaje);
  }
}

let sesion: { token: string; usuario: Usuario } | null = (() => {
  try {
    const s = sessionStorage.getItem(CLAVE);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
})();

export const sesionActual = () => sesion;

export function cerrarSesion(): void {
  sesion = null;
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento de sesión */
  }
}

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const cabeceras: Record<string, string> = {};
  if (sesion) cabeceras.authorization = `Bearer ${sesion.token}`;
  let body: BodyInit | undefined;
  if (cuerpo instanceof FormData) body = cuerpo;
  else if (cuerpo !== undefined) {
    cabeceras["content-type"] = "application/json";
    body = JSON.stringify(cuerpo);
  }
  const r = await fetch(`/api/v1${ruta}`, { method: metodo, headers: cabeceras, body });
  if (r.status === 401 && sesion) {
    cerrarSesion();
    location.reload();
  }
  const tipo = r.headers.get("content-type") ?? "";
  const datos = tipo.includes("json") ? await r.json() : await r.blob();
  if (!r.ok) throw new ErrorApi(r.status, (datos as { error?: string }).error ?? "ERROR", (datos as { mensaje?: string }).mensaje ?? `Error ${r.status}`);
  return datos as T;
}

export const api = {
  async ingresar(tenant: string, correo: string, clave: string) {
    const r = await pedir<{ token: string; usuario: Usuario }>("POST", "/auth/ingresar", { tenant, correo, clave });
    sesion = r;
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(r));
    } catch {
      /* sin almacenamiento de sesión: la sesión dura lo que la pestaña */
    }
    return r.usuario;
  },
  salud: () => pedir<{ ia: boolean; croma: { configurado: boolean; conectado: boolean }; advertencias: string[]; motor: string }>("GET", "/salud"),
  yo: () => pedir<{ usuario: Usuario; perfil: Perfil | null }>("GET", "/yo"),
  guardarPerfil: (p: Perfil) => pedir("PUT", "/yo/perfil", p),
  expedientes: () => pedir<Resumen[]>("GET", "/expedientes"),
  crear: (titulo: string, contexto: unknown) => pedir<{ id: string }>("POST", "/expedientes", { titulo, contexto }),
  expediente: (id: string) => pedir<Expediente>("GET", `/expedientes/${id}`),
  cargar: (id: string, archivos: File[]) => {
    const f = new FormData();
    for (const a of archivos) f.append("archivos", a, (a as File & { webkitRelativePath?: string }).webkitRelativePath || a.name);
    return pedir<{ cargados: number }>("POST", `/expedientes/${id}/archivos`, f);
  },
  ejecutar: (id: string) => pedir("POST", `/expedientes/${id}/ejecutar`),
  cancelar: (id: string) => pedir("POST", `/expedientes/${id}/cancelar`),
  instruir: (id: string, accion: string, motivo: string, datos?: unknown) => pedir("POST", `/expedientes/${id}/instrucciones`, { accion, motivo, datos }),
  trabajos: (id: string) => pedir<Trabajo[]>("GET", `/expedientes/${id}/trabajos`),
  bitacora: (id: string) => pedir<EntradaBitacora[]>("GET", `/expedientes/${id}/bitacora`),
  terminos: (dias: number) => pedir<TerminoIndexado[]>("GET", `/terminos?dias=${dias}`),
  async descargar(id: string, entregableId: string, nombre: string) {
    const b = await pedir<Blob>("GET", `/expedientes/${id}/entregables/${entregableId}`);
    const url = URL.createObjectURL(b);
    const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
  eventos(id: string, alEvento: (tipo: string, datos: unknown) => void): () => void {
    if (!sesion) return () => undefined;
    const fuente = new EventSource(`/api/v1/expedientes/${id}/eventos?token=${encodeURIComponent(sesion.token)}`);
    fuente.addEventListener("estado", (e) => alEvento("estado", JSON.parse((e as MessageEvent).data)));
    fuente.addEventListener("pipeline", (e) => alEvento("pipeline", JSON.parse((e as MessageEvent).data)));
    return () => fuente.close();
  },
};
