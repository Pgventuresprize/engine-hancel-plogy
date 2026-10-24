import { ajustesDe, type Agente } from "../agents/settings"
import { conContexto } from "../claude/contexto"
import { modeloDe } from "../agents/modelos"
import type { Receta } from "../agents/armador"
import { promptPara } from "../agents/prompts"
import { leToca } from "../agents/turno"
import { getSettings } from "../schedule"
import { supabaseAdmin } from "../supabase-admin"
import {
  DURACION_VERSION_MS,
  generarAngulo,
  generarInstagram,
  generarLinkedin,
  situacionDe,
  type Aplazada,
  type Plazo,
} from "./agentes"
import type { AngleJobInput, LinkedinJobInput } from "./types"

/**
 * Procesa los buzones llamando a los agentes.
 *
 * Lee `pending`, llama al agente, escribe `respuesta` y marca `done`. El
 * resto del tick (drenaje, parseo, materializacion) no cambia: sigue leyendo
 * `respuesta` igual que antes.
 *
 * El reclamo es un compare-and-set: `pending -> processing` por fila. Si dos
 * pasadas se solapan, solo una se queda cada trabajo; la otra lo salta.
 */

const MAX_POR_TICK = 10

type Buzon = "jobs_angle" | "jobs_linkedin" | "jobs_instagram"

const RED_DEL_BUZON: Record<Buzon, string | undefined> = {
  jobs_angle: undefined,
  jobs_linkedin: "linkedin",
  jobs_instagram: "instagram",
}

/**
 * Lo que devuelve un agente: la respuesta terminada, o la pieza aplazada con lo
 * que lleva (ver `Plazo` en agentes.ts) para que la siguiente pasada siga.
 */
type Resultado = { respuesta: unknown; receta?: Receta } | (Aplazada & { receta?: Receta })

