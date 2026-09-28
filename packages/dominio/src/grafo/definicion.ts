/* ────────────────────────────────────────────────────────────────────────────
 * Grafo del sistema: fuente ÚNICA de verdad del pipeline.
 *
 * El mismo objeto se valida estructuralmente (validador.ts, ejecutado en CI) y
 * se ejecuta (paquete @em/pipeline). Por construcción, el flujo que corre no
 * puede divergir del flujo validado.
 *
 * Adaptación frente a la arquitectura del consultorio:
 *  - El sistema sirve a cualquier proceso del ordenamiento jurídico colombiano.
 *  - El ABOGADO (USUARIO) dirige el sistema, resuelve las compuertas humanas,
 *    audita cada salida, aprueba y firma. Sustituye al "asesor".
 *  - La compuerta de competencia del estudiante (Ley 2113 de 2021) se sustituye
 *    por la de habilitación profesional y procedencia (derecho de postulación,
 *    poder, conflicto de intereses, viabilidad).
 *  - Se añaden M30 (vigilancia judicial) y M31 (debida diligencia), alimentados
 *    por fuentes oficiales vía Croma.
 * ──────────────────────────────────────────────────────────────────────────── */

export type TipoNodo =
  | "entrada_salida"
  | "proceso"
  | "decision"
  | "datos_almacen"
  | "modelo_ia"
  | "servicio_externo"
  | "error_fallback"
  | "control_orquestacion"
  | "recurso_infra";

export type Grupo = "nucleo" | "A" | "B" | "C" | "D" | "E";
export type Capa = 0 | 1 | 2;
export type TipoArista = "flujo" | "datos" | "error" | "remision" | "dependencia";

export interface Nodo {
  id: string;
  etapa: string;
  nombre: string;
  tipo: TipoNodo;
  grupo: Grupo;
  recursos: string[];
  hace: string;
  sirve: string;
  importa: string;
  /** Solo compuertas: etiquetas de las dos ramas. */
  decision?: { si: string; no: string; humana: boolean };
  terminal?: boolean;
}

export interface Arista {
  o: string;
  d: string;
  tipo: TipoArista;
  etiqueta?: string;
  /** Rama de la compuerta de origen que activa esta arista. */
  rama?: "si" | "no";
  /** Bucle intencional declarado: reinicia el tramo desde el destino. */
  retorno?: boolean;
}

export interface Recurso {
  id: string;
  tipo: "servicio" | "dato" | "storage" | "modelo" | "libreria" | "humano";
  detalle: string;
  criticidad: "ALTA" | "MEDIA" | "BAJA";
  riesgo: string;
}

export interface Etapa {
  id: string;
  numero: number;
  nombre: string;
  subtitulo: string;
  descripcion: string;
}

export const CAPA_POR_GRUPO: Record<Grupo, Capa> = { nucleo: 0, A: 1, B: 1, C: 1, E: 1, D: 2 };

export const GRUPOS: Record<Grupo, string> = {
  nucleo: "Núcleo: pipeline de seis fases",
  A: "Capa A · Investigación y fuentes oficiales (derecho y hechos)",
  B: "Capa B · Análisis de Hecho y de Derecho",
  C: "Capa C · Estrategia y acción procesal",
  D: "Capa D · Gobernanza, calidad y ética",
  E: "Capa E · Infraestructura y aprendizaje continuo",
};

export const ETAPAS: Etapa[] = [
  { id: "e1", numero: 1, nombre: "Ingreso", subtitulo: "El expediente entra crudo", descripcion: "El caso llega como un conjunto de archivos sin nombrar: escaneos, fotografías, documentos electrónicos y comprimidos, en formatos mezclados y sin orden cronológico." },
  { id: "e2", numero: 2, nombre: "Preparación", subtitulo: "Fases 1 a 3 · lectura, hechos oficiales y orden", descripcion: "Se lee cada pieza, se extraen sus datos, se consultan las fuentes oficiales de hechos (Rama Judicial y registros públicos vía Croma), se renombra por tipología y se ordena en modo, tiempo y lugar." },
  { id: "e3", numero: 3, nombre: "Fundamento", subtitulo: "Fase 4 · Capa A + verificación", descripcion: "Se construye el fundamento de derecho con fuentes recuperadas y comprobadas. Ninguna cita avanza sin resolverse contra su fuente primaria." },
  { id: "e4", numero: 4, nombre: "Análisis", subtitulo: "Fase 5 · Capa B", descripcion: "Se califican los hechos y se detectan riesgos: precedente, términos, nulidades, derechos fundamentales, competencia, prueba y trampas procesales." },
  { id: "e5", numero: 5, nombre: "Estrategia", subtitulo: "Capa C · Fase 6", descripcion: "El análisis se convierte en actuación: vía, pieza siguiente, notificación, contradicción anticipada y entregables." },
  { id: "e6", numero: 6, nombre: "Gobernanza", subtitulo: "Capa D · control y cierre", descripcion: "Capa que no produce contenido y decide si lo producido puede salir: anexos, trazabilidad, etiquetas de confianza, sesgo y habilitación profesional." },
  { id: "e7", numero: 7, nombre: "Salida", subtitulo: "Dos finales, no hay un tercero", descripcion: "Sale como pieza aprobada y firmada por el ABOGADO (USUARIO), o como dictamen de no radicación o remisión con el trabajo hecho." },
];

