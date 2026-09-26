import { generarInforme } from "@em/docgen";
import type { BloqueContexto } from "@em/ia";
import type { ContextoNodo, ManejadorNodo } from "../contexto";
import { MetadatosInforme, SeccionRedactada } from "../esquemas";
import { tarea } from "../ia";
import { type ClaveSeccion, componerInforme, type RedaccionInforme } from "../informe";
import { bloques, vistaAnalisis, vistaCaso, vistaCorrecciones, vistaDocumentos, vistaEstadoProcesal, vistaEstrategia, vistaFuentes, vistaHechos, vistaPartes, vistaProblemas, vistaTerminos } from "../vistas";
import { aviso, completado, enParalelo, reiniciarAvisos } from "./comun";
import { MIME_DOCX, registrarEntregable } from "./entregables";

/* Fase 6 · redacción del informe técnico y generación de entregables. */

const REGLAS = `Reglas de redacción del informe técnico:
- Prosa jurídica sobria para un informe que se justifica en el documento final; sin títulos de sección (el sistema los agrega) y sin numerar subsecciones (el sistema numera 1.1, 1.2…).
- Cada párrafo es una lista de "segmentos". Cuando un segmento contiene una afirmación sustentada en una fuente verificada, asígnale su fuenteId: la nota al pie se ubica exactamente al final de ese segmento. Un párrafo que se apoya en hechos lista sus hechoIds.
- Solo invoca FUENTES VERIFICADAS y nómbralas en el texto por su denominación oficial. Si algo carece de fuente verificada, dilo como vacío.
- "citas": fragmentos copiados LITERALMENTE del texto de una fuente verificada (se cotejan y, si no coinciden, se descartan), con una descripción breve del encabezado o asunto asociado y el índice del párrafo tras el cual van (desde 0).
- Sin raya larga como inciso, sin promesas de resultado, sin expresiones indeterminadas; fechas en letras ("25 de septiembre de 2026").`;

const NARRATIVAS: Array<{ clave: ClaveSeccion; instruccion: string; contexto: (c: ContextoNodo) => BloqueContexto[] }> = [
  {
    clave: "antecedentes",
    instruccion: "Redacta la sección «I. ANTECEDENTES Y OBJETO DEL INFORME»: quién consulta y en qué calidad, qué pretende, qué se recibió (en síntesis), el estado procesal conocido y el objeto y alcance del informe (lo que hace y lo que no hace). Tres a cinco párrafos, sin subsecciones ni citas.",
    contexto: (c) => bloques(vistaCaso(c.exp), vistaPartes(c.exp), vistaDocumentos(c.exp), vistaEstadoProcesal(c.exp)),
  },
  {
    clave: "normativo",
    instruccion: "Redacta la sección «VI. MARCO NORMATIVO APLICABLE»: una subsección por problema jurídico (título breve del problema). Expón las disposiciones verificadas que lo gobiernan, su vigencia (si una norma está derogada o su vigencia no está verificada, dilo expresamente) y cómo se articulan los cuerpos normativos. Incluye citas textuales de las disposiciones centrales. Un párrafo introductorio sin subsección.",
    contexto: (c) => bloques(vistaProblemas(c.exp), vistaFuentes({ ...c.exp, fuentes: c.exp.fuentes.filter((f) => f.clase !== "PROVIDENCIA") }, { conTexto: true, maxPorFuente: 4000 }), { titulo: "CUERPOS NORMATIVOS", texto: JSON.stringify(c.exp.cuerposNormativos) }, vistaAnalisis(c.exp)),
  },
  {
    clave: "precedente",
    instruccion: "Redacta la sección «VII. PRECEDENTE JUDICIAL Y FUERZA VINCULANTE»: por problema, las providencias verificadas, su ratio decidendi, su fuerza vinculante y la analogía con el caso; cuando la analogía sea baja, redacta la distinción. Declara expresamente los vacíos de precedente. Incluye citas textuales de la ratio cuando consten en el texto verificado.",
    contexto: (c) => bloques(vistaProblemas(c.exp), vistaHechos(c.exp), vistaFuentes({ ...c.exp, fuentes: c.exp.fuentes.filter((f) => f.clase === "PROVIDENCIA") }, { conTexto: true, maxPorFuente: 5000 })),
  },
  {
    clave: "analisis",
    instruccion: "Redacta la sección «VIII. ANÁLISIS DE HECHO Y DE DERECHO»: una subsección por problema. Desarrolla el silogismo de subsunción del ANÁLISIS: la regla con sus fuentes, los hechos con sus hechoIds y la conclusión, expresando en el texto su grado de confianza (probado, inferido, discutible), el eslabón más débil y las figuras que no deben confundirse. Un párrafo introductorio sin subsección.",
    contexto: (c) => bloques(vistaProblemas(c.exp), vistaHechos(c.exp), vistaFuentes(c.exp, { conTexto: true, maxPorFuente: 1500 }), vistaAnalisis(c.exp), vistaCorrecciones(c.exp)),
  },
  {
    clave: "estrategia",
    instruccion: "Redacta la sección «XI. MECANISMOS ALTERNATIVOS Y ESTRATEGIA»: en tres a cinco párrafos, la recomendación sobre los mecanismos alternativos, la vía principal y por qué se descartaron las demás, los requisitos previos, la ruta temporal frente a los términos y los deberes de notificación. No repitas tablas (el sistema las agrega) ni uses subsecciones.",
    contexto: (c) => bloques(vistaCaso(c.exp), vistaAnalisis(c.exp), vistaEstrategia(c.exp), vistaTerminos(c.exp)),
  },
];

