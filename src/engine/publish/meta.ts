import { ejecutar, estadoConexion } from "../composio/conexiones"
import { guardarSecretos, secretosDe } from "../secretos"
import { supabaseAdmin } from "../supabase-admin"

/**
 * Publicacion en Facebook e Instagram con las conexiones de Composio de cada
 * empresa (reemplaza a Buffer). LinkedIn sigue por su API nativa.
 *
 * - Facebook publica en una pagina: la que la empresa eligio al conectar.
 *   Un carrusel sale como un post con todas sus fotos; un video, como video.
 * - Instagram publica en la cuenta business conectada. Un carrusel se arma con
 *   sus laminas en JPEG (Instagram no acepta PNG); un video sale como reel.
 *
 * Composio publica en el acto, sin programar: la hora la pone quien llama (el
 * tick de publicacion, que corre cada cinco minutos).
 *
 * No lanza: el fallo viaja en el resultado.
 */

export type ResultadoPublicacion = { ok: true; postId: string } | { ok: false; error: string }

const BUCKET = "carousels"

/** Busca un id en la respuesta de Composio, que a veces lo anida en `data`. */
function idDe(x: unknown): string | null {
  if (!x || typeof x !== "object") return null
  const o = x as Record<string, unknown>
  for (const k of ["id", "post_id", "creation_id", "media_id", "video_id"]) {
    if (typeof o[k] === "string" || typeof o[k] === "number") return String(o[k])
  }
  for (const k of ["data", "response_data", "result"]) {
    const dentro = idDe(o[k])
    if (dentro) return dentro
  }
  return null
}

// ------------------------------------------------------------------ facebook

export type PaginaFacebook = { id: string; name: string }

/** Las paginas de Facebook que maneja la cuenta conectada de la empresa. */
export async function paginasFacebook(accountId: string): Promise<{ ok: true; paginas: PaginaFacebook[] } | { ok: false; error: string }> {
  const r = await ejecutar<{ data?: { id: string; name: string }[] } & Record<string, unknown>>(accountId, "facebook", "FACEBOOK_LIST_MANAGED_PAGES", {
    fields: "id,name",
    limit: 50,
  })
  if (!r.ok) return r
  const lista = (Array.isArray(r.data.data) ? r.data.data : Array.isArray((r.data as { pages?: unknown }).pages) ? (r.data as { pages: PaginaFacebook[] }).pages : []) as PaginaFacebook[]
  return { ok: true, paginas: lista.filter((p) => p?.id).map((p) => ({ id: String(p.id), name: String(p.name ?? p.id) })) }
}

/** Guarda la pagina en la que publica la empresa. */
export async function elegirPaginaFacebook(accountId: string, pagina: PaginaFacebook) {
  await guardarSecretos(accountId, { facebook_page_id: pagina.id, facebook_page_name: pagina.name })
}

export async function publicarFacebook(
  accountId: string,
  opciones: { texto: string; imagenes?: string[]; video?: string; titulo?: string }
): Promise<ResultadoPublicacion> {
  const pagina = (await secretosDe(accountId)).facebook_page_id
  if (!pagina) return { ok: false, error: "Falta elegir la página de Facebook en Configuración > Conexiones." }
  const existente = await yaPublicado(accountId, "facebook", opciones.texto)
  if (existente) return { ok: true, postId: existente }

  if (opciones.video) {
    const r = await ejecutar(accountId, "facebook", "FACEBOOK_CREATE_VIDEO_POST", {
      page_id: pagina,
      file_url: opciones.video,
      description: opciones.texto,
      ...(opciones.titulo ? { title: opciones.titulo.slice(0, 250) } : {}),
      published: true,
    }, 280_000)
    if (!r.ok) return r
    return { ok: true, postId: idDe(r.data) ?? "publicado" }
  }

  const imagenes = (opciones.imagenes ?? []).filter(Boolean)
  if (imagenes.length === 0) return { ok: false, error: "La publicación no tiene imágenes." }
  const r = await ejecutar(accountId, "facebook", "FACEBOOK_CREATE_MULTI_PHOTO_POST", {
    page_id: pagina,
    photo_urls: imagenes.slice(0, 30),
    message: opciones.texto,
  }, 200_000)
  if (!r.ok) return r
  return { ok: true, postId: idDe(r.data) ?? "publicado" }
}

