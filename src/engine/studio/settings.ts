import { supabaseAdmin } from "../supabase-admin"
import { CONTENIDO_CONTRATO, CONTENIDO_OFICIO } from "./prompts"
import { IDEAS_CONTRATO, IDEAS_OFICIO } from "../ideas/generar"
import { datosParaPrompt, promptArmado } from "../marca/prompt"

/**
 * La configuracion de las dos agentes del pipeline nuevo.
 *
 * Los modelos son de cada empresa y viven en `account_secrets`, junto a los
 * modelos de los otros agentes. El oficio de cada agente es de cada cuenta
 * y vive en `studio_settings`, una fila por cuenta; vacio significa "usa el
 * que trae el codigo". Los prompts que salen de aqui ya van armados: oficio,
 * marca y contrato, igual que los de los agentes de noticias.
 */

export type StudioConfig = {
  modelIdeas: string
  modelContenido: string
  /** Armados y listos para mandar. */
  promptIdeas: string
  promptContenido: string
}

export async function studioConfig(accountId: string): Promise<StudioConfig> {
  const supabase = supabaseAdmin()

  const [secretos, ajustes, marca] = await Promise.all([
    supabase.from("account_secrets").select("model_ideas, model_contenido").eq("account_id", accountId).maybeSingle(),
    supabase.from("studio_settings").select("ideas_prompt, content_prompt").eq("account_id", accountId).maybeSingle(),
    datosParaPrompt(accountId),
  ])

  const s = (secretos.data ?? {}) as { model_ideas?: string; model_contenido?: string }
  const a = (ajustes.data ?? {}) as { ideas_prompt?: string | null; content_prompt?: string | null }

  return {
    modelIdeas: s.model_ideas?.trim() || "claude-sonnet-5",
    modelContenido: s.model_contenido?.trim() || "claude-sonnet-5",
    promptIdeas: promptArmado(marca, "ideas", a.ideas_prompt?.trim() || IDEAS_OFICIO, IDEAS_CONTRATO),
    promptContenido: promptArmado(marca, "contenido", a.content_prompt?.trim() || CONTENIDO_OFICIO, CONTENIDO_CONTRATO),
  }
}

/** Los oficios por defecto, para pintarlos en la config como punto de partida. */
export const PROMPTS_POR_DEFECTO = {
  ideas: IDEAS_OFICIO,
  contenido: CONTENIDO_OFICIO,
}
