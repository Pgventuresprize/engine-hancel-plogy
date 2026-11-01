import { kitActivo } from "../marca/kit"
import { supabaseAdmin } from "../supabase-admin"
import { generarCarrusel, nichosConocidos, noticiaDelAngulo, type CarouselPayload } from "./carousel"
import { dibujarMaqueta } from "./kit-carrusel"
import { claveKit, parseEstadoLibre } from "./kit-libre-pasos"
import { estiloDesdeConfig } from "./theme"

/**
 * Vuelve a dibujar las imagenes de un carrusel tal como esta guardado, sin
 * cambiar nada: ni el reparto en plantillas, ni el diseño, ni las fotos.
 *
 * Es lo contrario de "Regenerar", que vuelve a maquetar y pide otras fotos. Lo
 * usa el chat: lo que se ve en el panel es lo que sale en las imagenes al
 * aprobar o descargar.
 *
 *   - Con plantillas del kit (o mecanico): de su maqueta guardada.
 *   - Con diseño libre: de su fuente, con sus fotos.
 *
 * Una pieza de antes de que se guardara su maqueta, o dibujada con otro kit, no
 * se puede redibujar igual: lanza y hay que regenerarla.
 */
export async function dibujarDesdeFuente(accountId: string, pieceId: string): Promise<CarouselPayload> {
  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from("content_pieces")
    .select("id, network, payload, job_instagram_id, content_angle_id, published_at")
    .eq("id", pieceId)
    .eq("account_id", accountId)
    .single()
  if (error || !data) throw new Error("No se encontró la pieza.")
  const pieza = data as {
    id: string
    network: string
    payload: CarouselPayload
    job_instagram_id: string | null
    content_angle_id: string
    published_at: string | null
  }
  if (pieza.network !== "instagram") throw new Error("Solo los carruseles se dibujan.")
  if (pieza.published_at) throw new Error("La pieza ya está publicada: lo publicado no se toca.")
  if (!pieza.job_instagram_id) throw new Error("Esta pieza no conserva el guion del que salió.")

  const [{ data: job }, kc, { data: hermana }] = await Promise.all([
    supabase.from("jobs_instagram").select("respuesta").eq("id", pieza.job_instagram_id).single(),
    kitActivo(accountId),
    supabase
      .from("content_pieces")
      .select("id, payload")
      .eq("job_instagram_id", pieza.job_instagram_id)
      .eq("network", "facebook")
      .is("published_at", null)
      .maybeSingle(),
  ])
  if (!job) throw new Error("No se encontró el guion original.")
  if (!kc) throw new Error("La marca no tiene un kit activo.")
  const respuesta = (job as { respuesta: Record<string, unknown> }).respuesta

  let dibujo: Pick<CarouselPayload, "images" | "portadaFacebook" | "problemasDibujo">
  const libre = parseEstadoLibre(respuesta?.diseno_libre)
  if (pieza.payload.modoDiseno === "inteligencia") {
    if (libre?.paso !== "listo" || libre.kit !== claveKit(kc))
      throw new Error("El diseño con inteligencia de esta pieza ya no está o es de otro kit: hay que regenerarla.")
    // Con el diseño listo y del mismo kit, generarCarrusel lo dibuja de su
    // fuente y con sus fotos: no rediseña ni elige otras.
    const { data: cfg } = await supabase.from("generation_config").select("carousel").eq("account_id", accountId).maybeSingle()
    const estilo = estiloDesdeConfig((cfg as { carousel?: unknown } | null)?.carousel)
    const hecho = await generarCarrusel(
      pieza.job_instagram_id,
      accountId,
      respuesta,
      await noticiaDelAngulo(pieza.content_angle_id),
      { ...estilo, diseno: "inteligencia" },
      await nichosConocidos(accountId),
      Boolean(hermana)
    )
    dibujo = { images: hecho.images, portadaFacebook: hecho.portadaFacebook, problemasDibujo: hecho.problemasDibujo }
  } else if (pieza.payload.maqueta) {
    dibujo = await dibujarMaqueta(pieza.job_instagram_id, accountId, kc, pieza.payload.maqueta, Boolean(hermana))
  } else {
    throw new Error("Esta pieza es de antes de que se guardara cómo se maquetó: hay que regenerarla una vez.")
  }

  const payload: CarouselPayload = {
    ...pieza.payload,
    images: dibujo.images,
    ...(dibujo.portadaFacebook ? { portadaFacebook: dibujo.portadaFacebook } : {}),
    problemasDibujo: dibujo.problemasDibujo,
  }
  if (!payload.problemasDibujo?.length) delete payload.problemasDibujo
  const { error: errorGuardar } = await supabase
    .from("content_pieces")
    .update({ payload, publish_error: null })
    .eq("id", pieceId)
    .eq("account_id", accountId)
  if (errorGuardar) throw new Error(errorGuardar.message)

  // La de Facebook del mismo carrusel lleva su portada: si se redibujo, cambia.
  const portadaFb = dibujo.portadaFacebook ?? dibujo.images[0]
  if (hermana && portadaFb) {
    const h = hermana as { id: string; payload: Record<string, unknown> }
    await supabase.from("content_pieces").update({ payload: { ...h.payload, image: portadaFb } }).eq("id", h.id)
  }
  return payload
}
