import { supabaseAdmin } from "../supabase-admin"
import type { PiecePayload } from "../content/types"

/**
 * Publicacion en LinkedIn.
 *
 * Dos piezas separadas a proposito: el OAuth (conectar la cuenta) y la
 * publicacion (usar el token guardado). La cuenta se conecta una vez desde el
 * navegador; publicar ocurre despues, cuando el usuario ya no esta, asi que el
 * token tiene que vivir en la base y no en una sesion.
 *
 * Contrato verificado contra la documentacion de LinkedIn (Posts API y
 * 3-legged OAuth), no de memoria.
 */

/** Formato YYYYMM. LinkedIn exige la cabecera en todas las llamadas a /rest. */
export const LINKEDIN_VERSION = "202608"

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
const POSTS_URL = "https://api.linkedin.com/rest/posts"
const IMAGES_URL = "https://api.linkedin.com/rest/images"

/**
 * `openid profile` es lo que permite leer /v2/userinfo para sacar el `sub`, que
 * es el id con el que se arma el URN del autor. `w_member_social` es el permiso
 * de publicar en nombre del miembro, y es abierto a cualquier app.
 */
export const LINKEDIN_SCOPES = "openid profile w_member_social"

export type LinkedinConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** `null` si falta configuracion, que distingue "no montado" de "fallo". */
export function linkedinConfig(): LinkedinConfig | null {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) return null
  // El placeholder del .env.example no vale como secreto.
  if (clientSecret.startsWith("<")) return null

  return { clientId, clientSecret, redirectUri }
}

/** Fila de `public.linkedin_account`. */
export type LinkedinAccount = {
  access_token: string
  refresh_token: string | null
  expires_at: string
  refresh_expires_at: string | null
  person_urn: string
  display_name: string | null
  scope: string | null
  connected_at: string
}

