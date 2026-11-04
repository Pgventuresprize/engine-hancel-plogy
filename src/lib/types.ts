/** Fila de `public.raw_news`, tal cual la devuelve Postgres. */
export type RawNews = {
  id: string
  /** 'general' o 'chat': las del chat no pasan por las selecciones automaticas. */
  carril?: string
  /** La cuenta a la que pertenece. Todo el corpus esta acotado por aqui. */
  account_id: string
  niche: string
  tema: string
  title: string
  link: string
  snippet: string | null
  date_serper: string | null
  source: string | null
  image_url: string | null
  status: string
  relevance_score: number | null
  keywords_matched: string[] | null
  analysis_notes: string | null
  query_used: string | null
  created_at: string
  analyzed_at: string | null
  full_content: string | null
  content_fetched_at: string | null
  content_fetch_status: string | null

  /** La empujo alguien a mano, saltandose la seleccion automatica. */
  promoted_by_hand: boolean
  promoted_at: string | null
  /** Score y umbral congelados al promoverla; los dos cambian despues. */
  promoted_score: number | null
  promoted_threshold: number | null

  /**
   * La noticia que cubrio este mismo hecho antes. Con `status = duplicate`: no
   * se borra, se aparta, para poder ver de cuantos medios salio la historia.
   */
  duplicate_of_news_id: string | null
}

/** Fila de `public.pipeline_runs`. */
export type PipelineRun = {
  id: string
  account_id: string
  run_type: string
  status: string
  started_at: string
  ended_at: string | null
  raw_inserted: number | null
  duplicates_removed: number | null
  error_message: string | null
}
