# Informe: Croma, la API de datos de gobierno (Colombia)

Informe técnico de Josué Ricardo Rojas Silva sobre la arquitectura, los atajos, las limitaciones y los productos posibles con la API de Croma para fuentes colombianas.

- `salida/Informe_Croma_Colombia.docx`: el informe (carta, Times New Roman, 94 páginas).
- `salida/Informe_Croma_Colombia.pdf`: la misma versión exportada con LibreOffice; sus marcadores son la fuente de la paginación de la tabla de contenido.

## Estructura

| Carpeta | Contenido |
|---|---|
| `diagramas/` | Modelos de los 17 flujos (`modelos.py`), validador del §9 del Creador de Flujos de Trabajo (`validador.py`), pistas de composición (`composicion.py`) y renderizador Graphviz (`render.py`). `diagramas/salida/` guarda `.dot`, `.svg`, `.pdf`, `.png` y `validacion.json`. |
| `build/` | Exportación de datos (`exportar.py`), motor del DOCX con docx-js (`build_informe.js`), contenido por secciones (`contenido_a/b/c.js`), registro de fuentes y referencias APA (`fuentes.js`) y cálculo de páginas de la tabla de contenido (`paginas.py`). |
| `build/datos/` | Catálogo de Croma extraído de la Agent Skill oficial, inventario por dominio, datos de los diagramas, tabla de contenido y páginas calculadas. |

## Reconstrucción

Requiere Python 3, Graphviz, Node.js con `docx`, LibreOffice y `pypdf`.

```sh
cd informe_croma/diagramas && python3 render.py          # valida y renderiza los 17 diagramas
cd ../build && python3 -I exportar.py datos/catalog_all.json datos
./ciclo.sh                                                # DOCX → PDF → páginas de la tabla de contenido
./ciclo.sh                                                # repetir hasta que informe «ESTABLE»
```

`render.py` termina con código 1 si algún diagrama queda bloqueado por el validador.
