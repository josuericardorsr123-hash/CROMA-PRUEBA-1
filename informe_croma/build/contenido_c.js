/* Contenido C: V a IX, firma, referencias y anexos A a D. */
const { F, TF, cita: C, REFS } = require('./fuentes.js');

module.exports = function (x) {
  const { P, H1, H2, vinetas, numerada, cita, tabla, caja, firma, referencias, saltoPagina, datos, AlignmentType, T } = x;
  const diags = datos('diagramas.json');
  const catalogo = datos('catalogo_co.json');
  const out = [];
  const CEN = AlignmentType.CENTER;

  // ── V. Atajos ──────────────────────────────────────────────────────
  out.push(H1('V', 'ATAJOS PARA APROVECHAR EL 100 % DE LA API', { nuevaPagina: true }));
  out.push(P('Un atajo, en este contexto, es una forma de obtener la misma información con menos llamadas, menos créditos, menos latencia o menos contexto consumido por el agente. Los atajos se agrupan en cuatro familias: de identificador, de costo, de contexto y de encadenamiento.'));
  out.push(H2('5.1', 'Atajos de identificador'));
  out.push(...tabla({
    titulo: 'Atajos de identificador',
    anchos: [0.7, 4.0, 7.4, 1.9],
    cabecera: ['#', 'Atajo', 'Cómo se aplica', 'Evidencia'],
    alinear: [CEN, null, null, CEN],
    size: 17,
    filas: [
      ['1', 'Del radicado al correo del despacho', '`rama_judicial_emails_by_court` acepta el radicado completo: sus primeros 12 dígitos son el código del despacho.', 'T08'],
      ['2', 'Todo SECOP en una llamada', '`secop_profile` con el NIT o la cédula resume contratos, adjudicaciones, ofertas y sanciones por un crédito; las búsquedas solo sirven para paginar.', 'T23'],
      ['3', 'Lectura instantánea por id prefijado', 'Los ids `secop_ii:…` y `secop_i:…` de cualquier búsqueda se leen en milisegundos con `*_record`, incluso cuando la vista viva aún no tiene el registro.', 'T44'],
      ['4', 'Carteras en lote', 'Hasta 50 radicados por llamada; los duplicados se consultan una vez y un ítem que falla en la fuente no tumba el lote.', 'T09'],
      ['5', 'Nombre exacto y ventana de 30 días', 'La razón social completa más `active_only` evita «too many matches» en Rama Judicial.', 'T01, T05'],
      ['6', 'Grafo societario automático', 'Los `party_document_numbers` de Supersociedades alimentan `supersociedades_ownership_search` para encontrar en qué otras sociedades aparece cada socio o administrador.', 'T15'],
      ['7', 'Predios por manzana', 'Los primeros 17 dígitos del número predial son el `block_code` que lista todos los predios de la manzana o vereda.', 'Guía IGAC'],
      ['8', 'DIVIPOLA como llave universal', 'El mismo código de 2 o 5 dígitos cruza DANE, TerriData, ICFES, MinEducación, IGAC y SUIT.', 'T31, T47, T59'],
      ['9', 'Estados del día sin PDF', '`supersociedades_baranda_decisions_search` con `from_date` igual a `to_date` devuelve los autos notificados ese día con lo que ordenan.', 'Guía Baranda'],
      ['10', 'Portafolio marcario completo', '`sic_ip_trademarks_by_owner` con NIT (con o sin DV) devuelve todas las marcas del titular sin conocer sus nombres.', 'T56'],
      ['11', 'Factura sin contraseña', '`dian_electronic_document` con `include_pdf` y la secuencia de contraseñas sugeridas; `cache: false` tras registrar un evento.', 'Agent Skill'],
      ['12', 'Normas con su historia', 'Los `amendments` con `norm_id` del Gestor Normativo enlazan decretos reglamentarios y modificaciones sin buscarlos.', 'T35'],
    ],
  }));
  out.push(H2('5.2', 'Atajos de costo'));
  out.push(...vinetas([
    `**Preferir el dataset cuando existe equivalente.** Una solicitud a dataset cuesta 1 crédito frente a 10 de una consulta en vivo; en SECOP, por ejemplo, \`*_record\` sustituye a la vista viva para casi todos los usos.${F('credits', 'tabla de costos')}`,
    `**Aprovechar la caché.** Repetir una consulta reciente no consume créditos, y el lote comparte caché con el endpoint individual: un radicado consultado hace poco regresa con \`cache_hit: true\`.${F('batch', 'sección «Límites y comportamiento»')}`,
    '**No temer a los errores ni al polling.** Las solicitudes fallidas y la consulta del estado de un trabajo no consumen créditos; la validación de formato ocurre antes de cobrar (T55).',
    `**Pedir páginas grandes en procesos por lotes.** El costo es por solicitud, «sin importar cuántos datos traiga la respuesta»; en integraciones de servidor conviene \`per_page\` alto (hasta 100 en muchas búsquedas).${F('pricing', 'sección «Cómo funcionan los créditos»')}`,
    '**Vigilar con monitores sobre datasets.** Un monitor con `cadence: source` sobre un dataset cuesta un crédito por ejecución y corre justo después del refresco; sobre un endpoint en vivo cuesta diez.',
    '**Elegir plan por volumen.** El costo por cada 1.000 créditos baja de 1,00 dólares (Hobby) a 0,80 (Scale); los créditos no se acumulan, de modo que sobredimensionar el plan no ahorra.',
  ]));
  out.push(H2('5.3', 'Atajos de contexto para agentes'));
  out.push(P('El recurso más escaso de un agente no es el crédito sino la ventana de contexto. Varias respuestas de Croma son extensas, y una mala elección de parámetros puede llenar el contexto con texto irrelevante.'));
  out.push(...vinetas([
    '**Paginación corta en búsquedas de jurisprudencia.** La búsqueda de la Corte Constitucional devuelve la parte resolutiva completa de cada sentencia: usar `per_page` de 3 a 5 y abrir solo las relevantes (T02).',
    '**Lectura por rangos.** Los detalles de normas, sentencias, notificaciones y trámites aceptan `offset` y `limit`; pedir primero un rango pequeño y continuar con `next_offset` solo si hace falta (T57).',
    '**Evitar el detalle sin paginación.** `consejo_estado_providencia` devuelve el texto íntegro de una vez (71.816 caracteres en la prueba): en contextos ajustados, conviene resumir por partes (T61).',
    '**Filtros antes que texto libre.** Como el texto libre coincide de forma amplia y ordena por fecha, los filtros estructurados (tipo, año, número, ponente, entidad) son los que garantizan pertinencia (T38, T40).',
    '**Identificadores en la lengua de la fuente.** No traducir estados, nombres ni términos legales; escribir las consultas con la terminología jurídica colombiana.',
  ]));
  out.push(...cita('Names, statuses and legal terms stay in the source language (Spanish). Do not translate identifiers. [Los nombres, estados y términos legales permanecen en el idioma de la fuente. No traduzcas los identificadores.]', C('skill')));
  out.push(H2('5.4', 'Cadenas de herramientas recomendadas'));
  out.push(...tabla({
    titulo: 'Recetas de encadenamiento y su costo en créditos',
    anchos: [3.4, 8.6, 2.0],
    cabecera: ['Objetivo', 'Cadena de herramientas', 'Créditos'],
    alinear: [null, null, CEN],
    size: 17,
    filas: [
      ['Conocimiento de una empresa (KYB)', '`rues_entity_by_nit` (10) → `secop_profile` (1) → `supersociedades_company` (1) → `supersociedades_filing_ownership` (1) → `dian_trade_profile` (1) → `sic_ip_trademarks_by_owner` (10) → `procuraduria_disciplinary_records` por NIT (10) → `contaduria_state_delinquent_debtors` por NIT (10) → `rama_judicial_cases_by_entity` (10)', '54'],
      ['Debida diligencia de contratista', '`secop_profile` (1) → `secop_sanctions_search` (1) → `secop_contracts_search` (1) → `secop_bidders_search` (1) → `secop_modifications_search` (1) → `procuraduria_disciplinary_records` (10) → `contaduria_state_delinquent_debtors` (10)', '25'],
      ['Vigilancia diaria de un radicado', '`rama_judicial_cases_by_radicado` (10 por día) + `rama_judicial_emails_by_court` una vez (1)', '≈ 301 al mes'],
      ['Avalúo y contexto de un predio', '`igac_property_by_point` (10) → `igac_economic_zones_search` (1) → `igac_physical_zones_search` (1) → `igac_municipal_statistics` (1)', '13'],
      ['Investigación jurisprudencial', '`corte_constitucional_rulings_search` (1) + `samai_rulings_search` (1) → lectura completa de dos providencias de unos 340.000 caracteres (6 rangos cada una)', '≈ 14'],
      ['Norma vigente y su historia', '`funcion_publica_norms_search` (1) → `funcion_publica_norm` (1 o más) → normas modificatorias (1 cada una)', '≈ 5'],
      ['Ficha territorial municipal', '`terridata_series` (1) + `dane_municipal_ipm` (1) + `dane_census_municipalities` (1) + `icfes_saber11_schools_search` (1) + `mineducacion_indicators_search` (1) + `igac_municipal_statistics` (1)', '6'],
      ['Validación de una factura', '`dian_electronic_document` con `include_pdf`', '10'],
    ],
    nota: 'Cálculo propio con las tarifas de la página de créditos (10 en vivo o lookup, 1 dataset). Las respuestas desde caché no consumen créditos, por lo que el costo real de consultas repetidas es menor.',
  }));

  // ── VI. Cómo solicitar instrucciones ───────────────────────────────
  out.push(H1('VI', 'CÓMO SOLICITAR INSTRUCCIONES A UN AGENTE CON CROMA', { nuevaPagina: true }));
  out.push(H2('6.1', 'Principios'));
  out.push(...numerada([
    '**Nombrar la fuente** y, si se conoce, la herramienta: «en Rama Judicial», «con `secop_profile`». Los clientes que cargan herramientas bajo demanda las encuentran mejor si la instrucción usa las palabras del catálogo.',
    '**Dar el identificador exacto** con su formato: NIT sin dígito de verificación, radicado de 23 dígitos, número predial de 30, placa sin guiones.',
    '**Acotar con filtros** de tipo, año, fechas, sala, entidad o código territorial; el texto libre por sí solo produce resultados amplios ordenados por fecha.',
    '**Fijar el alcance**: cuántos resultados, si se debe leer el texto completo y de cuáles.',
    '**Definir la salida**: columnas, orden, fecha de corte (`as_of` o `checked_at`) y enlace oficial de cada registro.',
    '**Conservar el idioma de la fuente** en nombres, estados y términos legales.',
    '**Declarar la finalidad y la base legal** cuando la consulta involucre personas naturales.',
    '**Prescribir el manejo de casos límite**: `found: false` como respuesta definitiva, refinamiento ante «too many results», un reintento ante fallas de la fuente.',
    '**Para alertas**, decir qué vigilar, dónde y a quién avisar, y si se quiere correo solo cuando haya novedades.',
  ]));
  out.push(H2('6.2', 'Plantilla de instrucción'));
  out.push(...caja([
    '**Rol:** Eres un analista que usa las herramientas de Croma (datos oficiales de Colombia).',
    '**Fuente:** [familia] mediante [herramienta, si se conoce].',
    '**Sujeto:** [identificador exacto y su tipo].',
    '**Filtros:** [tipo · año · rango de fechas · sala o entidad · código DIVIPOLA].',
    '**Alcance:** máximo [N] resultados; lee el texto completo solo de [criterio], por rangos.',
    '**Salida:** tabla con [columnas]; incluye `as_of` o `checked_at` y el enlace oficial de cada fila.',
    '**Reglas:** no traduzcas nombres, estados ni términos legales; `found: false` es una respuesta definitiva; ante «too many results», refina con [criterio]; ante una falla de la fuente, reintenta una vez y repórtala.',
    '**Finalidad y base legal:** [descripción], cuando haya datos de personas naturales.',
  ]));
  out.push(H2('6.3', 'De instrucciones débiles a instrucciones efectivas'));
  out.push(...tabla({
    titulo: 'Ejemplos de instrucciones débiles y mejoradas',
    anchos: [3.4, 7.4, 3.2],
    cabecera: ['Instrucción débil', 'Instrucción mejorada', 'Por qué funciona'],
    size: 17,
    filas: [
      ['«Busca demandas contra Rappi.»', '«Con Croma, busca en Rama Judicial procesos de la persona jurídica “RAPPI S.A.S.” con actividad en los últimos 30 días; devuelve radicado, despacho, partes y última actuación.»', 'Evita el exceso de coincidencias (T01) y fija la salida.'],
      ['«¿Qué ha dicho la Corte sobre habeas data?»', '«En la Corte Constitucional, busca sentencias tipo T de 2024 y 2025 sobre “habeas data” y “centrales de riesgo”; máximo cinco; para cada una da número, fecha, ponente y decisión; luego lee completa la más pertinente.»', 'Filtra, limita el contexto y separa búsqueda de lectura.'],
      ['«Revisa a esta empresa.»', '«Haz el KYB del NIT 860051894: RUES, Supersociedades o SIMEV, SECOP y comercio exterior; señala inconsistencias de datos y la fecha de corte de cada fuente.»', 'Encadena fuentes y exige control de calidad.'],
      ['«¿Cuánto vale este lote?»', '«Consulta el predio del IGAC en la latitud 5,6395 y longitud −73,5168; dame avalúo, áreas, destino y el valor del suelo de su zona geoeconómica; indica si el catastro está desactualizado.»', 'Usa coordenadas y pide el contexto que explica el avalúo.'],
      ['«Avísame de contratos nuevos.»', '«Vigila en SECOP II los contratos nuevos con el NIT 900123456 y mándame un correo cada lunes a las 8 a legal@empresa.com, solo cuando haya algo nuevo.»', 'Define endpoint, frecuencia, destinatario y modo de aviso.'],
    ],
  }));
  out.push(H2('6.4', 'Instrucciones para monitores'));
  out.push(P(`La documentación propone formulaciones que el agente traduce directamente a \`create_monitor\`: «Avísame cuando la ANM publique algo sobre el título AD9-111. Envíalo a legal@empresa.com.»; «Vigila en SECOP II los contratos nuevos con el NIT 900123456 y mándame un correo cada lunes a las 8.»; «Avísame cuando la Corte Constitucional publique una sentencia sobre habeas data, solo las de tutela.» y «Pausa mi monitor de AD9-111.».${F('monmcp', 'sección «Pídelo»')} Recuérdese que en la organización de prueba la función estaba en beta privada (T46).`));
  out.push(...cita('Sé exacto con lo que quieres vigilar. Un identificador (una placa, un NIT, un radicado) da un monitor preciso; el texto libre también sirve y trae más.', C('monmcp')));
  out.push(H2('6.5', 'Indicaciones para integradores por REST'));
  out.push(...vinetas([
    'Enviar siempre `Authorization: Bearer` con una llave de organización y `Content-Type: application/json`; todas las rutas de datos son POST.',
    'Manejar tanto `200` como `202`: con `Prefer: wait=N` (máximo 55 s) se controla la espera, con `Prefer: wait=0` se pasa a polling y con `callback_url` a webhook firmado con HMAC.',
    'Enviar `Idempotency-Key` para correlacionar reintentos y registrar `X-Request-Id` para soporte.',
    'Leer `Deprecation`, `Sunset` y `Link` en cada respuesta para detectar retiros el mismo día del anuncio.',
    'No depender de los encabezados `X-RateLimit-*`: el limitador falla abierto y pueden faltar.',
    'Respetar `Retry-After` ante `429` y reintentar los `5xx` con espera exponencial.',
  ]));

  // ── VII. Limitaciones ──────────────────────────────────────────────
  out.push(H1('VII', 'LIMITACIONES Y RIESGOS', { nuevaPagina: true }));
  out.push(P('Esta sección reúne 25 limitaciones: 12 de diseño, declaradas en la documentación, y 13 observadas en las pruebas. Se complementa con un inventario de defectos de calidad de datos y con los riesgos jurídicos del tratamiento.'));
  out.push(H2('7.1', 'Limitaciones de diseño documentadas'));
  out.push(...tabla({
    titulo: 'Limitaciones de diseño declaradas por Croma',
    anchos: [0.8, 5.0, 4.6, 3.6],
    cabecera: ['#', 'Limitación', 'Consecuencia', 'Mitigación'],
    alinear: [CEN],
    size: 17,
    filas: [
      ['D1', 'Cobertura cerrada al catálogo publicado; la Agent Skill pide no adivinar endpoints.', 'Registros no listados (p. ej. certificados de libertad y tradición) no están disponibles.', 'Contrastar el caso de uso con el catálogo antes de diseñar.'],
      ['D2', 'Lote disponible solo para Rama Judicial por radicado.', 'Las demás consultas masivas requieren iterar.', 'Paralelizar con control de cupo y caché propia.'],
      ['D3', 'Espera en línea de máximo 55 s por REST.', 'Las consultas lentas devuelven 202.', 'Implementar polling o callback.'],
      ['D4', 'Topes horarios en herramientas web, de extracción e investigación.', 'Limitan agentes intensivos en web.', 'Diseñar con el límite más estricto (ver D12 y O13).'],
      ['D5', 'Créditos no acumulables y sin pago por uso.', 'Al agotarse, todo responde 402 hasta el reinicio.', 'Monitorear el saldo y escalar de plan.'],
      ['D6', 'Monitores: 20 por organización, 3 destinatarios, 500 filas por ejecución, sin superar la frecuencia de la fuente.', 'No sirven para vigilancias masivas.', 'Usar la API y un planificador propio para gran escala.'],
      ['D7', 'Conexiones: máximo 5 por fuente y cupo diario; DIAN solo años cerrados.', 'Capacidad diaria limitada por titular.', 'Registrar varias conexiones autorizadas.'],
      ['D8', 'El IGAC excluye Bogotá, Medellín, Cali, Barranquilla y Antioquia.', 'Sin avalúo en los mayores mercados inmobiliarios.', 'Integrar los gestores catastrales propios.'],
      ['D9', 'Procuraduría devuelve el veredicto, no el detalle de sanciones.', 'No se conoce la sanción concreta.', 'Remitir al certificado oficial.'],
      ['D10', 'RUNT por placa exige el documento del propietario activo.', 'Sin documento, solo hay historial o consulta del ciudadano.', 'Elegir la consulta según el dato disponible y la base legal.'],
      ['D11', 'Consejo de Estado partido en dos corpus (antes y después de diciembre de 2021).', 'Una sola búsqueda no cubre toda la jurisprudencia.', 'Consultar ambos corpus.'],
      ['D12', 'Deprecaciones con fecha: SECOP `*_by_*` y SIATA v1 dejan de responder el 1-dic-2026; el plan Free baja a 1.500 créditos el 15-oct-2026.', 'Integraciones antiguas fallarán con 410; los pilotos gratuitos se reducen.', 'Migrar a los sucesores y presupuestar créditos.'],
    ],
    nota: 'Fuentes: Agent Skill, MCP, trabajos asíncronos, lotes, créditos, límites, monitores, guías por fuente, versionado y precios (Croma, 2026).',
  }));
  out.push(H2('7.2', 'Limitaciones observadas en las pruebas'));
  out.push(...tabla({
    titulo: 'Limitaciones observadas en las 61 pruebas en vivo',
    anchos: [0.8, 5.6, 1.8, 5.8],
    cabecera: ['#', 'Observación', 'Prueba', 'Impacto y mitigación'],
    alinear: [CEN, null, CEN],
    size: 17,
    filas: [
      ['O1', 'Rezagos de 16 a 39 días en cinco datasets (modificaciones y planes de SECOP, SAMAI, SIMEV, actos de la SIC).', 'T24, T28, T04, T13, T43', 'Alertas tardías; mostrar siempre `as_of` y advertir cuando supere un umbral.'],
      ['O2', 'Dataset de insolvencias no disponible en dos intentos, pese a la promesa de disponibilidad de los datasets.', 'T17, T58', 'Diseñar degradación elegante y rutas alternativas (Baranda).'],
      ['O3', 'El texto libre coincide de forma amplia y ordena por fecha, no por relevancia.', 'T02, T16, T38, T40', 'Filtrar y, si hace falta, re-rankear con un modelo propio.'],
      ['O4', 'Consultas de varias palabras pueden exigir todas y devolver cero.', 'T43', 'Simplificar y ampliar progresivamente.'],
      ['O5', 'Nombres genéricos en Rama Judicial devuelven «too many matches».', 'T01', 'Razón social exacta y `active_only`.'],
      ['O6', 'Respuestas muy extensas: resolutivas completas en búsquedas y providencias sin paginar.', 'T02, T61', 'Paginación corta y lectura por partes.'],
      ['O7', 'La vista viva de SECOP puede ir detrás de la copia de Croma.', 'T44', 'Usar `*_record` como respaldo.'],
      ['O8', 'NIT de entidades con o sin dígito de verificación pegado.', 'T26', 'Probar ambas variantes o partir de `secop_profile`.'],
      ['O9', 'Extracción y generación fallan en gov.co; el esquema no admite uniones de tipo.', 'T52', 'Usar la ficha SUIT y esquemas simples.'],
      ['O10', 'Monitores no habilitados en la organización (beta privada).', 'T46', 'Solicitar acceso o programar con la API.'],
      ['O11', 'La relatoría del Consejo de Estado responde con claves en español.', 'T07', 'Normalizar con un adaptador.'],
      ['O12', 'El detalle del Consejo de Estado llega con metadatos nulos.', 'T61', 'Conservar los metadatos de la fila de búsqueda.'],
      ['O13', 'Documentación inconsistente en topes horarios y cifras de cobertura.', '—', 'Asumir el escenario más estricto y confirmar con soporte.'],
    ],
  }));
  out.push(H2('7.3', 'Calidad de los datos'));
  out.push(P('Croma devuelve los registros como la fuente los publica; la propia política de versionado aclara que lo que una fuente publica no es un cambio de la API.' + F('version', 'sección «Lo que esto no cubre»') + ' Por eso los defectos de origen llegan intactos y el control de calidad es responsabilidad del producto.'));
  out.push(...tabla({
    titulo: 'Defectos de calidad de datos observados y control recomendado',
    anchos: [3.2, 6.0, 1.6, 3.2],
    cabecera: ['Fuente', 'Defecto observado', 'Prueba', 'Control'],
    alinear: [null, null, CEN],
    size: 17,
    filas: [
      ['SECOP sanciones', 'Registros de prueba de la plataforma («Z ENTIDAD DE PRUEBA», multas de 50 pesos).', 'T27', 'Lista de exclusión.'],
      ['SECOP modificaciones', 'Valores de adición imposibles (2,88 × 10¹⁷ pesos) que dominan el orden por valor.', 'T24', 'Topes de plausibilidad.'],
      ['SECOP proveedores y planes', 'Correos y documentos incoherentes; tildes y letras perdidas.', 'T23, T28', 'Normalización de texto.'],
      ['RUES', 'Direcciones nulas y cifras financieras atípicas.', 'T11', 'Reglas contables de coherencia.'],
      ['Supersociedades', 'Empleados en cero; partes con documento «0000».', 'T21, T22', 'Tratar como dato faltante.'],
      ['SIATA', 'Valor centinela −999 clasificado como «Buena».', 'T49', 'Descartar valores negativos.'],
      ['Superfinanciera', 'Entidades HTML sin decodificar en descripciones.', 'T18', 'Decodificar HTML.'],
      ['Banco de la República', 'La TRM repite el último valor en días no hábiles.', 'T36', 'Usar solo días hábiles.'],
      ['Corte Constitucional', 'Texto íntegro que inicia truncado («tencia SU424/21»).', 'T57', 'Validar contra el enlace oficial.'],
    ],
  }));
  out.push(H2('7.4', 'Riesgos jurídicos y de cumplimiento'));
  out.push(...cita('Croma ejecuta la consulta contra la fuente oficial y te devuelve el registro; la finalidad y la base legal son tuyas.', C('co')));
  out.push(P(`Que un registro sea público no autoriza cualquier uso. La Ley 1581 de 2012 desarrolla el derecho de las personas a conocer, actualizar y rectificar la información que se haya recogido sobre ellas, define principios rectores, categorías especiales de datos y los deberes de responsables y encargados, y asigna su vigilancia a la Superintendencia de Industria y Comercio.${TF('T35', 'resumen oficial de la Ley 1581 de 2012 en el Gestor Normativo de Función Pública, consultado mediante `funcion_publica_norms_search`.')} Para un producto construido sobre Croma, de ello se derivan cuatro obligaciones prácticas: documentar la finalidad de cada consulta sobre personas naturales; limitar las verificaciones a las necesarias para esa finalidad; tratar con especial cuidado la información de salud (ADRES, RUAF) y los antecedentes; y conservar evidencia auditable de cada consulta, para lo cual sirven \`X-Request-Id\`, \`checked_at\` y los códigos de verificación que devuelven fuentes como la Contraloría.${F('contraloria', 'campo `verification_code`')}`));
  out.push(P(`En las conexiones, el usuario declara con \`authorized: true\` que es el titular de la cuenta o tiene su autorización; un producto que las ofrezca a terceros debe recabar y conservar esa autorización.${F('bancolombia', 'tabla de la solicitud de conexión')} Finalmente, las decisiones automatizadas basadas en antecedentes, afiliaciones o clasificación socioeconómica requieren intervención humana y explicabilidad, porque los defectos de calidad descritos pueden producir falsos positivos.`));

  // ── VIII. Productos ────────────────────────────────────────────────
  out.push(H1('VIII', 'PRODUCTOS QUE SE PUEDEN CONSTRUIR', { nuevaPagina: true }));
  out.push(P(`Croma organiza su propia oferta por verticales —bancos y fintech, aseguradoras, estudios de abogados, cobranza, compras y proveedores, y sector público— y por soluciones —verificación de empresas, screening de contrapartes, monitoreo judicial, verificación vehicular, contratación pública y monitoreo regulatorio—.${F('industries', 'secciones de industrias y soluciones')} A partir del inventario y de las pruebas, la Tabla siguiente propone catorce productos viables en Colombia.`));
  out.push(H2('8.1', 'Portafolio de productos'));
  out.push(...tabla({
    titulo: 'Portafolio de productos viables sobre Croma en Colombia',
    anchos: [3.4, 2.8, 4.3, 3.8, 1.9],
    cabecera: ['Producto', 'Usuario', 'Herramientas núcleo', 'Valor', 'Complejidad'],
    alinear: [null, null, null, null, CEN],
    size: 16,
    filas: [
      ['KYB/KYC express para originación', 'Fintech, cooperativas, bancos', 'RUES, Supersociedades, SIMEV, SECOP, SIC PI, Procuraduría, Contaduría, Rama Judicial', 'Ficha de contraparte en minutos y con evidencia', 'Media'],
      ['Vigilancia judicial de cartera', 'Bancos, cobranza, aseguradoras', 'Rama Judicial (lote), correos de despachos, Baranda, SICAAC', 'Alertas de actuaciones y contacto del despacho', 'Media'],
      ['Debida diligencia de contratistas', 'Compras corporativas, auditoría', 'SECOP (perfil, sanciones, oferentes), Procuraduría, Contraloría', 'Riesgo de proveedor con historial estatal', 'Baja'],
      ['Inteligencia de licitaciones', 'Empresas que venden al Estado', 'SECOP procesos, planes, adjudicaciones, oferentes', 'Oportunidades y competencia antes de licitar', 'Baja'],
      ['Observatorio anticorrupción', 'Periodismo, veedurías, órganos de control', 'SECOP modificaciones, oferentes, sanciones; Supersociedades vinculados', 'Detección de adiciones atípicas y baja competencia', 'Alta'],
      ['Due diligence inmobiliaria', 'Notarías, constructoras, banca hipotecaria', 'IGAC, SUIT (licencias), estadística municipal', 'Avalúo catastral, suelo y estado de actualización', 'Media'],
      ['Vigilancia marcaria', 'Firmas de propiedad intelectual', 'SIC Gaceta, marcas, resoluciones, portafolio por titular', 'Oposiciones a tiempo y control de vencimientos', 'Baja'],
      ['Asistente jurisprudencial con citas', 'Abogados, academia', 'Cortes, SAMAI, CNDJ, Relatoría Supersociedades, doctrina SFC', 'Respuestas con fuentes verificables', 'Media'],
      ['Monitor regulatorio sectorial', 'Cumplimiento financiero, energético, consumo', 'Superfinanciera, CREG, SIC, DIAN doctrina, Función Pública, Gaceta del Congreso', 'Novedades normativas filtradas por relevancia', 'Baja'],
      ['Suscripción y siniestros vehiculares', 'Aseguradoras, financieras de vehículos', 'RUNT (4), SIMIT', 'Estado técnico, prendas y multas por placa', 'Media'],
      ['Asistente ciudadano de trámites', 'Entidades, ciudadanía', 'SUIT, páginas de trámites, generación de JSON', 'Requisitos, costos y pasos en lenguaje claro', 'Baja'],
      ['Inteligencia territorial y ESG', 'Planeación, inversión de impacto', 'DANE, TerriData, ICFES, MinEducación, IGAC, SIATA', 'Diagnóstico municipal comparable', 'Media'],
      ['Cumplimiento farmacéutico', 'Droguerías, distribuidores, EPS', 'INVIMA registros y CUM', 'Bloqueo de productos vencidos o inactivos', 'Baja'],
      ['Asistente tributario del contribuyente', 'Personas, contadores', 'DIAN MUISCA (facturas, exógena), Bancolombia, doctrina DIAN', 'Conciliación previa a la declaración de renta', 'Alta'],
    ],
    nota: 'Complejidad estimada según número de fuentes, necesidad de control de calidad, sensibilidad de los datos y dependencia de funciones en beta o de conexiones.',
  }));
  out.push(H2('8.2', 'Prototipo 1: KYB express para originación de crédito'));
  out.push(P('**Problema.** Un analista de crédito empresarial dedica horas a recorrer portales para conocer a una contraparte. **Flujo.** Con el NIT, el agente ejecuta la cadena KYB de la sección 5.4, consolida una ficha con registro mercantil, finanzas, socios, contratación estatal, marcas, antecedentes y procesos, y marca inconsistencias y fechas de corte. **Costo.** 54 créditos por empresa: con el plan Standard (100.000 créditos, 99 dólares) alcanza para unas 1.850 fichas al mes, alrededor de 0,05 dólares por ficha. **Arquitectura.** Para analistas, Claude con el servidor MCP y una instrucción de sistema basada en la plantilla 6.2; para volumen, un servicio REST que guarde la evidencia y el `X-Request-Id` de cada consulta. **Riesgos.** Calidad de datos del RUES y de Supersociedades, y tratamiento de los datos de administradores y socios personas naturales.'));
  out.push(H2('8.3', 'Prototipo 2: Vigilancia judicial de cartera'));
  out.push(P('**Problema.** Una entidad de crédito necesita saber cuándo se mueve cada proceso de cobro. **Flujo.** Los radicados de la cartera se consultan en lotes de 50; cada actuación nueva se compara con la última conocida y se notifica con el correo del despacho competente. **Costo.** Una revisión diaria cuesta unos 300 créditos por radicado al mes: el plan Standard cubre unos 330 radicados en vigilancia diaria y el Scale, unos 3.300; con revisión semanal la capacidad se multiplica por cuatro. **Arquitectura.** Planificador propio sobre la API (los monitores están en beta) y almacenamiento del historial de actuaciones. **Riesgos.** Procesos reservados (`private_only`) y nombres de demandados como datos personales.'));
  out.push(H2('8.4', 'Prototipo 3: Inteligencia de contratación pública'));
  out.push(P('**Problema.** Las empresas que venden al Estado se enteran tarde de las oportunidades y no conocen a su competencia. **Flujo.** Una búsqueda diaria de procesos por objeto, código UNSPSC y departamento detecta oportunidades abiertas; para cada una, el agente perfila a la entidad compradora y a los oferentes históricos, y revisa el plan anual de adquisiciones para anticipar compras. **Costo.** Al tratarse de datasets, cada búsqueda cuesta un crédito: el seguimiento de cien criterios diarios consume unos 3.000 créditos al mes. **Riesgos.** Rezagos en planes y modificaciones y registros de prueba en sanciones (sección 7.3).'));
  out.push(H2('8.5', 'Prototipo 4: Asistente jurisprudencial y regulatorio'));
  out.push(P('**Problema.** La investigación jurídica exige citas exactas y fuentes vigentes. **Flujo.** El asistente busca con filtros en los corpus de la Corte Constitucional, la Corte Suprema, SAMAI y la Relatoría de Supersociedades; abre por rangos solo las providencias pertinentes; contrasta con la norma vigente del Gestor Normativo y con la doctrina de la Superfinanciera o de la DIAN, y responde con número, fecha, ponente y enlace oficial. **Costo.** Unos 14 créditos por consulta compleja. **Riesgos.** Ordenamiento por fecha y no por relevancia, textos truncados y saturación del contexto; se mitigan con filtros, re-ranking propio y lectura por partes.'));
  out.push(H2('8.6', 'Economía de créditos por plan'));
  out.push(...tabla({
    titulo: 'Capacidad mensual por plan para los prototipos',
    anchos: [2.2, 1.8, 2.6, 2.6, 2.8, 2.6],
    cabecera: ['Plan', 'USD / mes', 'Créditos', 'Fichas KYB (54)', 'Radicados diarios (300)', 'USD por ficha KYB'],
    alinear: [null, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT],
    filas: [
      ['Free (desde 15-oct)', '0', '1.500', '27', '5', '—'],
      ['Hobby', '20', '20.000', '370', '66', '0,054'],
      ['Standard', '99', '100.000', '1.851', '333', '0,053'],
      ['Pro', '299', '350.000', '6.481', '1.166', '0,046'],
      ['Scale', '799', '1.000.000', '18.518', '3.333', '0,043'],
    ],
    nota: 'Cálculo propio con los precios publicados y los costos de la sección 5.4; no incluye el ahorro por caché ni los impuestos.',
  }));
  out.push(H2('8.7', 'Arquitectura de referencia para construir sobre Croma'));
  out.push(...vinetas([
    '**Orquestación.** Claude u otro cliente MCP para analistas y prototipos; un backend REST, n8n o Make para procesos programados y volumen.',
    '**Persistencia propia.** Guardar cada respuesta con su `as_of`, `checked_at`, `X-Request-Id` y enlace oficial: es la evidencia de cumplimiento y evita repetir consultas.',
    '**Capa de calidad.** Reglas de plausibilidad, listas de exclusión, normalización de NIT y texto, y descarte de valores centinela antes de cualquier decisión.',
    '**Capa de cumplimiento.** Registro de finalidad, base legal y autorización por consulta sobre personas naturales, con minimización de la evidencia almacenada.',
    '**Resiliencia.** Manejo de 202, reintentos idempotentes, degradación elegante ante datasets no disponibles y vigilancia de los encabezados de deprecación.',
  ]));

  // ── IX. Conclusiones ───────────────────────────────────────────────
  out.push(H1('IX', 'CONCLUSIONES', { nuevaPagina: true }));
  out.push(...numerada([
    '**Croma es una capa de normalización, no solo un conector.** Su valor central es la forma común de respuesta, el contrato de errores y la exposición simultánea como API y como herramientas MCP, que convierten 172 endpoints colombianos en una sola superficie de integración.',
    '**El modo de respuesta es la variable que más pesa en el diseño.** Los 107 endpoints de dataset cuestan una décima parte, responden en milisegundos y toleran caídas de la fuente; los 59 en vivo dan la información del momento a mayor costo. Elegir bien entre ambos es el principal atajo económico.',
    '**La frescura debe gestionarse explícitamente.** La mayoría de los datasets estaba al día, pero cinco presentaban rezagos de 16 a 39 días; todo producto de alertas debe mostrar `as_of` y advertir los retrasos.',
    '**La calidad de los datos es responsabilidad del producto.** Registros de prueba, valores imposibles, centinelas y textos truncados llegan tal como los publica la fuente; sin una capa de control, las conclusiones automáticas serán frágiles.',
    '**La pertinencia de las búsquedas se construye con filtros e identificadores.** El texto libre coincide de forma amplia y ordena por fecha; los identificadores exactos y los filtros estructurados son los atajos más eficaces.',
    '**Para agentes, el límite real es el contexto.** Paginación corta, lectura por rangos y separación entre búsqueda y lectura evitan que respuestas extensas desplacen el razonamiento.',
    '**La documentación es buena, pero no perfecta.** Hay contradicciones sobre topes horarios y cifras de cobertura, un dataset indisponible pese a la promesa de disponibilidad y monitores aún en beta privada; conviene diseñar con el escenario más estricto.',
    '**El portafolio viable es amplio y de bajo costo unitario.** Una ficha KYB completa cuesta unos 54 créditos (alrededor de 0,05 dólares) y la vigilancia diaria de un radicado unos 300 créditos al mes; la restricción no es económica sino de calidad, frescura y cumplimiento.',
    '**La base legal no se terceriza.** Croma consulta registros públicos y traslada al usuario la finalidad y la base legal; los productos sobre personas naturales deben documentar ambas y conservar evidencia auditable.',
  ]));
  out.push(firma('Josué Ricardo Rojas Silva'));

  // ── Referencias ────────────────────────────────────────────────────
  out.push(H1(null, 'Referencias', { nuevaPagina: true }));
  out.push(...referencias(REFS));

  // ── Anexo A ────────────────────────────────────────────────────────
  out.push(H1(null, 'ANEXO A. ESPECIFICACIONES DE FORMA DEL DOCUMENTO', { nuevaPagina: true }));
  out.push(P('Este anexo documenta la estructura formal con la que se compuso el informe, en el formato de especificación solicitado, para que pueda recrearse en otros documentos. No se recibió un PDF adicional para analizar; por ello se describe la estructura de este mismo documento, construida a partir de la especificación entregada.'));
  out.push(...caja([
    'especificaciones_docx = {',
    '  "fuente": "Times New Roman — en todo el documento (incluidos diagramas, tablas y notas)",',
    '  "tamano_fuente": { "titulo_principal": "17 pt", "autor": "12 pt", "subtitulo_inicial": "12 pt", "encabezado_seccion": "13 pt", "subseccion": "12 pt", "cuerpo": "11,5 pt", "tablas": "8 a 9 pt", "leyendas_figuras_tablas": "10 pt", "citas_destacadas": "11,5 pt", "referencias": "10,5 pt", "notas_al_pie": "9 pt", "encabezado_y_pie": "9 pt" },',
    '  "color_fuente": "Negro — #000000 (el color se reserva a la semántica de los diagramas)",',
    '  "estilo_titulo_principal": "Negrita | Mayúsculas y minúsculas | Centrado | Espaciado superior amplio",',
    '  "estilo_autor": "Regular | Centrado | Espaciado inferior medio",',
    '  "estilo_subtitulo_inicial": "Cursiva | Centrado",',
    '  "estilo_encabezados_seccion": "Negrita | Numeración romana con punto (I., II., …) | Mayúsculas sostenidas | Izquierda | Nueva página",',
    '  "estilo_subsecciones": "Negrita | Formato «2.1 — Título» | Izquierda",',
    '  "estilo_cuerpo": "Regular | Justificado | Interlineado 1,15 | 6 pt después de cada párrafo | Sin sangría de primera línea",',
    '  "citas_destacadas": "Centradas | Sangría de 1,5 cm a ambos lados | Entre comillas angulares | Cursiva | 14 pt antes y después | Referencia APA debajo: (Autor, año, «encabezado»). Enlace",',
    '  "notas_al_pie": "Una por afirmación sustantiva: fuente exacta (página y sección) o prueba en vivo (Anexo C)",',
    '  "figuras": "Rótulo «Figura N.» en negrita y título en cursiva arriba | Diagrama vectorial SVG con respaldo PNG | Nota de fuente debajo",',
    '  "tablas": "Rótulo «Tabla N.» arriba | Encabezado con fondo gris claro y fila repetida | Bordes finos grises | Nota debajo",',
    '  "referencias": { "titulo": "«Referencias» en negrita, izquierda", "formato": "APA simplificado", "sangria": "francesa de 1,25 cm", "interlineado": "1,15", "alineacion": "izquierda" },',
    '  "margenes": "2,5 cm en los cuatro lados", "pagina": "Carta — 21,59 × 27,94 cm",',
    '  "encabezado": "Cuadernos LegalTech Colombia · Informe técnico · categoría · fecha (9 pt, centrado)",',
    '  "numeracion_paginas": "Inferior centrada — «Página X de Y»", "pie_pagina": "Sin otro texto",',
    '  "estructura": ["Encabezado editorial", "Título", "Autor", "Subtítulo", "Abstract y palabras clave", "Tabla de contenido con páginas", "Introducción sin numeración", "Secciones I a IX", "Subsecciones 1.1 …", "Citas destacadas", "Conclusiones", "Firma —Nombre—", "Referencias", "Anexos A a D"],',
    '  "espaciado": { "entre_titulo_y_autor": "medio", "entre_secciones": "amplio (nueva página)", "entre_parrafos": "moderado", "antes_citas": "amplio", "antes_referencias": "amplio" },',
    '  "elementos_especiales": ["Mayúsculas sostenidas en encabezados conceptuales", "Separadores mediante espacio, sin líneas", "Firma final centrada entre guiones largos"]',
    '}',
  ]));

  // ── Anexo B ────────────────────────────────────────────────────────
  out.push(H1(null, 'ANEXO B. REPORTE DE VALIDACIÓN DE LOS DIAGRAMAS', { nuevaPagina: true }));
  out.push(P('Cada diagrama se modeló como grafo y se validó con el motor del §9 antes de renderizarse (REGLA_02). La Tabla siguiente resume los chequeos; la columna de contraste refleja la verificación AA con el color de texto elegido para cada categoría, y la letra efectiva es el tamaño de la letra del diagrama una vez ajustado a la página.'));
  out.push(...tabla({
    titulo: 'Validación §9 de los 17 diagramas',
    anchos: [0.9, 3.6, 1.15, 1.25, 1.7, 1.25, 1.0, 1.7, 1.15, 3.6],
    cabecera: ['Id', 'Diagrama', 'Nodos', 'Aristas', 'Decisiones', 'Errores', 'DAG', 'Huérfanos', 'Letra (pt)', 'Veredicto'],
    alinear: [CEN, null, CEN, CEN, CEN, CEN, CEN, CEN, CEN, CEN],
    size: 15,
    filas: diags.map((d) => {
      const v = d.validacion;
      return [d.clave, d.titulo, v.n_nodos, v.n_aristas, v.n_decisiones, v.rutas_error, v.es_dag ? 'Sí' : 'No', v.checks.recursos_huerfanos.length,
        String(v.layout.letra_efectiva_pt).replace('.', ','), v.veredicto];
    }),
    nota: 'En los 17 diagramas: cero nodos no alcanzables, cero nodos sin terminal, cero decisiones incompletas, cero aristas colgantes, cero nodos aislados, cero recursos faltantes y cero violaciones de la regla de dependencia. Los diagramas no DAG (D00, D01, D10) contienen ciclos intencionales de reintento o polling.',
  }));
  out.push(...tabla({
    titulo: 'Checklist bloqueante del §14',
    anchos: [1.6, 7.6, 1.6, 3.2],
    cabecera: ['Chequeo', 'Criterio', 'Estado', 'Detalle'],
    alinear: [CEN, null, CEN],
    size: 17,
    filas: [
      ['CHECK_01', 'Todo nodo alcanzable y con salida a terminal', 'Cumple', '17/17 diagramas'],
      ['CHECK_02', 'Toda decisión con ramas etiquetadas completas', 'Cumple', '≥ 2 ramas por rombo'],
      ['CHECK_03', 'Cero aristas colgantes y nodos aislados', 'Cumple', 'Validado por §9'],
      ['CHECK_04', 'Todo recurso referenciado existe; huérfanos reportados', 'Cumple', '0 faltantes, 0 huérfanos'],
      ['CHECK_05', 'Regla de dependencia de Clean Architecture', 'Cumple', 'Sin violaciones'],
      ['CHECK_06', 'Rutas de error presentes', 'Cumple', 'Entre 1 y 5 por diagrama'],
      ['CHECK_07', 'Leyenda completa y contraste AA', 'Cumple', 'Texto blanco o negro según fondo'],
      ['CHECK_08', 'Render vectorial, retícula y proporción', 'Cumple', 'SVG con respaldo PNG'],
      ['CHECK_09', 'Tabla de recursos con remisiones', 'Cumple', 'Una por diagrama'],
      ['CHECK_10', 'Sección de objetivos y explicación', 'Cumple', 'Debajo de cada diagrama'],
      ['CHECK_11', 'Ningún componente inventado; supuestos declarados', 'Cumple', 'Supuestos en «Riesgos y supuestos»'],
      ['CHECK_12', 'Veredicto APROBADO_RENDER antes de emitir', 'Cumple', '17/17'],
    ],
  }));
  const cats = diags[0].validacion.contraste_texto_elegido;
  const todas = {};
  for (const d of diags) Object.assign(todas, d.validacion.contraste_texto_elegido);
  out.push(...tabla({
    titulo: 'Contraste de la paleta semántica con el color de texto elegido',
    anchos: [4.4, 2.4, 2.4, 2.4, 2.4],
    cabecera: ['Categoría', 'Fondo', 'Texto', 'Razón de contraste', 'AA (≥ 4,5)'],
    alinear: [null, CEN, CEN, CEN, CEN],
    size: 17,
    filas: Object.entries(todas).map(([k, v]) => [k.replace(/_/g, ' '), v.fondo, v.texto, String(v.ratio).replace('.', ','), v.pasa ? 'Cumple' : 'No cumple']),
    nota: 'El chequeo original del §9 evalúa texto blanco y marca como advertencia las categorías claras; la selección automática del color de texto resuelve la advertencia sin alterar la paleta.',
  }));
  void cats;

  // ── Anexo C ────────────────────────────────────────────────────────
  out.push(H1(null, 'ANEXO C. REGISTRO DE PRUEBAS EN VIVO', { nuevaPagina: true }));
  out.push(P('Pruebas ejecutadas el 12 de octubre de 2026 mediante el servidor MCP de Croma. Las entradas que identificarían a personas naturales se omiten; los resultados se resumen sin reproducir datos personales.'));
  const pruebas = [
    ['T01', 'rama_judicial_cases_by_entity', 'RAPPI · jurídica · active_only', 'Error «Too many matches»; sugiere nombre más específico o actividad de 30 días.'],
    ['T02', 'corte_constitucional_rulings_search', 'habeas data · T · 2025 · 3', '91 resultados; orden por fecha; cada resultado trae la parte resolutiva completa.'],
    ['T03', 'corte_suprema_rulings_search', 'responsabilidad contractual · civil · 2026', '59 resultados ligeros; `registration_digits` normalizado; `as_of` 2026-10-11.'],
    ['T04', 'samai_rulings_search', 'reparación directa · 2026', 'Total aproximado con tope de 1.000; fichas con tesis; `as_of` 2026-09-18.'],
    ['T05', 'rama_judicial_cases_by_entity', 'Razón social exacta · active_only', 'RAPPI S.A.S.: 0 activos (sin filtro, exceso); Banco Finandina S.A.: 6 procesos.'],
    ['T06', 'cndj_rulings_search', 'apropiación de dineros del cliente', '219 resultados en vivo; claves en español; paginación por `limit`.'],
    ['T07', 'consejo_estado_search', 'statute; luego demandado SIC + fechas', '0 con solo `statute`; 37 con filtros combinados; claves en español.'],
    ['T08', 'rama_judicial_emails_by_court', 'radicado de 23 dígitos', 'Buzón del Juzgado 01 Civil del Circuito de Bogotá; `as_of` 2026-10-05.'],
    ['T09', 'rama_judicial_cases_by_radicado_batch', '1 radicado real + 1 inexistente', '200; un ítem con 6 actuaciones y otro con `found: false`; resumen 2/2.'],
    ['T10', 'rama_judicial_emails_search', 'Ibagué · civil · despacho', '23 buzones.'],
    ['T11', 'rues_entity_by_nit', '860051894', 'Matrícula activa desde 1977; EEFF 2013–2026 con valores atípicos; direcciones nulas.'],
    ['T12', 'supersociedades_largest_companies_search', 'sin filtros · 5', 'Año fiscal 2025; Ecopetrol primero con ingresos de 100,59 billones.'],
    ['T13', 'simev_shareholders', '860051894', '5 accionistas al corte 2026-06-30; 19 cortes desde 2017; `as_of` 2026-09-21.'],
    ['T14', 'dian_trade_profile', '899999068', 'Importador y exportador número 1 de 2017 a 2026.'],
    ['T15', 'supersociedades_filing_ownership', '900276962', 'Tres accionistas, una subordinada, administradores con documento.'],
    ['T16', 'supersociedades_baranda_decisions_search', '«desestimación de la personalidad jurídica»', '226 resultados encabezados por autos de inadmisión.'],
    ['T17', 'supersociedades_insolvency_processes_search', 'reorganización con y sin fechas', '0 con fechas de admisión; «temporarily unavailable» sin fechas.'],
    ['T18', 'superfinanciera_regulations_search', 'SARLAFT · circular externa', '6 circulares; entidades HTML en descripciones.'],
    ['T19', 'dian_doctrina_search', 'factura electrónica requisitos · Conceptos', '153 resultados en vivo; `capped: false`.'],
    ['T20', 'superfinanciera_doctrine_search', 'seguros no autorizados en tarjeta · fallos', '466 fallos jurisdiccionales.'],
    ['T21', 'supersociedades_companies_search', 'construcción · Antioquia', '461 sociedades con razones financieras; empleados en cero.'],
    ['T22', 'supersociedades_relatoria_documents_search', 'acción social de responsabilidad · sentencias', '672 resultados; partes con documento «0000».'],
    ['T23', 'secop_profile', '860051894', 'Proveedor registrado sin contratos; datos de contacto incoherentes.'],
    ['T24', 'secop_modifications_search', '2026 · value_desc', '`as_of` 2026-09-03; adiciones de 2,88 × 10¹⁷ pesos.'],
    ['T25', 'secop_processes_search', 'software e IA · no adjudicados · desde sept.', '5 procesos abiertos, uno para suscribir una herramienta de IA.'],
    ['T26', 'secop_contracts_search', 'NIT de entidad con y sin DV; texto', '0 y 0 por NIT; 6 por texto (entidad como contratista).'],
    ['T27', 'secop_sanctions_search', '2026', '12 registros, varios de prueba de la plataforma.'],
    ['T28', 'secop_plans_search', 'inteligencia artificial · 2026', '13 planes; `as_of` 2026-09-07; caracteres perdidos.'],
    ['T29', 'igac_cadastral_managers', 'Villa de Leyva', 'Gestor IGAC.'],
    ['T30', 'igac_property_by_point', 'Plaza principal de Villa de Leyva', '`found: false` (espacio público).'],
    ['T31', 'igac_municipal_statistics', '15407 · urbano', '9 años; catastro desactualizado desde 2013.'],
    ['T32', 'invima_medicines_search', 'ACETAMINOFEN · activo', 'Tope de 1.000 presentaciones.'],
    ['T33', 'igac_properties_search', '15407 · comercial · urbano', '139 predios con áreas y construcciones.'],
    ['T34', 'igac_property', 'número predial de 30 dígitos', 'Lookup `upstream`; avalúo de 133.255.000 pesos; polígono.'],
    ['T35', 'funcion_publica_norms_search', 'Ley 1581 de 2012', 'Norma 49981 con tres decretos reglamentarios enlazados.'],
    ['T36', 'banrep_series', 'serie 1 (TRM) desde 2026-10-01', '13 observaciones; valores repetidos en días no hábiles.'],
    ['T37', 'anm_notices_search', 'aviso · Medellín · 2026', '236 avisos con placas mineras.'],
    ['T38', 'imprenta_gaceta_documents_search', 'inteligencia artificial · proyecto', '23 documentos; el primero sobre presupuesto de regalías.'],
    ['T39', 'suit_procedures_search', 'licencia de construcción · 15407', '5 trámites con enlace a gov.co.'],
    ['T40', 'creg_acts_search', 'comunidades energéticas · resolución', '574 resultados por coincidencia amplia.'],
    ['T41', 'sic_ip_trademarks_search', 'RAPPI · Registrada', '15 marcas.'],
    ['T42', 'sic_sanctions_sanctions_search', 'comercio electrónico', '345 multas; la más reciente de mayo de 2026.'],
    ['T43', 'sic_actos_acts_search', 'varias palabras vs. dos palabras', '0 frente a 306 resultados en la misma ventana.'],
    ['T44', 'secop_contract y secop_contract_record', 'contrato firmado el 2026-09-30', 'Vista viva `found: false`; copia `found: true`.'],
    ['T45', 'dian_muisca_list_connections', '—', 'Sin conexiones.'],
    ['T46', 'list_monitors', '—', '`monitors_not_enabled` (beta privada).'],
    ['T47', 'dane_poverty', 'pobreza monetaria · nacional', '28,0 % en 2025.'],
    ['T48', 'terridata_indicators_search', 'índice de desempeño fiscal', '14 indicadores; índice antiguo hasta 2020 y nuevo desde 2020.'],
    ['T49', 'siata_geoportal_air_quality', 'Medellín', '15 estaciones; un valor centinela −999 clasificado como «Buena».'],
    ['T50', 'gov_pages_search', 'apostilla en línea · Cancillería', '5 páginas.'],
    ['T51', 'rues_entity_by_nit', '1234', '`found: false` con listas vacías.'],
    ['T52', 'generate_json y extract_json', 'ficha T81620 de gov.co', 'Esquema con unión de tipos rechazado; error interno con esquema simple y con esfuerzo máximo.'],
    ['T53', 'generate_json', 'pasos de apostilla en línea (Cancillería)', 'Seis pasos y tarifas extraídos correctamente.'],
    ['T54', 'research', '¿qué es Croma y cuánto cuesta?', 'Informe con ocho fuentes citadas, verificado contra la página de precios.'],
    ['T55', 'rama_judicial_cases_by_radicado', '«123»', 'Error MCP −32602 antes de consultar la fuente.'],
    ['T56', 'sic_ip_trademarks_by_owner', '860051894', '43 marcas, resuelto en línea pese a ser asíncrono.'],
    ['T57', 'corte_constitucional_ruling', 'SU-424/21 · limit 1.500', '337.817 caracteres totales; texto inicial truncado.'],
    ['T58', 'supersociedades_insolvency_processes_search', 'reintento', 'Persistió «temporarily unavailable».'],
    ['T59', 'icfes_saber11_schools_search', '05001 · 2022-2 · oficial', '221 colegios ordenados por puntaje.'],
    ['T60', 'siata_geoportal_alerts', '—', 'Sin alertas activas.'],
    ['T61', 'consejo_estado_providencia', 'permalink de la relatoría', '71.816 caracteres sin paginar; metadatos nulos.'],
  ];
  out.push(...tabla({
    titulo: 'Registro de las 61 pruebas',
    anchos: [0.9, 5.1, 3.8, 6.2],
    cabecera: ['Id', 'Herramienta', 'Entrada', 'Resultado'],
    alinear: [CEN],
    size: 15,
    filas: pruebas.map(([id, h, e, r]) => [id, `\`${h}\``, e, r]),
  }));

  // ── Anexo D ────────────────────────────────────────────────────────
  out.push(H1(null, 'ANEXO D. CATÁLOGO DE LOS 172 ENDPOINTS DE COLOMBIA', { nuevaPagina: true }));
  out.push(P('Listado completo de las herramientas MCP colombianas, agrupadas por dominio, con su modo de respuesta y si son asíncronas. La ruta REST de cada herramienta es `/co/{familia}/{endpoint}/v1`.'));
  const resumen = datos('resumen_dominios.json');
  const filas = [];
  for (const r of resumen) {
    filas.push([`**${r.dominio} · ${r.endpoints} endpoints**`, '', '', '']);
    const orden = (c) => r.familias.indexOf(c.familia);
    catalogo.map((c, i) => ({ ...c, i }))
      .filter((c) => c.dominio === r.dominio)
      .sort((a, b) => orden(a) - orden(b) || a.i - b.i)
      .forEach((c) => filas.push([`\`${c.tool}\``, c.familia, c.modo + (c.deprecated ? ' (deprecado)' : ''), c.async ? 'Sí' : '']));
  }
  const listados = filas.filter((f) => f[1]).length;
  if (listados !== catalogo.length) throw new Error(`Anexo D: ${listados} de ${catalogo.length} endpoints agrupados`);
  out.push(...tabla({
    titulo: 'Catálogo de endpoints colombianos',
    anchos: [7.6, 3.6, 2.6, 1.6],
    cabecera: ['Herramienta MCP', 'Familia', 'Modo', 'Asíncrono'],
    alinear: [null, null, CEN, CEN],
    size: 15,
    filas,
    nota: 'Elaboración propia a partir de la Agent Skill oficial y de la tabla de fuentes servidas desde dataset. Los endpoints de Supersociedades que la página de fuentes monitoreables trata como consulta en vivo (estados financieros, vinculados y notas) se clasifican aquí como dataset, según la página de datasets.',
  }));
  return out;
};