async function procesarBuzon(
  tabla: Buzon,
  agent: Agente,
  agente: (input: unknown, accountId: string, plazo: Plazo) => Promise<Resultado>,
  disparo: Disparo,
  limite: number,
  hasta: number
): Promise<{ procesadas: number; fallidas: number; errores: string[] }> {
  const supabase = supabaseAdmin()

  const { data, error } = await supabase
    .from(tabla)
    .select("id, input, account_id, respuesta")
    .eq("status", "pending")
    .is("consumed_at", null)
    .order("created_at", { ascending: true })
    .limit(limite)

  if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`)
  const jobs = (data ?? []) as { id: string; input: unknown; account_id: string; respuesta: unknown }[]

  // El modo es por cuenta, y en un buzon caben trabajos de varias. Se resuelve
  // una vez por cuenta y no por trabajo: son dos consultas que se repetirian
  // diez veces por pasada sin cambiar de respuesta.
  const puede = new Map<string, boolean>()
  for (const accountId of new Set(jobs.map((j) => j.account_id))) {
    const [ajustes, ajustesCuenta] = await Promise.all([
      ajustesDe(accountId, agent),
      getSettings(accountId),
    ])
    puede.set(
      accountId,
      leToca(ajustes, ajustesCuenta.timezone, new Date(), disparo).corre
    )
  }

  let procesadas = 0
  let fallidas = 0
  const errores: string[] = []

  for (const job of jobs) {
    // En manual el trabajo se queda en la cola hasta que alguien lo dispare, y
    // en programado hasta que llegue su hora. Esa cola es justo lo que hace
    // util el modo: el trabajo no se pierde, espera.
    if (!puede.get(job.account_id)) continue

    // Sin tiempo para una etapa entera no se empieza: se queda en la cola para
    // la siguiente pasada, que llega en cinco minutos. Empezarla era cortarla.
    if (Date.now() + DURACION_VERSION_MS > hasta) break

    // Reclamo atomico: si otra pasada ya lo tomo, `claimed` viene vacio.
    // Mientras esta en 'processing', processed_at dice cuando se reclamo: es lo
    // que mira reclamarColgados para saber que una pasada murio con el.
    const { data: claimed } = await supabase
      .from(tabla)
      .update({ status: "processing", processed_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle()
    if (!claimed) continue

    try {
      const pendiente = (job.respuesta as { pendiente?: Plazo["pendiente"] } | null)?.pendiente ?? null
      // El gasto de Claude de este trabajo queda anotado con su noticia; el
      // angulo es compartido entre las piezas, los otros son de su red.
      const noticia = (job.input as { raw_news?: { id?: string } } | null)?.raw_news?.id
      const r = await conContexto({ noticia, red: RED_DEL_BUZON[tabla] }, () =>
        agente(job.input, job.account_id, { hasta, pendiente })
      )
      // Aplazada: vuelve a la cola con lo que lleva, y la siguiente pasada
      // sigue desde ahi en vez de escribirla otra vez.
      const { error: errDone } = await supabase
        .from(tabla)
        .update(
          "aplazada" in r
            ? { respuesta: { pendiente: r.pendiente }, receta: r.receta ?? null, status: "pending", processed_at: null }
            : { respuesta: r.respuesta, receta: r.receta ?? null, status: "done", processed_at: new Date().toISOString() }
        )
        .eq("id", job.id)
      if (errDone) throw new Error(errDone.message)
      procesadas++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await supabase
        .from(tabla)
        .update({ status: "failed", error: msg.slice(0, 1000), processed_at: new Date().toISOString() })
        .eq("id", job.id)
      fallidas++
      errores.push(`[${tabla}] ${msg}`)
    }
  }

  return { procesadas, fallidas, errores }
}

/**
 * Devuelve a la cola los trabajos que quedaron 'processing' colgados.
 *
 * El motor procesa en segundos dentro de un tick, asi que un 'processing' de mas
 * de media hora solo puede ser un tick que se cayo a mitad. Se reclama para que
 * el siguiente lo reintente, en vez de quedar perdido para siempre.
 */
async function reclamarColgados(): Promise<void> {
  const supabase = supabaseAdmin()
  // Una pasada vive como mucho 300 s: reclamado hace mas de seis minutos, la
  // pasada que lo tenia ya no existe. Antes se contaba desde que se creo el
  // trabajo y una pasada cortada lo dejaba parado media hora.
  const reclamadoAntes = new Date(Date.now() - 6 * 60 * 1000).toISOString()
  // Los reclamados antes de anotar la hora del reclamo, por su antiguedad.
  const creadoAntes = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  for (const tabla of ["jobs_angle", "jobs_linkedin", "jobs_instagram"] as const) {
    await supabase
      .from(tabla)
      .update({ status: "pending", processed_at: null })
      .eq("status", "processing")
      .or(`processed_at.lt.${reclamadoAntes},and(processed_at.is.null,created_at.lt.${creadoAntes})`)
  }
}

/** Que dispara la pasada. A mano se ignora el horario del agente. */
export type Disparo = "auto" | "manual"

export async function procesarBuzones(
  disparo: Disparo = "auto",
  /**
   * Cuantos trabajos toma de cada buzon.
   *
   * Se acota cuando alguien espera delante: una pasada a mano corre dentro del
   * limite de tiempo de una peticion, y vaciar una cola de treinta lo agota
   * mucho antes de terminar. La cola no se pierde, la recoge el tick.
   */
  maxPorBuzon: number = MAX_POR_TICK,
  /** Cuando se acaba la pasada (ms). Ninguna etapa empieza si no le cabe antes. */
  hasta: number = Date.now() + 285_000
): Promise<{
  procesadas: number
  fallidas: number
  errores: string[]
}> {
  await reclamarColgados()

  // El prompt se arma por trabajo, con la situacion de su pieza: el angulo
  // todavia no esta clasificado y recibe lo de siempre; LinkedIn e Instagram
  // reciben ademas lo que toca a su pilar, su CTA y sus senales. La receta de
  // como se armo se guarda con el trabajo.
  const angulos = await procesarBuzon("jobs_angle", "angulo", async (input, cuenta) => {
    const armado = await promptPara(cuenta, "angulo", null)
    const r = await generarAngulo(cuenta, input as AngleJobInput, await modeloDe(cuenta, "angulo"), armado)
    return { ...r, receta: armado.receta }
  }, disparo, maxPorBuzon, hasta)
  const posts = await procesarBuzon("jobs_linkedin", "linkedin", async (input, cuenta, plazo) => {
    const armado = await promptPara(cuenta, "linkedin", situacionDe(input as LinkedinJobInput), (input as LinkedinJobInput).raw_news.id)
    const r = await generarLinkedin(cuenta, input as LinkedinJobInput, await modeloDe(cuenta, "linkedin"), armado, plazo)
    return { ...r, receta: armado.receta }
  }, disparo, maxPorBuzon, hasta)
  // En una pasada acotada, una sola pieza: con el criterio y el revisor con
  // Claude, un post son unos 170 s y un carrusel hasta 220 s, y juntos pasan de
  // los 300 s del tick. La pasada cortada dejaba el carrusel colgado media hora
  // y tiraba lo gastado. Al terminar el post salta el aviso y la siguiente
  // pasada recoge el carrusel enseguida.
  const unaPieza = maxPorBuzon <= 1 && posts.procesadas + posts.fallidas > 0
  const carruseles = unaPieza
    ? { procesadas: 0, fallidas: 0, errores: [] as string[] }
    : await procesarBuzon("jobs_instagram", "instagram", async (input, cuenta, plazo) => {
        const armado = await promptPara(cuenta, "instagram", situacionDe(input as LinkedinJobInput), (input as LinkedinJobInput).raw_news.id)
        const r = await generarInstagram(cuenta, input as LinkedinJobInput, await modeloDe(cuenta, "instagram"), armado, plazo)
        return { ...r, receta: armado.receta }
      }, disparo, maxPorBuzon, hasta)
  const resultados = [angulos, posts, carruseles]

  return {
    procesadas: resultados.reduce((n, r) => n + r.procesadas, 0),
    fallidas: resultados.reduce((n, r) => n + r.fallidas, 0),
    errores: resultados.flatMap((r) => r.errores),
  }
}
