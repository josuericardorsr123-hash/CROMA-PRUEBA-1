import { describe, expect, it } from "vitest";
import {
  claveIdentificador, clasificarCuantiaCGP, consolidarNulidades, decidirVia, determinarCompetencia, evaluarBloque,
  evaluarDocumentosRequeridos, evaluarFuerzaVinculante, evaluarHabilitacion, evaluarMasc, evaluarProcedibilidad, evaluarTutela,
  extraerCitas, extraerCitasTextuales, nombreDocumento, notificacionElectronica, validarRedaccionForense, cierrePeticion, validarPerfilDespacho,
  construirLineaJurisprudencial, coberturaLiteral, contieneLiteral, type HechosVia,
} from "../src";

describe("parser de citas (Módulo 21)", () => {
  const texto = "Según la Sentencia T-323 de 2024 y la C-836/01, reiteradas en la SU611-17, y el artículo 94 del Código General del Proceso, " +
    "así como el art. 8 de la Ley 2213 de 2022, la CSJ en SC370-2023 y el Consejo de Estado en el radicado 11001-03-26-000-2019-00123-00 (64123). " +
    "Ver también el Concepto 23605 de 2015 y el artículo 2536 del C.C.";
  const citas = extraerCitas(texto);
  const ids = citas.map((c) => c.identificador);

  it("detecta providencias de las tres altas cortes", () => {
    expect(ids).toContain("T-323 de 2024");
    expect(ids).toContain("C-836 de 2001");
    expect(ids).toContain("SU-611 de 2017");
    expect(ids).toContain("SC370-2023");
    expect(ids).toContain("11001-03-26-000-2019-00123-00");
  });

  it("construye URLs oficiales con el patrón verificado", () => {
    expect(citas.find((c) => c.identificador === "T-323 de 2024")!.url).toBe("https://www.corteconstitucional.gov.co/relatoria/2024/T-323-24.htm");
    expect(citas.find((c) => c.identificador === "SU-611 de 2017")!.url).toBe("https://www.corteconstitucional.gov.co/relatoria/2017/SU611-17.htm");
    expect(citas.find((c) => c.identificador.startsWith("Ley 2213"))!.url).toBe("http://www.secretariasenado.gov.co/senado/basedoc/ley_2213_2022.html");
  });

  it("asocia el artículo a la norma y a los códigos", () => {
    expect(ids).toContain("Ley 2213 de 2022, art. 8");
    expect(ids).toContain("Ley 1564 de 2012, art. 94");
    expect(ids).toContain("Código Civil, art. 2536");
    expect(ids).toContain("Concepto 23605 de 2015");
  });

  it("normaliza identificadores para comparar", () => {
    expect(claveIdentificador("Sentencia T-0323 de 2024")).toBe(claveIdentificador("T-323 de 2024"));
  });

  it("extrae citas textuales y coteja literalidad", () => {
    const t = "La Corte dijo: «Los sistemas de IA no deben suplantar, en ningún caso, las actividades de motivación» (T-323 de 2024).";
    const [c] = extraerCitasTextuales(t);
    expect(c!.cita).toContain("no deben suplantar");
    const fuente = "…los sistemas de IA no deben suplantar, en ningún caso, las actividades de motivación de las providencias…";
    expect(contieneLiteral(fuente, c!.cita)).toBe(true);
    expect(contieneLiteral(fuente, "los sistemas de IA deben reemplazar al juez")).toBe(false);
    expect(coberturaLiteral(fuente, "los sistemas de IA deben reemplazar al juez")).toBeLessThan(0.8);
  });
});

describe("cuantía y competencia (Módulo 11)", () => {
  it("clasifica con el SMMLV del año y muestra el cálculo", () => {
    const r = clasificarCuantiaCGP(60_000_000, 2025);
    expect(r.categoria).toBe("MENOR"); // 60.000.000 / 1.423.500 = 42,15 SMMLV
    expect(r.calculo).toContain("42.15 SMMLV");
  });
});

