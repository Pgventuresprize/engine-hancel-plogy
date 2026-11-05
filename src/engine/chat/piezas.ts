import { tituloProvisional } from "@/lib/chat-titulo"
import { nombreDe } from "@/lib/chat-nombre"

import { guardarVersion, versionDe, versionesDe } from "../content/versiones"
import { kitActivo } from "../marca/kit"
import { parseInstagramResponse } from "../render/carousel"
import { paginasDeMaqueta, type MaquetaGuardada } from "../render/kit-carrusel"
import { claveKit } from "../render/kit-libre-pasos"
import { dibujarDesdeFuente } from "../render/redibujar"
import { supabaseAdmin } from "../supabase-admin"
import { editableDe, modoDeEdicion, rehacerDesdeGuion, type Editable } from "./editar"
import { escribirMensaje } from "./mensajes"
import { anuncioDePieza } from "./trabajos"

/**
 * Las piezas en el panel de la derecha del chat (MARCAS.md, "La pieza al lado
 * del chat"): lo que se ve de cada una, sus versiones y restaurar una vieja.
 *
 * El panel enseña las laminas ya dibujadas, las mismas que se publican. Las
 * imagenes de una version vieja no se guardan (cada redibujo pisa el mismo
 * archivo), asi que de una version vieja se enseña su texto; al restaurarla se
 * vuelve a dibujar desde su maqueta, igual que entonces.
 */

export type RedPanel = "instagram" | "linkedin"

/** Una parte de una lamina que se marca sola: su texto, un punto de la lista, la figura. */
export type ParteLamina = { campo: string; item?: number; etiqueta: string; texto: string }

export type VersionResumen = { n: number; motivo: string | null; autor: string; creada: string }

export type PiezaVista = {
  id: string
  red: RedPanel
  /** El titular de la noticia de la que salio. */
  titulo: string
  estado: "generated" | "approved" | "published" | "rejected"
  imagenes: string[]
  caption: string
  hashtags: string[]
  post: { hook: string | null; body: string; hashtags: string[] } | null
  /** La version que tiene ahora; null si es de antes de las versiones. */
  version: number | null
  versiones: VersionResumen[]
  /** Si se puede restaurar una version: no si ya salio publicada. */
  restaurable: boolean
  /**
   * Que se marca en el panel: cada hueco de la lamina (con maqueta), la lamina
   * entera (un carrusel de antes, de diseño libre o de otro kit) o el parrafo.
   */
  marcar: "hueco" | "lamina" | "parrafo"
  /**
   * Las partes de cada lamina de un carrusel sin maqueta, para marcarlas una a
   * una: la imagen no dice donde esta cada texto, asi que van en una lista.
   */
  partes: ParteLamina[][] | null
}

/** El contenido de una version vieja: el texto de cada lamina o el post. */
export type VersionVista = {
  n: number
  motivo: string | null
  creada: string
  laminas: string[] | null
  caption: string | null
  post: { hook: string | null; body: string; hashtags: string[] } | null
}

const AGENTE: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  revisor: "Revisor",
  coordinador: "Coordinador",
}

type Fila = {
  id: string
  network: string
  status: PiezaVista["estado"]
  payload: Record<string, unknown>
  published_at: string | null
  content_angle_id: string
  conversacion_id: string | null
  job_instagram_id: string | null
  job_linkedin_id: string | null
}

const CAMPOS = "id, network, status, payload, published_at, content_angle_id, conversacion_id, job_instagram_id, job_linkedin_id"

async function filaDe(accountId: string, pieceId: string): Promise<Fila> {
  const { data } = await supabaseAdmin().from("content_pieces").select(CAMPOS).eq("id", pieceId).eq("account_id", accountId).maybeSingle()
  if (!data) throw new Error("No se encontró la pieza.")
  const f = data as Fila
  if (f.network !== "instagram" && f.network !== "linkedin") throw new Error("En el chat se abren los carruseles de Instagram y los posts de LinkedIn.")
  return f
}

