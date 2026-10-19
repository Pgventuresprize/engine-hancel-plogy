import "server-only"

import { idDeCuentaActual } from "@/lib/accounts"
import { getGenerationConfig } from "@/engine/content/jobs"
import { tokenClaude } from "@/engine/claude/messages"
import type {
  ContentAngle,
  ContentPiece,
  GenerationConfig,
  JobAngle,
  JobInstagram,
  JobLinkedin,
  PiecePayload,
} from "@/engine/content/types"
import { supabaseAdmin } from "@/engine/supabase-admin"
import type { RawNews } from "@/lib/types"

/**
 * Lectura de la etapa 2 para la interfaz.
 *
 * Las tablas tienen RLS activo y sin politicas, asi que se leen con
 * `supabaseAdmin()`. Mismo criterio que `lib/engine-data.ts`.
 */

/**
 * La configuracion de la cuenta activa.
 *
 * El modulo del motor la pide por parametro porque alli se itera sobre cuentas;
 * aqui, que siempre es la de la sesion, se resuelve sola. Asi ninguna pantalla
 * tiene que acordarse de pasarla.
 */
export async function configuracionDeGeneracion(): Promise<GenerationConfig> {
  return getGenerationConfig(await idDeCuentaActual())
}

export type { GenerationConfig, ContentAngle, ContentPiece, PiecePayload }

/** Un angulo con la noticia de la que salio y las piezas que produjo. */
export type AngleView = ContentAngle & {
  news: RawNews | null
  pieces: ContentPiece[]
}

/** Una pieza con su contexto, que es lo que hace falta para revisarla. */
export type PieceView = ContentPiece & {
  angle: ContentAngle | null
  news: RawNews | null
}

/**
 * Si el motor puede llamar a la IA.
 *
 * Solo dice si hay configuracion, nunca los valores: el token no puede salir
 * del servidor. Sirve para que la interfaz avise en vez de dejar trabajos
 * encolados que nadie va a recoger.
 */
export type EstadoIA = {
  /** Si hay token de Claude guardado. Sin el, nada de IA se procesa. */
  tokenConfigurado: boolean
}

export async function getEstadoIA(): Promise<EstadoIA> {
  return { tokenConfigurado: (await tokenClaude(await idDeCuentaActual())) !== null }
}

export type ContentCounts = {
  candidatas: number
  angulos: number
  piezas: number
  porRevisar: number
  aprobadas: number
  enCola: number
  fallidos: number
}

async function newsById(ids: string[]): Promise<Map<string, RawNews>> {
  const limpios = [...new Set(ids.filter(Boolean))]
  if (limpios.length === 0) return new Map()

  const { data, error } = await supabaseAdmin().from("raw_news").select("*").in("id", limpios)
  if (error) throw new Error(`No se pudieron cargar las noticias: ${error.message}`)
  return new Map(((data ?? []) as RawNews[]).map((row) => [row.id, row]))
}

/**
 * Noticias analizadas que superan el umbral y no han entrado al pipeline.
 *
 * Con el umbral sin definir devuelve vacio: el scoring lo decide el usuario
 * desde la interfaz. El envio manual no depende de esto y sigue disponible
 * para cualquier noticia desde `/noticias`.
 */
export async function getCandidates(limit = 60): Promise<RawNews[]> {
  const accountId = await idDeCuentaActual()
  const config = await getGenerationConfig(accountId)
  if (config.score_threshold === null) return []

  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from("raw_news")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "analyzed")
    .gte("relevance_score", config.score_threshold)
    .order("relevance_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`No se pudieron cargar las candidatas: ${error.message}`)
  const noticias = (data ?? []) as RawNews[]
  if (noticias.length === 0) return []

  const { data: encoladas } = await supabase
    .from("jobs_angle")
    .select("raw_news_id")
    .in(
      "raw_news_id",
      noticias.map((n) => n.id)
    )

  const vistas = new Set(
    ((encoladas ?? []) as { raw_news_id: string }[]).map((row) => row.raw_news_id)
  )
  return noticias.filter((n) => !vistas.has(n.id))
}

export async function getAngles(limit = 60): Promise<AngleView[]> {
  const supabase = supabaseAdmin()

  const { data, error } = await supabase
    .from("content_angles")
    .select("*")
    .eq("account_id", await idDeCuentaActual())
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`No se pudieron cargar los angulos: ${error.message}`)
  const angulos = (data ?? []) as ContentAngle[]
  if (angulos.length === 0) return []

  const [noticias, piezas] = await Promise.all([
    newsById(angulos.map((a) => a.raw_news_id)),
    supabase
      .from("content_pieces")
      .select("*")
      .in(
        "content_angle_id",
        angulos.map((a) => a.id)
      ),
  ])

  const porAngulo = new Map<string, ContentPiece[]>()
  for (const pieza of (piezas.data ?? []) as ContentPiece[]) {
    const grupo = porAngulo.get(pieza.content_angle_id)
    if (grupo) grupo.push(pieza)
    else porAngulo.set(pieza.content_angle_id, [pieza])
  }

  return angulos.map((angulo) => ({
    ...angulo,
    news: noticias.get(angulo.raw_news_id) ?? null,
    pieces: porAngulo.get(angulo.id) ?? [],
  }))
}

