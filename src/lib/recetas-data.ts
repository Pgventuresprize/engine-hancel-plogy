import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"

/**
 * Lecturas de las recetas del bloque 2 y de las piezas que producen.
 *
 * Una receta es una combinacion preconfigurada de las capas del bloque 2: de
 * que pilar saca cartuchos, para que canal y formato, con que generador, cuantas
 * al dia y a que horas. El agente de contenido las lee para saber que producir.
 */

export type RecetaVista = {
  id: string
  name: string
  pillar_id: string
  pillarName: string
  channel: string
  format: string
  generator: string
  templateId: string | null
  templateName: string | null
  per_day: number
  run_at: number[]
  enabled: boolean
  last_run_at: string | null
  piezas: number
}

type RecetaFila = {
  id: string
  name: string
  pillar_id: string
  channel: string
  format: string
  generator: string
  template_id: string | null
  per_day: number
  run_at: number[]
  enabled: boolean
  last_run_at: string | null
}

export async function getRecetas(): Promise<RecetaVista[]> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const [recetas, pilares, piezas, plantillas] = await Promise.all([
    supabase.from("content_recipes").select("*").eq("account_id", accountId).order("created_at"),
    supabase.from("content_pillars").select("id, name").eq("account_id", accountId),
    supabase.from("studio_pieces").select("recipe_id").eq("account_id", accountId),
    supabase.from("content_templates").select("id, name").eq("account_id", accountId),
  ])

  const nombrePlantilla = new Map(
    ((plantillas.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  )

  const nombrePilar = new Map(
    ((pilares.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
  )
  const conteo = new Map<string, number>()
  for (const p of (piezas.data ?? []) as { recipe_id: string | null }[]) {
    if (p.recipe_id) conteo.set(p.recipe_id, (conteo.get(p.recipe_id) ?? 0) + 1)
  }

  return ((recetas.data ?? []) as RecetaFila[]).map((r) => ({
    id: r.id,
    name: r.name,
    pillar_id: r.pillar_id,
    pillarName: nombrePilar.get(r.pillar_id) ?? "(pilar borrado)",
    channel: r.channel,
    format: r.format,
    generator: r.generator,
    templateId: r.template_id ?? null,
    templateName: r.template_id ? (nombrePlantilla.get(r.template_id) ?? null) : null,
    per_day: r.per_day,
    run_at: [...(r.run_at ?? [])].sort((a, b) => a - b),
    enabled: r.enabled,
    last_run_at: r.last_run_at,
    piezas: conteo.get(r.id) ?? 0,
  }))
}

/** Pilares de la cuenta (id y nombre), para el selector del formulario. */
export async function getPilaresSimple(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabaseAdmin()
    .from("content_pillars")
    .select("id, name")
    .eq("account_id", await idDeCuentaActual())
    .order("position")
  return (data ?? []) as { id: string; name: string }[]
}

export type ConfigEstudio = {
  /** Los prompts guardados de la cuenta, null si no se han tocado. */
  ideasPrompt: string | null
  contentPrompt: string | null
  /** Los de codigo, para pintarlos como punto de partida. */
  ideasPorDefecto: string
  contentPorDefecto: string
  /** Lo que reciben de verdad los agentes: oficio, marca y formato de respuesta. */
  ideasFinal: string
  contentFinal: string
  /** Si Canva esta conectado (se conecta en Configuracion > Conexiones). */
  canvaConectado: boolean
}

/** La config del pipeline nuevo, para la pestana de configuracion. */
export async function getConfigEstudio(): Promise<ConfigEstudio> {
  const { PROMPTS_POR_DEFECTO, studioConfig } = await import("@/engine/studio/settings")
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const { estadoCanva } = await import("@/engine/studio/canva-conexion")
  const [ajustes, canva, armados] = await Promise.all([
    supabase.from("studio_settings").select("ideas_prompt, content_prompt").eq("account_id", accountId).maybeSingle(),
    estadoCanva(accountId),
    studioConfig(accountId),
  ])

  const a = (ajustes.data ?? {}) as { ideas_prompt?: string | null; content_prompt?: string | null }

  return {
    ideasPrompt: a.ideas_prompt ?? null,
    contentPrompt: a.content_prompt ?? null,
    ideasPorDefecto: PROMPTS_POR_DEFECTO.ideas,
    contentPorDefecto: PROMPTS_POR_DEFECTO.contenido,
    ideasFinal: armados.promptIdeas,
    contentFinal: armados.promptContenido,
    canvaConectado: canva.conectado,
  }
}
