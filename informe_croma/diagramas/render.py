"""Valida (§9) y renderiza (§8) los diagramas definidos en modelos.py.

Uso: python3 render.py [salida_dir]
Sin veredicto APROBADO_RENDER no se genera ningún archivo para ese diagrama
(REGLA_02) y el proceso termina con código 1.
"""
import html
import json
import re
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modelos import DIAGRAMAS, PALETA, NOMBRE_CAT, RECURSOS, FECHA, VERSION  # noqa: E402
from composicion import PISTAS  # noqa: E402
from validador import (validar_diagrama, color_texto_optimo,  # noqa: E402
                       contraste_con_texto_elegido)

FUENTE = "Liberation Serif"  # métrica idéntica a Times New Roman; el SVG se reetiqueta
FORMAS = {
    "terminador": ("ellipse", 1),
    "proceso": ("box", 1),
    "decision": ("diamond", 1),
    "io": ("parallelogram", 1),
    "subproceso": ("box", 2),
    "datos": ("cylinder", 1),
    "externo": ("box3d", 1),
}
NOMBRE_FORMA = {
    "terminador": "óvalo", "proceso": "rectángulo", "decision": "rombo",
    "io": "paralelogramo", "subproceso": "rectángulo doble", "datos": "cilindro",
    "externo": "caja 3D",
}
ESTILO_ARISTA = {
    "flujo": {"color": "#404040", "style": "solid", "penwidth": "1.1"},
    "datos": {"color": "#404040", "style": "solid", "penwidth": "1.1"},
    "remision": {"color": "#332288", "style": "bold", "penwidth": "1.8"},
    "dependencia": {"color": "#117733", "style": "dashed", "penwidth": "1.2"},
    "error": {"color": "#D55E00", "style": "solid", "penwidth": "1.4"},
}
NOMBRE_ARISTA = {
    "flujo": "flujo", "datos": "dato (cursiva)",
    "remision": "remite a", "dependencia": "depende de",
    "error": "ruta de error",
}


def aclarar(hex_color, t):
    h = hex_color.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    r, g, b = (round(c + (255 - c) * t) for c in (r, g, b))
    return f"#{r:02X}{g:02X}{b:02X}"


def esc(s):
    return html.escape(s, quote=True)


def etiqueta_nodo(n, color_txt):
    lineas = n["label"].split("\n")
    if n["tipo"] == "decision":
        lineas = [" ".join(lineas)]
    partes = [f"<B>{esc(lineas[0])}</B>"] + [esc(x) for x in lineas[1:]]
    cuerpo = "<BR/>".join(partes)
    if n["recursos_requeridos"] and n["tipo"] != "decision":
        rec = " · ".join(n["recursos_requeridos"])
        cuerpo += f'<BR/><FONT POINT-SIZE="7" COLOR="{color_txt}"><I>rec. {esc(rec)}</I></FONT>'
    return f"<{cuerpo}>"


def leyenda(d, cats, tipos_arista):
    celdas = []
    for c in cats:
        formas = ", ".join(sorted(set(NOMBRE_FORMA[n["tipo"]] for n in d["nodos"] if n["cat"] == c)))
        celdas.append(f'<TD WIDTH="16" HEIGHT="10" BGCOLOR="{PALETA[c]}"></TD>'
                      f'<TD ALIGN="LEFT">{esc(NOMBRE_CAT[c])}</TD>')
    for t in tipos_arista:
        est = ESTILO_ARISTA[t]
        glifo = {"solid": "——→", "bold": "<B>——→</B>", "dashed": "- - →"}[est["style"]]
        celdas.append(f'<TD ALIGN="CENTER"><FONT COLOR="{est["color"]}">{glifo}</FONT></TD>'
                      f'<TD ALIGN="LEFT">{esc(NOMBRE_ARISTA[t])}</TD>')
    cols = 3
    filas = []
    for i in range(0, len(celdas), cols):
        fila = celdas[i:i + cols]
        fila += ['<TD></TD><TD></TD>'] * (cols - len(fila))
        filas.append("<TR>" + "".join(fila) + "</TR>")
    interior = ('<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="1" CELLPADDING="1">'
                + "".join(filas) + "</TABLE>")
    return ('<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="1">'
            '<TR><TD ALIGN="LEFT"><B>Leyenda</B> <FONT COLOR="#4D4D4D"><I>· formas: óvalo inicio/fin · '
            'rombo decisión · rectángulo proceso · paralelogramo E/S · cilindro datos · '
            'rec. Rxx = recursos</I></FONT></TD></TR>'
            f'<TR><TD ALIGN="LEFT">{interior}</TD></TR></TABLE>>')


