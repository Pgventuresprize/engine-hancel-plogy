"use server"

import { revalidatePath } from "next/cache"

import {
  enqueueAngleJob,
  enqueueInstagramJob,
  enqueueLinkedinJob,
} from "@/engine/content/jobs"
import { configuracionDeGeneracion } from "@/lib/content-data"
import { idDeCuentaActual } from "@/lib/accounts"
import { tokenClaude } from "@/engine/claude/messages"
import { analizarPendientes } from "@/engine/content/analisis"
import { elegirPorHecho } from "@/engine/content/repetidas"
import { modelosClaude } from "@/engine/claude/modelos"
import { runContentTick } from "@/engine/content/tick"

import type { ContentAngle, ContentPiece, Red, Variables } from "@/engine/content/types"
import { parseVariables, validateVariables } from "@/engine/content/variables"
import { disconnectLinkedin } from "@/engine/publish/linkedin"
import { publishPiece } from "@/engine/publish/publish-piece"
import { supabaseAdmin } from "@/engine/supabase-admin"
import type { RawNews } from "@/lib/types"

/**
 * Acciones de la etapa 2.
 *
 * Todas escriben con el cliente service-role, que solo existe en el servidor: el
 * navegador manda la intencion, nunca la credencial.
 */

/** Las redes que el pipeline sabe generar hoy. Definidas en `content/types`. */
export type Network = Red

/**
 * `warning` es para lo que salio bien pero no va a llegar a ninguna parte: el
 * trabajo quedo encolado y el agente que deberia recogerlo no puede trabajar.
 * Decir que fue un error seria mentir; callarlo dejaria al usuario esperando.
 */
export type ActionResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refresh() {
  revalidatePath("/")
  revalidatePath("/configuracion/general")
  revalidatePath("/configuracion/conexiones")
  revalidatePath("/configuracion/marca")
}

/**
 * Cuanto trabajo hace una pasada que alguien espera delante.
 *
 * Uno por buzon. Generar es caro —unos quince segundos de Claude y casi veinte
 * dibujando el carrusel— y la peticion tiene un minuto. Con la cola llena, una
 * pasada sin tope se lo comia entero y el navegador recibia una respuesta que
 * no era la de la accion: "An unexpected response was received from the server".
 */
const PRESUPUESTO_A_MANO = 1

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim()
}

/** Lee del formulario solo las ranuras presentes, para un override puntual. */
function overrideFromForm(form: FormData): Partial<Variables> | null {
  const claves: (keyof Variables)[] = [
    "tono",
    "audiencia",
    "voz_marca",
    "cta",
    "evitar",
    "longitud",
    "idioma",
  ]
  const override: Partial<Variables> = {}
  for (const clave of claves) {
    const valor = form.get(clave)
    if (typeof valor === "string" && valor.trim().length > 0) {
      override[clave] = valor.trim()
    }
  }
  return Object.keys(override).length > 0 ? override : null
}

/** El aviso de que nadie va a procesar lo que se acaba de encolar. */
async function avisoSiFaltaToken(): Promise<string | undefined> {
  if ((await tokenClaude(await idDeCuentaActual())) === null) {
    return (
      "Encolado, pero falta conectar Claude: pega el token en la configuracion " +
      "o se quedara pendiente."
    )
  }
  return undefined
}

/**
 * Trae una noticia de la cuenta abierta.
 *
 * El filtro por cuenta no es decorativo: el id llega del cliente, y sin el
 * cualquiera con sesion podria meter en su pipeline una noticia de otra cuenta
 * pasando su id a mano. Lo mismo vale para el resto de acciones de este fichero.
 */
async function loadNews(id: string): Promise<RawNews> {
  const { data, error } = await supabaseAdmin()
    .from("raw_news")
    .select("*")
    .eq("id", id)
    .eq("account_id", await idDeCuentaActual())
    .single()
  if (error) throw new Error(`No se encontro la noticia: ${error.message}`)
  return data as RawNews
}

// -------------------------------------------------------------- envio manual

/** Cuantos dias atras se miran los hechos ya cubiertos. Igual que en el tick. */
const DIAS_DE_HECHOS_CUBIERTOS = 7

/**
 * Corta el envio si ese hecho ya tiene contenido.
 *
 * El automatico ya lo comprueba antes de encolar; esto cierra la otra puerta,
 * la de mandar una noticia a mano o arrastrarla en el tablero. Son dos caminos
 * distintos al mismo sitio y con uno solo vigilado la garantia no existiria.
 *
 * Devuelve el motivo si repite, o null si puede seguir.
 */