describe("cuantía: límites", () => {
  it("aplica los umbrales del art. 25 CGP", () => {
    expect(clasificarCuantiaCGP(56_940_000, 2025).categoria).toBe("MINIMA"); // exactamente 40 SMMLV
    expect(clasificarCuantiaCGP(56_940_001, 2025).categoria).toBe("MENOR");
    expect(clasificarCuantiaCGP(213_525_001, 2025).categoria).toBe("MAYOR");
    const sin = clasificarCuantiaCGP(10_000_000, 2031);
    expect(sin.categoria).toBe("INDETERMINADA");
    expect(clasificarCuantiaCGP(10_000_000, 2031, { 2031: 2_000_000 }).categoria).toBe("MINIMA");
  });

  it("aplica el fuero de atracción en sucesiones de mayor cuantía", () => {
    const r = determinarCompetencia({ area: "FAMILIA", asunto: "SUCESION", valor: 900_000_000, anio: 2025, ultimoDomicilioCausante: "Bogotá D.C." });
    expect(r.juez).toContain("Familia");
    expect(r.cadena.join(" ")).toContain("Fuero de atracción");
    expect(r.territorio).toContain("Bogotá");
  });

  it("competencia privativa del domicilio del menor", () => {
    const r = determinarCompetencia({ area: "FAMILIA", asunto: "FAMILIA", valor: null, anio: 2026, involucraNNA: true, domicilioMenor: "Soacha" });
    expect(r.territorio).toContain("Privativo");
  });
});

describe("vía procesal (Módulo 15)", () => {
  const base: HechosVia = {
    area: "CIVIL", rolCliente: "DEMANDANTE", etapa: "SIN_PROCESO", derechoFundamentalComprometido: false, otroMedioEficaz: null, perjuicioIrremediable: false,
    interesColectivo: false, grupoPlural: false, tituloEjecutivo: false, actoAdministrativoParticular: false, recursosAdministrativosEnTermino: false,
    danoAntijuridicoEstatal: false, incumplimientoNormaOActo: false, renuenciaConstituida: false, peticionSinRespuesta: false, requiereReclamacionPrevia: false,
    conductaPenal: false, perturbacionPosesion: false, relacionConsumo: false, reclamacionConsumoAgotada: false, servicioPublicoDomiciliario: false,
    nulidadProcesalConSoporte: false, conciliacionObligatoriaPendiente: false, cuantiaCategoria: "MENOR", urgente: false,
  };
  it("con mandamiento notificado propone excepciones y reposición concurrente", () => {
    const d = decidirVia({ ...base, rolCliente: "EJECUTADO", etapa: "MANDAMIENTO_NOTIFICADO" });
    expect(d.principal.pieza).toBe("EXCEPCIONES_EJECUCION");
    expect(d.concurrentes.map((c) => c.pieza)).toContain("RECURSO_REPOSICION");
  });
  it("con título ejecutivo descarta el declarativo", () => {
    const d = decidirVia({ ...base, tituloEjecutivo: true });
    expect(d.principal.pieza).toBe("DEMANDA_EJECUTIVA");
    expect(d.descartadas.map((x) => x.via)).toContain("Proceso declarativo");
  });
  it("descarta la tutela por subsidiariedad y registra la razón", () => {
    const d = decidirVia({ ...base, derechoFundamentalComprometido: true, otroMedioEficaz: true, conciliacionObligatoriaPendiente: true });
    expect(d.principal.pieza).toBe("SOLICITUD_CONCILIACION");
    expect(d.descartadas.find((x) => x.via === "Acción de tutela")!.razon).toContain("subsidiariedad");
  });
  it("mínima cuantía sin conciliación pendiente va a verbal sumario", () => {
    expect(decidirVia({ ...base, cuantiaCategoria: "MINIMA" }).principal.pieza).toBe("DEMANDA_VERBAL_SUMARIA");
  });
});

describe("tutela (Módulo 10)", () => {
  const ok = { cumple: true, razon: "ok" };
  it("procede como transitoria con perjuicio irremediable completo", () => {
    const r = evaluarTutela({ legitimacionActiva: ok, legitimacionPasiva: ok, inmediatez: { mesesDesdeElHecho: 2, vulneracionContinuada: false, justificacionDemora: null }, subsidiariedad: { existeOtroMedio: true, medioEsEficaz: true }, perjuicioIrremediable: { inminente: true, urgente: true, grave: true, impostergable: true }, contraProvidenciaJudicial: false, tutelaPreviaMismosHechos: false, sujetoEspecialProteccion: false });
    expect(r.resultado).toBe("PROCEDENTE_TRANSITORIA");
  });
  it("informa la improcedencia con la vía ordinaria", () => {
    const r = evaluarTutela({ legitimacionActiva: ok, legitimacionPasiva: ok, inmediatez: { mesesDesdeElHecho: 14, vulneracionContinuada: false, justificacionDemora: null }, subsidiariedad: { existeOtroMedio: true, medioEsEficaz: true }, perjuicioIrremediable: { inminente: false, urgente: false, grave: true, impostergable: false }, contraProvidenciaJudicial: false, tutelaPreviaMismosHechos: false, sujetoEspecialProteccion: false });
    expect(r.resultado).toBe("IMPROCEDENTE");
    expect(r.examen.find((x) => x.requisito.startsWith("Inmediatez"))!.cumple).toBe("NO");
  });
  it("deja fuera de alcance la tutela contra providencias", () => {
    expect(evaluarTutela({ legitimacionActiva: ok, legitimacionPasiva: ok, inmediatez: { mesesDesdeElHecho: 1, vulneracionContinuada: false, justificacionDemora: null }, subsidiariedad: { existeOtroMedio: false, medioEsEficaz: null }, perjuicioIrremediable: { inminente: false, urgente: false, grave: false, impostergable: false }, contraProvidenciaJudicial: true, tutelaPreviaMismosHechos: false, sujetoEspecialProteccion: false }).resultado).toBe("FUERA_DE_ALCANCE");
  });
});

