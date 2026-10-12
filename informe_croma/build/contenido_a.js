/* Contenido A: portada, abstract, índice, introducción, I, II y III. */
const { F, TF, cita: C } = require('./fuentes.js');

module.exports = function (x) {
  const { P, H1, H2, vinetas, numerada, cita, tabla, figura, saltoPagina, espacio, AlignmentType, T, datos } = x;
  const diag = Object.fromEntries(datos('diagramas.json').map((d) => [d.clave, d]));
  const resumen = datos('resumen_dominios.json');
  const out = [];

  // ── Portada ────────────────────────────────────────────────────────
  out.push(espacio(1200));
  out.push(P('**Croma, la API de datos de gobierno: arquitectura, atajos, límites y productos posibles en Colombia**',
    { align: AlignmentType.CENTER, size: T.titulo, line: 336, after: 360 }));
  out.push(P('Josué Ricardo Rojas Silva', { align: AlignmentType.CENTER, size: T.autor, after: 360 }));
  out.push(P('*Mapa técnico verificado con 61 pruebas en vivo, 17 flujos de trabajo validados y el catálogo completo de los 172 endpoints colombianos*',
    { align: AlignmentType.CENTER, size: T.subtitulo, after: 720 }));

  out.push(P('**ABSTRACT**', { align: AlignmentType.LEFT, size: T.h2, after: 120 }));
  out.push(P('Este informe mapea de extremo a extremo Croma, una API REST y un servidor MCP (Model Context Protocol) que entregan registros oficiales de ocho países como datos JSON tipados, con foco exclusivo en Colombia. A partir de la documentación oficial —el índice para modelos de lenguaje, las guías conceptuales, la *Agent Skill* y las páginas comerciales— y de 61 pruebas en vivo ejecutadas el 12 de octubre de 2026, se describen la arquitectura (tres superficies y tres modos de respuesta: consulta en vivo, dataset y lookup), el contrato de respuestas y errores, la asincronía, los lotes, los créditos y el versionado. Se inventarían los 172 endpoints colombianos, agrupados en 55 familias de fuente y doce dominios, y se modelan 17 flujos de trabajo validados con la compuerta de completitud del Creador de Flujos de Trabajo (17 de 17 aprobados). El documento sistematiza atajos de identificador, de costo y de contexto; una guía para formular instrucciones a agentes; 25 limitaciones documentadas u observadas —entre ellas rezagos de hasta 39 días, registros de prueba dentro de datos oficiales y monitores aún en beta privada— y un portafolio de catorce productos con costos unitarios estimados. Se concluye que Croma reduce de forma drástica el costo de integrar fuentes públicas colombianas, siempre que el producto incorpore control de calidad de datos, gestión explícita de la fecha de corte y una base legal clara para el tratamiento de datos personales.'));
  out.push(P('**Palabras clave:** API de datos públicos; MCP; agentes de IA; Colombia; LegalTech; debida diligencia; SECOP; Rama Judicial; Ley 1581 de 2012.', { after: 240 }));

  // ── Índice ─────────────────────────────────────────────────────────
  out.push(saltoPagina());
  out.push(P('**TABLA DE CONTENIDO**', { align: AlignmentType.LEFT, size: T.h1, after: 200 }));
  out.push('INDICE');

  // ── Introducción ───────────────────────────────────────────────────
  out.push(H1(null, 'INTRODUCCIÓN', { nuevaPagina: true }));
  out.push(P(`Colombia es uno de los países de la región con más registros públicos abiertos: el registro mercantil, los procesos judiciales, la contratación estatal, el registro de tránsito, los antecedentes disciplinarios y fiscales, el catastro, la jurisprudencia y la normativa están disponibles para consulta. El problema práctico no es la ausencia de datos, sino su dispersión: cada entidad tiene un portal, un formulario, un formato y un ritmo de actualización diferentes, y casi ninguno fue pensado para ser consultado por software o por agentes de inteligencia artificial.`));
  out.push(...cita('Colombia publica más registros abiertos que casi cualquier país de la región, pero cada uno vive en su propio portal, con su propio formulario y su propio ritmo.', C('co')));
  out.push(P(`Croma propone resolver esa fricción con una sola integración: una llave de organización, una forma de respuesta común y un catálogo de endpoints que también se exponen como herramientas MCP, de modo que Claude, ChatGPT, Cursor o un agente propio puedan consultarlos directamente.${F('intro', 'párrafo inicial')} Para Colombia, el catálogo publicado en la *Agent Skill* oficial suma 172 endpoints sobre 55 familias de fuente.${F('skill', 'sección «Endpoint catalog › Colombia»')}`));
  out.push(P('El objetivo de este informe es explicar con precisión cómo funciona Croma, cuál es su arquitectura, qué productos permite construir, cuáles son sus atajos, cómo deben formularse las instrucciones para aprovecharlo al máximo y qué limitaciones tiene. El análisis se restringe deliberadamente a Colombia. La sección I describe el método; la II, la arquitectura y el contrato técnico; la III, el mapa de fuentes colombianas; la IV, los flujos de trabajo por fuente diagramados con el Creador de Flujos de Trabajo; la V, los atajos; la VI, la forma de solicitar instrucciones; la VII, las limitaciones y riesgos; la VIII, el portafolio de productos, y la IX, las conclusiones. Los anexos documentan las especificaciones de forma del documento, la validación de los diagramas, el registro de pruebas y el catálogo completo.'));
  out.push(P('**Cómo leer este documento.** Las notas al pie identifican la fuente exacta de cada afirmación: la página de documentación y la sección concreta, o la prueba en vivo que la respalda. Los códigos T01 a T61 remiten al registro de pruebas del Anexo C; los códigos D00 a D16, a los diagramas validados del Anexo B; y los códigos R01 a R19, al registro de recursos que acompaña cada diagrama. Los nombres de herramientas, estados y términos legales se conservan en el idioma en que los publica la fuente.'));

  // ── I. Metodología ─────────────────────────────────────────────────
  out.push(H1('I', 'METODOLOGÍA Y ALCANCE', { nuevaPagina: true }));
  out.push(H2('1.1', 'Preguntas que guían el informe'));
  out.push(...numerada([
    '¿Cómo funciona Croma de extremo a extremo y cuál es su arquitectura?',
    '¿Qué fuentes colombianas cubre, con qué modo de respuesta, frescura y costo?',
    '¿Cómo opera el flujo de trabajo de cada familia de fuentes del Estado colombiano?',
    '¿Qué atajos permiten obtener más información con menos llamadas, créditos y contexto?',
    '¿Cómo deben formularse las instrucciones a un agente para aprovechar el 100 % de la API?',
    '¿Qué limitaciones y riesgos técnicos, de calidad de datos y jurídicos existen, y qué productos son viables?',
  ]));
  out.push(H2('1.2', 'Fuentes primarias consultadas'));
  out.push(P('La exploración se apoyó exclusivamente en fuentes primarias: la documentación oficial de Croma y la observación directa de su comportamiento. Para leer la documentación se usó la propia herramienta de extracción de Croma, `extract_markdown`, porque la política de red del entorno de trabajo bloqueó el acceso directo a los dominios de Croma; ese uso sirvió, a la vez, como prueba de la herramienta.'));
  out.push(...tabla({
    titulo: 'Fuentes primarias y aporte de cada una',
    anchos: [3.2, 6.2, 4.6],
    cabecera: ['Fuente', 'Qué aporta al análisis', 'Ubicación'],
    filas: [
      ['Índice `llms.txt`', 'Mapa completo de la documentación: 321 endpoints, guías por país, OpenAPI, catálogo y tarjeta del servidor MCP.', 'docs.usecroma.com/llms.txt'],
      ['Guías conceptuales (15)', 'Inicio rápido, autenticación, MCP, trabajos asíncronos, lotes, consultas en vivo, datasets, monitores, créditos, límites, errores y versionado.', 'docs.usecroma.com/es/…'],
      ['*Agent Skill* oficial', 'Catálogo de 319 endpoints con la descripción operativa de cada herramienta y las convenciones de llamada.', 'usecroma.com/.well-known/agent-skills/…'],
      ['Guías por fuente (11)', 'Entradas, salidas y restricciones de las fuentes sensibles: Policía, Procuraduría, Registraduría, Contraloría, Contaduría, ADRES, RUAF, RUNT, SIMIT, DIAN MUISCA y Bancolombia.', 'docs.usecroma.com/es/guides/colombia/…'],
      ['Sitio comercial', 'Cobertura, precios, verticales de industria, equipo fundador y postura sobre protección de datos.', 'usecroma.com/es/…'],
      ['Pruebas en vivo (61)', 'Comportamiento real: latencia relativa, forma de las respuestas, frescura (`as_of`), errores y calidad de datos.', 'Anexo C'],
    ],
  }));
  out.push(H2('1.3', 'Batería de pruebas en vivo'));
  out.push(P('Entre la mañana y la tarde del 12 de octubre de 2026 se ejecutaron 61 pruebas a través del servidor MCP de Croma, conectado al entorno de Claude Code con la organización del autor. Las pruebas cubrieron los doce dominios colombianos y las capacidades transversales (lotes, validación, paginación, asincronía, herramientas web, monitores y conexiones); adicionalmente se hicieron una búsqueda web y unas treinta extracciones de documentación con las herramientas globales de Croma. Se privilegiaron identificadores públicos de personas jurídicas —Banco Finandina (NIT 860051894), Ecopetrol (NIT 899999068) y D1 S.A.S. (NIT 900276962)—, jurisprudencia y registros abiertos. La Tabla 2 resume el alcance; el detalle de cada prueba está en el Anexo C.'));
  out.push(...tabla({
    titulo: 'Distribución de las pruebas por dominio',
    anchos: [4.2, 1.4, 8.4],
    cabecera: ['Dominio', 'Pruebas', 'Hallazgo principal'],
    alinear: [null, AlignmentType.CENTER, null],
    filas: [
      ['Justicia y jurisprudencia', '13', 'Búsquedas ordenadas por fecha; tope de 1.000 resultados en SAMAI; Consejo de Estado sin paginar.'],
      ['Empresas y mercado de valores', '11', 'RUES en vivo con EEFF desde 2013; Supersociedades con grafo de vinculados; un dataset caído.'],
      ['Contratación pública', '7', 'Registros de prueba en sanciones; valores imposibles; rezago de 39 días en modificaciones.'],
      ['Regulación, normativa y SIC', '10', 'Gestor Normativo con modificaciones enlazadas; coincidencias amplias en texto libre.'],
      ['Territorio, estadística y sectoriales', '13', 'IGAC como lookup con avalúo; TRM diaria; valores centinela en SIATA.'],
      ['Transversales y trámites', '7', 'Extracción fallida en gov.co; monitores en beta privada; sin conexiones configuradas.'],
    ],
  }));
  out.push(H2('1.4', 'Salvaguardas éticas y de protección de datos'));
  out.push(P(`Ninguna herramienta de verificación de personas naturales (Registraduría, Policía, Procuraduría, Contraloría, Contaduría, ADRES, RUAF, DNP, RUNT por persona o SIMIT) se ejecutó contra personas reales: su funcionamiento se documentó con las guías oficiales y con pruebas de validación de formato que no llegan a la fuente. Los datos personales que aparecieron de forma incidental en registros públicos de empresas o procesos (por ejemplo, representantes legales o partes) no se reproducen en este informe. Este criterio responde al principio de finalidad que Croma traslada expresamente al usuario: la consulta es posible porque el registro es público, pero la finalidad y la base legal del tratamiento son responsabilidad de quien consulta.${F('co', 'sección «Ley 1581 de 2012 y datos públicos»')}`));
  out.push(H2('1.5', 'Ejecución del Creador de Flujos de Trabajo'));
  out.push(P(`Los diagramas de la sección IV se produjeron siguiendo la especificación *Arquitecto de Diagramas de Proyectos de IA v1.0* suministrada como insumo: (1) ingesta de la descripción de cada fuente; (2) selección del tipo de diagrama según la pregunta que debe responder; (3) modelado del grafo en JSON con nodos, aristas y registro de recursos; (4) anotación de recursos y remisiones por nodo; (5) asignación de jerarquía y color semántico con la paleta apta para daltonismo; (6) validación con el motor del §9; (7) composición y render vectorial, y (8) redacción de la sección de objetivos y explicación. La regla de no inventar componentes se aplicó de forma estricta: cada nodo corresponde a un endpoint, un comportamiento documentado o una observación de las pruebas.`));
  out.push(P('El motor de validación se implementó tal como lo define el §9 (alcanzabilidad desde el inicio, llegada a un terminal, decisiones con al menos dos ramas etiquetadas, ausencia de aristas colgantes y de nodos aislados, existencia de recursos referenciados, regla de dependencia y ausencia de ciclos en los DAG). Los 17 diagramas obtuvieron el veredicto `APROBADO_RENDER`, sin recursos huérfanos. El chequeo de contraste del §9 evalúa texto blanco sobre cada color; las categorías claras (decisión, datos, proceso) no alcanzan AA con texto blanco, por lo que se seleccionó automáticamente el color de texto —blanco o negro— que maximiza el contraste, y con ello todas las categorías superan la razón 4,5:1 (Anexo B). Los diagramas se insertan como gráficos vectoriales SVG con respaldo PNG, y la composición elige, entre seis estrategias de distribución, la que ofrece la letra efectiva más legible en página carta.'));

  // ── II. Arquitectura ───────────────────────────────────────────────
  out.push(H1('II', 'ARQUITECTURA DE CROMA', { nuevaPagina: true }));
  out.push(H2('2.1', 'Qué es Croma y quién lo opera'));
  out.push(...cita('Croma es una API y un servidor MCP de datos oficiales de gobierno.', C('intro')));
  out.push(P(`Croma convierte registros oficiales del sector público en datos estructurados y tipados. Según su página institucional, el producto tiene tres superficies: una API REST con 321 endpoints sobre 113 fuentes oficiales en ocho países, un servidor MCP para consultar las mismas fuentes desde una conversación y Croma Legal, un tablero con el que equipos jurídicos y de crédito de bancos monitorean a diario la actividad judicial de sus carteras.${F('about', 'sección «What Croma is»')} La empresa declara operar bajo las leyes de la República de Colombia, etiquetar cada registro con su procedencia y no construir perfiles de las personas a quienes se refieren los registros; la desarrollan Cristian Correa y Tomás Calle, y reporta clientes en producción como Banco Finandina e Incomercio.${F('about', 'secciones «How we treat the data» y «Who builds it»')}`));
  out.push(P(`Las cifras de cobertura varían según la página: la introducción de la documentación menciona 80 fuentes y 33 colombianas, mientras el sitio comercial habla de 113 fuentes y 48 colombianas; el servidor MCP se anuncia con 319 herramientas.${F('intro', 'sección «Qué puedes consultar»')}${F('sitemcp', 'encabezado')} La diferencia obedece a cómo se agrupan las fuentes. En este informe se usa la unidad más granular y verificable —la familia de endpoint en la ruta, por ejemplo \`/co/supersociedades-baranda/…\`—, que arroja 172 endpoints y 55 familias para Colombia.`));
  out.push(H2('2.2', 'Superficies y puntos de entrada'));
  out.push(...tabla({
    titulo: 'Superficies de acceso a Croma',
    anchos: [3.2, 4.4, 3.6, 4.0],
    cabecera: ['Superficie', 'Dirección y protocolo', 'Autenticación', 'Uso típico'],
    filas: [
      ['API REST', '`https://api.croma.run`, rutas `POST /{país}/{fuente}/{endpoint}/v1` con cuerpo JSON', 'Bearer con llave de organización (`croma_live_…` o `croma_test_…`)', 'Integración en sistemas, backends, n8n o Make'],
      ['Servidor MCP', '`https://api.croma.run/mcp` sobre Streamable HTTP', 'OAuth (Claude, ChatGPT, Cursor) o la misma llave como Bearer', 'Agentes y asistentes conversacionales'],
      ['Consola', '`platform.usecroma.com`', 'Cuenta de la organización', 'Llaves, plan, monitores y conexiones'],
      ['Croma Legal', 'Tablero web', 'Cuenta de cliente', 'Monitoreo judicial diario de carteras'],
      ['Descripciones máquina', 'OpenAPI 3.1, `/catalog`, tarjeta MCP, *Agent Skill*', 'Públicas', 'Generar clientes y guiar agentes'],
    ],
    nota: 'Elaboración propia con base en la documentación de inicio rápido, autenticación y MCP, y en el índice llms.txt.',
  }));
  out.push(P(`Las herramientas MCP se nombran como la fuente y el endpoint con guiones bajos (por ejemplo, \`rues_entity_by_nit\` o \`rama_judicial_cases_by_radicado\`); cada herramienta comparte esquema, cupo y calendario de deprecación con el endpoint REST que la respalda.${F('mcp', 'sección «Nombres de las herramientas»')} Las llaves pertenecen a una organización y no a una persona: una llave personal recibe \`401 personal_api_key_not_allowed\`, y todas las llaves de una misma organización comparten el mismo cupo.${F('auth', 'sección «Las llaves pertenecen a una organización»')}${F('rate', 'sección «Un cupo por organización»')}`));
  out.push(H2('2.3', 'Tres modos de respuesta: vivo, dataset y lookup'));
  out.push(P('La decisión arquitectónica más importante de Croma es que no todos los endpoints consultan la fuente en el momento de la llamada. Existen tres modos de respuesta, con implicaciones directas sobre latencia, costo, frescura y disponibilidad (Tabla 4).'));
  out.push(...tabla({
    titulo: 'Modos de respuesta de los endpoints',
    anchos: [2.3, 4.6, 2.4, 2.0, 3.0, 2.7],
    cabecera: ['Modo', 'Cómo responde', 'Latencia', 'Créditos', 'Indicadores', 'Endpoints CO'],
    alinear: [null, null, null, AlignmentType.CENTER, null, AlignmentType.CENTER],
    filas: [
      ['En vivo', 'Consulta la fuente oficial en el momento; un sujeto por llamada', 'Segundos; asíncrono si es lento', '10', 'Sin `as_of`; `checked_at` en algunas fuentes', '59'],
      ['Dataset', 'Responde desde una copia completa que Croma mantiene al día', 'Milisegundos; nunca asíncrono', '1', '`as_of` en cada respuesta', '107'],
      ['Lookup', 'Lee la fuente la primera vez y reutiliza la copia dentro de una ventana de frescura', 'Milisegundos dentro de la ventana', '10', '`served_from` (copy, upstream, stale) y `checked_at`', '5'],
      ['Lote', 'Resuelve hasta 50 consultas en vivo en paralelo', 'Según la fuente', '10 por ítem', '`summary` y estado por ítem', '1'],
    ],
    nota: 'Conteos de elaboración propia sobre el catálogo de la Agent Skill y la tabla de fuentes servidas desde dataset de la documentación.',
  }));
  out.push(...cita('Sigue respondiendo cuando la fuente está caída o en mantenimiento.', C('datasets')));
  out.push(P(`La ventaja del modo dataset es doble: es diez veces más barato y no depende de la disponibilidad del portal estatal. Su contrapartida es la frescura, que depende del calendario de refresco de cada fuente.${F('datasets', 'sección «as_of»')} Las pruebas mostraron, además, que la promesa de disponibilidad no es absoluta: el dataset de procesos de insolvencia de Supersociedades devolvió «temporarily unavailable» en dos intentos separados.${TF('T17, T58', '`supersociedades_insolvency_processes_search` respondió «Supersociedades is temporarily unavailable right now».')} En el modo lookup, la respuesta informa si salió de la copia (\`copy\`), de la fuente (\`upstream\`) o de una copia vencida usada porque la fuente falló (\`stale\`); por eso se mide como consulta en vivo.${F('datasets', 'sección «Lookups»')}`));
  out.push(H2('2.4', 'Contrato de respuesta y manejo de errores'));
  out.push(P(`Las respuestas exitosas llegan envueltas en \`{ "data": … }\`; el saldo de créditos y un identificador de solicitud viajan como encabezados (\`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\`, \`X-RateLimit-Reset\`, \`X-Request-Id\`), no en el cuerpo.${F('quick', 'sección «Lee la respuesta»')} Las fallas usan un sobre común con \`type\`, \`code\`, \`message\` y, en errores de validación, \`param\` y \`details\`; la documentación recomienda ramificar por el código de estado y el campo \`code\`.${F('errors', 'sección «Sobre»')}`));
  out.push(...cita('Un “sin coincidencias” nunca es un 404; es un 200 exitoso.', C('errors')));
  out.push(...tabla({
    titulo: 'Códigos de error y acción recomendada',
    anchos: [1.2, 3.2, 3.6, 6.0],
    cabecera: ['HTTP', 'type', 'code', 'Significado y acción'],
    alinear: [AlignmentType.CENTER],
    filas: [
      ['400', 'invalid_request_error', 'invalid_param', 'El cuerpo no pasó la validación; corregir `param`. Por MCP llega como error −32602 antes de consumir créditos (T55).'],
      ['400', 'invalid_request_error', 'too_many_results', 'La consulta coincide con demasiados registros; acotarla (T01).'],
      ['401', 'authentication_error', 'invalid_api_key · personal_api_key_not_allowed', 'Llave ausente, revocada o sin organización.'],
      ['402', 'billing_error', 'plan_limit_reached', 'Sin créditos en el periodo; mejorar el plan o esperar `X-RateLimit-Reset`.'],
      ['404 / 410', 'not_found_error', 'endpoint_not_found · job_not_found · endpoint_retired', 'Ruta o trabajo inexistente; 410 indica retiro con sucesor en el encabezado `Link`.'],
      ['405', 'invalid_request_error', 'method_not_allowed', 'Los endpoints de datos solo aceptan POST.'],
      ['429', 'rate_limit_error', 'rate_limited', 'Tope horario excedido; respetar `Retry-After`.'],
      ['5xx', 'upstream_error', '{fuente}_upstream', 'La fuente estatal falló; reintentar (las consultas son idempotentes).'],
      ['500', 'api_error', 'internal_error', 'Error interno; reportar con `X-Request-Id`.'],
      ['—', 'trabajo', 'job_failed', 'Una consulta asíncrona falló como trabajo, no como error HTTP.'],
    ],
    nota: 'Errores (Croma, 2026). La validación previa al cobro se verificó en la prueba T55.',
  }));
  out.push(H2('2.5', 'Asincronía, lotes y caché'));
  out.push(P(`Veintiséis endpoints colombianos se ejecutan como trabajos asíncronos porque su fuente tarda desde unos segundos hasta un par de minutos: Consejo de Estado (búsqueda y providencia), Policía, tres endpoints de la Baranda Virtual de Supersociedades, ADRES, RUAF, SIC Trámites, cuatro de Propiedad Industrial, SICAAC, quejas de la Superfinanciera, los cuatro del RUNT, SIMIT, Contaduría, el documento electrónico de la DIAN, los dos de DIAN MUISCA y los dos de Bancolombia.${F('async', 'sección «¿Qué endpoints son asíncronos?»')} Por REST, la misma solicitud puede resolverse de tres maneras (Tabla 6).`));
  out.push(...tabla({
    titulo: 'Tres maneras de obtener un resultado asíncrono por REST',
    anchos: [3.0, 4.6, 6.4],
    cabecera: ['Modo', 'Lo que se envía', 'Lo que se recibe'],
    filas: [
      ['Esperar en línea (predeterminado)', 'Nada adicional o `Prefer: wait=N` (máximo 55 s)', '`200 { data }` si termina a tiempo; si no, `202` con `status_url` y encabezado `X-Job-Id`'],
      ['Polling', '`Prefer: wait=0`', '`202` inmediato; luego `GET /jobs/:id` respetando `Retry-After` (cupo propio de 600 por minuto, sin costo)'],
      ['Callback', '`callback_url` HTTPS pública en el cuerpo', '`202` inmediato; luego un POST con el sobre del trabajo, `x-croma-job-id` y firma HMAC `x-croma-signature`'],
    ],
    nota: 'Trabajos asíncronos (Croma, 2026). Estados posibles: queued, running, completed, failed, canceled y expired.',
  }));
  out.push(...cita('Las consultas asíncronas siempre esperan en línea sobre MCP: la llamada a la herramienta devuelve el resultado terminado, sin 202, polling ni callbacks.', C('mcp')));
  out.push(P(`Así ocurrió en las pruebas: la consulta asíncrona del portafolio de marcas de un titular y la providencia del Consejo de Estado se resolvieron dentro de la misma llamada MCP.${TF('T56, T61', 'ambas herramientas asíncronas devolvieron el resultado completo sin estado intermedio.')} El modo en lote existe hoy para un único endpoint —Rama Judicial por radicado—: recibe entre 1 y 50 ítems, deduplica las entradas repetidas, cobra por ítem, comparte caché con el endpoint individual y nunca falla en bloque por un ítem defectuoso de la fuente, aunque un ítem mal formado invalida toda la solicitud con un 400.${F('batch', 'secciones «Fallas parciales» y «Límites y comportamiento»')}${TF('T09', 'lote con un radicado existente y uno inexistente: ambos ítems «completed», el segundo con `found: false`.')} Una consulta idéntica y reciente se responde desde caché (\`X-Cache: HIT\`) sin consumir créditos.${F('live', 'sección «Latencia»')}`));
  out.push(H2('2.6', 'Créditos, planes y límites'));
  out.push(P(`Cada organización tiene un saldo mensual de créditos: una consulta en vivo (o un lookup) cuesta 10 y una solicitud a dataset cuesta 1, sin importar cuántos datos traiga la respuesta. Las respuestas desde caché, las solicitudes fallidas y la consulta del estado de un trabajo no consumen créditos.${F('credits', 'tabla «Solicitud | Créditos» y sección «Qué no consume nada»')}${F('pricing', 'sección «Cómo funcionan los créditos»')}`));
  out.push(...tabla({
    titulo: 'Planes y equivalencias de créditos',
    anchos: [2.4, 2.2, 2.6, 2.8, 2.8, 2.6],
    cabecera: ['Plan', 'USD / mes', 'Créditos / mes', 'Consultas en vivo', 'Solicitudes a dataset', 'USD por 1.000 créditos'],
    alinear: [null, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT],
    filas: [
      ['Free', '0', '5.000 (1.500 desde el 15-oct-2026)', '500 (150)', '5.000 (1.500)', '—'],
      ['Hobby', '20', '20.000', '2.000', '20.000', '1,00'],
      ['Standard', '99', '100.000', '10.000', '100.000', '0,99'],
      ['Pro', '299', '350.000', '35.000', '350.000', '0,85'],
      ['Scale', '799', '1.000.000', '100.000', '1.000.000', '0,80'],
      ['Contrato', 'A medida', 'Cifra mensual pactada', '—', '—', '—'],
    ],
    nota: 'Precios (Croma, 2026). Los créditos no se acumulan entre periodos; no existe pago por uso: al agotarse el saldo, las solicitudes reciben 402.',
  }));
  out.push(...cita('Una solicitud que falla no consume nada y una respuesta desde caché tampoco.', C('pricing')));
  out.push(P(`Encima de los créditos existen topes horarios. La página de límites indica 100 búsquedas web, 60 extracciones o generaciones y 10 investigaciones por hora solo en el plan gratuito, y ningún tope en los planes de pago.${F('rate', 'tabla «Topes por hora»')} La página de precios, en cambio, afirma que búsqueda web e investigación permiten 10 llamadas por hora y extracción y generación 60 por hora «en todos los planes».${F('pricing', 'pregunta «¿Hay límites además de los créditos?»')} Mientras Croma no unifique ambas versiones, conviene diseñar con el límite más estricto. Otro hecho relevante para la planeación: desde el 15 de octubre de 2026, tres días después de esta exploración, el plan gratuito baja de 5.000 a 1.500 créditos mensuales.${F('pricing', 'aviso inicial')} El limitador «falla abierto»: si su backend no está disponible, deja pasar las solicitudes sin encabezados \`X-RateLimit-*\`, por lo que el cliente no debe depender de su presencia.${F('rate', 'sección «Cuando excedes un tope»')}`));
  out.push(H2('2.7', 'Versionado y deprecación'));
  out.push(...cita('Los agentes se integran una vez y luego corren sin supervisión, así que el contrato tiene que decir de antemano qué puede cambiar y con cuánto aviso.', C('version')));
  out.push(P(`La versión mayor viaja en la ruta (\`/v1\`). Dentro de una versión el contrato solo crece: pueden aparecer endpoints, campos opcionales de entrada, campos de respuesta, valores nuevos en conjuntos abiertos y fuentes nuevas detrás de un endpoint. Eliminar o renombrar campos, cambiar tipos o significados, volver obligatorio un campo o cambiar un código de error exige una nueva ruta \`/v2\`. Un retiro se anuncia con al menos 90 días en el changelog y en cada respuesta mediante los encabezados \`Deprecation\` (RFC 9745), \`Sunset\` (RFC 8594) y \`Link\` con \`rel="successor-version"\`; vencida la fecha, la ruta responde \`410 endpoint_retired\` durante al menos otros 90 días.${F('version', 'secciones «Versionado» y «Deprecación»')}`));
  out.push(...tabla({
    titulo: 'Endpoints colombianos deprecados vigentes a la fecha del informe',
    anchos: [5.6, 2.6, 2.6, 5.2],
    cabecera: ['Endpoint', 'Deprecado desde', 'Deja de responder', 'Sucesor'],
    filas: [
      ['`POST /co/secop/contracts-by-provider/v1`', '2026-08-30', '2026-12-01', '`/co/secop/contracts-search/v1`'],
      ['`POST /co/secop/processes-by-entity/v1`', '2026-08-30', '2026-12-01', '`/co/secop/processes-search/v1`'],
      ['`POST /co/secop/sanctions-by-provider/v1`', '2026-08-30', '2026-12-01', '`/co/secop/sanctions-search/v1`'],
      ['`POST /co/siata/v1`', '2026-08-27', '2026-12-01', '`/co/siata-geoportal/weather/v1`'],
      ['`POST /co/legalize/laws/v1` y `law/v1`', '2026-09-16', '2026-09-30 (ya retirado)', '`/co/funcion-publica/norms-search/v1` y `norm/v1`'],
    ],
    nota: 'Versionado y deprecación (Croma, 2026). Los endpoints de Legalize tuvieron 14 días de aviso en lugar de 90 y ya no se ofrecen como herramientas MCP.',
  }));
  out.push(H2('2.8', 'Monitores y conexiones'));
  out.push(P(`Un monitor es una consulta guardada que Croma ejecuta con una frecuencia y envía por correo a uno, dos o tres destinatarios. Sobre una búsqueda reporta resultados nuevos; sobre la consulta de un registro (un radicado, un NIT, una placa) reporta qué cambió, con la ruta del campo y su valor anterior y nuevo. Los endpoints de dataset pueden seguir el refresco de la fuente (\`cadence: source\`, un crédito por ejecución); los endpoints en vivo solo admiten frecuencias diaria o semanal. Una organización admite hasta 20 monitores, cada ejecución reporta hasta 500 filas nuevas y un filtro de relevancia en lenguaje natural puede descartar filas sin perderlas.${F('monitors', 'secciones «¿Qué endpoints se pueden monitorear?», «Frecuencias», «El filtro de relevancia» y «Créditos y límites»')} En la organización usada para este informe, sin embargo, la función no estaba habilitada.${TF('T46', '`list_monitors` respondió «monitors_not_enabled: Monitors are in private beta and not enabled for this organization yet».')}`));
  out.push(P(`Las conexiones resuelven las fuentes que solo responden a una persona con sesión iniciada. En Colombia son dos: la cuenta DIAN (MUISCA) y la banca virtual de Bancolombia. La herramienta \`*_connect\` entrega un enlace seguro donde el titular escribe sus credenciales en la consola de Croma, de modo que nunca pasan por la conversación; Croma las cifra al llegar, nunca las devuelve, admite hasta cinco conexiones por fuente y rota entre ellas cuando una agota su cupo diario.${F('mcp', 'párrafo sobre herramientas de conexión')}${F('muisca', 'sección «Conecta tu cuenta»')} Las herramientas de monitores y de conexiones son las únicas que escriben; todas las demás son consultas idempotentes.${F('mcp', 'misma sección')}`));
  out.push(H2('2.9', 'Diagrama de arquitectura (D00)', { nuevaPagina: true }));
  out.push(...figura('D00', 'Arquitectura general de Croma: actores, superficies, núcleo, modos de respuesta y fuentes', 'Elaboración propia con el Creador de Flujos de Trabajo a partir de la documentación oficial de Croma. Veredicto §9: APROBADO_RENDER. Recursos Rxx en la Tabla 9.'));
  out.push(...explicacion(x, diag.D00, {
    objetivo: 'Mostrar cómo una necesidad de información viaja desde el usuario —directamente o a través de un agente— hasta la fuente oficial, y cómo regresa como JSON tipado con su procedencia. Es la vista de contexto y contenedores que enmarca todos los flujos de la sección IV.',
    pasos: [
      'El usuario actúa por cuatro vías: un cliente MCP con OAuth, código propio con llave Bearer, la consola de administración o el tablero Croma Legal.',
      'Las dos superficies técnicas (MCP y REST) convergen en una misma puerta de entrada que valida la llave, descuenta créditos y aplica topes; si algo falla, responde con el sobre de error.',
      'El enrutador decide el modo del endpoint: dataset (copia completa), lookup (copia por llave con ventana de frescura) o consulta en vivo.',
      'Las consultas en vivo lentas pasan por la cola de trabajos; las rápidas van directo a la fuente oficial. Las conexiones cifradas aportan la sesión del titular cuando la fuente la exige.',
      'La consola crea monitores que reutilizan el mismo enrutador y envían por correo solo lo nuevo o lo que cambió.',
    ],
    decisiones: 'Hay dos decisiones estructurales: el modo de servicio del endpoint, que determina costo, latencia y frescura, y la naturaleza asíncrona, que determina si la respuesta puede requerir espera, polling o callback por REST.',
    errores: 'La puerta de entrada rechaza solicitudes sin llave válida, sin créditos o sobre un tope (401, 402, 429). La fuente oficial puede fallar (5xx upstream); en ese caso el lookup puede servir una copia vencida marcada como `stale`.',
    riesgos: 'Supuesto: Croma Legal consume la misma API REST que ofrece a terceros; la documentación lo describe como superficie del producto, pero no detalla su integración interna, por lo que se modela como cliente de la API.',
  }));
  out.push(H2('2.10', 'Diagrama del ciclo de vida de una solicitud (D01)', { nuevaPagina: true }));
  out.push(...figura('D01', 'Ciclo de vida de una solicitud: admisión, caché, modo de servicio, asincronía y respuesta', 'Elaboración propia a partir de las guías de errores, trabajos asíncronos, consultas en vivo y datasets. Veredicto §9: APROBADO_RENDER (contiene un ciclo intencional de polling).'));
  out.push(...explicacion(x, diag.D01, {
    objetivo: 'Explicar decisión por decisión qué ocurre con cada llamada y qué respuesta o error debe esperar quien integra, de modo que el cliente maneje todos los caminos y no solo el exitoso.',
    pasos: [
      'La solicitud se admite si su cuerpo cumple el esquema, la llave es válida y hay créditos y cupo horario; si no, termina en un error 4xx tipado.',
      'Si existe un resultado reciente idéntico, se devuelve desde caché con `X-Cache: HIT` y sin costo.',
      'Según el modo, se consulta la copia completa (dataset), la copia por llave si está vigente (lookup) o la fuente en vivo.',
      'En vivo, si el endpoint es asíncrono, el canal MCP siempre espera el resultado; por REST, la espera llega hasta 55 segundos y luego se pasa a polling o callback hasta un estado terminal.',
      'Con la respuesta de la fuente se decide si hubo coincidencia: un registro o lista (`200 { data }`) o una respuesta definitiva sin coincidencias (`found: false` o lista vacía).',
    ],
    decisiones: 'La decisión «¿Hay coincidencia?» es la más malinterpretada: `found: false` no es un error, es una respuesta definitiva y válida. La decisión del estado del trabajo contiene el único ciclo del diagrama (queued o running vuelven a polling).',
    errores: 'Errores de admisión (400, 401, 402, 429), fallas de la fuente (5xx `upstream_error`) y fallas del trabajo (`job_failed`, `canceled`, `expired`). Las consultas son idempotentes, por lo que reintentar es seguro; el encabezado `Idempotency-Key` permite correlacionar reintentos.',
    riesgos: 'Se fusionaron en un solo nodo de error los códigos de admisión para mantener la legibilidad; su detalle está en la Tabla 5. La ventana de frescura de cada lookup varía por fuente (por ejemplo, 30 días en IGAC y un día en Propiedad Industrial).',
  }));

  // ── III. Mapa de Colombia ──────────────────────────────────────────
  out.push(H1('III', 'MAPA DE LAS FUENTES COLOMBIANAS', { nuevaPagina: true }));
  out.push(H2('3.1', 'Inventario por dominio'));
  out.push(P('Los 172 endpoints colombianos se agruparon en doce dominios funcionales. La Tabla 11 muestra cuántas familias y endpoints tiene cada dominio y cómo se reparten por modo de respuesta. Seis de cada diez endpoints (107) responden desde dataset; los 59 en vivo se concentran en verificación de personas, vehículos, finanzas del titular, ambiente y procesos judiciales activos.'));
  const tot = resumen.reduce((a, r) => ({ f: a.f + r.n_familias, e: a.e + r.endpoints, ds: a.ds + r.dataset, v: a.v + r.vivo, o: a.o + r.lookup + r.lote, as: a.as + r.asincronos }), { f: 0, e: 0, ds: 0, v: 0, o: 0, as: 0 });
  out.push(...tabla({
    titulo: 'Endpoints de Colombia por dominio y modo de respuesta',
    anchos: [5.2, 1.6, 1.8, 1.6, 1.4, 1.9, 1.9],
    cabecera: ['Dominio', 'Familias', 'Endpoints', 'Dataset', 'Vivo', 'Lookup / lote', 'Asíncronos'],
    alinear: [null, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER],
    filas: [
      ...resumen.map((r) => [r.dominio, r.n_familias, r.endpoints, r.dataset, r.vivo, r.lookup + r.lote, r.asincronos]),
      ['**Total**', `**${tot.f}**`, `**${tot.e}**`, `**${tot.ds}**`, `**${tot.v}**`, `**${tot.o}**`, `**${tot.as}**`],
    ],
    nota: 'Elaboración propia sobre el catálogo de la Agent Skill (usecroma.com/.well-known/agent-skills/croma-api/SKILL.md) y la tabla de fuentes servidas desde dataset. El listado completo está en el Anexo D.',
  }));
  out.push(H2('3.2', 'Frescura de los datos observada'));
  out.push(P(`El campo \`as_of\` indica hasta cuándo está al día cada copia. La Tabla 12 compara el valor observado en las pruebas del 12 de octubre de 2026 con el horario de refresco declarado en la página de fuentes monitoreables.${F('monsrc', 'tabla de Colombia, columna «Revisión»')} La mayoría de las fuentes estaba al día (rezago de cero a siete días), pero cinco mostraban rezagos de entre 16 y 39 días, un dato crítico para productos de alertas o de cumplimiento.`));
  out.push(...tabla({
    titulo: 'Rezago observado de los datasets frente a su calendario de refresco',
    anchos: [5.0, 2.6, 1.6, 3.6, 1.6],
    cabecera: ['Endpoint (prueba)', '`as_of` observado', 'Rezago', 'Refresco declarado (Bogotá)', 'Prueba'],
    alinear: [null, AlignmentType.CENTER, AlignmentType.CENTER, null, AlignmentType.CENTER],
    filas: [
      ['SECOP: modificaciones de contratos', '2026-09-03', '39 días', 'Diario, 06:00', 'T24'],
      ['SECOP: planes anuales de adquisiciones', '2026-09-07', '35 días', 'Semanal, lunes 08:00', 'T28'],
      ['SAMAI: providencias del Consejo de Estado', '2026-09-18', '24 días', 'Diario, 04:20', 'T04'],
      ['SIMEV: accionistas de emisores', '2026-09-21', '21 días', 'Semanal, lunes 06:00', 'T13'],
      ['SIC: actos administrativos y sentencias', '2026-09-26', '16 días', 'Diario, 05:30', 'T43'],
      ['Supersociedades: empresas, vinculados, ranking', '2026-10-05', '7 días', 'Semanal, lunes 05:00–07:45', 'T12, T15, T21'],
      ['Rama Judicial: directorio de correos', '2026-10-05', '7 días', 'Semanal, lunes 04:20', 'T08'],
      ['DIAN: importadores y exportadores', '2026-10-05', '7 días', 'Semanal, lunes 07:00', 'T14'],
      ['INVIMA: medicamentos (CUM)', '2026-10-05', '7 días', 'Semanal, lunes 05:30', 'T32'],
      ['IGAC: catastro', '2026-10-07', '5 días', 'Mensual, día 25', 'T29, T33'],
      ['Imprenta Nacional: Gaceta del Congreso', '2026-10-07', '5 días', 'Diario, 07:20', 'T38'],
      ['Supersociedades Baranda: autos', '2026-10-08', '4 días', 'Diario, 06:30', 'T16'],
      ['DANE, TerriData e ICFES', '2026-10-10', '2 días', 'Mensual o semanal', 'T47, T48, T59'],
      ['Corte Constitucional y Corte Suprema', '2026-10-11', '1 día', 'Diario, 05:50 y 04:40', 'T02, T03'],
      ['SECOP: procesos, contratos, perfil y sanciones', '2026-10-11', '1 día', 'Diario, 05:00–07:30', 'T25, T23, T27'],
      ['Función Pública, CREG, SUIT, ANM, Superfinanciera', '2026-10-11', '1 día', 'Diario', 'T35, T40, T39, T37, T18'],
      ['Banco de la República: series', '2026-10-12', '0 días', 'Diario, 19:30', 'T36'],
    ],
    nota: 'El rezago se calcula frente al 12 de octubre de 2026. Que el as_of sea antiguo no implica error de Croma: puede reflejar que la entidad no ha publicado; la página de monitores indica que en ese caso la ejecución se marca con source_stale.',
  }));
  out.push(H2('3.3', 'Identificadores que abren cada fuente'));
  out.push(P('En Croma el identificador correcto es el atajo más potente: valida antes de cobrar, evita búsquedas ambiguas y habilita la consulta de detalle. La Tabla 13 resume los formatos aceptados por las herramientas colombianas.'));
  out.push(...tabla({
    titulo: 'Identificadores, formatos y herramientas que los aceptan',
    anchos: [3.4, 4.2, 4.2, 4.2],
    cabecera: ['Identificador', 'Formato', 'Herramientas', 'Atajo'],
    size: 17,
    filas: [
      ['NIT', '4 a 15 dígitos, normalmente sin dígito de verificación', 'RUES, Supersociedades, SIMEV, DIAN comercio, SECOP, SIC', 'En SECOP probar con y sin DV; en SIC PI se acepta con o sin DV.'],
      ['Documento de persona', 'CC, CE, PA, PEP, PPT, TI, RC, DPO según la fuente', 'Policía, Procuraduría, Contraloría, Contaduría, ADRES, RUAF, RUNT, SICAAC', 'RUAF exige además la fecha de expedición.'],
      ['Radicado judicial', '20 a 25 dígitos', 'Rama Judicial, SAMAI, correos de despachos', 'Sus primeros 12 dígitos son el código del despacho.'],
      ['Código de despacho', '12 dígitos', '`rama_judicial_emails_by_court`', 'Responde «a quién le escribo» en una llamada.'],
      ['Noticia criminal', '21 dígitos', '`fiscalia_case`', 'Datos no reservados del SPOA.'],
      ['Radicado y ficha CNDJ', '23 dígitos + número de ficha', '`cndj_ruling`', 'La búsqueda devuelve ambos.'],
      ['Número predial nacional', '30 dígitos', 'IGAC (predio, construcciones, placas)', 'Los primeros 17 identifican manzana o vereda.'],
      ['SECOP', '`CO1.NTC.…`, `CO1.PCCNTR.…` o id prefijado `secop_ii:…`', 'Procesos y contratos', 'El id prefijado se lee en milisegundos con `*_record`.'],
      ['CUFE', 'Código de factura electrónica + NIT emisor o receptor', '`dian_electronic_document`', 'Caché de 24 h; `cache: false` tras un evento.'],
      ['CUM y expediente', '`20042480-41`, `20190868`', 'INVIMA', 'El CUM identifica la presentación comercial.'],
      ['Placa', '`ABC123` o `ABC12D`', 'RUNT, SIMIT', 'SIMIT acepta placa o documento en el mismo campo.'],
      ['DIVIPOLA', '2 dígitos (departamento) o 5 (municipio)', 'DANE, TerriData, ICFES, MinEducación, IGAC, SUIT', 'Llave común para cruzar estadísticas.'],
      ['Expediente de PI', '`SD2026/0066943`, `NC2026/0006185`', 'SIC Propiedad Industrial y Gaceta', 'El detalle trae el historial y los documentos.'],
      ['Providencias', '`T-013/25`, `SU.502/25`, `AC6049-2026`, hash SAMAI', 'Cortes y SAMAI', 'Leer el texto por rangos con `offset` y `limit`.'],
      ['Códigos de serie', 'BanRep `1` (TRM), `59` (tasa de política); TerriData 9 dígitos', 'BanRep, TerriData', 'Buscar el código una vez y reutilizarlo.'],
      ['Ids normativos', '`norm_id` (Función Pública), `ce:2026:7` (SFC), `resolucion_101-128_2026` (CREG)', 'Normativa', 'Permiten reconstruir modificaciones.'],
    ],
    nota: 'Elaboración propia con base en los esquemas de entrada de las herramientas MCP y en las pruebas del Anexo C.',
  }));
  return out;
};