async function tituloDeNoticia(angleId: string): Promise<string> {
  const { data } = await supabaseAdmin().from("content_angles").select("raw_news (title)").eq("id", angleId).maybeSingle()
  return (data as unknown as { raw_news: { title: string | null } | null } | null)?.raw_news?.title ?? "Pieza sin noticia"
}

const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])

function postDe(payload: Record<string, unknown>): PiezaVista["post"] {
  return {
    hook: typeof payload.hook === "string" ? payload.hook : null,
    body: typeof payload.body === "string" ? payload.body : "",
    hashtags: textos(payload.hashtags),
  }
}

/** Quien hizo cada version, como se lee en el menu. */
async function autores(filas: { autor_agente: string | null; autor_usuario: string | null }[]): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  const ids = [...new Set(filas.map((f) => f.autor_usuario).filter((x): x is string => Boolean(x)))]
  await Promise.all(
    ids.map(async (id) => {
      const { data } = await supabaseAdmin().auth.admin.getUserById(id)
      if (data.user) nombres.set(id, nombreDe(data.user))
    })
  )
  return nombres
}

/** Las partes de cada lamina, sacadas del guion (la ultima es el cierre). */
function partesDeGuion(e: Extract<Editable, { modo: "guion" }>): ParteLamina[][] {
  const t = (v: string | null | undefined) => (v ?? "").trim()
  const partes = e.laminas.map((l): ParteLamina[] => {
    if (l.portada) return t(l.hook) ? [{ campo: "hook", etiqueta: "Gancho", texto: t(l.hook) }] : []
    return [
      ...(t(l.lead) ? [{ campo: "lead", etiqueta: "Antetítulo", texto: t(l.lead) }] : []),
      ...(t(l.title) ? [{ campo: "title", etiqueta: "Titular", texto: t(l.title) }] : []),
      ...(t(l.body) ? [{ campo: "body", etiqueta: "Cuerpo", texto: t(l.body) }] : []),
      ...(l.items ?? []).map((x, i) => ({ campo: "items", item: i + 1, etiqueta: `Punto ${i + 1}`, texto: t(x) })),
      ...(l.figura
        ? [{ campo: "figura", etiqueta: "Figura", texto: [l.figura.titulo, ...l.figura.items.map((x) => [x.texto, x.cifra].filter(Boolean).join(" "))].filter(Boolean).join(" · ") }]
        : []),
    ]
  })
  if (e.cierre) {
    partes.push([
      ...(t(e.cierre.title) ? [{ campo: "cierre.title", etiqueta: "Titular del cierre", texto: t(e.cierre.title) }] : []),
      ...(t(e.cierre.body) ? [{ campo: "cierre.body", etiqueta: "Texto del cierre", texto: t(e.cierre.body) }] : []),
    ])
  }
  return partes
}

export async function vistaDePieza(accountId: string, pieceId: string): Promise<PiezaVista> {
  const f = await filaDe(accountId, pieceId)
  const [titulo, versiones, modo] = await Promise.all([
    tituloDeNoticia(f.content_angle_id),
    versionesDe(accountId, pieceId),
    modoDeEdicion(accountId, pieceId),
  ])
  const [nombres, editable] = await Promise.all([
    autores(versiones),
    modo === "guion" ? editableDe(accountId, pieceId).catch(() => null) : null,
  ])
  const red = f.network as RedPanel
  // Solo si cada lamina dibujada tiene su parte en el guion: si no, se marcaria otra.
  const partes = editable?.modo === "guion" ? partesDeGuion(editable) : null
  return {
    id: f.id,
    red,
    titulo,
    estado: f.published_at ? "published" : f.status,
    imagenes: red === "instagram" ? textos(f.payload.images) : [],
    caption: typeof f.payload.caption === "string" ? f.payload.caption : "",
    hashtags: textos(f.payload.hashtags),
    post: red === "linkedin" ? postDe(f.payload) : null,
    version: versiones[0]?.n ?? null,
    versiones: versiones.map((v) => ({
      n: v.n,
      motivo: v.motivo,
      autor: v.autor_usuario ? (nombres.get(v.autor_usuario) ?? "Alguien del equipo") : AGENTE[v.autor_agente ?? ""] ?? "Plogy Studio",
      creada: v.created_at,
    })),
    restaurable: !f.published_at,
    marcar: modo === "post" ? "parrafo" : modo === "huecos" ? "hueco" : "lamina",
    partes: partes && partes.length === textos(f.payload.images).length ? partes : null,
  }
}

