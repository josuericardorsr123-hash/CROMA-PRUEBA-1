#!/bin/sh
# Construye el DOCX, lo convierte a PDF con LibreOffice y actualiza las páginas de la tabla de contenido.
set -e
cd "$(dirname "$0")"
NODE_PATH=${NODE_PATH:-/opt/node22/lib/node_modules} node build_informe.js ../salida/Informe_Croma_Colombia.docx datos/paginas.json
soffice --headless --convert-to 'pdf:writer_pdf_Export:{"ExportBookmarks":{"type":"boolean","value":"true"}}' --outdir ../salida ../salida/Informe_Croma_Colombia.docx >/dev/null 2>&1
python3 -I paginas.py ../salida/Informe_Croma_Colombia.pdf datos/toc.json datos/paginas.json
