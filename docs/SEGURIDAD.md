# Seguridad y datos personales

El expediente contiene datos personales, a veces sensibles (Ley 1581 de 2012 y Decreto 1377 de 2013), y está amparado por el secreto profesional. El diseño parte de ahí.

## Cifrado

- **En reposo**: AES-256-GCM, con una clave derivada por propósito (HKDF) desde `EM_CLAVE_MAESTRA`. Cada texto cifrado lleva el identificador de clave (kid) para permitir la rotación, y un AAD que lo ata a su registro, de modo que no se puede trasplantar a otro.
- **Qué se cifra**: el expediente completo en cada versión, cada archivo original y derivado, las respuestas de Croma, los perfiles profesionales y las descripciones de términos.
- **Búsquedas sin descifrar**: se hacen sobre huellas HMAC, nunca sobre el texto.
- **Producción**: el arranque falla si falta `EM_CLAVE_MAESTRA` o `EM_JWT_SECRETO`. Fuera de producción se genera una clave local y se advierte.
- **En tránsito**: termine TLS en el proxy o en el balanceador y active `EM_CONFIAR_PROXY=1` detrás de él.

## Acceso

- **Roles**:
  - `ABOGADO`: solo sus expedientes; dirige y aprueba.
  - `ADMINISTRADOR`: el tenant completo, los usuarios y la supresión.
  - `AUDITOR`: lectura y bitácora; no descarga piezas radicables ni instruye.
- **Aislamiento**: por tenant en cada consulta. Memoria, perfiles y términos nunca cruzan despachos.
- **Claves de usuario**: scrypt (N=2^15) y bloqueo temporal tras intentos fallidos.
- **Sesiones**: JWT HS256 de vida corta. En cada petición se revalida que el usuario siga activo.
- **Límites de tasa**: global y estricto en el ingreso. Cabeceras `nosniff`, `DENY` y CSP restrictiva.

## Auditoría

Cada acción queda en una **bitácora encadenada por hashes**, verificable sin la clave (`em bitacora verificar`):

- ingreso y rechazo;
- carga de archivos;
- ejecución;
- cada punto de control;
- instrucciones y decisiones del abogado;
- descargas;
- supresiones.

La bitácora guarda el hecho, no el contenido.

## Consultas sobre personas

Las capacidades de Croma que tratan datos personales (cédula, antecedentes, afiliaciones, deudores morosos) exigen autorización **expresa** del ABOGADO (USUARIO) por sujeto, capacidad y finalidad. Cada consulta registra su finalidad en la procedencia.

## Supresión y minimización

`DELETE /api/v1/expedientes/:id` (ADMINISTRADOR, con motivo) elimina:

- el expediente y todas sus versiones;
- sus términos indexados y sus lecciones derivadas;
- todos sus blobs.

La bitácora conserva solo la constancia de la supresión. Las lecciones institucionales se guardan **disociadas**: sin nombres, identificaciones, radicados ni cifras. La carga de los trabajos en cola contiene solo identificadores.

## Repositorio público

Este repositorio no contiene expedientes, claves ni la base de conocimiento propia del despacho. Los datos de demostración son ficticios, usan identificadores imposibles (NIT 000.000.002-0, sentencias «de 2099» en las pruebas) y van marcados como tales. `.gitignore` excluye `.env`, `.em-data/`, `expedientes/` y las salidas.
