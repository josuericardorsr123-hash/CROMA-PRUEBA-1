import type { DocumentoInforme, DocumentoPieza, NotaPie, Segmento } from "../src/modelo";

/* Muestras de prueba con DATOS FICTICIOS: ninguna parte, radicado ni hecho
 * corresponde a un caso real. Las normas citadas existen, pero en estas
 * muestras sirven solo para ejercitar la maquetación. */

const LEYENDA = "DEMOSTRACIÓN — datos ficticios, fuentes simuladas";
const CGP: NotaPie = { texto: "Congreso de la República, Ley 1564 de 2012 (Código General del Proceso)", url: "http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012.html", fecha: "2026-09-25" };
const nota = (texto: string, url?: string): NotaPie => ({ texto, url: url ?? null, fecha: "2026-09-25" });
const p = (...segmentos: Array<string | Segmento>) => ({ tipo: "parrafo" as const, segmentos: segmentos.map((s) => (typeof s === "string" ? { texto: s } : s)) });

const relleno = (tema: string, n: number) =>
  Array.from({ length: n }, (_, i) =>
    p(`${tema}: consideración ${i + 1}. El análisis se construye sobre los documentos del expediente ficticio y distingue lo acreditado de lo meramente alegado, de modo que cada conclusión conserva su soporte y su grado de confianza. La redacción evita afirmaciones categóricas sin fuente y declara los vacíos que el ABOGADO (USUARIO) debe resolver antes de actuar.`),
  );

export function informeMuestra(): DocumentoInforme {
  return {
    encabezadoEditorial: "Expediente Maleable · Informe técnico · Derecho procesal civil · 25 de septiembre de 2026",
    titulo: "Informe técnico del expediente EM-DEMO-0001: ejecución de un pagaré de menor cuantía",
    autor: "Josué Ricardo Rojas Silva",
    cargoAutor: "Abogado (usuario) responsable",
    subtitulo: "Diagnóstico procesal, control de términos, estrategia y pieza siguiente",
    leyenda: LEYENDA,
    resumen: "Este informe consolida la lectura íntegra del expediente ficticio EM-DEMO-0001, la calificación de sus hechos, la verificación de las fuentes citadas y la estrategia recomendada. Cada afirmación conserva su trazabilidad hasta el folio y la fuente oficial que la soportan; las que no pudieron verificarse se declaran como tales.",
    palabrasClave: ["proceso ejecutivo", "título valor", "Código General del Proceso", "control de términos", "trazabilidad"],
    introduccion: [
      p("El presente documento se elabora a partir de un expediente de demostración. Su finalidad es ilustrar el recorrido completo del sistema: recepción, lectura, organización, análisis, estrategia y redacción, con la revisión final a cargo del ABOGADO (USUARIO)."),
      p("Las conclusiones se expresan con su etiqueta de confianza y con la referencia exacta a la fuente que las soporta.", { texto: "", nota: nota("Las etiquetas de confianza del sistema son: VERIFICADO, INFERIDO y PENDIENTE; ninguna conclusión PENDIENTE se presenta como cierta") }),
    ],
    secciones: [
      {
        titulo: "Antecedentes y hechos jurídicamente relevantes",
        bloques: [p("La sociedad demandante ficticia afirma ser tenedora legítima de un pagaré suscrito por la parte demandada ficticia, con vencimiento cierto y sin pago posterior.")],
        subsecciones: [
          { titulo: "Cronología verificada", bloques: [p("La cronología se reconstruye exclusivamente con los documentos aportados; los hechos sin soporte documental se clasifican como alegados.", { texto: "", nota: nota("Folios 1 a 4 del expediente ficticio: pagaré, carta de instrucciones y requerimiento de pago") }), ...relleno("Cronología", 3)] },
          { titulo: "Hechos alegados sin soporte", bloques: relleno("Hechos alegados", 2) },
        ],
      },
      {
        titulo: "Marco normativo aplicable",
        bloques: [
          p("El título ejecutivo exige una obligación expresa, clara y exigible que conste en un documento proveniente del deudor.", { texto: "", nota: { ...CGP, texto: `${CGP.texto}, artículo 422` } }),
          {
            tipo: "cita",
            texto: "Pueden demandarse ejecutivamente las obligaciones expresas, claras y exigibles que consten en documentos que provengan del deudor o de su causante, y constituyan plena prueba contra él",
            descripcion: "Título ejecutivo",
            fuente: "Congreso de la República. (2012). Ley 1564 de 2012, artículo 422.",
            url: CGP.url,
          },
          ...relleno("Marco normativo", 2),
        ],
        subsecciones: [
          {
            titulo: "Requisitos del título valor",
            bloques: relleno("Requisitos", 2),
            subsecciones: [
              { titulo: "Requisitos generales", bloques: relleno("Requisitos generales", 2) },
              { titulo: "Requisitos particulares del pagaré", bloques: relleno("Pagaré", 2) },
            ],
          },
          { titulo: "Competencia y cuantía", bloques: [p("La cuantía se determina por el valor de las pretensiones al tiempo de la demanda.", { texto: "", nota: { ...CGP, texto: `${CGP.texto}, artículos 25 y 26` } }), ...relleno("Competencia", 2)] },
        ],
      },
      {
        titulo: "Control de términos",
        bloques: [
          {
            tipo: "tabla",
            titulo: "Términos calculados sobre el expediente ficticio",
            columnas: ["Término", "Inicio", "Vencimiento", "Fundamento", "Estado"],
            filas: [
              ["Prescripción de la acción cambiaria directa", "2024-03-01", "2027-03-01", "Art. 789 C. Co.", "VIGENTE"],
              ["Traslado de la demanda ejecutiva", "Notificación", "10 días hábiles", "Art. 442 CGP", "PENDIENTE"],
              ["Recurso de reposición contra el mandamiento", "Notificación", "3 días hábiles", "Art. 318 CGP", "PENDIENTE"],
            ],
            proporciones: [3, 1.4, 1.6, 1.6, 1.2],
            nota: "Los días hábiles excluyen festivos (Ley 51 de 1983) y la vacancia judicial.",
          },
          ...relleno("Términos", 3),
        ],
        subsecciones: [{ titulo: "Riesgos de caducidad y prescripción", bloques: relleno("Riesgos", 3) }],
      },
      {
        titulo: "Estrategia recomendada",
        bloques: [
          p("La vía principal es la demanda ejecutiva singular; la vía subsidiaria es el proceso declarativo si el título resultare defectuoso."),
          { tipo: "lista", ordenada: true, items: [[{ texto: "Presentar la demanda ejecutiva con solicitud de medidas cautelares." }], [{ texto: "Aportar el original del título en la forma que disponga el despacho." }], [{ texto: "Preparar la réplica frente a las excepciones previsibles." }]] },
          ...relleno("Estrategia", 3),
        ],
        subsecciones: [{ titulo: "Excepciones previsibles de la contraparte", bloques: relleno("Excepciones", 3) }],
      },
    ],
    conclusiones: [
      p("Primera: el título reúne, en principio, los requisitos formales; la verificación del original queda a cargo del ABOGADO (USUARIO)."),
      p("Segunda: no hay término vencido a la fecha de corte; el más próximo se controla en el calendario del expediente."),
    ],
    referencias: [
      "Congreso de la República. (1971). Decreto 410 de 1971, Código de Comercio. http://www.secretariasenado.gov.co/senado/basedoc/codigo_comercio.html",
      "Congreso de la República. (1983). Ley 51 de 1983. http://www.secretariasenado.gov.co/senado/basedoc/ley_0051_1983.html",
      "Congreso de la República. (2012). Ley 1564 de 2012, Código General del Proceso. http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012.html",
      "Congreso de la República. (2022). Ley 2213 de 2022. http://www.secretariasenado.gov.co/senado/basedoc/ley_2213_2022.html",
    ],
    firma: "Josué Ricardo Rojas Silva",
  };
}

