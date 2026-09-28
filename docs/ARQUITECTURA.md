# Arquitectura

## Visión general

```
 Consola web / CLI / integraciones
            │  REST + SSE (JWT, RBAC)
            ▼
   apps/api ──► cola SQL (trabajos) ──► Trabajador ──► Ejecutor del grafo (packages/pipeline)
                                                          │
            ┌─────────────────────┬───────────────────────┼──────────────────────┬──────────────────┐
            ▼                     ▼                       ▼                      ▼                  ▼
     packages/documentos   packages/croma (MCP)    packages/ia (Claude)   packages/motores   packages/docgen
     lectura y rasterizado  fuentes oficiales       tareas estructuradas   reglas jurídicas   DOCX y paginación
                                   │
                            packages/fuentes (resolución, vigencia, repositorio local)
            ▼
     packages/almacen: expedientes versionados y cifrados, blobs cifrados, bitácora encadenada, términos, memoria
```

Los nodos no conocen la base de datos ni HTTP: reciben **puertos** (`Servicios`) y el mismo pipeline corre igual en el servidor, en la CLI y en las pruebas.

## El grafo

`packages/dominio/src/grafo/definicion.ts` declara 45 nodos repartidos en 7 etapas: Ingreso, Preparación, Fundamento, Análisis, Estrategia, Gobernanza y Salida. Declara también 5 compuertas: `g_completo`, `g_citas`, `g_riesgo`, `g_habilitacion` y `g_revision`, y los 14 recursos de los que depende. `em grafo validar` comprueba que:

- todo nodo es alcanzable y conduce a un terminal;
- cada compuerta tiene dos ramas etiquetadas;
- no hay aristas colgantes;
- el recorrido es acíclico, salvo los retornos declarados.

### Semántica del ejecutor

- Una arista está **VIVA** si su origen se completó y, cuando el origen es una compuerta, si esa compuerta eligió su rama. Está **MUERTA** si el origen se omitió o eligió la otra rama.
- Un nodo corre cuando no tiene entradas pendientes y al menos una está viva. Si todas sus entradas están muertas, se **omite** (eliminación de caminos muertos).
- Los **retornos** declarados, como `g_citas` hacia `f4` o `g_revision` hacia la re-elaboración, reinician el tramo alcanzable. Su número está limitado (`EM_MAX_ITER_CITAS`, `EM_MAX_ITER_REVISION`).
- Una **PAUSA** detiene el lanzamiento de nodos y deja el expediente en `REQUIERE_ACCION` o `EN_REVISION`. Cuando llega la instrucción del abogado, el pipeline se reanuda desde el mismo nodo.
- Tras cada nodo se guarda un **punto de control** con control de versión optimista. Un proceso caído pierde su arriendo y otro trabajador reanuda.
- Las fallas transitorias (red, límite de tasa) se reintentan. Una falla de fondo deja el nodo en `ERROR` con su motivo.

## IA

`packages/ia` usa el SDK oficial de Anthropic:

- Streaming y pensamiento adaptativo.
- Esfuerzo configurado por tarea.
- Sistema y contexto cacheados.
- **Salidas estructuradas** validadas con zod: una salida inválida se reintenta una vez y después falla.
- Revisión de `stop_reason` (rechazo o truncamiento) antes de leer el contenido.
- Fallback del lado servidor ante un rechazo del clasificador.

`LlmSimulado` implementa el mismo puerto para pruebas y demostración.

El modelo **propone**; los motores deterministas **calculan**: términos, días hábiles, cuantía, requisitos y auditoría de citas. Toda cita que aparezca en un texto redactado se coteja con las fuentes verificadas del expediente, y la que no se resuelve se retira antes de entregar.

## Informe técnico

`packages/docgen/src/informe.ts` produce el DOCX con docx-js y lo posprocesa en OOXML:

- Campo TOC con resultados.
- `PAGE` y `NUMPAGES` en runs separados, con resultado en caché.
- `[Content_Types].xml` como primera entrada del ZIP.

Con LibreOffice disponible, el documento se renderiza, se ubica cada título en su página, se reconstruye el índice con los números reales y se verifica la convergencia. Si no converge, lo declara.

## Persistencia

`packages/almacen` ofrece el mismo repositorio sobre SQLite (`node:sqlite`) y PostgreSQL (`pg`):

- **Expedientes**: cifrados con AAD ligada a su identificador y a su versión, y versionados con retención.
- **Bitácora**: cada entrada lleva el hash de la anterior, y `verificarBitacora` detecta alteraciones sin necesitar la clave.
- **Cola de trabajos**: con arriendo y `FOR UPDATE SKIP LOCKED` en PostgreSQL.
- **Índice de términos**: alimenta el calendario de vencimientos.
- **Memoria institucional**: guarda lecciones disociadas y se suprime junto con el expediente.
