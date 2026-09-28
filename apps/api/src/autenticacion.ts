import { randomBytes } from "node:crypto";
import type { Rol, Usuario } from "@em/almacen";
import type { FastifyReply, FastifyRequest } from "fastify";
import { errors as erroresJose, jwtVerify, SignJWT } from "jose";

/* Tokens JWT HS256 de vida corta. El token solo lleva identificadores y rol;
 * cada petición vuelve a comprobar que el usuario siga activo. */

export interface Sesion {
  usuarioId: string;
  tenantId: string;
  rol: Rol;
}

export interface Autenticador {
  emitir(u: Usuario): Promise<{ token: string; expira: string }>;
  verificar(token: string): Promise<Sesion | null>;
}

export function secretoDesdeEntorno(entorno: NodeJS.ProcessEnv): { secreto: Uint8Array; advertencia: string | null } {
  const s = entorno.EM_JWT_SECRETO;
  if (s) {
    if (s.length < 32) throw new Error("EM_JWT_SECRETO debe tener al menos 32 caracteres.");
    return { secreto: new TextEncoder().encode(s), advertencia: null };
  }
  if (entorno.NODE_ENV === "production") throw new Error("EM_JWT_SECRETO es obligatorio en producción.");
  return { secreto: randomBytes(32), advertencia: "EM_JWT_SECRETO no configurado: se usa un secreto efímero (las sesiones se pierden al reiniciar)." };
}

export function crearAutenticador(secreto: Uint8Array, duracionMin = 480): Autenticador {
  const emisor = "expediente-maleable";
  return {
    async emitir(u) {
      const expira = new Date(Date.now() + duracionMin * 60_000);
      const token = await new SignJWT({ tid: u.tenantId, rol: u.rol })
        .setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setIssuer(emisor).setIssuedAt().setExpirationTime(Math.floor(expira.getTime() / 1000)).sign(secreto);
      return { token, expira: expira.toISOString() };
    },
    async verificar(token) {
      try {
        const { payload } = await jwtVerify(token, secreto, { issuer: emisor, algorithms: ["HS256"] });
        if (typeof payload.sub !== "string" || typeof payload.tid !== "string" || typeof payload.rol !== "string") return null;
        return { usuarioId: payload.sub, tenantId: payload.tid, rol: payload.rol as Rol };
      } catch (e) {
        if (e instanceof erroresJose.JOSEError) return null;
        throw e;
      }
    },
  };
}

declare module "fastify" {
  interface FastifyRequest {
    sesion: Sesion | null;
  }
}

export class ErrorHttp extends Error {
  constructor(readonly estado: number, readonly codigo: string, mensaje: string) {
    super(mensaje);
  }
}

export function exigirSesion(req: FastifyRequest): Sesion {
  if (!req.sesion) throw new ErrorHttp(401, "NO_AUTENTICADO", "Se requiere autenticación.");
  return req.sesion;
}

export function exigirRol(req: FastifyRequest, ...roles: Rol[]): Sesion {
  const s = exigirSesion(req);
  if (!roles.includes(s.rol)) throw new ErrorHttp(403, "PROHIBIDO", `Acción reservada a: ${roles.join(", ")}.`);
  return s;
}

export function tokenDe(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7);
  // EventSource no admite cabeceras: el flujo SSE acepta el token por consulta.
  const q = (req.query as Record<string, unknown> | undefined)?.token;
  return typeof q === "string" && req.url.includes("/eventos") ? q : null;
}

export const noAutorizado = (r: FastifyReply) => r.code(401).send({ error: "NO_AUTENTICADO", mensaje: "Se requiere autenticación." });
