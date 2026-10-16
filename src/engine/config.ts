/**
 * Constantes del motor y semilla de respaldo.
 *
 * La taxonomia real (categorias -> segmentos -> keyword) vive en la base, en
 * `engine_categories` y `engine_segments`, y se edita desde /engine/config.
 * Lo de aqui abajo es solo el respaldo con el que nace un proyecto vacio: son
 * las 16 busquedas portadas del flujo de n8n.
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

/** Se usa solo si `engine_segments` esta vacia. */
export const FALLBACK_SEARCHES: SearchSpec[] = [
  { niche: "AI", label: "AI releases", q: "AI releases", hl: "en", gl: "us" },
  { niche: "AI", label: "new AI model LLM", q: "new AI model released LLM", hl: "en", gl: "us" },
  { niche: "AI", label: "OpenAI", q: "OpenAI", hl: "en", gl: "us" },
  { niche: "AI", label: "Anthropic Claude", q: "Anthropic Claude", hl: "en", gl: "us" },
  { niche: "Startup", label: "startup launch latam", q: "startup launch latam colombia", hl: "es", gl: "co" },
  { niche: "Startup", label: "SaaS product hunt", q: "new SaaS product hunt launch", hl: "en", gl: "us" },
  { niche: "Startup", label: "startup acquisition merger", q: "startup acquisition merger shutdown pivot", hl: "en", gl: "us" },
  { niche: "Startup", label: "founder story", q: "founder story startup lessons", hl: "en", gl: "us" },
  { niche: "Tech", label: "open source release", q: "open source software release github", hl: "en", gl: "us" },
  { niche: "Tech", label: "cybersecurity", q: "cybersecurity breach vulnerability hack", hl: "en", gl: "us" },
  { niche: "Tech", label: "developer tools", q: "developer tools framework API launch", hl: "en", gl: "us" },
  { niche: "Tech", label: "cloud hardware", q: "cloud infrastructure GPU chip hardware", hl: "en", gl: "us" },
  { niche: "VC", label: "VC funding latam", q: "venture capital funding raised latam", hl: "en", gl: "us" },
  { niche: "VC", label: "Series A B seed", q: "Series A Series B seed round tech", hl: "en", gl: "us" },
  { niche: "VC", label: "Kaszek Softbank a16z", q: "Kaszek Softbank a16z Sequoia portfolio investment", hl: "en", gl: "us" },
  { niche: "VC", label: "IPO acquisition", q: "startup IPO acquisition merger deal", hl: "en", gl: "us" },
]
