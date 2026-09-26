/* Analizador mínimo de argumentos: posicionales, --opcion valor, --opcion=valor y banderas. */

export interface Argumentos {
  posicionales: string[];
  opciones: Record<string, string | true>;
}

export function analizar(argv: string[]): Argumentos {
  const posicionales: string[] = [];
  const opciones: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      posicionales.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const [clave, valor] = a.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
      if (valor !== undefined) opciones[clave] = valor;
      else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) opciones[clave] = argv[++i]!;
      else opciones[clave] = true;
    } else posicionales.push(a);
  }
  return { posicionales, opciones };
}

export function texto(a: Argumentos, clave: string, defecto?: string): string | undefined {
  const v = a.opciones[clave];
  return typeof v === "string" ? v : defecto;
}

export function bandera(a: Argumentos, clave: string): boolean {
  const v = a.opciones[clave];
  return v === true || v === "1" || v === "true" || v === "si";
}

export function requerido(a: Argumentos, clave: string): string {
  const v = texto(a, clave);
  if (!v) throw new ErrorUso(`Falta --${clave}`);
  return v;
}

export class ErrorUso extends Error {}
