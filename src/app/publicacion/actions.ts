"use server"

import { revalidatePath } from "next/cache"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { leerHoras } from "@/engine/studio/publicar"

/**
 * Los ajustes del agente de publicacion del estudio. Es un agente aparte del de
 * las noticias (Agentes -> Publicacion): publica lo que producen las recetas.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

/** Los ajustes del agente de publicacion del estudio, para esta cuenta. */
export async function guardarPublicacion(campos: {
  activo: boolean
  horas: string
  redes: string[]
}): Promise<ActionResult> {
  const horas = leerHoras(campos.horas)
  if (!horas) return { ok: false, error: "Las horas van como 09:00, 12:30, 18:00." }
  if (horas.length === 0) return { ok: false, error: "Pon al menos una hora." }
  const redes = campos.redes.filter((r) => r === "instagram" || r === "facebook")
  if (campos.activo && redes.length === 0) return { ok: false, error: "Elige al menos una red." }
  try {
    const { error } = await supabaseAdmin()
      .from("studio_settings")
      .upsert(
        {
          account_id: await idDeCuentaActual(),
          publicar_activo: campos.activo,
          publicar_horas: horas,
          publicar_redes: redes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" }
      )
    if (error) throw new Error(error.message)
    revalidatePath("/publicacion")
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la publicación.")
  }
}
