import "server-only"

import { comoHora } from "@/engine/agents/turno"
import { ajustesDe, type Agente } from "@/engine/agents/settings"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"
import type { ModoDeEtapa } from "@/lib/kanban-data"

/**
 * El tablero del pipeline de redaccion.
 *
 * Las dos primeras etapas (traidas y analizadas) son las mismas noticias y el
 * mismo analisis que el tablero de redes: aqui solo cambia lo que viene
 * despues. Una noticia analizada pasa a "En redaccion" cuando alguien la pide o
 * cuando pasa el umbral de redaccion, y a "Redactadas" cuando el agente la
 * escribe.
 */

export type EtapaRedaccion =
  | "sin_analizar"
  | "analizada"
  | "en_redaccion"
  | "redactada"
  | "en_web"
  | "sin_material"
  | "descartado"
  | "descartado_fecha"
  | "repetida"
  | "vetada"

export type RedaccionResumen = {
  status: string
  titular: string | null
  word_count: number | null
  imagen_url: string | null
  error: string | null
  intentos: number
  promovida_a_mano: boolean
  redactada_at: string | null
  model: string | null
  /** El nicho de la noticia: el tema bajo el que sale en el portal. */
  nicho_slug: string | null
  nicho_nombre: string | null
  /** El envio al portal: null (nunca), pendiente, enviando, enviada, error, retirada. */
  web_status: string | null
  web_url: string | null
  web_error: string | null
  web_enviada_at: string | null
  web_version: number
  version: number
}

export type FichaRedaccion = {
  newsId: string
  etapa: EtapaRedaccion
  titulo: string
  fuente: string | null
  link: string
  niche: string
  tema: string
  snippet: string | null
  creada: string
  fechaSerper: string | null
  analizada: boolean
  score: number | null
  notas: string | null
  keywords: string[] | null
  estadoContenido: string | null
  redaccion: RedaccionResumen | null
  miniatura: string | null
  /** Esta por debajo del umbral de redaccion y alguien la pidio a mano. */
  bajoUmbral: boolean
}

export type TableroRedaccion = {
  fichas: Record<EtapaRedaccion, FichaRedaccion[]>
  conteos: Record<EtapaRedaccion, number>
  modos: Partial<Record<EtapaRedaccion, ModoDeEtapa>>
  umbral: number | null
  /** El portal de noticias: si esta conectado y si el envio es automatico. */
  web: { conectado: boolean; auto: boolean }
}

const VISIBLES = 60
const MAX_FILAS = 3000

const VACIO = (): Record<EtapaRedaccion, FichaRedaccion[]> => ({
  sin_analizar: [],
  analizada: [],
  en_redaccion: [],
  redactada: [],
  en_web: [],
  sin_material: [],
  descartado: [],
  descartado_fecha: [],
  repetida: [],
  vetada: [],
})

function etapaDe(estadoNoticia: string, r: RedaccionResumen | null): EtapaRedaccion {
  // Lo ya redactado manda: si se escribio, se ve aunque despues la noticia se
  // marcara de otra forma en el otro pipeline.
  if (r?.status === "redactada") return r.web_status === "enviada" ? "en_web" : "redactada"
  if (estadoNoticia === "discarded_date") return "descartado_fecha"
  if (estadoNoticia === "vetada") return "vetada"
  if (estadoNoticia === "duplicate") return "repetida"
  if (estadoNoticia === "discarded") return "descartado"
  if (r?.status === "material_insuficiente") return "sin_material"
  if (r?.status === "descartada") return r.error?.startsWith("Repite") ? "repetida" : "descartado"
  if (r) return "en_redaccion"
  return estadoNoticia === "analyzed" ? "analizada" : "sin_analizar"
}

