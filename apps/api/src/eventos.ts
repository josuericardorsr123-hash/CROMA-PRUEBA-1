import { EventEmitter } from "node:events";
import type { EventoPipeline } from "@em/pipeline";

/* Bus en proceso para el flujo SSE. Con varias réplicas, cada una publica
 * los eventos de los trabajos que ejecuta; el cliente que se reconecta obtiene
 * el estado completo con GET /expedientes/:id (el flujo es solo progreso). */

export interface EventoExpediente extends Partial<Omit<EventoPipeline, "tipo">> {
  tipo: EventoPipeline["tipo"] | "ENCOLADO" | "INICIADO" | "TERMINADO" | "FALLIDO";
  expedienteId: string;
  tenantId: string;
  estado?: string;
  instante: string;
}

export class BusEventos {
  private readonly emisor = new EventEmitter().setMaxListeners(0);

  publicar(e: EventoExpediente): void {
    this.emisor.emit(`${e.tenantId}/${e.expedienteId}`, e);
  }

  suscribir(tenantId: string, expedienteId: string, fn: (e: EventoExpediente) => void): () => void {
    const canal = `${tenantId}/${expedienteId}`;
    this.emisor.on(canal, fn);
    return () => this.emisor.off(canal, fn);
  }
}