async function hechoYaCubierto(news: RawNews): Promise<string | null> {
  const supabase = supabaseAdmin()

  // El veto no es una nota baja que se pueda empujar: es un tema que esta
  // cuenta no cubre. Se corta aqui porque el tablero no es la unica via.
  if (news.status === "vetada") {
    return "Esa noticia esta vetada: es un tema que esta cuenta no cubre."
  }

  // Marcada como repetida en su dia: no hace falta volver a preguntar.
  if (news.duplicate_of_news_id) {
    const { data } = await supabase
      .from("raw_news")
      .select("title")
      .eq("id", news.duplicate_of_news_id)
      .maybeSingle()
    const titulo = (data as { title: string } | null)?.title
    return `Ese hecho ya lo cubre otra noticia${titulo ? `: "${titulo}"` : ""}.`
  }

  const desde = new Date(Date.now() - DIAS_DE_HECHOS_CUBIERTOS * 86_400_000).toISOString()
  const { data: cubiertas } = await supabase
    .from("raw_news")
    .select("id, title, content_angles!inner(id)")
    .eq("account_id", news.account_id)
    .gte("created_at", desde)
    .neq("id", news.id)
    .limit(120)

  const yaCubiertas = ((cubiertas ?? []) as { id: string; title: string }[]).map((c) => ({
    id: c.id,
    title: c.title,
  }))
  if (yaCubiertas.length === 0) return null

  const veredicto = await elegirPorHecho(
    news.account_id,
    [{ id: news.id, title: news.title, score: news.relevance_score, created_at: news.created_at }],
    yaCubiertas,
    (await modelosClaude(news.account_id)).angulo
  )

  const duena = veredicto.repetidas.get(news.id)
  if (!duena) return null

  await supabase
    .from("raw_news")
    .update({ status: "duplicate", duplicate_of_news_id: duena })
    .eq("id", news.id)
    .eq("account_id", news.account_id)

  const titulo = yaCubiertas.find((c) => c.id === duena)?.title
  return `Ese hecho ya lo cubre otra noticia${titulo ? `: "${titulo}"` : ""}.`
}

/**
 * Manda una noticia a la cola de generación.
 *
 * Disponible siempre, en cualquier modo y sin importar el umbral: es una accion
 * del usuario, no de la seleccion automatica.
 */
export async function encolarContenido(rawNewsId: string): Promise<ActionResult> {
  if (!rawNewsId) return { ok: false, error: "Falta el id de la noticia." }

  try {
    const [news, config] = await Promise.all([loadNews(rawNewsId), configuracionDeGeneracion()])

    const repetido = await hechoYaCubierto(news)
    if (repetido) return { ok: false, error: repetido }

    await enqueueAngleJob(news, config.variables)
    // Se fuerza el agente de angulo porque mandar algo a mano es una orden, no
    // una sugerencia: sin esto, con el agente en manual o esperando su hora, lo
    // que acabas de arrastrar se quedaba en la cola con todo lo demas y no
    // pasaba nada visible al soltarlo.
    await runContentTick({ trigger: "manual", forzar: ["angulo"], presupuesto: PRESUPUESTO_A_MANO })
    refresh()
    return { ok: true, warning: await avisoSiFaltaToken() }
  } catch (error) {
    return fail(error, "No se pudo encolar la noticia para generación.")
  }
}

/** Igual, pero con ranuras sobreescritas solo para esta generacion. */
export async function encolarContenidoConOverride(form: FormData): Promise<ActionResult> {
  const rawNewsId = text(form, "raw_news_id")
  if (!rawNewsId) return { ok: false, error: "Falta el id de la noticia." }

  const override = overrideFromForm(form)
  const invalido = override ? validateVariables(override as Record<string, unknown>) : null
  if (invalido) return { ok: false, error: invalido }

  try {
    const [news, config] = await Promise.all([loadNews(rawNewsId), configuracionDeGeneracion()])

    const repetido = await hechoYaCubierto(news)
    if (repetido) return { ok: false, error: repetido }

    await enqueueAngleJob(news, config.variables, override)
    await runContentTick({ trigger: "manual", forzar: ["angulo"], presupuesto: PRESUPUESTO_A_MANO })
    refresh()
    return { ok: true, warning: await avisoSiFaltaToken() }
  } catch (error) {
    return fail(error, "No se pudo encolar la noticia para generación.")
  }
}

// ------------------------------------------------------------------- angulos

