import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import {
  camposConResultado, firmaEntreGuiones, generarInforme, generarPieza, INTERLINEADO, inspeccionarDocx, localizarEncabezados, MARGEN,
  paginacionDisponible, posprocesarDocx, renderizar, type ResultadoInforme, TAMANOS,
} from "../src";
import { informeMuestra, piezaMuestra } from "./muestra";

const conLibreOffice = await paginacionDisponible();
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

describe("especificación tipográfica (constantes)", () => {
  it("respeta los rangos de la especificación del informe", () => {
    const pt = (medios: number) => medios / 2;
    expect(pt(TAMANOS.titulo)).toBeGreaterThanOrEqual(16);
    expect(pt(TAMANOS.titulo)).toBeLessThanOrEqual(18);
    for (const t of [TAMANOS.autor, TAMANOS.cuerpo]) expect([11, 11.5, 12]).toContain(pt(t));
    expect([12, 12.5, 13]).toContain(pt(TAMANOS.seccion));
    expect([10, 10.5, 11]).toContain(pt(TAMANOS.referencias));
    expect(INTERLINEADO.cuerpo / 240).toBeGreaterThanOrEqual(1.15);
    expect(INTERLINEADO.cuerpo / 240).toBeLessThanOrEqual(1.5);
    expect(INTERLINEADO.referencias / 240).toBeLessThanOrEqual(1.15);
    expect(Math.round((MARGEN / 1440) * 2.54 * 100) / 100).toBe(2.5);
  });

  it("firma centrada entre guiones largos", () => {
    expect(firmaEntreGuiones("Josué Ricardo Rojas Silva")).toBe("—Josué Ricardo Rojas Silva—");
    expect(firmaEntreGuiones("—Josué Ricardo Rojas Silva—")).toBe("—Josué Ricardo Rojas Silva—");
    expect(firmaEntreGuiones(" - Josué Ricardo Rojas Silva - ")).toBe("—Josué Ricardo Rojas Silva—");
  });
});

describe("localización de encabezados", () => {
  const enc = "EDITORIAL · INFORME · FECHA";
  const textos = [
    `${enc}\nTítulo del informe\nTABLA DE CONTENIDO\nI. UNO....................3\n1.1 — Sub..................3\nII. DOS...................4`,
    `${enc}\nIntroducción que menciona I. UNO de paso.`,
    `${enc}\nI. UNO\nTexto del cuerpo.\n1.1 — Sub\nMás texto.`,
    `${enc}\nII. DOS\nTexto.`,
  ];
  const entradas = [
    { id: "a", nivel: 1 as const, texto: "I. UNO", iniciaPagina: true },
    { id: "b", nivel: 2 as const, texto: "1.1 — Sub", iniciaPagina: false },
    { id: "c", nivel: 1 as const, texto: "II. DOS", iniciaPagina: true },
  ];

  it("ignora el propio índice (puntos guía) y las menciones en el cuerpo", () => {
    const m = localizarEncabezados(textos, entradas, enc);
    expect(Object.fromEntries(m)).toEqual({ a: 3, b: 3, c: 4 });
  });

  it("no inventa página para un encabezado ausente", () => {
    const m = localizarEncabezados(textos, [...entradas, { id: "d", nivel: 1, texto: "III. TRES", iniciaPagina: true }], enc);
    expect(m.has("d")).toBe(false);
  });
});