/**
 * Lo que va dentro de la lamina en el panel para marcar: resalta el hueco bajo
 * el raton (o el elemento de una lista) y avisa al chat del clic. Vive en un
 * iframe sin acceso a la pagina: solo habla por postMessage.
 */
function scriptDeMarcar(n: number, listas: string[]): string {
  const config = JSON.stringify({ n, listas })
  return `<style>
[data-hueco]{cursor:pointer}
.hx-hov{outline:5px dashed #6d4aff!important;outline-offset:8px}
.hx-sel{outline:5px solid #6d4aff!important;outline-offset:8px}
html.hx-hov-todo body{box-shadow:inset 0 0 0 10px #6d4aff80}
html.hx-sel-todo body{box-shadow:inset 0 0 0 10px #6d4aff}
.hx-tag,.hx-num{position:absolute;z-index:2147483647;pointer-events:none;font:600 26px/1.2 system-ui,sans-serif;color:#fff;background:#6d4aff;white-space:nowrap}
.hx-tag{padding:4px 12px;border-radius:8px;transform:translateY(calc(-100% - 12px))}
.hx-num{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;box-shadow:0 0 0 4px #fff;transform:translate(-50%,-50%)}
</style><script>(() => {
const C = ${config};
let marcas = [], hov = null, tag = null;
const nombre = (c, i) => { const t = c.replace(/[_-]+/g, " "); return (t.charAt(0).toUpperCase() + t.slice(1)) + (i ? " " + i : ""); };
function blanco(t) {
  const h = t && t.closest ? t.closest("[data-hueco]") : null;
  if (!h) return { el: null, campo: null, item: null };
  const campo = h.getAttribute("data-hueco");
  if (C.listas.includes(campo) && h.children.length > 1) {
    let c = t; while (c && c.parentElement !== h) c = c.parentElement;
    if (c) return { el: c, campo, item: Array.prototype.indexOf.call(h.children, c) + 1 };
  }
  return { el: h, campo, item: null };
}
const igual = (a, b) => a.campo === b.campo && (a.item || null) === (b.item || null);
function quitarHov() { if (hov) hov.classList.remove("hx-hov"); document.documentElement.classList.remove("hx-hov-todo"); if (tag) tag.remove(); hov = tag = null; }
function poner(cls, el, texto) {
  const d = document.createElement("div"); d.className = cls; d.textContent = texto;
  const r = el ? el.getBoundingClientRect() : { left: 40, top: 40 };
  d.style.left = (r.left + scrollX) + "px"; d.style.top = (r.top + scrollY) + "px";
  document.body.appendChild(d); return d;
}
function elDe(m) {
  if (!m.campo) return null;
  const h = document.querySelector('[data-hueco="' + CSS.escape(m.campo) + '"]');
  return h && m.item ? h.children[m.item - 1] || h : h;
}
function pintar() {
  document.querySelectorAll(".hx-sel").forEach((e) => e.classList.remove("hx-sel"));
  document.querySelectorAll(".hx-num").forEach((e) => e.remove());
  document.documentElement.classList.toggle("hx-sel-todo", marcas.some((m) => !m.campo));
  for (const m of marcas) {
    const el = elDe(m);
    if (el) el.classList.add("hx-sel");
    if (m.campo && !el) continue;
    const d = poner("hx-num", el, String(m.numero));
    if (!el) { d.style.left = "56px"; d.style.top = "56px"; }
  }
}
document.addEventListener("mousemove", (e) => {
  const b = blanco(e.target);
  if (b.el === hov && (b.el || document.documentElement.classList.contains("hx-hov-todo"))) return;
  quitarHov();
  const marcada = marcas.some((m) => igual(m, b));
  if (b.el) { hov = b.el; hov.classList.add("hx-hov"); }
  else document.documentElement.classList.add("hx-hov-todo");
  tag = poner("hx-tag", b.el, (marcada ? "Quitar · " : "") + (b.campo ? nombre(b.campo, b.item) : "Lámina entera"));
  if (!b.el) { tag.style.left = "40px"; tag.style.top = "110px"; }
});
document.addEventListener("mouseleave", quitarHov);
document.addEventListener("click", (e) => {
  e.preventDefault();
  const b = blanco(e.target);
  const html = b.el ? b.el.outerHTML.replace(/data:[^"')\\s]+/g, "…").slice(0, 800) : "";
  const texto = (b.el ? b.el.innerText : "").trim().slice(0, 400);
  quitarHov();
  parent.postMessage({ hancel: "marca", lamina: C.n, campo: b.campo, item: b.item, html, texto, etiqueta: "L" + C.n + " · " + (b.campo ? nombre(b.campo, b.item) : "Lámina entera") }, "*");
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key === "m" || e.key === "M" || e.key === "ArrowLeft" || e.key === "ArrowRight") parent.postMessage({ hancel: "tecla", key: e.key }, "*"); });
addEventListener("message", (e) => { if (e.source === parent && e.data && e.data.hancel === "marcas") { marcas = e.data.marcas || []; pintar(); } });
parent.postMessage({ hancel: "lista", lamina: C.n }, "*");
})();</script>`
}

