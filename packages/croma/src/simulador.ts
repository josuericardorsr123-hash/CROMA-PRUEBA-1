import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────────────
 * Simulador de Croma: servidor MCP real (Streamable HTTP, modo sin estado) con
 * autenticación Bearer y herramientas que siguen la convención de nombres y
 * descripciones del catálogo de Croma. Sirve para pruebas de contrato, la
 * demostración y el desarrollo local sin clave. TODO lo que devuelve es
 * SIMULADO y así queda marcado en la procedencia.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ResultadoWebSimulado {
  title: string;
  url: string;
  snippet: string;
}

export interface DatosSimulados {
  procesos?: Record<string, unknown>;
  procesosPorNombre?: Record<string, unknown[]>;
  empresas?: Record<string, unknown>;
  cedulas?: Record<string, unknown>;
  antecedentes?: Record<string, { procuraduria?: unknown; contraloria?: unknown; policia?: unknown }>;
  vehiculos?: Record<string, unknown>;
  multas?: Record<string, unknown>;
  insolvencias?: Record<string, unknown>;
  facturas?: Record<string, unknown>;
  normas?: Record<string, { texto: string; vigencia?: string; url?: string }>;
  paginas?: Record<string, string>;
  busquedas?: Array<{ patron: string; resultados: ResultadoWebSimulado[] }>;
  doctrina?: Array<{ patron: string; resultados: unknown[] }>;
}

export interface OpcionesSimulador {
  apiKey: string;
  puerto?: number;
  datos?: DatosSimulados;
  /** Responde HTTP 503 las primeras N llamadas a la herramienta indicada. */
  fallarPrimeras?: Record<string, number>;
  /** Devuelve {status:"pending", job_id} en la primera llamada de estas herramientas. */
  pendientePrimera?: string[];
}

export interface SimuladorCroma {
  url: string;
  llamadas: Array<{ herramienta: string; argumentos: unknown }>;
  cerrar(): Promise<void>;
}

const norm = (t: string) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const soloDigitos = (t: string) => (t ?? "").replace(/\D/g, "");
const texto = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const noEncontrado = { found: false };