describe("posprocesado OOXML", () => {
  it("separa los campos de página en runs con formato y resultado", () => {
    const rPr = '<w:rPr><w:sz w:val="20"/></w:rPr>';
    const xml = `<w:p><w:r>${rPr}<w:fldChar w:fldCharType="begin"/><w:instrText xml:space="preserve">NUMPAGES</w:instrText><w:fldChar w:fldCharType="separate"/><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const r = camposConResultado(xml, { NUMPAGES: "11" });
    expect(r.match(/<w:r>/g)?.length).toBe(5);
    expect(r.match(/<w:sz w:val="20"\/>/g)?.length).toBe(5);
    expect(r).toContain("<w:t>11</w:t>");
  });
});

describe("informe técnico", () => {
  let r: ResultadoInforme;
  beforeAll(async () => {
    r = await generarInforme(informeMuestra());
  });

  it("cumple el formato: fuente, color, tamaños, página, márgenes, encabezado y pie", () => {
    const i = inspeccionarDocx(r.docx);
    expect(i.fuentes).toEqual(["Times New Roman"]);
    expect(i.colores).toEqual(["000000"]);
    for (const t of [TAMANOS.titulo, TAMANOS.seccion, TAMANOS.cuerpo, TAMANOS.referencias, TAMANOS.nota, TAMANOS.encabezado]) expect(i.tamanosMedioPunto).toContain(t);
    expect(i.tamanoPagina).toEqual({ ancho: 12240, alto: 15840 });
    expect(i.margenes).toEqual([MARGEN, MARGEN, MARGEN, MARGEN]);
    expect(i.encabezado).toBe(informeMuestra().encabezadoEditorial.toUpperCase());
    expect(i.pie).toMatch(/^Página \d+ de \d+$/);
    expect(i.campoPagina && i.campoTotalPaginas && i.campoIndice).toBe(true);
    expect(i.sangriasPrimeraLinea).toBe(0);
    expect(i.citasJustificadas).toBe(0);
    expect(i.sangriasFrancesas).toBeGreaterThanOrEqual(informeMuestra().referencias.length);
  });

  it("contiene la estructura completa en orden", () => {
    const { texto } = inspeccionarDocx(r.docx);
    const orden = ["DEMOSTRACIÓN — datos ficticios", "Informe técnico del expediente", "Josué Ricardo Rojas Silva", "Resumen", "Palabras clave:", "TABLA DE CONTENIDO", "El presente documento", "I. ANTECEDENTES Y HECHOS JURÍDICAMENTE RELEVANTES", "1.1 — Cronología verificada", "II. MARCO NORMATIVO APLICABLE", "«Pueden demandarse", "2.1.1 — Requisitos generales", "Tabla 1", "IV. ESTRATEGIA RECOMENDADA", "CONCLUSIONES", "Referencias", "Congreso de la República. (2012)", "—Josué Ricardo Rojas Silva—"];
    // Cada elemento se busca después del anterior; el índice repite los títulos, por eso se parte del cuerpo.
    let desde = 0;
    for (const o of orden) {
      const pos = texto.indexOf(o, o === "El presente documento" ? texto.indexOf("TABLA DE CONTENIDO") : desde);
      expect(pos, o).toBeGreaterThanOrEqual(desde);
      desde = pos;
    }
  });

  it("notas al pie reales e hipervínculos del índice a cada encabezado", () => {
    const i = inspeccionarDocx(r.docx);
    expect(r.notasAlPie).toBe(4);
    expect(i.notasAlPie).toBe(4);
    expect(i.hipervinculosInternos).toBe(r.indice.length);
    expect(i.marcadores).toBeGreaterThanOrEqual(r.indice.length);
    expect(r.tablas).toBe(1);
  });

  it.skipIf(!conLibreOffice)("el índice imprime la página real de cada encabezado", async () => {
    expect(r.advertencias).toEqual([]);
    expect(r.paginas).toBeGreaterThan(5);
    const paginas = r.indice.map((e) => e.pagina);
    expect(paginas.every((p) => typeof p === "number")).toBe(true);
    expect([...paginas].sort((a, b) => a! - b!)).toEqual(paginas);

    // Verificación independiente: se vuelve a renderizar el DOCX entregado.
    const render = await renderizar(r.docx);
    const mapa = localizarEncabezados(render.textos, r.indice, informeMuestra().encabezadoEditorial);
    for (const e of r.indice) expect(mapa.get(e.id), e.texto).toBe(e.pagina);

    // Lo impreso en la tabla de contenido coincide con la ubicación real.
    const lineasIndice = render.textos.slice(0, 3).join("\n").split("\n").filter((l) => /\.{4,}\s*\d+\s*$/.test(l));
    expect(lineasIndice.length).toBe(r.indice.length);
    for (const e of r.indice) {
      const linea = lineasIndice.find((l) => norm(l).startsWith(norm(e.texto).slice(0, 25)));
      expect(linea, e.texto).toBeDefined();
      expect(Number(/(\d+)\s*$/.exec(linea!)![1]), e.texto).toBe(e.pagina);
    }
    // El pie numera «Página X de Y» con el total real.
    expect(render.textos.at(-1)).toContain(`Página ${render.paginas} de ${render.paginas}`);
  });

  it("sin paginación real deja el índice como campo actualizable, sin números falsos", async () => {
    const s = await generarInforme(informeMuestra(), { paginar: false });
    expect(s.advertencias).toHaveLength(1);
    expect(s.indice.every((e) => e.pagina === null)).toBe(true);
    const a = unzipSync(new Uint8Array(s.docx));
    expect(strFromU8(a["word/settings.xml"]!)).toContain("updateFields");
    const { texto } = inspeccionarDocx(s.docx);
    for (const e of s.indice) expect(texto, e.texto).not.toContain(`${e.texto}000`);
  });

  it("empaqueta un ZIP ordenado y sin entradas de directorio", () => {
    const nombres = Object.keys(unzipSync(new Uint8Array(r.docx)));
    expect(nombres[0]).toBe("[Content_Types].xml");
    expect(nombres.some((n) => n.endsWith("/"))).toBe(false);
    // Idempotente: posprocesar dos veces no altera los campos.
    expect(inspeccionarDocx(posprocesarDocx(r.docx)).pie).toBe(inspeccionarDocx(r.docx).pie);
  });
});

describe("pieza procesal", () => {
  it("BORRADOR: encabezado de revisión y advertencia; secciones en romano", async () => {
    const p = await generarPieza(piezaMuestra("BORRADOR"));
    const i = inspeccionarDocx(p.docx);
    expect(i.encabezado).toContain("BORRADOR PARA REVISIÓN DEL ABOGADO (USUARIO)");
    expect(i.texto).toContain("ADVERTENCIA:");
    for (const t of ["I. HECHOS", "II. PRETENSIONES", "III. FUNDAMENTOS DE DERECHO", "- [NOMBRE] -", "T.P. [T.P. No.]"]) expect(i.texto).toContain(t);
    expect(p.secciones).toBe(3);
    expect(p.notasAlPie).toBe(1);
    expect(i.fuentes).toEqual(["Times New Roman"]);
    expect(i.colores).toEqual(["000000"]);
    expect(i.tamanoPagina).toEqual({ ancho: 12240, alto: 15840 });
    expect(i.pie).toMatch(/^Página \d+ de \d+$/);
  });

  it("RADICABLE: sin marcas de borrador", async () => {
    const i = inspeccionarDocx((await generarPieza(piezaMuestra("RADICABLE"))).docx);
    expect(i.encabezado).toBe("");
    expect(i.texto).not.toContain("ADVERTENCIA");
    expect(i.texto).not.toContain("BORRADOR");
  });
});
