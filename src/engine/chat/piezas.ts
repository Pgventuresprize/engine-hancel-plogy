import { tituloProvisional } from "@/lib/chat-titulo"
import { nombreDe } from "@/lib/chat-nombre"

import { guardarVersion, versionDe, versionesDe } from "../content/versiones"
import { parseInstagramResponse } from "../render/carousel"
import { dibujarDesdeFuente } from "../render/redibujar"
import { supabaseAdmin } from "../supabase-admin"
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

export async function vistaDePieza(accountId: string, pieceId: string): Promise<PiezaVista> {
  const f = await filaDe(accountId, pieceId)
  const [titulo, versiones] = await Promise.all([tituloDeNoticia(f.content_angle_id), versionesDe(accountId, pieceId)])
  const nombres = await autores(versiones)
  const red = f.network as RedPanel
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
      autor: v.autor_usuario ? (nombres.get(v.autor_usuario) ?? "Alguien del equipo") : AGENTE[v.autor_agente ?? ""] ?? "Hancel",
      creada: v.created_at,
    })),
    restaurable: !f.published_at,
  }
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

  if (f.network === "instagram") {
    try {
      await dibujarDesdeFuente(accountId, pieceId)
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
