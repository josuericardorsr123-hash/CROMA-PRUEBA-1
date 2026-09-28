import { readFileSync } from "node:fs";
import { claveIdentificador, normalizarParaCotejo } from "@em/motores";

/* Repositorio normativo y jurisprudencial local (Módulo 1, paso 0): fichas con
 * fuente, fecha de verificación y vinculancia, recuperadas por BM25. Una ficha
 * vieja se ve igual que una fresca: la frescura se controla por fecha y, vencida,
 * obliga a reverificar en la fuente oficial. */

export interface FichaRepositorio {
  id: string;
  tipo: "NORMA" | "PROVIDENCIA" | "CONCEPTO" | "REGULACION" | "OTRO";
  identificador: string;
  titulo: string;
  autoridad: string;
  url: string | null;
  texto: string;
  estadoVerificacion: string;
  fechaVerificacion: string | null;
  vinculancia: string | null;
  origen: string;
}

const PARADAS = new Set("de la el en y a los las del se que por un una con para al lo como su sus o es no sin sobre entre este esta estos estas ser son fue han ha le les".split(" "));

function tokens(t: string): string[] {
  return normalizarParaCotejo(t).split(" ").filter((w) => w.length > 2 && !PARADAS.has(w));
}

export interface ResultadoBusqueda {
  ficha: FichaRepositorio;
  puntaje: number;
  fresca: boolean;
  fragmento: string;
}

export class RepositorioFuentes {
  private fichas: FichaRepositorio[] = [];
  private indice: Array<{ tf: Map<string, number>; largo: number }> = [];
  private df = new Map<string, number>();
  private largoMedio = 0;

  constructor(fichas: FichaRepositorio[] = [], private readonly frescuraDias = 180) {
    for (const f of fichas) this.agregar(f);
  }

  get tamano(): number {
    return this.fichas.length;
  }

  todas(): FichaRepositorio[] {
    return [...this.fichas];
  }

  agregar(f: FichaRepositorio): void {
    const existente = this.fichas.findIndex((x) => claveIdentificador(x.identificador) === claveIdentificador(f.identificador) && x.tipo === f.tipo);
    if (existente >= 0) this.fichas.splice(existente, 1), this.indice.splice(existente, 1);
    const tk = tokens(`${f.identificador} ${f.titulo} ${f.texto}`);
    const tf = new Map<string, number>();
    for (const t of tk) tf.set(t, (tf.get(t) ?? 0) + 1);
    this.fichas.push(f);
    this.indice.push({ tf, largo: tk.length });
    this.recalcular();
  }

  private recalcular(): void {
    this.df = new Map();
    for (const { tf } of this.indice) for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.largoMedio = this.indice.reduce((s, d) => s + d.largo, 0) / Math.max(1, this.indice.length);
  }

  esFresca(f: FichaRepositorio, hoy = new Date()): boolean {
    if (!f.fechaVerificacion || !/^VERIFICADA|^CONTRASTADA/.test(f.estadoVerificacion)) return false;
    const dias = (hoy.getTime() - new Date(`${f.fechaVerificacion}T00:00:00Z`).getTime()) / 86_400_000;
    return dias <= this.frescuraDias;
  }

  porIdentificador(identificador: string): FichaRepositorio | null {
    const k = claveIdentificador(identificador);
    return this.fichas.find((f) => claveIdentificador(f.identificador) === k) ?? null;
  }

  /** BM25 (k1 = 1,2; b = 0,75). */
  buscar(consulta: string, limite = 8, filtro?: (f: FichaRepositorio) => boolean): ResultadoBusqueda[] {
    const q = tokens(consulta);
    const n = this.fichas.length;
    const puntajes: Array<{ i: number; s: number }> = [];
    this.indice.forEach((d, i) => {
      if (filtro && !filtro(this.fichas[i]!)) return;
      let s = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (n - (this.df.get(t) ?? 0) + 0.5) / ((this.df.get(t) ?? 0) + 0.5));
        s += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.largo / (this.largoMedio || 1)))));
      }
      if (s > 0) puntajes.push({ i, s });
    });
    return puntajes.sort((a, b) => b.s - a.s).slice(0, limite).map(({ i, s }) => {
      const ficha = this.fichas[i]!;
      return { ficha, puntaje: Number(s.toFixed(3)), fresca: this.esFresca(ficha), fragmento: fragmentoRelevante(ficha.texto, q) };
    });
  }

  exportarJsonl(): string {
    return this.fichas.map((f) => JSON.stringify(f)).join("\n");
  }
}

function fragmentoRelevante(texto: string, q: string[], largo = 360): string {
  const bajo = normalizarParaCotejo(texto);
  const pos = q.map((t) => bajo.indexOf(t)).filter((p) => p >= 0).sort((a, b) => a - b)[0] ?? 0;
  const inicio = Math.max(0, pos - 80);
  return texto.slice(inicio, inicio + largo).replace(/\s+/g, " ").trim();
}

/** Importa el formato JSONL de la base de conocimiento del despacho (skill litigante): fichas normativas, jurisprudenciales y de regulación. */
export function importarSemilla(ruta: string, opciones: { incluirReferencias?: boolean } = {}): FichaRepositorio[] {
  const lineas = readFileSync(ruta, "utf8").split("\n").filter((l) => l.trim());
  const salida: FichaRepositorio[] = [];
  for (const l of lineas) {
    const r = JSON.parse(l) as Record<string, string>;
    const tipoOrigen = r.tipo ?? "";
    if (tipoOrigen === "referencia_skill" && !opciones.incluirReferencias) continue;
    const tipo: FichaRepositorio["tipo"] = tipoOrigen === "ficha_normativa" ? "NORMA" : tipoOrigen === "ficha_jurisprudencial" ? "PROVIDENCIA" : tipoOrigen === "regulacion" ? "REGULACION" : "OTRO";
    const estado = r.estado_verificacion ?? "PENDIENTE";
    const fecha = /(\d{4}-\d{2}-\d{2})/.exec(estado)?.[1] ?? r.fecha_consulta ?? null;
    salida.push({
      id: `sem_${salida.length + 1}`,
      tipo,
      identificador: r.identificador || r.titulo || "",
      titulo: r.titulo ?? "",
      autoridad: r.autoridad ?? "",
      url: r.url || null,
      texto: r.texto ?? "",
      estadoVerificacion: estado,
      fechaVerificacion: fecha,
      vinculancia: r.vinculancia || null,
      origen: `semilla:${r.origen ?? "skill"}`,
    });
  }
  return salida;
}

export function cargarJsonl(ruta: string): FichaRepositorio[] {
  return readFileSync(ruta, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as FichaRepositorio);
}