// Bloque estándar del MD (§13): objetivos y explicación + tabla de recursos
function explicacion(x, d, e) {
  const { P, numerada, tabla } = x;
  const out = [];
  out.push(P(`**Objetivo del flujo.** ${e.objetivo}`, { before: 120 }));
  out.push(P('**Lectura del flujo paso a paso.**', { after: 60, keepNext: true }));
  out.push(...numerada(e.pasos));
  out.push(P(`**Decisiones y condiciones clave.** ${e.decisiones}`, { before: 80 }));
  out.push(P(`**Rutas de error y contingencias.** ${e.errores}`));
  out.push(P(`**Riesgos y supuestos.** ${e.riesgos}`));
  out.push(...tabla({
    titulo: `Recursos y remisiones del diagrama ${d.clave}`,
    anchos: [1.1, 5.0, 1.6, 1.6, 2.6, 4.1],
    cabecera: ['Id', 'Recurso', 'Tipo', 'Criticidad', 'Nodos que lo usan', 'Remite a / dependencia'],
    size: 17,
    filas: d.recursos.map((r) => [r.id, r.detalle, r.tipo, r.criticidad, r.nodos.join(', '), r.remite]),
    nota: `Registro único de recursos (§7). Validación §9 del diagrama: ${d.validacion.veredicto}, ${d.validacion.n_nodos} nodos, ${d.validacion.n_aristas} aristas, ${d.validacion.n_decisiones} decisiones, ${d.validacion.rutas_error} rutas de error, 0 recursos huérfanos.`,
  }));
  return out;
}
module.exports.explicacion = explicacion;
