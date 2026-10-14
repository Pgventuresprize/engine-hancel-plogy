import { supabaseAdmin } from "../supabase-admin"
import { usuarioComposio } from "../secretos"

/**
 * Las conexiones de cada empresa en Composio: Canva, Facebook, Instagram.
 *
 * Dos identificadores que es facil confundir:
 * - La auth config (`ac_...`) dice "esta es la configuracion de Canva (o
 *   Facebook, o Instagram) en Composio". Es de la plataforma y va fija aqui.
 * - La cuenta conectada (`ca_...`) es el Canva o la pagina de Facebook de una
 *   empresa. La crea Composio cuando alguien de la empresa inicia sesion desde
 *   Conexiones; nadie la escribe a mano.
 *
 * Cada empresa tiene su propio usuario de Composio (ver `usuarioComposio`), asi
 * que sus conexiones no se ven ni se usan desde otra.
 *
 * La clave de Composio si es de la plataforma (la organizacion de Composio del
 * motor): bajo ella viven los usuarios de todas las empresas.
 */

const API = "https://backend.composio.dev/api/v3.1"

export type Toolkit = "canva" | "facebook" | "instagram"

/** La auth config de cada toolkit en Composio. Se puede sobreescribir por entorno. */
export const AUTH_CONFIG: Record<Toolkit, string> = {
  canva: process.env.COMPOSIO_CANVA_AUTH_CONFIG_ID?.trim() || "ac_mF7f1F7XqvON",
  facebook: process.env.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID?.trim() || "ac_V3qhG8l4dYur",
  instagram: process.env.COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID?.trim() || "ac_VahuawW7hmAw",
}

const NOMBRE: Record<Toolkit, string> = { canva: "Canva", facebook: "Facebook", instagram: "Instagram" }

/** La clave de Composio de la plataforma. */
export async function claveComposio(): Promise<string | null> {
  if (process.env.COMPOSIO_API_KEY) return process.env.COMPOSIO_API_KEY
  const { data } = await supabaseAdmin().from("engine_secrets").select("composio_api_key").eq("id", true).maybeSingle()
  return (data as { composio_api_key: string | null } | null)?.composio_api_key?.trim() || null
}

export type EstadoConexion = { conectado: true; connectedAccountId: string } | { conectado: false; motivo: string }

const estados = new Map<string, { estado: EstadoConexion; hasta: number }>()

/**
 * La cuenta conectada y activa de una empresa en un toolkit. Nunca lanza. Se
 * cachea un minuto (el tablero lo pregunta a menudo); `fresco` lo salta, para
 * leerlo justo despues de conectar.
 */
export async function estadoConexion(accountId: string, toolkit: Toolkit, fresco = false): Promise<EstadoConexion> {
  const llave = `${accountId}|${toolkit}`
  const guardado = estados.get(llave)
  if (!fresco && guardado && guardado.hasta > Date.now()) return guardado.estado
  const estado = await consultarEstado(accountId, toolkit)
  estados.set(llave, { estado, hasta: Date.now() + 60_000 })
  return estado
}

