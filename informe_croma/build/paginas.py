"""Lee los marcadores del PDF exportado por LibreOffice y escribe datos/paginas.json
(texto del encabezado -> página) para la tabla de contenido del DOCX.
Uso: python3 -I paginas.py <informe.pdf> <toc.json> <paginas.json>
"""
import json
import sys
import pypdf

pdf, toc_ruta, salida = sys.argv[1:4]
lector = pypdf.PdfReader(pdf)
marcas = {}

def recorrer(nodos):
    for nodo in nodos:
        if isinstance(nodo, list):
            recorrer(nodo)
        else:
            marcas.setdefault(nodo.title.strip(), lector.get_destination_page_number(nodo) + 1)

recorrer(lector.outline)
toc = json.load(open(toc_ruta, encoding='utf-8'))
paginas, faltan = {}, []
for e in toc:
    if e['texto'] in marcas:
        paginas[e['texto']] = marcas[e['texto']]
    else:
        faltan.append(e['texto'])
anterior = {}
try:
    anterior = json.load(open(salida, encoding='utf-8'))
except (OSError, ValueError):
    pass
json.dump(paginas, open(salida, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(paginas)}/{len(toc)} encabezados con página · {len(lector.pages)} páginas · '
      f'{"ESTABLE" if anterior == paginas else "CAMBIÓ"}')
for t in faltan:
    print('  sin marcador:', t)
