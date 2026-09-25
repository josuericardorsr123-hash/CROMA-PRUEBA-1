import { type ClienteCroma, DOMINIOS_OFICIALES, esDominioOficial, normalizarBusqueda, type ProcedenciaCroma } from "@em/croma";
import { type CitaDetectada, CODIGOS, coberturaLiteral, extraerCitas, normalizarParaCotejo, urlCorteConstitucional } from "@em/motores";
import { htmlATexto, pareceHtml } from "./html";
import { obtenerOficial, type OpcionesHttpOficial } from "./http-oficial";
import type { RepositorioFuentes } from "./repositorio";

export type Resolucion = "TEXTO_OFICIAL" | "EXISTENCIA_CONFIRMADA" | "REPOSITORIO" | "APORTADA_POR_ABOGADO" | "NO_RESUELTA";
export type Vigencia = "VIGENTE" | "VIGENTE_CONDICIONADA" | "DEROGADA" | "INEXEQUIBLE" | "NO_VERIFICADA" | "NO_APLICA";

export interface ResolucionFuente {
  identificador: string;
  identificadorBase: string;
  clase: CitaDetectada["clase"];
  resolucion: Resolucion;
  vigencia: Vigencia;
  condicionamiento: string | null;
  url: string | null;
  titulo: string;
  autoridad: string;
  texto: string | null;
  fragmento: string | null;
  coincidenciaTextual: boolean | null;
  procedencias: ProcedenciaCroma[];
  notas: string[];
}

export interface OpcionesResolutor {
  croma: ClienteCroma;
  repositorio: RepositorioFuentes;
  http: OpcionesHttpOficial;
  finalidad?: string;
}

const AUTORIDAD: Record<CitaDetectada["clase"], string> = {
  PROVIDENCIA_CC: "Corte Constitucional", PROVIDENCIA_CSJ: "Corte Suprema de Justicia", PROVIDENCIA_CE: "Consejo de Estado",
  NORMA: "Congreso de la República / Gobierno Nacional", CODIGO: "Congreso de la República", CONCEPTO: "Autoridad administrativa",
};

/** ¿El texto contiene el identificador de la cita? (evita dar por verificada una página que no corresponde). */
export function textoCorrespondeACita(texto: string, c: CitaDetectada): boolean {
  const t = normalizarParaCotejo(texto);
  const d = c.detalle;
  switch (c.clase) {
    case "PROVIDENCIA_CC": {
      const tipo = String(d.tipo).toLowerCase();
      const n = Number(d.numero);
      const aa = String(d.anio).slice(2);
      return new RegExp(`\\b${tipo}\\s*${n}\\s*(?:${aa}|de\\s*${d.anio})\\b`).test(t) || new RegExp(`\\b${tipo}\\s*0*${n}\\s*${aa}\\b`).test(t);
    }
    case "PROVIDENCIA_CSJ":
      return t.replace(/\s/g, "").includes(c.identificador.toLowerCase().replace(/[-\s]/g, ""));
    case "PROVIDENCIA_CE":
      return t.replace(/\D/g, "").includes(c.identificador.replace(/\D/g, ""));
    case "NORMA":
    case "CODIGO":
      return c.articulo ? new RegExp(`\\bart(?:iculo)?\\s*${c.articulo.split(/\s|,/)[0]}(?:o|º)?\\b`).test(t) : t.includes(normalizarParaCotejo(c.identificadorBase).split(" de ")[0]!);
    case "CONCEPTO":
      return t.includes(normalizarParaCotejo(String(d.numero)));
  }
}

/** Extrae el bloque del artículo citado del texto de una ley o código. */
export function extraerArticulo(texto: string, articulo: string): string | null {
  const num = articulo.split(/\s|,/)[0]!;
  const re = new RegExp(`ART[IÍ]CULO\\s+${num}[oº°.]?(?![0-9])`, "i");
  const m = re.exec(texto);
  if (!m) return null;
  const resto = texto.slice(m.index + m[0].length);
  const siguiente = /\bART[IÍ]CULO\s+\d+/i.exec(resto);
  return texto.slice(m.index, m.index + m[0].length + (siguiente ? siguiente.index : Math.min(resto.length, 4000))).trim().slice(0, 6000);
}