// ----------------------------------------------------------------- instagram

/** La cuenta de Instagram conectada (id y usuario); se guarda la primera vez. */
export async function cuentaInstagram(accountId: string): Promise<{ ok: true; id: string; usuario: string | null } | { ok: false; error: string }> {
  const s = await secretosDe(accountId)
  if (s.instagram_user_id) return { ok: true, id: s.instagram_user_id, usuario: s.instagram_username }
  const r = await ejecutar<Record<string, unknown>>(accountId, "instagram", "INSTAGRAM_GET_USER_INFO", { ig_user_id: "me", fields: "id,username" })
  if (!r.ok) return r
  const id = idDe(r.data)
  if (!id) return { ok: false, error: "Instagram no devolvió el id de la cuenta business." }
  const usuario = typeof r.data.username === "string" ? r.data.username : typeof (r.data.data as Record<string, unknown> | undefined)?.username === "string" ? String((r.data.data as Record<string, unknown>).username) : null
  await guardarSecretos(accountId, { instagram_user_id: id, instagram_username: usuario })
  return { ok: true, id, usuario }
}

/**
 * Las laminas en JPEG, que es lo unico que Instagram acepta en un carrusel. Se
 * convierten con sharp y se dejan junto a las PNG en el storage.
 */
async function aJpeg(urls: string[]): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }> {
  const sharp = (await import("sharp")).default
  const supabase = supabaseAdmin()
  const salida: string[] = []
  for (const url of urls) {
    if (/\.jpe?g(\?|$)/i.test(url)) {
      salida.push(url)
      continue
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) return { ok: false, error: `No se pudo bajar una lámina (${res.status}).` }
      const jpg = await sharp(Buffer.from(await res.arrayBuffer())).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer()
      const ruta = `jpeg/${new URL(url).pathname.split("/carousels/").pop()?.replace(/\.[a-z]+$/i, "") ?? Date.now().toString(36)}.jpg`
      const { error } = await supabase.storage.from(BUCKET).upload(ruta, jpg, { contentType: "image/jpeg", upsert: true })
      if (error) return { ok: false, error: `No se pudo guardar la lámina en JPEG: ${error.message}` }
      salida.push(supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  return { ok: true, urls: salida }
}

export async function publicarInstagram(
  accountId: string,
  opciones: { texto: string; imagenes?: string[]; video?: string }
): Promise<ResultadoPublicacion> {
  const cuenta = await cuentaInstagram(accountId)
  if (!cuenta.ok) return cuenta
  const ig = cuenta.id
  const caption = opciones.texto.slice(0, 2200)
  const existente = await yaPublicado(accountId, "instagram", caption)
  if (existente) return { ok: true, postId: existente }

  let contenedor: string | null = null
  if (opciones.video) {
    const c = await ejecutar(accountId, "instagram", "INSTAGRAM_POST_IG_USER_MEDIA", {
      ig_user_id: ig,
      media_type: "REELS",
      video_url: opciones.video,
      caption,
      share_to_feed: true,
    }, 120_000)
    if (!c.ok) return c
    contenedor = idDe(c.data)
  } else {
    const imagenes = (opciones.imagenes ?? []).filter(Boolean).slice(0, 10)
    if (imagenes.length === 0) return { ok: false, error: "La publicación no tiene imágenes." }
    const jpg = await aJpeg(imagenes)
    if (!jpg.ok) return jpg
    const c =
      jpg.urls.length >= 2
        ? await ejecutar(accountId, "instagram", "INSTAGRAM_CREATE_CAROUSEL_CONTAINER", { ig_user_id: ig, child_image_urls: jpg.urls, caption }, 180_000)
        : await ejecutar(accountId, "instagram", "INSTAGRAM_POST_IG_USER_MEDIA", { ig_user_id: ig, image_url: jpg.urls[0], caption }, 120_000)
    if (!c.ok) return c
    contenedor = idDe(c.data)
  }
  if (!contenedor) return { ok: false, error: "Instagram no devolvió el contenedor de la publicación." }

  // Publicar espera a que Instagram termine de procesar (un reel tarda).
  const p = await ejecutar(accountId, "instagram", "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", {
    ig_user_id: ig,
    creation_id: contenedor,
    max_wait_seconds: opciones.video ? 240 : 90,
  }, 280_000)
  if (!p.ok) return p
  return { ok: true, postId: idDe(p.data) ?? contenedor }
}

// ---------------------------------------------------------- ya publicado

/** Las primeras palabras de un texto, para reconocer un post por su texto. */
function huella(texto: string): string {
  return texto.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 90)
}

/** Cuanto atras se mira si un texto ya salio. */
const VENTANA_DUPLICADO_MS = 6 * 3_600_000

/**
 * Si ese mismo texto ya se publico en la red hace poco, el id del post.
 *
 * Publicar en Instagram por Composio tarda: crear el contenedor y esperar a que
 * Instagram lo procese puede pasar del minuto. Si el proceso se corta con el
 * post ya fuera, la pieza queda como no publicada y la siguiente pasada la
 * publicaba otra vez: asi salio dos veces la noticia de los bananeros. Antes de
 * publicar se mira la red; si ya esta, no se repite.
 */
export async function yaPublicado(accountId: string, red: "instagram" | "facebook", texto: string): Promise<string | null> {
  const buscado = huella(texto)
  if (buscado.length < 20) return null
  const desde = Date.now() - VENTANA_DUPLICADO_MS
  try {
    if (red === "instagram") {
      const cuenta = await cuentaInstagram(accountId)
      if (!cuenta.ok) return null
      const r = await ejecutar(accountId, "instagram", "INSTAGRAM_GET_IG_USER_MEDIA", { ig_user_id: cuenta.id, limit: 15, fields: "id,timestamp,caption" }, 30_000)
      if (!r.ok) return null
      const lista = ((r.data as { data?: { id: string; timestamp?: string; caption?: string }[] }).data ?? [])
      const igual = lista.find((m) => m.caption && huella(m.caption) === buscado && (!m.timestamp || new Date(m.timestamp).getTime() >= desde))
      return igual?.id ?? null
    }
    const pagina = (await secretosDe(accountId)).facebook_page_id
    if (!pagina) return null
    const r = await ejecutar(accountId, "facebook", "FACEBOOK_GET_PAGE_POSTS", { page_id: pagina, limit: 15, fields: "id,created_time,message" }, 30_000)
    if (!r.ok) return null
    const lista = ((r.data as { data?: { id: string; created_time?: string; message?: string }[] }).data ?? [])
    const igual = lista.find((m) => m.message && huella(m.message) === buscado && (!m.created_time || new Date(m.created_time).getTime() >= desde))
    return igual?.id ?? null
  } catch {
    // Si no se puede mirar, se publica: perder un post es peor que no poder comprobarlo.
    return null
  }
}

/** Publica en una red con la conexion de la empresa. */
export async function publicarEnRed(
  accountId: string,
  red: "instagram" | "facebook",
  opciones: { texto: string; imagenes?: string[]; video?: string; titulo?: string }
): Promise<ResultadoPublicacion> {
  return red === "instagram" ? publicarInstagram(accountId, opciones) : publicarFacebook(accountId, opciones)
}

/**
 * Si la empresa puede publicar en cada red: Instagram conectado; Facebook
 * conectado y con la pagina elegida.
 */
export async function redesMetaListas(accountId: string): Promise<{ instagram: boolean; facebook: boolean }> {
  const [ig, fb, s] = await Promise.all([estadoConexion(accountId, "instagram"), estadoConexion(accountId, "facebook"), secretosDe(accountId)])
  return { instagram: ig.conectado, facebook: fb.conectado && Boolean(s.facebook_page_id) }
}