function construirServidor(datos: DatosSimulados, estado: { conteo: Map<string, number>; pendientes: Set<string>; llamadas: SimuladorCroma["llamadas"] }, opciones: OpcionesSimulador): McpServer {
  const servidor = new McpServer({ name: "croma-simulado", version: "1.0.0" });
  const registrar = <S extends z.ZodRawShape>(nombre: string, descripcion: string, forma: S, fn: (args: z.infer<z.ZodObject<S>>) => unknown) => {
    servidor.registerTool(nombre, { description: descripcion, inputSchema: forma }, (async (args: z.infer<z.ZodObject<S>>) => {
      estado.llamadas.push({ herramienta: nombre, argumentos: args });
      if (opciones.pendientePrimera?.includes(nombre) && !estado.pendientes.has(nombre)) {
        estado.pendientes.add(nombre);
        return texto({ status: "pending", job_id: `job_${nombre}` });
      }
      return texto(await fn(args));
    }) as never);
  };

  registrar("rama_judicial_cases_by_radicado", "Consulta un proceso judicial por su número de radicación de 23 dígitos: despacho, sujetos procesales y actuaciones. (Source: Rama Judicial; Country: Colombia)", { radicado: z.string() },
    ({ radicado }) => datos.procesos?.[soloDigitos(radicado)] ?? noEncontrado);
  registrar("rama_judicial_cases_by_name", "Busca procesos judiciales por nombre o razón social de un sujeto procesal. (Source: Rama Judicial; Country: Colombia)", { name: z.string(), person_type: z.string().optional() },
    ({ name }) => ({ results: datos.procesosPorNombre?.[norm(name)] ?? [] }));
  registrar("samai_processes_by_radicado", "Consulta procesos de la jurisdicción de lo contencioso administrativo en SAMAI. (Source: SAMAI; Country: Colombia)", { radicado: z.string() },
    ({ radicado }) => datos.procesos?.[soloDigitos(radicado)] ?? noEncontrado);
  registrar("rues_company_search", "Registro mercantil: matrícula, estado, actividad CIIU y representantes legales por NIT o razón social. (Source: RUES; Country: Colombia)", { nit: z.string().optional(), name: z.string().optional() },
    ({ nit, name }) => (nit ? datos.empresas?.[soloDigitos(nit).slice(0, 9)] : Object.values(datos.empresas ?? {}).find((e) => norm(String((e as Record<string, unknown>).razon_social ?? "")).includes(norm(name ?? "")))) ?? noEncontrado);
  registrar("registraduria_cedula_status", "Estado y vigencia de una cédula de ciudadanía. (Source: Registraduría Nacional; Country: Colombia)", { document_number: z.string() },
    ({ document_number }) => datos.cedulas?.[soloDigitos(document_number)] ?? noEncontrado);
  registrar("procuraduria_antecedentes", "Antecedentes disciplinarios, penales, contractuales, fiscales y de pérdida de investidura (SIRI). (Source: Procuraduría General de la Nación; Country: Colombia)", { document_number: z.string() },
    ({ document_number }) => datos.antecedentes?.[soloDigitos(document_number)]?.procuraduria ?? { found: true, registros: [], mensaje: "No registra sanciones ni inhabilidades vigentes" });
  registrar("contraloria_responsables_fiscales", "Boletín de responsables fiscales (SIBOR). (Source: Contraloría General de la República; Country: Colombia)", { document_number: z.string() },
    ({ document_number }) => datos.antecedentes?.[soloDigitos(document_number)]?.contraloria ?? { found: true, reportado: false });
  registrar("policia_antecedentes_judiciales", "Antecedentes judiciales. (Source: Policía Nacional; Country: Colombia)", { document_number: z.string() },
    ({ document_number }) => datos.antecedentes?.[soloDigitos(document_number)]?.policia ?? { found: true, tiene_asuntos_pendientes: false });
  registrar("sicaac_insolvency_search", "Trámites de insolvencia de persona natural no comerciante y conciliaciones registradas. (Source: SICAAC - Ministerio de Justicia; Country: Colombia)", { document_number: z.string() },
    ({ document_number }) => datos.insolvencias?.[soloDigitos(document_number)] ?? { found: false });
  registrar("runt_vehicle_by_plate", "Información del vehículo por placa: clase, marca, estado, SOAT, revisión técnico-mecánica y limitaciones. (Source: RUNT; Country: Colombia)", { plate: z.string() },
    ({ plate }) => datos.vehiculos?.[plate.toUpperCase().replace(/\W/g, "")] ?? noEncontrado);
  registrar("simit_fines", "Multas y comparendos de tránsito por documento o placa. (Source: SIMIT; Country: Colombia)", { document_number: z.string().optional(), plate: z.string().optional() },
    ({ document_number, plate }) => datos.multas?.[plate ? plate.toUpperCase() : soloDigitos(document_number ?? "")] ?? { found: true, multas: [] });
  registrar("dian_cufe_validation", "Valida una factura electrónica por su CUFE. (Source: DIAN; Country: Colombia)", { cufe: z.string() },
    ({ cufe }) => datos.facturas?.[cufe.toLowerCase()] ?? noEncontrado);
  registrar("dian_doctrina_search", "Búsqueda de texto completo en la doctrina tributaria publicada (conceptos y oficios). (Source: DIAN; Country: Colombia)", { query: z.string() },
    ({ query }) => ({ results: datos.doctrina?.find((d) => new RegExp(d.patron, "i").test(query))?.resultados ?? [] }));
  registrar("secop_contracts_search", "Procesos y contratos de contratación pública y sanciones a contratistas. (Source: SECOP; Country: Colombia)", { query: z.string().optional(), nit: z.string().optional() },
    () => ({ results: [] }));
  registrar("legalize_law_article", "Texto de leyes y normas colombianas, por norma y artículo, con notas de vigencia. (Source: Legalize; Country: Colombia)", { law: z.string(), article: z.string().optional() },
    ({ law, article }) => {
      const clave = `${norm(law)}${article ? `|${article}` : ""}`;
      const n = datos.normas?.[clave] ?? datos.normas?.[norm(law)];
      return n ? { found: true, norma: law, articulo: article ?? null, texto: n.texto, vigencia: n.vigencia ?? "VIGENTE", url: n.url ?? null } : noEncontrado;
    });
  registrar("web_search", "Búsqueda web para agentes; admite restricción por dominios. (Source: Croma; Country: Global)", { query: z.string(), domains: z.array(z.string()).optional() },
    ({ query, domains }) => {
      const resultados = datos.busquedas?.filter((b) => new RegExp(b.patron, "i").test(query)).flatMap((b) => b.resultados) ?? [];
      return { results: domains?.length ? resultados.filter((r) => domains.some((d) => r.url.includes(d))) : resultados };
    });
  registrar("extract_url", "Extrae el contenido textual de una URL. (Source: Croma; Country: Global)", { url: z.string() },
    ({ url }) => (datos.paginas?.[url] !== undefined ? { url, content: datos.paginas[url] } : { found: false, url }));
  return servidor;
}

async function leerCuerpo(req: IncomingMessage): Promise<unknown> {
  const trozos: Buffer[] = [];
  for await (const t of req) trozos.push(t as Buffer);
  const crudo = Buffer.concat(trozos).toString("utf8");
  return crudo ? JSON.parse(crudo) : undefined;
}

export async function iniciarSimuladorCroma(opciones: OpcionesSimulador): Promise<SimuladorCroma> {
  const datos = opciones.datos ?? {};
  const estado = { conteo: new Map<string, number>(), pendientes: new Set<string>(), llamadas: [] as SimuladorCroma["llamadas"] };
  const http: Server = createServer(async (req, res) => {
    try {
      if (!req.url?.startsWith("/mcp")) {
        res.writeHead(404).end();
        return;
      }
      if (req.headers.authorization !== `Bearer ${opciones.apiKey}`) {
        res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" }).end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(405, { allow: "POST" }).end();
        return;
      }
      const cuerpo = await leerCuerpo(req);
      const llamada = cuerpo as { method?: string; params?: { name?: string } } | undefined;
      if (llamada?.method === "tools/call" && llamada.params?.name) {
        const n = llamada.params.name;
        const hechas = (estado.conteo.get(n) ?? 0) + 1;
        estado.conteo.set(n, hechas);
        if ((opciones.fallarPrimeras?.[n] ?? 0) >= hechas) {
          res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: "service unavailable" }));
          return;
        }
      }
      const servidor = construirServidor(datos, estado, opciones);
      const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void transporte.close();
        void servidor.close();
      });
      await servidor.connect(transporte);
      await transporte.handleRequest(req, res, cuerpo);
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: String(e) }));
    }
  });
  await new Promise<void>((ok) => http.listen(opciones.puerto ?? 0, "127.0.0.1", ok));
  const { port } = http.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    llamadas: estado.llamadas,
    cerrar: () => new Promise<void>((ok) => http.close(() => ok())),
  };
}
