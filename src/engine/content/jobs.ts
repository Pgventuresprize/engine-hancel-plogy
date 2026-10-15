import type { RawNews } from "@/lib/types"

import { supabaseAdmin } from "../supabase-admin"
import { mergeVariables, parseVariables } from "./variables"
import { REDES, type DestinoCarrusel } from "./types"
import type {
  AngleJobInput,
  ContentAngle,
  GenerationConfig,
  JobAngle,
  JobInstagram,
  JobLinkedin,
  LinkedinJobInput,
  Red,
  Variables,
} from "./types"

/**
 * Encolado y drenaje de los buzones.
 *
 * El contrato del buzon: quien encola escribe `input` y deja la fila en
 * 'pending'; el agente escribe `respuesta` y marca 'done' o 'failed'. La app
 * nunca toca `status` despues de crearla — solo `consumed_at` — y de ahi que el
 * trigger de aviso, que vigila `status`, no se despierte a si mismo en bucle.
 */

/** Tope por pasada, para que un tick no intente encolar el archivo entero. */
export const MAX_DRENAJE_POR_TICK = 25

/** Recorta el articulo: el buzon no es sitio para guardar megabytes de texto. */
const MAX_CONTENIDO = 12_000

export async function getGenerationConfig(accountId: string): Promise<GenerationConfig> {
  const { data, error } = await supabaseAdmin()
    .from("generation_config")
    .select(
      "variables, score_threshold, score_threshold_updated_at, redaccion_score_threshold, generation_mode, auto_networks, autopublish, carousel, updated_at"
    )
    .eq("account_id", accountId)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la configuracion de generacion: ${error.message}`)

  const row = (data ?? {}) as Partial<GenerationConfig>
  return {
    variables: parseVariables(row.variables),
    score_threshold: typeof row.score_threshold === "number" ? row.score_threshold : null,
    score_threshold_updated_at: row.score_threshold_updated_at ?? new Date(0).toISOString(),
    redaccion_score_threshold: typeof row.redaccion_score_threshold === "number" ? row.redaccion_score_threshold : null,
    generation_mode: row.generation_mode === "auto" ? "auto" : "manual",
    auto_networks: parseRedes(row.auto_networks),
    autopublish: row.autopublish === true,
    carousel: row.carousel ?? {},
    updated_at: row.updated_at ?? new Date(0).toISOString(),
  }
}

/**
 * Normaliza la lista de redes del automatico.
 *
 * Se filtra contra `REDES` en vez de confiar en la columna porque una red que se
 * retire del codigo puede seguir escrita en filas viejas, y encolar para una red
 * que ya no existe fallaria mas tarde y en otro sitio. Una columna ausente —fila
 * anterior a la migracion— cae en las dos, que es el comportamiento que habia.
 */
function parseRedes(valor: unknown): Red[] {
  if (!Array.isArray(valor)) return [...REDES]
  return REDES.filter((red) => valor.includes(red))
}

/** El recorte de la noticia que viaja en los dos buzones. */
function newsInput(news: RawNews): AngleJobInput["raw_news"] {
  // El score y las notas del analisis NO viajan a los agentes. El analisis es
  // un filtro para decidir que noticias se generan; el como se cuentan sale
  // solo del hecho consolidado. Cuando el analisis viajaba, el angulo leia sus
  // notas ("titular no comprobable, score bajo") y escribia tesis como "un
  // titular dijo que el cafe subio pero no se puede comprobar". El agente da el
  // hecho por bueno: para eso ya paso el filtro.
  return {
    id: news.id,
    title: news.title,
    link: news.link,
    source: news.source,
    snippet: news.snippet,
    full_content: news.full_content ? news.full_content.slice(0, MAX_CONTENIDO) : null,
    niche: news.niche,
    tema: news.tema,
    relevance_score: null,
    keywords_matched: null,
    analysis_notes: null,
  }
}

export function buildAngleInput(news: RawNews, variables: Variables): AngleJobInput {
  return { raw_news: newsInput(news), variables }
}

export function buildLinkedinInput(
  angle: ContentAngle,
  news: RawNews,
  variables: Variables
): LinkedinJobInput {
  return {
    angle: {
      id: angle.id,
      angle: angle.angle,
      thesis: angle.thesis,
      playbook_format: angle.playbook_format,
    },
    raw_news: newsInput(news),
    variables,
  }
}

/** Devuelve el id del job creado. */
export async function enqueueAngleJob(
  news: RawNews,
  variables: Variables,
  override?: Partial<Variables> | null
): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("jobs_angle")
    .insert({
      account_id: news.account_id,
      raw_news_id: news.id,
      input: buildAngleInput(news, mergeVariables(variables, override)),
    })
    .select("id")
    .single()

  // 23505 es el indice que garantiza un solo trabajo por noticia. Llegar aqui
  // significa que otra pasada la encolo primero, y eso es el resultado correcto,
  // no un fallo: se devuelve el trabajo que ya existe y nadie duplica nada.
  if (error?.code === "23505") {
    const { data: existente } = await supabaseAdmin()
      .from("jobs_angle")
      .select("id")
      .eq("account_id", news.account_id)
      .eq("raw_news_id", news.id)
      .maybeSingle()
    if (existente) return (existente as { id: string }).id
  }

  if (error) throw new Error(`No se pudo encolar el angulo: ${error.message}`)
  return (data as { id: string }).id
}

export async function enqueueLinkedinJob(
  angle: ContentAngle,
  news: RawNews,
  variables: Variables,
  override?: Partial<Variables> | null
): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("jobs_linkedin")
    .insert({
      account_id: angle.account_id,
      content_angle_id: angle.id,
      input: buildLinkedinInput(angle, news, mergeVariables(variables, override)),
    })
    .select("id")
    .single()

  if (error) throw new Error(`No se pudo encolar el post: ${error.message}`)
  return (data as { id: string }).id
}

/**
 * Toma los buzones hechos y sin consumir, marcandolos en el mismo paso.
 *
 * El update condicionado a `consumed_at is null` es un compare-and-set: si dos
 * ticks se solapan (el trigger y el cron de respaldo, por ejemplo), solo uno se
 * lleva cada fila y el otro sigue sin duplicar nada.
 */
export async function claimAngleJobs(limite = MAX_DRENAJE_POR_TICK): Promise<JobAngle[]> {
  const supabase = supabaseAdmin()

  const { data: candidatos, error: errorLectura } = await supabase
    .from("jobs_angle")
    .select("id")
    .is("consumed_at", null)
    .in("status", ["done", "failed"])
    .order("created_at")
    .limit(limite)

  if (errorLectura) throw new Error(`No se pudieron leer los angulos: ${errorLectura.message}`)
  const ids = (candidatos ?? []).map((row) => (row as { id: string }).id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from("jobs_angle")
    .update({ consumed_at: new Date().toISOString() })
    .in("id", ids)
    .is("consumed_at", null)
    .select("*")

  if (error) throw new Error(`No se pudieron tomar los angulos: ${error.message}`)
  return (data ?? []) as JobAngle[]
}

export async function claimLinkedinJobs(limite = MAX_DRENAJE_POR_TICK): Promise<JobLinkedin[]> {
  const supabase = supabaseAdmin()

  const { data: candidatos, error: errorLectura } = await supabase
    .from("jobs_linkedin")
    .select("id")
    .is("consumed_at", null)
    .in("status", ["done", "failed"])
    .order("created_at")
    .limit(limite)

  if (errorLectura) throw new Error(`No se pudieron leer los posts: ${errorLectura.message}`)
  const ids = (candidatos ?? []).map((row) => (row as { id: string }).id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from("jobs_linkedin")
    .update({ consumed_at: new Date().toISOString() })
    .in("id", ids)
    .is("consumed_at", null)
    .select("*")

  if (error) throw new Error(`No se pudieron tomar los posts: ${error.message}`)
  return (data ?? []) as JobLinkedin[]
}

export async function claimInstagramJobs(limite = MAX_DRENAJE_POR_TICK): Promise<JobInstagram[]> {
  const supabase = supabaseAdmin()

  const { data: candidatos, error: errorLectura } = await supabase
    .from("jobs_instagram")
    .select("id")
    .is("consumed_at", null)
    .in("status", ["done", "failed"])
    .order("created_at")
    .limit(limite)

  if (errorLectura) throw new Error(`No se pudieron leer los carruseles: ${errorLectura.message}`)
  const ids = (candidatos ?? []).map((row) => (row as { id: string }).id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from("jobs_instagram")
    .update({ consumed_at: new Date().toISOString() })
    .in("id", ids)
    .is("consumed_at", null)
    .select("*")

  if (error) throw new Error(`No se pudieron tomar los carruseles: ${error.message}`)
  return (data ?? []) as JobInstagram[]
}

/** Encola un carrusel de Instagram para un angulo ya decidido. */
export async function enqueueInstagramJob(
  angle: ContentAngle,
  news: RawNews,
  variables: Variables,
  override?: Partial<Variables> | null,
  destinos: DestinoCarrusel[] = ["instagram"]
): Promise<string> {
  const supabase = supabaseAdmin()

  // Un angulo produce un solo guion, aunque se pidan sus dos redes por separado
  // o se arrastre dos veces. Sin esto salian varios buzones del mismo angulo
  // —llegue a ver tres— y cada uno es una generacion pagada para escribir lo
  // mismo. Si ya hay uno sin consumir, se le añaden los destinos que falten.
  const { data: abierto } = await supabase
    .from("jobs_instagram")
    .select("id, input")
    .eq("content_angle_id", angle.id)
    .is("consumed_at", null)
    .maybeSingle()

  if (abierto) {
    const fila = abierto as { id: string; input: { destinos?: DestinoCarrusel[] } }
    const yaTiene = fila.input?.destinos ?? ["instagram"]
    const unidos = [...new Set([...yaTiene, ...destinos])]

    if (unidos.length > yaTiene.length) {
      await supabase
        .from("jobs_instagram")
        .update({ input: { ...fila.input, destinos: unidos } })
        .eq("id", fila.id)
    }
    return fila.id
  }

  const { data, error } = await supabase
    .from("jobs_instagram")
    .insert({
      account_id: angle.account_id,
      content_angle_id: angle.id,
      input: { ...buildLinkedinInput(angle, news, mergeVariables(variables, override)), destinos },
    })
    .select("id")
    .single()

  if (error) throw new Error(`No se pudo encolar el carrusel: ${error.message}`)
  return (data as { id: string }).id
}

/**
 * Marca un buzon como fallido por culpa de la respuesta, no de la llamada.
 *
 * La `respuesta` cruda se conserva: es la unica pista para arreglar el prompt.
 */
export async function markJobUnreadable(
  tabla: "jobs_angle" | "jobs_linkedin" | "jobs_instagram",
  jobId: string,
  motivo: string
): Promise<void> {
  await supabaseAdmin()
    .from(tabla)
    .update({ status: "failed", error: motivo.slice(0, 1000) })
    .eq("id", jobId)
}

/** Cuantos trabajos esperan a que su agente los recoja. */
export async function countPending(
  tabla: "jobs_angle" | "jobs_linkedin" | "jobs_instagram"
): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from(tabla)
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")

  if (error) throw new Error(`No se pudo contar la cola: ${error.message}`)
  return count ?? 0
}
