import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ErrorDominio } from "@em/dominio";

/* ────────────────────────────────────────────────────────────────────────────
 * Cifrado en reposo (Ley 1581 de 2012, art. 17 lit. d; secreto profesional,
 * art. 74 C.P.). AES-256-GCM con:
 *  - una clave por propósito derivada con HKDF-SHA256 de la clave maestra;
 *  - identificador de clave (kid) en cada texto cifrado, para rotar claves sin
 *    perder la lectura de lo cifrado con las anteriores;
 *  - datos asociados (AAD) que atan cada texto cifrado a su registro: un blob o
 *    un expediente copiado sobre otro no descifra.
 *
 * Formato: "EM1" | largo(kid) | kid | iv (12) | etiqueta (16) | texto cifrado.
 * ──────────────────────────────────────────────────────────────────────────── */

const MAGIA = Buffer.from("EM1", "latin1");
const SAL = Buffer.from("expediente-maleable/cifrado-en-reposo", "utf8");

export type Proposito = "blob" | "expediente" | "bitacora" | "memoria" | "termino" | "titulo" | "secreto";

export interface ClaveMaestra {
  kid: string;
  material: Buffer;
}

export class Cifrador {
  private readonly derivadas = new Map<string, Buffer>();
  private readonly porKid: Map<string, Buffer>;

  constructor(private readonly actual: ClaveMaestra, anteriores: ClaveMaestra[] = []) {
    for (const c of [actual, ...anteriores]) {
      if (c.material.length !== 32) throw new ErrorDominio("CLAVE_INVALIDA", `La clave ${c.kid} debe tener 32 bytes (AES-256).`);
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(c.kid)) throw new ErrorDominio("CLAVE_INVALIDA", `Identificador de clave inválido: ${c.kid}`);
    }
    this.porKid = new Map([actual, ...anteriores].map((c) => [c.kid, c.material]));
  }

  get kidActual(): string {
    return this.actual.kid;
  }

  private clave(kid: string, proposito: Proposito): Buffer {
    const k = `${kid}:${proposito}`;
    let d = this.derivadas.get(k);
    if (!d) {
      const maestra = this.porKid.get(kid);
      if (!maestra) throw new ErrorDominio("CLAVE_DESCONOCIDA", `No se dispone de la clave «${kid}» para descifrar: configúrela en EM_CLAVES_ANTERIORES.`);
      d = Buffer.from(hkdfSync("sha256", maestra, SAL, `em:v1:${proposito}`, 32));
      this.derivadas.set(k, d);
    }
    return d;
  }

  cifrar(datos: Buffer | Uint8Array | string, proposito: Proposito, aad: string): Buffer {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.clave(this.actual.kid, proposito), iv);
    c.setAAD(Buffer.from(`${proposito}|${aad}`, "utf8"));
    const cuerpo = Buffer.concat([c.update(typeof datos === "string" ? Buffer.from(datos, "utf8") : datos), c.final()]);
    const kid = Buffer.from(this.actual.kid, "latin1");
    return Buffer.concat([MAGIA, Buffer.from([kid.length]), kid, iv, c.getAuthTag(), cuerpo]);
  }

  descifrar(cifrado: Buffer | Uint8Array, proposito: Proposito, aad: string): Buffer {
    const b = Buffer.isBuffer(cifrado) ? cifrado : Buffer.from(cifrado);
    if (b.length < 3 + 1 + 1 + 12 + 16 || !b.subarray(0, 3).equals(MAGIA)) throw new ErrorDominio("CIFRADO_INVALIDO", "El dato no tiene el formato de cifrado del sistema.");
    const largo = b[3]!;
    const kid = b.subarray(4, 4 + largo).toString("latin1");
    const iv = b.subarray(4 + largo, 16 + largo);
    const etiqueta = b.subarray(16 + largo, 32 + largo);
    const d = createDecipheriv("aes-256-gcm", this.clave(kid, proposito), iv);
    d.setAAD(Buffer.from(`${proposito}|${aad}`, "utf8"));
    d.setAuthTag(etiqueta);
    try {
      return Buffer.concat([d.update(b.subarray(32 + largo)), d.final()]);
    } catch {
      throw new ErrorDominio("INTEGRIDAD", `El dato cifrado (${proposito}) no supera la verificación de integridad: fue alterado o no corresponde a este registro.`);
    }
  }

  cifrarTexto(t: string, proposito: Proposito, aad: string): Buffer {
    return this.cifrar(t, proposito, aad);
  }

  descifrarTexto(b: Buffer | Uint8Array, proposito: Proposito, aad: string): string {
    return this.descifrar(b, proposito, aad).toString("utf8");
  }

  /**
   * Huella con clave (HMAC-SHA256): vincula registros sin guardar el dato en
   * claro (p. ej. el expediente de origen de una lección de la memoria).
   */
  huellaPrivada(texto: string, proposito: Proposito): string {
    return createHmac("sha256", this.clave(this.actual.kid, proposito)).update(texto, "utf8").digest("hex");
  }

  /** La misma huella bajo todas las claves conocidas (búsquedas que deben sobrevivir a una rotación). */
  huellasPrivadas(texto: string, proposito: Proposito): string[] {
    return [...this.porKid.keys()].map((kid) => createHmac("sha256", this.clave(kid, proposito)).update(texto, "utf8").digest("hex"));
  }

  /** Kid con que fue cifrado un dato (para saber si debe recifrarse tras una rotación). */
  static kidDe(cifrado: Buffer | Uint8Array): string | null {
    const b = Buffer.from(cifrado);
    if (b.length < 5 || !b.subarray(0, 3).equals(MAGIA)) return null;
    return b.subarray(4, 4 + b[3]!).toString("latin1");
  }
}

