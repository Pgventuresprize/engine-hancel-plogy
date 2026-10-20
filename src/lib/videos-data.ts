import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { getSettings } from "@/engine/schedule"
import { ajustesVideo, promptGuion, type AjustesVideo } from "@/engine/videos/ajustes"
import type { Capas, Guion } from "@/engine/videos/guion"
import { GUION_OFICIO } from "@/engine/videos/prompt"
import { idDeCuentaActual } from "@/lib/accounts"

/**
 * Lo que muestra Video studio: los videos de la cuenta en su etapa, con su
 * guion y sus publicaciones, y lo que necesita la configuracion.
 */

export type EtapaVideo = "idea" | "escenas" | "clips" | "video" | "publicado"

export type PublicacionVideo = { red: string; status: string; hora: string | null; error: string | null }

export type VideoVista = {
  id: string
  status: EtapaVideo
  idea: string
  capas: Capas | null
  guion: Guion | null
  /** "Hoy 9:00 a. m.", o null si se publica a mano. */
  publica: string | null
  /** La hora limite para dejar el video en la etapa Video: una antes. */
  entregarAntes: string | null
  /** Si ya paso la hora limite y el video aun no esta entregado. */
  atrasado: boolean
  canvaUrl: string | null
  videoUrl: string | null
  exportStatus: string | null
  error: string | null
  intentos: number
  publicaciones: PublicacionVideo[]
}

export type OpcionesVideo = {
  pilares: { id: string; name: string }[]
  intenciones: { id: string; name: string; narrativas: string[] }[]
  narrativas: { id: string; name: string }[]
  promptPorDefecto: string
  /** Lo que recibe de verdad el agente: oficio, marca y formato de respuesta. */
  promptFinal: string
}

export type VideoStudioVista = { ajustes: AjustesVideo; videos: VideoVista[]; opciones: OpcionesVideo; timezone: string }

export async function getVideoStudio(): Promise<VideoStudioVista> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()
  const [ajustes, { timezone }] = await Promise.all([ajustesVideo(accountId), getSettings(accountId)])
  const promptFinal = await promptGuion(accountId, ajustes)

  const hace30 = new Date(Date.now() - 30 * 86400_000).toISOString()
  const [items, pubs, pilares, intenciones, narrativas, enlaces] = await Promise.all([
    supabase
      .from("video_items")
      .select("id, status, idea, capas, guion, publicar_at, canva_url, video_url, export_status, error, intentos, created_at")
      .eq("account_id", accountId)
      .or(`status.neq.publicado,updated_at.gte.${hace30}`)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("video_publications").select("video_id, red, status, due_at, error").eq("account_id", accountId),
    supabase.from("content_pillars").select("id, name").eq("account_id", accountId).order("position").order("name"),
    supabase.from("content_intents").select("id, name").eq("account_id", accountId).order("position"),
    supabase.from("content_narratives").select("id, name").eq("account_id", accountId).order("position"),
    supabase.from("content_intent_narratives").select("intent_id, narrative_id").eq("account_id", accountId),
  ])

  const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(d)
  const hoy = dia(new Date())
  const manana = dia(new Date(Date.now() + 86400_000))
  const cuando = (d: Date) => {
    const h = d.toLocaleTimeString("es-CO", { timeZone: timezone, hour: "numeric", minute: "2-digit" })
    const k = dia(d)
    const fecha = k === hoy ? "Hoy" : k === manana ? "Mañana" : d.toLocaleDateString("es-CO", { timeZone: timezone, day: "numeric", month: "short" })
    return `${fecha} ${h}`
  }

  const porVideo = new Map<string, PublicacionVideo[]>()
  for (const p of (pubs.data ?? []) as { video_id: string; red: string; status: string; due_at: string | null; error: string | null }[]) {
    porVideo.set(p.video_id, [
      ...(porVideo.get(p.video_id) ?? []),
      { red: p.red, status: p.status, hora: p.due_at ? cuando(new Date(p.due_at)) : null, error: p.error },
    ])
  }

  const ahora = Date.now()
  const videos: VideoVista[] = ((items.data ?? []) as {
    id: string
    status: EtapaVideo
    idea: string
    capas: Capas | null
    guion: Guion | null
    publicar_at: string | null
    canva_url: string | null
    video_url: string | null
    export_status: string | null
    error: string | null
    intentos: number
  }[]).map((v) => {
    const at = v.publicar_at ? new Date(v.publicar_at) : null
    const limite = at ? new Date(at.getTime() - 3600_000) : null
    return {
      id: v.id,
      status: v.status,
      idea: v.idea,
      capas: v.capas,
      guion: v.guion,
      publica: at ? cuando(at) : null,
      entregarAntes: limite ? cuando(limite) : null,
      atrasado: Boolean(limite && limite.getTime() < ahora && ["idea", "escenas", "clips"].includes(v.status)),
      canvaUrl: v.canva_url,
      videoUrl: v.video_url,
      exportStatus: v.export_status,
      error: v.error,
      intentos: v.intentos,
      publicaciones: porVideo.get(v.id) ?? [],
    }
  })

  const narrPorIntencion = new Map<string, string[]>()
  for (const e of (enlaces.data ?? []) as { intent_id: string; narrative_id: string }[]) {
    narrPorIntencion.set(e.intent_id, [...(narrPorIntencion.get(e.intent_id) ?? []), e.narrative_id])
  }

  return {
    ajustes,
    videos,
    timezone,
    opciones: {
      pilares: (pilares.data ?? []) as { id: string; name: string }[],
      intenciones: ((intenciones.data ?? []) as { id: string; name: string }[]).map((i) => ({ ...i, narrativas: narrPorIntencion.get(i.id) ?? [] })),
      narrativas: (narrativas.data ?? []) as { id: string; name: string }[],
      promptPorDefecto: GUION_OFICIO,
      promptFinal,
    },
  }
}
