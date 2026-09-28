import type { DefinicionGrafo } from "@em/dominio";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { api, cerrarSesion, ErrorApi, type Expediente, type Perfil, type Resumen, sesionActual, type TerminoIndexado, type Usuario } from "./api";

/* Consola del ABOGADO (USUARIO): dirige el pipeline (carga, ejecuta, decide
 * en cada compuerta) y audita cada salida antes de aprobarla. */

type Vista = { tipo: "lista" } | { tipo: "nuevo" } | { tipo: "expediente"; id: string } | { tipo: "terminos" } | { tipo: "perfil" };

const ETIQUETA_ESTADO: Record<string, string> = {
  BORRADOR: "Borrador", EN_PROCESO: "En proceso", REQUIERE_ACCION: "Requiere su acción", EN_REVISION: "En su revisión", APROBADO: "Aprobado",
  REMITIDO: "Dictamen / remisión", ERROR: "Error", ARCHIVADO: "Archivado",
};
const fecha = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleString("es-CO", { dateStyle: "medium", ...(iso.length > 10 ? { timeStyle: "short" } : {}) }) : "—");
const mensaje = (e: unknown) => (e instanceof ErrorApi ? e.message : String((e as Error)?.message ?? e));

function Aviso({ texto, tipo = "error" }: { texto: string | null; tipo?: "error" | "ok" | "info" }) {
  return texto ? <div className={`aviso aviso-${tipo}`} role={tipo === "error" ? "alert" : "status"}>{texto}</div> : null;
}

function Estado({ estado }: { estado: string }) {
  return <span className={`chip chip-${estado.toLowerCase()}`}>{ETIQUETA_ESTADO[estado] ?? estado}</span>;
}

/* ─────────────────────────────── Ingreso ─────────────────────────────── */

function Ingreso({ alIngresar }: { alIngresar: (u: Usuario) => void }) {
  const [tenant, setTenant] = useState("principal");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      alIngresar(await api.ingresar(tenant.trim(), correo.trim(), clave));
    } catch (x) {
      setError(mensaje(x));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <main className="ingreso">
      <form className="tarjeta" onSubmit={enviar}>
        <h1>Expediente Maleable</h1>
        <p className="tenue">Procesamiento de expedientes del ordenamiento jurídico colombiano. El ABOGADO (USUARIO) dirige y audita cada salida.</p>
        <label>Despacho (tenant)<input value={tenant} onChange={(e) => setTenant(e.target.value)} required autoComplete="organization" /></label>
        <label>Correo<input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required autoComplete="username" /></label>
        <label>Clave<input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required autoComplete="current-password" /></label>
        <Aviso texto={error} />
        <button className="primario" disabled={enviando}>{enviando ? "Ingresando…" : "Ingresar"}</button>
      </form>
    </main>
  );
}

/* ─────────────────────────────── Lista ─────────────────────────────── */