export async function getLinkedinAccount(accountId: string): Promise<LinkedinAccount | null> {
  const { data, error } = await supabaseAdmin()
    .from("linkedin_account")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la cuenta de LinkedIn: ${error.message}`)
  return (data as LinkedinAccount) ?? null
}

/** Lo que la interfaz necesita saber, sin que el token salga del servidor. */
export type LinkedinStatus = {
  configured: boolean
  connected: boolean
  displayName: string | null
  expiresAt: string | null
  expired: boolean
  /** Avisa con margen: reconectar es manual y no puede pillar por sorpresa. */
  expiringSoon: boolean
}

export async function getLinkedinStatus(accountId: string): Promise<LinkedinStatus> {
  const configured = linkedinConfig() !== null
  const account = await getLinkedinAccount(accountId)

  if (!account) {
    return {
      configured,
      connected: false,
      displayName: null,
      expiresAt: null,
      expired: false,
      expiringSoon: false,
    }
  }

  const expiresAt = new Date(account.expires_at).getTime()
  const quedan = expiresAt - Date.now()

  return {
    configured,
    connected: true,
    displayName: account.display_name,
    expiresAt: account.expires_at,
    expired: quedan <= 0,
    expiringSoon: quedan > 0 && quedan < 7 * 24 * 60 * 60 * 1000,
  }
}

// ----------------------------------------------------------------------- OAuth

export function buildAuthUrl(state: string): string {
  const config = linkedinConfig()
  if (!config) throw new Error("Faltan las credenciales de LinkedIn en el entorno.")

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: LINKEDIN_SCOPES,
  })

  return `${AUTH_URL}?${params.toString()}`
}

type TokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope?: string
}

/**
 * Cambia el codigo por el token y guarda la cuenta.
 *
 * El `sub` de /v2/userinfo es el id del miembro; el URN del autor se arma con
 * el, que es lo que la Posts API espera en `author`.
 */
export async function exchangeCodeAndStore(
  accountId: string,
  code: string
): Promise<LinkedinAccount> {
  const config = linkedinConfig()
  if (!config) throw new Error("Faltan las credenciales de LinkedIn en el entorno.")

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  })

  const texto = await response.text()
  if (!response.ok) {
    throw new Error(`LinkedIn rechazo el codigo (${response.status}): ${texto.slice(0, 300)}`)
  }

  const token = JSON.parse(texto) as TokenResponse

  const userinfo = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!userinfo.ok) {
    const detalle = await userinfo.text().catch(() => "")
    throw new Error(`No se pudo leer el perfil (${userinfo.status}): ${detalle.slice(0, 300)}`)
  }

  const perfil = (await userinfo.json()) as { sub: string; name?: string }
  const ahora = Date.now()

  const fila = {
    account_id: accountId,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    expires_at: new Date(ahora + token.expires_in * 1000).toISOString(),
    refresh_expires_at: token.refresh_token_expires_in
      ? new Date(ahora + token.refresh_token_expires_in * 1000).toISOString()
      : null,
    person_urn: `urn:li:person:${perfil.sub}`,
    display_name: perfil.name ?? null,
    scope: token.scope ?? LINKEDIN_SCOPES,
    connected_at: new Date().toISOString(),
  }

  const { error } = await supabaseAdmin().from("linkedin_account").upsert(fila)
  if (error) throw new Error(`No se pudo guardar la cuenta: ${error.message}`)

  return fila as LinkedinAccount
}

export async function disconnectLinkedin(accountId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("linkedin_account")
    .delete()
    .eq("account_id", accountId)
  if (error) throw new Error(`No se pudo desconectar: ${error.message}`)
}

// ------------------------------------------------------------------ publicar

export type PublishResult =
  | {
      ok: true
      urn: string
      /** URN de la imagen adjunta, cuando la publicacion llevo una. */
      imageUrn?: string
    }
  | {
      ok: false
      error: string
      /**
       * Por que no salio, cuando quien llama tiene que actuar distinto.
       * `ambiguo`: se envio y no se sabe si llego. Reintentar podria duplicar el
       * post, asi que una pieza programada pasa a Revisar.
       */
      codigo?: "reclamo_perdido" | "recurso" | "ambiguo"
    }

/** El texto tal como se publica: hook, cuerpo y hashtags, en ese orden. */
export function buildCommentary(payload: PiecePayload): string {
  return [payload.hook, payload.body, (payload.hashtags ?? []).join(" ")]
    .filter((parte) => parte && String(parte).trim().length > 0)
    .join("\n\n")
}

export type SubidaResult = { ok: true; urn: string } | { ok: false; error: string }

/**
 * Sube una imagen y devuelve su URN.
 *
 * LinkedIn no acepta una URL: hay que registrar la subida, mandar los bytes a la
 * direccion que devuelve y usar el URN resultante en el post. Tres pasos, y el
 * segundo no va contra api.linkedin.com sino contra un dominio de subida.
 *
 * El texto alternativo no va aqui sino en el post: la subida solo registra los
 * bytes.
 *
 * Devuelve el motivo en vez de `null` a secas. Antes se tragaba el fallo, y el
 * resultado era un post publicado sin imagen sin que quedara rastro de por que:
 * el unico sitio donde se notaba era el feed, cuando ya no habia arreglo.
 */
export async function subirImagen(accountId: string, png: Buffer): Promise<SubidaResult> {
  const account = await getLinkedinAccount(accountId)
  if (!account) return { ok: false, error: "No hay ninguna cuenta de LinkedIn conectada." }

  try {
    const inicio = await fetch(`${IMAGES_URL}?action=initializeUpload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ initializeUploadRequest: { owner: account.person_urn } }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!inicio.ok) {
      const detalle = await inicio.text().catch(() => "")
      return {
        ok: false,
        error: `LinkedIn rechazo el registro de la imagen (${inicio.status}): ${detalle.slice(0, 200)}`,
      }
    }

    const registro = (await inicio.json()) as {
      value?: { uploadUrl?: string; image?: string }
    }
    const uploadUrl = registro.value?.uploadUrl
    const urn = registro.value?.image
    if (!uploadUrl || !urn) {
      return { ok: false, error: "LinkedIn no devolvio direccion de subida ni URN de imagen." }
    }

    const subida = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        "Content-Type": "image/png",
      },
      body: new Uint8Array(png),
      signal: AbortSignal.timeout(45_000),
    })

    if (!subida.ok) {
      const detalle = await subida.text().catch(() => "")
      return {
        ok: false,
        error: `Fallo al subir los bytes de la imagen (${subida.status}): ${detalle.slice(0, 200)}`,
      }
    }

    return { ok: true, urn }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Fallo subiendo la imagen a LinkedIn: ${message}` }
  }
}

/**
 * Publica un texto en el feed del miembro.
 *
 * No lanza: el fallo viaja en el resultado y se guarda en la pieza, para que un
 * error de LinkedIn no tumbe una pasada del pipeline que ya hizo su trabajo.
 */
export async function publishText(
  accountId: string,
  commentary: string,
  imagen?: { urn: string; altText: string } | null
): Promise<PublishResult> {
  const account = await getLinkedinAccount(accountId)
  if (!account) {
    return { ok: false, error: "No hay ninguna cuenta de LinkedIn conectada." }
  }
  if (new Date(account.expires_at).getTime() <= Date.now()) {
    return {
      ok: false,
      error: "El acceso a LinkedIn caduco. Hay que volver a conectar la cuenta.",
    }
  }

  try {
    const response = await fetch(POSTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        author: account.person_urn,
        commentary,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        ...(imagen
          ? { content: { media: { altText: imagen.altText.slice(0, 120), id: imagen.urn } } }
          : {}),
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (response.status !== 201) {
      const detalle = await response.text().catch(() => "")
      return {
        ok: false,
        error: `LinkedIn respondio ${response.status}: ${detalle.slice(0, 400)}`,
        // Un 4xx es un no. Un 5xx puede llegar con el post ya creado.
        ...(response.status >= 500 ? { codigo: "ambiguo" as const } : {}),
      }
    }

    // El id del post viaja en la cabecera, no en el cuerpo. El 201 ya dice que
    // salio: darlo por fallido porque falte el id acababa en un post doble. Sin id
    // la pieza queda publicada, solo que sin enlace al post.
    return { ok: true, urn: response.headers.get("x-restli-id") ?? "" }
  } catch (error) {
    // La peticion se corto (un timeout, la red): pudo llegar o no.
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message, codigo: "ambiguo" }
  }
}

/** La URL publica del post, para poder abrirlo desde la interfaz. */
export function postUrl(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`
}
