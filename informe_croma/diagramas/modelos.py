"""Modelos de grafo de los 17 diagramas del informe (§7 y §12 del MD).

Cada nodo declara: id, etiqueta, tipo (forma/semántica), cat (color),
nivel (N2 principal | N3 auxiliar), fase (cluster N1) y recursos.
Cada arista declara: origen, destino, etiqueta y tipo
(flujo | datos | remision | dependencia | error).
Solo se modela lo que la documentación oficial de Croma describe o lo que
las pruebas en vivo del 12-oct-2026 observaron (CJ_01 / REGLA_01).
"""

PALETA = {
    "entrada_salida": "#0072B2",
    "proceso": "#009E73",
    "decision": "#E69F00",
    "datos_almacen": "#56B4E9",
    "modelo_ia": "#CC79A7",
    "servicio_externo": "#8C6D31",
    "error_fallback": "#D55E00",
    "control_orquestacion": "#332288",
    "recurso_infra": "#117733",
}

NOMBRE_CAT = {
    "entrada_salida": "Entrada / salida",
    "proceso": "Proceso / herramienta",
    "decision": "Decisión",
    "datos_almacen": "Datos / almacén",
    "modelo_ia": "Modelo de IA / agente",
    "servicio_externo": "Fuente oficial externa",
    "error_fallback": "Error / contingencia",
    "control_orquestacion": "Control / orquestación",
    "recurso_infra": "Recurso de infraestructura",
}

# Registro maestro de recursos (§7): tipo, detalle, criticidad, costo/riesgo
RECURSOS = {
    "R01": ("api", "Llave de organización (Bearer croma_live_… u OAuth MCP)", "ALTA", "Da acceso total a la organización; rotar si se filtra"),
    "R02": ("servicio", "Saldo de créditos del plan (10 vivo · 1 dataset)", "ALTA", "402 plan_limit_reached al agotarse"),
    "R03": ("storage", "Copia dataset mantenida por Croma (as_of)", "MEDIA", "Rezago observado de 1 a 39 días según fuente"),
    "R04": ("servicio", "Portal oficial de la entidad colombiana", "ALTA", "Disponibilidad ajena; 5xx upstream_error"),
    "R05": ("compute", "Cola de trabajos asíncronos (/jobs, espera ≤55 s)", "MEDIA", "202 + status_url fuera de MCP"),
    "R06": ("storage", "Caché de resultados recientes (X-Cache: HIT)", "BAJA", "Sin costo, pero cuenta para topes horarios"),
    "R07": ("storage", "Almacén de lookups (served_from copy/upstream/stale)", "MEDIA", "Ventana de frescura por fuente (p. ej. IGAC 30 días)"),
    "R08": ("storage", "Copia documental en blob de Croma (PDF, DOCX, XLSX)", "MEDIA", "Enlaces de terceros; conservar source_url"),
    "R09": ("modelo", "Agente o cliente MCP (Claude, ChatGPT, Cursor)", "MEDIA", "Contexto finito: respuestas extensas lo saturan"),
    "R10": ("dato", "Identificador del sujeto (NIT, radicado, placa, cédula, CUFE)", "ALTA", "Validación por expresión regular antes de cobrar"),
    "R11": ("humano", "Base legal y finalidad (Ley 1581 de 2012)", "ALTA", "Responsabilidad del usuario, no de Croma"),
    "R12": ("servicio", "Conexión cifrada del titular (DIAN, Bancolombia)", "ALTA", "Máx. 5 por fuente; cupo diario de inicios de sesión"),
    "R13": ("servicio", "Correo de notificación (1 a 3 destinatarios)", "BAJA", "Monitores en beta privada"),
    "R14": ("modelo", "Filtro de relevancia en lenguaje natural", "BAJA", "Filas descartadas quedan con relevant:false"),
    "R15": ("dato", "Catálogo y OpenAPI (/catalog, /openapi)", "BAJA", "Fuente de verdad de rutas y esquemas"),
    "R16": ("api", "Webhook del cliente (callback_url HTTPS + HMAC)", "MEDIA", "Solo hosts públicos; responder 2xx rápido"),
    "R17": ("dato", "Esquema JSON del usuario (extract / generate)", "MEDIA", "No admite uniones de tipo (observado)"),
    "R18": ("dato", "Códigos DIVIPOLA / DANE (2 o 5 dígitos)", "BAJA", "Normalizan territorio entre fuentes"),
    "R19": ("dato", "Texto largo paginado (offset, limit, next_offset)", "MEDIA", "Normas y sentencias >300.000 caracteres"),
}

FECHA = "2026-10-12"
VERSION = "v1.0"


def N(id, etiqueta, tipo, cat, rec=(), fase=None, nivel="N2"):
    return {"id": id, "label": etiqueta, "tipo": tipo, "cat": cat,
            "recursos_requeridos": list(rec), "fase": fase, "nivel": nivel}


def E(o, d, et="", tipo="flujo", **dot):
    """`dot` admite atributos de solo presentación (p. ej. minlen) sin
    alterar el grafo que valida §9."""
    return {"origen": o, "destino": d, "etiqueta": et, "tipo": tipo, "dot": dot}


DIAGRAMAS = []


def D(clave, titulo, tipo_diagrama, nodos, aristas, inicios, terminales,
      recursos, fases, es_dag=False, objetivo=""):
    DIAGRAMAS.append({
        "clave": clave, "titulo": titulo, "tipo_diagrama": tipo_diagrama,
        "nodos": nodos, "aristas": aristas, "inicios": inicios,
        "terminales": terminales, "recursos": list(recursos), "fases": fases,
        "es_dag": es_dag, "objetivo": objetivo,
    })


# ─────────────────────────────────────────────────────────────────────
# Cuerpo de modelos: 17 diagramas con etiquetas compactas.
# Convención: fase=None ⇒ nodo sin contenedor (rutas de error, cierres).
# `minlen=2` en una arista escalona un abanico en dos filas (solo layout).
# ─────────────────────────────────────────────────────────────────────

