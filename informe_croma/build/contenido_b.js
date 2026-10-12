/* Contenido B: sección IV — flujos de trabajo por fuente (D02–D16). */
const { F, TF } = require('./fuentes.js');
const { explicacion } = require('./contenido_a.js');

module.exports = function (x) {
  const { P, H1, H2, tabla, figura, datos, AlignmentType } = x;
  const diag = Object.fromEntries(datos('diagramas.json').map((d) => [d.clave, d]));
  const out = [];

  out.push(H1('IV', 'FLUJOS DE TRABAJO POR FUENTE DEL ESTADO COLOMBIANO', { nuevaPagina: true }));
  out.push(P('Esta sección ejecuta el Creador de Flujos de Trabajo sobre cada familia de fuentes colombianas. Cada subsección abre en página nueva y conserva la misma composición: primero el diagrama vectorial con su leyenda de color, y luego el contexto de la fuente, el objetivo, la lectura del flujo paso a paso, las decisiones clave, las rutas de error, los riesgos y supuestos, y la tabla de recursos con sus remisiones. Todos los diagramas superaron la compuerta de completitud del §9 (Anexo B).'));
  out.push(P('**Cómo leer los diagramas.** La forma indica la función del nodo (óvalo: inicio o fin; rombo: decisión; rectángulo: herramienta o proceso; rectángulo doble: subproceso; paralelogramo: entrada o salida; cilindro: almacén de datos; caja tridimensional: fuente externa). El color indica la categoría semántica según la paleta del MD, apta para daltonismo: azul para entradas y salidas, verde para herramientas, ámbar para decisiones, celeste para datos, magenta para modelos de IA, café para fuentes oficiales externas, bermellón para errores, índigo para control y orquestación, y verde oscuro para recursos de infraestructura. Las flechas grises son flujo, las bermellón son rutas de error y las índigo gruesas son remisiones («remite a»). Los códigos «rec. Rxx» dentro de cada nodo remiten a la tabla de recursos del flujo.'));
  out.push(...tabla({
    titulo: 'Correspondencia entre flujos, diagramas y familias de fuente',
    anchos: [1.2, 1.6, 5.1, 6.1, 1.6],
    cabecera: ['Flujo', 'Diagrama', 'Dominio', 'Familias de endpoint', 'Endpoints'],
    alinear: [AlignmentType.CENTER, AlignmentType.CENTER, null, null, AlignmentType.CENTER],
    size: 17,
    filas: [
      ['4.1', 'D02', 'Procesos judiciales', 'rama-judicial', '5'],
      ['4.2', 'D03', 'Jurisprudencia, disciplina judicial y procesos contencioso-administrativos', 'corte-constitucional, corte-suprema, consejo-estado, samai-rulings, cndj; samai (procesos, en el texto)', '10 + 3'],
      ['4.3', 'D04', 'Empresas y mercado de valores', 'rues, supersociedades, simev, dian-trade', '16'],
      ['4.4', 'D05', 'Insolvencia y litigio societario', 'supersociedades-baranda, supersociedades-relatoria', '14'],
      ['4.5', 'D06', 'Contratación pública', 'secop, ancp-cce', '18'],
      ['4.6', 'D07', 'Verificación de personas', 'registraduria, registro-civil, policia, procuraduria, contraloria, contaduria, adres, ruaf, dnp, sicaac, fiscalia', '12'],
      ['4.7', 'D08', 'Vehículos y tránsito', 'runt, simit', '5'],
      ['4.8', 'D09', 'Fuentes con sesión y factura electrónica', 'dian (documento electrónico), dian-muisca, bancolombia', '5'],
      ['4.9', 'D10', 'Regulación y normativa', 'funcion-publica, imprenta, superfinanciera, superfinanciera-doctrine, creg, dian (doctrina), sic-normativa', '19'],
      ['4.10', 'D11', 'Superintendencia de Industria y Comercio', 'sic-ip, sic-gazette, sic-sanctions, sic-actos, sic-tramites', '15'],
      ['4.11', 'D12', 'Catastro', 'igac', '15'],
      ['4.12', 'D13', 'Estadística y macroeconomía', 'dane, banrep, banrep-research, terridata, icfes, mineducacion', '14'],
      ['4.13', 'D14', 'Salud, minería y ambiente', 'invima, anm, siata, siata-geoportal', '17'],
      ['4.14', 'D15', 'Trámites y herramientas web', 'suit, gov-pages + herramientas globales', '4 + 6'],
      ['4.15', 'D16', 'Monitores (transversal)', '7 herramientas de gestión de monitores', '—'],
    ],
    nota: 'La suma de la columna de endpoints es 172. Los tres endpoints de procesos de SAMAI se describen en el texto del flujo 4.2 porque complementan la jurisprudencia, pero no se diagraman; el conteo por flujo puede diferir del conteo por dominio de la Tabla 11, que agrupa por institución.',
  }));

  const flujo = (num, clave, titulo, notaFig, contexto, e) => {
    out.push(H2(num, titulo, { nuevaPagina: true }));
    out.push(...figura(clave, `${diag[clave].titulo} (${clave})`, notaFig));
    out.push(P(`**Fuente y alcance.** ${contexto}`, { before: 120 }));
    out.push(...explicacion(x, diag[clave], e));
  };

  flujo('4.1', 'D02', 'Rama Judicial: procesos, lotes y correos de despachos',
    'Elaboración propia. Fuentes: guía de Rama Judicial, Agent Skill y pruebas T01, T05, T08, T09, T10 y T55.',
    `La Rama Judicial ofrece cinco endpoints: búsqueda de procesos por nombre de la parte, consulta por radicado con las primeras 40 actuaciones, la misma consulta en lote, y dos endpoints del directorio oficial de correos de despachos.${F('skill', 'entradas `rama_judicial_*`')} Las consultas de procesos son en vivo (10 créditos); el directorio de correos es un dataset semanal (1 crédito). Es la fuente sobre la que corre Croma Legal, el monitoreo que revisa más de cien mil procesos al día para bancos y entidades de crédito.${F('co', 'párrafo sobre Croma Legal')}`,
    {
      objetivo: diag.D02.objetivo + ' Es la base de productos de vigilancia judicial de cartera, cobranza y debida diligencia litigiosa.',
      pasos: [
        'Elegir la vía según el identificador disponible: nombre de la parte, un radicado, una lista de radicados o la necesidad de escribir al despacho.',
        `Por nombre, indicar si la parte es persona natural o jurídica y, con \`active_only\`, limitar la búsqueda a procesos con actividad en los últimos 30 días. Un nombre genérico devuelve «Too many matches»; la razón social exacta con \`active_only\` devuelve la lista.${TF('T01, T05', '«RAPPI» falló por exceso de coincidencias; «BANCO FINANDINA S.A.» con `active_only` devolvió 6 procesos con radicado, despacho y última actuación.')}`,
        'Cada caso de la lista remite a la consulta por radicado, que devuelve los metadatos del proceso y las 40 actuaciones más recientes, de la más nueva a la más antigua.',
        `Para carteras, el lote resuelve hasta 50 radicados en una sola llamada: valida todos los formatos antes de ejecutar y entrega un resultado por ítem con un resumen de completados, errores y aciertos de caché.${TF('T09', 'un radicado real devolvió 6 actuaciones y uno inexistente `found: false`, ambos dentro de un lote exitoso.')}`,
        `El correo oficial del despacho se obtiene desde el directorio con el código de 12 dígitos o con el radicado completo, porque sus primeros 12 dígitos identifican el despacho.${TF('T08', 'un radicado de 23 dígitos resolvió el buzón del Juzgado 01 Civil del Circuito de Bogotá.')}`,
      ],
      decisiones: 'La primera decisión selecciona la herramienta por el identificador; la segunda detecta el exceso de coincidencias en la búsqueda por nombre; la tercera valida el lote completo antes de ejecutarlo; la cuarta interpreta `found`, donde la marca `private_only` advierte que el radicado existe pero solo como proceso reservado.',
      errores: `«Too many matches» exige precisar la razón social o activar \`active_only\`. Un ítem mal formado invalida el lote con un 400 que señala \`items.N\`. Una falla del portal judicial produce un 5xx; como las consultas son idempotentes, el reintento es seguro. Un radicado con menos de 20 dígitos se rechaza antes de cobrar.${TF('T55', 'el radicado «123» fue rechazado con el error MCP −32602 «Must be 20-25 digits».')}`,
      riesgos: 'Las entidades con muchos procesos (bancos, aseguradoras, cadenas comerciales) superan el umbral de la búsqueda por nombre si no se usa `active_only`; para su histórico completo conviene partir de los radicados propios. Los nombres de las partes son datos personales: el producto debe aplicar finalidad y minimización. Supuesto: la consulta por radicado devuelve la primera página de 40 actuaciones, suficiente para el estado actual pero no para el histórico íntegro de procesos muy largos.',
    });

  flujo('4.2', 'D03', 'Jurisprudencia de las altas cortes y disciplina judicial',
    'Elaboración propia. Fuentes: Agent Skill (cortes, SAMAI, CNDJ) y pruebas T02, T03, T04, T06, T07, T57 y T61.',
    `Croma cubre cuatro corpus jurisprudenciales y uno disciplinario: la Corte Constitucional desde 1992 y la Corte Suprema de Justicia desde 1886 (ambas como dataset), el Consejo de Estado en dos corpus —la relatoría tradicional, en vivo y asíncrona, para providencias anteriores a diciembre de 2021, y SAMAI, con providencias tituladas desde esa fecha y sus fichas de relatoría— y la Comisión Nacional de Disciplina Judicial, en vivo. Como complemento, \`samai_processes\` busca en vivo procesos de lo contencioso administrativo por parte, radicado o clase dentro de una corporación (1100103 es el Consejo de Estado), y \`samai_corporaciones\` y \`samai_secciones\` devuelven los códigos necesarios.${F('skill', 'entradas `corte_constitucional_*`, `corte_suprema_*`, `consejo_estado_*`, `samai_*` y `cndj_*`')}`,
    {
      objetivo: diag.D03.objetivo + ' Habilita asistentes de investigación jurídica con citas verificables.',
      pasos: [
        'Elegir la corporación; si es el Consejo de Estado, elegir el corpus según la fecha de la providencia (antes o después de diciembre de 2021).',
        `Buscar con filtros estructurados (tipo T, C, SU o A; año; fechas; magistrado ponente; radicado; sala; tutela). Los resultados se ordenan por fecha y no por relevancia, de modo que el filtro es lo que garantiza pertinencia.${TF('T02, T03, T04', 'la búsqueda «habeas data … centrales de riesgo» con tipo T y año 2025 devolvió 91 sentencias encabezadas por las más recientes, no por las más pertinentes; SAMAI reportó un total aproximado con tope de 1.000.')}`,
        'Revisar el resumen de cada resultado: número, fecha, ponente, síntesis, decisión, derechos invocados y enlace oficial; en SAMAI, además, descriptores, problema jurídico, respuesta y tesis.',
        `Si se necesita el texto íntegro, leer el detalle por rangos de caracteres con \`offset\` y \`limit\` hasta que \`has_more\` sea falso.${TF('T57', 'la sentencia SU-424/21 mide 337.817 caracteres: con el límite por defecto de 60.000 requiere seis lecturas.')}`,
        'Citar con número, fecha, ponente y enlace a la relatoría oficial que acompaña cada registro.',
      ],
      decisiones: 'La corte de cierre y la fecha determinan el corpus. La necesidad de texto íntegro determina si se paga la lectura del detalle (un crédito por rango en los datasets).',
      errores: `La relatoría tradicional del Consejo de Estado es asíncrona y su detalle devuelve el texto completo en una sola respuesta, sin paginación y con los metadatos en blanco.${TF('T61', 'la providencia consultada devolvió 71.816 caracteres con radicado, tipo, sección y ponente en `null`.')} El filtro por norma demandada usado en solitario no recuperó resultados.${TF('T07', 'con `statute` «Ley 1581 de 2012» el total fue 0; con demandado, tipo y rango de fechas, 37.')}`,
      riesgos: 'Las búsquedas de la Corte Constitucional incluyen la parte resolutiva completa de cada fallo, lo que satura el contexto de un agente: conviene `per_page` entre 3 y 5. La relatoría tradicional del Consejo de Estado responde con claves en español (`radicado`, `ponente`, `demandado`), una excepción a la convención `snake_case` en inglés del resto del contrato.',
    });

  flujo('4.3', 'D04', 'Empresas: RUES, Supersociedades, SIMEV y comercio exterior',
    'Elaboración propia. Fuentes: Agent Skill (RUES, Supersociedades, SIMEV, DIAN Importadores y Exportadores) y pruebas T11 a T15, T21 y T51.',
    `El conocimiento de una empresa combina cuatro familias: el RUES (registro mercantil, en vivo), Supersociedades (estados financieros y vinculados de unas 30.000 sociedades al año, como dataset), el SIMEV (accionistas principales de unos 110 emisores de valores) y los directorios de importadores y exportadores de la DIAN desde 2017.${F('skill', 'entradas `rues_*`, `supersociedades_*`, `simev_shareholders` y `dian_trade_*`')}`,
    {
      objetivo: diag.D04.objetivo,
      pasos: [
        'Resolver el NIT: si solo se tiene la razón social, buscarla en el RUES o entre los proveedores registrados en SECOP.',
        `Consultar el RUES por NIT: estado de la matrícula, cámara de comercio, organización jurídica, actividad CIIU, fechas de matrícula y renovación, estados financieros reportados, representantes legales y avisos.${TF('T11', 'Banco Finandina: matrícula activa desde 1977, renovada en marzo de 2026, con estados financieros anuales de 2013 a 2026.')}`,
        `Si la sociedad reporta a Supersociedades, leer su historial de reportes, los estados financieros completos y los vinculados declarados: accionistas con documento y porcentaje, inversionistas extranjeros, subordinadas, representantes, contador y revisor fiscal.${TF('T15', 'D1 S.A.S.: tres accionistas (60,25 %, 20,43 % y 19,32 %, dos de ellos extranjeros) y una subordinada en Perú.')}`,
        `Si es emisor de valores, consultar los accionistas reportados al SIMEV por corte semestral.${TF('T13', 'diecinueve cortes desde junio de 2017; cinco accionistas en el corte de junio de 2026.')}`,
        `Completar con el perfil de comercio exterior: posición en los directorios, valores CIF y FOB y subpartidas arancelarias principales.${TF('T14', 'Ecopetrol: primer importador y exportador; en 2026, hasta julio, USD 2.130 millones CIF y USD 6.188 millones FOB.')}`,
        'Aplicar control de calidad y consolidar la ficha con el grafo de vinculados que entregan los campos `party_document_numbers`.',
      ],
      decisiones: 'Las decisiones dependen de la naturaleza de la empresa: si existe en el RUES, si es vigilada o reporta a Supersociedades y si es emisora de valores. Cada respuesta afirmativa añade una capa de información.',
      errores: `Un NIT sin registro devuelve \`found: false\`, que es definitivo.${TF('T51', 'el NIT 1234 devolvió `found: false` con listas vacías.')} El dataset de insolvencias de Supersociedades estuvo no disponible en dos intentos; la ficha debe tolerar la ausencia temporal de una capa.`,
      riesgos: `Los datos se entregan tal como se publican: en el RUES aparecieron direcciones vacías y cifras atípicas (gastos operacionales de 38,6 billones en 2018 para una entidad con activos de 1,9 billones), y en Supersociedades el número de empleados figuró en cero.${TF('T11, T21', 'valores observados en las respuestas de `rues_entity_by_nit` y `supersociedades_companies_search`.')} Los vinculados incluyen documentos de personas naturales, que deben tratarse con finalidad y minimización.`,
    });

  flujo('4.4', 'D05', 'Supersociedades: insolvencia, Baranda Virtual y Relatoría',
    'Elaboración propia. Fuentes: Agent Skill (Supersociedades, Baranda Virtual y Relatoría) y pruebas T16, T17, T22 y T58.',
    `La Superintendencia de Sociedades actúa también como juez en procedimientos mercantiles e insolvencia. Croma expone siete endpoints de la Baranda Virtual (estados, traslados, avisos y autos publicados desde 2024, con copia de los archivos, más tres consultas en vivo del expediente) y siete de la Relatoría (conceptos jurídicos desde 1993, sentencias de la Delegatura de Procedimientos Mercantiles, providencias históricas, boletines y avisos).${F('skill', 'entradas `supersociedades_baranda_*` y `supersociedades_relatoria_*`')}`,
    {
      objetivo: diag.D05.objetivo,
      pasos: [
        'Distinguir la necesidad: proceso de insolvencia reportado, estados y autos recientes, expediente vivo de una empresa o doctrina.',
        'Los procesos de insolvencia provienen de los estados financieros anuales; por eso su información es estructuralmente tardía y debe complementarse con la Baranda.',
        `En la Baranda, buscar publicaciones por NIT o cédula y autos notificados por texto, expediente o dependencia; con \`from_date\` igual a \`to_date\` se leen los estados de un día sin abrir archivos PDF. El texto completo de un auto se obtiene con su \`filing_id\`.${TF('T16', 'la búsqueda de autos devolvió 226 resultados con copia del PDF en el almacenamiento de Croma.')}`,
        'El expediente vivo por NIT o cédula entrega la situación de la sociedad, sus representantes y las providencias y entradas, diez por página; es asíncrono porque la fuente exige una verificación por sesión.',
        'La Relatoría entrega conceptos y sentencias con sus problemas jurídicos, fuentes y partes.',
      ],
      decisiones: 'La disponibilidad del dataset de insolvencias determina si se usa esa capa o se remite a la Baranda. La necesidad de inmediatez (lo notificado hoy) privilegia la Baranda sobre los reportes anuales.',
      errores: 'El dataset de insolvencias respondió «temporarily unavailable» en dos intentos separados por varios minutos (T17 y T58), lo que contradice la promesa general de disponibilidad de los datasets; la ruta de contingencia es la Baranda Virtual.',
      riesgos: `La búsqueda de autos por texto es laxa: la consulta «desestimación de la personalidad jurídica» devolvió primero autos de inadmisión de demandas, ordenados por fecha de notificación.${TF('T16', 'los tres primeros resultados fueron autos que inadmiten demandas.')} Conviene acotar por NIT, expediente o dependencia. En la Relatoría, algunas partes aparecen con documento «0000».${TF('T22', 'sentencia 810-000181 de 2026 con partes sin documento.')}`,
    });

  flujo('4.5', 'D06', 'Contratación pública: SECOP I y II y conceptos de la ANCP-CCE',
    'Elaboración propia. Fuentes: Agent Skill (SECOP y ANCP-CCE), página de versionado y pruebas T23 a T28 y T44.',
    `SECOP es la familia más extensa de Colombia: 16 endpoints que cubren SECOP II desde 2015 y SECOP I desde 2004 en una sola forma —procesos, contratos, adjudicaciones, oferentes, modificaciones, sanciones, planes anuales y proveedores—, once de ellos como dataset, dos en vivo sobre los datos abiertos de Colombia Compra Eficiente y tres deprecados que dejan de responder el 1 de diciembre de 2026. La Relatoría de la ANCP-CCE añade los conceptos jurídicos de contratación.${F('skill', 'entradas `secop_*` y `ancp_cce_*`')}${F('version', 'tabla de endpoints deprecados')}`,
    {
      objetivo: diag.D06.objetivo,
      pasos: [
        `Partir del documento del contratista o de la entidad con \`secop_profile\`: en una sola llamada de un crédito resume cuenta de proveedor, contratos, adjudicaciones, ofertas, sanciones y, si es entidad, lo que ha comprado.${TF('T23', 'el perfil de Banco Finandina mostró cuenta de proveedor activa sin contratos, adjudicaciones, ofertas ni sanciones.')}`,
        'Profundizar con las búsquedas paginadas de contratos, adjudicaciones, oferentes (incluidos los que perdieron), sanciones y modificaciones.',
        `Partir de un objeto contractual con \`secop_processes_search\` y sus filtros (adjudicado o no, fechas, UNSPSC, entidad, valor).${TF('T25', 'cinco procesos abiertos sobre software e inteligencia artificial publicados desde septiembre de 2026, entre ellos una orden de la Universidad Nacional para suscribir una herramienta de IA para desarrollo de software.')}`,
        'Leer cada resultado por su id prefijado (`secop_ii:…`) con los endpoints `*_record`, que responden en milisegundos.',
        `Con un id de SECOP II (\`CO1.NTC.…\` o \`CO1.PCCNTR.…\`), la vista viva añade adiciones, garantías y plan de entregas; si devuelve \`found: false\` para un registro reciente, volver a \`*_record\`.${TF('T44', '`secop_contract` devolvió `found: false` para un contrato firmado el 30 de septiembre que `secop_contract_record` sí encontró.')}`,
        'Consultar el Plan Anual de Adquisiciones para anticipar compras y los conceptos de la ANCP-CCE para el criterio jurídico.',
      ],
      decisiones: 'El punto de partida (documento, texto, identificador, plan o duda jurídica) determina la herramienta; el formato del identificador determina si se usa la copia o la vista viva.',
      errores: 'La vista viva puede ir detrás de la copia para registros recientes; la remisión a `*_record` resuelve el caso. Los endpoints `contracts-by-provider`, `processes-by-entity` y `sanctions-by-provider` responderán 410 desde el 1 de diciembre de 2026.',
      riesgos: `Cuatro defectos de datos exigen control antes de cualquier conclusión: registros de prueba de la propia plataforma en el dataset de sanciones («Z ENTIDAD DE PRUEBA»), valores de adición imposibles que dominan el orden por valor (287.977.824.202.578.620 pesos), NIT de entidades con el dígito de verificación pegado y rezagos de 35 a 39 días en planes y modificaciones.${TF('T24, T26, T27, T28', 'observaciones en `secop_modifications_search`, `secop_contracts_search`, `secop_sanctions_search` y `secop_plans_search`.')}`,
    });

  flujo('4.6', 'D07', 'Verificación de personas naturales',
    'Elaboración propia. Fuentes: guías de Registraduría, Policía, Procuraduría, Contraloría, Contaduría, ADRES y RUAF, y Agent Skill. Por diseño, no se consultaron personas reales.',
    `Doce endpoints, todos en vivo, permiten verificar a una persona por su documento: estado vital de la cédula (Registraduría), registro civil de nacimiento, antecedentes ante la Policía, la Procuraduría (SIRI), la Contraloría (SIBOR) y la Contaduría (Boletín de Deudores Morosos del Estado), afiliación en salud (ADRES-BDUA), afiliaciones a seguridad social (RUAF), clasificación socioeconómica (DNP: Sisbén IV y RUI), insolvencia de persona natural (SICAAC) y casos penales por noticia criminal (Fiscalía).${F('skill', 'entradas correspondientes')}`,
    {
      objetivo: diag.D07.objetivo,
      pasos: [
        'Verificar primero que exista una finalidad legítima y una base legal para el tratamiento; sin ellas, el flujo termina sin consultar.',
        'Seleccionar solo las verificaciones que exige esa finalidad: identidad, antecedentes, seguridad social, clasificación socioeconómica, insolvencia o proceso penal, o registro civil.',
        `Ejecutar las consultas; las de Policía, ADRES, RUAF, SICAAC y Contaduría son asíncronas, y por MCP esperan en línea.${F('async', 'lista de endpoints asíncronos de Colombia')}`,
        `Interpretar la respuesta: \`found: false\` es definitivo; los veredictos se expresan como booleanos (\`has_records\`, \`is_fiscal_responsible\`, \`reported\`) acompañados de la frase textual de la fuente y de la fecha de consulta o un código de verificación.${F('procuraduria', 'sección «Respuesta»')}${F('contraloria', 'sección «Respuesta»')}`,
        'Archivar la evidencia mínima necesaria para la decisión, no el registro completo.',
      ],
      decisiones: `La compuerta legal es la decisión principal. Después, la finalidad define el subconjunto de fuentes; por ejemplo, el RUAF exige la fecha de expedición del documento y no distingue una fecha errónea de un documento no registrado.${F('ruaf', 'campo `issue_date_matches`')}`,
      errores: 'Fallas de la fuente (5xx) y, en el RUAF, el rechazo por fecha de expedición. La Contraloría tarda normalmente decenas de segundos porque genera el certificado bajo demanda.',
      riesgos: `La Procuraduría solo devuelve el veredicto: el detalle de las sanciones está en el certificado oficial, no en la respuesta.${F('procuraduria', 'último párrafo de «Respuesta»')} La afiliación en salud es información sensible; su uso para decisiones automatizadas exige un análisis jurídico específico. La Registraduría devuelve \`UNKNOWN\` cuando la fuente entrega un valor no reconocido.${F('registraduria', 'tabla de estados')}`,
    });

  flujo('4.7', 'D08', 'Vehículos y tránsito: RUNT y SIMIT',
    'Elaboración propia. Fuentes: guías de RUNT y SIMIT y Agent Skill. Por diseño, no se consultaron placas ni personas reales.',
    `El RUNT expone cuatro consultas asíncronas —vehículo por placa con documento del propietario, historial del vehículo solo con la placa, ciudadano por documento y ciudadano por placa— y el SIMIT una, el estado de cuenta de multas por placa o documento.${F('runt', 'secciones de los cuatro endpoints')}${F('simit', 'descripción general')}`,
    {
      objetivo: diag.D08.objetivo + ' Sirve a aseguradoras, financieras de vehículos, cobranza y compraventa.',
      pasos: [
        'Verificar la base legal: varias respuestas identifican al propietario o al conductor.',
        'Para la ficha técnica completa con SOAT, revisión técnico-mecánica, prendas con su acreedor, limitaciones, blindaje y certificados, usar `runt_vehicle_by_plate` con la placa y el documento del propietario activo.',
        'Si solo se tiene la placa, `runt_vehicle_history_by_plate` entrega propietarios con documento, características, licencia de tránsito, importación, SOAT, revisiones, accidente registrado y trámites.',
        'Para el conductor, `runt_citizen_by_document` entrega licencias y categorías, paz y salvo, certificados de aptitud y médicos; `runt_citizen_by_plate` hace lo mismo con el propietario actual cuando es persona natural.',
        'Para multas, `simit_account_status` recibe placa o documento en el mismo campo, informa cuál coincidió y entrega comparendos, totales, acuerdos de pago, cursos y proyecciones de descuento; `clear: true` significa paz y salvo.',
      ],
      decisiones: 'La finalidad decide la consulta; el dato disponible (placa con o sin documento) también. Ante `found: true`, todas las secciones se entregan «en la medida de lo posible»: si una no existe para el vehículo, llega vacía en lugar de fallar.',
      errores: '`found: false` cuando la placa y el documento no tienen coincidencia activa o, en la consulta por placa del ciudadano, cuando el propietario es una empresa. Fallas del RUNT o del SIMIT producen 5xx.',
      riesgos: 'El historial por placa revela la identidad de propietarios sin necesidad del documento, lo que eleva el riesgo de uso indebido; debe restringirse a finalidades legítimas y auditarse. Las secciones vacías no prueban ausencia de gravámenes: pueden reflejar indisponibilidad parcial.',
    });

  flujo('4.8', 'D09', 'Fuentes con sesión del titular y factura electrónica',
    'Elaboración propia. Fuentes: guías de DIAN MUISCA y Bancolombia, Agent Skill (documento electrónico DIAN) y prueba T45.',
    `Tres familias exigen tratamiento especial: el documento electrónico de la DIAN (validación de facturas por CUFE, en vivo y asíncrona), la cuenta MUISCA de la DIAN (facturas recibidas e información exógena del titular) y la banca virtual de Bancolombia (cuentas y movimientos). Las dos últimas solo responden con la sesión del titular y operan mediante conexiones.${F('muisca', 'sección «Conecta tu cuenta»')}${F('bancolombia', 'sección «Conecta tu cuenta»')}`,
    {
      objetivo: diag.D09.objetivo,
      pasos: [
        `Para validar una factura, enviar el CUFE y el NIT del emisor o del receptor: la respuesta trae partes, totales e impuestos, tenedor legítimo, validaciones y eventos. Con \`include_pdf\` se obtiene el PDF oficial; si está protegido, se sugieren en orden el NIT del emisor sin DV, el documento del receptor sin DV y el NIT del receptor con DV. El resultado se reutiliza 24 horas salvo \`cache: false\`.${F('skill', 'entrada `dian_electronic_document`')}`,
        `Para información del titular, verificar si la organización tiene una conexión activa; en la organización de prueba no había ninguna.${TF('T45', '`dian_muisca_list_connections` devolvió una lista vacía.')}`,
        'Crear la conexión con `*_connect`: el titular recibe un enlace seguro y escribe sus credenciales en la consola; Croma las verifica, las cifra y no las devuelve.',
        'Consultar facturas recibidas (solo persona a nombre propio, desde 2023 hasta el último año cerrado), información exógena (desde 2018), cuentas o movimientos en una ventana de fechas.',
        'En Bancolombia, usar `direction` para saber si un movimiento entra o sale, porque `movement_type` refleja la vista contable del banco, invertida.',
      ],
      decisiones: 'Si la fuente exige sesión; si existe una conexión activa; si la conexión es utilizable (credenciales vigentes y cupo diario disponible).',
      errores: `\`409 connection_required\`, \`422 connection_rejected\`, \`429 connections_exhausted\` con \`Retry-After\`, y \`409 connection_id_required\` cuando hay más de una conexión y no se indica cuál.${F('muisca', 'tabla de estados de conexión')}`,
      riesgos: 'La conexión supone que quien registra es el titular o tiene su autorización (`authorized: true`); un producto debe acreditarlo. Las consultas son en vivo y nunca se comparten entre organizaciones. El año gravable en curso se rechaza porque la DIAN solo publica años cerrados.',
    });

  flujo('4.9', 'D10', 'Normativa y regulación',
    'Elaboración propia. Fuentes: Agent Skill (Función Pública, Imprenta Nacional, Superfinanciera, CREG, DIAN doctrina, SIC normativa) y pruebas T18 a T20, T35, T38 y T40.',
    `La normativa colombiana se reparte en siete corpus: el Gestor Normativo de Función Pública (normas desde 1620), la Gaceta del Congreso desde 2000 y el Diario Oficial desde 1939 (Imprenta Nacional), la normativa de la Superfinanciera desde 2005 y su doctrina desde 1994, los actos de la CREG desde 1994, la doctrina de la DIAN (en vivo) y el registro normativo y el Boletín Jurídico de la SIC.${F('skill', 'entradas `funcion_publica_*`, `imprenta_*`, `superfinanciera_*`, `creg_*`, `dian_doctrina_*` y `sic_normativa_*`')}`,
    {
      objetivo: diag.D10.objetivo + ' Es la base de la vigilancia regulatoria por sector.',
      pasos: [
        'Elegir el corpus por la naturaleza de la norma: administrativa, legislativa, Diario Oficial, financiera, energética, tributaria o de industria y comercio.',
        `Acotar con número exacto (con o sin ceros a la izquierda), tipo, año, entidad, boletín o fechas de expedición.${TF('T35', 'la Ley 1581 de 2012 se identificó con `norm_id` 49981, su publicación en el Diario Oficial 48587 y tres decretos reglamentarios enlazados.')}`,
        'Si la respuesta está topada (`capped`) o el total es excesivo, afinar la consulta antes de leer.',
        'Leer el texto por rangos; algunas normas compiladas superan el millón de caracteres.',
        'Reconstruir el grafo normativo con las modificaciones que el registro enlaza por identificador.',
      ],
      decisiones: 'El tipo de norma determina el corpus; el tamaño del resultado determina si hay que afinar; la necesidad de texto íntegro determina la lectura por rangos.',
      errores: `Coincidencias excesivas o topadas exigen afinar la consulta. La doctrina de la DIAN es en vivo y señala con \`capped: true\` cuando la fuente devuelve más coincidencias de las recuperables.${TF('T19', '153 conceptos sobre requisitos de factura electrónica, sin tope.')}`,
      riesgos: `El texto libre coincide de forma amplia y ordena por fecha: «comunidades energéticas» devolvió 574 resoluciones de la CREG y una búsqueda sobre inteligencia artificial en la Gaceta del Congreso empezó por el presupuesto de regalías.${TF('T38, T40', 'resultados encabezados por documentos sin relación directa con la consulta.')} En la Superfinanciera algunas descripciones conservan entidades HTML sin decodificar.${TF('T18', 'la descripción de la Circular Externa 010 de 2013 contiene «&iquest;».')}`,
    });

  flujo('4.10', 'D11', 'Superintendencia de Industria y Comercio',
    'Elaboración propia. Fuentes: Agent Skill (SIC) y pruebas T41 a T43 y T56.',
    `La SIC suma quince endpoints: el registro de propiedad industrial (unos 900.000 casos de marcas desde 1930, patentes y diseños), la Gaceta de Propiedad Industrial desde 2016, las multas en firme de protección al consumidor desde 2013 (unas 4.000), los actos administrativos y sentencias desde 2014 (unas 144.000 resoluciones y 136.000 sentencias) y el seguimiento de un radicado como parte.${F('skill', 'entradas `sic_*`')}`,
    {
      objetivo: diag.D11.objetivo,
      pasos: [
        `Para marcas, patentes o diseños, buscar en el dataset por signo, titular, clase de Niza, estado o fechas y leer el caso completo con su historial procesal y documentos.${TF('T41', '15 marcas registradas que contienen «RAPPI», con certificado, vigencia y clases.')}`,
        `Para el portafolio de un titular, consultar por NIT o cédula (con o sin DV); es una consulta en vivo que puede tardar hasta un minuto.${TF('T56', 'Banco Finandina: 43 casos marcarios entre registrados, negados, caducados y rechazados.')}`,
        'Para vigilancia de oposiciones, consultar la Gaceta por clase, sección, estado y fechas de publicación.',
        `Para cumplimiento, consultar las multas de protección al consumidor por parte, sector o resolución, y los actos y sentencias por documento de cualquier parte.${TF('T42', '345 multas en el sector de comercio electrónico; la más reciente, de mayo de 2026.')}`,
        'Para un trámite propio, consultar el radicado con el documento de una de sus partes; con `include_documents` se obtienen copias idénticas de cada documento, lo que puede tardar minutos.',
      ],
      decisiones: 'La necesidad determina la herramienta; en los actos, la cantidad de resultados determina si hay que simplificar la consulta; en el trámite, la calidad de parte determina el acceso.',
      errores: `Una consulta de varias palabras puede exigir todas y devolver cero: «habeas data datos personales multa» no devolvió nada, mientras «datos personales» devolvió 306 actos.${TF('T43', 'misma ventana de fechas, resultados 0 y 306.')} En SIC Trámites, \`found: false\` no distingue un radicado inexistente de un documento que no es parte.`,
      riesgos: 'La coincidencia en texto completo arrastra resultados laterales (sentencias de consumo que mencionan «datos personales»). Las multas publicadas son las que quedaron en firme, por lo que hay un rezago natural frente a la decisión.',
    });

  flujo('4.11', 'D12', 'Catastro nacional del IGAC',
    'Elaboración propia. Fuentes: Agent Skill (IGAC) y pruebas T29 a T31, T33 y T34.',
    `El IGAC aporta quince endpoints sobre el catastro de los 842 municipios que administra (unos 6,8 millones de predios): predios, terrenos, construcciones, manzanas, veredas, sectores, zonas homogéneas físicas y geoeconómicas, nomenclatura y estadísticas municipales. Bogotá, Medellín, Cali, Barranquilla y Antioquia tienen gestor catastral propio y no están en esta fuente.${F('skill', 'entradas `igac_*`')}`,
    {
      objetivo: diag.D12.objetivo,
      pasos: [
        `Confirmar quién administra el catastro del municipio.${TF('T29', 'Villa de Leyva (15407) es administrado por el IGAC.')}`,
        'Elegir la entrada: coordenadas, municipio, manzana o dirección, o número predial de 30 dígitos.',
        `Leer el predio: avalúo catastral vigente, áreas, destino económico, construcciones y polígono. Es un lookup: la primera consulta lee el IGAC y las siguientes, durante 30 días, responden desde la copia.${TF('T33, T34', 'predio comercial de 225 m² de terreno y 168 m² construidos con avalúo de 133.255.000 pesos, servido desde la fuente.')}`,
        'Agregar contexto: valor del suelo por zona geoeconómica, características de la zona física, construcciones, placas y terreno.',
        `Cerrar con las estadísticas municipales: avalúo total, número de predios y estado de actualización catastral.${TF('T31', 'última actualización urbana y rural en 2013, estado «Desactualizado».')}`,
      ],
      decisiones: 'Si el municipio está en el catastro del IGAC; qué dato de entrada se tiene; si bajo el punto existe un predio.',
      errores: `Un punto en espacio público devuelve \`found: false\`.${TF('T30', 'la plaza principal de Villa de Leyva no tiene predio asociado.')} Un número predial de un territorio con gestor propio también devuelve \`found: false\`.`,
      riesgos: 'El avalúo catastral no equivale al valor comercial y, en municipios con catastro desactualizado, puede alejarse mucho de él. La fuente no informa propietarios, lo que reduce el riesgo de datos personales.',
    });

  flujo('4.12', 'D13', 'Estadística oficial: DANE, Banco de la República, DNP, ICFES y MinEducación',
    'Elaboración propia. Fuentes: Agent Skill (DANE, BanRep, TerriData, ICFES, MinEducación) y pruebas T36, T47, T48 y T59.',
    `Catorce endpoints, todos como dataset, ofrecen la estadística oficial: pobreza, mercado laboral, IPM municipal y censo 2018 (DANE); unas 850 series macroeconómicas y unas 5.700 publicaciones (Banco de la República); estadísticas territoriales (TerriData del DNP); resultados Saber 11 de 2010 a 2022 (ICFES) e indicadores educativos desde 2011 (MinEducación).${F('skill', 'entradas `dane_*`, `banrep_*`, `terridata_*`, `icfes_*` y `mineducacion_*`')}`,
    {
      objetivo: diag.D13.objetivo,
      pasos: [
        'Elegir el ámbito: macroeconomía, investigación, pobreza y empleo, estadística territorial o educación.',
        `Identificar la serie o el indicador una vez (por ejemplo, la TRM es la serie 1 del Banco de la República) y reutilizar el código.${TF('T36', 'TRM de octubre de 2026 con fuente Superintendencia Financiera y próxima carga anunciada.')}`,
        'Normalizar el territorio con DIVIPOLA (dos dígitos para departamento, cinco para municipio) para cruzar fuentes.',
        'Verificar `as_of` y la periodicidad de cada serie antes de combinarlas.',
        `Producir el tablero o modelo citando fuente y fecha de corte.${TF('T47', 'la incidencia nacional de pobreza monetaria fue 28,0 % en 2025, frente a 31,8 % en 2024.')}`,
      ],
      decisiones: 'El ámbito determina la fuente; la vigencia de `as_of` y la continuidad de la serie determinan si el dato puede usarse sin advertencias.',
      errores: `Una serie descontinuada o rezagada se reporta con advertencia: el Índice de Desempeño Fiscal original llega a 2020 y el nuevo índice empieza en ese año.${TF('T48', 'catálogo de TerriData con ambos índices.')}`,
      riesgos: 'La TRM repite el último valor en fines de semana y festivos; promediar sin depurar sesga los cálculos. En ICFES no se publicaron los periodos 2018-2 y 2021-2.',
    });

  flujo('4.13', 'D14', 'Fuentes sectoriales: INVIMA, ANM y SIATA',
    'Elaboración propia. Fuentes: Agent Skill (INVIMA, ANM, SIATA) y pruebas T32, T37, T49 y T60.',
    `INVIMA aporta unos 385.000 registros sanitarios y notificaciones, y unas 163.000 presentaciones de medicamentos con su CUM; la ANM, las notificaciones sobre títulos y solicitudes mineras desde mayo de 2020; y el SIATA, once endpoints en vivo sobre clima, lluvia, ríos, calidad del aire, sensores ciudadanos, pronóstico, alertas, sismos y cámaras del Valle de Aburrá.${F('skill', 'entradas `invima_*`, `anm_*` y `siata_*`')}`,
    {
      objetivo: diag.D14.objetivo,
      pasos: [
        `Para un producto, buscar el registro o la presentación por nombre, titular, principio activo exacto o código ATC, y verificar vigencia del registro y estado del CUM.${TF('T32', 'el principio activo acetaminofén con CUM activo alcanzó el tope de 1.000 resultados.')}`,
        `Para un título minero, buscar por placa exacta, oficina, tipo y fechas, y leer el texto completo de cada notificación por rangos.${TF('T37', '236 avisos de la oficina de Medellín en 2026.')}`,
        'Para ambiente, consultar por municipio, estación o cercanía a unas coordenadas.',
        'Depurar lecturas inválidas antes de mostrarlas o usarlas en alertas.',
      ],
      decisiones: 'El sector determina la fuente; en INVIMA, la vigencia y el estado del CUM; en SIATA, la validez de cada lectura.',
      errores: `El SIATA entrega valores centinela que la fuente clasifica como calidad «Buena».${TF('T49', 'una estación reportó NO₂ de −999 ppb con índice −500 y categoría «Buena».')} Un registro vencido o un CUM inactivo deben tratarse como alerta.`,
      riesgos: `El SIATA solo cubre el Valle de Aburrá y no tenía alertas activas al momento de la prueba.${TF('T60', 'la lista de alertas activas estaba vacía.')} En la ANM la placa se compara de forma exacta, por lo que errores de digitación producen resultados vacíos.`,
    });

  flujo('4.14', 'D15', 'Trámites del Estado y herramientas web',
    'Elaboración propia. Fuentes: Agent Skill (SUIT, páginas de trámites y herramientas globales) y pruebas T39, T50 y T52 a T54.',
    `El SUIT reúne los trámites de las entidades nacionales y territoriales, con pasos, documentos, costos, tiempos y fundamento legal; las páginas de trámites cubren la Cancillería y la Unidad para las Víctimas. Las herramientas globales completan el cuadro: búsqueda web, investigación con citas, extracción a Markdown o JSON y generación de JSON con instrucciones.${F('skill', 'entradas `suit_*`, `gov_pages_*` y sección «Global (web)»')}`,
    {
      objetivo: diag.D15.objetivo,
      pasos: [
        `Si el trámite es de una entidad pública, buscarlo en el SUIT por texto, entidad o código DANE y leer la ficha completa.${TF('T39', 'cinco trámites de Villa de Leyva relacionados con licencias de construcción.')}`,
        `Si es un trámite de la Cancillería o de la Unidad para las Víctimas, usar las páginas de trámites.${TF('T50', 'cinco páginas de apostilla y legalización en línea.')}`,
        `Para cualquier otra página pública, extraer o generar JSON con un esquema simple.${TF('T53', 'la página de apostilla en línea produjo seis pasos y las tarifas de apostilla y legalización.')}`,
        'Para preguntas abiertas, usar la investigación con citas y verificar la fuente primaria antes de actuar.',
      ],
      decisiones: 'La ubicación de la información determina la herramienta; la extraibilidad de la página determina si se remite a la ficha del SUIT.',
      errores: `Las fichas de gov.co no fueron extraíbles: \`generate_json\` y \`extract_json\` devolvieron error interno, incluso con esfuerzo máximo, y un esquema con tipos unión fue rechazado.${TF('T52', 'tres intentos fallidos sobre gov.co; el esquema con `["string","null"]` fue rechazado por inválido.')}`,
      riesgos: `La investigación con citas es útil pero no sustituye la verificación: la propia descripción de la herramienta advierte que es una pasada de investigación y no una consulta.${TF('T54', 'el informe sobre precios coincidió con la página oficial, que luego se verificó.')} Los topes horarios de estas herramientas son contradictorios entre la documentación y la página de precios.`,
    });

  flujo('4.15', 'D16', 'Monitores: alertas programadas por correo',
    'Elaboración propia. Fuentes: guías de monitores, monitores desde Claude y fuentes monitoreables, y prueba T46.',
    `Los monitores convierten cualquier endpoint de datos —búsquedas y consultas de registro— en una vigilancia programada que avisa por correo. Se gestionan con siete herramientas MCP, con la API REST o desde la consola.${F('monmcp', 'sección «Las herramientas»')}`,
    {
      objetivo: diag.D16.objetivo,
      pasos: [
        'Verificar que la organización tenga habilitados los monitores (en la organización de prueba no lo estaban).',
        'El agente ejecuta primero la búsqueda con los filtros pedidos para mostrar lo que existe hoy.',
        'Si el usuario no indicó destinatarios, el agente los pregunta: nunca los adivina y admite como máximo tres.',
        'Se crea el monitor con `endpoint` igual al nombre de la herramienta y `query` con los mismos argumentos, sin paginación.',
        'La frecuencia depende del modo: los datasets siguen el refresco de la fuente por un crédito; los endpoints en vivo corren a diario o cada semana con costo de consulta en vivo.',
        'La primera ejecución registra hasta 500 filas y envía un correo de bienvenida; las siguientes reportan solo lo nuevo o los cambios, opcionalmente filtrados por relevancia.',
      ],
      decisiones: 'Habilitación de la función, existencia de destinatarios, modo del endpoint y uso del filtro de relevancia.',
      errores: `\`monitors_not_enabled\` (beta privada), \`schedule_faster_than_source\` cuando se pide más frecuencia que la del dataset, \`invalid_param\` cuando un endpoint en vivo pide \`cadence: source\`, el tope de 20 monitores, \`skipped_plan_limit\` sin créditos y \`truncated\` con más de 500 filas nuevas.${F('monitors', 'secciones «Frecuencias» y «Créditos y límites»')}`,
      riesgos: 'La función está en beta privada, por lo que un producto no debe depender de ella sin un acuerdo de acceso. Cuando una fuente no publica, la ejecución lo declara con `source_stale` y el correo lo dice expresamente, en lugar de un simple «sin novedades».',
    });

  return out;
};