/** Vigencia según las notas de la fuente oficial consultada; sin nota explícita no se afirma nada más de lo que la fuente dice. */
export function vigenciaDesdeTexto(fragmento: string, esCompilacionOficial: boolean): { vigencia: Vigencia; condicionamiento: string | null; nota: string } {
  const t = normalizarParaCotejo(fragmento);
  if (/\bderogad[oa]\b/.test(t) && !/\bno\s+derogad/.test(t)) return { vigencia: "DEROGADA", condicionamiento: null, nota: "La fuente oficial registra nota de derogatoria en el artículo." };
  if (/\bcondicionalmente exequible\b|\bexequible\b[^.]{0,200}\ben el entendido\b/.test(t)) {
    const m = /en el entendido[^.]{0,400}/i.exec(fragmento);
    return { vigencia: "VIGENTE_CONDICIONADA", condicionamiento: m ? m[0] : "Exequibilidad condicionada: transcribir el condicionamiento.", nota: "Exequibilidad condicionada según la fuente oficial." };
  }
  if (/\binexequible\b/.test(t) && !/\bexequible\b/.test(t.replace(/inexequible/g, ""))) return { vigencia: "INEXEQUIBLE", condicionamiento: null, nota: "La fuente oficial registra declaratoria de inexequibilidad." };
  if (esCompilacionOficial) return { vigencia: "VIGENTE", condicionamiento: null, nota: "Sin notas de derogatoria ni inexequibilidad en la compilación oficial a la fecha de consulta." };
  return { vigencia: "NO_VERIFICADA", condicionamiento: null, nota: "Texto obtenido sin notas de vigencia: la vigencia queda NO VERIFICADA." };
}

/**
 * Resolutor de fuentes (Módulos 1, 4 y 21). Orden de resolución:
 * repositorio fresco → Croma (capacidad específica) → extracción oficial vía
 * Croma → descarga oficial directa → búsqueda oficial (existencia) → NO_RESUELTA.
 * Nunca completa una cita con memoria del modelo.
 */
export class ResolutorFuentes {
  constructor(private readonly o: OpcionesResolutor) {}

  private get finalidad() {
    return this.o.finalidad ?? "Verificación de citas contra fuente primaria (Módulo 21).";
  }

  async obtenerTexto(url: string): Promise<{ texto: string | null; procedencias: ProcedenciaCroma[] }> {
    const procedencias: ProcedenciaCroma[] = [];
    if (await this.o.croma.disponible("web.extraer")) {
      const r = await this.o.croma.consultar("web.extraer", { url }, { finalidad: this.finalidad });
      procedencias.push(r.procedencia);
      if (r.estado === "OK") {
        const contenido = typeof r.datos === "object" && r.datos ? String((r.datos as Record<string, unknown>).content ?? (r.datos as Record<string, unknown>).text ?? (r.datos as Record<string, unknown>).markdown ?? r.texto) : r.texto;
        return { texto: pareceHtml(contenido) ? htmlATexto(contenido) : contenido, procedencias };
      }
    }
    const h = await obtenerOficial(url, this.finalidad, this.o.http);
    procedencias.push(h.procedencia);
    return { texto: h.estado === "OK" ? h.texto : null, procedencias };
  }

  async buscarOficial(consulta: string, dominios: string[] = DOMINIOS_OFICIALES.slice(0, 3)): Promise<{ resultados: Array<{ titulo: string; url: string; fragmento: string }>; procedencias: ProcedenciaCroma[] }> {
    if (!(await this.o.croma.disponible("web.busqueda"))) return { resultados: [], procedencias: [] };
    const r = await this.o.croma.consultar("web.busqueda", { consulta, dominios }, { finalidad: "Localizar providencias y normas en dominios oficiales (Módulo 1)." });
    const resultados = r.estado === "OK" ? normalizarBusqueda(r.datos, r.texto).filter((x) => esDominioOficial(x.url)) : [];
    return { resultados, procedencias: [r.procedencia] };
  }