# D00 · Arquitectura general
D("D00", "Arquitectura general de Croma", "Arquitectura C4 (contexto y contenedores)",
  [
      N("U", "Usuario o\nsistema cliente", "terminador", "entrada_salida", ["R11"], "Actores"),
      N("C1", "Cliente MCP\nClaude · ChatGPT · Cursor", "proceso", "modelo_ia", ["R09", "R01"], "Actores"),
      N("C2", "Código propio\nREST + Bearer", "proceso", "control_orquestacion", ["R01"], "Actores"),
      N("C3", "Consola\nplatform.usecroma.com", "proceso", "recurso_infra", ["R01"], "Actores"),
      N("CL", "Croma Legal\nmonitoreo judicial", "subproceso", "proceso", ["R10"], "Actores"),
      N("MCP", "Servidor MCP\napi.croma.run/mcp", "proceso", "control_orquestacion", ["R09"], "Superficies"),
      N("REST", "API REST\nPOST …/v1", "proceso", "control_orquestacion", ["R15"], "Superficies"),
      N("G", "Puerta de entrada\nllave · créditos · topes", "proceso", "recurso_infra", ["R01", "R02"], "Núcleo Croma"),
      N("RT", "¿Modo del\nendpoint?", "decision", "decision", ["R15"], "Núcleo Croma"),
      N("DS", "Copia dataset\nms · as_of · 1 crédito", "datos", "datos_almacen", ["R03"], "Núcleo Croma"),
      N("LK", "Almacén de\nlookups", "datos", "datos_almacen", ["R07"], "Núcleo Croma"),
      N("LV", "Conector en vivo\n10 créditos", "proceso", "proceso", ["R02"], "Núcleo Croma"),
      N("AS", "¿Asíncrono?", "decision", "decision", ["R05"], "Núcleo Croma"),
      N("JQ", "Cola de trabajos\n≤55 s · polling · callback", "subproceso", "control_orquestacion", ["R05", "R16"], "Núcleo Croma"),
      N("CN", "Conexiones cifradas\nDIAN · Bancolombia", "datos", "recurso_infra", ["R12"], "Núcleo Croma"),
      N("MO", "Monitores\n(beta privada)", "subproceso", "control_orquestacion", ["R13", "R14"], "Núcleo Croma"),
      N("SRC", "Fuentes oficiales\n55 familias · 172 endpoints", "externo", "servicio_externo", ["R04"], None),
      N("ERR", "{error}\n400·401·402·429·5xx", "io", "error_fallback", [], None),
      N("OUT", "Respuesta\n{ data } + procedencia", "terminador", "entrada_salida", ["R10"], None),
      N("MAIL", "Correo con\nnovedades", "terminador", "entrada_salida", ["R13"], None),
  ],
  [
      E("U", "C1", "conversa"), E("U", "C2", "integra"), E("U", "C3", "administra"), E("U", "CL", "opera"),
      E("C1", "MCP", "tool call"), E("C2", "REST", "POST JSON"), E("CL", "REST", "lotes"),
      E("MCP", "G"), E("REST", "G"),
      E("G", "RT", "autorizado"), E("G", "ERR", "rechazo", "error"),
      E("RT", "DS", "dataset"), E("RT", "LK", "lookup"), E("RT", "LV", "vivo"),
      E("LK", "SRC", "remite a: vencida", "remision"), E("LK", "OUT", "copia", "datos"),
      E("LV", "AS"), E("AS", "JQ", "sí"), E("AS", "SRC", "no"), E("JQ", "SRC", "ejecuta"),
      E("CN", "LV", "sesión", "dependencia"),
      E("C3", "CN", "connect"), E("C3", "MO", "crea"), E("MO", "RT", "consulta"),
      E("MO", "MAIL", "novedades"),
      E("DS", "OUT", "resultados", "datos"), E("SRC", "OUT", "registro", "datos"),
      E("SRC", "ERR", "caída", "error"), E("ERR", "OUT", "sobre"),
  ],
  ["U"], ["OUT", "MAIL"],
  ["R01", "R02", "R03", "R04", "R05", "R07", "R09", "R10", "R11", "R12", "R13", "R14", "R15", "R16"],
  {"Actores": "entrada_salida", "Superficies": "control_orquestacion", "Núcleo Croma": "recurso_infra"},
  objetivo="Mostrar cómo una necesidad de información viaja desde el usuario o su agente hasta la fuente oficial y regresa como JSON tipado.")


