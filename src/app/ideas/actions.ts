"use server"

import { revalidatePath } from "next/cache"

import { generarRonda } from "@/engine/ideas/generar"
import { studioConfig } from "@/engine/studio/settings"
import { idDeCuentaAdvance } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"

export type IdeasResult =
  | { ok: true; generadas: number; ronda: number }
  | { ok: false; error: string }

/**
 * Genera una ronda de cartuchos para un pilar, a mano.
 *
 * La cadencia automatica (una ronda nueva cuando quedan menos de siete dias de
 * cartuchos) vive en `engine/ideas/cadencia.ts` y la dispara el tick del
 * estudio; esto es para pedir una ronda sin esperar.
 */
export async function generarIdeas(pillarId: string): Promise<IdeasResult> {
  if (!pillarId) return { ok: false, error: "Falta el pilar." }

  try {
    const accountId = await idDeCuentaAdvance()

    // El pilar tiene que ser de la cuenta abierta: el id llega del cliente.
    const { count } = await supabaseAdmin()
      .from("content_pillars")
      .select("id", { count: "exact", head: true })
      .eq("id", pillarId)
      .eq("account_id", accountId)
    if (!count) return { ok: false, error: "Ese pilar no es de esta cuenta." }

    // Modelo y prompt salen de la configuracion del estudio (/recetas).
    const cfg = await studioConfig(accountId)
    const r = await generarRonda(accountId, pillarId, cfg.modelIdeas, cfg.promptIdeas)
    if (r.error) return { ok: false, error: r.error }

    revalidatePath("/ideas")
    return { ok: true, generadas: r.generadas, ronda: r.ronda }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message || "No se pudieron generar las ideas." }
  }
}

/** Borra los cartuchos disponibles de un pilar. Los usados se conservan. */
export async function limpiarDisponibles(pillarId: string): Promise<IdeasResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("content_cartridges")
      .delete()
      .eq("pillar_id", pillarId)
      .eq("account_id", await idDeCuentaAdvance())
      .eq("status", "available")
    if (error) throw new Error(error.message)
    revalidatePath("/ideas")
    return { ok: true, generadas: 0, ronda: 0 }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message || "No se pudieron borrar." }
  }
}
