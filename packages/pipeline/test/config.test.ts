import { describe, expect, it } from "vitest";
import { AUTOR_POR_DEFECTO, completarCampos, configDesdeEntorno, PERFIL_DEMO } from "../src";

describe("configuración del despacho", () => {
  it("toma valores por defecto y los del entorno", () => {
    const c = configDesdeEntorno({ EM_CIERRES_JUDICIALES: "2026-07-01, 2026-07-02", SMMLV_AJUSTES: "2030=123" });
    expect(c.autorInforme).toBe(AUTOR_POR_DEFECTO);
    expect(c.calendario.cierres).toEqual(["2026-07-01", "2026-07-02"]);
    expect(c.calendario.vacanciaColectiva).not.toBeNull();
    expect(c.smmlvAjustes[2030]).toBe(123);
  });

  it("rechaza fechas de cierre mal formadas", () => {
    expect(() => configDesdeEntorno({ EM_CIERRES_JUDICIALES: "01/07/2026" })).toThrow(/EM_CIERRES_JUDICIALES/);
  });
});

describe("campos abiertos del apoderado", () => {
  it("se completan con el perfil verificado y los que no constan quedan abiertos", () => {
    const t = "[NOMBRE], C.C. [C.C. No.], T.P. [T.P. No.], teléfono [TELÉFONO]";
    expect(completarCampos(t, PERFIL_DEMO)).toBe(`${PERFIL_DEMO.nombre}, C.C. ${PERFIL_DEMO.identificacion}, T.P. ${PERFIL_DEMO.tarjetaProfesional}, teléfono [TELÉFONO]`);
    expect(completarCampos(t, null)).toBe(t);
  });
});