def fase_efectiva(d):
    """Nodos sin fase → la fase más tardía de sus predecesores (bandas sin solape)."""
    fases = list(d["fases"])
    pos = {f: i for i, f in enumerate(fases)}
    fase = {n["id"]: n["fase"] for n in d["nodos"]}
    for t in d["terminales"]:
        if fase[t] is None:
            fase[t] = fases[-1]
    sin = [k for k, v in fase.items() if v is None]
    for _ in range(len(fase)):
        for k in sin:
            previas = [fase[e["origen"]] for e in d["aristas"]
                       if e["destino"] == k and fase[e["origen"]] is not None]
            if previas:
                fase[k] = max(previas, key=lambda f: pos[f])
    return {k: (v if v is not None else fases[-1]) for k, v in fase.items()}


MAX_POR_FILA = 4
ESTRATEGIAS = [(m, b, x, p) for p in (True, False) for m in ("natural", "filas")
               for b in (False, True) for x in (4, 3) if not (m == "natural" and x == 3)]


def asignar_filas(d, pista, bandas=True, max_fila=MAX_POR_FILA):
    """Capas por camino más largo + bandas por contenedor + plegado de filas.

    Solo decide la presentación (rank=same); el grafo validado no cambia.
    """
    ids = [n["id"] for n in d["nodos"]]
    fase = fase_efectiva(d) if bandas else {n["id"]: n["fase"] for n in d["nodos"]}
    excluir = set(pista.get("sin_restriccion", []))
    ady = {i: [] for i in ids}
    for e in d["aristas"]:
        if e["tipo"] == "remision" or (e["origen"], e["destino"]) in excluir:
            continue
        ady[e["origen"]].append(e["destino"])
    # aristas de retorno (ciclos) fuera de la restricción
    estado, retorno = {}, set()

    def dfs(u):
        estado[u] = 1
        for v in ady[u]:
            if estado.get(v) == 1:
                retorno.add((u, v))
            elif v not in estado:
                dfs(v)
        estado[u] = 2
    for i in d["inicios"] + ids:
        if i not in estado:
            dfs(i)
    grupos_fila = pista.get("mismo_rango", [])
    grupo_de = {i: gi for gi, g in enumerate(grupos_fila) for i in g}
    aristas = [(u, v) for u in ids for v in ady[u] if (u, v) not in retorno
               and not (u in grupo_de and grupo_de.get(v) == grupo_de[u])]
    orden_fases = [f for f in d["fases"]]
    piso = {i: 0 for i in ids}
    fila = {i: 0 for i in ids}
    for _ in range(200):
        cambio = False
        for u, v in aristas:
            if fila[v] < fila[u] + 1:
                fila[v] = fila[u] + 1
                cambio = True
        for i in ids:
            if fila[i] < piso[i]:
                fila[i] = piso[i]
                cambio = True
        for g in grupos_fila:
            r = max(fila[i] for i in g)
            for i in g:
                if fila[i] != r:
                    fila[i] = r
                    cambio = True
        # bandas: cada contenedor empieza debajo del anterior
        tope = -1
        for f in (orden_fases if bandas else []):
            miembros = [i for i in ids if fase[i] == f]
            if not miembros:
                continue
            for i in miembros:
                if piso[i] < tope + 1:
                    piso[i] = tope + 1
                    cambio = True
            tope = max(max(fila[i] for i in miembros), tope)
        # plegado: máximo MAX_POR_FILA nodos por fila y contenedor
        grupos = {}
        for i in ids:
            grupos.setdefault(fila[i], []).append(i)
        for r, miembros in grupos.items():
            if len(miembros) > max_fila:
                extra = sorted(miembros, key=ids.index)[max_fila:]
                for i in extra:
                    if piso[i] < r + 1:
                        piso[i] = r + 1
                        cambio = True
        if not cambio:
            break
    return fila