export const RECURSOS: Recurso[] = [
  { id: "r_croma", tipo: "servicio", criticidad: "ALTA", detalle: "Croma (MCP, Streamable HTTP + Bearer): Rama Judicial, SAMAI, CNDJ, RUES, Registraduría, Procuraduría, Contraloría, Policía, Contaduría, SICAAC, Superfinanciera, Supersociedades, DIAN, SECOP, RUNT, SIMIT, búsqueda y extracción web.", riesgo: "Depende de la disponibilidad de portales oficiales y del plan contratado; toda ausencia se declara NO VERIFICADO, nunca se suple con memoria." },
  { id: "r_relatorias", tipo: "servicio", criticidad: "ALTA", detalle: "Relatorías de la Corte Constitucional, la Corte Suprema de Justicia y el Consejo de Estado (vía extracción Croma o HTTP oficial, con patrones de URL verificados).", riesgo: "Sin API pública documentada; los buscadores interactivos pueden no ser consultables de forma automatizada." },
  { id: "r_normograma", tipo: "dato", criticidad: "ALTA", detalle: "Compilaciones normativas oficiales (Secretaría del Senado, SUIN-Juriscol, Función Pública) y catálogo local de términos con fuente y estado de verificación.", riesgo: "Varios repositorios bloquean el acceso automatizado; la vigencia exige comprobación con fecha." },
  { id: "r_repositorio", tipo: "storage", criticidad: "MEDIA", detalle: "Repositorio normativo y jurisprudencial local con recuperación BM25, fecha de verificación y alerta de reverificación.", riesgo: "Una ficha vieja se ve igual que una fresca: la frescura se controla por fecha." },
  { id: "r_llm", tipo: "modelo", criticidad: "ALTA", detalle: "Claude (API de Anthropic) para lectura visual, clasificación, extracción, análisis y redacción asistida.", riesgo: "Riesgo de alucinación: obliga a verificación contra fuente primaria y a revisión del ABOGADO (USUARIO)." },
  { id: "r_ocr", tipo: "libreria", criticidad: "ALTA", detalle: "Lectura visual página por página (Claude visión) y Poppler (pdftoppm, pdftotext, pdfinfo).", riesgo: "Calidad variable en manuscritos y escaneos de baja resolución." },
  { id: "r_pdf", tipo: "libreria", criticidad: "MEDIA", detalle: "qpdf (división por tipología, detección y retiro de cifrado) y LibreOffice (conversión de ofimática a PDF).", riesgo: "Archivos cifrados con clave de apertura no se pueden leer sin la clave del titular." },
  { id: "r_calendario", tipo: "servicio", criticidad: "MEDIA", detalle: "Calendario judicial colombiano: festivos (Ley 51 de 1983), vacancia judicial y cierres extraordinarios configurables; alertas escalonadas.", riesgo: "Depende de fechas de actuación confiables y de registrar los cierres extraordinarios." },
  { id: "r_registro_trazas", tipo: "storage", criticidad: "ALTA", detalle: "Registro de trazabilidad hecho → prueba → norma → conclusión y bitácora de auditoría, encadenados por hash.", riesgo: "Debe ser inmutable y auditable por el ABOGADO (USUARIO)." },
  { id: "r_memoria", tipo: "storage", criticidad: "MEDIA", detalle: "Memoria institucional despersonalizada: patrones, rutas procesales y lecciones entre casos.", riesgo: "Exige disociación previa y revisión humana por secreto profesional (art. 74 C.P.)." },
  { id: "r_plantillas", tipo: "dato", criticidad: "ALTA", detalle: "Formato del informe técnico y plantillas de piezas procesales por tipo de actuación.", riesgo: "Las exigencias formales cambian por reforma legal o práctica del despacho." },
  { id: "r_abogado", tipo: "humano", criticidad: "ALTA", detalle: "ABOGADO (USUARIO): dirige el sistema, resuelve compuertas, audita, aprueba y firma.", riesgo: "Cuello de botella deliberado: no es automatizable." },
  { id: "r_anonimizador", tipo: "libreria", criticidad: "ALTA", detalle: "Disociación de datos personales y sensibles (reglas de dominio + confirmación humana).", riesgo: "Las herramientas genéricas fallan en dominio legal." },
  { id: "r_docgen", tipo: "libreria", criticidad: "MEDIA", detalle: "Generación DOCX, tabla de contenido paginada y foliación electrónica de anexos.", riesgo: "Debe respetar el índice electrónico del expediente." },
];

const N = (n: Nodo) => n;

