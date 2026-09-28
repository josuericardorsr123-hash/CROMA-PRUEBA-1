# Expediente Maleable

Plataforma para procesar expedientes de **cualquier proceso del ordenamiento jurídico colombiano**. Recibe el expediente crudo (escaneos, fotografías, PDF, Word, correos, comprimidos), lo lee página por página, reconstruye los hechos con su soporte, verifica cada norma y providencia en **fuentes oficiales vía [Croma](https://usecroma.com) (MCP)**, calcula términos, evalúa riesgos y vía procesal, y entrega:

1. El **informe técnico** en DOCX, con la especificación editorial del despacho: Times New Roman negro, carta, márgenes de 2,5 cm, secciones en romano, subsecciones «1.1 — Título», TABLA DE CONTENIDO con número de página real, notas al pie que vinculan cada afirmación con su fuente, citas en bloque APA con enlace, encabezado editorial y «Página X de Y». La firma es «—Josué Ricardo Rojas Silva—», configurable.
2. La **pieza procesal siguiente** (demanda, tutela, petición, recurso, contestación…), primero como borrador y luego en versión radicable.
3. El **índice electrónico**, el expediente organizado con anexos numerados y el paquete de anexos.

**El ABOGADO (USUARIO) dirige el sistema y audita cada salida.** Nada sale como radicable sin su aprobación expresa, que queda registrada en una bitácora encadenada por hashes. El sistema no suple con memoria una fuente que no pudo verificar: la declara NO VERIFICADA, la retira del fundamento o se detiene y pide la fuente al abogado.

> Este repositorio es público. Solo contiene **datos ficticios** (marcados «DEMOSTRACIÓN — datos ficticios, fuentes simuladas»). Los expedientes reales, las claves y la base de conocimiento propia del despacho se cargan en tiempo de ejecución y nunca se versionan.

## Inicio rápido

```bash
npm ci
npm run demo                       # expediente ficticio de punta a punta → ./salida-demo/*.docx
npm run demo:api                   # API + consola web con Croma simulado (usuario: abogado@ejemplo.test, tenant: demo)
npm run verificar                  # tipos + 151 pruebas + validación del grafo
```

Requisitos: Node 22.12 o superior. LibreOffice Writer, poppler-utils y qpdf se usan para leer PDF, rasterizar escaneos y paginar el índice. Sin ellos, el sistema degrada y lo declara. Con Docker:

```bash
cp .env.example .env               # complete ANTHROPIC_API_KEY, CROMA_API_KEY, EM_CLAVE_MAESTRA, EM_JWT_SECRETO, EM_PG_CLAVE
docker compose up -d --build
docker compose exec em em usuarios crear --correo abogada@despacho.co --nombre "Nombre Apellido" --rol ABOGADO --clave '…'
```

La consola queda en `http://localhost:8080`.

## Uso personal con su cuenta de Claude (Claude Code)

Para procesar sus propios expedientes en su máquina sin clave de API, el sistema puede usar la sesión de **Claude Code** con la que usted ya inició sesión. Llama a `claude -p` en [modo no interactivo](https://code.claude.com/docs/en/headless) con salida estructurada validada.

```bash
claude                                        # una vez: inicie sesión con su cuenta
export EM_PROVEEDOR_IA=claude-code
export CROMA_API_KEY=...                      # opcional: sin ella, las fuentes quedan NO VERIFICADAS
npm run em -- usuarios crear --correo usted@correo.co --nombre "Su nombre" --rol ABOGADO --clave '…'
npm run em -- procesar ./mi-expediente --usuario usted@correo.co --titulo "…"
npm run em -- instruir exp_… APROBAR --usuario usted@correo.co --reanudar
```

Condiciones de este modo:

- **Solo uso personal y local.** Anthropic no permite ofrecer el inicio de sesión de claude.ai a terceros, por eso el servidor en producción rechaza este modo. Para un despliegue que atienda a otras personas use `ANTHROPIC_API_KEY`.
- **Consume los límites de uso de su plan.** Un expediente hace decenas de llamadas; si se alcanza el límite, el nodo se detiene con un error explicativo y se reanuda después con `em reanudar`.
- **Es más lento que la API** y no usa cache de prompts.

## Cómo trabaja el ABOGADO (USUARIO)

1. Crea el expediente y carga los archivos tal como los recibió.
2. El pipeline recorre los **45 nodos** del grafo:
   - Ingreso y lectura íntegra (incluida la lectura visual de escaneos).
   - Vigilancia judicial y debida diligencia vía Croma.
   - Organización y hechos.
   - Fundamento verificado.
   - Análisis de hecho y de derecho.
   - Términos, riesgos, MASC, vía y pieza.
   - Gobernanza.
3. En cada **compuerta** que exige criterio humano, el pipeline se detiene y pide una decisión:
   - Expediente incompleto: cargar documentos o continuar con vacíos.
   - Cita no verificable: aportar la fuente o retirar la cita.
   - Revisión final: aprobar, devolver con observaciones o asumir un riesgo.
4. Si el abogado devuelve el trabajo, cada observación se clasifica y el expediente se re-elabora completo. Las lecciones se guardan disociadas, sin datos personales.
5. Al aprobar, la pieza radicable sale firmada con su perfil profesional verificado.

Se opera desde la **consola web**, la **API** (`/api/v1`, REST + SSE) o la **CLI** `em`.

## Estructura

| Paquete | Función |
|---|---|
| `packages/dominio` | Modelo del expediente (zod), grafo validado de 45 nodos y 5 compuertas |
| `packages/motores` | Motores deterministas: términos y calendario judicial, cuantía y competencia, requisitos, citas, precedente, vía, redacción forense |
| `packages/croma` | Cliente MCP de Croma: descubrimiento de herramientas, mapeo a 26 capacidades, caché, cortacircuitos, reintentos, procedencia. Incluye un simulador MCP |
| `packages/fuentes` | Resolución de fuentes oficiales, repositorio normativo local (BM25) y vigencia |
| `packages/ia` | Claude por el SDK oficial: salidas estructuradas, streaming, pensamiento adaptativo, fallback del lado servidor |
| `packages/documentos` | Detección, conversión, lectura por páginas, rasterizado, segmentación |
| `packages/docgen` | Generación DOCX con posprocesado OOXML y paginación real del índice |
| `packages/almacen` | SQLite o PostgreSQL, cifrado AES-256-GCM en reposo, bitácora encadenada, cola de trabajos |
| `packages/pipeline` | Ejecutor del grafo, manejadores de los 45 nodos y entorno de demostración |
| `apps/api`, `apps/web`, `apps/cli` | Servidor, consola del ABOGADO (USUARIO) y CLI |

Documentación: [arquitectura](docs/ARQUITECTURA.md) · [Croma](docs/CROMA.md) · [operación](docs/OPERACION.md) · [seguridad y datos personales](docs/SEGURIDAD.md).

## Límites declarados

- Es un sistema de apoyo. No sustituye el criterio del abogado habilitado, quien firma y responde por lo que se radica.
- La disponibilidad de cada fuente depende de Croma y de los portales oficiales. Lo que no se pueda verificar queda como NO VERIFICADO, nunca se da por cierto.
- Los valores que cambian cada año (por ejemplo, el SMMLV posterior a 2025) se configuran con su decreto oficial (`SMMLV_AJUSTES`). Mientras falten, la cuantía queda INDETERMINADA.
