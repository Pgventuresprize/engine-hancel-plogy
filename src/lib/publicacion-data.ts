import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { dayIn, getSettings } from "@/engine/schedule"
import { ajustesPublicacion, planDelDia, type AjustesPublicacion } from "@/engine/studio/publicar"
import { idDeCuentaActual } from "@/lib/accounts"

/**
 * Lo que la pestaña de publicacion muestra: los ajustes del agente y el plan de
 * hoy, hueco por hueco, con la pieza que le toco y como va en cada red.
 */

export type EstadoRed = { status: string; error: string | null } | null

export type HuecoVista = {
  slot: number
  hora: string
  pilar: string
  receta: string
  pieza: string | null
  /**
   * Un hueco que aun no salio: "prevista" si su receta ya tiene la pieza (sale
   * a su hora), "sinPieza" si la receta todavia no la genero. null si ya salio
   * o se esta publicando.
   */
  pendiente: { tipo: "prevista"; seProgramaA: string } | { tipo: "sinPieza"; generaA: string } | null
  instagram: EstadoRed
  facebook: EstadoRed
}

export type PublicacionVista = {
  ajustes: AjustesPublicacion
  dia: string
  timezone: string
  huecos: HuecoVista[]
}

export async function getPublicacion(): Promise<PublicacionVista> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()
  const [ajustes, { timezone }] = await Promise.all([ajustesPublicacion(accountId), getSettings(accountId)])
  const dia = dayIn(timezone, new Date())

  const [recetas, pilares, filas] = await Promise.all([
    supabase.from("content_recipes").select("id, name, pillar_id, per_day, channel, created_at").eq("account_id", accountId).eq("enabled", true),
    supabase.from("content_pillars").select("id, name").eq("account_id", accountId).order("position").order("name"),
    supabase.from("studio_publications").select("slot, red, status, error, due_at, piece_id").eq("account_id", accountId).eq("dia", dia),
  ])
  const lasRecetas = (recetas.data ?? []) as (Parameters<typeof planDelDia>[0][number] & { run_at?: number[] })[]
  const losPilares = (pilares.data ?? []) as { id: string; name: string }[]
  const plan = planDelDia(
    lasRecetas,
    losPilares.map((p) => p.id),
    ajustes,
    dia,
    timezone
  )
  const lasFilas = (filas.data ?? []) as { slot: number; red: string; status: string; error: string | null; due_at: string | null; piece_id: string }[]

  // Lo que el agente le dara a cada hueco que aun no programo: la pieza mas
  // reciente de su receta que no se haya usado, en el orden del plan (igual
  // que hace el agente).
  const [{ data: usadas }, { data: libres }, { data: horas }] = await Promise.all([
    supabase.from("studio_publications").select("piece_id").eq("account_id", accountId),
    supabase
      .from("studio_pieces")
      .select("id, recipe_id, payload, created_at")
      .eq("account_id", accountId)
      .eq("status", "generated")
      .is("published_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("content_recipes").select("id, run_at").eq("account_id", accountId),
  ])
  const yaUsadas = new Set(((usadas ?? []) as { piece_id: string }[]).map((u) => u.piece_id))
  const porReceta = new Map<string, { id: string; payload: unknown }[]>()
  for (const p of (libres ?? []) as { id: string; recipe_id: string; payload: unknown }[]) {
    if (yaUsadas.has(p.id)) continue
    porReceta.set(p.recipe_id, [...(porReceta.get(p.recipe_id) ?? []), p])
  }
  const runAt = new Map(((horas ?? []) as { id: string; run_at: number[] }[]).map((r) => [r.id, r.run_at]))

  const ids = [...new Set(lasFilas.map((f) => f.piece_id))]
  const { data: piezas } = ids.length
    ? await supabase.from("studio_pieces").select("id, payload").in("id", ids)
    : { data: [] }
  const tituloDe = new Map(
    ((piezas ?? []) as { id: string; payload: { slides?: { hook?: string; title?: string }[] } | null }[]).map((p) => [
      p.id,
      (p.payload?.slides?.[0]?.hook || p.payload?.slides?.[0]?.title || "").replace(/\*/g, ""),
    ])
  )
  const hora = (d: Date) => d.toLocaleTimeString("es-CO", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })
  const tituloDePayload = (payload: unknown) => {
    const s = (payload as { slides?: { hook?: string; title?: string }[] } | null)?.slides?.[0]
    return (s?.hook || s?.title || "").replace(/\*/g, "")
  }
  const ahora = Date.now()

  return {
    ajustes,
    dia,
    timezone,
    huecos: plan.map((h) => {
      const suyas = lasFilas.filter((f) => f.slot === h.slot)
      const red = (r: string): EstadoRed => {
        const f = suyas.find((x) => x.red === r)
        return f ? { status: f.status, error: f.error } : null
      }
      const due = suyas.find((f) => f.due_at)?.due_at
      let pieza = suyas[0] ? (tituloDe.get(suyas[0].piece_id) ?? null) : null
      let pendiente: HuecoVista["pendiente"] = null
      if (!suyas.length) {
        const siguiente = porReceta.get(h.receta.id)?.shift()
        if (siguiente) {
          pieza = tituloDePayload(siguiente.payload)
          pendiente = { tipo: "prevista", seProgramaA: h.at.getTime() <= ahora ? "en la próxima pasada (máx. 5 min)" : `a las ${hora(h.at)}` }
        } else {
          const hs = runAt.get(h.receta.id) ?? []
          pendiente = { tipo: "sinPieza", generaA: hs.length ? hs.map((x) => `${x}:00`).join(" y ") : "sin horario" }
        }
      }
      return {
        slot: h.slot,
        // Si salio en otro hueco porque su pieza llego tarde, se ve la hora real.
        hora: hora(due ? new Date(due) : h.at),
        pilar: losPilares.find((p) => p.id === h.receta.pillar_id)?.name ?? "",
        receta: h.receta.name,
        pieza,
        pendiente,
        instagram: red("instagram"),
        facebook: red("facebook"),
      }
    }),
  }
}