export async function getPieces(limit = 60): Promise<PieceView[]> {
  const supabase = supabaseAdmin()

  const { data, error } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("account_id", await idDeCuentaActual())
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`No se pudieron cargar las piezas: ${error.message}`)
  const piezas = (data ?? []) as ContentPiece[]
  if (piezas.length === 0) return []

  const { data: angulosData } = await supabase
    .from("content_angles")
    .select("*")
    .in(
      "id",
      piezas.map((p) => p.content_angle_id)
    )

  const angulos = new Map(
    ((angulosData ?? []) as ContentAngle[]).map((row) => [row.id, row])
  )
  const noticias = await newsById(
    piezas.map((p) => p.raw_news_id).filter((id): id is string => Boolean(id))
  )

  return piezas.map((pieza) => ({
    ...pieza,
    angle: angulos.get(pieza.content_angle_id) ?? null,
    news: pieza.raw_news_id ? (noticias.get(pieza.raw_news_id) ?? null) : null,
  }))
}

export type QueueView = {
  angle: JobAngle[]
  linkedin: JobLinkedin[]
  instagram: JobInstagram[]
}

/** Los buzones en crudo, para diagnosticar cuando algo se atasca. */
export async function getQueue(limit = 30): Promise<QueueView> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const cola = (tabla: string) =>
    supabase
      .from(tabla)
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(limit)

  const [angle, linkedin, instagram] = await Promise.all([
    cola("jobs_angle"),
    cola("jobs_linkedin"),
    cola("jobs_instagram"),
  ])

  if (angle.error) throw new Error(`No se pudo cargar la cola de angulos: ${angle.error.message}`)
  if (linkedin.error) {
    throw new Error(`No se pudo cargar la cola de posts: ${linkedin.error.message}`)
  }
  if (instagram.error) {
    throw new Error(`No se pudo cargar la cola de carruseles: ${instagram.error.message}`)
  }

  return {
    angle: (angle.data ?? []) as JobAngle[],
    linkedin: (linkedin.data ?? []) as JobLinkedin[],
    instagram: (instagram.data ?? []) as JobInstagram[],
  }
}

export async function getContentCounts(): Promise<ContentCounts> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const contar = (tabla: string) =>
    supabase.from(tabla).select("id", { count: "exact", head: true }).eq("account_id", accountId)

  /** Cuenta filas de un buzon en un estado, sin traerselas. */
  const enEstado = (tabla: string, status: string) =>
    supabase
      .from(tabla)
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", status)

  const BUZONES = ["jobs_angle", "jobs_linkedin", "jobs_instagram"]

  const [angulos, piezas, porRevisar, aprobadas, pendientes, fallidos] = await Promise.all([
    contar("content_angles"),
    contar("content_pieces"),
    enEstado("content_pieces", "generated"),
    enEstado("content_pieces", "approved"),
    Promise.all(BUZONES.map((t) => enEstado(t, "pending"))),
    Promise.all(BUZONES.map((t) => enEstado(t, "failed"))),
  ])

  const candidatas = await getCandidates(200)
  const sumar = (filas: { count: number | null }[]) =>
    filas.reduce((total, fila) => total + (fila.count ?? 0), 0)

  return {
    candidatas: candidatas.length,
    angulos: angulos.count ?? 0,
    piezas: piezas.count ?? 0,
    porRevisar: porRevisar.count ?? 0,
    aprobadas: aprobadas.count ?? 0,
    enCola: sumar(pendientes),
    fallidos: sumar(fallidos),
  }
}

/** Cuantas noticias analizadas hay por cada umbral, para elegirlo con datos. */
export async function getScoreDistribution(): Promise<{ score: number; count: number }[]> {
  const { data, error } = await supabaseAdmin()
    .from("raw_news")
    .select("relevance_score")
    .eq("account_id", await idDeCuentaActual())
    .eq("status", "analyzed")

  if (error) throw new Error(`No se pudo leer la distribucion de scores: ${error.message}`)

  const filas = (data ?? []) as { relevance_score: number | null }[]
  return Array.from({ length: 11 }, (_, score) => ({
    score,
    count: filas.filter((f) => f.relevance_score !== null && f.relevance_score >= score).length,
  }))
}