# D01 · Ciclo de vida de una solicitud
D("D01", "Ciclo de vida de una solicitud", "Flujo de algoritmo",
  [
      N("S", "Llamada MCP\no POST …/v1", "terminador", "entrada_salida", ["R10"], "Control de acceso"),
      N("V", "¿Admitida? (esquema,\nllave, créditos, topes)", "decision", "decision", ["R15", "R01", "R02"], "Control de acceso"),
      N("CH", "¿En caché?", "decision", "decision", ["R06"], "Control de acceso"),
      N("M", "¿Modo?", "decision", "decision", ["R15"], "Resolución"),
      N("DSQ", "Copia completa\nms · 1 crédito", "proceso", "datos_almacen", ["R03"], "Resolución"),
      N("LKQ", "¿Lectura\nvigente?", "decision", "decision", ["R07"], "Resolución"),
      N("ASY", "¿Asíncrono?", "decision", "decision", ["R05"], "Resolución"),
      N("W", "¿Termina en wait?\n(MCP siempre espera)", "decision", "decision", ["R05", "R09"], "Resolución"),
      N("P", "202 + status_url\npolling o callback", "subproceso", "control_orquestacion", ["R05", "R16"], "Resolución"),
      N("JS", "¿Estado\ndel job?", "decision", "decision", ["R05"], "Resolución"),
      N("SRC", "¿Fuente\ndisponible?", "decision", "servicio_externo", ["R04"], "Resolución"),
      N("RES", "¿Hay\ncoincidencia?", "decision", "decision", ["R10"], "Respuesta"),
      N("OK", "200 { data }", "io", "entrada_salida", [], "Respuesta"),
      N("NF", "200 found:false\no lista vacía", "io", "entrada_salida", [], "Respuesta"),
      N("HIT", "200 · X-Cache: HIT\n0 créditos", "io", "entrada_salida", ["R06"], "Respuesta"),
      N("E4", "400 invalid_param · 401\n402 plan_limit · 429", "io", "error_fallback", [], None),
      N("E5", "5xx upstream_error ·\njob_failed · expired", "io", "error_fallback", [], None),
      N("FOK", "Fin: respuesta útil", "terminador", "entrada_salida", [], "Respuesta"),
      N("FER", "Fin: error tipado", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "V"), E("V", "CH", "sí"), E("V", "E4", "no", "error"),
      E("CH", "HIT", "sí"), E("CH", "M", "no"),
      E("M", "DSQ", "dataset"), E("M", "LKQ", "lookup"), E("M", "ASY", "vivo"),
      E("LKQ", "RES", "sí: copy"), E("LKQ", "ASY", "no"),
      E("ASY", "SRC", "no"), E("ASY", "W", "sí"),
      E("W", "SRC", "sí"), E("W", "P", "no"),
      E("P", "JS"), E("JS", "P", "running"), E("JS", "RES", "completed"), E("JS", "E5", "failed", "error"),
      E("SRC", "RES", "sí"), E("SRC", "E5", "no", "error"),
      E("DSQ", "RES"),
      E("RES", "OK", "sí"), E("RES", "NF", "no"),
      E("OK", "FOK"), E("NF", "FOK"), E("HIT", "FOK"),
      E("E4", "FER"), E("E5", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R09", "R10", "R15", "R16"],
  {"Control de acceso": "recurso_infra", "Resolución": "control_orquestacion", "Respuesta": "entrada_salida"},
  objetivo="Explicar, decisión por decisión, qué ocurre con cada llamada y qué respuesta o error puede esperar quien integra.")


# D02 · Rama Judicial
D("D02", "Rama Judicial: procesos, lotes y correos", "Flujo de algoritmo",
  [
      N("S", "Procesos de una parte\no seguimiento de casos", "terminador", "entrada_salida", ["R11"], "Entrada"),
      N("D1", "¿Qué\nidentificador?", "decision", "decision", ["R10"], "Entrada"),
      N("BE", "cases_by_entity\nnombre · active_only", "proceso", "proceso", ["R10"], "Consulta"),
      N("BR", "cases_by_radicado\n20 a 25 dígitos", "proceso", "proceso", ["R10"], "Consulta"),
      N("BB", "cases_by_radicado_batch\n1 a 50 ítems", "proceso", "proceso", ["R10", "R06"], "Consulta"),
      N("EM", "emails_by_court\n12 dígitos o radicado", "proceso", "proceso", ["R10"], "Consulta"),
      N("D2", "¿Demasiadas\ncoincidencias?", "decision", "decision", [], "Consulta"),
      N("LC", "Casos: radicado,\ndespacho, partes", "io", "entrada_salida", [], "Consulta"),
      N("VB", "¿Ítems bien\nformados?", "decision", "decision", ["R15"], "Consulta"),
      N("SRC", "Consulta Judicial\nen vivo · 10 créditos", "externo", "servicio_externo", ["R04", "R02"], "Consulta"),
      N("DIR", "Directorio de correos\ndataset semanal", "datos", "datos_almacen", ["R03"], "Consulta"),
      N("D3", "¿found?", "decision", "decision", [], "Resultado"),
      N("ACT", "Metadatos +\n40 actuaciones", "io", "entrada_salida", [], "Resultado"),
      N("NF", "found:false\nprivate_only", "io", "entrada_salida", [], "Resultado"),
      N("MB", "Buzón del despacho\ny áreas", "io", "entrada_salida", [], "Resultado"),
      N("E1", "too_many_results:\nnombre exacto", "io", "error_fallback", [], None),
      N("E2", "400 items.N\nnada se ejecuta", "io", "error_fallback", [], None),
      N("E3", "5xx upstream_error", "io", "error_fallback", [], None),
      N("FOK", "Fin: expediente\nactualizado", "terminador", "entrada_salida", [], None),
      N("FER", "Fin: refinar\no reintentar", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "D1"),
      E("D1", "BE", "nombre"), E("D1", "BR", "radicado"),
      E("D1", "BB", "lista"), E("D1", "EM", "correo"),
      E("BE", "D2"), E("D2", "E1", "sí", "error"), E("D2", "LC", "no"),
      E("LC", "BR", "remite a", "remision"),
      E("BR", "SRC"), E("BB", "VB"), E("VB", "SRC", "sí: por ítem"), E("VB", "E2", "no", "error"),
      E("SRC", "D3", "responde"), E("SRC", "E3", "falla", "error"),
      E("D3", "ACT", "sí"), E("D3", "NF", "no"),
      E("EM", "DIR"), E("DIR", "MB", "datos", "datos"),
      E("ACT", "FOK"), E("NF", "FOK"), E("MB", "FOK"),
      E("E1", "FER"), E("E2", "FER"), E("E3", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R02", "R03", "R04", "R06", "R10", "R11", "R15"],
  {"Entrada": "entrada_salida", "Consulta": "proceso", "Resultado": "entrada_salida"},
  es_dag=True,
  objetivo="Resolver procesos judiciales por parte, por radicado o en lote, y ubicar el correo oficial del despacho.")


# D03 · Jurisprudencia
D("D03", "Jurisprudencia de altas cortes y disciplina judicial", "Flujo de algoritmo",
  [
      N("S", "Pregunta\njurisprudencial", "terminador", "entrada_salida", [], "Búsqueda"),
      N("D1", "¿Corporación?", "decision", "decision", [], "Búsqueda"),
      N("CC", "corte_constitucional_\nrulings_search", "proceso", "proceso", ["R03"], "Búsqueda"),
      N("CS", "corte_suprema_\nrulings_search", "proceso", "proceso", ["R03"], "Búsqueda"),
      N("D2", "¿Antes de\ndic-2021?", "decision", "decision", [], "Búsqueda"),
      N("CE", "consejo_estado_search\nasíncrono", "proceso", "proceso", ["R04", "R05"], "Búsqueda"),
      N("SM", "samai_rulings_search\nheadnotes · tesis", "proceso", "proceso", ["R03"], "Búsqueda"),
      N("CN", "cndj_rulings_search\nen vivo", "proceso", "proceso", ["R04"], "Búsqueda"),
      N("F", "Acotar: tipo, año,\nfechas, ponente", "proceso", "control_orquestacion", ["R09"], "Búsqueda"),
      N("D3", "¿Texto\ncompleto?", "decision", "decision", [], "Lectura"),
      N("DET", "Detalle de la\nprovidencia", "proceso", "proceso", ["R08"], "Lectura"),
      N("PAG", "Leer por rangos\noffset · limit", "subproceso", "control_orquestacion", ["R19"], "Lectura"),
      N("RS", "Número, fecha, ponente,\ndecisión, enlace", "io", "entrada_salida", [], "Lectura"),
      N("E", "5xx · job_failed ·\ntexto sin paginar", "io", "error_fallback", ["R09"], None),
      N("FOK", "Fin: cita\nverificable", "terminador", "entrada_salida", [], None),
      N("FER", "Fin: reintentar\no acotar", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "D1"),
      E("D1", "CC", "Constitucional"), E("D1", "CS", "Suprema"),
      E("D1", "D2", "Consejo de Estado"), E("D1", "CN", "CNDJ"),
      E("D2", "CE", "sí"), E("D2", "SM", "no"),
      E("CC", "F"), E("CS", "F"), E("CE", "F"), E("SM", "F"), E("CN", "F"),
      E("F", "D3"), E("D3", "RS", "no"), E("D3", "DET", "sí"),
      E("DET", "PAG"), E("DET", "E", "falla", "error"),
      E("PAG", "RS", "texto íntegro", "datos"),
      E("RS", "FOK"), E("E", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R03", "R04", "R05", "R08", "R09", "R19"],
  {"Búsqueda": "proceso", "Lectura": "control_orquestacion"},
  es_dag=True,
  objetivo="Encontrar y leer completas las providencias de las cuatro corporaciones cubiertas, eligiendo el corpus correcto según la fecha.")


# D04 · Empresas
D("D04", "Empresas: RUES, Supersociedades, SIMEV y DIAN", "Flujo de algoritmo",
  [
      N("S", "Contraparte\nempresarial", "terminador", "entrada_salida", ["R11"], "Identificación"),
      N("D1", "¿Tienes\nNIT?", "decision", "decision", ["R10"], "Identificación"),
      N("RN", "rues_entities_by_name ·\nsecop_suppliers_search", "proceso", "proceso", ["R04", "R03"], "Identificación"),
      N("RU", "rues_entity_by_nit\nen vivo", "proceso", "proceso", ["R04", "R10"], "Identificación"),
      N("D2", "¿found?", "decision", "decision", [], "Identificación"),
      N("D3", "¿Reporta a\nSupersociedades?", "decision", "decision", [], "Profundización"),
      N("SS", "company · financial_\nstatements · filing_statements", "proceso", "proceso", ["R03"], "Profundización"),
      N("OW", "filing_ownership ·\nownership_search", "proceso", "proceso", ["R03"], "Profundización"),
      N("D4", "¿Emisor de\nvalores?", "decision", "decision", [], "Profundización"),
      N("SV", "simev_shareholders\ncortes jun · dic", "proceso", "proceso", ["R03"], "Profundización"),
      N("TR", "dian_trade_profile\n2017 en adelante", "proceso", "proceso", ["R03"], "Profundización"),
      N("QC", "Control de calidad\noutliers · nulos · DV", "proceso", "control_orquestacion", ["R09"], "Consolidación"),
      N("GR", "Ficha KYB + grafo\nde vinculados", "io", "entrada_salida", [], "Consolidación"),
      N("NF", "found:false:\nverificar NIT y DV", "io", "error_fallback", [], None),
      N("E", "Dataset no disponible\n→ reintentar", "io", "error_fallback", [], None),
      N("FOK", "Fin: decisión\nde vinculación", "terminador", "entrada_salida", [], None),
      N("FER", "Fin: corregir\no reintentar", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "D1"), E("D1", "RU", "sí"), E("D1", "RN", "no"),
      E("RN", "RU", "remite a: NIT", "remision"),
      E("RU", "D2"), E("D2", "D3", "sí"), E("D2", "NF", "no", "error"),
      E("D3", "SS", "sí"), E("D3", "D4", "no"),
      E("SS", "OW"), E("SS", "E", "falla", "error"),
      E("OW", "D4"), E("D4", "SV", "sí"), E("D4", "TR", "no"),
      E("SV", "TR"), E("TR", "QC"), E("QC", "GR"), E("GR", "FOK"),
      E("NF", "FER"), E("E", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R03", "R04", "R09", "R10", "R11"],
  {"Identificación": "proceso", "Profundización": "datos_almacen", "Consolidación": "control_orquestacion"},
  es_dag=True,
  objetivo="Construir una ficha de conocimiento de la empresa (KYB) con registro mercantil, finanzas, socios y comercio exterior.")


# D05 · Supersociedades jurisdiccional
D("D05", "Supersociedades: insolvencia, Baranda y Relatoría", "Flujo de algoritmo",
  [
      N("S", "Insolvencia o litigio\nsocietario", "terminador", "entrada_salida", [], "Consulta"),
      N("D1", "¿Qué\nnecesitas?", "decision", "decision", ["R10"], "Consulta"),
      N("INS", "insolvency_\nprocesses_search", "proceso", "proceso", ["R03"], "Consulta"),
      N("BAR", "baranda_*_search\nestados · autos", "proceso", "proceso", ["R03", "R08"], "Consulta"),
      N("CF", "baranda_\ncompany_file (vivo)", "proceso", "proceso", ["R04", "R05"], "Consulta"),
      N("REL", "relatoria_\ndocuments_search", "proceso", "proceso", ["R03"], "Consulta"),
      N("D2", "¿Disponible?", "decision", "decision", [], "Consulta"),
      N("RP", "Tipo, etapa,\nadmisión, cierre", "io", "entrada_salida", [], "Resultado"),
      N("DD", "baranda_decision\ntexto del auto", "io", "entrada_salida", ["R08"], "Resultado"),
      N("PV", "Providencias y\nentradas (10/pág.)", "io", "entrada_salida", [], "Resultado"),
      N("DOC", "relatoria_document\nproblemas jurídicos", "io", "entrada_salida", ["R19"], "Resultado"),
      N("E", "temporarily\nunavailable (T17)", "io", "error_fallback", [], None),
      N("FOK", "Fin: seguimiento\ndocumentado", "terminador", "entrada_salida", [], None),
      N("FER", "Fin: usar Baranda\no reintentar", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "D1"),
      E("D1", "INS", "reportado"), E("D1", "BAR", "estados y autos"),
      E("D1", "CF", "expediente"), E("D1", "REL", "doctrina"),
      E("INS", "D2"), E("D2", "RP", "sí"), E("D2", "E", "no", "error"),
      E("RP", "BAR", "remite a", "remision"),
      E("BAR", "DD"), E("CF", "PV"), E("REL", "DOC"),
      E("DD", "FOK"), E("PV", "FOK"), E("DOC", "FOK"), E("RP", "FOK"), E("E", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R03", "R04", "R05", "R08", "R10", "R19"],
  {"Consulta": "proceso", "Resultado": "entrada_salida"},
  es_dag=True,
  objetivo="Seguir procesos de insolvencia y litigios mercantiles combinando lo reportado anualmente con lo notificado a diario.")


# D06 · SECOP
D("D06", "Contratación pública: SECOP I y II y ANCP-CCE", "Flujo de algoritmo",
  [
      N("S", "Contratista, entidad,\nobjeto o id SECOP", "terminador", "entrada_salida", [], "Consulta"),
      N("D1", "¿Punto de\npartida?", "decision", "decision", ["R10"], "Consulta"),
      N("PF", "secop_profile\n1 llamada", "proceso", "proceso", ["R03"], "Consulta"),
      N("PR", "secop_processes_\nsearch", "proceso", "proceso", ["R03"], "Consulta"),
      N("D2", "¿Formato\ndel id?", "decision", "decision", ["R10"], "Consulta"),
      N("PA", "secop_plans_search\nPlan Anual", "proceso", "proceso", ["R03"], "Consulta"),
      N("CC", "ancp_cce_conceptos_\nsearch → concepto", "proceso", "proceso", ["R04"], "Consulta"),
      N("RC", "*_record\nmilisegundos", "proceso", "proceso", ["R03"], "Consulta"),
      N("LV", "secop_process ·\nsecop_contract", "proceso", "proceso", ["R04"], "Consulta"),
      N("D3", "¿found?", "decision", "decision", [], "Consulta"),
      N("DP", "contracts · awards ·\nbidders · sanctions", "subproceso", "proceso", ["R03"], "Consulta"),
      N("QC", "Control de calidad\nDV · pruebas · outliers", "proceso", "control_orquestacion", ["R09"], "Análisis"),
      N("OUT", "Perfil de riesgo o\ninteligencia de mercado", "io", "entrada_salida", [], "Análisis"),
      N("FB", "Vista viva sin el\nregistro (T44)", "io", "error_fallback", [], None),
      N("FOK", "Fin: hallazgo\ntrazable", "terminador", "entrada_salida", [], None),
  ],
  [
      E("S", "D1"),
      E("D1", "PF", "documento"), E("D1", "PR", "texto"), E("D1", "D2", "id"),
      E("D1", "PA", "plan", minlen=2), E("D1", "CC", "concepto", minlen=2),
      E("PR", "RC", "remite a", "remision"),
      E("D2", "RC", "secop_ii:…"), E("D2", "LV", "CO1.…"),
      E("LV", "D3"), E("D3", "QC", "sí"), E("D3", "FB", "no", "error"), E("FB", "RC", "remite a", "remision"),
      E("PF", "DP"), E("DP", "QC"), E("RC", "QC"), E("PA", "QC"),
      E("QC", "OUT"), E("CC", "OUT", "criterio", "datos"), E("OUT", "FOK"),
  ],
  ["S"], ["FOK"],
  ["R03", "R04", "R09", "R10"],
  {"Consulta": "proceso", "Análisis": "control_orquestacion"},
  es_dag=True,
  objetivo="Responder qué ha contratado una persona o entidad con el Estado y con qué riesgos, desde los 16 endpoints de SECOP.")


# D07 · Personas
D("D07", "Verificación de personas naturales", "Flujo de algoritmo con compuerta legal",
  [
      N("S", "Verificación de\nuna persona", "terminador", "entrada_salida", ["R10"], "Compuerta"),
      N("L", "¿Finalidad y\nbase legal?", "decision", "decision", ["R11"], "Compuerta"),
      N("T", "¿Qué exige la\nfinalidad?", "decision", "decision", [], "Consulta"),
      N("RG", "registraduria_\nvital_status", "proceso", "proceso", ["R04"], "Consulta"),
      N("AN", "policía · procuraduría\ncontraloría · contaduría", "proceso", "proceso", ["R04", "R05"], "Consulta"),
      N("SG", "adres · ruaf\n(fecha expedición)", "proceso", "proceso", ["R04", "R05"], "Consulta"),
      N("SO", "dnp_social_\nclassification", "proceso", "proceso", ["R04"], "Consulta"),
      N("IP", "sicaac · fiscalia_case\n(21 dígitos)", "proceso", "proceso", ["R04", "R05"], "Consulta"),
      N("RC", "registro_civil_\nbirth_record", "proceso", "proceso", ["R04"], "Consulta"),
      N("J", "Trabajos asíncronos\nMCP espera en línea", "subproceso", "control_orquestacion", ["R05", "R02"], "Consulta"),
      N("V", "¿Resultado?", "decision", "decision", [], "Evidencia"),
      N("NF", "found:false\ndefinitivo", "io", "entrada_salida", [], "Evidencia"),
      N("VR", "Veredicto + frase\ntextual + fecha", "io", "entrada_salida", [], "Evidencia"),
      N("EX", "Expediente con\nminimización", "proceso", "control_orquestacion", ["R11"], "Evidencia"),
      N("NO", "No consultar:\nsin base legal", "io", "error_fallback", [], None),
      N("E", "5xx · RUAF:\nissue_date_matches", "io", "error_fallback", [], None),
      N("FOK", "Fin: decisión\ndocumentada", "terminador", "entrada_salida", [], None),
      N("FER", "Fin: abstención\no reintento", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "L"), E("L", "T", "sí"), E("L", "NO", "no", "error"),
      E("T", "RG", "identidad"), E("T", "AN", "antecedentes"), E("T", "SG", "seg. social"),
      E("T", "SO", "Sisbén", minlen=2), E("T", "IP", "insolvencia", minlen=2), E("T", "RC", "reg. civil", minlen=2),
      E("RG", "V"), E("SO", "V"), E("RC", "V"),
      E("AN", "J"), E("SG", "J"), E("IP", "J"),
      E("J", "V", "completed"), E("J", "E", "falla", "error"),
      E("V", "NF", "no"), E("V", "VR", "sí"),
      E("NF", "EX"), E("VR", "EX"), E("EX", "FOK"),
      E("NO", "FER"), E("E", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R02", "R04", "R05", "R10", "R11"],
  {"Compuerta": "decision", "Consulta": "proceso", "Evidencia": "control_orquestacion"},
  es_dag=True,
  objetivo="Verificar a una persona solo cuando existe finalidad y base legal, y dejar evidencia de cada veredicto.")


# D08 · Vehículos
D("D08", "Vehículos y tránsito: RUNT y SIMIT", "Flujo de algoritmo",
  [
      N("S", "Placa (y documento\ndel propietario)", "terminador", "entrada_salida", ["R10"], "Compuerta"),
      N("L", "¿Base legal\npara el titular?", "decision", "decision", ["R11"], "Compuerta"),
      N("D1", "¿Qué\nnecesitas?", "decision", "decision", [], "Consulta"),
      N("VP", "runt_vehicle_by_plate\nplaca + documento", "proceso", "proceso", ["R04"], "Consulta"),
      N("VH", "runt_vehicle_history_\nby_plate", "proceso", "proceso", ["R04"], "Consulta"),
      N("CD", "runt_citizen_by_\ndocument", "proceso", "proceso", ["R04"], "Consulta"),
      N("CP", "runt_citizen_by_\nplate", "proceso", "proceso", ["R04"], "Consulta"),
      N("SI", "simit_account_status\nplaca o documento", "proceso", "proceso", ["R04"], "Consulta"),
      N("J", "Trabajo asíncrono\nen vivo · 10 créditos", "subproceso", "control_orquestacion", ["R05", "R02"], "Consulta"),
      N("V", "¿found?", "decision", "decision", [], "Resultado"),
      N("NF", "found:false", "io", "entrada_salida", [], "Resultado"),
      N("BE", "SOAT · RTM · prendas\nblindaje · multas", "io", "entrada_salida", [], "Resultado"),
      N("OUT", "Suscripción, crédito\no cobranza", "proceso", "control_orquestacion", [], "Resultado"),
      N("NO", "No consultar\ndatos personales", "io", "error_fallback", [], None),
      N("E", "5xx upstream_error", "io", "error_fallback", [], None),
      N("FOK", "Fin: decisión\nvehicular", "terminador", "entrada_salida", [], None),
      N("FER", "Fin: abstención\no reintento", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "L"), E("L", "D1", "sí"), E("L", "NO", "no", "error"),
      E("D1", "VP", "ficha"), E("D1", "VH", "historial"), E("D1", "SI", "multas"),
      E("D1", "CD", "conductor", minlen=2), E("D1", "CP", "propietario", minlen=2),
      E("VP", "J"), E("VH", "J"), E("CD", "J"), E("CP", "J"), E("SI", "J"),
      E("J", "V", "completed"), E("J", "E", "falla", "error"),
      E("V", "NF", "no"), E("V", "BE", "sí"),
      E("NF", "OUT"), E("BE", "OUT"), E("OUT", "FOK"),
      E("NO", "FER"), E("E", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R02", "R04", "R05", "R10", "R11"],
  {"Compuerta": "decision", "Consulta": "proceso", "Resultado": "entrada_salida"},
  es_dag=True,
  objetivo="Resolver la situación jurídica, técnica y de multas de un vehículo o de un conductor.")


# D09 · Conexiones y factura electrónica
D("D09", "Fuentes con sesión del titular y factura electrónica", "Flujo de algoritmo",
  [
      N("S", "Registros propios o\nvalidar una factura", "terminador", "entrada_salida", ["R11"], "Entrada"),
      N("D1", "¿Requiere\nsesión?", "decision", "decision", [], "Entrada"),
      N("FE", "dian_electronic_document\nCUFE + NIT · caché 24 h", "proceso", "proceso", ["R04", "R10", "R06"], "Factura"),
      N("PD", "¿PDF\nprotegido?", "decision", "decision", [], "Factura"),
      N("PW", "Sugerir contraseñas\n(NIT emisor sin DV…)", "io", "entrada_salida", [], "Factura"),
      N("C", "¿Conexión\nactiva?", "decision", "decision", ["R12"], "Conexión"),
      N("CON", "*_connect: enlace\nseguro · máx. 5", "proceso", "recurso_infra", ["R12", "R01"], "Conexión"),
      N("Q", "Facturas · exógena\ncuentas · movimientos", "proceso", "proceso", ["R04", "R02"], "Conexión"),
      N("QC", "¿Conexión\nutilizable?", "decision", "decision", ["R12"], "Conexión"),
      N("J", "Trabajo asíncrono\nno compartido", "subproceso", "control_orquestacion", ["R05"], "Conexión"),
      N("OUT", "Datos del titular\naño cerrado", "io", "entrada_salida", [], None),
      N("E", "409 · 422 · 429\nconnections_*", "io", "error_fallback", [], None),
      N("FOK", "Fin: información\ndel titular", "terminador", "entrada_salida", [], None),
      N("FER", "Fin: reconectar o\nesperar cupo", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "D1"), E("D1", "FE", "no"), E("D1", "C", "sí"),
      E("FE", "PD"), E("PD", "PW", "sí"), E("PD", "OUT", "no"),
      E("C", "Q", "sí"), E("C", "CON", "no"), E("CON", "Q", "verificada"),
      E("Q", "QC"), E("QC", "J", "sí"), E("QC", "E", "no", "error"),
      E("J", "OUT"), E("OUT", "FOK"), E("PW", "FOK"), E("E", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R01", "R02", "R04", "R05", "R06", "R10", "R11", "R12"],
  {"Entrada": "entrada_salida", "Factura": "proceso", "Conexión": "recurso_infra"},
  es_dag=True,
  objetivo="Acceder a información que solo existe tras iniciar sesión, sin que las credenciales pasen por la conversación.")


# D10 · Normativa
D("D10", "Normativa y regulación", "Flujo de algoritmo",
  [
      N("S", "Pregunta normativa\no vigilancia", "terminador", "entrada_salida", [], "Búsqueda"),
      N("D1", "¿Tipo de\nnorma?", "decision", "decision", [], "Búsqueda"),
      N("FP", "funcion_publica_\nnorms_search", "proceso", "proceso", ["R03"], "Búsqueda"),
      N("IM", "imprenta_gaceta_\ndocuments_search", "proceso", "proceso", ["R03"], "Búsqueda"),
      N("DO", "imprenta_diarios_\nsearch", "proceso", "proceso", ["R03"], "Búsqueda"),
      N("SF", "superfinanciera_\nregulations · doctrine", "proceso", "proceso", ["R03"], "Búsqueda"),
      N("CR", "creg_acts_search", "proceso", "proceso", ["R03", "R08"], "Búsqueda"),
      N("DI", "dian_doctrina_search\nen vivo", "proceso", "proceso", ["R04"], "Búsqueda"),
      N("SC", "sic_normativa_\nregulations · bulletins", "proceso", "proceso", ["R03", "R08"], "Búsqueda"),
      N("F", "Acotar: tipo, número,\naño, fechas, entidad", "proceso", "control_orquestacion", ["R09"], "Búsqueda"),
      N("D3", "¿capped o\nexcesivo?", "decision", "decision", [], "Lectura"),
      N("D2", "¿Texto\ncompleto?", "decision", "decision", [], "Lectura"),
      N("PG", "Leer por rangos\n(> 1 M caracteres)", "subproceso", "control_orquestacion", ["R19"], "Lectura"),
      N("G", "Grafo normativo:\namendments · norm_id", "io", "entrada_salida", [], "Lectura"),
      N("E", "Afinar consulta\n(too_many · capped)", "io", "error_fallback", [], None),
      N("FOK", "Fin: norma vigente\ncon fuente", "terminador", "entrada_salida", [], None),
  ],
  [
      E("S", "D1"),
      E("D1", "FP", "administrativa"), E("D1", "IM", "legislativa"), E("D1", "SF", "financiera"),
      E("D1", "DI", "tributaria"),
      E("D1", "DO", "Diario Oficial", minlen=2), E("D1", "CR", "energía", minlen=2), E("D1", "SC", "SIC", minlen=2),
      E("FP", "F"), E("IM", "F"), E("DO", "F"), E("SF", "F"), E("CR", "F"), E("DI", "F"), E("SC", "F"),
      E("F", "D3"), E("D3", "E", "sí", "error"), E("E", "F", "reintentar"), E("D3", "D2", "no"),
      E("D2", "PG", "sí"), E("D2", "G", "no"), E("PG", "G", "texto íntegro", "datos"), E("G", "FOK"),
  ],
  ["S"], ["FOK"],
  ["R03", "R04", "R08", "R09", "R19"],
  {"Búsqueda": "proceso", "Lectura": "control_orquestacion"},
  objetivo="Localizar la norma correcta, leerla completa y reconstruir sus modificaciones.")


# D11 · SIC
D("D11", "Superintendencia de Industria y Comercio", "Flujo de algoritmo",
  [
      N("S", "Asunto ante la SIC", "terminador", "entrada_salida", [], "Consulta"),
      N("D1", "¿Qué\nbuscas?", "decision", "decision", [], "Consulta"),
      N("PI", "sic_ip_*_search →\nmarca · patente · diseño", "proceso", "proceso", ["R03", "R07"], "Consulta"),
      N("PO", "sic_ip_trademarks_\nby_owner (vivo)", "proceso", "proceso", ["R04", "R10"], "Consulta"),
      N("GZ", "sic_gazette_entries_\nsearch", "proceso", "proceso", ["R03", "R08"], "Consulta"),
      N("SA", "sic_sanctions_\nsanctions_search", "proceso", "proceso", ["R03"], "Consulta"),
      N("AC", "sic_actos_acts_search\n→ sic_actos_act", "proceso", "proceso", ["R03", "R08"], "Consulta"),
      N("TR", "sic_tramites_case\naño · número · parte", "proceso", "proceso", ["R04", "R10", "R05"], "Consulta"),
      N("D2", "¿Resultados?", "decision", "decision", [], "Consulta"),
      N("D3", "¿Documento\nde una parte?", "decision", "decision", [], "Consulta"),
      N("DOCS", "Actuaciones, actos\ny documentos", "io", "entrada_salida", ["R08"], "Resultado"),
      N("OUT", "Vigilancia marcaria o\ndebida diligencia", "io", "entrada_salida", [], "Resultado"),
      N("NF", "found:false: inexistente\no no-parte", "io", "error_fallback", [], None),
      N("E", "0 resultados: simplificar\nla consulta (T43)", "io", "error_fallback", [], None),
      N("FOK", "Fin: decisión de PI\no cumplimiento", "terminador", "entrada_salida", [], None),
      N("FER", "Fin: verificar\no simplificar", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "D1"),
      E("D1", "PI", "signo"), E("D1", "PO", "titular"), E("D1", "AC", "actos"),
      E("D1", "GZ", "gaceta", minlen=2), E("D1", "SA", "multas", minlen=2), E("D1", "TR", "radicado", minlen=2),
      E("AC", "D2"), E("D2", "OUT", "sí"), E("D2", "E", "no", "error"),
      E("TR", "D3"), E("D3", "DOCS", "sí"), E("D3", "NF", "no", "error"),
      E("PI", "OUT"), E("PO", "OUT"), E("GZ", "OUT"), E("SA", "OUT"),
      E("DOCS", "FOK"), E("OUT", "FOK"), E("NF", "FER"), E("E", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R03", "R04", "R05", "R07", "R08", "R10"],
  {"Consulta": "proceso", "Resultado": "entrada_salida"},
  es_dag=True,
  objetivo="Cubrir propiedad industrial, protección al consumidor y seguimiento de radicados ante la SIC.")


# D12 · IGAC
D("D12", "Catastro nacional del IGAC", "Flujo de algoritmo",
  [
      N("S", "Ubicación, dirección\no número predial", "terminador", "entrada_salida", ["R10"], "Consulta"),
      N("D1", "¿Catastro\ndel IGAC?", "decision", "decision", ["R18"], "Consulta"),
      N("D2", "¿Qué\ntienes?", "decision", "decision", [], "Consulta"),
      N("PT", "igac_property_by_point\nlat · lon WGS84", "proceso", "proceso", ["R07"], "Consulta"),
      N("PS", "igac_properties_search\nmunicipio · manzana", "proceso", "proceso", ["R03", "R18"], "Consulta"),
      N("PR", "igac_property\nlookup 30 días", "proceso", "proceso", ["R07", "R04"], "Consulta"),
      N("D3", "¿Hay predio\nen el punto?", "decision", "decision", [], "Consulta"),
      N("AV", "Avalúo, áreas, destino,\npolígono GeoJSON", "io", "entrada_salida", [], "Contexto"),
      N("ZN", "economic_zones ·\nphysical_zones · parcel", "proceso", "datos_almacen", ["R03"], "Contexto"),
      N("ST", "igac_municipal_\nstatistics", "proceso", "datos_almacen", ["R03"], "Contexto"),
      N("NF", "found:false\nespacio público", "io", "entrada_salida", [], "Contexto"),
      N("NO", "Gestor catastral\npropio (5 territorios)", "io", "error_fallback", [], None),
      N("FOK", "Fin: avalúo\ncon contexto", "terminador", "entrada_salida", [], None),
      N("FER", "Fin: consultar\nal gestor", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "D1"), E("D1", "D2", "sí"), E("D1", "NO", "no", "error"),
      E("D2", "PT", "coordenadas"), E("D2", "PS", "municipio"), E("D2", "PR", "número"),
      E("PS", "PR", "remite a", "remision"),
      E("PT", "D3"), E("D3", "AV", "sí"), E("D3", "NF", "no"),
      E("PR", "AV"), E("AV", "ZN"), E("ZN", "ST"), E("ST", "FOK"), E("NF", "FOK"), E("NO", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R03", "R04", "R07", "R10", "R18"],
  {"Consulta": "proceso", "Contexto": "datos_almacen"},
  es_dag=True,
  objetivo="Obtener el avalúo y la geometría de un predio y entender el valor del suelo que lo rodea.")


# D13 · Estadística
D("D13", "Estadística oficial: DANE, BanRep, DNP, ICFES, MinEducación", "Pipeline (DAG)",
  [
      N("S", "Pregunta socio o\nmacroeconómica", "terminador", "entrada_salida", [], "Fuentes"),
      N("D1", "¿Ámbito?", "decision", "decision", [], "Fuentes"),
      N("BR", "banrep_series_search\n→ banrep_series", "proceso", "proceso", ["R03"], "Fuentes"),
      N("BI", "banrep_research_\npublications_search", "proceso", "proceso", ["R03", "R19"], "Fuentes"),
      N("DN", "dane_poverty · labour_\nmarket · ipm · census", "proceso", "proceso", ["R03"], "Fuentes"),
      N("TD", "terridata_indicators\n→ series · ranking", "proceso", "proceso", ["R03"], "Fuentes"),
      N("ED", "icfes_saber11_* ·\nmineducacion", "proceso", "proceso", ["R03"], "Fuentes"),
      N("DV", "Normalizar territorio\nDIVIPOLA 2 o 5 dígitos", "proceso", "control_orquestacion", ["R18"], "Preparación"),
      N("AS", "¿as_of y\nperiodicidad?", "decision", "decision", ["R03"], "Preparación"),
      N("OUT", "Tablero o modelo\nterritorial con fuente", "io", "entrada_salida", [], "Preparación"),
      N("E", "Advertir rezago o\nserie descontinuada", "io", "error_fallback", [], None),
      N("FOK", "Fin: indicador\ntrazable", "terminador", "entrada_salida", [], None),
  ],
  [
      E("S", "D1"),
      E("D1", "BR", "macro"), E("D1", "DN", "pobreza"), E("D1", "TD", "territorial"),
      E("D1", "BI", "investigación", minlen=2), E("D1", "ED", "educación", minlen=2),
      E("BR", "DV"), E("BI", "DV"), E("DN", "DV"), E("TD", "DV"), E("ED", "DV"),
      E("DV", "AS"), E("AS", "OUT", "sí"), E("AS", "E", "no", "error"), E("E", "OUT", "advertencia"),
      E("OUT", "FOK"),
  ],
  ["S"], ["FOK"],
  ["R03", "R18", "R19"],
  {"Fuentes": "proceso", "Preparación": "control_orquestacion"},
  es_dag=True,
  objetivo="Combinar series oficiales en un mismo eje territorial y temporal sin perder la fecha de corte.")


# D14 · Sectoriales
D("D14", "Fuentes sectoriales: INVIMA, ANM y SIATA", "Flujo de algoritmo",
  [
      N("S", "Verificación\nsectorial", "terminador", "entrada_salida", [], "Consulta"),
      N("D1", "¿Sector?", "decision", "decision", [], "Consulta"),
      N("IN", "invima_registrations ·\nmedicines (CUM, ATC)", "proceso", "proceso", ["R03"], "Consulta"),
      N("AN", "anm_notices_search\n→ anm_notice", "proceso", "proceso", ["R03", "R08", "R19"], "Consulta"),
      N("SI", "siata_geoportal_*\naire · lluvia · ríos", "proceso", "proceso", ["R04"], "Consulta"),
      N("IV", "¿Vigente y\nCUM activo?", "decision", "decision", [], "Consulta"),
      N("QS", "¿Valor\n−999?", "decision", "decision", [], "Consulta"),
      N("OKV", "Producto\nhabilitado", "io", "entrada_salida", [], "Resultado"),
      N("NOT", "Estados, avisos\ny edictos", "io", "entrada_salida", [], "Resultado"),
      N("AMB", "Lectura válida\ncon ICA", "io", "entrada_salida", [], "Resultado"),
      N("AL", "Alerta: vencido\no inactivo", "io", "error_fallback", [], None),
      N("DS", "Descartar lectura\ninválida", "io", "error_fallback", [], None),
      N("FOK", "Fin: verificación\nsectorial", "terminador", "entrada_salida", [], None),
  ],
  [
      E("S", "D1"),
      E("D1", "IN", "sanitario"), E("D1", "AN", "minero"), E("D1", "SI", "ambiental"),
      E("IN", "IV"), E("IV", "OKV", "sí"), E("IV", "AL", "no", "error"),
      E("AN", "NOT"),
      E("SI", "QS"), E("QS", "DS", "sí", "error"), E("QS", "AMB", "no"),
      E("OKV", "FOK"), E("NOT", "FOK"), E("AMB", "FOK"), E("AL", "FOK"), E("DS", "FOK"),
  ],
  ["S"], ["FOK"],
  ["R03", "R04", "R08", "R19"],
  {"Consulta": "proceso", "Resultado": "entrada_salida"},
  es_dag=True,
  objetivo="Verificar habilitaciones sanitarias, notificaciones mineras y condiciones ambientales en tiempo real.")


# D15 · Trámites y herramientas web
D("D15", "Trámites del Estado y herramientas web", "Flujo de algoritmo",
  [
      N("S", "Duda sobre un trámite\no una página pública", "terminador", "entrada_salida", [], "Consulta"),
      N("D1", "¿Dónde está la\ninformación?", "decision", "decision", [], "Consulta"),
      N("SU", "suit_procedures_search\n→ suit_procedure", "proceso", "proceso", ["R03", "R19"], "Consulta"),
      N("GP", "gov_pages_search\n→ gov_pages_page", "proceso", "proceso", ["R03", "R19"], "Consulta"),
      N("X", "extract_* ·\ngenerate_json", "proceso", "modelo_ia", ["R17", "R04"], "Consulta"),
      N("RS", "research ·\nweb_search", "proceso", "modelo_ia", ["R09"], "Consulta"),
      N("D2", "¿Página\nextraíble?", "decision", "decision", [], "Consulta"),
      N("OUT", "Respuesta ciudadana\ncon enlace oficial", "io", "entrada_salida", [], None),
      N("E", "Internal error\n(gov.co, T52)", "io", "error_fallback", [], None),
      N("FOK", "Fin: orientación\nverificable", "terminador", "entrada_salida", [], None),
  ],
  [
      E("S", "D1"),
      E("D1", "SU", "SUIT"), E("D1", "GP", "sitio entidad"),
      E("D1", "X", "otra página"), E("D1", "RS", "pregunta abierta"),
      E("X", "D2"), E("D2", "OUT", "sí"), E("D2", "E", "no", "error"),
      E("E", "SU", "remite a", "remision"),
      E("SU", "OUT"), E("GP", "OUT"), E("RS", "OUT"), E("OUT", "FOK"),
  ],
  ["S"], ["FOK"],
  ["R03", "R04", "R09", "R17", "R19"],
  {"Consulta": "proceso"},
  es_dag=True,
  objetivo="Responder preguntas ciudadanas sobre trámites con la ficha oficial y, si hace falta, con extracción web.")


# D16 · Monitores
D("D16", "Monitores: alertas programadas por correo", "Máquina de estados / flujo",
  [
      N("S", "«Avísame\ncuando…»", "terminador", "entrada_salida", [], "Configuración"),
      N("EN", "¿Monitores\nhabilitados?", "decision", "decision", ["R01"], "Configuración"),
      N("Q", "El agente ejecuta\nla búsqueda", "proceso", "modelo_ia", ["R09"], "Configuración"),
      N("R", "¿Hay\ndestinatarios?", "decision", "decision", [], "Configuración"),
      N("ASK", "Preguntar correos\n(máx. 3, no adivinar)", "io", "entrada_salida", ["R13"], "Configuración"),
      N("CR", "create_monitor\nendpoint + query", "proceso", "control_orquestacion", ["R15"], "Configuración"),
      N("CA", "¿Dataset\no vivo?", "decision", "decision", ["R03"], "Ejecución"),
      N("FR", "Primera ejecución\n≤500 filas + bienvenida", "proceso", "proceso", ["R02", "R04"], "Ejecución"),
      N("RU", "Ejecuciones: nuevos\no changes", "proceso", "proceso", ["R02"], "Ejecución"),
      N("RL", "¿Filtro de\nrelevancia?", "decision", "decision", ["R14"], "Ejecución"),
      N("LLM", "Evaluar filas\nrelevant:false", "proceso", "modelo_ia", ["R14"], "Ejecución"),
      N("M", "Correo\nalways · on_new", "io", "entrada_salida", ["R13"], "Ejecución"),
      N("E1", "monitors_not_\nenabled (T46)", "io", "error_fallback", [], None),
      N("E2", "schedule_faster_than_\nsource · tope 20", "io", "error_fallback", [], None),
      N("E3", "skipped_plan_limit\n· truncated", "io", "error_fallback", [], None),
      N("FOK", "Fin: alerta\nentregada", "terminador", "entrada_salida", [], None),
      N("FER", "Fin: pedir acceso\no corregir", "terminador", "error_fallback", [], None),
  ],
  [
      E("S", "EN"), E("EN", "Q", "sí"), E("EN", "E1", "no", "error"),
      E("Q", "R"), E("R", "CR", "sí"), E("R", "ASK", "no"), E("ASK", "CR"),
      E("CR", "CA", "creado"), E("CR", "E2", "rechazado", "error"),
      E("CA", "FR", "dataset: source, 1 crédito"), E("CA", "FR", "vivo: daily/weekly"),
      E("FR", "RU"), E("RU", "RL"), E("RU", "E3", "sin créditos", "error"),
      E("RL", "LLM", "sí"), E("RL", "M", "no"), E("LLM", "M"), E("E3", "M", "aviso"),
      E("M", "FOK"), E("E1", "FER"), E("E2", "FER"),
  ],
  ["S"], ["FOK", "FER"],
  ["R01", "R02", "R03", "R04", "R09", "R13", "R14", "R15"],
  {"Configuración": "control_orquestacion", "Ejecución": "proceso"},
  es_dag=True,
  objetivo="Convertir una consulta en una vigilancia programada que avisa por correo solo lo nuevo.")
