import type { RawNews } from "@/lib/types"

import { todasLasCuentas } from "../accounts"
import { redesQueGeneranSolas } from "../agents/redes"
import { ajustesDe, marcarCorrida, type Agente } from "../agents/settings"
import { leToca } from "../agents/turno"
import { modelosClaude } from "../claude/modelos"
import { elegirPorHecho } from "./repetidas"
import { expirarPendientesViejas } from "./expiry"
import { getSettings } from "../schedule"
import { publishPiece, pendingToPublish } from "../publish/publish-piece"
import { getPublishSchedules, marcarTanda } from "../publish/schedule"
import { generarCarrusel, nichosConocidos, noticiaDelAngulo, parseInstagramResponse } from "../render/carousel"
import { armarPublicacionFacebook } from "../render/facebook"
import { estiloDesdeConfig } from "../render/theme"
import { etiquetarPendientes, registrarUsos } from "../marca/imagenes"
import { supabaseAdmin } from "../supabase-admin"
import {
  claimAngleJobs,
  claimInstagramJobs,
  claimLinkedinJobs,
  enqueueAngleJob,
  enqueueInstagramJob,
  enqueueLinkedinJob,
  getGenerationConfig,
  markJobUnreadable,
  MAX_DRENAJE_POR_TICK,
} from "./jobs"
import { analizarPendientes } from "./analisis"
import { procesarBuzones } from "./procesar"
import { revisionDeRespuesta } from "./revision"
import { ContentLog } from "./log"
import { parseAngleResponse, parseLinkedinResponse } from "./parse"
import type { ContentAngle, DestinoCarrusel, JobAngle, JobLinkedin, Variables } from "./types"

/**
 * Una pasada del pipeline de contenido.
 *
 * El mismo patron buzon, aplicado a la aplicacion: los triggers de Postgres, el
 * cron de respaldo y los botones de la interfaz no traen trabajo, solo dicen
 * "despierta y revisa la cola". Todos llaman aqui.
 *
 * La pasada es idempotente y convergente: toma lo que este hecho y sin
 * consumir, lo materializa, encadena lo que toque y sale. Dos pasadas
 * solapadas no duplican nada porque el drenaje reclama las filas con un
 * compare-and-set (ver `claimAngleJobs` en `jobs.ts`), y una pasada en vacio no
 * cuesta casi nada.
 */

/**
 * Tope de noticias que el modo automatico encola por pasada.
 *
 * Es un limite tecnico, no editorial: sin el, activar el modo automatico con un
 * umbral bajo intentaria encolar cientos de trabajos en una sola peticion y
 * agotaria el tiempo de la funcion. Como el tick vuelve a correr con cada
 * trigger y cada cinco minutos por cron, lo que no entra ahora entra despues.
 */
export const MAX_AUTO_POR_TICK = 5

/**
 * Cuantos dias atras se miran los hechos ya publicados al buscar repeticiones.
 *
 * Una noticia solo vive cinco dias (ver `frescura.ts`), asi que en una semana
 * cabe cualquier eco tardio del mismo anuncio sin arrastrar historia que ya no
 * se va a repetir.
 */
const DIAS_DE_HECHOS_CUBIERTOS = 7

/**
 * Cuantos angulos se miran para encontrar los que faltan por encolar.
 *
 * Mas que los que se encolan, a proposito: hay que filtrar los que ya tienen
 * pieza o buzon vivo, y si el filtro se aplica despues de recortar al cupo, un
 * puñado de angulos bloqueados en cabeza deja la cola entera sin avanzar.
 */
const VENTANA_DE_ANGULOS = 120

/**
 * A partir de aqui ya no se empieza una generacion en esta pasada.
 *
 * La peticion tiene un minuto y una generacion son unos quince segundos. Con
 * treinta ya gastados, empezarla es apostar a que entra; si no entra, el
 * trabajo se queda reclamado y nadie lo toca hasta que caduque, media hora
 * despues. Mejor dejarla para la pasada siguiente, que llega en dos minutos.
 */
const MARGEN_PARA_GENERAR = 30_000

/** Tope de publicaciones por pasada: LinkedIn limita el ritmo y no hay prisa. */
export const MAX_PUBLICAR_POR_TICK = 3

export type TickTrigger = "trigger" | "cron" | "manual" | "app"

export type TickSummary = {
  startedAt: string
  durationMs: number
  trigger: TickTrigger
  anglesQueued: number
  angleJobsConsumed: number
  anglesCreated: number
  linkedinQueued: number
  linkedinJobsConsumed: number
  piecesCreated: number
  instagramJobsConsumed: number
  carouselsCreated: number
  facebookCreated: number
  piecesPublished: number
  failedJobs: number
  noticiasAnalizadas: number
  errors: string[]
}