/** Decodifica una clave de 32 bytes en base64 (estándar o URL) o hexadecimal. */
export function decodificarClave(texto: string): Buffer {
  const t = texto.trim();
  const b = /^[0-9a-fA-F]{64}$/.test(t) ? Buffer.from(t, "hex") : Buffer.from(t.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (b.length !== 32) throw new ErrorDominio("CLAVE_INVALIDA", "La clave maestra debe codificar exactamente 32 bytes (base64 o hexadecimal).");
  return b;
}

export function claveAleatoria(): string {
  return randomBytes(32).toString("base64");
}

export interface OrigenClaves {
  cifrador: Cifrador;
  origen: "ENTORNO" | "ARCHIVO_DESARROLLO";
  advertencia: string | null;
}

/**
 * Claves desde el entorno: EM_CLAVE_MAESTRA (obligatoria en producción),
 * EM_CLAVE_ID (kid, por defecto "k1") y EM_CLAVES_ANTERIORES ("kid:clave,…").
 * Fuera de producción, sin clave configurada, se genera una clave local de
 * desarrollo (archivo 0600) y se advierte: nunca protege datos reales.
 */
export function cifradorDesdeEntorno(entorno: NodeJS.ProcessEnv = process.env, archivoDesarrollo?: string): OrigenClaves {
  const anteriores = (entorno.EM_CLAVES_ANTERIORES ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((par) => {
    const i = par.indexOf(":");
    if (i <= 0) throw new ErrorDominio("CLAVE_INVALIDA", "EM_CLAVES_ANTERIORES debe tener la forma kid:clave,kid:clave.");
    return { kid: par.slice(0, i), material: decodificarClave(par.slice(i + 1)) };
  });
  const kid = entorno.EM_CLAVE_ID?.trim() || "k1";
  if (entorno.EM_CLAVE_MAESTRA) {
    return { cifrador: new Cifrador({ kid, material: decodificarClave(entorno.EM_CLAVE_MAESTRA) }, anteriores), origen: "ENTORNO", advertencia: null };
  }
  if (entorno.NODE_ENV === "production") throw new ErrorDominio("SIN_CLAVE", "EM_CLAVE_MAESTRA es obligatoria en producción (cifrado en reposo de expedientes y documentos).");
  if (!archivoDesarrollo) throw new ErrorDominio("SIN_CLAVE", "Configure EM_CLAVE_MAESTRA.");
  if (!existsSync(archivoDesarrollo)) {
    mkdirSync(dirname(archivoDesarrollo), { recursive: true });
    writeFileSync(archivoDesarrollo, claveAleatoria(), { mode: 0o600 });
  }
  chmodSync(archivoDesarrollo, 0o600);
  return {
    cifrador: new Cifrador({ kid: "dev", material: decodificarClave(readFileSync(archivoDesarrollo, "utf8")) }, anteriores),
    origen: "ARCHIVO_DESARROLLO",
    advertencia: `Sin EM_CLAVE_MAESTRA: se usa la clave local de desarrollo ${archivoDesarrollo}. No cargue expedientes reales en este modo.`,
  };
}
