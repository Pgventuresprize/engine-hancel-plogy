import type { ContentPiece } from "../content/types"
import { supabaseAdmin } from "../supabase-admin"
import { nichosConocidos } from "../render/carousel"
import { terminosDeBusqueda } from "../render/keywords"
import { BancoDeFotos, descargarFotoPexels, pexelsConfigurado } from "../render/pexels"
import { descargarFoto, renderTarjetaLinkedin } from "../render/render"
import { estiloDesdeConfig } from "../render/theme"
import type { RawNews } from "@/lib/types"
import { publicarFacebook, publicarInstagram } from "./meta"
import { buildCommentary, publishText, subirImagen, type PublishResult } from "./linkedin"

/**
 * El freno, escrito para PostgREST. Sale si alguien la aprobo, o si es de la cola
 * general y el revisor no la freno; las de antes del revisor no tienen revision y
 * salen como siempre. Lo creado desde el chat es un borrador que alguien pidio:
 * sin aprobar no sale, ni en una tanda a mano. Lo comparten las tandas y el
 * calendario, y `sinFreno` (calendario/decidir.ts) es la misma regla en codigo.
 */
export const FRENO_PIEZA = "status.eq.approved,and(carril.eq.general,or(revision.is.null,revision->>frena.eq.false))"

/**
 * Lo que el calendario vio al decidir publicar una pieza. El reclamo lo compara
 * con la fila: si alguien la movio, la edito, la freno o la quito mientras tanto,
 * no coincide y no sale. Asi una lista leida hace un minuto no le gana a una persona.
 */
export type GuardaProgramada = {
  programadaPara: string
  intentos: number
  contenidoCambiadoAt: string | null
}

/**
 * Publica una pieza y anota el resultado en su fila.
 *
 * La guarda contra publicar dos veces es el reclamo atomico sobre `published_at`.
 * Sin `guarda` publica lo que le pidan: es el boton, una persona delante. Con
 * `guarda` sale sola, y por eso es estricta en todo lo que el boton deja pasar.
 */