function Lista({ abrir, nuevo, puedeCrear }: { abrir: (id: string) => void; nuevo: () => void; puedeCrear: boolean }) {
  const [lista, setLista] = useState<Resumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  useEffect(() => {
    api.expedientes().then(setLista).catch((e) => setError(mensaje(e)));
  }, []);
  const visibles = (lista ?? []).filter((x) => `${x.titulo} ${x.id} ${x.estado}`.toLowerCase().includes(filtro.toLowerCase()));
  return (
    <section>
      <div className="barra">
        <h2>Expedientes</h2>
        <input className="buscar" placeholder="Buscar por título, estado o identificador" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        {puedeCrear && <button className="primario" onClick={nuevo}>Nuevo expediente</button>}
      </div>
      <Aviso texto={error} />
      {lista === null ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? <p className="tenue">No hay expedientes.</p> : (
        <div className="tabla-envoltura">
          <table>
            <thead><tr><th>Título</th><th>Estado</th><th>Actualizado</th><th>Versión</th></tr></thead>
            <tbody>
              {visibles.map((x) => (
                <tr key={x.id} className="clicable" onClick={() => abrir(x.id)}>
                  <td><strong>{x.titulo}</strong><div className="tenue mono">{x.id}</div></td>
                  <td><Estado estado={x.estado} /></td>
                  <td>{fecha(x.actualizado)}</td>
                  <td>{x.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────── Nuevo ─────────────────────────────── */

const ROLES_CLIENTE = ["DEMANDANTE", "DEMANDADO", "EJECUTANTE", "EJECUTADO", "ACCIONANTE", "ACCIONADO", "VICTIMA", "INVESTIGADO", "PETICIONARIO", "TERCERO", "OTRO"];

function Nuevo({ creado }: { creado: (id: string) => void }) {
  const [f, setF] = useState({ titulo: "", cliente: "", idCliente: "", rol: "", contraparte: "", objetivo: "", notas: "", radicados: "" });
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const cambiar = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setEstado("Creando expediente…");
      const r = await api.crear(f.titulo, {
        cliente: f.cliente ? { nombre: f.cliente, identificacion: f.idCliente || null, rol: f.rol || null } : null,
        contraparte: f.contraparte || null, objetivo: f.objetivo || null, notasAbogado: f.notas || null,
        radicados: f.radicados.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean),
      });
      if (archivos.length) {
        setEstado(`Cargando ${archivos.length} archivo(s) cifrados…`);
        await api.cargar(r.id, archivos);
        setEstado("Encolando el procesamiento…");
        await api.ejecutar(r.id);
      }
      creado(r.id);
    } catch (x) {
      setError(mensaje(x));
      setEstado(null);
    }
  };
  return (
    <section className="estrecho">
      <h2>Nuevo expediente</h2>
      <p className="tenue">Cargue el expediente tal como lo recibió: escaneos, fotografías, PDF, Word, correos o comprimidos, sin ordenar ni renombrar. El sistema lee cada página.</p>
      <form className="tarjeta rejilla" onSubmit={enviar}>
        <label className="ancho">Título del asunto<input value={f.titulo} onChange={cambiar("titulo")} required minLength={3} /></label>
        <label>Cliente<input value={f.cliente} onChange={cambiar("cliente")} /></label>
        <label>Identificación del cliente<input value={f.idCliente} onChange={cambiar("idCliente")} placeholder="NIT o C.C." /></label>
        <label>Rol del cliente<select value={f.rol} onChange={cambiar("rol")}><option value="">Sin definir (análisis neutral)</option>{ROLES_CLIENTE.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>Contraparte<input value={f.contraparte} onChange={cambiar("contraparte")} /></label>
        <label className="ancho">Objetivo del cliente<input value={f.objetivo} onChange={cambiar("objetivo")} /></label>
        <label className="ancho">Radicados conocidos (23 dígitos, uno por línea)<textarea rows={2} value={f.radicados} onChange={cambiar("radicados")} /></label>
        <label className="ancho">Notas del ABOGADO (USUARIO)<textarea rows={3} value={f.notas} onChange={cambiar("notas")} /></label>
        <label className="ancho">Archivos del expediente<input type="file" multiple onChange={(e) => setArchivos([...(e.target.files ?? [])])} /></label>
        {archivos.length > 0 && <p className="ancho tenue">{archivos.length} archivo(s), {(archivos.reduce((t, a) => t + a.size, 0) / 1048576).toFixed(1)} MB.</p>}
        <Aviso texto={error} />
        <Aviso texto={estado} tipo="info" />
        <div className="ancho acciones"><button className="primario" disabled={Boolean(estado)}>Crear{archivos.length ? " y procesar" : ""}</button></div>
      </form>
    </section>
  );
}

/* ───────────────────────────── Decisión humana ───────────────────────────── */

const ACCION: Record<string, { etiqueta: string; ayuda: string; clase?: string }> = {
  APROBAR: { etiqueta: "Aprobar y firmar", ayuda: "Genera la pieza radicable con sus datos profesionales y el informe final. Revise antes el informe y el borrador.", clase: "primario" },
  DEVOLVER: { etiqueta: "Devolver con observaciones", ayuda: "Cada observación se clasifica y el expediente se re-elabora completo." },
  ASUMIR_RIESGO: { etiqueta: "Asumir riesgo", ayuda: "Registra que usted asume expresamente un riesgo advertido (queda en la bitácora)." },
  CONTINUAR_CON_VACIOS: { etiqueta: "Continuar con vacíos", ayuda: "Continúa sin los documentos faltantes; los vacíos se declaran en el informe." },
  APORTAR_FUENTE: { etiqueta: "Aportar fuente", ayuda: "Aporte el texto o el enlace oficial de la fuente no verificada; usted responde por ella." },
  RETIRAR_CITA: { etiqueta: "Retirar cita", ayuda: "La cita no verificable se retira del fundamento." },
  DECLARAR_HABILITACION: { etiqueta: "Declarar habilitación", ayuda: "Declare poder, facultades y ausencia de conflictos." },
};

function Decision({ exp, alInstruir }: { exp: Expediente; alInstruir: () => void }) {
  const p = exp.ejecucion.pausa!;
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [identificador, setIdentificador] = useState("");
  const [textoFuente, setTextoFuente] = useState("");
  const [urlFuente, setUrlFuente] = useState("");
  const [subsanables, setSubsanables] = useState(false);
  const [asumir, setAsumir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const bloqueos = ((p.detalle as { bloqueos?: string[] } | undefined)?.bloqueos ?? []);
  const instruir = async (accion: string) => {
    let datos: unknown = {};
    if (accion === "DEVOLVER") {
      const obs = observaciones.split("\n").map((t) => t.trim()).filter(Boolean).map((texto) => ({ texto, seccion: null }));
      if (!obs.length) return setError("Escriba al menos una observación (una por línea).");
      datos = { observaciones: obs };
    }
    if (accion === "APROBAR") datos = { subsanablesAtendidos: subsanables, asumirRiesgos: asumir };
    if (accion === "APORTAR_FUENTE" || accion === "RETIRAR_CITA") datos = { identificador, texto: textoFuente || undefined, url: urlFuente || null };
    if ((accion === "ASUMIR_RIESGO" || accion === "CONTINUAR_CON_VACIOS") && motivo.trim().length < 10) return setError("Explique el motivo (al menos 10 caracteres): queda en la bitácora.");
    setEnviando(true);
    setError(null);
    try {
      await api.instruir(exp.id, accion, motivo, datos);
      alInstruir();
    } catch (x) {
      setError(mensaje(x));
    } finally {
      setEnviando(false);
    }
  };
  const acciones = p.acciones.filter((a) => a !== "CARGAR_DOCUMENTOS" && a !== "CONFIGURAR");
  return (
    <div className="tarjeta decision">
      <h3>Decisión del ABOGADO (USUARIO) · {p.nodo}</h3>
      <p>{p.motivo}</p>
      {bloqueos.length > 0 && <ul className="bloqueos">{bloqueos.map((b) => <li key={b}>{b}</li>)}</ul>}
      {p.acciones.includes("CARGAR_DOCUMENTOS") && <p className="tenue">Puede cargar los documentos faltantes en la pestaña Archivos y volver a ejecutar.</p>}
      {p.acciones.includes("CONFIGURAR") && <p className="tenue">Complete sus datos profesionales en Mi perfil si la aprobación los exige.</p>}
      {(acciones.includes("APORTAR_FUENTE") || acciones.includes("RETIRAR_CITA")) && (
        <div className="rejilla">
          <label>Identificador de la cita<input value={identificador} onChange={(e) => setIdentificador(e.target.value)} placeholder="p. ej. T-406 de 1992" /></label>
          <label>Enlace oficial<input value={urlFuente} onChange={(e) => setUrlFuente(e.target.value)} /></label>
          <label className="ancho">Texto de la fuente (si lo aporta)<textarea rows={3} value={textoFuente} onChange={(e) => setTextoFuente(e.target.value)} /></label>
        </div>
      )}
      {acciones.includes("DEVOLVER") && <label>Observaciones (una por línea)<textarea rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></label>}
      {acciones.includes("APROBAR") && (
        <div className="casillas">
          <label className="casilla"><input type="checkbox" checked={subsanables} onChange={(e) => setSubsanables(e.target.checked)} /> Confirmo que atendí los requisitos subsanables advertidos.</label>
          <label className="casilla"><input type="checkbox" checked={asumir} onChange={(e) => setAsumir(e.target.checked)} /> Asumo los ataques de la contraparte que quedaron sin réplica.</label>
        </div>
      )}
      <label>Motivo o constancia<input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Queda en la bitácora con su usuario" /></label>
      <Aviso texto={error} />
      <div className="acciones">
        {acciones.map((a) => <button key={a} className={ACCION[a]?.clase ?? ""} disabled={enviando} title={ACCION[a]?.ayuda} onClick={() => instruir(a)}>{ACCION[a]?.etiqueta ?? a}</button>)}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Expediente ─────────────────────────────── */

type Pestana = "progreso" | "hechos" | "fuentes" | "terminos" | "riesgos" | "entregables" | "archivos" | "bitacora";
const PESTANAS: Record<Pestana, string> = { progreso: "Progreso", hechos: "Hechos", fuentes: "Fuentes", terminos: "Términos", riesgos: "Riesgos", entregables: "Entregables", archivos: "Archivos", bitacora: "Bitácora" };

function Progreso({ exp, grafo, eventos }: { exp: Expediente; grafo: DefinicionGrafo | null; eventos: string[] }) {
  if (!grafo) return <p className="tenue">Cargando grafo…</p>;
  const estados = exp.ejecucion.estados;
  return (
    <div>
      {grafo.etapas.map((et) => (
        <div key={et.id} className="etapa">
          <h4>{et.numero}. {et.nombre} <span className="tenue">· {et.subtitulo}</span></h4>
          <div className="nodos">
            {grafo.nodos.filter((n) => n.etapa === et.id).map((n) => (
              <span key={n.id} className={`nodo nodo-${(estados[n.id] ?? "PENDIENTE").toLowerCase()}`} title={`${n.hace}\nEstado: ${estados[n.id] ?? "PENDIENTE"}`}>
                <span className="mono">{n.id}</span> {n.nombre}
              </span>
            ))}
          </div>
        </div>
      ))}
      {eventos.length > 0 && <><h4>Actividad en vivo</h4><pre className="registro">{eventos.join("\n")}</pre></>}
      {exp.decisiones.length > 0 && (
        <><h4>Decisiones registradas</h4>
          <ul>{exp.decisiones.map((d, i) => <li key={i}><strong>{d.compuerta}</strong> → {d.decision}{d.anulacionHumana ? " (decisión humana)" : ""} · {d.motivo}</li>)}</ul></>
      )}
    </div>
  );
}

function Tabla({ cabeceras, filas }: { cabeceras: string[]; filas: Array<Array<ReactNode>> }) {
  if (!filas.length) return <p className="tenue">Sin registros.</p>;
  return (
    <div className="tabla-envoltura">
      <table><thead><tr>{cabeceras.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
    </div>
  );
}

function DetalleExpediente({ id, usuario }: { id: string; usuario: Usuario }) {
  const [exp, setExp] = useState<Expediente | null>(null);
  const [grafo, setGrafo] = useState<DefinicionGrafo | null>(null);
  const [pestana, setPestana] = useState<Pestana>("progreso");
  const [eventos, setEventos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [bitacora, setBitacora] = useState<Array<{ seq: number; instante: string; actor: string; accion: string }>>([]);
  const [enCola, setEnCola] = useState(false);
  const puedeEscribir = usuario.rol !== "AUDITOR";

  const recargar = useCallback(async () => {
    try {
      const [e, t] = await Promise.all([api.expediente(id), api.trabajos(id)]);
      setExp(e);
      setEnCola(t.some((x) => x.estado === "PENDIENTE" || x.estado === "EN_CURSO"));
    } catch (x) {
      setError(mensaje(x));
    }
  }, [id]);

  useEffect(() => {
    void recargar();
    fetch("/api/v1/grafo", { headers: { authorization: `Bearer ${sesionActual()?.token}` } }).then((r) => r.json()).then(setGrafo).catch(() => undefined);
    let pendiente: ReturnType<typeof setTimeout> | null = null;
    const cerrar = api.eventos(id, (tipo, d) => {
      if (tipo !== "pipeline") return;
      const e = d as { tipo: string; nodo?: string | null; detalle?: string; resultado?: string; instante: string };
      setEventos((xs) => [...xs.slice(-199), `${new Date(e.instante).toLocaleTimeString("es-CO")}  ${e.tipo.padEnd(15)} ${e.nodo ?? ""} ${e.resultado ?? ""} ${e.detalle ?? ""}`.slice(0, 220)]);
      if (["NODO_TERMINADO", "PAUSA", "TERMINADO", "FALLIDO", "ENCOLADO", "INICIADO"].includes(e.tipo)) {
        if (pendiente) clearTimeout(pendiente);
        pendiente = setTimeout(() => void recargar(), e.tipo === "NODO_TERMINADO" ? 800 : 50);
      }
    });
    return () => {
      cerrar();
      if (pendiente) clearTimeout(pendiente);
    };
  }, [id, recargar]);

  useEffect(() => {
    if (pestana === "bitacora") api.bitacora(id).then(setBitacora).catch((e) => setError(mensaje(e)));
  }, [pestana, id, exp?.version]);

  const vigentes = useMemo(() => {
    const m = new Map<string, Expediente["entregables"][number]>();
    for (const e of exp?.entregables ?? []) if ((m.get(`${e.tipo}:${e.modo}`)?.version ?? 0) <= e.version) m.set(`${e.tipo}:${e.modo}`, e);
    return [...m.values()];
  }, [exp]);

  if (!exp) return <><Aviso texto={error} /><p className="tenue">Cargando expediente…</p></>;

  const accion = async (fn: () => Promise<unknown>, texto: string) => {
    setError(null);
    setOk(null);
    try {
      await fn();
      setOk(texto);
      await recargar();
    } catch (x) {
      setError(mensaje(x));
    }
  };
  const pendientes = exp.entrantes.filter((x) => !x.procesado).length;
  const riesgos = [...exp.analisis.omisiones, ...exp.analisis.nulidades.hallazgos, ...exp.analisis.trampas, ...exp.analisis.avisos.map((a, i) => ({ id: `av${i}`, modulo: a.modulo, titulo: a.texto, detalle: "", gravedad: a.gravedad }))];

  return (
    <section>
      <div className="barra">
        <div>
          <h2>{exp.titulo}</h2>
          <div className="tenue mono">{exp.id} · versión {exp.version} · actualizado {fecha(exp.actualizadoEn)}</div>
        </div>
        <Estado estado={exp.estado} />
        {puedeEscribir && (
          <div className="acciones">
            {enCola ? <button onClick={() => accion(() => api.cancelar(id), "Cancelación solicitada.")}>Cancelar ejecución</button>
              : exp.estado !== "APROBADO" && <button className="primario" onClick={() => accion(() => api.ejecutar(id), "Procesamiento encolado.")}>{exp.ejecucion.iniciadaEn ? "Reanudar" : "Procesar"}</button>}
          </div>
        )}
      </div>
      {exp.contexto && usuario.rol === "ABOGADO" && exp.estado === "REMITIDO" && <Aviso tipo="info" texto="El expediente terminó en dictamen de no radicación o remisión: el trabajo hecho queda en el informe." />}
      {enCola && <Aviso tipo="info" texto="El pipeline está en ejecución; la vista se actualiza en vivo." />}
      {exp.ejecucion.error && <Aviso texto={`Error del pipeline: ${exp.ejecucion.error}`} />}
      <Aviso texto={error} />
      <Aviso texto={ok} tipo="ok" />
      {exp.ejecucion.pausa && !enCola && puedeEscribir && <Decision exp={exp} alInstruir={() => { setOk("Instrucción registrada; el pipeline se reanuda."); void recargar(); }} />}

      <nav className="pestanas" role="tablist">
        {(Object.keys(PESTANAS) as Pestana[]).map((p) => (
          <button key={p} role="tab" aria-selected={pestana === p} className={pestana === p ? "activa" : ""} onClick={() => setPestana(p)}>{PESTANAS[p]}</button>
        ))}
      </nav>

      {pestana === "progreso" && <Progreso exp={exp} grafo={grafo} eventos={eventos} />}
      {pestana === "hechos" && <Tabla cabeceras={["N.º", "Hecho", "Fecha", "Estado", "Soporte"]} filas={exp.hechos.map((h) => [h.numero, h.descripcion, h.fecha ?? h.fechaTexto ?? "—", <span className={`chip chip-${h.estado.toLowerCase()}`}>{h.estado.replace(/_/g, " ")}</span>, h.soportes.map((s) => `${s.archivoId}${s.pagina ? ` p. ${s.pagina}` : ""}`).join("; ") || "—"])} />}
      {pestana === "fuentes" && <Tabla cabeceras={["Fuente", "Autoridad", "Resolución", "Vigencia", "Vinculancia"]} filas={exp.fuentes.map((f) => [f.url ? <a href={f.url} target="_blank" rel="noreferrer noopener">{f.identificador}</a> : f.identificador, f.autoridad, f.resolucion.replace(/_/g, " "), f.vigencia.replace(/_/g, " "), f.fuerzaVinculante?.replace(/_/g, " ") ?? "—"])} />}
      {pestana === "terminos" && <Tabla cabeceras={["Término", "Norma", "Inicio", "Vence", "Días hábiles", "Estado"]} filas={exp.terminos.map((t) => [t.descripcion, t.norma, t.fechaInicio, t.vencimientoMasTemprano ?? t.vencimiento, t.diasHabilesRestantes, <span className={`chip chip-${t.estado.toLowerCase()}`}>{t.estado.replace(/_/g, " ")}{t.esEstimacion ? " (estimado)" : ""}</span>])} />}
      {pestana === "riesgos" && <Tabla cabeceras={["Gravedad", "Módulo", "Hallazgo", "Detalle"]} filas={riesgos.map((r) => [<span className={`chip chip-${r.gravedad.toLowerCase()}`}>{r.gravedad}</span>, r.modulo, r.titulo, r.detalle])} />}
      {pestana === "entregables" && (
        <Tabla cabeceras={["Entregable", "Modo", "Versión", "Generado", ""]} filas={vigentes.map((e) => [e.nombreArchivo, e.modo === "RADICABLE" ? <strong>RADICABLE</strong> : "Borrador", e.version, fecha(e.generadoEn),
          <button onClick={() => accion(() => api.descargar(id, e.id, e.nombreArchivo), `Descargado ${e.nombreArchivo}.`)} disabled={usuario.rol === "AUDITOR" && e.modo === "RADICABLE"}>Descargar</button>])} />
      )}
      {pestana === "archivos" && (
        <div>
          {puedeEscribir && !enCola && (
            <label className="tarjeta carga">Cargar más archivos (se cifran al recibirse)
              <input type="file" multiple onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void accion(() => api.cargar(id, fs), `${fs.length} archivo(s) cargados; procese para incorporarlos.`); }} />
            </label>
          )}
          {pendientes > 0 && <Aviso tipo="info" texto={`${pendientes} archivo(s) pendientes de procesar.`} />}
          <Tabla cabeceras={["Archivo", "Tipo", "Páginas", "Estado"]} filas={exp.archivos.map((a) => [a.nombreOriginal, a.mime, a.paginas ?? "—", a.estado])} />
          <h4>Piezas organizadas</h4>
          <Tabla cabeceras={["Anexo", "Nombre", "Tipología", "Páginas"]} filas={exp.piezas.filter((p) => p.estado === "ORGANIZADO").map((p) => [p.anexo, p.nombreArchivo, p.tipologia, p.paginas])} />
        </div>
      )}
      {pestana === "bitacora" && <Tabla cabeceras={["#", "Instante", "Actor", "Acción"]} filas={bitacora.map((b) => [b.seq, fecha(b.instante), <span className="mono">{b.actor}</span>, b.accion])} />}
    </section>
  );
}

/* ─────────────────────────────── Términos y perfil ─────────────────────────────── */

function Terminos({ abrir }: { abrir: (id: string) => void }) {
  const [dias, setDias] = useState(30);
  const [lista, setLista] = useState<TerminoIndexado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLista(null);
    api.terminos(dias).then(setLista).catch((e) => setError(mensaje(e)));
  }, [dias]);
  return (
    <section>
      <div className="barra"><h2>Vencimientos</h2>
        <label className="en-linea">Próximos <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>{[7, 15, 30, 60, 90, 365].map((d) => <option key={d} value={d}>{d} días</option>)}</select></label>
      </div>
      <Aviso texto={error} />
      {lista === null ? <p className="tenue">Cargando…</p> : (
        <Tabla cabeceras={["Vence", "Días hábiles", "Término", "Expediente"]} filas={lista.map((t) => [t.vencimientoMasTemprano ?? "—", t.diasHabilesRestantes ?? "—", `${t.descripcion}${t.esEstimacion ? " (estimado)" : ""}`, <button className="enlace" onClick={() => abrir(t.expedienteId)}>{t.expedienteId}</button>])} />
      )}
    </section>
  );
}

function MiPerfil() {
  const [p, setP] = useState<Perfil>({ identificacion: null, tarjetaProfesional: null, correoRegistroNacional: null, telefono: null, direccion: null, ciudad: null });
  const [u, setU] = useState<Usuario | null>(null);
  const [aviso, setAviso] = useState<{ t: string; tipo: "ok" | "error" } | null>(null);
  useEffect(() => {
    api.yo().then((r) => { setU(r.usuario); if (r.perfil) setP(r.perfil); }).catch((e) => setAviso({ t: mensaje(e), tipo: "error" }));
  }, []);
  const campo = (k: keyof Perfil, etiqueta: string, tipo = "text") => (
    <label>{etiqueta}<input type={tipo} value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value || null })} /></label>
  );
  return (
    <section className="estrecho">
      <h2>Mi perfil profesional</h2>
      <p className="tenue">Estos datos firman las piezas radicables. Se guardan cifrados y solo se usan cuando usted aprueba.</p>
      <form className="tarjeta rejilla" onSubmit={async (e) => { e.preventDefault(); try { await api.guardarPerfil(p); setAviso({ t: "Perfil guardado.", tipo: "ok" }); } catch (x) { setAviso({ t: mensaje(x), tipo: "error" }); } }}>
        <p className="ancho"><strong>{u?.nombre}</strong> · {u?.correo} · {u?.rol}</p>
        {campo("identificacion", "Cédula de ciudadanía")}
        {campo("tarjetaProfesional", "Tarjeta profesional")}
        {campo("correoRegistroNacional", "Correo inscrito en el Registro Nacional de Abogados", "email")}
        {campo("telefono", "Teléfono")}
        {campo("direccion", "Dirección para notificaciones")}
        {campo("ciudad", "Ciudad")}
        <Aviso texto={aviso?.t ?? null} tipo={aviso?.tipo} />
        <div className="ancho acciones"><button className="primario">Guardar</button></div>
      </form>
    </section>
  );
}

/* ─────────────────────────────── Aplicación ─────────────────────────────── */

export function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(sesionActual()?.usuario ?? null);
  const [vista, setVista] = useState<Vista>({ tipo: "lista" });
  const [salud, setSalud] = useState<{ ia: boolean; croma: { configurado: boolean }; advertencias: string[] } | null>(null);
  useEffect(() => {
    if (usuario) api.salud().then(setSalud).catch(() => undefined);
  }, [usuario]);
  if (!usuario) return <Ingreso alIngresar={setUsuario} />;
  const ir = (v: Vista) => () => setVista(v);
  return (
    <div className="marco">
      <header className="cabecera">
        <strong className="marca" onClick={ir({ tipo: "lista" })}>Expediente Maleable</strong>
        <nav>
          <button className={vista.tipo === "lista" ? "activa" : ""} onClick={ir({ tipo: "lista" })}>Expedientes</button>
          <button className={vista.tipo === "terminos" ? "activa" : ""} onClick={ir({ tipo: "terminos" })}>Vencimientos</button>
          {usuario.rol !== "AUDITOR" && <button className={vista.tipo === "perfil" ? "activa" : ""} onClick={ir({ tipo: "perfil" })}>Mi perfil</button>}
        </nav>
        <span className="tenue">{usuario.nombre} · {usuario.rol === "ABOGADO" ? "ABOGADO (USUARIO)" : usuario.rol}</span>
        <button onClick={() => { cerrarSesion(); setUsuario(null); }}>Salir</button>
      </header>
      {salud && (!salud.ia || !salud.croma.configurado) && <Aviso tipo="info" texto={salud.advertencias.join(" ")} />}
      <main className="contenido">
        {vista.tipo === "lista" && <Lista abrir={(id) => setVista({ tipo: "expediente", id })} nuevo={ir({ tipo: "nuevo" })} puedeCrear={usuario.rol === "ABOGADO"} />}
        {vista.tipo === "nuevo" && <Nuevo creado={(id) => setVista({ tipo: "expediente", id })} />}
        {vista.tipo === "expediente" && <DetalleExpediente key={vista.id} id={vista.id} usuario={usuario} />}
        {vista.tipo === "terminos" && <Terminos abrir={(id) => setVista({ tipo: "expediente", id })} />}
        {vista.tipo === "perfil" && <MiPerfil />}
      </main>
      <footer className="pie tenue">Sistema de apoyo: las salidas son borradores hasta la aprobación y firma del ABOGADO (USUARIO), quien responde por ellas.</footer>
    </div>
  );
}
