import { describe, expect, it } from "vitest";
import {
  calcularTermino, CALENDARIO_POR_DEFECTO, CATALOGO_TERMINOS, diasHabilesEntre, domingoDePascua, esHabil, festivosColombia,
  interpretarFecha, motivoInhabil, primerHabilDesde, restarDiasHabiles, sumarDiasHabiles, sumarMeses,
} from "../src";

describe("festivos de Colombia (Ley 51 de 1983)", () => {
  it("calcula la Pascua", () => {
    expect(domingoDePascua(2025)).toBe("2025-04-20");
    expect(domingoDePascua(2026)).toBe("2026-04-05");
    expect(domingoDePascua(2024)).toBe("2024-03-31");
  });

  it("reproduce el calendario oficial de 2025 (18 festivos, dos coinciden el 30 de junio)", () => {
    const f = festivosColombia(2025);
    expect([...f.keys()]).toEqual([
      "2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18", "2025-05-01", "2025-06-02", "2025-06-23",
      "2025-06-30", "2025-07-20", "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17", "2025-12-08", "2025-12-25",
    ]);
    expect(f.get("2025-06-30")).toEqual(["San Pedro y San Pablo", "Sagrado Corazón de Jesús"]);
  });

  it("reproduce el calendario de 2026", () => {
    expect([...festivosColombia(2026).keys()]).toEqual([
      "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-18", "2026-06-08",
      "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
    ]);
  });
});

describe("días hábiles judiciales (art. 118 CGP)", () => {
  it("excluye vacancia colectiva, Semana Santa y cierres", () => {
    expect(motivoInhabil("2025-12-22", "JUDICIAL")).toBe("vacancia judicial colectiva");
    expect(motivoInhabil("2025-12-22", "ADMINISTRATIVO")).toBeNull();
    expect(motivoInhabil("2026-03-30", "JUDICIAL")).toBe("vacancia judicial de Semana Santa");
    expect(esHabil("2026-03-30", "ADMINISTRATIVO")).toBe(true);
    const cfg = { ...CALENDARIO_POR_DEFECTO, cierres: ["2026-09-28"] };
    expect(esHabil("2026-09-28", "JUDICIAL", cfg)).toBe(false);
  });

  it("cuenta días desde el día hábil siguiente", () => {
    // Notificación viernes 2026-09-25 → 3 días hábiles: lun 28, mar 29, mié 30
    expect(sumarDiasHabiles("2026-09-25", 3)).toBe("2026-09-30");
    // Diez días atravesando la vacancia colectiva
    expect(sumarDiasHabiles("2025-12-18", 2)).toBe("2026-01-13");
    expect(diasHabilesEntre("2026-09-25", "2026-09-30")).toBe(3);
    expect(restarDiasHabiles("2026-09-30", 3)).toBe("2026-09-25");
  });

  it("extiende al primer día hábil siguiente", () => {
    expect(primerHabilDesde("2026-10-11")).toBe("2026-10-13"); // domingo → lunes festivo (Raza) → martes
  });
});

describe("meses y años (art. 67 C.C.; art. 59 Ley 4 de 1913)", () => {
  it("conserva el número del día o toma el último del mes", () => {
    expect(sumarMeses("2026-03-16", 4)).toBe("2026-07-16");
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2024-02-29", 12)).toBe("2025-02-28");
  });

  it("interpreta fechas en español", () => {
    expect(interpretarFecha("12 de marzo de 2024")).toBe("2024-03-12");
    expect(interpretarFecha("05/11/2023")).toBe("2023-11-05");
    expect(interpretarFecha("31/02/2023")).toBeNull();
  });
});

describe("cómputo de términos (Módulo 8)", () => {
  it("nulidad y restablecimiento: cuatro meses desde el día siguiente, extendido si el último día es inhábil", () => {
    const r = calcularTermino({ termino: "cpaca_nulidad_restablecimiento", fechaEvento: "2026-06-11", soporteFecha: "05_NOTIFICACION p. 1", hoy: "2026-09-25" });
    // Primer día 2026-06-12 → último día 2026-10-12 (lunes festivo) → 2026-10-13
    expect(r.primerDia).toBe("2026-06-12");
    expect(r.vencimiento).toBe("2026-10-13");
    expect(r.estado).toBe("RIESGO");
    expect(r.advertencias.some((a) => a.includes("caducidad opera de oficio"))).toBe(true);
    expect(r.explicacion.join(" ")).toContain("festivo");
  });

  it("excepciones en ejecutivo: diez días hábiles con estado inminente", () => {
    const r = calcularTermino({ termino: "cgp_excepciones_ejecutivo", fechaEvento: "2026-09-18", soporteFecha: "03_NOTIFICACION_ELECTRONICA p. 2", hoy: "2026-09-25" });
    expect(r.vencimiento).toBe("2026-10-02");
    expect(r.estado).toBe("RIESGO_INMINENTE");
    expect(r.alertas.every((f) => f >= "2026-09-25")).toBe(true);
  });

  it("doble cómputo con fecha no determinada toma el escenario más desfavorable", () => {
    const r = calcularTermino({ termino: "cambiaria_directa", fechaEvento: "2023-01-10", fechaEventoHasta: "2023-06-30", soporteFecha: "02_PAGARE p. 1", hoy: "2026-09-25" });
    expect(r.esEstimacion).toBe(true);
    expect(r.vencimientoMasTemprano).toBe("2026-01-13"); // 10 de enero de 2026 es sábado → lunes 12 festivo (Reyes) → martes 13
    expect(r.estado).toBe("VENCIDO_APARENTE");
    expect(r.margen).toContain("escenario más desfavorable");
    expect(r.advertencias[0]).toContain("APARENTEMENTE vencido");
  });

  it("términos sin caducidad legal", () => {
    expect(calcularTermino({ termino: "accion_popular", fechaEvento: "2026-01-01", soporteFecha: "relato", hoy: "2026-09-25" }).estado).toBe("SIN_TERMINO");
  });

  it("todas las entradas del catálogo declaran norma y verificación", () => {
    for (const e of CATALOGO_TERMINOS) {
      expect(e.norma.length, e.id).toBeGreaterThan(5);
      expect(/^(VERIFICADA|CONTRASTADA|PENDIENTE)/.test(e.verificacion), e.id).toBe(true);
    }
    expect(new Set(CATALOGO_TERMINOS.map((e) => e.id)).size).toBe(CATALOGO_TERMINOS.length);
  });
});
