/**
 * Publicacion en Instagram via Buffer.
 *
 * Se pasa por Buffer y no por la Graph API de Meta porque esta exige una cuenta
 * business vinculada a una pagina de Facebook, revision de la app y un token de
 * larga duracion que hay que renovar. Buffer ya tiene esa relacion resuelta y
 * expone una sola llamada.
 *
 * Contrato verificado contra la API en vivo, no de memoria: la REST v1 esta
 * retirada para estos tokens ("Public API tokens are not accepted for REST API
 * access") y lo que funciona es el GraphQL de api.buffer.com.
 */

const BUFFER_API = "https://api.buffer.com"

export type BufferChannel = {
  id: string
  name: string
  service: string
  isQueuePaused: boolean
}

export function bufferConfigurado(): boolean {
  return Boolean(process.env.BUFFER_API_KEY)
}

async function consultar<T>(query: string, variables?: unknown): Promise<T> {
  const key = process.env.BUFFER_API_KEY
  if (!key) throw new Error("Falta BUFFER_API_KEY en el entorno.")

  const response = await fetch(BUFFER_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  })

  const cuerpo = (await response.json()) as { data?: T; errors?: { message: string }[] }

  // GraphQL responde 200 aunque falle, asi que el estado HTTP no basta.
  if (cuerpo.errors?.length) {
    throw new Error(cuerpo.errors.map((e) => e.message).join(" | ").slice(0, 400))
  }
  if (!cuerpo.data) throw new Error("Buffer no devolvio datos.")

  return cuerpo.data
}

/** La organizacion del token. Buffer cuelga los canales de ella. */
async function organizationId(): Promise<string | null> {
  const data = await consultar<{
    account?: { organizations?: { id: string; name: string }[] }
  }>(`query { account { organizations { id name } } }`)

  return data.account?.organizations?.[0]?.id ?? null
}

/** Los canales conectados, para poder elegir en cual se publica. */
export async function listarCanales(): Promise<BufferChannel[]> {
  const org = await organizationId()
  if (!org) return []

  const data = await consultar<{ channels?: BufferChannel[] }>(
    `query Canales($input: ChannelsInput!) {
       channels(input: $input) { id name service isQueuePaused }
     }`,
    { input: { organizationId: org } }
  )

  return data.channels ?? []
}

export type BufferResult =
  | { ok: true; postId: string; status: string }
  | { ok: false; error: string }

/**
 * Manda una publicacion con imagenes a Buffer.
 *
 * El carrusel no se declara: se infiere de mandar varias imagenes. Instagram
 * rechaza `type: "carousel"` explicitamente ("Valid types are post, story, or
 * reel"), asi que va como `post` con varios assets. Facebook recibe una sola
 * imagen y el texto largo, que es su formato natural.
 *
 * `red` decide el bloque de `metadata`: Buffer exige el de la red del canal, y
 * mandarle el de Instagram a una pagina de Facebook es un error de validacion.
 *
 * `shareNow` publica en el momento; `addToQueue` lo deja en la cola de Buffer
 * para su siguiente hueco; con `programarPara` (ISO) sale a esa hora exacta
 * (`customScheduled`), que es como publica el estudio.
 *
 * No lanza: el fallo viaja en el resultado, igual que en LinkedIn.
 */
export async function publicarEnBuffer(opciones: {
  channelId: string
  red: RedBuffer
  texto: string
  imagenes: string[]
  ahora?: boolean
  programarPara?: string
  /** Un video (url publica de un MP4): sale como reel en vez de post de imagenes. */
  video?: string
}): Promise<BufferResult> {
  const { channelId, red, texto, imagenes, ahora = true, programarPara, video } = opciones

  if (!video && imagenes.length === 0) {
    return { ok: false, error: "La publicacion no tiene imagenes." }
  }

  // Verificado por introspeccion del esquema de Buffer: `type` es obligatorio en
  // los dos y en Facebook admite post, reel o story. Un video va como reel.
  const tipo = video ? "reel" : "post"
  const metadata =
    red === "instagram"
      ? { instagram: { type: tipo, shouldShareToFeed: true } }
      : { facebook: { type: tipo } }

  try {
    const data = await consultar<{
      createPost?: { __typename: string; post?: { id: string; status: string }; message?: string }
    }>(
      `mutation Publicar($input: CreatePostInput!) {
         createPost(input: $input) {
           __typename
           ... on PostActionSuccess { post { id status } }
           ... on MutationError { message }
         }
       }`,
      {
        input: {
          channelId,
          text: texto,
          assets: video ? [{ video: { url: video } }] : imagenes.map((url) => ({ image: { url } })),
          mode: programarPara ? "customScheduled" : ahora ? "shareNow" : "addToQueue",
          ...(programarPara ? { dueAt: programarPara } : {}),
          schedulingType: "automatic",
          needsApproval: false,
          metadata,
        },
      }
    )

    const resultado = data.createPost
    if (!resultado) return { ok: false, error: "Buffer no devolvio resultado." }

    if (resultado.__typename === "PostActionSuccess" && resultado.post) {
      return { ok: true, postId: resultado.post.id, status: resultado.post.status }
    }

    // Los errores vienen dentro de la respuesta, con su propio __typename.
    return {
      ok: false,
      error: resultado.message ?? `Buffer devolvio ${resultado.__typename}.`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

export type RedBuffer = "instagram" | "facebook"

/**
 * El canal en el que publica una cuenta en cada red.
 *
 * Viven en `accounts` y se ponen desde la interfaz. Antes era una variable de
 * entorno, que funcionaba mientras hubo una sola cuenta y dejo de servir en
 * cuanto hubo dos: una variable no distingue cuentas, y el error seria publicar
 * el contenido de una en las redes de la otra.
 *
 * Es el id que aparece en la URL del canal en Buffer:
 *
 *   https://publish.buffer.com/channels/<id>/schedule
 *
 * Sin configurar devuelve `null` y no se publica. No cae al primer canal que
 * haya a proposito: adivinar la cuenta ajena es peor que parar.
 */
export async function resolverCanal(accountId: string, red: RedBuffer): Promise<string | null> {
  const { cuentaPorId } = await import("../accounts")
  const cuenta = await cuentaPorId(accountId)
  const canal = (
    red === "instagram" ? cuenta?.buffer_instagram_channel_id : cuenta?.buffer_facebook_channel_id
  )?.trim()
  return canal && canal.length > 0 ? canal : null
}
