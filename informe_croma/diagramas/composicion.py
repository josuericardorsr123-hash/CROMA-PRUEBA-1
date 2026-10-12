"""Pistas de composición (§8): solo afectan al layout, nunca al grafo validado.

render.py prueba varias estrategias (natural, por filas, por bandas, 3 o 4
nodos por fila) y conserva la de letra efectiva mayor. Aquí se declaran:
- mismo_rango: cadenas que conviene "serpentear" en una misma fila;
- sin_restriccion: aristas que no deben condicionar la fila.
"""

PISTAS = {
    "D00": {"mismo_rango": [["G", "RT"], ["LV", "AS"]],
            "sin_restriccion": [("MO", "RT"), ("CN", "LV"), ("C3", "CN"), ("C3", "MO")]},
    "D01": {"mismo_rango": [["W", "P"]], "sin_restriccion": [("JS", "P")]},
    "D02": {"mismo_rango": [["D2", "LC"]]},
    "D04": {"mismo_rango": [["S", "D1"], ["RU", "D2"], ["SS", "OW"], ["D4", "SV"], ["TR", "QC"]]},
    "D10": {"sin_restriccion": [("E", "F")]},
    "D16": {"mismo_rango": [["S", "EN"], ["Q", "R"], ["CA", "FR"], ["RU", "RL"], ["LLM", "M"]]},
}