  async resolver(c: CitaDetectada, opciones: { citaTextual?: string | null } = {}): Promise<ResolucionFuente> {
    const procedencias: ProcedenciaCroma[] = [];
    const notas: string[] = [];
    const salida = (parcial: Partial<ResolucionFuente>): ResolucionFuente => {
      const texto = parcial.texto ?? null;
      const fragmento = parcial.fragmento ?? null;
      let coincidenciaTextual: boolean | null = null;
      if (opciones.citaTextual && (fragmento || texto)) {
        coincidenciaTextual = coberturaLiteral(texto ?? fragmento ?? "", opciones.citaTextual) >= 0.92;
        if (!coincidenciaTextual) notas.push("El texto citado entre comillas no aparece literalmente en la fuente consultada.");
      } else if (opciones.citaTextual) notas.push("No se obtuvo el texto de la fuente: la cita textual no puede cotejarse.");
      return {
        identificador: c.identificador, identificadorBase: c.identificadorBase, clase: c.clase, resolucion: "NO_RESUELTA",
        vigencia: c.clase.startsWith("PROVIDENCIA") ? "NO_APLICA" : "NO_VERIFICADA", condicionamiento: null, url: c.url,
        titulo: c.identificador, autoridad: AUTORIDAD[c.clase], texto, fragmento, coincidenciaTextual, procedencias, notas, ...parcial,
      };
    };

    // 1. Repositorio local (fresco y verificado)
    const ficha = this.o.repositorio.porIdentificador(c.identificador) ?? (c.articulo ? null : this.o.repositorio.porIdentificador(c.identificadorBase));
    if (ficha && this.o.repositorio.esFresca(ficha)) {
      notas.push(`Ficha del repositorio ${ficha.estadoVerificacion}.`);
      const vig = c.clase.startsWith("PROVIDENCIA") ? { vigencia: "NO_APLICA" as Vigencia, condicionamiento: null } : vigenciaDesdeTexto(ficha.texto, false);
      return salida({ resolucion: "REPOSITORIO", url: ficha.url ?? c.url, titulo: ficha.titulo, autoridad: ficha.autoridad || AUTORIDAD[c.clase], texto: ficha.texto, fragmento: ficha.texto.slice(0, 1500), vigencia: vig.vigencia === "NO_VERIFICADA" ? "VIGENTE" : vig.vigencia, condicionamiento: vig.condicionamiento });
    }
    if (ficha) notas.push(`Ficha del repositorio no fresca (${ficha.estadoVerificacion}): se reverifica en la fuente oficial.`);

    // 2. Normas: capacidad específica de Croma (texto y vigencia)
    if ((c.clase === "NORMA" || c.clase === "CODIGO") && (await this.o.croma.disponible("normas.texto"))) {
      const r = await this.o.croma.consultar("normas.texto", { norma: c.identificadorBase, articulo: c.articulo ?? undefined }, { finalidad: "Verificar texto vigente de una norma citada (Módulos 4 y 21)." });
      procedencias.push(r.procedencia);
      if (r.estado === "OK") {
        const d = (r.datos ?? {}) as Record<string, unknown>;
        const texto = String(d.texto ?? d.text ?? d.content ?? r.texto);
        const declarada = String(d.vigencia ?? d.status ?? "").toUpperCase();
        const vig = /DEROG/.test(declarada) ? { vigencia: "DEROGADA" as Vigencia, condicionamiento: null, nota: "Croma reporta la norma derogada." }
          : /CONDICION/.test(declarada) ? { vigencia: "VIGENTE_CONDICIONADA" as Vigencia, condicionamiento: String(d.condicionamiento ?? "Transcribir condicionamiento."), nota: "Croma reporta exequibilidad condicionada." }
          : /INEXEQ/.test(declarada) ? { vigencia: "INEXEQUIBLE" as Vigencia, condicionamiento: null, nota: "Croma reporta inexequibilidad." }
          : /VIGENTE/.test(declarada) ? { vigencia: "VIGENTE" as Vigencia, condicionamiento: null, nota: "Croma reporta la norma vigente." }
          : vigenciaDesdeTexto(texto, false);
        notas.push(vig.nota);
        return salida({ resolucion: "TEXTO_OFICIAL", url: (d.url as string) ?? c.url, texto, fragmento: c.articulo ? extraerArticulo(texto, c.articulo) ?? texto.slice(0, 3000) : texto.slice(0, 3000), vigencia: vig.vigencia, condicionamiento: vig.condicionamiento });
      }
    }

    // 3. URL oficial conocida (patrón verificado): extracción vía Croma o descarga directa
    const url = c.url ?? (c.clase === "PROVIDENCIA_CC" ? urlCorteConstitucional(String(c.detalle.tipo), Number(c.detalle.numero), Number(c.detalle.anio)) : null);
    if (url) {
      const { texto, procedencias: ps } = await this.obtenerTexto(url);
      procedencias.push(...ps);
      if (texto && textoCorrespondeACita(texto, c)) {
        if (c.clase === "NORMA" || c.clase === "CODIGO") {
          const fragmento = c.articulo ? extraerArticulo(texto, c.articulo) : texto.slice(0, 3000);
          if (c.articulo && !fragmento) {
            notas.push(`La fuente oficial no contiene el artículo ${c.articulo}.`);
            return salida({ resolucion: "NO_RESUELTA", url, texto });
          }
          const vig = vigenciaDesdeTexto(fragmento ?? "", url.includes("secretariasenado.gov.co/senado/basedoc"));
          notas.push(vig.nota);
          return salida({ resolucion: "TEXTO_OFICIAL", url, texto, fragmento, vigencia: vig.vigencia, condicionamiento: vig.condicionamiento });
        }
        return salida({ resolucion: "TEXTO_OFICIAL", url, texto, fragmento: texto.slice(0, 4000), vigencia: "NO_APLICA" });
      }
      if (texto) notas.push("La página obtenida no corresponde al identificador citado.");
    }

    // 4. Búsqueda en dominios oficiales (confirma existencia; si hay URL, intenta el texto)
    const sitio = c.clase === "PROVIDENCIA_CSJ" ? ["cortesuprema.gov.co"] : c.clase === "PROVIDENCIA_CE" ? ["consejodeestado.gov.co", "ramajudicial.gov.co"] : c.clase === "PROVIDENCIA_CC" ? ["corteconstitucional.gov.co"] : c.clase === "CONCEPTO" ? ["dian.gov.co", "sic.gov.co", "superfinanciera.gov.co", "funcionpublica.gov.co"] : ["secretariasenado.gov.co", "suin-juriscol.gov.co", "funcionpublica.gov.co"];
    const { resultados, procedencias: psb } = await this.buscarOficial(`"${c.identificador}"`, sitio);
    procedencias.push(...psb);
    const coincidente = resultados.find((r) => extraerCitas(`${r.titulo} ${r.fragmento} ${r.url}`).some((x) => x.identificadorBase === c.identificadorBase) || textoCorrespondeACita(`${r.titulo} ${r.fragmento}`, c));
    if (coincidente) {
      const { texto, procedencias: ps2 } = await this.obtenerTexto(coincidente.url);
      procedencias.push(...ps2);
      if (texto && textoCorrespondeACita(texto, c)) {
        const fragmento = c.articulo ? extraerArticulo(texto, c.articulo) ?? texto.slice(0, 3000) : texto.slice(0, 4000);
        const vig = c.clase.startsWith("PROVIDENCIA") ? { vigencia: "NO_APLICA" as Vigencia, condicionamiento: null, nota: "" } : vigenciaDesdeTexto(fragmento, coincidente.url.includes("secretariasenado.gov.co/senado/basedoc"));
        if (vig.nota) notas.push(vig.nota);
        return salida({ resolucion: "TEXTO_OFICIAL", url: coincidente.url, titulo: coincidente.titulo || c.identificador, texto, fragmento, vigencia: vig.vigencia, condicionamiento: vig.condicionamiento });
      }
      notas.push("Existencia confirmada en un dominio oficial; texto completo no obtenido.");
      return salida({ resolucion: "EXISTENCIA_CONFIRMADA", url: coincidente.url, titulo: coincidente.titulo || c.identificador, fragmento: coincidente.fragmento || null });
    }

    notas.push("No se pudo resolver contra ninguna fuente oficial disponible: la cita no puede entrar al documento final.");
    return salida({ resolucion: "NO_RESUELTA" });
  }

  /** Texto o enlace aportado por el ABOGADO (USUARIO): queda como APORTADA_POR_ABOGADO y su responsabilidad. */
  aportada(c: CitaDetectada, texto: string, url: string | null, usuarioId: string): ResolucionFuente {
    return {
      identificador: c.identificador, identificadorBase: c.identificadorBase, clase: c.clase, resolucion: "APORTADA_POR_ABOGADO",
      vigencia: c.clase.startsWith("PROVIDENCIA") ? "NO_APLICA" : "NO_VERIFICADA", condicionamiento: null, url, titulo: c.identificador,
      autoridad: AUTORIDAD[c.clase], texto, fragmento: texto.slice(0, 4000), coincidenciaTextual: null, procedencias: [],
      notas: [`Fuente aportada por el ABOGADO (USUARIO) ${usuarioId}.`],
    };
  }
}

export function urlDeCodigo(clave: keyof typeof CODIGOS): string {
  return CODIGOS[clave]!.url;
}