export const NODOS: Nodo[] = [
  // ─── e1 · Ingreso
  N({ id: "n_exp", etapa: "e1", nombre: "Expediente recibido (archivos sin nombrar)", tipo: "entrada_salida", grupo: "nucleo", recursos: ["r_ocr"],
    hace: "Punto de entrada: la carpeta o el comprimido del caso tal como lo entrega el cliente o el despacho.",
    sirve: "Fija el estado real de partida: archivos sin nombrar, sin fecha legible y sin orden.",
    importa: "Todo el diseño existe porque este es el material de verdad, no un expediente ideal." }),

  // ─── e2 · Preparación
  N({ id: "f1", etapa: "e2", nombre: "Recepción", tipo: "proceso", grupo: "nucleo", recursos: ["r_pdf"],
    hace: "Registra cada archivo con su huella SHA-256, detecta duplicados exactos, archivos cifrados y formatos no soportados; expande comprimidos sin salir de la carpeta del caso.",
    sirve: "Nada se descarta sin rastro: el duplicado se marca, el original cifrado se conserva.",
    importa: "Un expediente mal recibido contamina todas las fases posteriores." }),
  N({ id: "f2", etapa: "e2", nombre: "Mapeo (lectura íntegra)", tipo: "proceso", grupo: "nucleo", recursos: ["r_llm", "r_ocr", "r_pdf"],
    hace: "Lee cada página: texto embebido cuando existe y lectura visual cuando es un escaneo; nunca se da un documento por ilegible sin intentarlo.",
    sirve: "Extrae tipología, fecha, actores, hechos, montos y radicados de cada página.",
    importa: "Es la base empírica de todo el análisis." }),
  N({ id: "m29", etapa: "e2", nombre: "M29 · Extracción a datos estructurados", tipo: "modelo_ia", grupo: "E", recursos: ["r_llm", "r_anonimizador"],
    hace: "Convierte el expediente en entidades consultables (personas, fechas, montos, bienes, radicados, cédulas, NIT, placas, matrículas, CUFE) con su fuente documental.",
    sirve: "Alimenta términos, cuantía, consultas oficiales y trazabilidad.",
    importa: "Las entidades críticas no sustentan cálculos definitivos sin confirmación humana." }),
  N({ id: "m30", etapa: "e2", nombre: "M30 · Vigilancia judicial (Rama Judicial vía Croma)", tipo: "servicio_externo", grupo: "A", recursos: ["r_croma"],
    hace: "Consulta cada radicado en las fuentes oficiales de procesos (Rama Judicial, SAMAI) y trae despacho, sujetos y actuaciones con su fecha.",
    sirve: "Acredita el estado procesal real y la fecha de la última actuación.",
    importa: "Sin fecha de última actuación confiable no hay reloj de desistimiento tácito." }),
  N({ id: "m31", etapa: "e2", nombre: "M31 · Debida diligencia de partes (vía Croma)", tipo: "servicio_externo", grupo: "A", recursos: ["r_croma"],
    hace: "Consulta, con finalidad declarada, registros públicos pertinentes: RUES, Registraduría, Procuraduría, Contraloría, Contaduría, SICAAC, RUNT, SIMIT, SECOP, DIAN.",
    sirve: "Verifica existencia, representación, inhabilidades, insolvencia, bienes y obligaciones de las partes.",
    importa: "Cada consulta queda registrada con su finalidad (Ley 1581 de 2012): nada se consulta por curiosidad." }),
  N({ id: "m26", etapa: "e2", nombre: "M26 · Memoria institucional", tipo: "datos_almacen", grupo: "E", recursos: ["r_memoria", "r_anonimizador"],
    hace: "Recupera patrones y lecciones despersonalizadas de casos anteriores aplicables al expediente.",
    sirve: "El caso siguiente se beneficia de los anteriores sin traer datos de personas.",
    importa: "Ningún módulo consulta la capa identificable de otro expediente." }),
  N({ id: "f3", etapa: "e2", nombre: "Renombrado, organización y hechos", tipo: "proceso", grupo: "nucleo", recursos: ["r_llm", "r_pdf"],
    hace: "Divide los PDF multi-documento por tipología, renombra NN_TIPOLOGÍA-Contenido_fecha, ordena en modo, tiempo y lugar y reconstruye los hechos con su soporte.",
    sirve: "Convierte una carpeta en un expediente legible con índice electrónico.",
    importa: "La puerta de entrada documental (poder, solicitud, relato) va siempre primero." }),
  N({ id: "m12", etapa: "e2", nombre: "M12 · Omisiones de fondo", tipo: "modelo_ia", grupo: "B", recursos: ["r_llm", "r_normograma"],
    hace: "Contrasta el expediente con lo que el tipo de asunto exige (piezas, pretensiones, pruebas, procedibilidad) y ordena los faltantes por gravedad.",
    sirve: "Distingue lo subsanable de lo que provoca rechazo.",
    importa: "Detectar un vacío aquí cuesta minutos; después, un auto inadmisorio." }),
  N({ id: "g_completo", etapa: "e2", nombre: "¿Expediente completo?", tipo: "decision", grupo: "nucleo", recursos: ["r_abogado"],
    decision: { si: "Sí: pasa a fundamento", no: "No: faltan piezas, vuelve a recepción", humana: false },
    hace: "Decide si hay material suficiente para un informe; si faltan piezas bloqueantes, pide su aporte o una decisión expresa del ABOGADO (USUARIO).",
    sirve: "Evita gastar trabajo en un informe que nacería incompleto.",
    importa: "Continuar con vacíos es posible solo si el ABOGADO (USUARIO) lo decide y queda registrado." }),

  // ─── e3 · Fundamento
  N({ id: "f4", etapa: "e3", nombre: "Informe técnico: fundamento", tipo: "proceso", grupo: "nucleo", recursos: ["r_llm", "r_plantillas"],
    hace: "Formula los problemas jurídicos y el plan de investigación; coordina la capa A y consolida el fundamento verificado.",
    sirve: "Es la base del informe y de la pieza.",
    importa: "El formato correcto puede disimular un contenido flojo: por eso la compuerta de citas." }),
  N({ id: "m01", etapa: "e3", nombre: "M01 · Jurisprudencia vinculante", tipo: "servicio_externo", grupo: "A", recursos: ["r_relatorias", "r_croma", "r_repositorio"],
    hace: "Recupera providencias por problema jurídico y resuelve cada cita por número contra la relatoría oficial, con dirección, fecha y huella del texto.",
    sirve: "El precedente pertinente entra por método y no por memoria.",
    importa: "Si la fuente no carga, devuelve una ausencia declarada, nunca una cita de memoria." }),
  N({ id: "m02", etapa: "e3", nombre: "M02 · Fuerza vinculante", tipo: "servicio_externo", grupo: "A", recursos: ["r_relatorias", "r_llm"],
    hace: "Califica cada providencia en la escala de vinculancia (erga omnes, reforzado, vinculante, horizontal, persuasivo, no vinculante) y su régimen de apartamiento.",
    sirve: "Ninguna cita se usa con un peso que no tiene.",
    importa: "La doctrina probable fue derogada por la Ley 2430 de 2024: ya no se exige la triple reiteración." }),
  N({ id: "m07", etapa: "e3", nombre: "M07 · Similitud fáctica y ratio decidendi", tipo: "modelo_ia", grupo: "B", recursos: ["r_llm", "r_repositorio"],
    hace: "Compara hechos determinantes del caso y del precedente campo por campo, aísla la ratio y redacta la distinción cuando no gobierna.",
    sirve: "Separa citar bien de citar lo parecido.",
    importa: "La similitud computacional no es analogía jurídica: decide el ABOGADO (USUARIO)." }),
  N({ id: "m03", etapa: "e3", nombre: "M03 · Normograma cruzado", tipo: "servicio_externo", grupo: "A", recursos: ["r_normograma"],
    hace: "Determina los cuerpos normativos que concurren (y los descartados) con su ruta de integración.",
    sirve: "Evita analizar un caso multi-código con un solo código.",
    importa: "Si omite un cuerpo concurrente, ningún módulo posterior podrá recuperarlo." }),
  N({ id: "m04", etapa: "e3", nombre: "M04 · Vigencia y derogatoria", tipo: "servicio_externo", grupo: "A", recursos: ["r_normograma", "r_croma"],
    hace: "Resuelve cada norma a su texto vigente y devuelve vigente, condicionada, derogada, inexequible o no verificada, con fecha de comprobación.",
    sirve: "Impide citar derecho muerto.",
    importa: "La indisponibilidad técnica de una fuente jamás se trata como confirmación de vigencia." }),
  N({ id: "m05", etapa: "e3", nombre: "M05 · Bloque de constitucionalidad", tipo: "servicio_externo", grupo: "A", recursos: ["r_normograma", "r_relatorias"],
    hace: "Se activa si hay derecho fundamental comprometido con protección interna insuficiente o sujetos de especial protección; identifica tratado, ley aprobatoria y disposición.",
    sirve: "Aporta la capa convencional cuando el código se queda corto.",
    importa: "Invocarlo sin necesidad diluye el argumento: la abstención también es un resultado." }),
  N({ id: "m06", etapa: "e3", nombre: "M06 · Conceptos de autoridades", tipo: "servicio_externo", grupo: "A", recursos: ["r_normograma", "r_croma"],
    hace: "Identifica la autoridad competente y su doctrina (p. ej. DIAN), clasifica su fuerza y, si no hay doctrina, propone la consulta formal.",
    sirve: "Anticipa cómo resolverá la autoridad.",
    importa: "Un concepto no es norma (art. 28 CPACA): presentarlo como tal es un error de categoría." }),
  N({ id: "m21", etapa: "e3", nombre: "M21 · Auditoría de citas", tipo: "control_orquestacion", grupo: "D", recursos: ["r_relatorias", "r_normograma", "r_registro_trazas"],
    hace: "Intercepta toda cita, la resuelve contra su fuente primaria, compara literalmente el texto citado y registra dirección, fecha y resultado.",
    sirve: "Es la compuerta que separa un sistema útil de uno peligroso.",
    importa: "Una cita no resuelta bloquea el documento: no existe ruta alternativa." }),
  N({ id: "g_citas", etapa: "e3", nombre: "¿Toda cita verificada?", tipo: "decision", grupo: "nucleo", recursos: [],
    decision: { si: "Sí: todas resueltas contra su fuente", no: "No: una cita sin verificar devuelve el documento", humana: false },
    hace: "Bifurca: con todas las citas resueltas continúa; con una sola bloqueada, devuelve al fundamento para retirarla o reemplazarla.",
    sirve: "Hace imposible entregar un escrito con citas no verificadas.",
    importa: "Tras el límite de iteraciones, decide el ABOGADO (USUARIO) aportando la fuente o retirando la cita." }),

  // ─── e4 · Análisis
  N({ id: "f5", etapa: "e4", nombre: "Análisis de Hecho y de Derecho", tipo: "proceso", grupo: "nucleo", recursos: ["r_llm"],
    hace: "Conecta cada bloque de hechos con su norma verificada y distingue figuras parecidas no intercambiables.",
    sirve: "Coordina los analizadores de la capa B.",
    importa: "Un hecho solo se da por probado si un documento lo respalda con su folio." }),
  N({ id: "m08", etapa: "e4", nombre: "M08 · Prescripción y caducidad", tipo: "error_fallback", grupo: "B", recursos: ["r_calendario", "r_normograma"],
    hace: "Calcula cada término aplicable con su norma, la fecha inicial y el documento de donde salió; distingue prescripción (se alega) de caducidad (de oficio).",
    sirve: "Convierte una apreciación en una verificación.",
    importa: "Una fecha mal extraída invierte el resultado: se presenta como estimación con margen." }),
  N({ id: "m09", etapa: "e4", nombre: "M09 · Nulidades procesales", tipo: "error_fallback", grupo: "B", recursos: ["r_normograma"],
    hace: "Recorre el catálogo taxativo del art. 133 del CGP causal por causal, con soporte, saneamiento y oportunidad.",
    sirve: "Detecta vicios que una lectura orientada a otra cosa deja pasar.",
    importa: "Las causales son taxativas: lo que no encaja es irregularidad, no nulidad." }),
  N({ id: "m10", etapa: "e4", nombre: "M10 · Derechos fundamentales", tipo: "modelo_ia", grupo: "B", recursos: ["r_relatorias", "r_llm"],
    hace: "Tamiza los hechos: derechos comprometidos, legitimación, inmediatez, subsidiariedad y perjuicio irremediable.",
    sirve: "Señala vulneraciones no nombradas y evita tutelas improcedentes.",
    importa: "La tutela contra providencias judiciales queda fuera de alcance y se remite al ABOGADO (USUARIO)." }),
  N({ id: "m11", etapa: "e4", nombre: "M11 · Competencia y jurisdicción", tipo: "error_fallback", grupo: "B", recursos: ["r_normograma"],
    hace: "Recorre los factores (materia, cuantía, territorio, funcional, subjetivo) y muestra el cálculo de cuantía en SMMLV.",
    sirve: "Evita radicar ante el juez equivocado.",
    importa: "Los factores objetivo y territorial son prorrogables; subjetivo y funcional, no." }),
  N({ id: "m13", etapa: "e4", nombre: "M13 · Matriz de riesgo probatorio", tipo: "modelo_ia", grupo: "B", recursos: ["r_llm"],
    hace: "Cruza hechos con medios de prueba y califica pertinencia, conducencia, utilidad, licitud y riesgo de tacha.",
    sirve: "Convierte una debilidad difusa en una gestión probatoria concreta.",
    importa: "Una fila vacía es la información más útil del informe." }),
  N({ id: "m14", etapa: "e4", nombre: "M14 · Trampas procesales", tipo: "error_fallback", grupo: "B", recursos: ["r_calendario", "r_normograma", "r_croma"],
    hace: "Vigila el desistimiento tácito (art. 317 CGP), los requisitos de procedibilidad y las cargas con plazo, con la última actuación oficial.",
    sirve: "Protege a la parte que no monitorea su expediente.",
    importa: "Sin fecha confiable pide verificación en secretaría en vez de afirmar un plazo." }),
  N({ id: "m18", etapa: "e4", nombre: "M18 · Calendario de términos", tipo: "error_fallback", grupo: "C", recursos: ["r_calendario"],
    hace: "Consolida los términos con su estado (corriendo, riesgo, vencido aparente) y alertas escalonadas.",
    sirve: "Es el único punto donde el estado temporal de todos los expedientes existe reunido.",
    importa: "La métrica de fallo es el vencimiento sin alerta previa: debe ser cero." }),
  N({ id: "g_riesgo", etapa: "e4", nombre: "¿Hay término en riesgo?", tipo: "decision", grupo: "nucleo", recursos: [],
    decision: { si: "Sí: actuar de inmediato", no: "No: evaluar primero un acuerdo", humana: false },
    hace: "Si un término está por vencer prioriza la actuación; si no, evalúa antes los mecanismos alternativos.",
    sirve: "Impide optimizar el acuerdo a costa de perder la acción.",
    importa: "Un término vencido no se recupera." }),

  // ─── e5 · Estrategia
  N({ id: "m20", etapa: "e5", nombre: "M20 · Evaluador de MASC", tipo: "recurso_infra", grupo: "C", recursos: ["r_normograma", "r_llm"],
    hace: "Evalúa conciliabilidad, obligatoriedad como requisito (Ley 2220 de 2022) y conveniencia con puntaje desagregado.",
    sirve: "Ordena la decisión de conciliar o litigar.",
    importa: "Transigir sobre un derecho propio es decisión indelegable del cliente." }),
  N({ id: "m15", etapa: "e5", nombre: "M15 · Árbol de vía procesal", tipo: "recurso_infra", grupo: "C", recursos: ["r_normograma", "r_llm"],
    hace: "Elige la vía y la pieza siguiente con condiciones verificables, requisitos previos, ruta temporal y alternativas descartadas.",
    sirve: "Hace consistente la decisión de mayor efecto multiplicador.",
    importa: "Sin registro de descarte no hay auditoría de la decisión." }),
  N({ id: "m16", etapa: "e5", nombre: "M16 · Redactor de la pieza siguiente", tipo: "recurso_infra", grupo: "C", recursos: ["r_plantillas", "r_docgen", "r_llm"],
    hace: "Redacta la actuación con la estructura propia de su tipo (demanda, contestación, tutela, petición, recursos, querella, conciliación, nulidad, impulso…).",
    sirve: "Materializa la vía elegida.",
    importa: "El formato de la actuación es parte de su eficacia ante la autoridad." }),
  N({ id: "m17", etapa: "e5", nombre: "M17 · Notificaciones y comunicaciones", tipo: "servicio_externo", grupo: "C", recursos: ["r_normograma", "r_docgen", "r_calendario"],
    hace: "Determina forma de notificación y envío (Ley 2213 de 2022) y calcula perfeccionamiento y cómputo de términos.",
    sirve: "Protege a quien recibe una notificación electrónica.",
    importa: "Se toma siempre la fecha más conservadora como referencia de trabajo." }),
  N({ id: "m19", etapa: "e5", nombre: "M19 · Simulador del contradictor", tipo: "modelo_ia", grupo: "C", recursos: ["r_llm"],
    hace: "Ataca el borrador desde la contraparte: excepciones, tachas y debilidades narrativas, por severidad.",
    sirve: "Cierra las grietas evidentes antes de que las señale el juez.",
    importa: "Un ataque severo sin réplica exige decisión expresa de asumir el riesgo." }),
  N({ id: "f6", etapa: "e5", nombre: "Acciones siguientes y entregables", tipo: "proceso", grupo: "nucleo", recursos: ["r_plantillas", "r_docgen", "r_llm"],
    hace: "Redacta el informe técnico completo y genera los DOCX (informe y pieza) con notas al pie, índice paginado y referencias.",
    sirve: "Convierte el análisis en productos presentables.",
    importa: "Una pieza bien fundada pero mal armada se inadmite igual que una mal fundada." }),

  // ─── e6 · Gobernanza
  N({ id: "m28", etapa: "e6", nombre: "M28 · Anexos probatorios", tipo: "datos_almacen", grupo: "E", recursos: ["r_docgen"],
    hace: "Numera anexos de forma estable, construye el índice electrónico y valida remisiones cruzadas.",
    sirve: "Permite citar \"anexo 3, página 12\" y encontrarlo.",
    importa: "Un número asignado no cambia nunca: la renumeración silenciosa rompe la trazabilidad." }),
  N({ id: "m22", etapa: "e6", nombre: "M22 · Trazabilidad hecho → norma", tipo: "control_orquestacion", grupo: "D", recursos: ["r_registro_trazas"],
    hace: "Registra por cada afirmación su hecho, documento y página, norma o precedente y conclusión, encadenado por hash.",
    sirve: "Hace localizable cualquier error.",
    importa: "Una afirmación sin cadena no figura en el documento final." }),
  N({ id: "m23", etapa: "e6", nombre: "M23 · Etiquetado de confianza", tipo: "control_orquestacion", grupo: "D", recursos: ["r_registro_trazas"],
    hace: "Etiqueta cada afirmación (probado, oficial, afirmado, inferencia, consolidada, discutible, no verificado) y resume las zonas grises.",
    sirve: "Concentra la revisión donde el criterio humano agrega más valor.",
    importa: "Etiquetar no corrige: advierte." }),
  N({ id: "m25", etapa: "e6", nombre: "M25 · Sesgo y equidad", tipo: "modelo_ia", grupo: "D", recursos: ["r_llm"],
    hace: "Aplica una lista con enfoque diferencial, detecta lenguaje estereotipado y revisa simetría probatoria.",
    sirve: "Impide que una asimetría pase inadvertida.",
    importa: "Gestiona y monitorea el sesgo; no certifica su ausencia." }),
  N({ id: "m24", etapa: "e6", nombre: "M24 · Control del ejercicio profesional", tipo: "control_orquestacion", grupo: "D", recursos: ["r_normograma", "r_abogado"],
    hace: "Verifica derecho de postulación, poder y sus facultades, correo del Registro Nacional de Abogados, conflicto de intereses y viabilidad de la actuación.",
    sirve: "Marca con claridad la frontera de lo radicable.",
    importa: "Ninguna capacidad técnica sustituye la firma y la responsabilidad del ABOGADO (USUARIO)." }),
  N({ id: "g_habilitacion", etapa: "e6", nombre: "¿Actuación habilitada y procedente?", tipo: "decision", grupo: "nucleo", recursos: [],
    decision: { si: "Sí: continúa a revisión del ABOGADO (USUARIO)", no: "No: dictamen de no radicación o remisión", humana: false },
    hace: "Bifurca según el control del ejercicio profesional: sin impedimento pasa a revisión; con impedimento sale como dictamen.",
    sirve: "La remisión es una salida legítima, no un fallo.",
    importa: "Ninguna ruta la esquiva." }),
  N({ id: "g_revision", etapa: "e6", nombre: "¿El ABOGADO (USUARIO) aprueba?", tipo: "decision", grupo: "nucleo", recursos: ["r_abogado"],
    decision: { si: "Sí: aprueba y firma", no: "No: devuelve con observaciones", humana: true },
    hace: "Última decisión del flujo y la única que ningún módulo puede tomar. Si devuelve, el documento se re-elabora completo.",
    sirve: "Es la condición de legitimidad de todo lo demás.",
    importa: "El sistema puede producir un escrito impecable y aun así no sale sin esta firma." }),
  N({ id: "m27", etapa: "e6", nombre: "M27 · Retroalimentación del ABOGADO (USUARIO)", tipo: "control_orquestacion", grupo: "E", recursos: ["r_abogado", "r_memoria"],
    hace: "Clasifica cada devolución (tipo, error o estilo, generalizable) y ordena la re-elaboración completa.",
    sirve: "Convierte una corrección aislada en una regla reutilizable.",
    importa: "El índice de reincidencia distingue un sistema que aprende de uno que acumula notas." }),

  // ─── e7 · Salida
  N({ id: "n_entrega", etapa: "e7", nombre: "Pieza lista para radicar (aprobada y firmada por el ABOGADO (USUARIO))", tipo: "entrada_salida", grupo: "nucleo", recursos: ["r_abogado", "r_docgen"], terminal: true,
    hace: "Terminal favorable: versión radicable de la pieza, informe técnico final, índice y paquete de anexos.",
    sirve: "Único final en que se actúa ante la autoridad.",
    importa: "Que exista un solo camino hasta aquí, y que pase por la aprobación del ABOGADO (USUARIO), hace defendible el sistema." }),
  N({ id: "n_remision", etapa: "e7", nombre: "Dictamen de no radicación o remisión", tipo: "entrada_salida", grupo: "nucleo", recursos: ["r_abogado", "r_docgen"], terminal: true,
    hace: "Terminal alternativo: el informe explica por qué no debe radicarse (impedimento, inviabilidad o necesidad de especialista) con el trabajo ya hecho.",
    sirve: "Da salida legítima a lo que no debe litigarse todavía o por esta vía.",
    importa: "No es un fracaso del sistema sino una de sus garantías." }),
];

