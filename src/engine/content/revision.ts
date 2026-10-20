import { modeloDe } from "../agents/modelos"
import { promptPara } from "../agents/prompts"
import { armarPublicacionFacebook } from "../render/facebook"
import { supabaseAdmin } from "../supabase-admin"
import {
  contextoDeRevision,
  corregirCarrusel,
  corregirPost,
  revisarCarruselGuardado,
  revisarPostGuardado,
  situacionDe,
} from "./agentes"
import { armarRevision, parseRevision, type Arreglo, type Revision } from "./revisor"
import type { LinkedinJobInput } from "./types"

/**
 * La revision de las piezas ya guardadas: la que se copia al crear la pieza,
 * la de "Revisar de nuevo" y la de "Corregir".
 *
 * El guion vive en el buzon y la pieza guarda lo que se publica, asi que cada
 * cambio de texto se escribe en los dos sitios: si solo cambiara la pieza, la
 * siguiente regeneracion volveria al texto viejo.
 */

type Red = "instagram" | "facebook" | "linkedin"
const esCarrusel = (red: string) => red === "instagram" || red === "facebook"

/**
 * La revision con la que nace una pieza: la que dejo el agente al escribirla
 * o, en un trabajo de antes del revisor, una nueva. Nunca tumba la pieza: sin
 * revision la pieza sale igual, solo que sin avisos.
 */
export async function revisionDeRespuesta(
  accountId: string,
  red: Red,
  respuesta: unknown,
  input: LinkedinJobInput
): Promise<Revision | null> {
  const dejada = parseRevision((respuesta as Record<string, unknown> | null)?.revision)
  if (dejada) return dejada
  try {
    const ctx = await contextoDeRevision(accountId, input)
    const r = esCarrusel(red)
      ? revisarCarruselGuardado(respuesta, input, ctx)
      : revisarPostGuardado(respuesta, ctx, input.variables.longitud)
    return armarRevision(r.hallazgos, r.arreglos, r.correcciones)
  } catch (e) {
    console.error("[revisor] No se pudo revisar la pieza:", e instanceof Error ? e.message : e)
    return null
  }
}

type Pieza = {
  id: string
  network: string
  payload: Record<string, unknown>
  published_at: string | null
  job_instagram_id: string | null
  job_linkedin_id: string | null
}

type Trabajo = { id: string; input: LinkedinJobInput; respuesta: unknown }

async function piezaYTrabajo(accountId: string, pieceId: string): Promise<{ pieza: Pieza; trabajo: Trabajo; tabla: "jobs_instagram" | "jobs_linkedin" }> {
  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from("content_pieces")
    .select("id, network, payload, published_at, job_instagram_id, job_linkedin_id")
    .eq("id", pieceId)
    .eq("account_id", accountId)
    .single()
  if (error || !data) throw new Error("No se encontró la pieza.")
  const pieza = data as Pieza

  const tabla = esCarrusel(pieza.network) ? "jobs_instagram" : "jobs_linkedin"
  const jobId = esCarrusel(pieza.network) ? pieza.job_instagram_id : pieza.job_linkedin_id
  if (!jobId) throw new Error("Esta pieza no conserva el guion del que salió.")
  const { data: job } = await supabase.from(tabla).select("id, input, respuesta").eq("id", jobId).single()
  if (!job) throw new Error("No se encontró el guion original.")
  return { pieza, trabajo: job as Trabajo, tabla }
}

/**
 * Escribe un guion de carrusel nuevo (corregido o con arreglos) en el buzon y
 * en las piezas que salieron de el y no se publicaron: el caption y los
 * hashtags en la de Instagram, el texto entero en la de Facebook.
 */
async function guardarCarrusel(
  accountId: string,
  trabajo: Trabajo,
  respuesta: unknown,
  revision: Revision,
  /** Si el texto no cambio, solo se escribe la revision: asi no se pisa lo editado a mano. */
  cambioElTexto = true
): Promise<string | null> {
  const supabase = supabaseAdmin()
  const { error } = await supabase.from("jobs_instagram").update({ respuesta }).eq("id", trabajo.id)
  if (error) throw new Error(error.message)

  const { parseInstagramResponse } = await import("../render/carousel")
  const { caption, hashtags, slides } = parseInstagramResponse(respuesta)

  const { data: hermanas } = await supabase
    .from("content_pieces")
    .select("id, network, payload, published_at")
    .eq("account_id", accountId)
    .eq("job_instagram_id", trabajo.id)
  let carrusel: string | null = null
  for (const h of (hermanas ?? []) as Pick<Pieza, "id" | "network" | "payload" | "published_at">[]) {
    // Lo publicado no se toca: ya no es lo que dice el guion, es lo que salio.
    if (h.published_at) continue
    const payload = !cambioElTexto
      ? h.payload
      : h.network === "facebook"
        ? { ...h.payload, ...armarPublicacionFacebook({ slides, caption, hashtags, portada: String(h.payload.image ?? "") }) }
        : { ...h.payload, caption, hashtags }
    await supabase.from("content_pieces").update({ payload, revision }).eq("id", h.id)
    if (h.network === "instagram") carrusel = h.id
  }
  return carrusel
}

