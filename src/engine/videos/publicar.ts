import { supabaseAdmin } from "../supabase-admin"
import { dayIn, getSettings } from "../schedule"
import { publicarEnRed } from "../publish/meta"
import { canvaMcp } from "../studio/canva-mcp"
import { instanteLocal, type RedBuffer } from "../studio/publicar"
import { ajustesVideo } from "./ajustes"
import { crearVideo, escribirGuion, type Guion } from "./guion"

/**
 * La parte del sistema despues de que una persona monta el video.
 *
 * - Exportar: el video vive en Canva; se exporta a MP4 vertical 1080p y se
 *   copia al storage, porque Buffer necesita una url publica que no caduque.
 * - Publicar: cada video queda programado en Buffer, como reel, en cada red de
 *   la configuracion, a la hora de su hueco (o ya mismo si se publica a mano).
 * - El tick: en modo automatico deja un guion listo por cada hora de
 *   publicacion de hoy y manana, exporta lo que una persona entrego y programa
 *   lo que ya esta listo.
 */

const BUCKET = "carousels"
const MAX_INTENTOS = 3
/** Como en el estudio: Buffer admite diez programadas por canal, se programa con hora y media de antelacion. */

/** El id de diseno de un enlace de Canva (https://www.canva.com/design/DAG.../edit). */
export function idDeDisenoCanva(url: string): string | null {
  return /\/design\/(D[A-Za-z0-9_-]{10})(?:[/?#]|$)/.exec(url.trim())?.[1] ?? null
}

type Video = {
  id: string
  account_id: string
  status: string
  canva_design_id: string | null
  video_url: string | null
  export_status: string | null
  publicar_at: string | null
  guion: Guion | null
  intentos: number
}

/** Exporta de Canva el video entregado y lo deja en el storage. */
export async function exportarVideo(videoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("video_items").select("id, account_id, canva_design_id").eq("id", videoId).maybeSingle()
  const v = data as Pick<Video, "id" | "account_id" | "canva_design_id"> | null
  if (!v?.canva_design_id) return { ok: false, error: "El video no tiene diseño de Canva." }
  await supabase.from("video_items").update({ export_status: "exportando", error: null, updated_at: new Date().toISOString() }).eq("id", v.id)

  const falla = async (error: string) => {
    await supabase.from("video_items").update({ export_status: "error", error: error.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", v.id)
    return { ok: false as const, error }
  }

  const ex = await canvaMcp<{ job?: { urls?: string[]; status?: string; error?: { message?: string } } }>(
    v.account_id,
    "CANVA_MCP_EXPORT_DESIGN",
    { design_id: v.canva_design_id, format: { type: "mp4", quality: "vertical_1080p" }, user_intent: "Exportar el video terminado para publicarlo" },
    240_000
  )
  if (!ex.ok) return falla(`Canva no pudo exportar el video: ${ex.error}`)
  const url = ex.data.job?.urls?.[0]
  if (!url) return falla(`Canva no devolvió el video exportado${ex.data.job?.error?.message ? `: ${ex.data.job.error.message}` : "."}`)

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) return falla(`No se pudo descargar el video de Canva (${res.status}).`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const ruta = `videos/${v.account_id}/${v.id}.mp4`
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, buffer, { contentType: "video/mp4", upsert: true })
    if (error) return falla(`No se pudo guardar el video (${Math.round(buffer.byteLength / 1e6)} MB): ${error.message}`)
    const publica = `${supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl}?v=${Date.now().toString(36)}`
    await supabase
      .from("video_items")
      .update({ video_url: publica, export_status: "listo", error: null, updated_at: new Date().toISOString() })
      .eq("id", v.id)
    return { ok: true }
  } catch (error) {
    return falla(error instanceof Error ? error.message : String(error))
  }
}

/**
 * Publica un video ya exportado en cada red de la configuracion, con las
 * conexiones de Facebook e Instagram de la empresa (Composio): reel en
 * Instagram, video en la pagina de Facebook. Publica en el acto; quien llama
 * decide cuando (el tick de publicacion, a la hora de su hueco).
 */
export async function publicarVideo(videoId: string, now = new Date()) {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("video_items").select("*").eq("id", videoId).maybeSingle()
  const v = data as Video | null
  if (!v) return { ok: false as const, error: "No existe ese video." }
  if (!v.video_url) return { ok: false as const, error: "El video todavía no está exportado de Canva." }
  const a = await ajustesVideo(v.account_id)
  if (a.redes.length === 0) return { ok: false as const, error: "No hay redes elegidas en la configuración." }
  const texto = v.guion?.descripcion?.trim() ?? ""
  const titulo = v.guion?.escenas?.[0]?.titulo ?? undefined

  const { data: previas } = await supabase.from("video_publications").select("id, red, status, intentos").eq("video_id", v.id)
  const filas = (previas ?? []) as { id: string; red: RedBuffer; status: string; intentos: number }[]
  const errores: string[] = []
  for (const red of a.redes) {
    const previa = filas.find((f) => f.red === red)
    if (previa && previa.status !== "error") continue
    if (previa && previa.intentos >= MAX_INTENTOS) continue
    let filaId: string | null = null
    if (!previa) {
      const { data: nueva } = await supabase
        .from("video_publications")
        .insert({ account_id: v.account_id, video_id: v.id, red, status: "programando", due_at: now.toISOString(), intentos: 1 })
        .select("id")
        .maybeSingle()
      filaId = (nueva as { id: string } | null)?.id ?? null
    } else {
      const { data: retomada } = await supabase
        .from("video_publications")
        .update({ status: "programando", due_at: now.toISOString(), intentos: previa.intentos + 1, updated_at: now.toISOString() })
        .eq("id", previa.id)
        .eq("status", "error")
        .select("id")
        .maybeSingle()
      filaId = (retomada as { id: string } | null)?.id ?? null
    }
    if (!filaId) continue

    const r = await publicarEnRed(v.account_id, red, { texto, video: v.video_url, titulo })
    await supabase
      .from("video_publications")
      .update(
        r.ok
          ? { status: "publicada", buffer_post_id: r.postId, error: null, updated_at: new Date().toISOString() }
          : { status: "error", error: r.error.slice(0, 500), updated_at: new Date().toISOString() }
      )
      .eq("id", filaId)
    if (!r.ok) errores.push(`${red}: ${r.error}`)
  }

  // Con al menos una red publicada, el video pasa a Publicacion; ahi se ve
  // cada red con su estado (y las que fallaron se reintentan).
  const { count } = await supabase
    .from("video_publications")
    .select("id", { count: "exact", head: true })
    .eq("video_id", v.id)
    .eq("status", "publicada")
  if ((count ?? 0) > 0) await supabase.from("video_items").update({ status: "publicado", updated_at: now.toISOString() }).eq("id", v.id)
  return errores.length ? { ok: false as const, error: errores.join(" · ") } : { ok: true as const }
}

/**
 * Publica el video que toca, como mucho uno por pasada (un reel tarda minutos
 * en procesarse): el que ya llego a su hora, o el que tiene redes con error que
 * reintentar. Lo llama el tick de publicacion cada cinco minutos.
 */
export async function publicarVideosPendientes(accountId: string, now = new Date()): Promise<ResumenVideos> {
  const supabase = supabaseAdmin()
  const a = await ajustesVideo(accountId)
  const acciones: string[] = []
  const errores: string[] = []
  if (!a.publicarActivo) return { acciones, errores }

  // Un reclamo que se quedo a medias se vuelve a intentar.
  await supabase
    .from("video_publications")
    .update({ status: "error", error: "Se interrumpió al publicar." })
    .eq("account_id", accountId)
    .eq("status", "programando")
    .lt("updated_at", new Date(now.getTime() - 10 * 60_000).toISOString())

  const { data: listos } = await supabase
    .from("video_items")
    .select("id")
    .eq("account_id", accountId)
    .eq("status", "video")
    .eq("export_status", "listo")
    .not("publicar_at", "is", null)
    .lte("publicar_at", now.toISOString())
    .order("publicar_at", { ascending: true })
    .limit(1)
  const { data: conError } = await supabase
    .from("video_publications")
    .select("video_id")
    .eq("account_id", accountId)
    .eq("status", "error")
    .lt("intentos", MAX_INTENTOS)
    .limit(1)
  const id = ((listos ?? []) as { id: string }[])[0]?.id ?? ((conError ?? []) as { video_id: string }[])[0]?.video_id
  if (!id) return { acciones, errores }
  const r = await publicarVideo(id, now)
  if (r.ok) acciones.push(`Publicado ${id}`)
  else errores.push(r.error)
  return { acciones, errores }
}

/** Los huecos de publicacion de hoy y manana (los que aun no pasaron). */
export function huecosProximos(horas: number[], timezone: string, now: Date): Date[] {
  const hoy = dayIn(timezone, now)
  const manana = dayIn(timezone, new Date(now.getTime() + 24 * 3600_000))
  return [hoy, manana]
    .flatMap((dia) => horas.map((h) => instanteLocal(dia, `${String(h).padStart(2, "0")}:00`, timezone)))
    .filter((d) => d.getTime() > now.getTime())
}

export type ResumenVideos = { acciones: string[]; errores: string[] }

/**
 * Una pasada de Video studio para una cuenta: como mucho una tarea larga
 * (exportar un video entregado o escribir un guion), que puede llevar minutos.
 * Publicar lo hace aparte el tick de publicacion.
 */
export async function tickVideos(accountId: string, now = new Date()): Promise<ResumenVideos> {
  const supabase = supabaseAdmin()
  const a = await ajustesVideo(accountId)
  const acciones: string[] = []
  const errores: string[] = []

  // 3. Una tarea larga: exportar lo entregado (lo mas urgente: tiene hora) o
  // escribir un guion.
  const { data: porExportar } = await supabase
    .from("video_items")
    .select("id, export_status, updated_at")
    .eq("account_id", accountId)
    .eq("status", "video")
    .in("export_status", ["pendiente", "error", "exportando"])
    .order("publicar_at", { ascending: true, nullsFirst: false })
  const exportable = ((porExportar ?? []) as { id: string; export_status: string; updated_at: string }[]).find(
    (x) => x.export_status !== "exportando" || new Date(x.updated_at).getTime() < now.getTime() - 10 * 60_000
  )
  if (exportable) {
    const r = await exportarVideo(exportable.id)
    if (r.ok) acciones.push(`Exportado ${exportable.id}`)
    else errores.push(r.error)
    return { acciones, errores }
  }

  // Guiones que fallaron o se quedaron a medias: otro intento.
  const { data: atascados } = await supabase
    .from("video_items")
    .select("id")
    .eq("account_id", accountId)
    .eq("status", "idea")
    .lt("intentos", MAX_INTENTOS)
    .lt("updated_at", new Date(now.getTime() - 5 * 60_000).toISOString())
    .limit(1)
  const atascado = ((atascados ?? []) as { id: string }[])[0]
  if (atascado) {
    const r = await escribirGuion(atascado.id)
    if (r.ok) acciones.push(`Guion ${atascado.id}`)
    else errores.push(r.error)
    return { acciones, errores }
  }

  // Modo automatico: un guion por cada hueco de hoy y manana que no lo tenga.
  if (a.modo === "automatico" && a.horas.length) {
    const { timezone } = await getSettings(accountId)
    const huecos = huecosProximos(a.horas, timezone, now)
    const { data: tomados } = await supabase
      .from("video_items")
      .select("publicar_at")
      .eq("account_id", accountId)
      .gte("publicar_at", now.toISOString())
    const ocupados = new Set(((tomados ?? []) as { publicar_at: string }[]).map((t) => new Date(t.publicar_at).getTime()))
    const libre = huecos.find((h) => !ocupados.has(h.getTime()))
    if (libre) {
      const r = await crearVideo(accountId, { publicarAt: libre })
      if (r.ok) acciones.push(`Video para ${libre.toISOString()}${r.guion ? "" : ` (guion con error: ${r.error})`}`)
      else errores.push(r.error)
    }
  }

  return { acciones, errores }
}
