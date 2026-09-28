import { randomBytes, scrypt as scryptCb, type ScryptOptions, timingSafeEqual } from "node:crypto";

/* Contraseñas con scrypt (parámetros OWASP: N=2^15, r=8, p=3) y comparación en
 * tiempo constante. El formato guarda los parámetros, de modo que endurecerlos
 * más adelante no invalida las contraseñas existentes. */

const scrypt = (clave: string, sal: Buffer, largo: number, o: ScryptOptions) =>
  new Promise<Buffer>((ok, error) => scryptCb(clave, sal, largo, o, (e, d) => (e ? error(e) : ok(d))));

export interface ParametrosScrypt {
  N: number;
  r: number;
  p: number;
}

export const PARAMETROS_POR_DEFECTO: ParametrosScrypt = { N: 2 ** 15, r: 8, p: 3 };

const memoria = (x: ParametrosScrypt) => 128 * x.N * x.r * 2;

export async function hashClave(clave: string, parametros: ParametrosScrypt = PARAMETROS_POR_DEFECTO): Promise<string> {
  const sal = randomBytes(16);
  const d = await scrypt(clave.normalize("NFKC"), sal, 32, { ...parametros, maxmem: memoria(parametros) });
  return `scrypt$${parametros.N}$${parametros.r}$${parametros.p}$${sal.toString("base64")}$${d.toString("base64")}`;
}

export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [N, r, p] = partes.slice(1, 4).map(Number) as [number, number, number];
  const sal = Buffer.from(partes[4]!, "base64");
  const esperado = Buffer.from(partes[5]!, "base64");
  const d = await scrypt(clave.normalize("NFKC"), sal, esperado.length, { N, r, p, maxmem: memoria({ N, r, p }) });
  return d.length === esperado.length && timingSafeEqual(d, esperado);
}

/** Política mínima: 12 caracteres, con letras y números o símbolos. */
export function evaluarClave(clave: string): string | null {
  if (clave.length < 12) return "La contraseña debe tener al menos 12 caracteres.";
  if (!/\p{L}/u.test(clave) || !/[\p{N}\p{P}\p{S}]/u.test(clave)) return "La contraseña debe combinar letras con números o símbolos.";
  return null;
}