/** La lamina `n` (1 es la portada) armada como se dibuja, lista para marcar en el panel. */
export async function laminaParaMarcar(accountId: string, pieceId: string, n: number): Promise<string> {
  const f = await filaDe(accountId, pieceId)
  const maqueta = f.payload.maqueta as MaquetaGuardada | undefined
  const kc = await kitActivo(accountId)
  if (!maqueta || !kc || maqueta.kit !== claveKit(kc) || f.payload.modoDiseno === "inteligencia")
    throw new Error("Esta pieza no se puede marcar por partes: se marca la lámina entera.")
  const l = maqueta.laminas[n - 1]
  if (!l) throw new Error(`El carrusel no tiene lámina ${n}.`)
  const { htmls } = await paginasDeMaqueta(accountId, kc, maqueta, { solo: n })
  const plantilla = kc.plantillas.find((p) => p.id === l.plantilla)
  const listas = (plantilla?.huecos ?? []).filter((h) => h.tipo === "lista").map((h) => h.nombre)
  return htmls[0].replace("</body>", `${scriptDeMarcar(n, listas)}</body>`)
}

export async function vistaDeVersion(accountId: string, pieceId: string, n: number): Promise<VersionVista> {
  const f = await filaDe(accountId, pieceId)
  const v = await versionDe(accountId, pieceId, n)
  if (!v) throw new Error(`No existe la versión ${n} de esta pieza.`)
  if (f.network === "linkedin") {
    return { n, motivo: v.motivo, creada: v.created_at, laminas: null, caption: null, post: postDe(v.payload) }
  }
  let laminas: string[] = []
  try {
    const { slides } = parseInstagramResponse(v.guion)
    laminas = slides.map((s) =>
      s.type === "photo_hook" ? (s.hook ?? "") : [s.title, s.lead, s.body, ...(s.items ?? [])].filter(Boolean).join("\n")
    )
    const cierre = ((v.guion ?? {}) as { cierre?: { title?: string; body?: string } | null }).cierre
    if (cierre && (cierre.title || cierre.body)) laminas.push([cierre.title, cierre.body].filter(Boolean).join("\n"))
  } catch {
    laminas = []
  }
  return {
    n,
    motivo: v.motivo,
    creada: v.created_at,
    laminas,
    caption: typeof v.payload.caption === "string" ? v.payload.caption : null,
    post: null,
  }
}

/**
 * Vuelve a una version vieja y la guarda como nueva. El carrusel se redibuja
 * desde la maqueta de esa version; si no se puede, la pieza queda como estaba.
 */
