import { ajustesDe, type Agente } from "../agents/settings"
import { modeloDe } from "../agents/modelos"
import { promptDe } from "../agents/prompts"
import { leToca } from "../agents/turno"
import { getSettings } from "../schedule"
import { supabaseAdmin } from "../supabase-admin"
import { generarAngulo, generarInstagram, generarLinkedin } from "./agentes"
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

async function procesarBuzon(
  tabla: Buzon,
  agent: Agente,
  agente: (input: unknown, accountId: string) => Promise<{ respuesta: unknown }>,
  disparo: Disparo,
  limite: number
): Promise<{ procesadas: number; fallidas: number; errores: string[] }> {
  const supabase = supabaseAdmin()

  const { data, error } = await supabase
    .from(tabla)
    .select("id, input, account_id")
    .eq("status", "pending")
    .is("consumed_at", null)
    .order("created_at", { ascending: true })
    .limit(limite)

  if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`)
  const jobs = (data ?? []) as { id: string; input: unknown; account_id: string }[]

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

    // Reclamo atomico: si otra pasada ya lo tomo, `claimed` viene vacio.
    const { data: claimed } = await supabase
      .from(tabla)
      .update({ status: "processing" })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle()
    if (!claimed) continue

    try {
      const { respuesta } = await agente(job.input, job.account_id)
      const { error: errDone } = await supabase
        .from(tabla)
        .update({ respuesta, status: "done", processed_at: new Date().toISOString() })
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
  const limite = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  for (const tabla of ["jobs_angle", "jobs_linkedin", "jobs_instagram"] as const) {
    await supabase
      .from(tabla)
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt("created_at", limite)
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
  maxPorBuzon: number = MAX_POR_TICK
): Promise<{
  procesadas: number
  fallidas: number
  errores: string[]
}> {
  await reclamarColgados()

  const resultados = [
    await procesarBuzon("jobs_angle", "angulo", async (input, cuenta) =>
      generarAngulo(
        cuenta,
        input as AngleJobInput,
        await modeloDe(cuenta, "angulo"),
        await promptDe(cuenta, "angulo")
      ), disparo, maxPorBuzon
    ),
    await procesarBuzon("jobs_linkedin", "linkedin", async (input, cuenta) =>
      generarLinkedin(
        cuenta,
        input as LinkedinJobInput,
        await modeloDe(cuenta, "linkedin"),
        await promptDe(cuenta, "linkedin")
      ), disparo, maxPorBuzon
    ),
    await procesarBuzon("jobs_instagram", "instagram", async (input, cuenta) =>
      generarInstagram(
        cuenta,
        input as LinkedinJobInput,
        await modeloDe(cuenta, "instagram"),
        await promptDe(cuenta, "instagram")
      ), disparo, maxPorBuzon
    ),
  ]

  return {
    procesadas: resultados.reduce((n, r) => n + r.procesadas, 0),
    fallidas: resultados.reduce((n, r) => n + r.fallidas, 0),
    errores: resultados.flatMap((r) => r.errores),
  }
}