async function loadNews(ids: string[]): Promise<Map<string, RawNews>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabaseAdmin().from("raw_news").select("*").in("id", ids)
  if (error) throw new Error(`No se pudieron leer las noticias: ${error.message}`)
  return new Map(((data ?? []) as RawNews[]).map((row) => [row.id, row]))
}

export async function runContentTick(
  options: {
    trigger?: TickTrigger
    signal?: AbortSignal
    /**
     * Agentes que corren aunque su modo diga que no.
     *
     * Es lo que hace el boton de una etapa en el estudio: una pasada suelta sin
     * tener que cambiar el modo del agente y acordarse de devolverlo.
     */
    forzar?: Agente[]
    /**
     * Cuando se fuerza publicacion, la red concreta.
     *
     * Vacio son todas. Existe porque el boton del tablero pregunta a que red
     * publicar: forzar las tres cuando solo se queria una sacaria al feed
     * piezas que nadie habia mirado.
     */
    forzarCanal?: string
    /**
     * Cuanto trabajo hace esta pasada, cuando alguien la espera delante.
     *
     * Una pasada a mano corre dentro del limite de tiempo de una peticion, y el
     * trabajo de aqui no es barato: una generacion son unos quince segundos de
     * Claude y dibujar un carrusel casi veinte. Sin tope, arrastrar una tarjeta
     * con treinta en cola intentaba vaciarlas todas, agotaba el limite a la
     * mitad y el navegador recibia una respuesta que no era la de la accion.
     *
     * Lo que no entra no se pierde: sigue en la cola para la proxima pasada.
     */
    presupuesto?: number
  } = {}
): Promise<TickSummary> {
  const trigger = options.trigger ?? "manual"
  const forzados = new Set(options.forzar ?? [])
  const presupuesto = options.presupuesto
  const disparoAngulo = forzados.has("angulo") ? ("manual" as const) : ("auto" as const)
  // Los buzones son tres agentes distintos; forzar cualquiera de ellos abre la
  // pasada para todos. Es una simplificacion consciente: el coste de escribir
  // de mas es un post que igualmente se iba a querer, y separarlos pedia un
  // filtro por buzon que no vale lo que complica.
  const disparoBuzones =
    forzados.has("angulo") || forzados.has("instagram") || forzados.has("linkedin")
      ? ("manual" as const)
      : ("auto" as const)
  const started = new Date()
  const log = new ContentLog()
  const errors: string[] = []

  let anglesQueued = 0
  let angleJobsConsumed = 0
  let anglesCreated = 0
  let linkedinQueued = 0
  let linkedinJobsConsumed = 0
  let piecesCreated = 0
  let instagramJobsConsumed = 0
  let carouselsCreated = 0
  let facebookCreated = 0
  let piecesPublished = 0
  let failedJobs = 0
  let noticiasAnalizadas = 0

  const supabase = supabaseAdmin()
  log.emit("content.tick.started", "Revision de la cola de contenido", { trigger })

  // Cada cuenta tiene su propia configuracion de generacion y su propia
  // taxonomia. Se leen una vez por pasada y se guardan, porque el drenaje puede
  // traer trabajos de varias cuentas mezclados y volver a la base por cada fila
  // seria releer lo mismo decenas de veces.
  const configs = new Map<string, Awaited<ReturnType<typeof getGenerationConfig>>>()
  const configDe = async (accountId: string) => {
    const guardada = configs.get(accountId)
    if (guardada) return guardada
    const fresca = await getGenerationConfig(accountId)
    configs.set(accountId, fresca)
    return fresca
  }

  const nichos = new Map<string, string[]>()
  const nichosDe = async (accountId: string) => {
    const guardados = nichos.get(accountId)
    if (guardados) return guardados
    const frescos = await nichosConocidos(accountId)
    nichos.set(accountId, frescos)
    return frescos
  }

  const cuentas = await todasLasCuentas()
  const esManual = trigger === "manual"

  // --------------------------------------------------------------- analisis
  //
  // El motor investiga cada noticia con
  // busqueda web y la puntua, en tandas cortas. Va primero para que la seleccion
  // automatica de esta misma pasada pueda usar lo recien analizado. Cada cuenta
  // en su try: que una falle no frena a las demas.
  //
  // En un disparo manual (el usuario le da a "Generar" desde la interfaz) se
  // salta: solo quiere materializar lo que acaba de encolar, no arrancar un
  // analisis con busqueda web de todas las cuentas.
  if (!esManual || forzados.has("analisis")) {
    for (const cuenta of cuentas) {
      try {
        const ajustesCuenta = await getSettings(cuenta.id)
        // Una cuenta con la automatizacion apagada no se analiza: no tiene
        // sentido gastar el plan investigando noticias que no va a generar ni
        // publicar. Al reactivarla, el analisis se reanuda solo.
        if (!ajustesCuenta.enabled) continue

        // Y dentro de la cuenta manda el modo del agente: en manual las
        // noticias se quedan en cola hasta que alguien pulse el boton, y en
        // programado hasta que llegue su hora.
        const suyo = await ajustesDe(cuenta.id, "analisis")
        const turno = leToca(
          suyo,
          ajustesCuenta.timezone,
          new Date(),
          forzados.has("analisis") ? "manual" : "auto"
        )
        if (!turno.corre) continue
        if (suyo.mode === "programado") await marcarCorrida(cuenta.id, "analisis")

        await expirarPendientesViejas(cuenta.id)
        const res = await analizarPendientes(cuenta.id)
        noticiasAnalizadas += res.analizadas
        if (res.analizadas > 0 || res.fallidas > 0) {
          log.emit("content.analisis", `${res.analizadas} noticias analizadas`, {
            accountId: cuenta.id,
            analizadas: res.analizadas,
            fallidas: res.fallidas,
          })
        }
        for (const e of res.errores) errors.push(`[${cuenta.slug}] analisis: ${e}`)
      } catch (error) {
        errors.push(`[${cuenta.slug}] ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  // ------------------------------------------------- fotos de la biblioteca
  //
  // Las fotos que se subieron y Claude aun no ha mirado. Al subir ya se lanza
  // una tanda; esto recoge lo que quedo (una subida de cientos, un fallo). Una
  // tanda corta por cuenta: cuatro a la vez son unos diez segundos.
  if (!esManual) {
    for (const cuenta of cuentas) {
      try {
        await etiquetarPendientes(cuenta.id, 8)
      } catch (error) {
        errors.push(`[${cuenta.slug}] biblioteca: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  // En manual se procesa antes de drenar, para que lo recien encolado (un post o
  // un carrusel de un angulo ya hecho) quede materializado en la misma pasada.
  if (esManual) {
    try {
      await procesarBuzones(disparoBuzones, presupuesto)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  // ------------------------------------------- angulos que esperan contenido
  //
  // Va antes de drenar a proposito: encolar es una escritura y drenar es
  // dibujar carruseles a casi veinte segundos cada uno. Con este paso al final,
  // el tick se quedaba sin tiempo antes de llegar a el y los angulos no
  // entraban nunca en la cola, por mucho que sus agentes estuvieran en
  // automatico. Lo barato primero.
  //
  // El encolado de contenido vivia solo dentro del drenaje del trabajo de
  // angulo: se generaba en la misma pasada en que nacia el angulo, y si no, no
  // se generaba nunca. Bastaba con que el agente de la red estuviera apagado o
  // en manual ese dia, o con borrar una pieza para rehacerla, para que el
  // angulo se quedara ahi parado para siempre sin que nada volviera a mirarlo.
  //
  // Esto lo recoge: los angulos sin pieza ni buzon de una red cuyo agente si
  // corre solo. Es la misma decision de antes, pero tomada cada pasada en vez
  // de una sola vez.
  for (const cuenta of cuentas) {
    try {
      const redes = await redesQueGeneranSolas(cuenta.id)
      if (redes.length === 0) continue

      // Se miran muchos mas de los que se van a encolar y se recorta al final.
      // Al reves —coger cinco y filtrar despues— basta con que los cinco mas
      // viejos esten bloqueados para que ninguna pasada avance nunca, y eso es
      // exactamente lo que pasaba: los cinco primeros ya tenian buzon, se
      // descartaban los cinco, y los que si hacian falta no entraban al cupo.
      const { data: pendientes, error } = await supabase
        .from("content_angles")
        .select("*")
        .eq("account_id", cuenta.id)
        .in("status", ["angled", "pending_generation"])
        .order("created_at", { ascending: true })
        .limit(VENTANA_DE_ANGULOS)

      if (error) throw new Error(error.message)
      const candidatos = (pendientes ?? []) as ContentAngle[]
      if (candidatos.length === 0) continue

      const ids = candidatos.map((a) => a.id)
      const [{ data: piezasYa }, { data: igYa }, { data: liYa }] = await Promise.all([
        supabase.from("content_pieces").select("content_angle_id, network").in("content_angle_id", ids),
        // Solo los buzones vivos. Uno ya consumido que no dejo pieza —fallo, o
        // se borro la pieza despues— no puede bloquear el angulo para siempre:
        // asi es como veintisiete se quedaron parados sin que nada los tocara.
        supabase
          .from("jobs_instagram")
          .select("content_angle_id")
          .in("content_angle_id", ids)
          .is("consumed_at", null),
        supabase
          .from("jobs_linkedin")
          .select("content_angle_id")
          .in("content_angle_id", ids)
          .is("consumed_at", null),
      ])

      const hecho = new Set<string>()
      for (const p of (piezasYa ?? []) as { content_angle_id: string; network: string }[]) {
        hecho.add(`${p.content_angle_id}:${p.network}`)
      }
      // Un buzon sin consumir cuenta como hecho: la pieza esta en camino y
      // encolar otra vez seria pagar dos veces la misma generacion.
      for (const j of (igYa ?? []) as { content_angle_id: string }[]) {
        hecho.add(`${j.content_angle_id}:instagram`)
        hecho.add(`${j.content_angle_id}:facebook`)
      }
      for (const j of (liYa ?? []) as { content_angle_id: string }[]) {
        hecho.add(`${j.content_angle_id}:linkedin`)
      }

      const angulos = candidatos
        .filter((a) => redes.some((red) => !hecho.has(`${a.id}:${red}`)))
        .slice(0, MAX_AUTO_POR_TICK)
      if (angulos.length === 0) continue

      const config = await configDe(cuenta.id)
      const noticias = await loadNews(angulos.map((a) => a.raw_news_id))

      for (const angle of angulos) {
        const news = noticias.get(angle.raw_news_id)
        if (!news) continue

        if (redes.includes("linkedin") && !hecho.has(`${angle.id}:linkedin`)) {
          try {
            await enqueueLinkedinJob(angle, news, config.variables)
            linkedinQueued++
            log.emit("content.linkedin.queued", "Post encolado desde un angulo a la espera", {
              accountId: cuenta.id,
              angleId: angle.id,
            })
          } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e))
          }
        }

        // Instagram y Facebook comparten guion: un solo encolado con los
        // destinos que falten, no uno por red.
        const destinos = redes.filter(
          (red): red is DestinoCarrusel =>
            (red === "instagram" || red === "facebook") && !hecho.has(`${angle.id}:${red}`)
        )
        if (destinos.length > 0) {
          try {
            await enqueueInstagramJob(angle, news, config.variables, null, destinos)
            log.emit("content.instagram.queued", "Carrusel encolado desde un angulo a la espera", {
              accountId: cuenta.id,
              angleId: angle.id,
              destinos,
            })
          } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e))
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`[${cuenta.slug}] ${message}`)
    }
  }

  // ------------------------------------------------------------ angulos hechos
  const angleJobs = await claimAngleJobs(presupuesto)
  angleJobsConsumed = angleJobs.length

  for (const job of angleJobs as JobAngle[]) {
    if (job.status === "failed") {
      failedJobs++
      log.emit("content.angle.failed", "El agente no pudo escribir el angulo", {
        accountId: job.account_id,
        jobId: job.id,
        error: job.error,
      })
      continue
    }

    let angulos
    try {
      angulos = parseAngleResponse(job.respuesta)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failedJobs++
      errors.push(message)
      await markJobUnreadable("jobs_angle", job.id, message)
      log.emit("content.angle.failed", "Respuesta de angulo ilegible", {
        accountId: job.account_id,
        jobId: job.id,
        error: message,
      })
      continue
    }

    const filas = angulos.map((angulo, index) => ({
      account_id: job.account_id,
      raw_news_id: job.raw_news_id,
      job_angle_id: job.id,
      angle: angulo.angle,
      thesis: angulo.thesis,
      playbook_format: angulo.playbook_format,
      clasificacion: angulo.clasificacion,
      position: index,
    }))

    const { data, error } = await supabase.from("content_angles").insert(filas).select("*")
    if (error) {
      errors.push(error.message)
      log.emit("content.angle.failed", "No se pudieron guardar los angulos", {
        accountId: job.account_id,
        jobId: job.id,
        error: error.message,
      })
      continue
    }

    const creados = (data ?? []) as ContentAngle[]
    anglesCreated += creados.length
    log.emit("content.angle.created", `${creados.length} angulos guardados`, {
      jobId: job.id,
      rawNewsId: job.raw_news_id,
    })

    // En automatico se genera una pieza por cada red configurada, todas desde el
    // primer angulo propuesto; en manual esperan a que el usuario
    // elija cual convertir y para donde. Que compartan angulo es lo que hace que
    // el post y el carrusel cuenten lo mismo con distinta forma.
    //
    // Que redes se generan solas ya no es una lista aparte: lo dice el modo de
    // cada agente de contenido. Un agente en manual no encola nada y su pieza
    // espera a que alguien la pida desde el tablero, que es exactamente lo que
    // significaba sacar esa red de la lista, pero dicho donde se configura.
    const config = await configDe(job.account_id)
    const redesAutomaticas = await redesQueGeneranSolas(job.account_id)
    if (creados.length > 0 && redesAutomaticas.length > 0) {
      const primero = creados.reduce((a, b) => (a.position <= b.position ? a : b))
      const news = (await loadNews([job.raw_news_id])).get(job.raw_news_id)
      if (news) {
        let algunaEncolada = false

        if (redesAutomaticas.includes("linkedin")) {
          try {
            await enqueueLinkedinJob(primero, news, config.variables)
            linkedinQueued++
            algunaEncolada = true
            log.emit("content.linkedin.queued", "Post encolado en automatico", {
              accountId: job.account_id,
              angleId: primero.id,
            })
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error))
          }
        }

        // Instagram y Facebook comparten trabajo: el agente escribe un guion y
        // de el salen las piezas de las redes elegidas. Un solo encolado con
        // los destinos, en vez de uno por red, que pediria el mismo guion dos
        // veces.
        const destinos = redesAutomaticas.filter(
          (red): red is DestinoCarrusel => red === "instagram" || red === "facebook"
        )
        if (destinos.length > 0) {
          try {
            await enqueueInstagramJob(primero, news, config.variables, null, destinos)
            algunaEncolada = true
            log.emit("content.instagram.queued", "Carrusel encolado en automatico", {
              accountId: job.account_id,
              angleId: primero.id,
              destinos,
            })
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error))
          }
        }

        // Solo si algo llego a la cola: marcarlo con las dos caidas dejaria el
        // angulo en un estado que dice que se esta generando algo que no existe.
        if (algunaEncolada) {
          await supabase
            .from("content_angles")
            .update({ status: "pending_generation" })
            .eq("id", primero.id)
        }
      }
    }
  }

  // ------------------------------------------------------------- posts hechos
  const linkedinJobs = await claimLinkedinJobs(presupuesto)
  linkedinJobsConsumed = linkedinJobs.length

  for (const job of linkedinJobs as JobLinkedin[]) {
    if (job.status === "failed") {
      failedJobs++
      log.emit("content.linkedin.failed", "El agente no pudo escribir el post", {
        accountId: job.account_id,
        jobId: job.id,
        error: job.error,
      })
      continue
    }

    let post
    try {
      post = parseLinkedinResponse(job.respuesta)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failedJobs++
      errors.push(message)
      await markJobUnreadable("jobs_linkedin", job.id, message)
      log.emit("content.linkedin.failed", "Respuesta de post ilegible", {
        accountId: job.account_id,
        jobId: job.id,
        error: message,
      })
      continue
    }

    const { data: angleRow } = await supabase
      .from("content_angles")
      .select("id, raw_news_id")
      .eq("id", job.content_angle_id)
      .maybeSingle()

    const variablesUsadas = (job.input?.variables ?? null) as Variables | null

    const { error } = await supabase.from("content_pieces").insert({
      account_id: job.account_id,
      content_angle_id: job.content_angle_id,
      raw_news_id: (angleRow as { raw_news_id: string } | null)?.raw_news_id ?? null,
      job_linkedin_id: job.id,
      network: "linkedin",
      payload: post,
      status: "generated",
      variables_usadas: variablesUsadas,
      generated_at: new Date().toISOString(),
      revision: await revisionDeRespuesta(job.account_id, "linkedin", job.respuesta, job.input),
    })

    // 23505 es el indice de una pieza por red: ya hay post de LinkedIn de esta
    // noticia. No es un fallo, es que alguien llego antes.
    if (error && error.code !== "23505") {
      errors.push(error.message)
      log.emit("content.linkedin.failed", "No se pudo guardar la pieza", {
        accountId: job.account_id,
        jobId: job.id,
        error: error.message,
      })
      continue
    }

    if (!error) piecesCreated++
    await supabase
      .from("content_angles")
      .update({ status: "generated" })
      .eq("id", job.content_angle_id)

    log.emit("content.piece.created", "Pieza de LinkedIn generada", {
      jobId: job.id,
      angleId: job.content_angle_id,
    })
  }

  // -------------------------------------------------------- carruseles hechos
  //
  // Instagram tiene un paso mas que LinkedIn: ademas de leer la respuesta hay
  // que dibujar las imagenes y subirlas. Ese trabajo puede fallar por motivos
  // ajenos al texto —una foto caida, el storage— y por eso va en su propio
  // try/catch: un carrusel roto no puede llevarse por delante la pasada.
  const instagramJobs = await claimInstagramJobs(presupuesto)
  instagramJobsConsumed = instagramJobs.length

  for (const job of instagramJobs) {
    if (job.status === "failed") {
      failedJobs++
      log.emit("content.instagram.failed", "El agente no pudo escribir el carrusel", {
        accountId: job.account_id,
        jobId: job.id,
        error: job.error,
      })
      continue
    }

    try {
      const news = await noticiaDelAngulo(job.content_angle_id)
      const configCuenta = await configDe(job.account_id)
      // Un trabajo viejo no trae destinos: era solo Instagram.
      const destinos = job.input?.destinos ?? ["instagram"]

      const carrusel = await generarCarrusel(
        job.id,
        job.respuesta,
        news,
        estiloDesdeConfig(configCuenta.carousel),
        await nichosDe(job.account_id),
        destinos.includes("facebook")
      )
      // La misma para Instagram y Facebook: las dos salen del mismo guion.
      const revision = await revisionDeRespuesta(job.account_id, "instagram", job.respuesta, job.input)

      // La pieza que se queda con los usos de las fotos de la biblioteca: la de
      // Instagram si la hay, si no la de Facebook, que lleva la portada.
      let piezaConFotos: { id: string; red: string } | null = null

      if (destinos.includes("instagram")) {
        const { data: creada, error } = await supabase.from("content_pieces").insert({
          account_id: job.account_id,
          content_angle_id: job.content_angle_id,
          raw_news_id: news?.id ?? null,
          job_instagram_id: job.id,
          network: "instagram",
          payload: carrusel,
          status: "generated",
          variables_usadas: (job.input?.variables ?? null) as Variables | null,
          generated_at: new Date().toISOString(),
          revision,
        }).select("id").single()

        // 23505 es el indice de una pieza por red: ya hay carrusel de esta
        // noticia, asi que no hay nada que hacer y tampoco nada que reportar.
        if (error && error.code !== "23505") throw new Error(error.message)
        if (!error) carouselsCreated++
        if (creada) piezaConFotos = { id: (creada as { id: string }).id, red: "instagram" }
      }

      await supabase
        .from("content_angles")
        .update({ status: "generated" })
        .eq("id", job.content_angle_id)

      // Facebook sale del mismo guion: la portada como imagen y el texto de las
      // laminas como descripcion. Las imagenes ya estan dibujadas y subidas
      // aunque Instagram no fuera destino; a Facebook solo le hace falta la
      // primera.
      if (destinos.includes("facebook") && (carrusel.portadaFacebook ?? carrusel.images[0])) {
        const { caption, hashtags, slides } = parseInstagramResponse(job.respuesta)
        const { data: creadaFb, error: errorFacebook } = await supabase.from("content_pieces").insert({
          account_id: job.account_id,
          content_angle_id: job.content_angle_id,
          raw_news_id: news?.id ?? null,
          job_instagram_id: job.id,
          network: "facebook",
          payload: armarPublicacionFacebook({
            slides,
            caption,
            hashtags,
            portada: carrusel.portadaFacebook ?? carrusel.images[0],
          }),
          status: "generated",
          variables_usadas: (job.input?.variables ?? null) as Variables | null,
          generated_at: new Date().toISOString(),
          revision,
        }).select("id").single()
        if (!piezaConFotos && creadaFb) piezaConFotos = { id: (creadaFb as { id: string }).id, red: "facebook" }
        if (errorFacebook && errorFacebook.code !== "23505") {
          // La de Instagram ya esta guardada; la de Facebook se puede rehacer
          // desde la interfaz. No merece tumbar el carrusel.
          errors.push(`Facebook: ${errorFacebook.message}`)
        } else {
          facebookCreated++
        }
      }

      if (piezaConFotos) await registrarUsos(job.account_id, piezaConFotos.id, piezaConFotos.red, carrusel.fotosBiblioteca)

      log.emit("content.carousel.created", `Carrusel de ${carrusel.slideCount} imagenes`, {
        accountId: job.account_id,
        jobId: job.id,
        slides: carrusel.slideCount,
        portadaSinFoto: carrusel.portadaSinFoto,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failedJobs++
      errors.push(message)
      await markJobUnreadable("jobs_instagram", job.id, message)
      log.emit("content.instagram.failed", "No se pudo generar el carrusel", {
        accountId: job.account_id,
        jobId: job.id,
        error: message,
      })
    }
  }

  // ------------------------------------------------------- seleccion automatica
  //
  // Sin umbral definido no se selecciona nada: el scoring lo decide el usuario
  // desde la interfaz, y encolar con un criterio inventado seria peor que no
  // encolar. El envio manual sigue disponible siempre, al margen de esto.
  // El tope es por cuenta, no por pasada: si no, la primera cuenta se comeria el
  // cupo entero y las demas no arrancarian hasta que se quedara sin candidatas.

  for (const cuenta of cuentas) {
    const config = await configDe(cuenta.id)
    if (config.score_threshold === null) continue

    // El umbral sigue siendo de la cuenta, pero quien decide si se avanza es el
    // agente de angulo: antes un unico interruptor mandaba sobre analisis,
    // angulo y contenido a la vez y no se podia afinar un paso sin tocar los otros.
    const suyo = await ajustesDe(cuenta.id, "angulo")
    const ajustesCuenta = await getSettings(cuenta.id)
    const turno = leToca(suyo, ajustesCuenta.timezone, new Date(), disparoAngulo)
    if (!turno.corre) continue
    if (suyo.mode === "programado") await marcarCorrida(cuenta.id, "angulo")

    try {
      const { data: candidatas, error } = await supabase
        .from("raw_news")
        .select("*")
        .eq("account_id", cuenta.id)
        .eq("status", "analyzed")
        .gte("relevance_score", config.score_threshold)
        // Con poco material no avanza sola: los agentes que escriben llenarian
        // las laminas inventando. A mano se puede, con aviso (ver material.ts).
        .eq("content_fetch_status", "success")
        // El umbral solo rige para lo que entro despues de fijarlo: cambiarlo no
        // resucita noticias viejas que en su dia no llegaron.
        .gte("created_at", config.score_threshold_updated_at)
        .order("relevance_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(MAX_AUTO_POR_TICK * 6)

      if (error) throw new Error(error.message)

      const noticias = (candidatas ?? []) as RawNews[]
      if (noticias.length === 0) continue

      // Las que ya pasaron por el pipeline no vuelven a entrar.
      const { data: yaEncoladas } = await supabase
        .from("jobs_angle")
        .select("raw_news_id")
        .in(
          "raw_news_id",
          noticias.map((n) => n.id)
        )

      const vistas = new Set(
        ((yaEncoladas ?? []) as { raw_news_id: string }[]).map((row) => row.raw_news_id)
      )

      const aspirantes = noticias
        .filter((n) => !vistas.has(n.id) && !n.duplicate_of_news_id)
        .slice(0, MAX_AUTO_POR_TICK)

      // Los hechos que ya tienen contenido. La ventana no es un detalle: mirar
      // solo la tanda actual dejaria pasar justo el caso que rompio esto, dos
      // posts del mismo anuncio generados con seis horas de diferencia en ticks
      // distintos. Y mirar todo el historico seria pagar un prompt enorme por
      // comparar con noticias que ya nadie va a repetir: las historias se
      // solapan durante dias, no durante meses.
      const desde = new Date(Date.now() - DIAS_DE_HECHOS_CUBIERTOS * 86_400_000).toISOString()
      const { data: cubiertas } = await supabase
        .from("raw_news")
        .select("id, title, content_angles!inner(id)")
        .eq("account_id", cuenta.id)
        .gte("created_at", desde)
        .limit(120)

      const yaCubiertas = ((cubiertas ?? []) as { id: string; title: string }[]).map((c) => ({
        id: c.id,
        title: c.title,
      }))

      const veredicto = await elegirPorHecho(
        cuenta.id,
        aspirantes.map((n) => ({
          id: n.id,
          title: n.title,
          score: n.relevance_score,
          created_at: n.created_at,
        })),
        yaCubiertas,
        (await modelosClaude(cuenta.id)).angulo
      )

      // La repetida no se borra: se marca y se enlaza con la que se quedo con el
      // hecho, para poder ver de cuantos medios salio y revisar el juicio.
      for (const [repetida, duena] of veredicto.repetidas) {
        await supabase
          .from("raw_news")
          .update({ status: "duplicate", duplicate_of_news_id: duena })
          .eq("id", repetida)
          .eq("account_id", cuenta.id)

        log.emit("content.angle.repetida", "Noticia descartada por contar un hecho ya cubierto", {
          accountId: cuenta.id,
          rawNewsId: repetida,
          mismoHechoQue: duena,
        })
      }

      const porId = new Map(aspirantes.map((n) => [n.id, n]))

      for (const elegida of veredicto.elegidas) {
        const news = porId.get(elegida.id)
        if (!news) continue
        await enqueueAngleJob(news, config.variables)
        anglesQueued++
        log.emit("content.angle.queued", "Noticia enviada al pipeline en automatico", {
          accountId: cuenta.id,
          rawNewsId: news.id,
          score: news.relevance_score,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`[${cuenta.slug}] ${message}`)
    }
  }

  // -------------------------------------------------------------- publicacion
  //
  // Se publica aqui y no al generar la pieza para que las tandas funcionen sin
  // nadie delante: el cron y los triggers pasan por esta misma pasada, y es
  // quien decide si a esta red le toca ahora.
  //

  for (const cuenta of cuentas) {
    try {
      // La zona horaria es de la cuenta: dos cuentas pueden publicar "a las
      // nueve" y no ser el mismo momento.
      const ajustes = await getSettings(cuenta.id)

      for (const programa of await getPublishSchedules(cuenta.id)) {
        // El modo del agente de publicacion manda sobre el horario viejo: cada
        // canal puede estar en manual, programado o automatico por separado.
        const suyo = await ajustesDe(cuenta.id, "publicacion", programa.network)
        const aMano =
          forzados.has("publicacion") &&
          (!options.forzarCanal || options.forzarCanal === programa.network)
        const turno = leToca(suyo, ajustes.timezone, new Date(), aMano ? "manual" : "auto")
        if (!turno.corre) continue

        const cuantas = suyo.batch_size ?? programa.batch_size
        const piezas = await pendingToPublish(cuenta.id, programa.network, cuantas)
        if (piezas.length === 0) continue

        const decision = { motivo: turno.motivo }

        for (const pieza of piezas) {
          const result = await publishPiece(pieza.id)
          if (result.ok) {
            piecesPublished++
            log.emit("content.piece.published", `Pieza publicada en ${programa.network}`, {
              accountId: cuenta.id,
              pieceId: pieza.id,
              urn: result.urn,
              tanda: decision.motivo,
            })
          } else {
            errors.push(result.error)
            log.emit("content.publish.failed", "No se pudo publicar", {
              accountId: cuenta.id,
              pieceId: pieza.id,
              error: result.error,
            })
          }
        }

        // Se cierra la tanda aunque alguna haya fallado: reintentarla entera
        // cinco minutos despues republicaria las que si salieron.
        await marcarTanda(cuenta.id, programa.network)
        if (suyo.mode === "programado") {
          await marcarCorrida(cuenta.id, "publicacion", programa.network)
        }
      }
    } catch (error) {
      // Cada cuenta en su propio try: que una tenga LinkedIn caducado no puede
      // impedir que las demas publiquen.
      errors.push(
        `[${cuenta.slug}] ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  // --------------------------------------------------------- procesar buzones
  //
  // Los agentes de angulo, LinkedIn e Instagram, con una llamada directa a Claude.
  // Llena `respuesta` en los buzones; el drenaje de la proxima pasada lo
  // materializa igual que antes.
  //
  // Va al final y solo si queda tiempo. Las dos mitades caras de una pasada son
  // esta —unos quince segundos de Claude— y dibujar un carrusel, que son casi
  // veinte: juntas rozan el minuto que hay, y una pasada cortada es peor que
  // una lenta, porque deja trabajos reclamados que nadie toca en media hora.
  // Si el drenaje ya gasto el presupuesto de tiempo, esto lo hace la siguiente.
  const gastado = Date.now() - started.getTime()
  if (gastado > MARGEN_PARA_GENERAR) {
    log.emit("content.tick.aplazado", "Se aplaza generar a la siguiente pasada", {
      gastadoMs: gastado,
    })
  }

  try {
    const res =
      gastado > MARGEN_PARA_GENERAR
        ? { procesadas: 0, fallidas: 0, errores: [] as string[] }
        : await procesarBuzones(disparoBuzones, presupuesto)
    if (res.procesadas > 0 || res.fallidas > 0) {
      log.emit("content.jobs.procesados", `${res.procesadas} trabajos procesados`, {
        procesadas: res.procesadas,
        fallidas: res.fallidas,
      })
    }
    for (const e of res.errores) errors.push(e)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  const durationMs = Date.now() - started.getTime()
  log.emit("content.tick.completed", "Revision terminada", {
    anglesCreated,
    piecesCreated,
    carouselsCreated,
    anglesQueued,
    linkedinQueued,
    durationMs,
  })
  await log.flush()

  return {
    startedAt: started.toISOString(),
    durationMs,
    trigger,
    anglesQueued,
    angleJobsConsumed,
    anglesCreated,
    linkedinQueued,
    linkedinJobsConsumed,
    piecesCreated,
    instagramJobsConsumed,
    carouselsCreated,
    facebookCreated,
    piecesPublished,
    failedJobs,
    noticiasAnalizadas,
    errors,
  }
}

export { MAX_DRENAJE_POR_TICK }


