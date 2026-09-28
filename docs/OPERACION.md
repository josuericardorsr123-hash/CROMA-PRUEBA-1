# Operación

## Despliegue

- **Contenedor único**: API, trabajador y consola web. Imagen en el `Dockerfile`, que incluye LibreOffice Writer, poppler, qpdf y fuentes Liberation (métricamente equivalentes a Times New Roman).
- **Base de datos**: PostgreSQL 16 en producción (`EM_BASE_DATOS=postgres://…`). SQLite (`sqlite:/datos/em.db`) sirve para una sola instancia.
- **Escalado**: varias réplicas sobre la misma base. Con `EM_TRABAJADOR=0` una réplica solo atiende la API. Los trabajadores se reparten la cola sin duplicar trabajos (arriendo con `SKIP LOCKED`).
- **Volumen `/datos`**: blobs cifrados. Respáldelo junto con la base de datos, porque ninguno sirve sin el otro ni sin la clave maestra.

`GET /api/v1/salud` informa:

- el motor de base de datos;
- si hay IA y Croma, y el estado del cortacircuitos;
- las herramientas documentales disponibles;
- el tamaño del repositorio normativo.

## Primer arranque

```bash
em usuarios crear --tenant principal --correo admin@despacho.co --nombre "Administración" --rol ADMINISTRADOR --clave '…'
em usuarios crear --tenant principal --correo abogada@despacho.co --nombre "Nombre Apellido" --rol ABOGADO --clave '…' --tp 000000
```

Cada ABOGADO (USUARIO) completa su perfil profesional (cédula, tarjeta profesional, correo del Registro Nacional de Abogados, dirección) en «Mi perfil». Sin ese perfil no se puede aprobar una pieza radicable.

## Base de conocimiento del despacho

La base propia del despacho se importa en tiempo de ejecución:

```bash
em repositorio importar --skill /ruta/segura/repositorio.jsonl --salida /datos/repositorio.jsonl
EM_REPOSITORIO_JSONL=/datos/repositorio.jsonl
```

Las fichas llevan su fecha de verificación. Pasada la frescura (`EM_FRESCURA_DIAS`), se vuelven a verificar en fuente oficial antes de sustentar una actuación. Los textos literales del despacho, como las pretensiones de apertura y el cierre de las peticiones, van en `EM_PERFIL_DESPACHO` (ejemplo en `config/perfil-despacho.ejemplo.json`).

## Operación desde la terminal

```bash
em procesar ./expediente-cliente --usuario abogada@despacho.co --titulo "Cobro de factura" --cliente "…" --rol-cliente EJECUTANTE
em estado exp_…                                  # estado de cada nodo y decisión pendiente
em instruir exp_… DEVOLVER --usuario abogada@despacho.co --datos '{"observaciones":[{"texto":"Precisar la fecha del requerimiento"}]}' --reanudar
em instruir exp_… APROBAR --usuario abogada@despacho.co --motivo "Revisado" --reanudar
em entregables exp_… --salida ./entregables
em terminos --dias 30                            # vencimientos de todos los expedientes
em bitacora verificar                            # integridad de la cadena de auditoría
```

## Rotación de claves

1. Genere una clave nueva y configure `EM_CLAVE_MAESTRA=<nueva>` y `EM_CLAVE_ID=k2`.
2. Pase la clave anterior a `EM_CLAVES_ANTERIORES=k1:<anterior>`.
3. Lo nuevo se cifra con `k2` y lo anterior se sigue leyendo con `k1`.

## Actualizaciones anuales

- **SMMLV**: tras el decreto anual, agregue el valor verificado en `SMMLV_AJUSTES=AÑO=VALOR`.
- **Festivos**: se calculan por la Ley 51 de 1983. La vacancia colectiva (20 de diciembre a 10 de enero) y la de Semana Santa están incluidas. Los cierres extraordinarios y las suspensiones de términos se agregan en `EM_CIERRES_JUDICIALES` (AAAA-MM-DD separadas por comas).
