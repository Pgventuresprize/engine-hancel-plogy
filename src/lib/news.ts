import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"
import type { PipelineRun, RawNews } from "@/lib/types"

/**
 * Todo lo que se lee aqui esta acotado a la cuenta activa.
 *
 * Va con el cliente de servicio, como el resto de la aplicacion. Antes usaba la
 * clave publicable, y por eso `raw_news` y `pipeline_runs` tenian que quedar sin
 * RLS: abiertas a cualquiera con esa clave, con las noticias de todas las
 * cuentas. Ahora tienen RLS como las demas y el filtro por cuenta de cada
 * funcion es lo que separa una empresa de otra.
 *
 * El filtro se resuelve dentro de cada funcion y no se recibe por parametro a
 * proposito: son lecturas para la interfaz, siempre en el contexto de una
 * sesion, y un parametro obligatorio que siempre vale lo mismo es una invitacion
 * a olvidarlo en una llamada nueva y filtrar los datos de otra cuenta.
 */

/** Todas las columnas de raw_news, incluido el cuerpo completo del articulo. */
const ALL_COLUMNS = "*"

export type NewsFilters = {
  niche?: string
  status?: string
  q?: string
}

/**
 * Devuelve todas las noticias con su contenido completo, mas recientes primero.
 * Los filtros son opcionales y se combinan con AND.
 */
export async function getNews(filters: NewsFilters = {}): Promise<RawNews[]> {
  let query = supabaseAdmin()
    .from("raw_news")
    .select(ALL_COLUMNS)
    .eq("account_id", await idDeCuentaActual())
    .order("created_at", { ascending: false })

  if (filters.niche) query = query.eq("niche", filters.niche)
  if (filters.status) query = query.eq("status", filters.status)
  if (filters.q) {
    const term = `%${filters.q}%`
    query = query.or(
      `title.ilike.${term},snippet.ilike.${term},tema.ilike.${term},source.ilike.${term}`
    )
  }

  const { data, error } = await query
  if (error) throw new Error(`No se pudieron cargar las noticias: ${error.message}`)
  return (data ?? []) as RawNews[]
}

export type NewsStats = {
  total: number
  withContent: number
  analyzed: number
  niches: { value: string; count: number }[]
  statuses: { value: string; count: number }[]
  temas: { value: string; count: number }[]
  sources: number
}

/** Agregados para las tarjetas de resumen y los selectores de filtro. */
export function buildStats(rows: RawNews[]): NewsStats {
  const tally = (values: (string | null)[]) => {
    const map = new Map<string, number>()
    for (const v of values) {
      if (!v) continue
      map.set(v, (map.get(v) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }

  return {
    total: rows.length,
    withContent: rows.filter((r) => r.full_content && r.full_content.length > 0).length,
    analyzed: rows.filter((r) => r.status === "analyzed").length,
    niches: tally(rows.map((r) => r.niche)),
    statuses: tally(rows.map((r) => r.status)),
    temas: tally(rows.map((r) => r.tema)),
    sources: new Set(rows.map((r) => r.source).filter(Boolean)).size,
  }
}

/** Ejecuciones del pipeline, mas recientes primero. */
export async function getPipelineRuns(): Promise<PipelineRun[]> {
  const { data, error } = await supabaseAdmin()
    .from("pipeline_runs")
    .select("*")
    .eq("account_id", await idDeCuentaActual())
    .order("started_at", { ascending: false })

  if (error) throw new Error(`No se pudieron cargar las ejecuciones: ${error.message}`)
  return (data ?? []) as PipelineRun[]
}

/** Conteo de noticias por nicho, para la navegacion lateral. */
export async function getNicheCounts(): Promise<{ value: string; count: number }[]> {
  const { data, error } = await supabaseAdmin()
    .from("raw_news")
    .select("niche")
    .eq("account_id", await idDeCuentaActual())
  if (error) throw new Error(`No se pudieron cargar los nichos: ${error.message}`)

  const map = new Map<string, number>()
  for (const row of data ?? []) {
    const niche = (row as { niche: string | null }).niche
    if (!niche) continue
    map.set(niche, (map.get(niche) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

export type NewsFacets = {
  niches: { value: string; count: number }[]
  statuses: { value: string; count: number }[]
}

/**
 * Conteos sobre el conjunto completo, no sobre el filtrado: los selectores de
 * filtro deben ofrecer siempre todas las opciones disponibles.
 */
export async function getFacets(): Promise<NewsFacets> {
  const { data, error } = await supabaseAdmin()
    .from("raw_news")
    .select("niche, status")
    .eq("account_id", await idDeCuentaActual())
  if (error) throw new Error(`No se pudieron cargar los filtros: ${error.message}`)

  const rows = (data ?? []) as { niche: string | null; status: string | null }[]
  const tally = (values: (string | null)[]) => {
    const map = new Map<string, number>()
    for (const v of values) {
      if (!v) continue
      map.set(v, (map.get(v) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }

  return {
    niches: tally(rows.map((r) => r.niche)),
    statuses: tally(rows.map((r) => r.status)),
  }
}
