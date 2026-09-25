/** Mayúsculas sin tildes y con espacios colapsados: base de comparaciones robustas. */
export function normalizarTexto(t: string): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalización para comparar citas textuales: minúsculas, sin tildes, sin puntuación ni comillas. */
export function normalizarParaCotejo(t: string): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[«»"“”‘’'`´]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿El fragmento citado aparece literalmente en el texto fuente (tras normalizar)? */
export function contieneLiteral(fuente: string, fragmento: string): boolean {
  const f = normalizarParaCotejo(fuente);
  const c = normalizarParaCotejo(fragmento);
  return c.length > 0 && f.includes(c);
}

/** Proporción de palabras del fragmento presentes, en orden, en la fuente (tolerancia ante cortes). */
export function coberturaLiteral(fuente: string, fragmento: string): number {
  const f = normalizarParaCotejo(fuente);
  const palabras = normalizarParaCotejo(fragmento).split(" ").filter(Boolean);
  if (!palabras.length) return 0;
  let desde = 0;
  let halladas = 0;
  for (const p of palabras) {
    const i = f.indexOf(p, desde);
    if (i >= 0) {
      halladas += 1;
      desde = i + p.length;
    }
  }
  return halladas / palabras.length;
}

/** Tipología para nombres de archivo: MAYÚSCULAS_CON_GUIONES_BAJOS (sin tildes). */
export function tipologiaArchivo(t: string): string {
  return normalizarTexto(t).replace(/[.-]/g, " ").trim().replace(/\s+/g, "_").slice(0, 40) || "DOCUMENTO";
}

/** Contenido para nombres de archivo: Palabras_Capitalizadas (sin tildes ni símbolos). */
export function contenidoArchivo(t: string): string {
  const limpio = (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((w) => (w.length > 3 || /^[A-Z0-9]+$/.test(w) ? w[0]!.toUpperCase() + w.slice(1) : w.toLowerCase()))
    .join("_");
  return limpio.slice(0, 70) || "Sin_titulo";
}

/** Fecha AAAA-MM-DD → DD-MM-AAAA (convención de nombres del expediente). */
export function fechaArchivo(f: string | null): string {
  if (!f) return "sin-fecha";
  const [a, m, d] = f.split("-");
  return `${d}-${m}-${a}`;
}

/** NN_TIPOLOGÍA-Contenido_fecha.ext */
export function nombreDocumento(orden: number, tipologia: string, contenido: string, fecha: string | null, extension = "pdf"): string {
  return `${String(orden).padStart(2, "0")}_${tipologiaArchivo(tipologia)}-${contenidoArchivo(contenido)}_${fechaArchivo(fecha)}.${extension}`;
}

export function romano(n: number): string {
  const t: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let r = "";
  let x = n;
  for (const [v, s] of t) while (x >= v) { r += s; x -= v; }
  return r;
}
