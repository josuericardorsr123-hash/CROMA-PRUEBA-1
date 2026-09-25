/* ────────────────────────────────────────────────────────────────────────────
 * Registro de capacidades: lo que el sistema necesita de las fuentes oficiales,
 * independiente del nombre exacto de cada herramienta de Croma. En tiempo de
 * ejecución se descubre el catálogo (tools/list) y cada capacidad se asocia a
 * la herramienta que mejor la satisface (prefijo de fuente + palabras clave +
 * parámetros del esquema). El mapeo puede fijarse por configuración.
 *
 * Política de datos (Ley 1581 de 2012): toda consulta declara su finalidad. Las
 * capacidades con `autorizacion: "EXPLICITA"` solo se ejecutan si el ABOGADO
 * (USUARIO) las autorizó para ese expediente.
 * ──────────────────────────────────────────────────────────────────────────── */

export type IdCapacidad =
  | "procesos.por_radicado" | "procesos.por_nombre" | "procesos.contencioso" | "jurisprudencia.consejo_estado"
  | "disciplinario.abogados" | "identidad.cedula" | "antecedentes.policia" | "antecedentes.procuraduria"
  | "antecedentes.contraloria" | "deudores.contaduria" | "salud.afiliacion" | "seguridad_social.ruaf"
  | "insolvencia.sicaac" | "quejas.superfinanciera" | "empresas.rues" | "empresas.supersociedades"
  | "tributario.factura_cufe" | "tributario.doctrina" | "tributario.rut" | "contratacion.secop"
  | "vehiculos.runt" | "vehiculos.simit" | "normas.texto" | "web.busqueda" | "web.extraer" | "investigacion.profunda";

export interface DefinicionCapacidad {
  id: IdCapacidad;
  descripcion: string;
  prefijos: string[];
  palabras: string[];
  /** Parámetro canónico → sinónimos de nombres de propiedad en el esquema de entrada. */
  parametros: Record<string, string[]>;
  paises: string[];
  autorizacion: "IMPLICITA" | "EXPLICITA";
  datosPersonales: boolean;
  ttlSegundos: number;
  finalidad: string;
}

const RADICADO = ["radicado", "numero_radicacion", "numeroradicacion", "radicacion", "case_number", "casenumber", "process_number", "numero_proceso", "llave_proceso", "number", "numero", "id"];
const DOCUMENTO = ["cedula", "documento", "numero_documento", "document", "document_number", "id_number", "identificacion", "nuip", "numero"];
const NIT = ["nit", "tax_id", "numero_nit", "documento", "document", "identificacion", "id"];
const NOMBRE = ["nombre", "name", "razon_social", "company_name", "full_name", "query", "q", "search"];
const CONSULTA = ["query", "q", "search", "consulta", "texto", "text", "term", "keywords", "question"];