const A = (o: string, d: string, tipo: TipoArista, extra: Partial<Arista> = {}): Arista => ({ o, d, tipo, ...extra });

export const ARISTAS: Arista[] = [
  // e1 → e2
  A("n_exp", "f1", "flujo"),
  A("f1", "f2", "flujo"),
  A("f2", "m29", "datos", { etiqueta: "documentos leídos" }),
  A("m29", "m30", "datos", { etiqueta: "radicados" }),
  A("m29", "m31", "datos", { etiqueta: "identificaciones y bienes" }),
  A("m29", "m26", "datos", { etiqueta: "entidades (versión disociada)" }),
  A("m26", "f3", "datos", { etiqueta: "patrones previos" }),
  A("m30", "f3", "datos", { etiqueta: "estado procesal oficial" }),
  A("m31", "f3", "datos", { etiqueta: "hallazgos de debida diligencia" }),
  A("f2", "f3", "flujo"),
  A("f3", "m12", "flujo"),
  A("m12", "g_completo", "flujo"),
  A("g_completo", "f1", "error", { rama: "no", retorno: true, etiqueta: "No: faltan piezas" }),
  A("g_completo", "f4", "flujo", { rama: "si", etiqueta: "Sí: expediente completo" }),
  // e3
  A("f4", "m01", "flujo"),
  A("m01", "m02", "flujo"),
  A("m02", "m07", "flujo"),
  A("f4", "m03", "flujo"),
  A("m03", "m04", "flujo"),
  A("m04", "m05", "flujo"),
  A("m05", "m06", "flujo"),
  A("m06", "m21", "flujo"),
  A("m07", "m21", "flujo"),
  A("m21", "g_citas", "flujo"),
  A("g_citas", "f4", "error", { rama: "no", retorno: true, etiqueta: "No: cita sin verificar" }),
  A("g_citas", "f5", "flujo", { rama: "si", etiqueta: "Sí: todas verificadas" }),
  // e4
  A("f5", "m08", "flujo"),
  A("f5", "m09", "flujo"),
  A("f5", "m10", "flujo"),
  A("f5", "m11", "flujo"),
  A("f5", "m13", "flujo"),
  A("f5", "m14", "flujo"),
  A("m30", "m14", "datos", { etiqueta: "última actuación oficial" }),
  A("m08", "m18", "flujo"),
  A("m14", "m18", "flujo"),
  A("m09", "g_riesgo", "flujo"),
  A("m10", "g_riesgo", "flujo"),
  A("m11", "g_riesgo", "flujo"),
  A("m13", "g_riesgo", "flujo"),
  A("m18", "g_riesgo", "flujo"),
  A("g_riesgo", "m15", "error", { rama: "si", etiqueta: "Sí: actuar de inmediato" }),
  A("g_riesgo", "m20", "flujo", { rama: "no", etiqueta: "No: evaluar MASC" }),
  // e5
  A("m20", "m15", "flujo"),
  A("m15", "m16", "flujo"),
  A("m15", "m17", "flujo"),
  A("m16", "m19", "flujo"),
  A("m17", "m19", "flujo"),
  A("m19", "f6", "flujo"),
  // e6
  A("f6", "m28", "flujo"),
  A("m28", "m22", "flujo"),
  A("m22", "m23", "flujo"),
  A("m23", "m25", "flujo"),
  A("m25", "m24", "flujo"),
  A("m24", "g_habilitacion", "flujo"),
  A("g_habilitacion", "n_remision", "error", { rama: "no", etiqueta: "No: impedimento o inviabilidad" }),
  A("g_habilitacion", "g_revision", "flujo", { rama: "si", etiqueta: "Sí: habilitada y procedente" }),
  A("g_revision", "m27", "error", { rama: "no", etiqueta: "No: devuelve con observaciones" }),
  A("g_revision", "n_entrega", "flujo", { rama: "si", etiqueta: "Sí: aprueba y firma" }),
  A("m27", "m26", "remision", { etiqueta: "lección reutilizable (disociada)" }),
  A("m27", "f4", "remision", { retorno: true, etiqueta: "re-elaboración completa" }),
  // Dependencias declaradas (capa exterior → capa interior)
  A("m21", "m01", "dependencia"),
  A("m21", "m03", "dependencia"),
  A("m21", "m04", "dependencia"),
  A("m22", "m13", "dependencia"),
  A("m22", "m28", "dependencia"),
  A("m23", "m07", "dependencia"),
  A("m24", "m15", "dependencia"),
  A("m24", "m11", "dependencia"),
  A("m27", "m26", "dependencia"),
  A("m01", "f4", "dependencia"),
  A("m07", "f5", "dependencia"),
  A("m15", "f6", "dependencia"),
  A("m29", "f2", "dependencia"),
  A("m30", "f2", "dependencia"),
  A("m31", "f2", "dependencia"),
];

