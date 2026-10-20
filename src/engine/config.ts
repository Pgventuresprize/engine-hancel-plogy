/**
 * Constantes del motor.
 *
 * La taxonomia (categorias -> segmentos -> keyword) vive en la base, en
 * `engine_categories` y `engine_segments`, y es de cada cuenta. Una cuenta sin
 * taxonomia no busca nada: no hay busquedas de respaldo.
 */

export type SearchSpec = {
  /** Ids de la fila en base; ausentes cuando la busqueda viene del respaldo. */
  segmentId?: string
  categoryId?: string
  /** Slug de la categoria. Se escribe tal cual en `raw_news.niche`. */
  niche: string
  /** Etiqueta del segmento. Se escribe en `raw_news.tema` y `query_used`. */
  label: string
  /** Consulta real que recibe Serper. */
  q: string
  hl: string
  gl: string
  num?: number
  freshness?: string
}

/** Resultados por busqueda cuando el segmento no especifica otro (Serper `num`). */
export const RESULTS_PER_SEARCH = 15

/** `qdr:d` = solo resultados de las ultimas 24 horas. */
export const FRESHNESS = "qdr:d"

/**
 * La ventana que se le pasa a Serper, siempre valida (qdr:h, qdr:d, qdr:w,
 * qdr:m, qdr:y, con numero opcional: qdr:d2 = dos dias). Una ventana que Google
 * no entiende la ignora y devuelve noticias de cualquier fecha: asi estuvieron
 * entrando semanas y meses de noticias viejas con la ventana "q".
 */
export function ventanaValida(freshness: string | null | undefined): string {
  const v = (freshness ?? "").trim()
  return /^qdr:[hdwmy]\d*$/.test(v) ? v : FRESHNESS
}

/** Estado con el que nace toda noticia recien ingerida. */
export const INITIAL_STATUS = "pending_analysis"

/** Umbral de similitud de titulos (Jaccard) por encima del cual son duplicados. */
export const SIMILARITY_THRESHOLD = 0.6

/** Tope de filas que se traen para la pasada de deduplicacion. */
export const DEDUPE_FETCH_LIMIT = 2000
