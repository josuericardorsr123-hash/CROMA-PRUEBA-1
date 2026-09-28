/* Módulo 24 · control del ejercicio profesional. Sustituye el control de
 * competencia del estudiante: aquí se verifica que la actuación que firmará el
 * ABOGADO (USUARIO) sea habilitada (postulación, poder, facultades, correo del
 * Registro Nacional de Abogados), leal (sin conflicto de intereses) y viable. */

const SIN_POSTULACION = new Set([
  "ACCION_TUTELA", "IMPUGNACION_TUTELA", "INCIDENTE_DESACATO", "DERECHO_PETICION", "ACCION_POPULAR", "ACCION_CUMPLIMIENTO",
  "RECLAMACION_SERVICIOS_PUBLICOS", "QUERELLA_POLICIVA", "DENUNCIA_PENAL", "RECURSO_ADMINISTRATIVO",
]);

export interface EntradaHabilitacion {
  tipoPieza: string;
  representaATercero: boolean;
  abogado: { nombre: string | null; tarjetaProfesional: string | null; correoRegistroNacional: string | null };
  poder: { existe: boolean; facultadesExpresas: string[]; correoApoderado: string | null; porMensajeDeDatos: boolean | null } | null;
  facultadesRequeridas: string[];
  conflictos: Array<{ expedienteId: string; detalle: string }>;
  terminoVencidoAparente: boolean;
  tutelaPreviaMismosHechos: boolean;
  cuantiaCategoria: string | null;
}

export interface Hallazgo24 {
  codigo: string;
  tipo: "IMPEDIMENTO" | "SUBSANABLE" | "ADVERTENCIA";
  descripcion: string;
  fundamento: string;
  accion: string;
}

export interface ResultadoHabilitacion {
  requierePostulacion: boolean;
  habilitada: boolean;
  requiereAccionDelAbogado: boolean;
  hallazgos: Hallazgo24[];
}

export function evaluarHabilitacion(e: EntradaHabilitacion): ResultadoHabilitacion {
  const h: Hallazgo24[] = [];
  const requierePostulacion = !SIN_POSTULACION.has(e.tipoPieza) && !(e.tipoPieza === "DEMANDA_VERBAL_SUMARIA" && e.cuantiaCategoria === "MINIMA" && !e.representaATercero);

  if (requierePostulacion && !e.abogado.tarjetaProfesional) h.push({
    codigo: "TP_NO_REGISTRADA", tipo: "SUBSANABLE", descripcion: "El perfil del ABOGADO (USUARIO) no registra tarjeta profesional.",
    fundamento: "Derecho de postulación: se requiere abogado inscrito (Decreto 196 de 1971, art. 25; CGP art. 73).", accion: "Registrar la tarjeta profesional en el perfil antes de generar la versión radicable.",
  });
  if (e.representaATercero && requierePostulacion) {
    if (!e.poder?.existe) h.push({
      codigo: "SIN_PODER", tipo: "SUBSANABLE", descripcion: "No se encontró poder conferido al ABOGADO (USUARIO) en el expediente.",
      fundamento: "CGP arts. 74 a 77; Ley 2213 de 2022, art. 5 (poder por mensaje de datos sin presentación personal).", accion: "Aportar el poder especial o registrar que se otorgará con la radicación.",
    });
    else {
      const faltan = e.facultadesRequeridas.filter((f) => !e.poder!.facultadesExpresas.map((x) => x.toLowerCase()).includes(f.toLowerCase()));
      if (faltan.length) h.push({
        codigo: "FACULTADES_INSUFICIENTES", tipo: "SUBSANABLE", descripcion: `El poder no confiere expresamente: ${faltan.join(", ")}.`,
        fundamento: "CGP art. 77 (actos que requieren facultad expresa).", accion: "Ampliar el poder o abstenerse de esos actos.",
      });
      if (e.poder.porMensajeDeDatos && e.abogado.correoRegistroNacional && e.poder.correoApoderado && e.poder.correoApoderado.toLowerCase() !== e.abogado.correoRegistroNacional.toLowerCase()) h.push({
        codigo: "CORREO_NO_COINCIDE", tipo: "SUBSANABLE", descripcion: "El correo del apoderado indicado en el poder no coincide con el inscrito en el Registro Nacional de Abogados.",
        fundamento: "Ley 2213 de 2022, art. 5, inc. 2.", accion: "Corregir el poder con el correo inscrito.",
      });
      if (e.poder.porMensajeDeDatos && !e.abogado.correoRegistroNacional) h.push({
        codigo: "CORREO_SIRNA_NO_REGISTRADO", tipo: "ADVERTENCIA", descripcion: "El perfil no registra el correo inscrito en el Registro Nacional de Abogados.",
        fundamento: "Ley 2213 de 2022, art. 5, inc. 2.", accion: "Registrar el correo en el perfil para validar poderes por mensaje de datos.",
      });
    }
  }
  for (const c of e.conflictos) h.push({
    codigo: "CONFLICTO_INTERESES", tipo: "IMPEDIMENTO", descripcion: `Posible conflicto de intereses con el expediente ${c.expedienteId}: ${c.detalle}`,
    fundamento: "Ley 1123 de 2007 (Código Disciplinario del Abogado): deber de lealtad; prohibido representar intereses contrapuestos (verificar literal aplicable).", accion: "Verificar el conflicto; si existe, abstenerse y remitir.",
  });
  if (e.tutelaPreviaMismosHechos && e.tipoPieza === "ACCION_TUTELA") h.push({
    codigo: "TEMERIDAD", tipo: "IMPEDIMENTO", descripcion: "Existe una tutela previa por los mismos hechos y derechos.",
    fundamento: "Decreto 2591 de 1991, art. 38.", accion: "No radicar sin hechos nuevos; evaluar otra vía.",
  });
  if (e.terminoVencidoAparente) h.push({
    codigo: "TERMINO_VENCIDO_APARENTE", tipo: "SUBSANABLE", descripcion: "Un término determinante aparece vencido: la actuación podría ser inviable.",
    fundamento: "Módulo 8 (prescripción y caducidad).", accion: "Confirmar interrupciones, suspensiones o reglas de modulación; decidir si se radica o se emite dictamen.",
  });
  const impedimentos = h.filter((x) => x.tipo === "IMPEDIMENTO");
  const subsanables = h.filter((x) => x.tipo === "SUBSANABLE");
  return { requierePostulacion, habilitada: impedimentos.length === 0, requiereAccionDelAbogado: subsanables.length > 0, hallazgos: h };
}