/** Paleta por categoría con el color de texto realmente usado en cada una (contraste WCAG). */
export const PALETA: Record<TipoNodo, { fondo: string; texto: string; leyenda: string }> = {
  entrada_salida: { fondo: "#1E40AF", texto: "#FFFFFF", leyenda: "Entrada / salida del sistema" },
  proceso: { fondo: "#DBEAFE", texto: "#0F172A", leyenda: "Paso de procesamiento" },
  decision: { fondo: "#FDE68A", texto: "#1F2937", leyenda: "Punto de decisión" },
  datos_almacen: { fondo: "#E0E7FF", texto: "#1E1B4B", leyenda: "Almacén de datos / documento" },
  modelo_ia: { fondo: "#F3E8FF", texto: "#3B0764", leyenda: "Lectura o análisis por IA" },
  servicio_externo: { fondo: "#CCFBF1", texto: "#134E4A", leyenda: "Fuente oficial externa (verificación)" },
  error_fallback: { fondo: "#FFE4E6", texto: "#881337", leyenda: "Ruta de excepción / corrección" },
  control_orquestacion: { fondo: "#FFEDD5", texto: "#7C2D12", leyenda: "Orquestación / control de calidad" },
  recurso_infra: { fondo: "#E5E7EB", texto: "#111827", leyenda: "Recurso de infraestructura" },
};

export interface DefinicionGrafo {
  nodos: Nodo[];
  aristas: Arista[];
  recursos: Recurso[];
  etapas: Etapa[];
  paleta: typeof PALETA;
  /** Declaración expresa: el grafo tiene bucles intencionales (no se esconden para pasar una prueba). */
  aciclico: false;
  inicio: string;
  terminales: string[];
}

export const GRAFO: DefinicionGrafo = {
  nodos: NODOS,
  aristas: ARISTAS,
  recursos: RECURSOS,
  etapas: ETAPAS,
  paleta: PALETA,
  aciclico: false,
  inicio: "n_exp",
  terminales: ["n_entrega", "n_remision"],
};

export function nodoPorId(id: string, grafo: DefinicionGrafo = GRAFO): Nodo {
  const nodo = grafo.nodos.find((n) => n.id === id);
  if (!nodo) throw new Error(`Nodo inexistente: ${id}`);
  return nodo;
}

export function capaDe(nodo: Nodo): Capa {
  return CAPA_POR_GRUPO[nodo.grupo];
}