export async function publishPiece(pieceId: string, opciones: { guarda?: GuardaProgramada } = {}): Promise<PublishResult> {
  const supabase = supabaseAdmin()
  const { guarda } = opciones

  // El recurso sale antes que la pieza: un carrusel que pide comentar una
  // palabra sin el recurso publicado deja a quien comenta sin nada que leer.
  const falta = await recursoSinPublicar(pieceId, Boolean(guarda))
  if (falta) return { ok: false, error: falta, codigo: "recurso" }

  // Reclamo atomico ANTES de publicar. El error anterior era un check-then-act:
  // se leia published_at, se veia null, se publicaba y despues se marcaba. Los
  // triggers disparan varios ticks casi a la vez, y todos veian null antes de
  // que ninguno escribiera, asi que la misma pieza salia a Buffer cuatro o
  // cinco veces. Aqui `published_at` se pone en el mismo UPDATE que comprueba
  // que estaba vacio: la base garantiza que solo una pasada gana la fila.
  const marca = new Date().toISOString()
  let reclamo = supabase
    .from("content_pieces")
    .update({
      status: "publishing",
      published_at: marca,
      // El intento se cuenta aqui y no al fallar: un proceso que muere tambien gasta uno.
      ...(guarda ? { programada_intentos: guarda.intentos + 1 } : {}),
    })
    .eq("id", pieceId)
    .is("published_at", null)
    .neq("status", "rejected")
    // Puede haber salido ya: nada la publica hasta que alguien lo resuelva, ni a mano.
    .eq("programada_revisar", false)
  if (guarda) {
    reclamo = reclamo
      .eq("programada_para", guarda.programadaPara)
      .eq("programada_intentos", guarda.intentos)
      .in("status", ["generated", "approved"])
      .or(FRENO_PIEZA)
    reclamo = guarda.contenidoCambiadoAt
      ? reclamo.eq("contenido_cambiado_at", guarda.contenidoCambiadoAt)
      : reclamo.is("contenido_cambiado_at", null)
  }
  const { data: reclamada, error: errorReclamo } = await reclamo.select("*").maybeSingle()

  // El error del UPDATE no se puede tragar: si la base rechaza el reclamo (un
  // CHECK que no admite 'publishing', un trigger que falla) y se ignora, cada
  // pasada lo confunde con "otra se adelanto" y la pieza no sale nunca, sin
  // dejar rastro del motivo. Justo eso paro la publicacion entera una vez.
  if (errorReclamo) {
    return { ok: false, error: `No se pudo reclamar la pieza para publicar: ${errorReclamo.message}` }
  }

  if (!reclamada) {
    // O ya se publico, o esta rechazada, o otra pasada la tomo en esta misma
    // rafaga, o (con guarda) cambio desde que se leyo. No hay nada que hacer aqui.
    return { ok: false, error: "La pieza ya se publico o la tomo otra pasada.", codigo: "reclamo_perdido" }
  }

  const piece = reclamada as ContentPiece & { published_at: string | null; linkedin_urn: string | null }

  // Cada red se publica por su via: LinkedIn contra su propia API; Instagram y
  // Facebook con las conexiones de Composio de la empresa.
  const result =
    piece.network === "instagram"
      ? await publicarCarrusel(piece, Boolean(guarda))
      : piece.network === "facebook"
        ? await publicarEnFacebook(piece)
        : await publicarEnLinkedin(piece)

  if (result.ok) {
    await supabase
      .from("content_pieces")
      .update({
        status: "published",
        published_at: marca,
        // La columna guarda el identificador del post publicado, sea de la red
        // que sea: el URN de LinkedIn o el id que devuelve Buffer.
        linkedin_urn: result.urn || null,
        // Queda anotado que el post salio ilustrado, que es la unica forma de
        // comprobarlo despues sin abrir el feed.
        ...(result.imageUrn ? { image_urn: result.imageUrn } : {}),
        publish_error: null,
      })
      .eq("id", pieceId)
  } else {
    // La publicacion fallo, asi que se suelta el reclamo: published_at vuelve a
    // null para que un reintento pueda tomarla, y el error queda a la vista. Vuelve
    // al estado que tenia: perder la aprobacion por un fallo de la red dejaba una
    // pieza frenada sin poder reintentarse. Solo si sigue en 'publishing': si la
    // rechazaron mientras salia, soltarla asi la reviviria.
    //
    // Si no se sabe si salio y esta en el calendario, no puede quedar lista para
    // su hora: saldria otra vez. Queda en Revisar.
    const publish_error = result.error.slice(0, 1000)
    await supabase
      .from("content_pieces")
      .update({
        status: piece.approved_at ? "approved" : "generated",
        published_at: null,
        publish_error,
        ...(result.codigo === "ambiguo" && piece.programada_para ? { programada_revisar: true } : {}),
      })
      .eq("id", pieceId)
      .eq("status", "publishing")
    await supabase.from("content_pieces").update({ published_at: null, publish_error }).eq("id", pieceId).eq("status", "rejected")
  }

  return result
}

/**
 * LinkedIn: texto mas la tarjeta con el titular.
 *
 * La imagen no es opcional. Antes, si algo fallaba al dibujarla o subirla, el
 * post salia igual solo con texto; el problema es que eso no tiene arreglo
 * despues —habria que borrar el post y volver a publicarlo— y encima no dejaba
 * rastro de por que. Ahora, si no hay imagen, no hay post: la pieza se queda sin
 * publicar con el motivo escrito, y la siguiente tanda lo reintenta. Un fallo
 * pasajero se cura solo y uno de verdad se ve en la interfaz.
 */
async function publicarEnLinkedin(piece: ContentPiece): Promise<PublishResult> {
  const commentary = buildCommentary(piece.payload)
  if (!commentary.trim()) {
    return { ok: false, error: "La pieza no tiene texto que publicar." }
  }

  const tarjeta = await tarjetaDelPost(piece, commentary)
  if (!tarjeta.ok) {
    return { ok: false, error: `No se pudo preparar la imagen del post: ${tarjeta.error}` }
  }

  const resultado = await publishText(piece.account_id, commentary, tarjeta.imagen)
  return resultado.ok ? { ...resultado, imageUrn: tarjeta.imagen.urn } : resultado
}

/**
 * Instagram: el carrusel entero, con la conexion de Instagram de la empresa.
 * Las imagenes ya viven en URLs publicas del storage.
 */
async function publicarCarrusel(piece: ContentPiece, estricto: boolean): Promise<PublishResult> {
  const payload = piece.payload as unknown as {
    caption?: string
    hashtags?: string[]
    images?: string[]
  }

  const imagenes = payload?.images ?? []
  if (imagenes.length === 0) {
    return { ok: false, error: "El carrusel no tiene imagenes." }
  }

  const texto = [payload.caption, (payload.hashtags ?? []).join(" ")]
    .filter((parte) => parte && parte.trim().length > 0)
    .join("\n\n")

  const resultado = await publicarInstagram(piece.account_id, { texto, imagenes, estricto })
  if (resultado.ok) return { ok: true, urn: resultado.postId }
  return { ok: false, error: resultado.error, ...(resultado.ambiguo ? { codigo: "ambiguo" as const } : {}) }
}

