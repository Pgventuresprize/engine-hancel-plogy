import { supabaseAdmin } from "../supabase-admin"

/**
 * Los agentes del motor y como se comportan.
 *
 * Antes esto vivia en tres sitios que no se hablaban: `engine_settings` mandaba
 * sobre la ingesta, un unico `generation_mode` sobre toda la generacion y
 * `publish_schedule` sobre cada red. Con un solo interruptor para analisis,
 * angulo y contenido no se podia decir "analiza solo, pero el post lo escribo
 * yo", que es justo lo que hace falta al afinar un agente.
 */

export const AGENTES = [
  "extraccion",
  "analisis",
  "angulo",
  "instagram",
  "linkedin",
  "revisor",
  "publicacion",
  "redaccion",
] as const

export type Agente = (typeof AGENTES)[number]

/**
 * Cuando corre un agente.
 *
 * - `manual`: no corre solo. Se dispara desde el tablero, con el boton de la
 *   etapa o arrastrando la tarjeta.
 * - `programado`: corre a las horas marcadas. Entre medias el trabajo se
 *   acumula, y cada pasada vacia lo que haya.
 * - `automatico`: corre en cuanto el paso anterior le entrega trabajo.
 *
 * Los tres son estados independientes, no un interruptor con variantes: eso es
 * lo que permite tener la extraccion a las 11 y el analisis al instante.
 */
export const MODOS = ["manual", "programado", "automatico"] as const
export type Modo = (typeof MODOS)[number]

export const NOMBRE_MODO: Record<Modo, string> = {
  manual: "Manual",
  programado: "Programado",
  automatico: "Automatico",
}

export type AjustesAgente = {
  agent: Agente
  /**
   * Si el agente esta en servicio.
   *
   * Distinto del modo: "manual" es "lo disparas tu"; apagado es "este paso no
   * existe para esta cuenta". Sin la distincion, la unica forma de no publicar
   * en una red era dejarla en manual y no pulsar nunca, con su columna ocupando
   * sitio en el tablero para siempre.
   */
  enabled: boolean
  /** Solo lo usa publicacion, que tiene un horario por red. Vacio en el resto. */
  canal: string
  mode: Modo
  /**
   * Los minutos del dia en que corre, de 0 a 1439.
   *
   * Antes eran una lista de horas y un unico minuto para todas, asi que se
   * podia pedir "9:30 y 18:30" pero no "9:10 y 9:30": el minuto era del agente
   * y no de cada pasada. Para publicar varias veces dentro de la misma hora eso
   * no sirve.
   */
  run_at: number[]
  batch_size: number | null
  last_run_at: string | null
  /** `null` = el que trae el codigo. Se escribe solo al editarlo. */
  prompt: string | null
  model: string | null
}

/**
 * Lo que vale cuando la fila no existe todavia.
 *
 * Automatico para los pasos intermedios, que es lo que se espera de un pipeline
 * recien montado; la extraccion arranca en manual porque encender sola una
 * cuenta nueva y ponerse a gastar busquedas seria una sorpresa desagradable.
 */
function porDefecto(agent: Agente, canal: string): AjustesAgente {
  return {
    agent,
    canal,
    enabled: true,
    mode: agent === "extraccion" ? "manual" : "automatico",
    run_at: [],
    batch_size: null,
    last_run_at: null,
    prompt: null,
    model: null,
  }
}

function normalizar(fila: Record<string, unknown>): AjustesAgente {
  const modo = String(fila.mode ?? "")
  return {
    agent: fila.agent as Agente,
    canal: String(fila.canal ?? ""),
    enabled: fila.enabled !== false,
    mode: (MODOS as readonly string[]).includes(modo) ? (modo as Modo) : "manual",
    run_at: Array.isArray(fila.run_at)
      ? [...new Set(fila.run_at as number[])]
          .filter((m) => Number.isInteger(m) && m >= 0 && m <= 1439)
          .sort((a, b) => a - b)
      : [],
    batch_size: typeof fila.batch_size === "number" ? fila.batch_size : null,
    last_run_at: (fila.last_run_at as string | null) ?? null,
    prompt: (fila.prompt as string | null) ?? null,
    model: (fila.model as string | null) ?? null,
  }
}

/** Todos los ajustes de una cuenta, incluidos los agentes sin fila. */
export async function ajustesDeCuenta(accountId: string): Promise<AjustesAgente[]> {
  const { data, error } = await supabaseAdmin()
    .from("agent_settings")
    .select("*")
    .eq("account_id", accountId)

  if (error) throw new Error(`No se pudieron leer los agentes: ${error.message}`)

  const filas = ((data ?? []) as Record<string, unknown>[]).map(normalizar)
  const faltantes = AGENTES.filter(
    (a) => a !== "publicacion" && !filas.some((f) => f.agent === a)
  ).map((a) => porDefecto(a, ""))

  return [...filas, ...faltantes]
}

/** Los ajustes de un agente. Publicacion pide ademas el canal. */
export async function ajustesDe(
  accountId: string,
  agent: Agente,
  canal = ""
): Promise<AjustesAgente> {
  const { data, error } = await supabaseAdmin()
    .from("agent_settings")
    .select("*")
    .eq("account_id", accountId)
    .eq("agent", agent)
    .eq("canal", canal)
    .maybeSingle()

  if (error) throw new Error(`No se pudieron leer los ajustes de ${agent}: ${error.message}`)
  return data ? normalizar(data as Record<string, unknown>) : porDefecto(agent, canal)
}

/**
 * Los tres agentes de contenido comparten prompt y modo con Instagram.
 *
 * Facebook no tiene agente propio: su pieza sale del guion que escribio el de
 * Instagram, sin una sola llamada de mas. Su pagina existe para ver eso —el
 * mismo prompt, el mismo modo y las dos redes conectadas— pero lo que se guarda
 * es siempre la fila de Instagram.
 */
export function agenteReal(agent: Agente | "facebook"): Agente {
  return agent === "facebook" ? "instagram" : agent
}

export async function guardarAjustes(
  accountId: string,
  agent: Agente,
  canal: string,
  cambios: Partial<
    Pick<
      AjustesAgente,
      "enabled" | "mode" | "run_at" | "batch_size" | "prompt" | "model"
    >
  >
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("agent_settings")
    .upsert(
      {
        account_id: accountId,
        agent,
        canal,
        ...cambios,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,agent,canal" }
    )

  if (error) throw new Error(`No se pudieron guardar los ajustes: ${error.message}`)
}

/** Anota que un agente programado ya hizo su tanda de esta hora. */
export async function marcarCorrida(
  accountId: string,
  agent: Agente,
  canal = ""
): Promise<void> {
  await supabaseAdmin()
    .from("agent_settings")
    .update({ last_run_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("agent", agent)
    .eq("canal", canal)
}