def dot_de(d, estrategia=("filas", True, 4, True)):
    cats = []
    for n in d["nodos"]:
        if n["cat"] not in cats:
            cats.append(n["cat"])
    tipos_arista = []
    for e in d["aristas"]:
        if e["tipo"] not in tipos_arista:
            tipos_arista.append(e["tipo"])
    titulo = (f'<<B>Croma × Colombia · {esc(d["titulo"])}</B><BR/>'
              f'<FONT POINT-SIZE="9">{esc(d["tipo_diagrama"])} · {VERSION} · {FECHA} · {d["clave"]}</FONT>>')
    L = ["digraph G {",
         f'  graph [fontname="{FUENTE}", fontsize=11.5, labelloc=t, labeljust=c, label={titulo},',
         '         rankdir=TB, newrank=true, compound=true, nodesep=0.16, ranksep=0.30,',
         '         splines=spline, pad=0.15, bgcolor="white"];',
         f'  node  [fontname="{FUENTE}", fontsize=10, style="filled", penwidth=0.9, margin="0.06,0.03"];',
         f'  edge  [fontname="{FUENTE}", fontsize=8.5, arrowsize=0.6];']
    modo, bandas, max_fila, con_pistas = estrategia
    fef = fase_efectiva(d) if bandas else {n["id"]: n["fase"] for n in d["nodos"]}
    for i, (fase, cat_fase) in enumerate(d["fases"].items()):
        col = PALETA[cat_fase]
        L.append(f'  subgraph cluster_{i} {{')
        L.append(f'    label=<<B>{esc(fase)}</B>>; fontsize=10; fontcolor="#1A1A1A"; labeljust=l;')
        L.append(f'    style="rounded,filled"; fillcolor="{aclarar(col, 0.90)}"; color="{aclarar(col, 0.45)}"; penwidth=1.0;')
        for n in d["nodos"]:
            if fef[n["id"]] == fase:
                L.append("    " + linea_nodo(n))
        L.append("  }")

    pista = PISTAS.get(d["clave"], {}) if con_pistas else {"sin_restriccion": PISTAS.get(d["clave"], {}).get("sin_restriccion", [])}
    for n in d["nodos"]:
        if fef[n["id"]] not in d["fases"]:
            L.append("  " + linea_nodo(n))
    if modo == "filas":
        filas = asignar_filas(d, pista, bandas, max_fila)
        for r in sorted(set(filas.values())):
            grupo = [i for i, v in filas.items() if v == r]
            L.append("  { rank=same; " + " ".join(f'"{x}";' for x in grupo) + " }")
    if modo == "natural":
        for grupo in pista.get("mismo_rango", []):
            L.append("  { rank=same; " + " ".join(f'"{x}";' for x in grupo) + " }")
    for e in d["aristas"]:
        est = ESTILO_ARISTA[e["tipo"]]
        attrs = [f'color="{est["color"]}"', f'style="{est["style"]}"', f'penwidth={est["penwidth"]}']
        if e["etiqueta"]:
            fc = "#D55E00" if e["tipo"] == "error" else ("#332288" if e["tipo"] == "remision" else "#262626")
            txt = esc(e["etiqueta"])
            if e["tipo"] == "datos":
                txt = f"<I>{txt}</I>"
            attrs.append(f'label=< {txt} >')
            attrs.append(f'fontcolor="{fc}"')
        if e["tipo"] == "remision" or (e["origen"], e["destino"]) in pista.get("sin_restriccion", []):
            attrs.append("constraint=false")
        for k, v in e.get("dot", {}).items():
            attrs.append(f"{k}={v}")
        for k, v in pista.get("aristas", {}).get((e["origen"], e["destino"]), {}).items():
            attrs.append(f"{k}={v}")
        L.append(f'  "{e["origen"]}" -> "{e["destino"]}" [{", ".join(attrs)}];')
    L.append(f'  "__leyenda" [shape=plain, style="", fontsize=9, label={leyenda(d, cats, tipos_arista)}];')
    for t in d["terminales"]:
        L.append(f'  "{t}" -> "__leyenda" [style=invis];')
    L.append("}")
    return "\n".join(L)


