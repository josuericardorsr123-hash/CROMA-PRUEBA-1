import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ErrorDominio } from "@em/dominio";
import type { Cifrador } from "./cifrado";

/* Almacén de blobs (documentos originales, PDF canónicos, piezas divididas,
 * resultados de consultas oficiales y entregables). Todo blob se cifra con
 * AES-256-GCM atado a su identificador y a su tenant; la huella SHA-256 del
 * contenido en claro se verifica al leer. */

export interface MetaBlob {
  tenantId: string;
  mime?: string;
  nombre?: string;
}

export interface BlobGuardado {
  blobId: string;
  sha256: string;
  bytes: number;
}

export interface AlmacenBlobs {
  guardar(datos: Buffer | Uint8Array, meta: MetaBlob): Promise<BlobGuardado>;
  leer(blobId: string, tenantId: string): Promise<Buffer>;
  existe(blobId: string, tenantId: string): Promise<boolean>;
  eliminar(blobId: string, tenantId: string): Promise<void>;
}

const RE_ID = /^blob_[0-9a-f]{32}$/;
const RE_TENANT = /^[A-Za-z0-9_-]{1,64}$/;

function validar(blobId: string, tenantId: string): void {
  if (!RE_ID.test(blobId)) throw new ErrorDominio("BLOB_ID_INVALIDO", `Identificador de blob inválido: ${blobId}`);
  if (!RE_TENANT.test(tenantId)) throw new ErrorDominio("TENANT_INVALIDO", `Tenant inválido: ${tenantId}`);
}

/** Cabecera en claro mínima (sin datos personales): huella y tamaño para verificar la lectura. */
function empaquetar(cifrador: Cifrador, blobId: string, datos: Buffer | Uint8Array, meta: MetaBlob): { contenido: Buffer; sha256: string } {
  const sha256 = createHash("sha256").update(datos).digest("hex");
  const cabecera = Buffer.from(JSON.stringify({ v: 1, sha256, bytes: datos.length, mime: meta.mime ?? null }), "utf8");
  const cifrado = cifrador.cifrar(Buffer.concat([Buffer.from([cabecera.length >> 8, cabecera.length & 0xff]), cabecera, datos]), "blob", `${meta.tenantId}/${blobId}`);
  return { contenido: cifrado, sha256 };
}

function desempaquetar(cifrador: Cifrador, blobId: string, tenantId: string, contenido: Buffer): Buffer {
  const claro = cifrador.descifrar(contenido, "blob", `${tenantId}/${blobId}`);
  const largo = (claro[0]! << 8) | claro[1]!;
  const cabecera = JSON.parse(claro.subarray(2, 2 + largo).toString("utf8")) as { sha256: string; bytes: number };
  const datos = claro.subarray(2 + largo);
  if (datos.length !== cabecera.bytes || createHash("sha256").update(datos).digest("hex") !== cabecera.sha256) {
    throw new ErrorDominio("INTEGRIDAD", `El blob ${blobId} no coincide con su huella registrada.`);
  }
  return datos;
}

export const nuevoBlobId = () => `blob_${randomUUID().replace(/-/g, "")}`;

/** Blobs en disco: un archivo cifrado por blob, en subdirectorios por tenant y prefijo. Escritura atómica. */
export class BlobsEnDisco implements AlmacenBlobs {
  constructor(private readonly dir: string, private readonly cifrador: Cifrador) {}

  private ruta(blobId: string, tenantId: string): string {
    validar(blobId, tenantId);
    return join(this.dir, tenantId, blobId.slice(5, 7), `${blobId}.emb`);
  }

  async guardar(datos: Buffer | Uint8Array, meta: MetaBlob): Promise<BlobGuardado> {
    const blobId = nuevoBlobId();
    const ruta = this.ruta(blobId, meta.tenantId);
    const { contenido, sha256 } = empaquetar(this.cifrador, blobId, datos, meta);
    await mkdir(join(ruta, ".."), { recursive: true, mode: 0o700 });
    const temporal = `${ruta}.${process.pid}.tmp`;
    await writeFile(temporal, contenido, { mode: 0o600 });
    await rename(temporal, ruta);
    return { blobId, sha256, bytes: datos.length };
  }

  async leer(blobId: string, tenantId: string): Promise<Buffer> {
    let contenido: Buffer;
    try {
      contenido = await readFile(this.ruta(blobId, tenantId));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new ErrorDominio("BLOB_INEXISTENTE", `No existe el blob ${blobId}.`);
      throw e;
    }
    return desempaquetar(this.cifrador, blobId, tenantId, contenido);
  }

  async existe(blobId: string, tenantId: string): Promise<boolean> {
    try {
      await stat(this.ruta(blobId, tenantId));
      return true;
    } catch {
      return false;
    }
  }

  async eliminar(blobId: string, tenantId: string): Promise<void> {
    await rm(this.ruta(blobId, tenantId), { force: true });
  }
}

/** Blobs en memoria (pruebas y demostración); cifra igual que el almacén en disco. */
export class BlobsEnMemoria implements AlmacenBlobs {
  private readonly datos = new Map<string, Buffer>();

  constructor(private readonly cifrador: Cifrador) {}

  get tamano(): number {
    return this.datos.size;
  }

  /** Acceso al texto cifrado (solo pruebas: comprobar que nada queda en claro). */
  crudo(blobId: string, tenantId: string): Buffer | undefined {
    return this.datos.get(`${tenantId}/${blobId}`);
  }

  async guardar(datos: Buffer | Uint8Array, meta: MetaBlob): Promise<BlobGuardado> {
    const blobId = nuevoBlobId();
    validar(blobId, meta.tenantId);
    const { contenido, sha256 } = empaquetar(this.cifrador, blobId, datos, meta);
    this.datos.set(`${meta.tenantId}/${blobId}`, contenido);
    return { blobId, sha256, bytes: datos.length };
  }

  async leer(blobId: string, tenantId: string): Promise<Buffer> {
    validar(blobId, tenantId);
    const c = this.datos.get(`${tenantId}/${blobId}`);
    if (!c) throw new ErrorDominio("BLOB_INEXISTENTE", `No existe el blob ${blobId}.`);
    return desempaquetar(this.cifrador, blobId, tenantId, c);
  }

  async existe(blobId: string, tenantId: string): Promise<boolean> {
    return this.datos.has(`${tenantId}/${blobId}`);
  }

  async eliminar(blobId: string, tenantId: string): Promise<void> {
    this.datos.delete(`${tenantId}/${blobId}`);
  }
}
