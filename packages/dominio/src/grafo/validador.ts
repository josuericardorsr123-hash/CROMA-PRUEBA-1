import { CAPA_POR_GRUPO, type Arista, type DefinicionGrafo, GRAFO } from "./definicion";

export interface Verificacion {
  id: string;
  descripcion: string;
  conforme: boolean;
  detalle: string;
  hallazgos: string[];
}

export interface ReporteValidacion {
  conforme: boolean;
  nodos: number;
  aristas: number;
  compuertas: number;
  recursos: number;
  verificaciones: Verificacion[];
}

/** Aristas que describen el recorrido (todo menos las dependencias declaradas). */
function aristasDeRecorrido(g: DefinicionGrafo): Arista[] {
  return g.aristas.filter((a) => a.tipo !== "dependencia");
}

/** Aristas que el orquestador ejecuta hacia adelante (sin bucles de retorno ni remisiones informativas). */
export function aristasHaciaAdelante(g: DefinicionGrafo): Arista[] {
  return g.aristas.filter((a) => (a.tipo === "flujo" || a.tipo === "datos" || a.tipo === "error") && !a.retorno);
}

function alcanzables(desde: string[], aristas: Arista[], inverso = false): Set<string> {
  const visto = new Set<string>(desde);
  const pila = [...desde];
  while (pila.length) {
    const actual = pila.pop()!;
    for (const a of aristas) {
      const [o, d] = inverso ? [a.d, a.o] : [a.o, a.d];
      if (o === actual && !visto.has(d)) {
        visto.add(d);
        pila.push(d);
      }
    }
  }
  return visto;
}

