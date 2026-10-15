import { supabaseAdmin } from "../supabase-admin"

/**
 * La busqueda web del motor, via Composio.
 *
 * Es quien sale a internet, no el modelo. Antes el analisis le daba a Claude la
 * herramienta de busqueda y cada noticia arrastraba los resultados enteros al
 * contexto; ahora Composio devuelve un texto ya sintetizado y el agente solo lo
 * lee. Mucho mas barato en tokens y con el mismo material.
 *
 * La clave sale del entorno o de `engine_secrets`, nunca del codigo: estuvo
 * escrita a mano en el fuente y acabo publicada en el repositorio.
 */

const EJECUTAR = "https://backend.composio.dev/api/v3.1/tools/execute/COMPOSIO_SEARCH_WEB"

const TIMEOUT_MS = 45_000

async function claveComposio(): Promise<string | null> {
  if (process.env.COMPOSIO_API_KEY) return process.env.COMPOSIO_API_KEY

  const { data } = await supabaseAdmin()
    .from("engine_secrets")
    .select("composio_api_key")
    .eq("id", true)
    .maybeSingle()

  const clave = (data as { composio_api_key: string | null } | null)?.composio_api_key
  return clave?.trim() || null
}

/** Una fuente que cita la busqueda: de donde sale cada dato del texto. */
export type CitaWeb = {
  url: string
  titulo: string | null
  autor: string | null
  fecha: string | null
  imagen: string | null
}

/**
 * Busca en la web y devuelve el texto sintetizado con sus citas.
 *
 * El texto trae marcas [1], [2]... que apuntan a `citas` en el mismo orden.
 * Antes solo se guardaba el texto y las fuentes se perdian; la redaccion las
 * necesita para atribuir cada dato.
 */
export async function investigarEnLaWeb(consulta: string): Promise<{ texto: string; citas: CitaWeb[] } | null> {
  const clave = await claveComposio()
  if (!clave) return null

  try {
    const res = await fetch(EJECUTAR, {
      method: "POST",
      headers: { "x-api-key": clave, "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: "default", arguments: { query: consulta } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null

    const json = (await res.json()) as {
      data?: {
        answer?: string
        citations?: { url?: string; id?: string; title?: string; author?: string; publishedDate?: string; image?: string }[]
      }
    }
    const texto = json.data?.answer?.trim()
    if (!texto) return null
    const citas = (json.data?.citations ?? [])
      .map((c) => ({
        url: (c.url || c.id || "").trim(),
        titulo: c.title?.trim() || null,
        autor: c.author?.trim() || null,
        fecha: c.publishedDate?.trim() || null,
        imagen: c.image?.trim() || null,
      }))
      .filter((c) => /^https?:\/\//.test(c.url))
    return { texto, citas }
  } catch {
    return null
  }
}

/**
 * Busca en la web y devuelve el texto sintetizado.
 *
 * `null` si no hay clave o si la busqueda no trae nada: quien llama decide que
 * hacer, y en el analisis eso significa trabajar solo con el titular y el
 * snippet en vez de fallar la noticia entera.
 */
export async function buscarEnLaWeb(consulta: string): Promise<string | null> {
  const clave = await claveComposio()
  if (!clave) return null

  try {
    const res = await fetch(EJECUTAR, {
      method: "POST",
      headers: { "x-api-key": clave, "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: "default", arguments: { query: consulta } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) return null

    const json = (await res.json()) as { data?: { answer?: string } }
    const texto = json.data?.answer?.trim()
    return texto && texto.length > 0 ? texto : null
  } catch {
    // Una busqueda caida no puede tumbar el analisis: se sigue con el snippet.
    return null
  }
}
