"""Exporta a JSON los insumos del informe: diagramas, recursos y catálogo CO.

Uso: python3 -I exportar.py <catalog_all.json> <dir_salida>
"""
import json
import os
import sys
from collections import Counter, OrderedDict

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "..", "diagramas"))
from modelos import DIAGRAMAS, RECURSOS, NOMBRE_CAT  # noqa: E402

REMITE = {
    "R01": "Consola de Croma (emitir o rotar llaves)",
    "R02": "Plan y facturación; 402 al agotarse",
    "R03": "Fuente oficial en el siguiente refresco",
    "R04": "Reintento idempotente o copia en caché",
    "R05": "GET /jobs/:id o callback_url",
    "R06": "Fuente oficial cuando la copia expira",
    "R07": "Fuente oficial al vencer la ventana",
    "R08": "source_document_url de la entidad",
    "R09": "Herramientas MCP del catálogo",
    "R10": "Validación de formato (400 / −32602)",
    "R11": "Responsable del tratamiento (usuario)",
    "R12": "Consola: *_connect / *_delete_connection",
    "R13": "Destinatarios (máx. 3) y baja por enlace",
    "R14": "list_monitor_matches (relevant:false)",
    "R15": "OpenAPI y /catalog",
    "R16": "Endpoint del cliente con firma HMAC",
    "R17": "Esquema simple, sin uniones de tipo",
    "R18": "Codificación DIVIPOLA del DANE",
    "R19": "Siguiente rango con next_offset",
}

DOMINIO = OrderedDict([
    ("Justicia y jurisprudencia", ["rama-judicial", "cndj", "fiscalia", "samai", "samai-rulings",
                                   "consejo-estado", "corte-constitucional", "corte-suprema", "sicaac"]),
    ("Empresas y mercado de valores", ["rues", "supersociedades", "supersociedades-baranda",
                                       "supersociedades-relatoria", "simev", "dian-trade"]),
    ("Contratación pública", ["secop", "ancp-cce"]),
    ("Verificación de personas", ["registraduria", "registro-civil", "ruaf", "policia", "procuraduria",
                                  "contraloria", "contaduria", "adres", "dnp"]),
    ("Vehículos y tránsito", ["runt", "simit"]),
    ("Tributario y finanzas del titular", ["dian", "dian-muisca", "bancolombia"]),
    ("Regulación y normativa", ["funcion-publica", "imprenta", "superfinanciera",
                                "superfinanciera-doctrine", "creg", "sic-normativa"]),
    ("SIC: consumidor y propiedad industrial", ["sic-sanctions", "sic-actos", "sic-tramites",
                                                "sic-gazette", "sic-ip"]),
    ("Territorio y catastro (IGAC)", ["igac"]),
    ("Estadística y macroeconomía", ["dane", "banrep", "banrep-research", "terridata", "icfes",
                                     "mineducacion"]),
    ("Sectoriales: salud, minería y ambiente", ["invima", "anm", "siata", "siata-geoportal"]),
    ("Trámites del Estado", ["suit", "gov-pages"]),
])

DATASET_TOTAL = {"imprenta", "funcion-publica", "suit", "gov-pages", "corte-constitucional",
                 "corte-suprema", "samai-rulings", "superfinanciera-doctrine", "banrep",
                 "banrep-research", "simev", "dian-trade", "supersociedades-relatoria", "anm",
                 "creg", "sic-normativa", "sic-sanctions", "sic-actos", "sic-gazette", "invima",
                 "mineducacion", "icfes", "terridata", "dane", "supersociedades"}
DATASET_PARCIAL = {
    "secop": {"processes-search", "contracts-search", "modifications-search", "suppliers-search",
              "bidders-search", "sanctions-search", "plans-search", "profile", "awards-search",
              "process-record", "contract-record"},
    "rama-judicial": {"emails-search", "emails-by-court"},
    "superfinanciera": {"regulations-search", "regulation"},
    "supersociedades-baranda": {"publications-search", "publication", "decisions-search", "decision"},
    "sic-ip": {"trademarks-search", "patents-search", "designs-search", "resolutions-search"},
    "igac": {"properties-search", "parcel", "parcels-search", "buildings-by-property", "blocks-search",
             "rural-districts-search", "sectors-search", "economic-zones-search",
             "physical-zones-search", "municipal-statistics", "cadastral-managers",
             "address-plates-by-property", "street-names-search"},
}
# Fuente: https://docs.usecroma.com/es/versioning (tabla de endpoints deprecados)
DEPRECADOS = {"/co/siata/v1", "/co/secop/contracts-by-provider/v1", "/co/secop/processes-by-entity/v1",
              "/co/secop/sanctions-by-provider/v1"}