/** Promueve un angulo a contenido de la red elegida. */
export async function generateFromAngle(
  angleId: string,
  network: Network = "linkedin",
  form?: FormData
): Promise<ActionResult> {
  if (!angleId) return { ok: false, error: "Falta el id del angulo." }
  if (network !== "linkedin" && network !== "instagram" && network !== "facebook") {
    return { ok: false, error: "Red no soportada." }
  }

  const override = form ? overrideFromForm(form) : null
  const invalido = override ? validateVariables(override as Record<string, unknown>) : null
  if (invalido) return { ok: false, error: invalido }

  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from("content_angles")
      .select("*")
      .eq("id", angleId)
      .eq("account_id", await idDeCuentaActual())
      .single()

    if (error) throw new Error(error.message)
    const angle = data as ContentAngle

    const [news, config] = await Promise.all([loadNews(angle.raw_news_id), configuracionDeGeneracion()])

    // El mismo angulo alimenta todas las redes: esa es la razon de que el
    // angulo se decida una sola vez y por separado.
    if (network === "facebook") {
      // Si ya hay carrusel de este angulo, Facebook sale de el ahora mismo, sin
      // pedirle otro guion al agente. Si no, se encola el buzon de Instagram
      // con Facebook como unico destino.
      const hecha = await facebookDesdeCarruselExistente(angle.id)
      if (hecha) {
        refresh()
        return { ok: true }
      }
      await enqueueInstagramJob(angle, news, config.variables, override, ["facebook"])
    } else if (network === "instagram") {
      await enqueueInstagramJob(angle, news, config.variables, override)
    } else {
      await enqueueLinkedinJob(angle, news, config.variables, override)
    }

    // Solo se marca a la espera si no habia nada generado aun; si ya hay una
    // pieza de la otra red, el angulo se queda en 'generated' y no retrocede.
    if (angle.status === "angled") {
      await supabase
        .from("content_angles")
        .update({ status: "pending_generation" })
        .eq("id", angleId)
        .eq("account_id", await idDeCuentaActual())
    }

    // Igual que al encolar un angulo: pedir una pieza a mano la adelanta a lo
    // que haya en cola, sea cual sea el modo de su agente.
    await runContentTick({
      trigger: "manual",
      forzar: ["instagram", "linkedin"],
      presupuesto: PRESUPUESTO_A_MANO,
    })
    refresh()
    return { ok: true, warning: await avisoSiFaltaToken() }
  } catch (error) {
    return fail(error, "No se pudo generar el contenido.")
  }
}

export async function discardAngle(angleId: string): Promise<ActionResult> {
  if (!angleId) return { ok: false, error: "Falta el id del angulo." }

  try {
    const { error } = await supabaseAdmin()
      .from("content_angles")
      .update({ status: "discarded" })
      .eq("id", angleId)
      .eq("account_id", await idDeCuentaActual())

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo descartar el angulo.")
  }
}

// -------------------------------------------------------------------- piezas

