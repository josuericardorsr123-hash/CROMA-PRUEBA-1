import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClienteCroma, iniciarSimuladorCroma, type SimuladorCroma } from "@em/croma";
import { extraerCitas } from "@em/motores";
import { extraerArticulo, htmlATexto, RepositorioFuentes, ResolutorFuentes, vigenciaDesdeTexto } from "../src";

const URL_T323 = "https://www.corteconstitucional.gov.co/relatoria/2024/T-323-24.htm";
const URL_2213 = "http://www.secretariasenado.gov.co/senado/basedoc/ley_2213_2022.html";
const URL_SC = "https://cortesuprema.gov.co/relatoria/SC370-2023.pdf.html";

let sim: SimuladorCroma;
let croma: ClienteCroma;

beforeAll(async () => {
  sim = await iniciarSimuladorCroma({
    apiKey: "k",
    datos: {
      normas: { "ley 1564 de 2012|94": { texto: "ARTÍCULO 94. INTERRUPCIÓN DE LA PRESCRIPCIÓN, INOPERANCIA DE LA CADUCIDAD Y CONSTITUCIÓN EN MORA. La presentación de la demanda interrumpe el término para la prescripción e impide que se produzca la caducidad siempre que el auto admisorio de aquella o el mandamiento ejecutivo se notifique al demandado dentro del término de un (1) año…", vigencia: "VIGENTE" } },
      paginas: {
        [URL_T323]: "<html><body><h1>Sentencia T-323/24</h1><p>… obligación de realizar un estricto escrutinio sobre las fuentes, alcances, restricciones, posibilidades, falencias y riesgos …</p></body></html>",
        [URL_2213]: "LEY 2213 DE 2022\nARTÍCULO 8o. NOTIFICACIONES PERSONALES. Las notificaciones que deban hacerse personalmente también podrán efectuarse con el envío de la providencia respectiva como mensaje de datos… La notificación personal se entenderá realizada una vez transcurridos dos días hábiles siguientes al envío del mensaje.\nARTÍCULO 9o. NOTIFICACIÓN POR ESTADO Y TRASLADOS.",
        [URL_SC]: "CORTE SUPREMA DE JUSTICIA SALA DE CASACIÓN CIVIL SC370-2023 … competencia desleal …",
      },
      busquedas: [{ patron: "SC370-2023", resultados: [{ title: "Sentencia SC370-2023", url: URL_SC, snippet: "Sala de Casación Civil SC370-2023" }] }],
    },
  });
  croma = new ClienteCroma({ url: sim.url, apiKey: "k", simulado: true, esperaPendienteMs: 5 });
});

afterAll(async () => {
  await croma.cerrar();
  await sim.cerrar();
});

const resolutor = (repo = new RepositorioFuentes()) => new ResolutorFuentes({ croma, repositorio: repo, http: { habilitado: false } });
const cita = (t: string, id: string) => extraerCitas(t).find((c) => c.identificador === id)!;

describe("resolución de fuentes", () => {
  it("verifica una norma con texto y vigencia reportados por Croma", async () => {
    const r = await resolutor().resolver(cita("artículo 94 del CGP", "Ley 1564 de 2012, art. 94"), { citaTextual: "La presentación de la demanda interrumpe el término para la prescripción e impide que se produzca la caducidad" });
    expect(r.resolucion).toBe("TEXTO_OFICIAL");
    expect(r.vigencia).toBe("VIGENTE");
    expect(r.coincidenciaTextual).toBe(true);
    expect(r.procedencias[0]!.hashResultado).toBeTruthy();
  });

  it("verifica una sentencia de la Corte Constitucional por su URL oficial y detecta cita textual adulterada", async () => {
    const res = resolutor();
    const c = cita("Sentencia T-323 de 2024", "T-323 de 2024");
    const ok = await res.resolver(c, { citaTextual: "obligación de realizar un estricto escrutinio sobre las fuentes, alcances, restricciones, posibilidades, falencias y riesgos" });
    expect(ok.resolucion).toBe("TEXTO_OFICIAL");
    expect(ok.coincidenciaTextual).toBe(true);
    const mal = await res.resolver(c, { citaTextual: "los jueces deben usar inteligencia artificial para decidir todos los casos" });
    expect(mal.coincidenciaTextual).toBe(false);
  });

  it("extrae el artículo de la compilación oficial del Senado y declara la vigencia según sus notas", async () => {
    const r = await resolutor().resolver(cita("el art. 8 de la Ley 2213 de 2022", "Ley 2213 de 2022, art. 8"));
    expect(r.resolucion).toBe("TEXTO_OFICIAL");
    expect(r.fragmento).toContain("dos días hábiles");
    expect(r.fragmento).not.toContain("NOTIFICACIÓN POR ESTADO");
    expect(r.vigencia).toBe("VIGENTE");
  });

  it("resuelve una providencia de la Corte Suprema por búsqueda en dominio oficial", async () => {
    const r = await resolutor().resolver(cita("la SC370-2023", "SC370-2023"));
    expect(r.resolucion).toBe("TEXTO_OFICIAL");
    expect(r.url).toBe(URL_SC);
  });

  it("declara NO_RESUELTA lo que no existe en ninguna fuente", async () => {
    const r = await resolutor().resolver(cita("Sentencia T-999 de 2031", "T-999 de 2031"));
    expect(r.resolucion).toBe("NO_RESUELTA");
    expect(r.notas.join(" ")).toContain("no puede entrar al documento final");
  });

  it("usa el repositorio solo si la ficha está fresca", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const repo = new RepositorioFuentes([{ id: "f1", tipo: "PROVIDENCIA", identificador: "C-836 de 2001", titulo: "C-836 de 2001", autoridad: "Corte Constitucional", url: "https://www.corteconstitucional.gov.co/relatoria/2001/C-836-01.htm", texto: "Doctrina probable…", estadoVerificacion: `VERIFICADA ${hoy}`, fechaVerificacion: hoy, vinculancia: "VINCULANTE_ERGA_OMNES", origen: "prueba" }]);
    const r = await resolutor(repo).resolver(cita("la C-836/01", "C-836 de 2001"));
    expect(r.resolucion).toBe("REPOSITORIO");
    expect(repo.buscar("doctrina probable")[0]!.ficha.id).toBe("f1");
  });
});

describe("utilidades", () => {
  it("convierte HTML y detecta notas de vigencia", () => {
    expect(htmlATexto("<p>Art&iacute;culo&nbsp;1</p><script>x</script>")).toBe("Artículo 1");
    expect(vigenciaDesdeTexto("ARTÍCULO 5. <Artículo derogado por el artículo 626 de la Ley 1564 de 2012>", true).vigencia).toBe("DEROGADA");
    expect(vigenciaDesdeTexto("Declarado CONDICIONALMENTE EXEQUIBLE en el entendido de que…", true).vigencia).toBe("VIGENTE_CONDICIONADA");
    expect(extraerArticulo("ARTÍCULO 1. A. ARTÍCULO 2. B. ARTÍCULO 3. C.", "2")).toBe("ARTÍCULO 2. B.");
  });
});
