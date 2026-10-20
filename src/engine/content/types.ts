import type { Clasificacion } from "../marca/clasificacion"

/**
 * Tipos de la etapa 2: de una noticia analizada a una pieza de LinkedIn.
 *
 * Dos clases de tabla, separadas a proposito:
 *   jobs_*      buzones. El mecanismo de ejecucion de los agentes.
 *   content_*   el resultado limpio que consume la interfaz.
 * Si algun dia se cambia la forma de llamar al modelo, solo cambian los buzones.
 */

/** Estados de un buzon. Los escribe el agente, salvo el inicial. */
export type JobStatus = "pending" | "processing" | "done" | "failed"

/**
 * Las redes en las que se publica.
 *
 * Aqui y no en `publish/`: la eleccion de red empieza al generar —una pieza nace
 * siendo de una red o de otra— y publicarla es solo el ultimo paso. El modulo no
 * toca la base, asi que la interfaz puede importar la lista y ofrecer justo lo
 * que el servidor acepta.
 */
/**
 * Facebook se elige como cualquier otra red, pero no tiene agente propio: nace
 * del guion del carrusel de Instagram —la portada como imagen y el texto de las
 * laminas como descripcion—. Elegirla encola el mismo buzon que Instagram con
 * Facebook como destino; si tambien se eligio Instagram, un solo trabajo de la
 * generacion produce las dos piezas.
 */
export const REDES = ["linkedin", "instagram", "facebook"] as const
export type Red = (typeof REDES)[number]

export const REDES_PUBLICACION = REDES
export type RedPublicacion = Red

/** Lo que un trabajo del buzon de Instagram tiene que producir. */
export type DestinoCarrusel = "instagram" | "facebook"

export const NOMBRE_DE_RED: Record<RedPublicacion, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
}

/** Fila de `public.jobs_angle`, tal cual la devuelve Postgres. */
export type JobAngle = {
  id: string
  account_id: string
  raw_news_id: string
  input: AngleJobInput
  status: JobStatus
  respuesta: unknown
  error: string | null
  created_at: string
  processed_at: string | null
  /** Lo escribe SOLO la app, al materializar la respuesta. Ver `jobs.ts`. */
  consumed_at: string | null
}

/** Fila de `public.jobs_linkedin`. */
export type JobLinkedin = {
  id: string
  account_id: string
  content_angle_id: string
  input: LinkedinJobInput
  status: JobStatus
  respuesta: unknown
  error: string | null
  created_at: string
  processed_at: string | null
  consumed_at: string | null
}

/** Fila de `public.jobs_instagram`. Mismo contrato que los otros buzones. */
export type JobInstagram = {
  id: string
  account_id: string
  content_angle_id: string
  /**
   * `destinos` dice que piezas salen de la respuesta. Un trabajo viejo no lo
   * trae y se toma como solo Instagram.
   */
  input: LinkedinJobInput & { destinos?: DestinoCarrusel[] }
  status: JobStatus
  respuesta: unknown
  error: string | null
  created_at: string
  processed_at: string | null
  consumed_at: string | null
}

export type AngleStatus = "angled" | "pending_generation" | "generated" | "discarded"

/** Fila de `public.content_angles`. */
export type ContentAngle = {
  id: string
  account_id: string
  raw_news_id: string
  job_angle_id: string | null
  angle: string
  thesis: string | null
  playbook_format: string | null
  /** Pilar, audiencia, vertical, objetivo y CTA. Null en los angulos anteriores. */
  clasificacion: Clasificacion | null
  status: AngleStatus
  position: number
  created_at: string
}

export type PieceStatus = "generated" | "approved" | "published" | "rejected"

/** Fila de `public.content_pieces`. */
export type ContentPiece = {
  id: string
  account_id: string
  content_angle_id: string
  raw_news_id: string | null
  job_linkedin_id: string | null
  network: string
  payload: PiecePayload
  status: PieceStatus
  variables_usadas: Variables | null
  override_puntual: Partial<Variables> | null
  created_at: string
  generated_at: string | null
  approved_at: string | null
  published_at: string | null
  /** El id que devuelve LinkedIn; con el se arma la URL del post publicado. */
  linkedin_urn: string | null
  publish_error: string | null
}

/**
 * Las ranuras de personalizacion.
 *
 * NO son texto libre que se le pasa al modelo como instruccion: son valores
 * acotados que rellenan huecos que el prompt base del agente dejo abiertos.
 * El prompt base no vive aqui, vive en la ficha de cada agente.
 */
export type Variables = {
  tono: string
  audiencia: string
  voz_marca: string
  cta: string
  evitar: string
  longitud: string
  idioma: string
}

/** Fila de `public.generation_config`. Tabla de una sola fila. */
export type GenerationConfig = {
  variables: Variables
  /** NULL mientras el usuario no defina el scoring desde la interfaz. */
  score_threshold: number | null
  /** Cuando se fijo el umbral: solo rige para noticias traidas despues. */
  score_threshold_updated_at: string
  /**
   * El liston del pipeline de redaccion. Las noticias y su score son los mismos
   * que en redes; lo que cambia es a partir de que nota se redactan.
   */
  redaccion_score_threshold: number | null
  generation_mode: "auto" | "manual"
  /**
   * Para que redes genera el modo automatico.
   *
   * Las dos por defecto. Vacia es un estado valido: el automatico sigue sacando
   * angulos pero no genera piezas, que sirve para acumular y decidir a mano.
   */
  auto_networks: Red[]
  /** Publicar en LinkedIn sin revision previa. Nace apagado. */
  autopublish: boolean
  /** Aspecto del carrusel: paleta, fuente, marca. Lo interpreta `render/theme.ts`. */
  carousel: unknown
  updated_at: string
}

// ------------------------------------------------------ contrato del buzon
//
// Lo unico de todo esto que el codigo NO controla. La forma de `input` la
// escribe la app y el agente la lee; la de `respuesta` es al reves. Si el prompt
// de un agente cambia de forma, `parse.ts` lo detecta y marca el job 'failed'
// con el motivo, en vez de meter filas basura en las tablas limpias.

/** Lo que la app deja en `jobs_angle.input` para que el agente lo lea. */
export type AngleJobInput = {
  raw_news: {
    id: string
    title: string
    link: string
    source: string | null
    snippet: string | null
    full_content: string | null
    niche: string
    tema: string
    relevance_score: number | null
    keywords_matched: string[] | null
    /** El angulo sugerido por la etapa 1: insumo que este agente refina. */
    analysis_notes: string | null
  }
  variables: Variables
}

/** Lo que la app deja en `jobs_linkedin.input`. */
export type LinkedinJobInput = {
  angle: {
    id: string
    angle: string
    thesis: string | null
    playbook_format: string | null
    /** Ausente en los trabajos encolados antes de que existiera. */
    clasificacion?: Clasificacion | null
  }
  raw_news: AngleJobInput["raw_news"]
  variables: Variables
}

/** Un angulo dentro de `jobs_angle.respuesta`. Cuantos vengan lo decide el agente. */
export type AnglePayload = {
  angle: string
  thesis: string | null
  playbook_format: string | null
  clasificacion: Clasificacion | null
}

/** El post dentro de `jobs_linkedin.respuesta`. */
export type PiecePayload = {
  hook: string | null
  body: string
  hashtags: string[]
  cta: string | null
  notas: string | null
  /**
   * Solo Facebook: la portada del carrusel del que salio la pieza. El resto del
   * payload es el mismo texto que LinkedIn —hook, cuerpo, hashtags— para que la
   * misma pantalla lo enseñe y lo edite sin un caso aparte.
   */
  image?: string | null
}
