# Croma: conexión con fuentes oficiales

[Croma](https://usecroma.com) expone por **MCP** (Streamable HTTP, autenticación Bearer) herramientas de consulta sobre fuentes oficiales colombianas. El sistema no cablea nombres de herramientas. Al conectar:

1. Lista el catálogo real (`tools/list`).
2. Puntúa cada herramienta contra **26 capacidades** canónicas por prefijo, palabras clave y esquema de entrada.
3. Construye los argumentos a partir de parámetros canónicos (radicado, documento, NIT, nombre, consulta, URL…).

Cuando el descubrimiento automático no basta, el mapeo se fija con `CROMA_MAPEO_JSON`.

## Configuración

```bash
CROMA_API_KEY=…                    # clave del plan contratado
CROMA_MCP_URL=https://api.croma.run/mcp
```

Comprobación:

```bash
em croma probar          # estado de la conexión y del cortacircuitos
em croma herramientas    # catálogo real
em croma capacidades     # capacidad → herramienta asignada (o NO DISPONIBLE)
em croma simulador       # servidor MCP local con datos ficticios, para desarrollo
```

## Capacidades

| Grupo | Capacidades |
|---|---|
| Procesos y jurisprudencia | `procesos.por_radicado`, `procesos.por_nombre` (Rama Judicial); `procesos.contencioso` (SAMAI); `jurisprudencia.consejo_estado` |
| Normas | `normas.texto` (texto y vigencia) |
| Registros públicos | `empresas.rues`, `empresas.supersociedades`, `tributario.rut`, `tributario.factura_cufe`, `tributario.doctrina`, `contratacion.secop`, `vehiculos.runt`, `vehiculos.simit`, `quejas.superfinanciera`, `insolvencia.sicaac` |
| Datos personales (exigen autorización expresa) | `identidad.cedula`, `antecedentes.policia`, `antecedentes.procuraduria`, `antecedentes.contraloria`, `deudores.contaduria`, `salud.afiliacion`, `seguridad_social.ruaf`, `disciplinario.abogados` |
| Web | `web.busqueda` (restringida a dominios oficiales), `web.extraer`, `investigacion.profunda` |

**Consultas sobre personas.** Solo se hacen si el ABOGADO (USUARIO) las autoriza en `contexto.diligencia`, sujeto por sujeto, con capacidades y finalidad expresas (Ley 1581 de 2012). Los registros públicos no personales se consultan solo cuando el dato consta en el expediente.

## Jurisprudencia y relatorías

Las providencias citadas se resuelven así:

1. Se detecta la cita (Corte Constitucional, Corte Suprema de Justicia, Consejo de Estado).
2. Se construye la URL oficial de la relatoría con los patrones verificados.
3. Se obtiene el texto vía `web.extraer` o por HTTP directo a dominios oficiales (`EM_HTTP_OFICIAL=1`).
4. Se comprueba que el texto corresponda a la cita.
5. Se evalúan su fuerza vinculante y su analogía fáctica con el caso.

Una cita que no se resuelve se devuelve a `g_citas`, que puede re-elaborar el fundamento o pedir al abogado que aporte la fuente o la retire.

## Resiliencia y procedencia

Cada consulta pasa por:

1. Autorización y finalidad.
2. Caché con TTL por capacidad.
3. Cortacircuitos.
4. Límite de concurrencia.
5. Reintentos con tiempo máximo.
6. Reintento de trabajos pendientes (`status: pending`).

Cada resultado deja una **procedencia** con la herramienta, los argumentos, el instante, el hash del resultado y un blob cifrado con la respuesta. Así, cualquier afirmación del informe se puede rastrear hasta la consulta que la respalda. Una falla de la fuente nunca detiene el pipeline: el dato queda NO VERIFICADO y se declara en el informe.