/**
 * Facebook: la portada del carrusel y el texto largo, en la pagina de la
 * empresa. La pieza ya nacio con la forma de Facebook (ver
 * `render/facebook.ts`): aqui solo se junta el texto como lo haria LinkedIn.
 */
async function publicarEnFacebook(piece: ContentPiece): Promise<PublishResult> {
  const imagen = piece.payload?.image
  if (!imagen) {
    return { ok: false, error: "La pieza de Facebook no tiene imagen." }
  }

  const texto = buildCommentary(piece.payload)
  if (!texto.trim()) {
    return { ok: false, error: "La pieza no tiene texto que publicar." }
  }

  const resultado = await publicarFacebook(piece.account_id, { texto, imagenes: [imagen] })
  return resultado.ok ? { ok: true, urn: resultado.postId } : { ok: false, error: resultado.error }
}

/**
 * Las piezas que una tanda publicaria: generadas o aprobadas, sin publicar, y
 * sin un freno del revisor que nadie haya aprobado.
 *
 * Por orden de creacion, que es el orden en que se generaron: si una tanda no da
 * para todas, las mas viejas salen primero.
 */
/**
 * Si la pieza promete un recurso que aun no esta en la web, el motivo. Solo
 * frena las piezas que se escribieron con su recurso (lo dice el input de su
 * buzon): un recurso escrito despues, a mano, no frena piezas que no lo piden.
 *
 * `estricto` es para lo que sale sin nadie delante: si no se puede leer, frena.
 */
export async function recursoSinPublicar(pieceId: string, estricto = false): Promise<string | null> {
  const supabase = supabaseAdmin()
  const sinLeer = estricto ? "No se pudo comprobar su recurso: se reintenta en la próxima pasada." : null
  const { data: pieza, error: errorPieza } = await supabase.from("content_pieces").select("job_instagram_id, job_linkedin_id").eq("id", pieceId).maybeSingle()
  if (errorPieza) return sinLeer
  const p = pieza as { job_instagram_id: string | null; job_linkedin_id: string | null } | null
  if (!p) return null
  const [tabla, jobId] = p.job_instagram_id ? ["jobs_instagram", p.job_instagram_id] : ["jobs_linkedin", p.job_linkedin_id]
  if (!jobId) return null
  const { data: job, error: errorJob } = await supabase.from(tabla).select("input").eq("id", jobId).maybeSingle()
  if (errorJob) return sinLeer
  const recursoId = (job as { input?: { recurso?: { id?: string } | null } } | null)?.input?.recurso?.id
  if (!recursoId) return null
  const { data, error } = await supabase.from("content_recursos").select("status, web_url").eq("id", recursoId).maybeSingle()
  if (error || !data) return sinLeer
  const r = data as { status: string; web_url: string | null }
  if (r.status === "descartado") return "La pieza pide comentar la palabra de un recurso que se descartó: regenérala o cambia el cierre antes de publicarla."
  if (r.web_url) return null
  return r.status === "aprobado"
    ? "Su recurso está aprobado pero todavía no tiene dirección en la web: espera a que el portal lo reciba."
    : "Publica primero su recurso: apruébalo en la pestaña Recurso de la ficha para que salga a la web."
}

export async function pendingToPublish(
  accountId: string,
  network: string,
  limite = 5
): Promise<ContentPiece[]> {
  const supabase = supabaseAdmin()

  // Suelta las que se quedaron en 'publishing': una pieza se reclama antes de
  // publicar, y si el proceso muere en esa ventana de segundos quedaria colgada
  // sin salir y sin que nadie la reintente. Cinco minutos es mucho mas de lo
  // que tarda publicar, asi que a esas alturas es un reclamo huerfano.
  //
  // Lo que esta en el calendario no se suelta aqui: no se sabe si salio, asi que lo
  // recoge su propio barrido y va a Revisar (programadas.ts).
  const hace5Min = new Date(Date.now() - 5 * 60_000).toISOString()
  const huerfanas = (status: "approved" | "generated") =>
    supabase
      .from("content_pieces")
      .update({ status, published_at: null })
      .eq("account_id", accountId)
      .eq("network", network)
      .eq("status", "publishing")
      .is("programada_para", null)
      .lt("published_at", hace5Min)
  await huerfanas("approved").not("approved_at", "is", null)
  await huerfanas("generated").is("approved_at", null)

  const { data, error } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("account_id", accountId)
    .eq("network", network)
    .in("status", ["generated", "approved"])
    .or(FRENO_PIEZA)
    .is("published_at", null)
    // Lo que tiene fecha sale a su hora, no en la siguiente tanda.
    .is("programada_para", null)
    .order("created_at")
    .limit(limite)

  if (error) throw new Error(`No se pudieron leer las piezas por publicar: ${error.message}`)
  return (data ?? []) as ContentPiece[]
}

