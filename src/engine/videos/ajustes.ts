import { supabaseAdmin } from "../supabase-admin"
import type { RedBuffer } from "../studio/publicar"
import { GUION_SYSTEM } from "./prompt"

/**
 * La configuracion de Video studio, por cuenta.
 *
 * - modo: "manual" (los guiones se piden con un boton) o "automatico" (el
 *   agente deja listo un guion por cada hora de publicacion de hoy y manana).
 * - horas: las horas de publicacion del dia; cuantas haya es cuantos videos
 *   salen al dia.
 * - pilar / intencion / narrativa: de donde toma las ideas el agente. Vacios =
 *   al azar entre todas las disponibles.
 */

export const MODELO_VIDEO_POR_DEFECTO = "claude-sonnet-5"

export type AjustesVideo = {
  modo: "manual" | "automatico"
  horas: number[]
  pillarId: string | null
  intentId: string | null
  narrativeId: string | null
  personajeTag: string
  personajeNombre: string
  publicarActivo: boolean
  redes: RedBuffer[]
  model: string
  /** El prompt guardado por la cuenta, o null si usa el de serie. */
  prompt: string | null
}

type Fila = {
  modo: string
  horas: number[]
  pillar_id: string | null
  intent_id: string | null
  narrative_id: string | null
  personaje_tag: string
  personaje_nombre: string
  publicar_activo: boolean
  redes: string[]
  model: string | null
  prompt: string | null
}

export async function ajustesVideo(accountId: string): Promise<AjustesVideo> {
  const { data } = await supabaseAdmin().from("video_settings").select("*").eq("account_id", accountId).maybeSingle()
  const f = data as Fila | null
  return {
    modo: f?.modo === "automatico" ? "automatico" : "manual",
    horas: [...new Set((f?.horas ?? []).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort((a, b) => a - b),
    pillarId: f?.pillar_id ?? null,
    intentId: f?.intent_id ?? null,
    narrativeId: f?.narrative_id ?? null,
    personajeTag: f?.personaje_tag?.trim() || "@juan",
    personajeNombre: f?.personaje_nombre?.trim() || "Juan",
    publicarActivo: f?.publicar_activo ?? false,
    redes: (f?.redes ?? ["instagram", "facebook"]).filter((r): r is RedBuffer => r === "instagram" || r === "facebook"),
    model: f?.model?.trim() || MODELO_VIDEO_POR_DEFECTO,
    prompt: f?.prompt?.trim() || null,
  }
}

/** El prompt con el que se escribe el guion: el de la cuenta o el de serie. */
export const promptGuion = (a: AjustesVideo) => a.prompt ?? GUION_SYSTEM