async function setPieceStatus(
  pieceId: string,
  status: "approved" | "rejected"
): Promise<ActionResult> {
  if (!pieceId) return { ok: false, error: "Falta el id de la pieza." }

  try {
    const { error } = await supabaseAdmin()
      .from("content_pieces")
      .update({
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", pieceId)
      .eq("account_id", await idDeCuentaActual())

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar el estado de la pieza.")
  }
}

export async function approvePiece(pieceId: string): Promise<ActionResult> {
  return setPieceStatus(pieceId, "approved")
}

/** Guarda el texto editado a mano. La revision vive dentro de Hancel. */
export async function updatePiece(form: FormData): Promise<ActionResult> {
  const pieceId = text(form, "piece_id")
  const body = text(form, "body")

  if (!pieceId) return { ok: false, error: "Falta el id de la pieza." }
  if (!body) return { ok: false, error: "El cuerpo del post no puede quedar vacio." }

  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from("content_pieces")
      .select("payload")
      .eq("id", pieceId)
      .eq("account_id", await idDeCuentaActual())
      .single()

    if (error) throw new Error(error.message)

    const payload = { ...((data as { payload: object }).payload ?? {}) }
    const hook = text(form, "hook")
    const actualizado = { ...payload, body, hook: hook || null }

    const { error: errorUpdate } = await supabase
      .from("content_pieces")
      .update({ payload: actualizado })
      .eq("id", pieceId)
      .eq("account_id", await idDeCuentaActual())

    if (errorUpdate) throw new Error(errorUpdate.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la pieza.")
  }
}

// ---------------------------------------------------------------- publicacion

/** Publica una pieza a mano. El automatico hace lo mismo desde el tick. */
export async function publishPieceNow(pieceId: string): Promise<ActionResult> {
  if (!pieceId) return { ok: false, error: "Falta el id de la pieza." }

  // `publishPiece` recibe solo el id, asi que la pertenencia se comprueba antes:
  // publicar la pieza de otra cuenta la mandaria a las redes equivocadas.
  const { count } = await supabaseAdmin()
    .from("content_pieces")
    .select("id", { count: "exact", head: true })
    .eq("id", pieceId)
    .eq("account_id", await idDeCuentaActual())

  if (!count) return { ok: false, error: "Esa pieza no es de esta cuenta." }

  const result = await publishPiece(pieceId)
  refresh()
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

/**
 * Vuelve a dibujar y subir las imagenes de un carrusel.
 *
 * El guion vive en el buzon, asi que se puede reconstruir exactamente: el
 * reparto de composiciones depende del indice, no del azar. Sirve cuando las
 * imagenes ya no estan en el storage —Buffer responde entonces "Image could not
 * be read from its URL"— y tambien para reaplicar un cambio de aspecto sin
 * volver a gastar una generacion del agente.
 */
export async function regenerateCarousel(pieceId: string): Promise<ActionResult> {
  if (!pieceId) return { ok: false, error: "Falta el id de la pieza." }

  try {
    const supabase = supabaseAdmin()

    const { data: piezaRaw, error: errorPieza } = await supabase
      .from("content_pieces")
      .select("*")
      .eq("id", pieceId)
      .eq("account_id", await idDeCuentaActual())
      .single()

    if (errorPieza) throw new Error(errorPieza.message)
    const pieza = piezaRaw as {
      account_id: string
      job_instagram_id: string | null
      content_angle_id: string
      network: string
      payload: { caption?: string; hashtags?: string[] }
    }

    if (pieza.network !== "instagram") {
      return { ok: false, error: "Solo los carruseles se regeneran." }
    }
    if (!pieza.job_instagram_id) {
      return { ok: false, error: "Esta pieza no conserva el buzon del que salio." }
    }

    const [{ data: job }, { data: cfg }] = await Promise.all([
      supabase.from("jobs_instagram").select("*").eq("id", pieza.job_instagram_id).single(),
      supabase
        .from("generation_config")
        .select("carousel")
        .eq("account_id", pieza.account_id)
        .single(),
    ])

    if (!job) return { ok: false, error: "No se encontro el buzon original." }

    const { generarCarrusel, nichosConocidos, noticiaDelAngulo } = await import(
      "@/engine/render/carousel"
    )
    const { estiloDesdeConfig } = await import("@/engine/render/theme")

    const { data: hermanaFacebook } = await supabase
      .from("content_pieces")
      .select("id, payload")
      .eq("job_instagram_id", pieza.job_instagram_id)
      .eq("network", "facebook")
      .is("published_at", null)
      .maybeSingle()

    const news = await noticiaDelAngulo(pieza.content_angle_id)
    const carrusel = await generarCarrusel(
      (job as { id: string }).id,
      (job as { respuesta: unknown }).respuesta,
      news,
      estiloDesdeConfig((cfg as { carousel?: unknown } | null)?.carousel),
      await nichosConocidos(pieza.account_id),
      // Solo si hay pieza de Facebook que actualizar: dibujarla siempre seria
      // una llamada de mas a Satori en la mayoria de las regeneraciones.
      Boolean(hermanaFacebook)
    )

    // El texto lo escribio el agente y no cambia porque se redibujen las imagenes.
    const { error } = await supabase
      .from("content_pieces")
      .update({
        payload: {
          ...carrusel,
          caption: pieza.payload?.caption ?? carrusel.caption,
          hashtags: pieza.payload?.hashtags ?? carrusel.hashtags,
        },
        publish_error: null,
      })
      .eq("id", pieceId)
      .eq("account_id", await idDeCuentaActual())

    if (error) throw new Error(error.message)

    // La pieza de Facebook que salio de este mismo carrusel lleva la portada:
    // si se redibujo, la suya tambien cambia. Solo si no se publico ya, porque
    // lo publicado no se toca. Se lee, se funde y se escribe porque `update`
    // sobre jsonb reemplaza el documento entero y aqui solo cambia una clave.
    const portadaFb = carrusel.portadaFacebook ?? carrusel.images[0]
    if (hermanaFacebook && portadaFb) {
      const hermana = hermanaFacebook as { id: string; payload: Record<string, unknown> }
      await supabase
        .from("content_pieces")
        .update({ payload: { ...hermana.payload, image: portadaFb } })
        .eq("id", hermana.id)
    }

    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudieron regenerar las imagenes.")
  }
}

export async function disconnectLinkedinAccount(): Promise<ActionResult> {
  try {
    await disconnectLinkedin(await idDeCuentaActual())
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo desconectar la cuenta.")
  }
}

// -------------------------------------------------------------------- la cola

/**
 * Reencola un buzon fallido como uno nuevo.
 *
 * Sin reintento automatico a proposito: un prompt que falla reintentado en bucle
 * quema cuota sin converger. El usuario mira el error y decide.
 */
export async function retryJob(
  tabla: "jobs_angle" | "jobs_linkedin" | "jobs_instagram",
  jobId: string
): Promise<ActionResult> {
  if (!jobId) return { ok: false, error: "Falta el id del trabajo." }

  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from(tabla)
      .select("*")
      .eq("id", jobId)
      .eq("account_id", await idDeCuentaActual())
      .single()

    if (error) throw new Error(error.message)
    const job = data as Record<string, unknown>

    // Dos inserts separados y no uno con la fila armada aparte: cada buzon
    // tiene su clave foranea propia y supabase-js no tipa una union de formas.
    const errorInsert =
      tabla === "jobs_angle"
        ? (
            await supabase.from("jobs_angle").insert({
              // La cuenta se copia del trabajo original: reintentar es repetir
              // lo mismo, no empezar algo nuevo.
              account_id: job.account_id as string,
              raw_news_id: job.raw_news_id as string,
              input: job.input,
            })
          ).error
        : (
            await supabase.from(tabla).insert({
              account_id: job.account_id as string,
              content_angle_id: job.content_angle_id as string,
              input: job.input,
            })
          ).error

    if (errorInsert) throw new Error(errorInsert.message)

    await runContentTick({ trigger: "manual" })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo reintentar el trabajo.")
  }
}

/** "Revisar la cola ahora": la misma pasada que disparan los triggers. */
export async function runTickNow(): Promise<ActionResult> {
  try {
    await runContentTick({ trigger: "manual" })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo revisar la cola.")
  }
}

// --------------------------------------------------------------- logo de marca
// El resto del aspecto se guarda en app/configuracion/marca/actions.ts.

/** Lo que admite el logo: mapas de bits, que es lo unico que Satori dibuja. */
const TIPOS_DE_LOGO = ["image/png", "image/jpeg", "image/webp"]
const MAX_LOGO_BYTES = 2 * 1024 * 1024

/**
 * Guarda el logo que cierra los carruseles.
 *
 * Se guarda la URL en la configuracion y los bytes en el storage. El SVG se
 * rechaza a proposito: Satori solo dibuja mapas de bits, asi que uno subido
 * aqui pasaria la subida y desapareceria en la lamina sin decir por que.
 */
/** Las tres imagenes de marca. `perfil` es la captura del cierre. */
export type VersionLogo = "claro" | "oscuro" | "perfil"

export async function subirLogoMarca(form: FormData): Promise<ActionResult> {
  const pedida = String(form.get("version") ?? "")
  const version: VersionLogo =
    pedida === "oscuro" ? "oscuro" : pedida === "perfil" ? "perfil" : "claro"
  const archivo = form.get("logo")
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Elige un archivo." }
  }
  if (!TIPOS_DE_LOGO.includes(archivo.type)) {
    return { ok: false, error: "El logo tiene que ser PNG, JPG o WEBP. El SVG no se puede dibujar." }
  }
  if (archivo.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "El logo no puede pasar de 2 MB." }
  }

  try {
    const accountId = await idDeCuentaActual()
    const { subirLogo } = await import("@/engine/render/storage")
    const url = await subirLogo(
      accountId,
      version,
      Buffer.from(await archivo.arrayBuffer()),
      archivo.type
    )

    await guardarLogoEnConfig(accountId, version, url)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo subir el logo.")
  }
}

