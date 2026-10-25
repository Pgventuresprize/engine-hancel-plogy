import "server-only"

import type { EnCurso } from "@/engine/recursos/agente"
import { etapaLegible, parseFigurasGuardadas } from "@/engine/recursos/figuras-modelo"
import type { TipoRecurso, Veredicto } from "@/engine/recursos/modelo"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"

/**
 * La lista de la seccion Recursos: todos los reportes y guias de la cuenta,
 * los que el agente esta escribiendo y los que fallaron sin dejar recurso.
 *
 * Solo el resumen de cada uno; el documento entero se lee al abrirlo, con la
 * misma accion que la pestaña Recurso de la ficha (estudio/recurso-actions.ts).
 */

export type EstadoFila = "por_revisar" | "aprobado" | "en_la_web" | "descartado" | "en_curso" | "fallido"

export type FilaRecurso = {
  angleId: string
  /** null mientras el agente escribe el primero. */
  id: string | null
  titular: string
  /** El titular de la noticia de la que sale. */
  noticia: string | null
  tipo: TipoRecurso | null
  palabra: string | null
  estado: EstadoFila
  /** La etapa en que va un trabajo abierto, aunque ya exista una version. */
  enCurso: string | null
  veredicto: Veredicto | null
  palabras: number | null
  version: number | null
  webError: string | null
  error: string | null
  /** La URL de la portada, si el recurso tiene figuras. */
  portada: string | null
  fecha: string
}

type FilaDb = {
  id: string
  content_angle_id: string
  raw_news_id: string | null
  tipo: TipoRecurso
  titular: string | null
  palabra: string
  status: "listo" | "aprobado" | "descartado"
  web_url: string | null
  web_error: string | null
  word_count: number | null
  version: number
  veredicto: Veredicto | null
  updated_at: string
}

type JobDb = {
  content_angle_id: string
  status: string
  respuesta: { pendiente?: EnCurso } | null
  error: string | null
  created_at: string
  consumed_at: string | null
}

function estadoDe(f: FilaDb): EstadoFila {
  if (f.status === "descartado") return "descartado"
  if (f.status === "aprobado") return f.web_url ? "en_la_web" : "aprobado"
  return "por_revisar"
}

export async function getRecursos(): Promise<FilaRecurso[]> {
  const accountId = await idDeCuentaActual()
  const supabase = supabaseAdmin()
  // Sin la migracion de recursos las dos primeras fallan y la lista sale vacia.
  const [recursos, jobs, angulos, figuras] = await Promise.all([
    supabase
      .from("content_recursos")
      .select("id, content_angle_id, raw_news_id, tipo, titular, palabra, status, web_url, web_error, word_count, version, veredicto:revision->>veredicto, updated_at")
      .eq("account_id", accountId),
    supabase
      .from("jobs_recurso")
      .select("content_angle_id, status, respuesta, error, created_at, consumed_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false }),
    supabase.from("content_angles").select("id, raw_news_id").eq("account_id", accountId),
    // Aparte: sin la migracion de figuras esta falla y la lista sale sin portadas.
    supabase.from("content_recursos").select("id, figuras").eq("account_id", accountId),
  ])
  const portadaDe = new Map<string, string>()
  for (const f of (figuras.data ?? []) as { id: string; figuras: unknown }[]) {
    const p = parseFigurasGuardadas(f.figuras).lista.find((x) => x.tipo === "portada")
    if (p) portadaDe.set(f.id, p.url)
  }

  // El ultimo trabajo de cada angulo es lo que cuenta: abierto, o fallido sin consumir.
  const ultimoJob = new Map<string, JobDb>()
  for (const j of (jobs.data ?? []) as JobDb[]) if (!ultimoJob.has(j.content_angle_id)) ultimoJob.set(j.content_angle_id, j)
  const etapaDe = (j: JobDb | undefined): string | null => {
    if (!j || j.consumed_at || j.status === "failed") return null
    return etapaLegible(j.respuesta?.pendiente, j.status)
  }

  const noticiaDeAngulo = new Map<string, string>()
  for (const a of (angulos.data ?? []) as { id: string; raw_news_id: string }[]) noticiaDeAngulo.set(a.id, a.raw_news_id)
  const filasDb = (recursos.data ?? []) as unknown as FilaDb[]
  const conRecurso = new Set(filasDb.map((f) => f.content_angle_id))
  const sinRecurso = [...ultimoJob.values()].filter((j) => !conRecurso.has(j.content_angle_id) && (etapaDe(j) || (j.status === "failed" && !j.consumed_at)))

  const idsNoticia = [
    ...new Set([...filasDb.map((f) => f.raw_news_id ?? noticiaDeAngulo.get(f.content_angle_id)), ...sinRecurso.map((j) => noticiaDeAngulo.get(j.content_angle_id))].filter(Boolean)),
  ] as string[]
  const titulos = new Map<string, string>()
  if (idsNoticia.length) {
    const { data } = await supabase.from("raw_news").select("id, title").eq("account_id", accountId).in("id", idsNoticia)
    for (const n of (data ?? []) as { id: string; title: string }[]) titulos.set(n.id, n.title)
  }
  const noticiaDe = (angleId: string, rawNewsId?: string | null) => titulos.get(rawNewsId ?? noticiaDeAngulo.get(angleId) ?? "") ?? null

  const filas: FilaRecurso[] = filasDb.map((f) => ({
    angleId: f.content_angle_id,
    id: f.id,
    titular: f.titular || noticiaDe(f.content_angle_id, f.raw_news_id) || "Sin titular",
    noticia: noticiaDe(f.content_angle_id, f.raw_news_id),
    tipo: f.tipo,
    palabra: f.palabra,
    estado: estadoDe(f),
    enCurso: etapaDe(ultimoJob.get(f.content_angle_id)),
    veredicto: f.veredicto ?? null,
    palabras: f.word_count,
    version: f.version,
    webError: f.status === "aprobado" && !f.web_url ? f.web_error : null,
    error: null,
    portada: portadaDe.get(f.id) ?? null,
    fecha: f.updated_at,
  }))
  for (const j of sinRecurso) {
    const enCurso = etapaDe(j)
    filas.push({
      angleId: j.content_angle_id,
      id: null,
      titular: noticiaDe(j.content_angle_id) ?? "Noticia sin título",
      noticia: noticiaDe(j.content_angle_id),
      tipo: null,
      palabra: null,
      estado: enCurso ? "en_curso" : "fallido",
      enCurso,
      veredicto: null,
      palabras: null,
      version: null,
      webError: null,
      error: enCurso ? null : j.error,
      portada: null,
      fecha: j.created_at,
    })
  }
  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha))
}