describe("fuerza vinculante (Módulo 2)", () => {
  it("clasifica por autoridad y tipo, sin doctrina probable", () => {
    expect(evaluarFuerzaVinculante({ autoridad: "CC", tipo: "C" }).nivel).toBe("VINCULANTE_ERGA_OMNES");
    expect(evaluarFuerzaVinculante({ autoridad: "CE", tipo: "sentencia", esUnificacion: true }).nivel).toBe("PRECEDENTE_REFORZADO");
    const csj = evaluarFuerzaVinculante({ autoridad: "CSJ", tipo: "casacion" });
    expect(csj.nivel).toBe("PRECEDENTE_VINCULANTE");
    expect(csj.fundamentos.join(" ")).toContain("Ley 2430 de 2024");
    expect(evaluarFuerzaVinculante({ autoridad: "SUPERINTENDENCIA", tipo: "concepto" }).nivel).toBe("NO_VINCULANTE");
    expect(evaluarFuerzaVinculante({ autoridad: "CC", tipo: "T", esRatioDecidendi: false }).nivel).toBe("PERSUASIVO");
  });
  it("construye la línea jurisprudencial", () => {
    const l = construirLineaJurisprudencial([
      { id: "T-1/10", autoridad: "CC", tipo: "T", fecha: "2010-01-01", regla: "a", sentido: "favorable" },
      { id: "SU-2/15", autoridad: "CC", tipo: "SU", fecha: "2015-01-01", regla: "a", sentido: "favorable" },
      { id: "T-3/20", autoridad: "CC", tipo: "T", fecha: "2020-01-01", regla: "a", sentido: "favorable" },
    ])!;
    expect(l.estado).toBe("CONSOLIDADA");
    expect(l.decisionDeMayorJerarquia).toBe("SU-2/15");
  });
});

describe("procedibilidad, nulidades y omisiones", () => {
  it("la conciliación no es exigible si se piden medidas cautelares", () => {
    const r = evaluarProcedibilidad({ area: "CIVIL", via: "DEMANDA_VERBAL", asuntoConciliable: true, pideMedidasCautelares: true, demandadoEntidadPublica: false });
    expect(r.find((x) => x.id === "conciliacion_civil")!.estado).toBe("NO_EXIGIBLE");
  });
  it("una causal sin soporte es indicio, no nulidad", () => {
    const r = consolidarNulidades([{ numeral: 8, indicio: "SI", soporte: null, observacion: "No consta el acuse", saneada: null }]);
    expect(r.find((x) => x.numeral === 8)!.estado).toBe("INDICIO_SIN_SOPORTE");
    expect(r).toHaveLength(8);
  });
  it("detecta la falta del título ejecutivo", () => {
    const f = evaluarDocumentosRequeridos("proceso ejecutivo singular", "DEMANDANTE", [{ id: "p1", tipologia: "PODER", contenido: "Poder especial" }]);
    expect(f.find((x) => x.requisito.id === "titulo_ejecutivo")!.presente).toBe(false);
    expect(f.find((x) => x.requisito.id === "poder")!.presente).toBe(true);
  });
});

