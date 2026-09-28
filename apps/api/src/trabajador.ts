import { hostname } from "node:os";
import type { Almacen, Trabajo } from "@em/almacen";
import type { Registro } from "@em/croma";
import { type Compartidos, ejecutarPipeline, serviciosDeTenant } from "@em/pipeline";
import type { BusEventos } from "./eventos";

/* Trabajador de fondo: arrienda trabajos PIPELINE de la cola SQL, ejecuta el
 * grafo con punto de control por nodo y renueva el arriendo mientras corre.
 * Un proceso caído deja vencer su arriendo y otro trabajador reanuda desde el
 * último nodo guardado. La cancelación llega por AbortSignal. */

export const TIPO_PIPELINE = "PIPELINE";

export interface OpcionesTrabajador {
  almacen: Almacen;
  compartidos: Compartidos;
  bus: BusEventos;
  registro: Registro;
  concurrencia?: number;
  arriendoMs?: number;
  sondeoMs?: number;
}

export class Trabajador {
  readonly id = `${hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
  private activos = new Map<string, AbortController>();
  private detenido = false;
  private temporizador: NodeJS.Timeout | null = null;
  private readonly o: Required<OpcionesTrabajador>;

  constructor(o: OpcionesTrabajador) {
    this.o = { concurrencia: 2, arriendoMs: 5 * 60_000, sondeoMs: 1000, ...o };
  }

  iniciar(): void {
    this.detenido = false;
    const ciclo = async () => {
      if (this.detenido) return;
      try {
        while (this.activos.size < this.o.concurrencia) {
          const t = await this.o.almacen.repo.tomarTrabajo(this.id, this.o.arriendoMs, [TIPO_PIPELINE]);
          if (!t) break;
          void this.procesar(t);
        }
      } catch (e) {
        this.o.registro.error("trabajador.sondeo", { error: String(e) });
      }
      this.temporizador = setTimeout(ciclo, this.o.sondeoMs);
    };
    void ciclo();
  }

  /** Despierta el sondeo sin esperar el intervalo (tras encolar). */
  despertar(): void {
    if (this.detenido || !this.temporizador) return;
    clearTimeout(this.temporizador);
    this.temporizador = null;
    this.iniciar();
  }

  cancelar(expedienteId: string): boolean {
    const c = this.activos.get(expedienteId);
    c?.abort();
    return Boolean(c);
  }

  enCurso(expedienteId: string): boolean {
    return this.activos.has(expedienteId);
  }

  async detener(): Promise<void> {
    this.detenido = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    for (const c of this.activos.values()) c.abort();
    const limite = Date.now() + 10_000;
    while (this.activos.size && Date.now() < limite) await new Promise((ok) => setTimeout(ok, 50));
  }

  private async procesar(t: Trabajo): Promise<void> {
    const { repo } = this.o.almacen;
    const expId = t.expedienteId;
    if (!expId) return repo.completarTrabajo(t.id, this.id, { omitido: "sin expediente" });
    const control = new AbortController();
    this.activos.set(expId, control);
    const renovar = setInterval(() => void repo.renovarArriendo(t.id, this.id, this.o.arriendoMs).catch(() => undefined), Math.max(1000, this.o.arriendoMs / 3));
    const publicar = (e: Parameters<BusEventos["publicar"]>[0]) => this.o.bus.publicar(e);
    try {
      const exp = await repo.obtenerExpediente(t.tenantId, expId);
      if (!exp) return await repo.completarTrabajo(t.id, this.id, { omitido: "expediente inexistente" });
      publicar({ tipo: "INICIADO", expedienteId: expId, tenantId: t.tenantId, instante: new Date().toISOString(), detalle: `Trabajo ${t.id} (intento ${t.intentos})` });
      const s = serviciosDeTenant(this.o.compartidos, this.o.almacen, t.tenantId);
      const r = await ejecutarPipeline(exp, s, {
        guardar: (e) => repo.guardarExpediente(e, "SISTEMA", "pipeline.punto_control", { trabajo: t.id }),
        alEvento: (e) => publicar({ ...e, expedienteId: expId, tenantId: t.tenantId }),
        senal: control.signal,
      });
      await repo.completarTrabajo(t.id, this.id, { estado: r.estado, pausa: r.pausa?.nodo ?? null, error: r.error, nodos: r.nodosEjecutados.length });
      publicar({ tipo: "TERMINADO", expedienteId: expId, tenantId: t.tenantId, estado: r.estado, instante: new Date().toISOString(), detalle: r.error ?? r.pausa?.motivo ?? r.exp.estado });
    } catch (e) {
      this.o.registro.error("trabajador.fallo", { trabajo: t.id, error: String(e) });
      await repo.fallarTrabajo(t.id, this.id, String((e as Error)?.message ?? e)).catch(() => undefined);
      publicar({ tipo: "FALLIDO", expedienteId: expId, tenantId: t.tenantId, instante: new Date().toISOString(), detalle: String((e as Error)?.message ?? e) });
    } finally {
      clearInterval(renovar);
      this.activos.delete(expId);
    }
  }
}
