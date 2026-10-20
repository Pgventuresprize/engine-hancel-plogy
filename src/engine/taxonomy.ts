import type { SearchSpec } from "./config"
import { supabaseAdmin } from "./supabase-admin"

export type Category = {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  is_active: boolean
  position: number
}

export type Segment = {
  id: string
  category_id: string
  label: string
  query: string
  hl: string
  gl: string
  num: number
  freshness: string
  is_active: boolean
  position: number
}

export type CategoryWithSegments = Category & { segments: Segment[] }

/**
 * Taxonomia completa, activa e inactiva, para la pantalla de configuracion.
 */
export async function getTaxonomy(accountId: string): Promise<CategoryWithSegments[]> {
  const supabase = supabaseAdmin()

  // Los segmentos no llevan `account_id`: cuelgan de su categoria, que si lo
  // lleva. Traerlos todos y cruzarlos en memoria es correcto porque el mapa solo
  // se rellena con las categorias de esta cuenta, y son pocas filas.
  const [categories, segments] = await Promise.all([
    supabase.from("engine_categories").select("*").eq("account_id", accountId).order("position"),
    supabase.from("engine_segments").select("*").order("position"),
  ])

  if (categories.error) {
    throw new Error(`No se pudieron cargar las categorias: ${categories.error.message}`)
  }
  if (segments.error) {
    throw new Error(`No se pudieron cargar los segmentos: ${segments.error.message}`)
  }

  const byCategory = new Map<string, Segment[]>()
  for (const segment of (segments.data ?? []) as Segment[]) {
    const group = byCategory.get(segment.category_id)
    if (group) group.push(segment)
    else byCategory.set(segment.category_id, [segment])
  }

  return ((categories.data ?? []) as Category[]).map((category) => ({
    ...category,
    segments: byCategory.get(category.id) ?? [],
  }))
}

/**
 * Las busquedas que el motor va a ejecutar: solo segmentos activos dentro de
 * categorias activas.
 *
 * Si no hay ninguna, no se busca nada. Antes caia a dieciseis busquedas de
 * tecnologia y startups: una cuenta nueva, de lo que fuera, se llenaba de
 * noticias de otra marca y gastaba busquedas en ellas.
 */
export async function getActiveSearches(accountId: string): Promise<SearchSpec[]> {
  const taxonomy = await getTaxonomy(accountId)

  const searches = taxonomy
    .filter((category) => category.is_active)
    .flatMap((category) =>
      category.segments
        .filter((segment) => segment.is_active)
        .map<SearchSpec>((segment) => ({
          segmentId: segment.id,
          categoryId: category.id,
          niche: category.slug,
          label: segment.label,
          q: segment.query,
          hl: segment.hl,
          gl: segment.gl,
          num: segment.num,
          freshness: segment.freshness,
        }))
    )

  return searches
}