/**
 * La imagen que acompaña al post.
 *
 * Va siempre, no como adorno: un post con imagen ocupa el doble de alto en el
 * feed que uno de solo texto, y es lo que decide si alguien se para a leerlo. El
 * tratamiento es el mismo que la portada del carrusel —foto a color, degradado y
 * titular abajo— para que las dos redes se reconozcan como la misma cuenta.
 *
 * La foto alterna entre la de la noticia y la del banco: tirar siempre de la
 * misma fuente hace que todos los posts se parezcan, y son dos imaginarios
 * distintos —el documental del medio y el mas abstracto del banco— que conviene
 * ir mezclando. Cada una hace de respaldo de la otra, asi que basta con que
 * responda una de las dos.
 *
 * La foto de fondo si es opcional —sin ella la tarjeta sale sobre el fondo
 * solido de la paleta, que sigue siendo una tarjeta— pero la tarjeta no lo es:
 * cualquier fallo vuelve con su motivo para que quien publica decida, en vez de
 * dejar salir un post pelado sin que nadie se entere.
 */
type TarjetaResult =
  | { ok: true; imagen: { urn: string; altText: string } }
  | { ok: false; error: string }

async function tarjetaDelPost(
  piece: ContentPiece,
  commentary: string
): Promise<TarjetaResult> {
  try {
    const supabase = supabaseAdmin()

    const { data: cfg } = await supabase
      .from("generation_config")
      .select("carousel")
      .eq("account_id", piece.account_id)
      .maybeSingle()

    const estilo = estiloDesdeConfig((cfg as { carousel?: unknown } | null)?.carousel)

    const news = piece.raw_news_id
      ? ((
          await supabase.from("raw_news").select("*").eq("id", piece.raw_news_id).maybeSingle()
        ).data as RawNews | null)
      : null

    // Apaisada: la tarjeta es 1200x627 y una foto vertical recortada ahi pierde
    // justo la cabeza del sujeto.
    const delBanco = async (): Promise<string | null> => {
      if (!estilo.usarFotos || !pexelsConfigurado()) return null
      const banco = new BancoDeFotos(
        terminosDeBusqueda(news, await nichosConocidos(piece.account_id), estilo.fotosLiterales),
        "apaisada"
      )
      const elegida = await banco.siguiente()
      return elegida ? descargarFotoPexels(elegida) : null
    }

    const empezarPorLaNoticia = Math.random() < 0.5
    const foto = empezarPorLaNoticia
      ? ((await descargarFoto(news?.image_url)) ?? (await delBanco()))
      : ((await delBanco()) ?? (await descargarFoto(news?.image_url)))

    // El titular es el hook si lo hay; si no, la primera frase del cuerpo, que
    // es donde la gramatica de LinkedIn pone el gancho.
    const titular =
      piece.payload?.hook?.trim() ||
      commentary
        .split("\n")
        .find((linea) => linea.trim().length > 0)
        ?.trim() ||
      ""

    if (!titular) {
      return { ok: false, error: "La pieza no tiene titular con el que armar la tarjeta." }
    }

    const etiqueta = (news?.tema ?? news?.niche ?? "").trim() || null
    const png = await renderTarjetaLinkedin(titular, foto, estilo, etiqueta)

    const subida = await subirImagen(piece.account_id, png)
    if (!subida.ok) return { ok: false, error: subida.error }

    return { ok: true, imagen: { urn: subida.urn, altText: titular } }
  } catch (error) {
    // Aqui caen sobre todo los fallos de dibujo: una fuente que no esta donde se
    // espera, o un texto que Satori no sabe medir.
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `No se pudo dibujar la tarjeta: ${message}` }
  }
}
