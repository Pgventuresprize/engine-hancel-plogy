import { supabaseAdmin } from "./supabase-admin"

/**
 * Las conexiones y ajustes de cada empresa (cuenta).
 *
 * Cada empresa es independiente: su token de Claude, su clave de Serper, sus
 * modelos, sus conexiones de Composio (Canva, Facebook, Instagram) y su pagina
 * de Facebook y cuenta de Instagram. Antes todo esto vivia en `engine_secrets`,
 * una sola fila para todo el motor; ahora vive en `account_secrets`, una fila
 * por empresa.
 *
 * Lo unico que sigue siendo de la plataforma es la clave de Composio (la
 * organizacion de Composio del motor): bajo ella, cada empresa tiene su propio
 * usuario de Composio y por tanto sus propias conexiones.
 */

export type SecretosCuenta = {
  claude_oauth_token: string | null
  claude_token_updated_at: string | null
  serper_api_key: string | null
  composio_user_id: string | null
  model_analisis: string
  model_angulo: string
  model_linkedin: string
  model_instagram: string
  model_ideas: string
  model_contenido: string
  facebook_page_id: string | null
  facebook_page_name: string | null
  instagram_user_id: string | null
  instagram_username: string | null
  /** El portal de noticias de la empresa: a donde se envian las redactadas. */
  web_webhook_url: string | null
  web_webhook_secret: string | null
}

const VACIO: SecretosCuenta = {
  claude_oauth_token: null,
  claude_token_updated_at: null,
  serper_api_key: null,
  composio_user_id: null,
  model_analisis: "claude-haiku-4-5-20251001",
  model_angulo: "claude-sonnet-5",
  model_linkedin: "claude-sonnet-5",
  model_instagram: "claude-sonnet-5",
  model_ideas: "claude-sonnet-5",
  model_contenido: "claude-sonnet-5",
  facebook_page_id: null,
  facebook_page_name: null,
  instagram_user_id: null,
  instagram_username: null,
  web_webhook_url: null,
  web_webhook_secret: null,
}

/** Las conexiones de una empresa. Si aun no tiene fila, todo vacio. */
export async function secretosDe(accountId: string): Promise<SecretosCuenta> {
  const { data, error } = await supabaseAdmin().from("account_secrets").select("*").eq("account_id", accountId).maybeSingle()
  if (error) throw new Error(`No se pudieron leer las conexiones de la cuenta: ${error.message}`)
  return { ...VACIO, ...((data ?? {}) as Partial<SecretosCuenta>) }
}

/** Guarda parte de las conexiones de una empresa (crea su fila si no existe). */
export async function guardarSecretos(accountId: string, campos: Partial<SecretosCuenta>): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("account_secrets")
    .upsert({ account_id: accountId, ...campos, updated_at: new Date().toISOString() }, { onConflict: "account_id" })
  if (error) throw new Error(`No se pudieron guardar las conexiones de la cuenta: ${error.message}`)
}

/**
 * El usuario de Composio de una empresa: bajo el viven sus conexiones (Canva,
 * Facebook, Instagram). Agro conserva el que ya tenia ("engine-hancel"), donde
 * esta su Canva; las demas usan uno propio derivado de su id.
 */
export async function usuarioComposio(accountId: string): Promise<string> {
  const s = await secretosDe(accountId)
  return s.composio_user_id?.trim() || `cuenta-${accountId}`
}