def linea_nodo(n):
    forma, peri = FORMAS[n["tipo"]]
    fondo = PALETA[n["cat"]]
    if n.get("nivel") == "N3":
        fondo = aclarar(fondo, 0.45)
    txt, _ = color_texto_optimo(fondo)
    borde = aclarar(fondo, -0.0) if False else "#1A1A1A"
    estilo = "filled,rounded" if forma == "box" else "filled"
    return (f'"{n["id"]}" [shape={forma}, peripheries={peri}, style="{estilo}", '
            f'fillcolor="{fondo}", color="{borde}", fontcolor="{txt}", label={etiqueta_nodo(n, txt)}];')


def main():
    salida = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "salida")
    os.makedirs(salida, exist_ok=True)
    informe, bloqueado = [], False
    for d in DIAGRAMAS:
        registro = {r: RECURSOS[r] for r in d["recursos"]}
        cats = sorted({n["cat"] for n in d["nodos"]})
        paleta_presente = {c: PALETA[c] for c in cats}
        res = validar_diagrama(d["nodos"], d["aristas"], registro, paleta_presente,
                               d["inicios"], d["terminales"], es_dag=d["es_dag"])
        res["contraste_texto_elegido"] = contraste_con_texto_elegido(paleta_presente)
        res["rutas_error"] = sum(1 for e in d["aristas"] if e["tipo"] == "error")
        res["n_nodos"], res["n_aristas"] = len(d["nodos"]), len(d["aristas"])
        res["n_decisiones"] = sum(1 for n in d["nodos"] if n["tipo"] == "decision")
        res["es_dag"] = d["es_dag"]
        res = {"clave": d["clave"], "titulo": d["titulo"], **res}
        informe.append(res)
        print(f'{d["clave"]} {res["veredicto"]:16s} nodos={res["n_nodos"]:2d} aristas={res["n_aristas"]:2d} '
              f'errores={res["rutas_error"]} huérfanos={res["checks"]["recursos_huerfanos"]}')
        if res["veredicto"] != "APROBADO_RENDER":
            bloqueado = True
            print("   DEFECTOS:", json.dumps(res["checks"], ensure_ascii=False))
            continue
        base = os.path.join(salida, d["clave"])
        mejor = None
        for est in ESTRATEGIAS:
            txt = dot_de(d, est)
            proc = subprocess.run(["dot", "-Tsvg"], input=txt.encode(), capture_output=True)
            if proc.returncode != 0:
                continue  # estrategia no realizable por Graphviz
            svg = proc.stdout.decode()
            w = float(re.search(r'width="([\d.]+)pt"', svg).group(1)) / 72
            h = float(re.search(r'height="([\d.]+)pt"', svg).group(1)) / 72
            letra = 10 * min(6.4 / w, 8.4 / h, 1.0)
            if mejor is None or letra > mejor[0] + 0.05:
                mejor = (letra, est, txt, w, h)
        res["layout"] = {"estrategia": list(mejor[1]), "ancho_in": round(mejor[3], 2),
                         "alto_in": round(mejor[4], 2), "letra_efectiva_pt": round(mejor[0], 1)}
        print(f"   layout {mejor[1]} → {mejor[3]:.1f}x{mejor[4]:.1f} in, letra {mejor[0]:.1f} pt")
        with open(base + ".dot", "w", encoding="utf-8") as f:
            f.write(mejor[2])
        for fmt, extra in (("svg", []), ("pdf", []), ("png", ["-Gdpi=220"])):
            subprocess.run(["dot", f"-T{fmt}", *extra, base + ".dot", "-o", f"{base}.{fmt}"], check=True)
        svg = open(base + ".svg", encoding="utf-8").read()
        svg = svg.replace('font-family="Liberation Serif', 'font-family="Times New Roman,Liberation Serif,serif')
        open(base + ".svg", "w", encoding="utf-8").write(svg)
    with open(os.path.join(salida, "validacion.json"), "w", encoding="utf-8") as f:
        json.dump(informe, f, ensure_ascii=False, indent=1)
    sys.exit(1 if bloqueado else 0)


if __name__ == "__main__":
    main()