/** Quita el logo. La lamina de cierre sigue saliendo, sin el. */
export async function quitarLogoMarca(version: VersionLogo): Promise<ActionResult> {
  try {
    const accountId = await idDeCuentaActual()
    const { borrarLogo } = await import("@/engine/render/storage")
    await borrarLogo(accountId, version)
    await guardarLogoEnConfig(accountId, version, null)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo quitar el logo.")
  }
}

/** Escribe solo una version del logo, sin tocar el resto del aspecto. */
async function guardarLogoEnConfig(
  accountId: string,
  version: VersionLogo,
  url: string | null
): Promise<void> {
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from("generation_config")
    .select("carousel")
    .eq("account_id", accountId)
    .maybeSingle()

  const actual = ((data as { carousel?: Record<string, unknown> } | null)?.carousel ?? {}) as Record<
    string,
    unknown
  >

  const logos = ((actual.logos ?? {}) as Record<string, unknown>) ?? {}
  // `logo` a secas, de cuando solo habia uno, se retira al escribir: dejarlo
  // haria que una version borrada resucitara desde el campo viejo.
  const resto = { ...actual }
  delete resto.logo

  const { error } = await supabase
    .from("generation_config")
    .upsert(
      {
        account_id: accountId,
        carousel: { ...resto, logos: { ...logos, [version]: url } },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    )

  if (error) throw new Error(error.message)
}

export async function updateGenerationConfig(form: FormData): Promise<ActionResult> {
  const variables = {
    tono: text(form, "tono"),
    audiencia: text(form, "audiencia"),
    voz_marca: text(form, "voz_marca"),
    cta: text(form, "cta"),
    evitar: text(form, "evitar"),
    longitud: text(form, "longitud"),
    idioma: text(form, "idioma"),
  }

  // Dos pantallas comparten esta accion y cada una guarda solo lo suyo: Marca
  // manda las variables y General los umbrales. Antes cada una reenviaba lo de
  // la otra tal como lo leyo al abrirse, y si entretanto se habia cambiado en
  // la otra pantalla, guardar devolvia el valor viejo.
  const traeVariables = form.has("tono")
  if (traeVariables) {
    const invalido = validateVariables(variables)
    if (invalido) return { ok: false, error: invalido }
  }

  // El umbral viaja solo desde la tarjeta de seleccion.
  // Vacio = sin umbral: no se selecciona nada sola hasta que se defina, que es
  // justo lo que se quiere mientras no haya criterio de scoring.
  const traeUmbral = form.has("score_threshold")
  const umbralTexto = text(form, "score_threshold")
  let umbral: number | null = null
  if (traeUmbral && umbralTexto.length > 0) {
    umbral = Number(umbralTexto)
    if (!Number.isInteger(umbral) || umbral < 0 || umbral > 10) {
      return { ok: false, error: "El umbral tiene que ser un entero entre 0 y 10." }
    }
  }

  try {
    const accountId = await idDeCuentaActual()

    // Cambiar el umbral solo afecta a lo que entre despues. Se marca la fecha
    // solo si el numero cambio de verdad: guardar otra cosa de la pantalla no
    // puede mover la linea y dejar fuera noticias que ya cumplian.
    const extraUmbral: Record<string, unknown> = {}
    if (traeUmbral) {
      const { data: previa } = await supabaseAdmin()
        .from("generation_config")
        .select("score_threshold")
        .eq("account_id", accountId)
        .maybeSingle()
      extraUmbral.score_threshold = umbral
      if ((previa as { score_threshold: number | null } | null)?.score_threshold !== umbral) {
        extraUmbral.score_threshold_updated_at = new Date().toISOString()
      }
    }

    // El umbral de redaccion viaja solo desde la tarjeta de seleccion: si el
    // formulario no lo trae (la pantalla de Marca), no se toca.
    const extraRedaccion: Record<string, unknown> = {}
    if (form.has("redaccion_score_threshold")) {
      const t = text(form, "redaccion_score_threshold")
      const nuevo = t.length > 0 ? Number(t) : null
      if (nuevo !== null && (!Number.isInteger(nuevo) || nuevo < 0 || nuevo > 10)) {
        return { ok: false, error: "El umbral de redacción tiene que ser un entero entre 0 y 10." }
      }
      const { data: antes } = await supabaseAdmin()
        .from("generation_config")
        .select("redaccion_score_threshold")
        .eq("account_id", accountId)
        .maybeSingle()
      extraRedaccion.redaccion_score_threshold = nuevo
      if ((antes as { redaccion_score_threshold: number | null } | null)?.redaccion_score_threshold !== nuevo) {
        extraRedaccion.redaccion_threshold_updated_at = new Date().toISOString()
      }
    }

    const { error } = await supabaseAdmin()
      .from("generation_config")
      .upsert(
        {
          account_id: accountId,
          ...(traeVariables ? { variables: parseVariables(variables) } : {}),
          ...extraUmbral,
          ...extraRedaccion,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" }
      )

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la configuracion.")
  }
}

/**
 * Crea la pieza de Facebook a partir del carrusel que ya exista para el angulo.
 *
 * Devuelve `false` si no hay carrusel del que sacarla, y entonces toca encolar.
 * Si ya habia pieza de Facebook no crea otra: dos iguales en la cola solo
 * confunden.
 */
async function facebookDesdeCarruselExistente(angleId: string): Promise<boolean> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const { data: existente } = await supabase
    .from("content_pieces")
    .select("id")
    .eq("content_angle_id", angleId)
    .eq("account_id", accountId)
    .eq("network", "facebook")
    .limit(1)
    .maybeSingle()
  if (existente) return true

  const { data: carrusel } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("content_angle_id", angleId)
    .eq("account_id", accountId)
    .eq("network", "instagram")
    .not("job_instagram_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!carrusel) return false

  const pieza = carrusel as ContentPiece & { job_instagram_id: string; raw_news_id: string | null }
  const imagenes = (pieza.payload as unknown as { images?: string[] }).images ?? []
  if (imagenes.length === 0) return false

  const { data: job } = await supabase
    .from("jobs_instagram")
    .select("respuesta, input")
    .eq("id", pieza.job_instagram_id)
    .single()
  if (!job) return false

  const { parseInstagramResponse } = await import("@/engine/render/carousel")
  const { armarPublicacionFacebook } = await import("@/engine/render/facebook")
  const { caption, hashtags, slides } = parseInstagramResponse(
    (job as { respuesta: unknown }).respuesta
  )

  // Facebook necesita su portada, sin numeracion ni "desliza": publica una sola
  // imagen y esos dos elementos invitan a un gesto que ahi no existe. Si el
  // carrusel no la trae —se genero antes de que existiera— se redibuja ahora, y
  // de paso se refrescan sus laminas, que salen del mismo guion.
  const guardada = (pieza.payload as unknown as { portadaFacebook?: string }).portadaFacebook
  let portada = guardada ?? null

  if (!portada) {
    const { generarCarrusel, nichosConocidos, noticiaDelAngulo } = await import(
      "@/engine/render/carousel"
    )
    const { estiloDesdeConfig } = await import("@/engine/render/theme")
    const { data: cfg } = await supabase
      .from("generation_config")
      .select("carousel")
      .eq("account_id", accountId)
      .maybeSingle()

    const rehecho = await generarCarrusel(
      pieza.job_instagram_id,
      (job as { respuesta: unknown }).respuesta,
      await noticiaDelAngulo(angleId),
      estiloDesdeConfig((cfg as { carousel?: unknown } | null)?.carousel),
      await nichosConocidos(accountId),
      true
    )
    portada = rehecho.portadaFacebook ?? rehecho.images[0] ?? null

    await supabase
      .from("content_pieces")
      .update({
        payload: {
          ...rehecho,
          caption:
            (pieza.payload as unknown as { caption?: string }).caption ?? rehecho.caption,
        },
      })
      .eq("id", pieza.id)
  }

  if (!portada) return false

  const { error } = await supabase.from("content_pieces").insert({
    account_id: accountId,
    content_angle_id: angleId,
    raw_news_id: pieza.raw_news_id,
    job_instagram_id: pieza.job_instagram_id,
    network: "facebook",
    payload: armarPublicacionFacebook({ slides, caption, hashtags, portada }),
    status: "generated",
    variables_usadas: ((job as { input?: { variables?: unknown } }).input?.variables ?? null) as Variables | null,
    generated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return true
}

/**
 * El texto consolidado de una noticia, para la ficha del tablero.
 *
 * No viaja con el tablero a proposito: son hasta 8000 caracteres por noticia y
 * multiplicado por cientos de tarjetas convertia la pagina en megabytes de HTML
 * para algo que solo se lee al abrir una ficha.
 */
export async function contenidoDeNoticia(
  newsId: string
): Promise<{ ok: true; contenido: string | null } | { ok: false; error: string }> {
  if (!newsId) return { ok: false, error: "Falta el id de la noticia." }

  const { data, error } = await supabaseAdmin()
    .from("raw_news")
    .select("full_content")
    .eq("id", newsId)
    .eq("account_id", await idDeCuentaActual())
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  return { ok: true, contenido: (data as { full_content: string | null } | null)?.full_content ?? null }
}

// -------------------------------------------------------- mover en el tablero

/**
 * Empuja un hecho a la etapa a la que lo arrastraron.
 *
 * Arrastrar no cambia una etiqueta: la etapa se deduce de lo que existe —hay
 * angulo, hay pieza, esta publicada— asi que moverla solo puede significar
 * hacer el trabajo que falta para llegar ahi. De ahi que esto dispare el
 * pipeline en vez de escribir un estado.
 *
 * Solo se admite el paso siguiente, no cualquier salto: generar un post exige
 * un angulo, y publicar exige una pieza. Un salto de dos etapas dejaria al
 * usuario esperando un resultado que nunca llega.
 */
export type DestinoTablero = "analizada" | "angulo" | "post" | "publicado" | "descartado"

export async function moverFicha(
  newsId: string,
  destino: DestinoTablero,
  /**
   * La red de la columna en la que se solto, cuando hay varias.
   *
   * Post es una columna por red, asi que soltar en Instagram significa
   * Instagram y nada mas. Sin esto habia que adivinarlo desde la
   * configuracion, y se generaba para una red que no era la que se señalo.
   */
  canal = ""
): Promise<ActionResult> {
  if (!newsId) return { ok: false, error: "Falta el id de la noticia." }

  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()

    const news = await loadNews(newsId)

    const [{ data: angulos }, { data: piezas }] = await Promise.all([
      supabase
        .from("content_angles")
        .select("id, status")
        .eq("raw_news_id", newsId)
        .eq("account_id", accountId),
      supabase
        .from("content_pieces")
        .select("id, status, published_at")
        .eq("raw_news_id", newsId)
        .eq("account_id", accountId),
    ])

    const angulo = (angulos ?? [])[0] as { id: string; status: string } | undefined
    const misPiezas = (piezas ?? []) as { id: string; status: string; published_at: string | null }[]

    switch (destino) {
      case "analizada": {
        if (news.status !== "pending_analysis") {
          return { ok: false, error: "Esta noticia ya paso por el analisis." }
        }
        const { analizadas, errores } = await analizarPendientes(accountId, 1, [newsId])
        refresh()
        if (analizadas === 0) {
          return { ok: false, error: errores[0] ?? "El analisis no devolvio nada." }
        }
        return { ok: true }
      }

      case "angulo": {
        if (angulo) return { ok: false, error: "Esta noticia ya tiene angulo." }
        await anotarPromocion(news)
        return await encolarContenido(newsId)
      }

      case "post": {
        if (!angulo) {
          return { ok: false, error: "Primero hay que generar el angulo: arrastrala a Angulo." }
        }
        if (misPiezas.length > 0) return { ok: false, error: "Esta noticia ya tiene piezas." }

        // La red la dice la columna donde se solto. Sin ella —un tablero con
        // una sola columna de post— van todas las que esten en marcha.
        const { redesActivas } = await import("@/engine/agents/redes")
        const enMarcha = (await redesActivas(accountId)) as Red[]

        // Soltar en Instagram trae tambien Facebook si esta en marcha: su pieza
        // sale del mismo guion, sin una sola llamada de mas, asi que dejarla
        // fuera seria tirar una pieza gratis y obligar a un segundo arrastre.
        const redes = !canal
          ? enMarcha
          : canal === "instagram" && enMarcha.includes("facebook")
            ? (["instagram", "facebook"] as Red[])
            : [canal as Red]

        if (redes.length === 0) {
          return {
            ok: false,
            error: "No hay ninguna red en marcha: revisa sus agentes y sus conexiones.",
          }
        }

        await anotarPromocion(news)
        for (const red of redes) {
          const r = await generateFromAngle(angulo.id, red)
          if (!r.ok) return r
        }
        return { ok: true, warning: await avisoSiFaltaToken() }
      }

      case "publicado": {
        const publicables = misPiezas.filter((p) => !p.published_at && p.status !== "rejected")
        if (publicables.length === 0) {
          return { ok: false, error: "No hay piezas sin publicar en esta noticia." }
        }
        // Publicar sale a las redes y no se deshace, asi que el aviso lo da la
        // interfaz antes de llamar aqui; a estas alturas ya esta confirmado.
        for (const pieza of publicables) {
          const r = await publishPieceNow(pieza.id)
          if (!r.ok) return r
        }
        return { ok: true }
      }

      case "descartado": {
        // Se descarta lo que exista, de arriba abajo: una noticia sin angulo se
        // descarta como noticia, y una con piezas tiene que descartar tambien
        // las piezas o seguiria contando como post.
        if (misPiezas.length > 0) {
          const { error } = await supabase
            .from("content_pieces")
            .update({ status: "rejected", approved_at: null })
            .in("id", misPiezas.map((p) => p.id))
            .eq("account_id", accountId)
            .is("published_at", null)
          if (error) throw new Error(error.message)
        }
        if (angulo) {
          const r = await discardAngle(angulo.id)
          if (!r.ok) return r
        }
        if (!angulo && misPiezas.length === 0) {
          const { error } = await supabase
            .from("raw_news")
            .update({ status: "discarded" })
            .eq("id", newsId)
            .eq("account_id", accountId)
          if (error) throw new Error(error.message)
        }
        refresh()
        return { ok: true }
      }
    }
  } catch (error) {
    return fail(error, "No se pudo mover la tarjeta.")
  }
}

/**
 * Deja constancia de que esto se genero a mano y con que nota.
 *
 * El dato que importa es la discrepancia: si el score no llegaba al umbral, el
 * analisis dijo que no valia y una persona dijo que si. Con eso se pueden
 * buscar despues patrones de lo que el agente infravalora. Score y umbral se
 * copian, no se referencian: los dos cambian, y una referencia haria que el
 * registro mintiera en cuanto alguien moviera la barra.
 *
 * Solo la primera vez: reencolar la misma noticia no cambia lo que se decidio
 * la primera vez, que es lo que se quiere estudiar.
 */
async function anotarPromocion(news: RawNews): Promise<void> {
  if (news.promoted_by_hand) return

  const config = await configuracionDeGeneracion()
  await supabaseAdmin()
    .from("raw_news")
    .update({
      promoted_by_hand: true,
      promoted_at: new Date().toISOString(),
      promoted_score: news.relevance_score,
      promoted_threshold: config.score_threshold,
    })
    .eq("id", news.id)
    .eq("account_id", news.account_id)
}

// -------------------------------------------------------- rechazo con motivo

/**
 * Por que se aparta un hecho del pipeline.
 *
 * No es decoracion: cada motivo lo manda a una columna distinta de descartados,
 * y "repetida" es ademas el material con el que se revisa si el agrupador de
 * hechos esta acertando. Un cajon unico de "rechazado" no dejaria distinguir un
 * fallo del sistema de una decision editorial.
 */
export type MotivoDescarte = "repetida" | "fecha" | "otra"

const ESTADO_POR_MOTIVO: Record<MotivoDescarte, string> = {
  repetida: "duplicate",
  fecha: "discarded_date",
  otra: "discarded",
}

/**
 * Saca un hecho del pipeline entero, no solo una de sus piezas.
 *
 * Rechazar la pieza de Instagram y dejar viva la de Facebook mantenia la
 * tarjeta en "Post", que es justo lo contrario de lo que se pedia al pulsar
 * rechazar. Aqui se rechazan todas las piezas sin publicar, se descarta el
 * angulo y la noticia queda con el estado que le toca por su motivo.
 *
 * Lo ya publicado no se toca: retirarlo de la red no es algo que pueda hacer
 * este boton, y marcarlo como descartado dejaria la base diciendo que no salio
 * algo que si salio.
 */
export async function rechazarFicha(
  newsId: string,
  motivo: MotivoDescarte
): Promise<ActionResult> {
  if (!newsId) return { ok: false, error: "Falta el id de la noticia." }
  if (!(motivo in ESTADO_POR_MOTIVO)) return { ok: false, error: "Motivo no valido." }

  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()

    const { count } = await supabase
      .from("raw_news")
      .select("id", { count: "exact", head: true })
      .eq("id", newsId)
      .eq("account_id", accountId)

    if (!count) return { ok: false, error: "Esa noticia no es de esta cuenta." }

    const { error: errorPiezas } = await supabase
      .from("content_pieces")
      .update({ status: "rejected", approved_at: null })
      .eq("raw_news_id", newsId)
      .eq("account_id", accountId)
      .is("published_at", null)

    if (errorPiezas) throw new Error(errorPiezas.message)

    const { error: errorAngulo } = await supabase
      .from("content_angles")
      .update({ status: "discarded" })
      .eq("raw_news_id", newsId)
      .eq("account_id", accountId)

    if (errorAngulo) throw new Error(errorAngulo.message)

    const { error: errorNoticia } = await supabase
      .from("raw_news")
      .update({ status: ESTADO_POR_MOTIVO[motivo] })
      .eq("id", newsId)
      .eq("account_id", accountId)

    if (errorNoticia) throw new Error(errorNoticia.message)

    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo descartar la noticia.")
  }
}
