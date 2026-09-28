import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { capacidadesDocumentales, construirIndice, detectarMime, dividirPdf, empaquetar, indiceCsv, lotesDePaginas, pdfDeImagenesPng, pdfDeTexto, prepararDocumento, recibir, renderizarPagina, conDirectorioTemporal, paginasPdf } from "../src";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const cap = await capacidadesDocumentales();
const conPoppler = cap.pdftotext && cap.pdftoppm && cap.pdfinfo && cap.qpdf;

describe("detección de formato", () => {
  it("reconoce PDF, PNG, ZIP y texto por su firma", () => {
    expect(detectarMime(pdfDeTexto([["hola"]]), "a.bin").clase).toBe("PDF");
    expect(detectarMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]), "a").clase).toBe("IMAGEN");
    expect(detectarMime(Buffer.from(zipSync({ "x.txt": strToU8("a") })), "c.zip").clase).toBe("COMPRIMIDO");
    expect(detectarMime(Buffer.from("Relato del cliente: el 3 de marzo de 2024…"), "relato.txt").clase).toBe("TEXTO");
  });
});

describe.runIf(conPoppler)("recepción y lectura (Poppler/qpdf)", () => {
  it("marca duplicados, expande comprimidos sin rutas peligrosas y cuenta páginas", async () => {
    const pdf = pdfDeTexto([["Página uno del contrato de compraventa"], ["Página dos: firmas de las partes"]]);
    const zip = Buffer.from(zipSync({ "carpeta/copia.pdf": new Uint8Array(pdf), "../fuera.txt": strToU8("intento de salir"), "__MACOSX/basura": strToU8("x") }));
    const r = await recibir([{ nombre: "contrato.pdf", contenido: pdf }, { nombre: "anexos.zip", contenido: zip }]);
    expect(r).toHaveLength(3);
    expect(r[0]!.paginas).toBe(2);
    const copia = r.find((x) => x.rutaRelativa.endsWith("copia.pdf"))!;
    expect(copia.duplicadoDe).toBe("contrato.pdf");
    expect(r.some((x) => x.rutaRelativa.includes(".."))).toBe(false);
  });

  it("distingue páginas con texto de páginas escaneadas", async () => {
    const textoPdf = pdfDeTexto([["JUZGADO VEINTITRÉS CIVIL MUNICIPAL DE BOGOTÁ", "Auto que libra mandamiento de pago", "Radicado 11001400302320240012300", "Se ordena al demandado pagar la suma de $12.500.000 dentro de los cinco días siguientes."]]);
    const png = await conDirectorioTemporal(async (dir) => {
      const ruta = join(dir, "t.pdf");
      await writeFile(ruta, textoPdf);
      return renderizarPagina(ruta, 1, 60);
    });
    const escaneo = pdfDeImagenesPng([png]);
    const [a, b] = await recibir([{ nombre: "auto.pdf", contenido: textoPdf }, { nombre: "escaneo.pdf", contenido: escaneo }]);
    const pa = await prepararDocumento(a!);
    const pb = await prepararDocumento(b!);
    expect(pa.paginas[0]!.metodo).toBe("TEXTO_EMBEBIDO");
    expect(pa.paginas[0]!.texto).toContain("mandamiento de pago");
    expect(pb.paginas[0]!.metodo).toBe("LECTURA_VISUAL");
    expect(pb.paginas[0]!.imagen!.base64.length).toBeGreaterThan(100);
  });

  it("divide un PDF multi-documento por rango de páginas", async () => {
    const pdf = pdfDeTexto([["Poder especial"], ["Cédula"], ["Pagaré"], ["Carta de cobro"]]);
    const parte = await dividirPdf(pdf, 2, 3);
    await conDirectorioTemporal(async (dir) => {
      const ruta = join(dir, "p.pdf");
      await writeFile(ruta, parte);
      expect(await paginasPdf(ruta)).toBe(2);
    });
  });
});

describe("índice electrónico y lotes", () => {
  it("foliación continua y CSV con BOM para Excel", () => {
    const filas = construirIndice([
      { orden: 2, anexo: 2, nombreDocumento: "02_PAGARE-Pagare_10-01-2024.pdf", tipologia: "PAGARÉ", fechaDocumento: "2024-01-10", fechaIncorporacion: "2026-09-25", paginas: 2, formato: "PDF", bytes: 100, origen: "ESCANEADO", sha256: "b", observaciones: "" },
      { orden: 1, anexo: 1, nombreDocumento: "01_PODER-Poder_especial_01-09-2026.pdf", tipologia: "PODER", fechaDocumento: "2026-09-01", fechaIncorporacion: "2026-09-25", paginas: 1, formato: "PDF", bytes: 50, origen: "ELECTRONICO", sha256: "a", observaciones: "" },
    ]);
    expect(filas[0]!.paginaInicio).toBe(1);
    expect(filas[1]!.paginaInicio).toBe(2);
    expect(filas[1]!.paginaFin).toBe(3);
    const c = indiceCsv(filas);
    expect(c.startsWith("﻿Orden;")).toBe(true);
    expect(empaquetar([{ ruta: "indice.csv", contenido: c }]).length).toBeGreaterThan(50);
  });

  it("agrupa páginas en lotes acotados", () => {
    const pags = Array.from({ length: 20 }, (_, i) => ({ pagina: i + 1, texto: "x".repeat(100), metodo: "TEXTO_EMBEBIDO" as const, imagen: null }));
    expect(lotesDePaginas(pags, 8).map((l) => l.length)).toEqual([8, 8, 4]);
  });
});