describe("habilitación profesional (Módulo 24)", () => {
  it("el conflicto de intereses es impedimento y el poder faltante es subsanable", () => {
    const r = evaluarHabilitacion({ tipoPieza: "DEMANDA_VERBAL", representaATercero: true, abogado: { nombre: "A", tarjetaProfesional: "123", correoRegistroNacional: "a@b.co" }, poder: null, facultadesRequeridas: [], conflictos: [{ expedienteId: "exp_2", detalle: "representa a la contraparte" }], terminoVencidoAparente: false, tutelaPreviaMismosHechos: false, cuantiaCategoria: "MENOR" });
    expect(r.habilitada).toBe(false);
    expect(r.requiereAccionDelAbogado).toBe(true);
    expect(r.hallazgos.map((h) => h.codigo)).toEqual(expect.arrayContaining(["CONFLICTO_INTERESES", "SIN_PODER"]));
  });
  it("la tutela no requiere postulación", () => {
    expect(evaluarHabilitacion({ tipoPieza: "ACCION_TUTELA", representaATercero: false, abogado: { nombre: null, tarjetaProfesional: null, correoRegistroNacional: null }, poder: null, facultadesRequeridas: [], conflictos: [], terminoVencidoAparente: false, tutelaPreviaMismosHechos: false, cuantiaCategoria: null }).requierePostulacion).toBe(false);
  });
});

describe("notificación electrónica (Módulo 17)", () => {
  it("calcula ambas fechas y toma la conservadora según la perspectiva", () => {
    const r = notificacionElectronica("2026-09-21", "2026-09-23", "RECEPTOR");
    expect(r.surtidaPorEnvio).toBe("2026-09-23");
    expect(r.terminosDesdePorEnvio).toBe("2026-09-24");
    expect(r.terminosDesdePorAcuse).toBe("2026-09-28");
    expect(r.referenciaDeTrabajo).toBe("2026-09-24");
    expect(notificacionElectronica("2026-09-21", "2026-09-23", "REMITENTE").referenciaDeTrabajo).toBe("2026-09-28");
  });
});

describe("redacción forense y petición", () => {
  it("rechaza la raya larga como inciso y las promesas", () => {
    const h = validarRedaccionForense([{ ubicacion: "hecho 1", texto: "El demandado —sin justificación— incumplió. Se garantiza el éxito.", esHecho: true }]);
    expect(h.map((x) => x.regla)).toEqual(expect.arrayContaining(["RD_04", "RD_09", "RD_06"]));
  });
  it("advierte la calidad de consumidor financiero impertinente", () => {
    const c = cierrePeticion(false, "usuario del servicio de salud");
    expect(c.texto).toContain("usuario del servicio de salud");
    expect(c.texto).not.toContain("{calidad}");
    expect(c.advertencia).not.toBeNull();
    expect(cierrePeticion(true).advertencia).toBeNull();
  });
  it("respeta literalmente el cierre del perfil del despacho", () => {
    const perfil = validarPerfilDespacho({ peticion: { pretensionesApertura: ["Apertura literal."], cierre: "Cierre literal como consumidor financiero." } });
    expect(cierrePeticion(true, "usuario", perfil).texto).toBe("Cierre literal como consumidor financiero.");
    const c = cierrePeticion(false, "usuario del servicio", perfil);
    expect(c.texto).toBe("Cierre literal como usuario del servicio.");
    expect(c.advertencia).toContain("restablecer");
    expect(() => validarPerfilDespacho({ peticion: { pretensionesApertura: [], cierre: "x" } })).toThrow(/pretensionesApertura/);
  });
});

describe("MASC, bloque y nombres de archivo", () => {
  it("un obstáculo registral limita la conveniencia de conciliar", () => {
    const r = evaluarMasc({ area: "CIVIL", asunto: "sucesión", derechosCiertosEIndiscutibles: false, estadoCivil: false, delitoNoQuerellable: false, relacionAPreservar: 1, cuantiaFrenteACosto: 1, debilidadProbatoriaPropia: 1, duracionEstimadaProceso: 1, disposicionManifestada: 1, obligatoriaComoRequisito: "NO", obstaculoNoNegociable: true });
    expect(r.puntaje).toBeLessThanOrEqual(25);
  });
  it("activa el bloque solo con derecho fundamental y protección insuficiente o sujeto especial", () => {
    expect(evaluarBloque({ derechoFundamentalComprometido: false, proteccionInternaInsuficiente: true, sujetos: [], materias: [] }).activado).toBe(false);
    const b = evaluarBloque({ derechoFundamentalComprometido: true, proteccionInternaInsuficiente: false, sujetos: ["NNA"], materias: [] });
    expect(b.activado).toBe(true);
    expect(b.instrumentos.map((i) => i.id)).toContain("cdn");
  });
  it("renombra con el patrón NN_TIPOLOGÍA-Contenido_fecha", () => {
    expect(nombreDocumento(4, "Registro de defunción", "Juan Pérez Gómez", "2020-04-19")).toBe("04_REGISTRO_DE_DEFUNCION-Juan_Perez_Gomez_19-04-2020.pdf");
  });
});