async function consultarEstado(accountId: string, toolkit: Toolkit): Promise<EstadoConexion> {
  const clave = await claveComposio()
  if (!clave) return { conectado: false, motivo: "Falta la clave de Composio de la plataforma." }
  try {
    const url = new URL(`${API}/connected_accounts`)
    url.searchParams.set("auth_config_ids", AUTH_CONFIG[toolkit])
    url.searchParams.set("user_ids", await usuarioComposio(accountId))
    url.searchParams.set("statuses", "ACTIVE")
    url.searchParams.set("order_by", "updated_at")
    url.searchParams.set("order_direction", "desc")
    url.searchParams.set("limit", "5")
    const res = await fetch(url, { headers: { "x-api-key": clave }, signal: AbortSignal.timeout(15_000), cache: "no-store" })
    if (!res.ok) return { conectado: false, motivo: `Composio respondió ${res.status}.` }
    const json = (await res.json()) as { items?: { id: string; status?: string }[] }
    const activa = (json.items ?? []).find((c) => !c.status || c.status === "ACTIVE")
    return activa
      ? { conectado: true, connectedAccountId: activa.id }
      : { conectado: false, motivo: `${NOMBRE[toolkit]} no está conectado.` }
  } catch (error) {
    return { conectado: false, motivo: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Abre una sesion de autenticacion de una empresa con un toolkit y devuelve la
 * url a la que ir. Composio guarda la cuenta conectada al terminar y redirige a
 * `callbackUrl`.
 */
export async function enlaceConexion(
  accountId: string,
  toolkit: Toolkit,
  callbackUrl: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const clave = await claveComposio()
  if (!clave) return { ok: false, error: "Falta la clave de Composio de la plataforma." }
  try {
    const res = await fetch(`${API}/connected_accounts/link`, {
      method: "POST",
      headers: { "x-api-key": clave, "Content-Type": "application/json" },
      body: JSON.stringify({ auth_config_id: AUTH_CONFIG[toolkit], user_id: await usuarioComposio(accountId), callback_url: callbackUrl }),
      signal: AbortSignal.timeout(20_000),
    })
    const json = (await res.json().catch(() => null)) as { redirect_url?: string; error?: { message?: string } | string; message?: string } | null
    if (!res.ok || !json?.redirect_url) {
      const detalle = (typeof json?.error === "string" ? json.error : json?.error?.message) ?? json?.message
      return { ok: false, error: detalle || `Composio respondió ${res.status}.` }
    }
    return { ok: true, url: json.redirect_url }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Desconecta: borra en Composio la cuenta conectada de la empresa. */
export async function desconectar(accountId: string, toolkit: Toolkit): Promise<{ ok: true } | { ok: false; error: string }> {
  const clave = await claveComposio()
  const estado = await estadoConexion(accountId, toolkit, true)
  estados.delete(`${accountId}|${toolkit}`)
  cache.delete(`${accountId}|${toolkit}`)
  if (!clave || !estado.conectado) return { ok: true }
  const res = await fetch(`${API}/connected_accounts/${estado.connectedAccountId}`, {
    method: "DELETE",
    headers: { "x-api-key": clave },
    signal: AbortSignal.timeout(15_000),
  })
  return res.ok ? { ok: true } : { ok: false, error: `Composio respondió ${res.status}.` }
}

export type Resultado<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string }

const cache = new Map<string, { cuenta: string; hasta: number }>()

/**
 * Ejecuta una herramienta de un toolkit con la conexion de una empresa. La
 * cuenta conectada se cachea un minuto. No lanza: el fallo viaja en el
 * resultado.
 */
export async function ejecutar<T = Record<string, unknown>>(
  accountId: string,
  toolkit: Toolkit,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 90_000
): Promise<Resultado<T>> {
  const clave = await claveComposio()
  if (!clave) return { ok: false, error: "Falta la clave de Composio de la plataforma." }
  const llave = `${accountId}|${toolkit}`
  let cuenta = cache.get(llave)
  if (!cuenta || cuenta.hasta < Date.now()) {
    const estado = await estadoConexion(accountId, toolkit)
    if (!estado.conectado) return { ok: false, error: `${estado.motivo} Conéctalo en Configuración > Conexiones.` }
    cuenta = { cuenta: estado.connectedAccountId, hasta: Date.now() + 60_000 }
    cache.set(llave, cuenta)
  }
  const usuario = await usuarioComposio(accountId)

  for (let intento = 0; intento < 2; intento++) {
    try {
      const res = await fetch(`${API}/tools/execute/${tool}`, {
        method: "POST",
        headers: { "x-api-key": clave, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: usuario, connected_account_id: cuenta.cuenta, arguments: args }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const json = (await res.json().catch(() => null)) as { successful?: boolean; error?: string | { message?: string } | null; data?: T } | null
      if (res.ok && json?.successful !== false && json?.data) return { ok: true, data: json.data }
      const error = (typeof json?.error === "string" ? json.error : json?.error?.message) || `${NOMBRE[toolkit]} ${tool} respondió ${res.status}`
      // Un 429 o un 5xx de paso se reintenta una vez; un error de la propia red no.
      if ((res.status === 429 || res.status >= 500) && intento === 0) {
        await new Promise((r) => setTimeout(r, 3000))
        continue
      }
      return { ok: false, error: error.slice(0, 500) }
    } catch (error) {
      if (intento === 0) continue
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  return { ok: false, error: `${NOMBRE[toolkit]} ${tool} no respondió.` }
}
