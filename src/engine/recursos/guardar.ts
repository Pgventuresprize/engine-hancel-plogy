import type { RawNews } from "@/lib/types"

import { claimRecursoJobs, enqueueInstagramJob, enqueueLinkedinJob, markJobUnreadable, type JobRecurso } from "../content/jobs"
import type { ContentLog } from "../content/log"
import type { ContentAngle } from "../content/types"
import { supabaseAdmin } from "../supabase-admin"
import type { RespuestaRecurso } from "./agente"
import { contarPalabrasRecurso, DIAS_DE_PALABRA, limpiarPalabra } from "./modelo"

/**
 * El drenaje de los recursos: guarda el que termino en `content_recursos` y
 * encola las piezas que lo esperaban, ahora con el recurso en su input para
 * que su cierre pida la palabra y prometa solo lo que hay.
 *
 * Si el recurso fallo, las piezas se encolan igual pero sin prometerlo (ver
 * `estadoDelRecurso` en jobs.ts): un carrusel que ofrece algo que no existe es
 * peor que uno que invita a seguir a la marca.
 */
export async function drenarRecursos(log: ContentLog, presupuesto?: number): Promise<{ consumidos: number; creados: number; errores: string[] }> {
  const supabase = supabaseAdmin()
  const jobs = await claimRecursoJobs(presupuesto)
  const errores: string[] = []
  let creados = 0

  for (const job of jobs) {
    try {
      const { data: angleRow } = await supabase.from("content_angles").select("*").eq("id", job.content_angle_id).maybeSingle()
      const angle = angleRow as ContentAngle | null
      if (!angle) continue

      if (job.status === "failed") {
        log.emit("content.recurso.failed", "El agente no pudo escribir el recurso", { accountId: job.account_id, jobId: job.id, error: job.error })
      } else {
        const r = job.respuesta as RespuestaRecurso | null
        if (!r?.recurso?.titular) {
          await markJobUnreadable("jobs_recurso", job.id, "La respuesta del recurso no trae el recurso.")
          log.emit("content.recurso.failed", "Respuesta de recurso ilegible", { accountId: job.account_id, jobId: job.id })
        } else {
          await guardarRecurso(job, angle, r)
          creados++
          log.emit("content.recurso.created", "Recurso escrito", { accountId: job.account_id, angleId: angle.id, palabra: r.recurso.palabra })
        }
      }

      await encolarLasQueEsperan(job, angle)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      errores.push(`[recurso ${job.id}] ${message}`)
      log.emit("content.recurso.failed", "No se pudo guardar el recurso", { accountId: job.account_id, jobId: job.id, error: message })
    }
  }
  return { consumidos: jobs.length, creados, errores }
}

/** Guarda (o reemplaza) el recurso del angulo. Uno por angulo; rehacerlo sube la version. */
async function guardarRecurso(job: JobRecurso, angle: ContentAngle, r: RespuestaRecurso): Promise<void> {
  const supabase = supabaseAdmin()
  const { data: previo } = await supabase.from("content_recursos").select("id, version").eq("content_angle_id", angle.id).maybeSingle()
  const ahora = new Date()
  const fila = {
    account_id: job.account_id,
    content_angle_id: angle.id,
    raw_news_id: angle.raw_news_id,
    tipo: r.recurso.tipo,
    titular: r.recurso.titular,
    palabra: limpiarPalabra(r.recurso.palabra),
    palabra_hasta: new Date(ahora.getTime() + DIAS_DE_PALABRA * 86_400_000).toISOString(),
    status: "listo",
    payload: r.recurso,
    dm: r.recurso.dm,
    registro: r.registro,
    revision: r.revision,
    fuentes: { leidas: r.fuentes, pendientes: r.pendientes, imagen: r.imagen },
    word_count: contarPalabrasRecurso(r.recurso),
    aprobado_at: null,
    updated_at: ahora.toISOString(),
  }
  const previa = previo as { id: string; version: number } | null
  const { error } = previa
    ? await supabase.from("content_recursos").update({ ...fila, version: previa.version + 1 }).eq("id", previa.id)
    : await supabase.from("content_recursos").insert(fila)
  if (error) throw new Error(`No se pudo guardar el recurso: ${error.message}`)
}

async function encolarLasQueEsperan(job: JobRecurso, angle: ContentAngle): Promise<void> {
  const esperan = job.input?.esperan
  if (!esperan || (!esperan.linkedin && !esperan.instagram?.length)) return
  const { data } = await supabaseAdmin().from("raw_news").select("*").eq("id", angle.raw_news_id).maybeSingle()
  const news = data as RawNews | null
  if (!news) return
  // Las variables ya vienen mezcladas con lo que se cambio a mano al pedirla.
  const variables = job.input.variables
  if (esperan.linkedin) await enqueueLinkedinJob(angle, news, variables)
  if (esperan.instagram?.length) await enqueueInstagramJob(angle, news, variables, null, esperan.instagram)
}