LOOKUP = {("igac", "property"), ("igac", "property-by-point"), ("sic-ip", "trademark"),
          ("sic-ip", "patent"), ("sic-ip", "design")}


def modo(fam, ep):
    if (fam, ep) in LOOKUP:
        return "lookup"
    if fam in DATASET_PARCIAL:
        return "dataset" if ep in DATASET_PARCIAL[fam] else "vivo"
    if fam in DATASET_TOTAL:
        return "dataset"
    return "vivo"


def main():
    cat_path, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    cat = json.load(open(cat_path, encoding="utf-8"))
    co = [c for c in cat if c["country"] == "Colombia"]
    fam_dom = {f: d for d, fams in DOMINIO.items() for f in fams}
    filas = []
    for c in co:
        partes = c["path"].strip("/").split("/")
        fam, ep = partes[1], partes[2] if len(partes) > 2 else ""
        if c["batch"]:
            ep = ep + "/batch"
        m = "lote" if c["batch"] else modo(fam, partes[2])
        filas.append({"tool": c["tool"], "path": c["path"], "familia": fam, "endpoint": ep,
                      "dominio": fam_dom[fam], "modo": m, "async": c["async"],
                      "deprecated": c["path"] in DEPRECADOS})
    json.dump(filas, open(os.path.join(out, "catalogo_co.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    resumen = []
    for d, fams in DOMINIO.items():
        sub = [f for f in filas if f["dominio"] == d]
        cm = Counter(f["modo"] for f in sub)
        resumen.append({"dominio": d, "familias": fams, "n_familias": len(fams), "endpoints": len(sub),
                        "dataset": cm.get("dataset", 0), "vivo": cm.get("vivo", 0),
                        "lookup": cm.get("lookup", 0), "lote": cm.get("lote", 0),
                        "asincronos": sum(f["async"] for f in sub),
                        "deprecados": sum(f["deprecated"] for f in sub)})
    json.dump(resumen, open(os.path.join(out, "resumen_dominios.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("CO endpoints:", len(filas), "· familias:", len({f['familia'] for f in filas}))
    print("modos:", Counter(f["modo"] for f in filas), "· asíncronos:", sum(f["async"] for f in filas))
    for r in resumen:
        print(f'  {r["dominio"]:42s} {r["endpoints"]:3d}  ds={r["dataset"]} vivo={r["vivo"]} '
              f'lk={r["lookup"]} lote={r["lote"]} async={r["asincronos"]} dep={r["deprecados"]}')

    val = {v["clave"]: v for v in json.load(open(os.path.join(AQUI, "..", "diagramas", "salida", "validacion.json"), encoding="utf-8"))}
    diags = []
    for d in DIAGRAMAS:
        uso = {r: [] for r in d["recursos"]}
        for n in d["nodos"]:
            for r in n["recursos_requeridos"]:
                uso[r].append(n["id"])
        recursos = []
        for r in d["recursos"]:
            tipo, detalle, crit, riesgo = RECURSOS[r]
            recursos.append({"id": r, "tipo": tipo, "detalle": detalle, "criticidad": crit,
                             "riesgo": riesgo, "nodos": uso[r], "remite": REMITE[r]})
        diags.append({"clave": d["clave"], "titulo": d["titulo"], "tipo_diagrama": d["tipo_diagrama"],
                      "objetivo": d["objetivo"], "es_dag": d["es_dag"],
                      "categorias": sorted({NOMBRE_CAT[n["cat"]] for n in d["nodos"]}),
                      "nodos": [{"id": n["id"], "label": n["label"].replace("\n", " "),
                                 "tipo": n["tipo"]} for n in d["nodos"]],
                      "recursos": recursos, "validacion": val[d["clave"]]})
    json.dump(diags, open(os.path.join(out, "diagramas.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("diagramas exportados:", len(diags))


if __name__ == "__main__":
    main()
