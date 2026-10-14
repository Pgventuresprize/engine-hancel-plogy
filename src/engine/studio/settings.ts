import { supabaseAdmin } from "../supabase-admin"
import { CONTENIDO_SYSTEM } from "./prompts"
import { IDEAS_SYSTEM } from "../ideas/generar"

/**
 * La configuracion de las dos agentes del pipeline nuevo.
 *
 * Los modelos son de cada empresa y viven en `account_secrets`, junto a los
 * modelos de los otros agentes. Los
 * prompts son de cada cuenta —la voz de una marca no es la de otra— y viven en
 * `studio_settings`, una fila por cuenta. En ambos sitios, vacio significa "usa
 * lo que trae el codigo".
 */

export type StudioConfig = {
  modelIdeas: string
  modelContenido: string
  promptIdeas: string
  promptContenido: string
}

export async function studioConfig(accountId: string): Promise<StudioConfig> {
  const supabase = supabaseAdmin()

  const [secretos, ajustes] = await Promise.all([
    supabase.from("account_secrets").select("model_ideas, model_contenido").eq("account_id", accountId).maybeSingle(),
    supabase.from("studio_settings").select("ideas_prompt, content_prompt").eq("account_id", accountId).maybeSingle(),
  ])

  const s = (secretos.data ?? {}) as { model_ideas?: string; model_contenido?: string }
  const a = (ajustes.data ?? {}) as { ideas_prompt?: string | null; content_prompt?: string | null }

  return {
    modelIdeas: s.model_ideas?.trim() || "claude-sonnet-5",
    modelContenido: s.model_contenido?.trim() || "claude-sonnet-5",
    promptIdeas: a.ideas_prompt?.trim() || IDEAS_SYSTEM,
    promptContenido: a.content_prompt?.trim() || CONTENIDO_SYSTEM,
  }
}

/** Los prompts por defecto, para pintarlos en la config como punto de partida. */
export const PROMPTS_POR_DEFECTO = {
  ideas: IDEAS_SYSTEM,
  contenido: CONTENIDO_SYSTEM,
}
