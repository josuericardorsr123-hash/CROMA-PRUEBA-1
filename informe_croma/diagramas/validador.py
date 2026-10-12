"""Motor de validación de diagramas (§9 del Arquitecto de Diagramas v1.0).

El código de las funciones de validación reproduce la especificación §9 sin
cambios de lógica. Se añade `color_texto_optimo` para elegir, por categoría,
el color de texto (blanco o negro) que cumpla contraste AA, y
`contraste_con_texto_elegido` para reportarlo en la validación.
"""
from collections import defaultdict, deque


# ── Reachability desde inicio ──
def alcanzables(nodos, aristas, inicios):
    adj = defaultdict(list)
    for e in aristas:
        adj[e['origen']].append(e['destino'])
    vistos, cola = set(inicios), deque(inicios)
    while cola:
        n = cola.popleft()
        for m in adj[n]:
            if m not in vistos:
                vistos.add(m)
                cola.append(m)
    return vistos


# ── Todo nodo llega a un terminal ──
def llega_a_terminal(nodos, aristas, terminales):
    radj = defaultdict(list)
    for e in aristas:
        radj[e['destino']].append(e['origen'])
    ok, cola = set(terminales), deque(terminales)
    while cola:
        n = cola.popleft()
        for m in radj[n]:
            if m not in ok:
                ok.add(m)
                cola.append(m)
    return {n['id'] for n in nodos} - ok  # nodos que NO llegan a terminal


# ── Decisiones con ramas etiquetadas ──
def decisiones_incompletas(nodos, aristas):
    salidas = defaultdict(list)
    for e in aristas:
        salidas[e['origen']].append(e.get('etiqueta', '').strip())
    malas = []
    for n in nodos:
        if n['tipo'] == 'decision':
            et = salidas[n['id']]
            if len([x for x in et if x]) < 2:
                malas.append(n['id'])
    return malas


# ── Aristas colgantes y nodos aislados ──
def integridad_estructural(nodos, aristas):
    ids = {n['id'] for n in nodos}
    colgantes = [e for e in aristas if e['origen'] not in ids or e['destino'] not in ids]
    con_arista = set()
    for e in aristas:
        con_arista.add(e['origen'])
        con_arista.add(e['destino'])
    aislados = [n['id'] for n in nodos if n['id'] not in con_arista]
    return {"aristas_colgantes": colgantes, "nodos_aislados": aislados}


# ── Recursos: existencia y huérfanos ──
def integridad_recursos(nodos, registro):
    ids_reg = set(registro.keys())
    referenciados, faltantes = set(), []
    for n in nodos:
        for r in n.get('recursos_requeridos', []):
            referenciados.add(r)
            if r not in ids_reg:
                faltantes.append((n['id'], r))
    huerfanos = [r for r in ids_reg if r not in referenciados]
    return {"recursos_faltantes": faltantes, "recursos_huerfanos": huerfanos}


# ── Regla de dependencia de Clean Architecture ──
def viola_dependencia_clean(nodos, aristas):
    """Aristas tipo 'dependencia' deben ir de capa mayor a menor (afuera→adentro)."""
    capa = {n['id']: n.get('capa') for n in nodos}
    violaciones = []
    for e in aristas:
        if e.get('tipo') == 'dependencia':
            co, cd = capa.get(e['origen']), capa.get(e['destino'])
            if co is not None and cd is not None and cd > co:
                violaciones.append(e)  # apunta hacia afuera → prohibido
    return violaciones


# ── Ciclos (para DAG/pipeline que no deben tenerlos) ──
def tiene_ciclo(nodos, aristas):
    adj = defaultdict(list)
    for e in aristas:
        adj[e['origen']].append(e['destino'])
    color = {n['id']: 0 for n in nodos}  # 0 blanco,1 gris,2 negro

    def dfs(u):
        color[u] = 1
        for v in adj[u]:
            if color.get(v, 0) == 1:
                return True
            if color.get(v, 0) == 0 and dfs(v):
                return True
        color[u] = 2
        return False
    return any(color[n['id']] == 0 and dfs(n['id']) for n in nodos)


# ── Contraste de texto sobre color de nodo (WCAG) ──
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _lum(h):
    h = h.lstrip('#')
    r, g, b = (_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(t, f):
    a, b = _lum(t), _lum(f)
    return round((max(a, b) + 0.05) / (min(a, b) + 0.05), 2)


def color_legible(paleta, texto_hex="#FFFFFF", minimo=4.5):
    return {cat: {"ratio": contraste(texto_hex, hexv), "pasa": contraste(texto_hex, hexv) >= minimo}
            for cat, hexv in paleta.items()}


# ── Extensión: texto óptimo por categoría (no altera la compuerta) ──
def color_texto_optimo(fondo_hex):
    blanco, negro = contraste("#FFFFFF", fondo_hex), contraste("#000000", fondo_hex)
    return ("#FFFFFF", blanco) if blanco >= negro else ("#000000", negro)


def contraste_con_texto_elegido(paleta, minimo=4.5):
    out = {}
    for cat, hexv in paleta.items():
        txt, ratio = color_texto_optimo(hexv)
        out[cat] = {"fondo": hexv, "texto": txt, "ratio": ratio, "pasa": ratio >= minimo}
    return out


# ── Compuerta de completitud ──
def validar_diagrama(nodos, aristas, registro, paleta, inicios, terminales,
                     es_dag=False):
    alc = alcanzables(nodos, aristas, inicios)
    no_alcanzables = [n['id'] for n in nodos if n['id'] not in alc]
    no_terminan = list(llega_a_terminal(nodos, aristas, terminales))
    dec = decisiones_incompletas(nodos, aristas)
    estr = integridad_estructural(nodos, aristas)
    rec = integridad_recursos(nodos, registro)
    clean = viola_dependencia_clean(nodos, aristas)
    ciclo = tiene_ciclo(nodos, aristas) if es_dag else False
    contraste_fallos = [c for c, v in color_legible(paleta).items() if not v['pasa']]

    checks = {
        "nodos_no_alcanzables": no_alcanzables,
        "nodos_sin_terminal": no_terminan,
        "decisiones_incompletas": dec,
        "aristas_colgantes": estr['aristas_colgantes'],
        "nodos_aislados": estr['nodos_aislados'],
        "recursos_faltantes": rec['recursos_faltantes'],
        "recursos_huerfanos": rec['recursos_huerfanos'],
        "violaciones_dependencia_clean": clean,
        "ciclo_en_dag": ciclo,
        "categorias_sin_contraste": contraste_fallos
    }
    bloqueantes = (no_alcanzables or no_terminan or dec or estr['aristas_colgantes']
                   or estr['nodos_aislados'] or rec['recursos_faltantes']
                   or clean or ciclo)
    return {"checks": checks,
            "veredicto": "BLOQUEADO" if bloqueantes else "APROBADO_RENDER",
            "nota": "Los recursos huérfanos y el contraste son ADVERTENCIA; el resto bloquea el render."}