async function guardarPost(trabajo: Trabajo, pieza: Pieza, respuesta: Record<string, unknown>, revision: Revision) {
  const supabase = supabaseAdmin()
  const { error } = await supabase.from("jobs_linkedin").update({ respuesta }).eq("id", trabajo.id)
  if (error) throw new Error(error.message)
  const payload = pieza.published_at ? pieza.payload : { ...pieza.payload, body: respuesta.post, hook: null }
  await supabase.from("content_pieces").update({ payload, revision }).eq("id", pieza.id)
}

const claveArreglo = (a: Arreglo) => `${a.regla}|${a.donde}|${a.detalle}`

/**
 * En LinkedIn manda el texto de la pieza, no el del buzon: es el que se edita a
 * mano en la ficha y el que se publica.
 */
function postDeLaPieza(pieza: Pieza, trabajo: Trabajo): Record<string, unknown> {
  const respuesta = (trabajo.respuesta ?? {}) as Record<string, unknown>
  const body = typeof pieza.payload.body === "string" && pieza.payload.body.trim() ? pieza.payload.body : respuesta.post
  return { ...respuesta, post: body }
}

/**
 * Vuelve a pasar el revisor con la marca de ahora, sin IA. Lo mecanico que
 * encuentre se arregla en el texto; en un carrusel, las imagenes lo recogen al
 * regenerarlas, y por eso se devuelve si hace falta.
 */
/** `redibujar` es el carrusel cuyas imagenes ya no dicen lo que dice el guion, si lo hay. */
type Resultado = { revision: Revision; redibujar: string | null }

export async function revisarPieza(accountId: string, pieceId: string): Promise<Resultado> {
  const { pieza, trabajo } = await piezaYTrabajo(accountId, pieceId)
  const ctx = await contextoDeRevision(accountId, trabajo.input)
  const previa = parseRevision((trabajo.respuesta as Record<string, unknown> | null)?.revision)
  const yaEstaban = new Set((previa?.arreglos ?? []).map(claveArreglo))

  if (esCarrusel(pieza.network)) {
    const r = revisarCarruselGuardado(trabajo.respuesta, trabajo.input, ctx)
    const nuevos = r.arreglos.filter((a) => !yaEstaban.has(claveArreglo(a)))
    const revision = armarRevision(r.hallazgos, r.arreglos, r.correcciones)
    const carrusel = await guardarCarrusel(
      accountId,
      trabajo,
      { ...(r.version as Record<string, unknown>), revision },
      revision,
      nuevos.length > 0
    )
    const enLasLaminas = nuevos.some((a) => a.donde.startsWith("lámina") || a.donde.startsWith("cierre"))
    return { revision, redibujar: enLasLaminas ? carrusel : null }
  }

  const respuesta = postDeLaPieza(pieza, trabajo)
  const r = revisarPostGuardado(respuesta, ctx, trabajo.input.variables.longitud)
  const revision = armarRevision(r.hallazgos, r.arreglos, r.correcciones)
  await guardarPost(trabajo, pieza, { ...respuesta, post: r.version.post, revision }, revision)
  return { revision, redibujar: null }
}

/**
 * Manda la pieza al agente con el pedido exacto de lo que encontro el revisor,
 * frenos y avisos. Cuesta una llamada a Claude. En un carrusel el texto nuevo
 * hay que dibujarlo: lo hace quien llama, regenerando las imagenes.
 */
export async function corregirPieza(accountId: string, pieceId: string): Promise<Resultado> {
  const { pieza, trabajo } = await piezaYTrabajo(accountId, pieceId)
  if (pieza.published_at) throw new Error("La pieza ya está publicada: lo publicado no se corrige.")
  const ctx = await contextoDeRevision(accountId, trabajo.input)

  if (esCarrusel(pieza.network)) {
    const actual = revisarCarruselGuardado(trabajo.respuesta, trabajo.input, ctx)
    if (actual.hallazgos.length === 0) throw new Error("El revisor no encuentra nada que corregir.")
    const [model, system] = await Promise.all([modeloDe(accountId, "instagram"), promptPara(accountId, "instagram", situacionDe(trabajo.input))])
    const r = await corregirCarrusel(accountId, trabajo.input, model, system, actual, "manual", ctx)
    const revision = parseRevision((r.respuesta as Record<string, unknown>).revision)!
    return { revision, redibujar: await guardarCarrusel(accountId, trabajo, r.respuesta, revision) }
  }

  const actual = revisarPostGuardado(postDeLaPieza(pieza, trabajo), ctx, trabajo.input.variables.longitud)
  if (actual.hallazgos.length === 0) throw new Error("El revisor no encuentra nada que corregir.")
  const [model, system] = await Promise.all([modeloDe(accountId, "linkedin"), promptPara(accountId, "linkedin", situacionDe(trabajo.input))])
  const r = await corregirPost(accountId, trabajo.input, model, system, actual, "manual", ctx)
  await guardarPost(trabajo, pieza, r.respuesta, r.respuesta.revision)
  return { revision: r.respuesta.revision, redibujar: null }
}