function luminancia(hex: string): number {
  const c = hex.replace("#", "");
  const canal = (i: number) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Detecta ciclos en un conjunto de aristas (DFS con colores). Devuelve un ciclo de ejemplo si existe. */
function buscarCiclo(nodos: string[], aristas: Arista[]): string[] | null {
  const color = new Map<string, 0 | 1 | 2>(nodos.map((n) => [n, 0]));
  const padre = new Map<string, string>();
  const salida = new Map<string, string[]>();
  for (const a of aristas) salida.set(a.o, [...(salida.get(a.o) ?? []), a.d]);
  let ciclo: string[] | null = null;
  const dfs = (u: string): boolean => {
    color.set(u, 1);
    for (const v of salida.get(u) ?? []) {
      if (color.get(v) === 1) {
        const camino = [v];
        let x = u;
        while (x !== v && x !== undefined) {
          camino.push(x);
          x = padre.get(x)!;
        }
        ciclo = camino.reverse();
        return true;
      }
      if (color.get(v) === 0) {
        padre.set(v, u);
        if (dfs(v)) return true;
      }
    }
    color.set(u, 2);
    return false;
  };
  for (const n of nodos) if (color.get(n) === 0 && dfs(n)) break;
  return ciclo;
}

/**
 * Motor de completitud estructural. Las nueve verificaciones de la arquitectura
 * más cuatro propias de un grafo ejecutable. Se ejecuta en CI: si falla, no se
 * despliega.
 */
export function validarGrafo(g: DefinicionGrafo = GRAFO): ReporteValidacion {
  const ids = new Set(g.nodos.map((n) => n.id));
  const recorrido = aristasDeRecorrido(g);
  const verificaciones: Verificacion[] = [];
  const agregar = (id: string, descripcion: string, hallazgos: string[], detalleOk = "Ninguno") =>
    verificaciones.push({ id, descripcion, conforme: hallazgos.length === 0, detalle: hallazgos.length ? `${hallazgos.length} hallazgo(s)` : detalleOk, hallazgos });

  // 1. Alcanzabilidad desde el inicio
  const desdeInicio = alcanzables([g.inicio], recorrido);
  agregar("alcanzable", "Todo nodo alcanzable desde el inicio", g.nodos.filter((n) => !desdeInicio.has(n.id)).map((n) => n.id));

  // 2. Todo nodo conduce a un terminal
  const haciaTerminal = alcanzables(g.terminales, recorrido, true);
  agregar("terminal", "Todo nodo conduce a un terminal", g.nodos.filter((n) => !haciaTerminal.has(n.id)).map((n) => n.id));

  // 3. Decisiones con dos ramas etiquetadas
  const malDecididas: string[] = [];
  for (const n of g.nodos.filter((x) => x.tipo === "decision")) {
    const salidas = recorrido.filter((a) => a.o === n.id);
    const si = salidas.filter((a) => a.rama === "si" && a.etiqueta);
    const no = salidas.filter((a) => a.rama === "no" && a.etiqueta);
    if (si.length !== 1 || no.length !== 1 || !n.decision) malDecididas.push(n.id);
  }
  agregar("ramas", "Toda decisión con dos ramas etiquetadas (sí / no)", malDecididas);

  // 4. Aristas colgantes
  agregar("colgantes", "Cero aristas colgantes", g.aristas.filter((a) => !ids.has(a.o) || !ids.has(a.d)).map((a) => `${a.o}→${a.d}`));

  // 5. Nodos aislados
  agregar("aislados", "Cero nodos aislados", g.nodos.filter((n) => !g.aristas.some((a) => a.o === n.id || a.d === n.id)).map((n) => n.id));

  // 6 y 7. Recursos
  const recursos = new Set(g.recursos.map((r) => r.id));
  const usados = new Set(g.nodos.flatMap((n) => n.recursos));
  agregar("recursos_existen", "Todo recurso referenciado existe en el registro", [...usados].filter((r) => !recursos.has(r)));
  agregar("recursos_usados", "Ningún recurso declarado queda sin uso", [...recursos].filter((r) => !usados.has(r)));

  // 8. Regla de dependencia entre capas (de la capa exterior hacia la interior)
  const deps = g.aristas.filter((a) => a.tipo === "dependencia");
  const capa = (id: string) => CAPA_POR_GRUPO[g.nodos.find((n) => n.id === id)?.grupo ?? "nucleo"];
  agregar("capas", "Regla de dependencia entre capas respetada", deps.filter((a) => capa(a.o) < capa(a.d)).map((a) => `${a.o}(${capa(a.o)})→${a.d}(${capa(a.d)})`), `Verificada sobre ${deps.length} aristas de dependencia`);

  // 9. Ciclos: el grafo se declara no acíclico; todo ciclo debe pasar por un retorno declarado
  const adelante = aristasHaciaAdelante(g);
  const ciclo = buscarCiclo(g.nodos.map((n) => n.id), adelante);
  const retornos = g.aristas.filter((a) => a.retorno);
  agregar("ciclos", "Ciclos solo a través de bucles declarados", ciclo ? [`Ciclo no declarado: ${ciclo.join(" → ")}`] : [], g.aciclico ? "Grafo acíclico" : `No acíclico por diseño: ${retornos.length} bucles intencionales declarados`);

  // 10. Rutas de excepción representadas
  const errores = g.aristas.filter((a) => a.tipo === "error");
  agregar("excepciones", "Rutas de excepción representadas (no solo el camino feliz)", errores.length >= 3 ? [] : ["Menos de tres rutas de excepción"], `${errores.length} rutas de excepción modeladas`);

  // 11. Contraste de texto sobre color por categoría (WCAG AA ≥ 4.5)
  const categorias = [...new Set(g.nodos.map((n) => n.tipo))];
  const bajas = categorias.filter((c) => contraste(g.paleta[c].fondo, g.paleta[c].texto) < 4.5).map((c) => `${c}: ${contraste(g.paleta[c].fondo, g.paleta[c].texto).toFixed(2)}`);
  agregar("contraste", "Contraste de texto sobre color, por categoría", bajas, `${categorias.length} de ${categorias.length} categorías cumplen`);

  // 12. Ejecutabilidad: solo las compuertas bifurcan
  const ramasIndebidas = recorrido.filter((a) => a.rama && g.nodos.find((n) => n.id === a.o)?.tipo !== "decision").map((a) => `${a.o}→${a.d}`);
  const decisionesSinRama = recorrido.filter((a) => g.nodos.find((n) => n.id === a.o)?.tipo === "decision" && (a.tipo === "flujo" || a.tipo === "error") && !a.rama).map((a) => `${a.o}→${a.d}`);
  agregar("bifurcacion", "Solo las compuertas bifurcan y toda salida de compuerta declara su rama", [...ramasIndebidas, ...decisionesSinRama]);

  // 13. Los terminales no tienen salida
  agregar("terminales_cerrados", "Los terminales no tienen salidas", recorrido.filter((a) => g.terminales.includes(a.o)).map((a) => `${a.o}→${a.d}`));

  // 14. Cada retorno apunta a un ancestro de su origen (es un bucle real)
  const retornosFalsos = retornos.filter((r) => !alcanzables([r.d], adelante).has(r.o)).map((r) => `${r.o}→${r.d}`);
  agregar("retornos", "Cada bucle declarado regresa a un ancestro de su origen", retornosFalsos, `${retornos.length} bucles verificados`);

  return {
    conforme: verificaciones.every((v) => v.conforme),
    nodos: g.nodos.length,
    aristas: g.aristas.length,
    compuertas: g.nodos.filter((n) => n.tipo === "decision").length,
    recursos: g.recursos.length,
    verificaciones,
  };
}