export async function getTableroRedaccion(): Promise<TableroRedaccion> {
  const supabase = supabaseAdmin()
  const accountId = await idDeCuentaActual()

  const [{ data: noticias, error }, { data: redacciones }, { data: config }] = await Promise.all([
    supabase
      .from("raw_news")
      .select("id, title, source, link, niche, tema, status, relevance_score, created_at, date_serper, snippet, analysis_notes, keywords_matched, content_fetch_status, image_url")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(MAX_FILAS),
    supabase
      .from("news_redacciones")
      .select("raw_news_id, status, titular, word_count, imagen_url, error, intentos, promovida_a_mano, redactada_at, model, nicho_slug, nicho_nombre, web_status, web_url, web_error, web_enviada_at, web_version, version")
      .eq("account_id", accountId),
    supabase.from("generation_config").select("redaccion_score_threshold, web_envio_auto").eq("account_id", accountId).maybeSingle(),
  ])
  const { conexionWeb } = await import("@/engine/web/webhook")
  const web = { conectado: Boolean(await conexionWeb(accountId)), auto: (config as { web_envio_auto?: boolean } | null)?.web_envio_auto !== false }
  if (error) throw new Error(`No se pudo cargar el tablero: ${error.message}`)

  const umbral = (config as { redaccion_score_threshold: number | null } | null)?.redaccion_score_threshold ?? null
  const porNoticia = new Map(
    ((redacciones ?? []) as (RedaccionResumen & { raw_news_id: string })[]).map(({ raw_news_id, ...r }) => [raw_news_id, r])
  )

  const porEtapa = VACIO()
  type Fila = {
    id: string
    title: string
    source: string | null
    link: string
    niche: string
    tema: string
    status: string
    relevance_score: number | null
    created_at: string
    date_serper: string | null
    snippet: string | null
    analysis_notes: string | null
    keywords_matched: string[] | null
    content_fetch_status: string | null
    image_url: string | null
  }
  for (const n of (noticias ?? []) as Fila[]) {
    const r = porNoticia.get(n.id) ?? null
    const etapa = etapaDe(n.status, r)
    porEtapa[etapa].push({
      newsId: n.id,
      etapa,
      titulo: r?.titular || n.title,
      fuente: n.source,
      link: n.link,
      niche: n.niche,
      tema: n.tema,
      snippet: n.snippet,
      creada: n.created_at,
      fechaSerper: n.date_serper,
      analizada: n.status === "analyzed" || n.relevance_score !== null,
      score: n.relevance_score,
      notas: n.analysis_notes,
      keywords: n.keywords_matched,
      estadoContenido: n.content_fetch_status,
      redaccion: r,
      miniatura: r?.status === "redactada" ? r.imagen_url : null,
      bajoUmbral: Boolean(r?.promovida_a_mano && umbral !== null && n.relevance_score !== null && n.relevance_score < umbral),
    })
  }

  const conteos = {} as Record<EtapaRedaccion, number>
  const fichas = VACIO()
  for (const etapa of Object.keys(porEtapa) as EtapaRedaccion[]) {
    conteos[etapa] = porEtapa[etapa].length
    fichas[etapa] = porEtapa[etapa].slice(0, VISIBLES)
  }

  return { fichas, conteos, modos: await modosDeEtapa(accountId), umbral, web }
}

const AGENTE_DE_ETAPA: Partial<Record<EtapaRedaccion, { agente: Agente; nombre: string }>> = {
  sin_analizar: { agente: "extraccion", nombre: "Extraccion" },
  analizada: { agente: "analisis", nombre: "Analisis" },
  redactada: { agente: "redaccion", nombre: "Redaccion" },
}

async function modosDeEtapa(accountId: string): Promise<Partial<Record<EtapaRedaccion, ModoDeEtapa>>> {
  const salida: Partial<Record<EtapaRedaccion, ModoDeEtapa>> = {}
  for (const [etapa, quien] of Object.entries(AGENTE_DE_ETAPA) as [EtapaRedaccion, { agente: Agente; nombre: string }][]) {
    const ajustes = await ajustesDe(accountId, quien.agente)
    salida[etapa] = {
      agente: quien.agente,
      nombre: quien.nombre,
      modo: ajustes.mode,
      horario: ajustes.mode === "programado" && ajustes.run_at.length > 0 ? ajustes.run_at.map(comoHora).join(", ") : null,
    }
  }
  return salida
}
