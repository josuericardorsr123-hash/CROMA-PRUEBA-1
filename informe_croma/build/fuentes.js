/* Registro único de fuentes: notas al pie (F, TF) y referencias APA (REFS). */
const D = 'https://docs.usecroma.com/es/';
const FUENTES = {
  llms: { t: 'Croma API: índice de documentación para modelos de lenguaje (llms.txt)', u: 'https://docs.usecroma.com/llms.txt', s: 'Croma API Docs' },
  intro: { t: 'Introducción', u: D + 'introduction', s: 'Croma API Docs' },
  quick: { t: 'Inicio rápido', u: D + 'quickstart', s: 'Croma API Docs' },
  auth: { t: 'Autenticación', u: D + 'authentication', s: 'Croma API Docs' },
  mcp: { t: 'MCP', u: D + 'mcp-server', s: 'Croma API Docs' },
  async: { t: 'Trabajos asíncronos', u: D + 'async-jobs', s: 'Croma API Docs' },
  batch: { t: 'Solicitudes en lote', u: D + 'batch', s: 'Croma API Docs' },
  live: { t: 'Consultas en vivo', u: D + 'live-lookups', s: 'Croma API Docs' },
  datasets: { t: 'Datasets', u: D + 'datasets', s: 'Croma API Docs' },
  monitors: { t: 'Monitores', u: D + 'monitors', s: 'Croma API Docs' },
  monmcp: { t: 'Monitores desde Claude', u: D + 'monitors-mcp', s: 'Croma API Docs' },
  monsrc: { t: 'Fuentes monitoreables', u: D + 'monitors-sources', s: 'Croma API Docs' },
  credits: { t: 'Créditos', u: D + 'credits', s: 'Croma API Docs' },
  rate: { t: 'Límites de tasa', u: D + 'rate-limits', s: 'Croma API Docs' },
  errors: { t: 'Errores', u: D + 'errors', s: 'Croma API Docs' },
  version: { t: 'Versionado y deprecación', u: D + 'versioning', s: 'Croma API Docs' },
  policia: { t: 'Policía Nacional', u: D + 'guides/colombia/policia', s: 'Croma API Docs' },
  procuraduria: { t: 'Procuraduría', u: D + 'guides/colombia/procuraduria', s: 'Croma API Docs' },
  registraduria: { t: 'Registraduría', u: D + 'guides/colombia/registraduria', s: 'Croma API Docs' },
  contraloria: { t: 'Contraloría', u: D + 'guides/colombia/contraloria', s: 'Croma API Docs' },
  contaduria: { t: 'Contaduría', u: D + 'guides/colombia/contaduria', s: 'Croma API Docs' },
  adres: { t: 'ADRES (BDUA)', u: D + 'guides/colombia/adres', s: 'Croma API Docs' },
  ruaf: { t: 'RUAF', u: D + 'guides/colombia/ruaf', s: 'Croma API Docs' },
  runt: { t: 'RUNT', u: D + 'guides/colombia/runt', s: 'Croma API Docs' },
  simit: { t: 'SIMIT', u: D + 'guides/colombia/simit', s: 'Croma API Docs' },
  muisca: { t: 'Mi cuenta DIAN', u: D + 'guides/colombia/dian-muisca', s: 'Croma API Docs' },
  bancolombia: { t: 'Mis cuentas Bancolombia', u: D + 'guides/colombia/bancolombia', s: 'Croma API Docs' },
  skill: { t: 'Croma API: Agent Skill (SKILL.md)', u: 'https://usecroma.com/.well-known/agent-skills/croma-api/SKILL.md', s: 'Croma' },
  co: { t: 'Datos oficiales de Colombia por API', u: 'https://usecroma.com/es/co', s: 'Croma' },
  sitemcp: { t: 'Servidor MCP de Croma: datos de gobierno en tu asistente', u: 'https://usecroma.com/es/mcp', s: 'Croma' },
  pricing: { t: 'Precios: planes y créditos de la API de Croma', u: 'https://usecroma.com/es/pricing', s: 'Croma' },
  about: { t: 'About Croma: the API for government data', u: 'https://usecroma.com/en/about', s: 'Croma' },
  industries: { t: 'Industrias: datos oficiales para cada equipo', u: 'https://usecroma.com/es/industries', s: 'Croma' },
};

function F(clave, detalle) {
  const f = FUENTES[clave];
  if (!f) throw new Error('Fuente desconocida: ' + clave);
  const autor = clave === 'skill' || f.s === 'Croma' ? 'Croma' : 'Croma';
  return `[^${autor} (2026), *${f.t}*${detalle ? `, ${detalle}` : ''}. ${f.u} ^]`;
}

function TF(ids, texto) {
  return `[^Prueba${ids.includes(',') ? 's' : ''} ${ids} ejecutada${ids.includes(',') ? 's' : ''} por el autor el 12 de octubre de 2026 mediante el servidor MCP de Croma (registro completo en el Anexo C): ${texto} ^]`;
}

function cita(clave) {   // referencia corta APA para citas destacadas
  const f = FUENTES[clave];
  return `(Croma, 2026, «${f.t}»). ${f.u}`;
}

const REFS = [
  ...Object.entries(FUENTES).map(([, f]) => `Croma. (2026). *${f.t}* [${f.s === 'Croma API Docs' ? 'Documentación técnica' : 'Sitio web'}]. ${f.s}. Recuperado el 12 de octubre de 2026, de ${f.u}`),
  'Congreso de la República de Colombia. (2012). *Ley 1581 de 2012, por la cual se dictan disposiciones generales para la protección de datos personales*. Diario Oficial 48587. Gestor Normativo de Función Pública. https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981',
  '*Creador de flujos de trabajo: Arquitecto de diagramas de proyectos de IA, v1.0 Enterprise*. (2026). [Especificación conductual en Markdown; documento de trabajo interno].',
  'Ministerio de Relaciones Exteriores de Colombia. (2026). *Pasos para hacer su trámite: apostilla y legalización en línea* [Sitio web]. https://www.cancilleria.gov.co/atencion-y-servicio-al-ciudadano/tramites-y-servicios/apostilla-y-legalizacion-en-linea/pasos-para-hacer-su-tramite',
  'Corte Constitucional de Colombia. (2022). *Sentencia SU-424 de 2021* [Relatoría]. https://www.corteconstitucional.gov.co/relatoria/2021/SU424-21.htm',
  'Departamento Administrativo Nacional de Estadística. (2026). *Pobreza monetaria: anexo departamental 2025* [Conjunto de datos]. https://www.dane.gov.co/files/operaciones/PM/anex-PMDepartamental-2025.xlsx',
].sort((a, b) => a.replace(/\*/g, '').localeCompare(b.replace(/\*/g, ''), 'es'));

module.exports = { FUENTES, F, TF, cita, REFS };