const INSTRUCCION_METADATOS = `Con base en el caso, el análisis y las secciones redactadas, redacta los elementos de apertura y cierre del informe técnico:
- "titulo": mayúsculas y minúsculas, sin nombres de personas naturales, máximo dieciséis palabras.
- "subtitulo": una línea que precise el alcance.
- "resumen": entre 150 y 220 palabras (problema, método, hallazgos y conclusión).
- "palabrasClave": cinco a siete.
- "introduccion": dos o tres párrafos, sin numeración, que presenten el propósito y la ruta del informe.
- "conclusiones": una por párrafo, iniciando "Primera:", "Segunda:"…, con fuenteId y hechoIds cuando correspondan, sin afirmar nada que no esté en el análisis.
${REGLAS}`;

/** Renderiza el informe desde la redacción guardada (determinista: no vuelve a llamar a la IA). */
export async function renderizarInforme(ctx: ContextoNodo, modo: "BORRADOR" | "FINAL" | "DICTAMEN", motivoDictamen: string[] = []) {
  const redaccion = ctx.exp.borradores.informeRedaccion as RedaccionInforme | undefined;
  if (!redaccion) throw new Error("No hay redacción del informe para renderizar.");
  const { documento, afirmaciones, retiradas } = componerInforme(ctx.exp, redaccion, { modo, hoy: ctx.hoy(), config: ctx.s.config, cabezaTrazabilidad: ctx.exp.afirmaciones.at(-1)?.huella ?? null, motivoDictamen });
  const r = await generarInforme(documento, { paginar: ctx.s.config.paginarInforme });
  const tipo = modo === "DICTAMEN" ? "DICTAMEN_REMISION" : "INFORME_TECNICO";
  const modoEntregable = modo === "FINAL" ? "RADICABLE" : "BORRADOR";
  const version = ctx.exp.entregables.filter((e) => e.tipo === tipo && e.modo === modoEntregable).length + 1;
  const nombre = `${modo === "DICTAMEN" ? "DICTAMEN_NO_RADICACION" : "INFORME_TECNICO"}_${modo === "FINAL" ? "FINAL" : "BORRADOR"}_v${version}.docx`;
  const entregable = await registrarEntregable(ctx, { tipo, modo: modoEntregable, contenido: r.docx, nombreArchivo: nombre, mime: MIME_DOCX, paginas: r.paginas });
  ctx.exp.borradores.afirmacionesInforme = afirmaciones;
  for (const w of r.advertencias) aviso(ctx, w, "BAJA");
  for (const x of retiradas) aviso(ctx, `Se retiró del informe una cita no verificada (${x}).`, "ALTA");
  return { entregable, paginas: r.paginas, notas: r.notasAlPie, tablas: r.tablas, indice: r.indice };
}

export const f6: ManejadorNodo = async (ctx) => {
  reiniciarAvisos(ctx);
  const narrativas: RedaccionInforme["narrativas"] = {};
  await enParalelo(NARRATIVAS, 3, async (s) => {
    narrativas[s.clave] = await tarea(ctx, { tarea: "redaccion_informe", esquema: SeccionRedactada, nombreEsquema: "SeccionRedactada", instruccion: `${s.instruccion}\n\n${REGLAS}`, contexto: s.contexto(ctx) });
  });
  const resumenSecciones = Object.entries(narrativas).map(([k, v]) => `[${k}] ${(v?.parrafos ?? []).map((p) => p.segmentos.map((x) => x.texto).join("")).join(" ").slice(0, 1200)}`).join("\n");
  const metadatos = await tarea(ctx, {
    tarea: "redaccion_informe", esquema: MetadatosInforme, nombreEsquema: "MetadatosInforme", instruccion: INSTRUCCION_METADATOS,
    contexto: bloques(vistaCaso(ctx.exp), vistaProblemas(ctx.exp), vistaFuentes(ctx.exp), vistaAnalisis(ctx.exp), vistaEstrategia(ctx.exp), { titulo: "SECCIONES REDACTADAS (extracto)", texto: resumenSecciones }),
  });
  ctx.exp.borradores.informeRedaccion = { narrativas, metadatos } satisfies RedaccionInforme;
  const r = await renderizarInforme(ctx, "BORRADOR");
  return completado(`Informe técnico (borrador v${r.entregable.version}): ${r.paginas ?? "?"} página(s), ${r.notas} nota(s) al pie, ${r.tablas} tabla(s) y tabla de contenido${r.indice.every((e) => e.pagina) ? " con página real de cada entrada" : ""}.`);
};
