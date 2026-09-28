/* Resiliencia frente a fuentes que no controlamos: tiempo máximo, reintentos
 * con retroceso exponencial, cortacircuitos y límite de concurrencia. */

export class Semaforo {
  private activos = 0;
  private cola: Array<() => void> = [];
  constructor(private readonly maximo: number) {}

  async ejecutar<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activos >= this.maximo) await new Promise<void>((r) => this.cola.push(r));
    this.activos += 1;
    try {
      return await fn();
    } finally {
      this.activos -= 1;
      this.cola.shift()?.();
    }
  }
}

export type EstadoCircuito = "CERRADO" | "ABIERTO" | "SEMIABIERTO";

export class Cortacircuitos {
  private fallosConsecutivos = 0;
  private abiertoHasta = 0;
  private estadoActual: EstadoCircuito = "CERRADO";

  constructor(private readonly umbral = 5, private readonly enfriamientoMs = 60_000, private readonly ahora: () => number = Date.now) {}

  get estado(): EstadoCircuito {
    if (this.estadoActual === "ABIERTO" && this.ahora() >= this.abiertoHasta) this.estadoActual = "SEMIABIERTO";
    return this.estadoActual;
  }

  permite(): boolean {
    return this.estado !== "ABIERTO";
  }

  exito(): void {
    this.fallosConsecutivos = 0;
    this.estadoActual = "CERRADO";
  }

  fallo(): void {
    this.fallosConsecutivos += 1;
    if (this.estadoActual === "SEMIABIERTO" || this.fallosConsecutivos >= this.umbral) {
      this.estadoActual = "ABIERTO";
      this.abiertoHasta = this.ahora() + this.enfriamientoMs;
    }
  }
}

export async function conReintentos<T>(fn: (intento: number) => Promise<T>, opciones: { intentos: number; baseMs: number; esReintentable: (e: unknown) => boolean; esperar?: (ms: number) => Promise<void> }): Promise<T> {
  const esperar = opciones.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let ultimo: unknown;
  for (let intento = 0; intento <= opciones.intentos; intento++) {
    try {
      return await fn(intento);
    } catch (e) {
      ultimo = e;
      if (intento === opciones.intentos || !opciones.esReintentable(e)) throw e;
      await esperar(opciones.baseMs * 2 ** intento + Math.floor(Math.random() * opciones.baseMs));
    }
  }
  throw ultimo;
}

export async function conTiempoMaximo<T>(p: Promise<T>, ms: number, mensaje: string): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error(mensaje)), ms);
  });
  try {
    return await Promise.race([p, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

/** Caché con vencimiento y límite de tamaño (LRU simple). */
export class CacheTTL<V> {
  private mapa = new Map<string, { valor: V; vence: number }>();
  constructor(private readonly maximo = 2000, private readonly ahora: () => number = Date.now) {}

  get(clave: string): V | undefined {
    const e = this.mapa.get(clave);
    if (!e) return undefined;
    if (e.vence < this.ahora()) {
      this.mapa.delete(clave);
      return undefined;
    }
    this.mapa.delete(clave);
    this.mapa.set(clave, e);
    return e.valor;
  }

  set(clave: string, valor: V, ttlSegundos: number): void {
    if (this.mapa.size >= this.maximo) this.mapa.delete(this.mapa.keys().next().value!);
    this.mapa.set(clave, { valor, vence: this.ahora() + ttlSegundos * 1000 });
  }

  get tamano(): number {
    return this.mapa.size;
  }
}