export function piezaMuestra(modo: DocumentoPieza["modo"]): DocumentoPieza {
  return {
    titulo: "Demanda ejecutiva singular de menor cuantía (DEMOSTRACIÓN)",
    ciudadFecha: "Bogotá D.C., 25 de septiembre de 2026",
    destinatario: ["Señor(a)", "JUEZ CIVIL MUNICIPAL DE BOGOTÁ (REPARTO)", "E. S. D."],
    referencia: [
      { etiqueta: "Proceso", valor: "Ejecutivo singular de menor cuantía" },
      { etiqueta: "Demandante", valor: "SOCIEDAD FICTICIA UNO S.A.S." },
      { etiqueta: "Demandado", valor: "PERSONA NATURAL FICTICIA" },
    ],
    asunto: "Demanda ejecutiva con solicitud de medidas cautelares",
    apertura: [{ texto: "[NOMBRE], mayor de edad, identificado(a) con cédula de ciudadanía [C.C. No.], abogado(a) en ejercicio con tarjeta profesional [T.P. No.], obrando como apoderado(a) de la parte demandante ficticia, formulo " }, { texto: "DEMANDA EJECUTIVA SINGULAR", negrita: true }, { texto: " con fundamento en los siguientes:", nota: { texto: "Ley 1564 de 2012, artículos 82 y 422", url: "http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012.html" } }],
    cuerpo: [
      { titulo: "Hechos", numerado: "ROMANO", bloques: [{ tipo: "lista", ordenada: true, items: [[{ texto: "La parte demandada ficticia suscribió un pagaré a favor de la demandante ficticia." }], [{ texto: "La obligación venció sin que se registrara pago alguno." }]] }] },
      { titulo: "Pretensiones", numerado: "ROMANO", bloques: [p("Que se libre mandamiento de pago por el capital, los intereses de plazo y los moratorios causados.")] },
      { titulo: "Fundamentos de derecho", numerado: "ROMANO", bloques: [p("Artículos 422, 430 y 431 del Código General del Proceso; artículos 619 y siguientes del Código de Comercio.")] },
    ],
    cierre: "Del señor(a) Juez, respetuosamente,",
    firma: { nombre: "[NOMBRE]", identificacion: "C.C. [C.C. No.]", tarjeta: "T.P. [T.P. No.]", calidad: "Apoderado(a) de la parte demandante", contacto: "[CORREO] · [DIRECCIÓN]" },
    modo,
    advertencia: modo === "BORRADOR" ? "Borrador generado con datos ficticios para revisión del ABOGADO (USUARIO). No se radica sin su aprobación expresa." : null,
  };
}