export async function restaurarVersion(accountId: string, pieceId: string, n: number, usuarioId: string): Promise<number | null> {
  const supabase = supabaseAdmin()
  const f = await filaDe(accountId, pieceId)
  if (f.published_at) throw new Error("La pieza ya está publicada: lo publicado no se toca.")
  const v = await versionDe(accountId, pieceId, n)
  if (!v) throw new Error(`No existe la versión ${n} de esta pieza.`)

  const tabla = f.network === "linkedin" ? "jobs_linkedin" : "jobs_instagram"
  const jobId = f.network === "linkedin" ? f.job_linkedin_id : f.job_instagram_id
  const { data: job } = jobId ? await supabase.from(tabla).select("respuesta").eq("id", jobId).maybeSingle() : { data: null }
  const respuestaAntes = (job as { respuesta: unknown } | null)?.respuesta ?? null

  if (jobId && v.guion) await supabase.from(tabla).update({ respuesta: v.guion }).eq("id", jobId)
  await supabase.from("content_pieces").update({ payload: v.payload }).eq("id", pieceId).eq("account_id", accountId)

  if (f.network === "instagram" && !v.payload.postPropio) {
    try {
      // Sin maqueta (una version de antes de guardarla) se vuelve a maquetar desde su guion.
      const sinMaqueta = !v.payload.maqueta && v.payload.modoDiseno !== "inteligencia"
      if (sinMaqueta && v.guion && typeof v.guion === "object") {
        await rehacerDesdeGuion(accountId, { ...f, payload: v.payload }, v.guion as Record<string, unknown>, {
          caption: typeof v.payload.caption === "string" ? v.payload.caption : undefined,
          hashtags: Array.isArray(v.payload.hashtags) ? (v.payload.hashtags as string[]) : undefined,
        })
      } else await dibujarDesdeFuente(accountId, pieceId)
    } catch (e) {
      // Sin dibujo nuevo, las imagenes de la version vieja serian las de ahora: se deshace.
      if (jobId && v.guion) await supabase.from(tabla).update({ respuesta: respuestaAntes }).eq("id", jobId)
      await supabase.from("content_pieces").update({ payload: f.payload }).eq("id", pieceId).eq("account_id", accountId)
      throw new Error(`No se pudo volver a dibujar la versión ${n}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return guardarVersion({ accountId, pieceId, motivo: `Restauró la v${n}`, autorUsuario: usuarioId })
}

/**
 * "Abrir en el chat" desde el tablero: la conversacion de la pieza, o una nueva
 * con su tarjeta, para que los agentes la tengan delante al hablar.
 */
export async function conversacionDePieza(accountId: string, pieceId: string, usuarioId: string): Promise<string> {
  const supabase = supabaseAdmin()
  const f = await filaDe(accountId, pieceId)
  if (f.conversacion_id) {
    const { data } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("id", f.conversacion_id)
      .eq("account_id", accountId)
      .is("borrada_at", null)
      .maybeSingle()
    if (data) return f.conversacion_id
  }

  const red = f.network as RedPanel
  const { data: conv, error } = await supabase
    .from("conversaciones")
    .insert({
      account_id: accountId,
      creada_por: usuarioId,
      titulo: tituloProvisional("", { titulo: await tituloDeNoticia(f.content_angle_id) }, [red]),
      agentes: ["coordinador", red],
    })
    .select("id")
    .single()
  if (error) throw new Error(`No se pudo crear la conversación: ${error.message}`)
  const conversacionId = (conv as { id: string }).id

  const { texto, referencia } = await anuncioDePieza(accountId, pieceId, red)
  await escribirMensaje({
    accountId,
    conversacionId,
    rol: "agente",
    agente: red,
    contenido: texto.replace(/^Listo el/, "Aquí está el"),
    referencias: [referencia],
  })
  await supabase.from("conversacion_piezas").upsert({ conversacion_id: conversacionId, piece_id: pieceId }, { onConflict: "conversacion_id,piece_id", ignoreDuplicates: true })
  await supabase.from("content_pieces").update({ conversacion_id: conversacionId }).eq("id", pieceId)
  return conversacionId
}