export const CAPACIDADES: DefinicionCapacidad[] = [
  { id: "procesos.por_radicado", descripcion: "Proceso judicial por número de radicación (Rama Judicial)", prefijos: ["rama"], palabras: ["radicado", "radicacion", "case", "proceso", "number", "actuaciones"], parametros: { radicado: RADICADO }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: true, ttlSegundos: 3600, finalidad: "Vigilancia judicial del proceso del cliente (estado y última actuación)." },
  { id: "procesos.por_nombre", descripcion: "Procesos judiciales por nombre o razón social (Rama Judicial)", prefijos: ["rama"], palabras: ["name", "nombre", "party", "sujeto", "razon", "parte"], parametros: { nombre: NOMBRE }, paises: ["Colombia"], autorizacion: "EXPLICITA", datosPersonales: true, ttlSegundos: 3600, finalidad: "Identificar procesos en curso de una parte del caso." },
  { id: "procesos.contencioso", descripcion: "Procesos de la jurisdicción contenciosa (SAMAI, Consejo de Estado y tribunales)", prefijos: ["samai"], palabras: ["radicado", "proceso", "samai", "case"], parametros: { radicado: RADICADO }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: true, ttlSegundos: 3600, finalidad: "Vigilancia judicial de procesos contencioso administrativos." },
  { id: "jurisprudencia.consejo_estado", descripcion: "Providencias del Consejo de Estado (relatoría)", prefijos: ["consejo", "samai"], palabras: ["relatoria", "jurisprudencia", "sentencia", "providencia", "ruling", "decision"], parametros: { consulta: CONSULTA, radicado: RADICADO }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 7 * 86400, finalidad: "Investigación jurisprudencial." },
  { id: "disciplinario.abogados", descripcion: "Antecedentes disciplinarios de abogados y funcionarios judiciales (CNDJ)", prefijos: ["cndj"], palabras: ["disciplin", "abogado", "lawyer", "sancion", "antecedentes"], parametros: { documento: DOCUMENTO }, paises: ["Colombia"], autorizacion: "EXPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Verificar sanciones disciplinarias vigentes de apoderados intervinientes." },
  { id: "identidad.cedula", descripcion: "Vigencia de la cédula de ciudadanía (Registraduría)", prefijos: ["registraduria"], palabras: ["cedula", "vigencia", "estado", "document", "identity"], parametros: { documento: DOCUMENTO }, paises: ["Colombia"], autorizacion: "EXPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Verificar la vigencia del documento de una parte (capacidad, legitimación, sucesiones)." },
  { id: "antecedentes.policia", descripcion: "Antecedentes judiciales (Policía Nacional)", prefijos: ["policia"], palabras: ["antecedentes", "judiciales", "background", "criminal"], parametros: { documento: DOCUMENTO }, paises: ["Colombia"], autorizacion: "EXPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Debida diligencia de una parte cuando es pertinente para el caso." },
  { id: "antecedentes.procuraduria", descripcion: "Antecedentes disciplinarios e inhabilidades (Procuraduría, SIRI)", prefijos: ["procuraduria"], palabras: ["antecedentes", "siri", "inhabilidad", "disciplin"], parametros: { documento: DOCUMENTO }, paises: ["Colombia"], autorizacion: "EXPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Verificar inhabilidades relevantes (contratación, representación, cargos públicos)." },
  { id: "antecedentes.contraloria", descripcion: "Boletín de responsables fiscales (Contraloría, SIBOR)", prefijos: ["contraloria"], palabras: ["fiscal", "responsable", "sibor", "boletin"], parametros: { documento: DOCUMENTO }, paises: ["Colombia"], autorizacion: "EXPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Verificar responsabilidad fiscal relevante para el caso." },
  { id: "deudores.contaduria", descripcion: "Boletín de Deudores Morosos del Estado (Contaduría, BDME)", prefijos: ["contaduria"], palabras: ["bdme", "deudor", "moroso", "debtor"], parametros: { documento: DOCUMENTO }, paises: ["Colombia"], autorizacion: "EXPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Verificar obligaciones con el Estado relevantes para el caso." },
  { id: "salud.afiliacion", descripcion: "Afiliación al sistema de salud (ADRES, BDUA)", prefijos: ["adres"], palabras: ["afiliacion", "eps", "bdua", "salud", "health"], parametros: { documento: DOCUMENTO }, paises: ["Colombia"], autorizacion: "EXPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Verificar afiliación en asuntos de salud o seguridad social." },
  { id: "seguridad_social.ruaf", descripcion: "Registro Único de Afiliados (RUAF)", prefijos: ["ruaf"], palabras: ["afiliacion", "pension", "riesgos", "ruaf"], parametros: { documento: DOCUMENTO }, paises: ["Colombia"], autorizacion: "EXPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Verificar afiliaciones en asuntos laborales y pensionales." },
  { id: "insolvencia.sicaac", descripcion: "Trámites de insolvencia y conciliación (SICAAC, Ministerio de Justicia)", prefijos: ["sicaac"], palabras: ["insolvencia", "insolvency", "conciliacion", "arbitraje"], parametros: { documento: DOCUMENTO, nombre: NOMBRE }, paises: ["Colombia"], autorizacion: "EXPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Detectar trámites de insolvencia que suspenden procesos ejecutivos (art. 545 CGP)." },
  { id: "quejas.superfinanciera", descripcion: "Quejas contra entidades vigiladas (Superfinanciera)", prefijos: ["superfinanciera"], palabras: ["queja", "complaint", "entidad", "vigilada"], parametros: { nombre: NOMBRE, nit: NIT }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 86400, finalidad: "Antecedentes de quejas contra la entidad financiera del caso." },
  { id: "empresas.rues", descripcion: "Registro mercantil: matrícula, estado, CIIU y representantes (RUES)", prefijos: ["rues"], palabras: ["nit", "empresa", "company", "matricula", "mercantil", "registro"], parametros: { nit: NIT, nombre: NOMBRE }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 86400, finalidad: "Verificar existencia, estado y representación legal de una parte persona jurídica." },
  { id: "empresas.supersociedades", descripcion: "Estados financieros y situación societaria (Supersociedades)", prefijos: ["supersociedades"], palabras: ["financier", "estados", "sociedad", "financial"], parametros: { nit: NIT }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 7 * 86400, finalidad: "Evaluar solvencia o situación societaria de una parte." },
  { id: "tributario.factura_cufe", descripcion: "Validación de factura electrónica por CUFE (DIAN)", prefijos: ["dian"], palabras: ["cufe", "factura", "invoice", "electronica"], parametros: { cufe: ["cufe", "document_key", "uuid", "key"] }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 86400, finalidad: "Validar facturas electrónicas aportadas como título o prueba." },
  { id: "tributario.doctrina", descripcion: "Búsqueda en la doctrina tributaria publicada (DIAN)", prefijos: ["dian"], palabras: ["doctrina", "concepto", "oficio", "doctrine", "search", "buscar"], parametros: { consulta: CONSULTA }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 7 * 86400, finalidad: "Recuperar doctrina administrativa tributaria (Módulo 6)." },
  { id: "tributario.rut", descripcion: "Estado del RUT (DIAN)", prefijos: ["dian"], palabras: ["rut", "registro unico tributario", "estado"], parametros: { nit: NIT }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 86400, finalidad: "Verificar el estado tributario de una parte persona jurídica." },
  { id: "contratacion.secop", descripcion: "Procesos, contratos y sanciones de contratación pública (SECOP)", prefijos: ["secop", "ancp"], palabras: ["contrato", "proceso", "contract", "sancion", "adjudic"], parametros: { consulta: CONSULTA, nit: NIT }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 86400, finalidad: "Verificar contratos estatales y sanciones del contratista." },
  { id: "vehiculos.runt", descripcion: "Información del vehículo por placa (RUNT)", prefijos: ["runt"], palabras: ["placa", "plate", "vehiculo", "vehicle"], parametros: { placa: ["placa", "plate", "numero_placa", "license_plate"], documento: DOCUMENTO }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Verificar el estado registral de un vehículo del inventario o del litigio." },
  { id: "vehiculos.simit", descripcion: "Multas y comparendos de tránsito (SIMIT)", prefijos: ["simit"], palabras: ["multa", "comparendo", "fine", "transito"], parametros: { placa: ["placa", "plate", "numero_placa"], documento: DOCUMENTO }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: true, ttlSegundos: 86400, finalidad: "Verificar obligaciones de tránsito que afecten un bien del caso." },
  { id: "normas.texto", descripcion: "Texto y vigencia de leyes y normas colombianas", prefijos: ["legalize", "leyes", "normas", "suin", "senado"], palabras: ["ley", "norma", "law", "articulo", "article", "decreto", "vigencia"], parametros: { norma: ["norma", "ley", "law", "query", "q", "id", "nombre"], articulo: ["articulo", "article", "art", "numero_articulo"] }, paises: ["Colombia"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 7 * 86400, finalidad: "Verificar texto vigente de una norma citada (Módulos 4 y 21)." },
  { id: "web.busqueda", descripcion: "Búsqueda web para agentes (se restringe a dominios oficiales)", prefijos: ["web"], palabras: ["search", "buscar", "busqueda", "web"], parametros: { consulta: CONSULTA, dominios: ["domains", "include_domains", "allowed_domains", "site", "sites"] }, paises: ["Global"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 86400, finalidad: "Localizar providencias y normas en dominios oficiales (Módulos 1, 4 y 6)." },
  { id: "web.extraer", descripcion: "Extracción del contenido de una URL", prefijos: ["extract"], palabras: ["url", "extract", "page", "fetch", "content", "scrape"], parametros: { url: ["url", "urls", "link", "page_url", "uri"] }, paises: ["Global"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 7 * 86400, finalidad: "Obtener el texto de la fuente oficial para verificación literal (Módulo 21)." },
  { id: "investigacion.profunda", descripcion: "Investigación profunda asistida", prefijos: ["research"], palabras: ["research", "investig", "deep"], parametros: { consulta: CONSULTA }, paises: ["Global"], autorizacion: "IMPLICITA", datosPersonales: false, ttlSegundos: 86400, finalidad: "Investigación de apoyo; sus hallazgos se verifican en fuente oficial." },
];

export function definicionCapacidad(id: IdCapacidad): DefinicionCapacidad {
  const c = CAPACIDADES.find((x) => x.id === id);
  if (!c) throw new Error(`Capacidad desconocida: ${id}`);
  return c;
}

/** Dominios oficiales permitidos para búsquedas y extracciones de fuentes del derecho. */
export const DOMINIOS_OFICIALES = [
  "corteconstitucional.gov.co", "cortesuprema.gov.co", "consejodeestado.gov.co", "ramajudicial.gov.co", "secretariasenado.gov.co",
  "suin-juriscol.gov.co", "funcionpublica.gov.co", "dian.gov.co", "sic.gov.co", "superfinanciera.gov.co", "superservicios.gov.co",
  "supersociedades.gov.co", "creg.gov.co", "cra.gov.co", "mintrabajo.gov.co", "icbf.gov.co", "procuraduria.gov.co", "defensoria.gov.co",
  "minjusticia.gov.co", "colombiacompra.gov.co", "cancilleria.gov.co", "archivogeneral.gov.co",
];

export function esDominioOficial(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DOMINIOS_OFICIALES.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
