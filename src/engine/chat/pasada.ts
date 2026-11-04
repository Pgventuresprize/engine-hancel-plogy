import { conContexto } from "../claude/contexto"
import { enqueueAngleJob, getGenerationConfig, type Objetivo } from "../content/jobs"
import { esLimiteDelPlan, esPasajero } from "../content/procesar"
import { runContentTick } from "../content/tick"
import { supabaseAdmin } from "../supabase-admin"
import { aplicarCambios, disenarCambios } from "./editar"
import { prepararMaterial, TrabajoImposible } from "./investigar"
import {
  actualizarTrabajos,
  angulosDe,
  despachar,
  fallar,
  liberarColgados,
  pasarAPieza,
  terminarCambio,
  type PedidoCambio,
  type PedidoPieza,
  type TrabajoChat,
} from "./trabajos"

/**
 * Una pasada de un trabajo del chat: la llama chat_despachar con un turno, avanza
 * una fase y lo suelta. Hay una por trabajo y hasta tres por marca a la vez.
 *
 * El turno es lo que garantiza que dos pasadas no trabajan lo mismo. Lo aparta
 * Postgres junto con la llamada, y aqui se confirma por compare-and-set: si ya no
 * es suyo, esta pasada se va sin tocar nada.
 *
 * Una fase por pasada, no todas de un tiron: cada una cabe de sobra en los 300 s
 * de la funcion, y entre medias pueden entrar los que esperan su turno.
 */

/** Mas que los 300 s de la funcion: muerta la pasada, el turno vence solo. */
const TURNO_S = 330
/** Sin avanzar y en menos de esto, algo la bloquea (un diseño ocupado): no insistir de seguido. */
const PASADA_VACIA_MS = 20_000
const ESPERA_PASADA_VACIA_S = 30
/** Con el limite del plan agotado, cuanto se espera antes de volver a intentarlo. */
const ESPERA_LIMITE_S = 120
/** Lo que puede diseñar un cambio en una pasada: el resto de los 300 s es para dibujar. */
const PLAZO_CAMBIO_MS = 240_000

const nuevoTope = (segundos: number) => new Date(Date.now() + segundos * 1000).toISOString()

/** La pasada normal, apuntada solo a lo de este trabajo. Devuelve lo que fallo. */
async function pasadaDirigida(t: TrabajoChat, objetivo: Objetivo, forzar: ("angulo" | "recursos" | "instagram" | "linkedin")[]): Promise<string[]> {
  const r = await runContentTick({ trigger: "manual", forzar, presupuesto: 1, objetivo })
  return r.errors
}

async function faseInvestigar(t: TrabajoChat): Promise<string[]> {
  const pedido = t.pedido as PedidoPieza
  const news = await prepararMaterial(t, pedido)
  const config = await getGenerationConfig(t.account_id)
  const jobId = await enqueueAngleJob(news, config.variables)
  await supabaseAdmin()
    .from("chat_trabajos")
    .update({
      fase: "angulo",
      buzon: "jobs_angle",
      job_id: jobId,
      raw_news_id: news.id,
      paso: 2,
      etiqueta: "Decidiendo el ángulo",
      updated_at: new Date().toISOString(),
    })
    .eq("id", t.id)
    .eq("estado", "trabajando")
  return []
}

async function faseAngulo(t: TrabajoChat): Promise<string[]> {
  const errores = t.job_id ? await pasadaDirigida(t, { jobAngleId: t.job_id }, ["angulo"]) : []
  const angulos = await angulosDe(t)
  if (angulos.primero) {
    await pasarAPieza(t, angulos.primero)
    return errores
  }
  if (angulos.fallo) await fallar(t, angulos.fallo)
  return errores
}

async function fasePieza(t: TrabajoChat): Promise<string[]> {
  if (!t.angle_id || t.agente === "revisor") return []
  return pasadaDirigida(t, { angleId: t.angle_id }, ["recursos", t.agente])
}

/**
 * Un cambio en una pieza: diseña lo que pidio rediseñar (guardando lo hecho, por
 * si no cabe en esta pasada) y lo aplica. Aplicar no se reintenta: si falla, la
 * pieza queda como estaba y la tarjeta dice por que.
 */
async function faseCambio(t: TrabajoChat): Promise<string[]> {
  const supabase = supabaseAdmin()
  const pedido = t.pedido as PedidoCambio
  if (!t.piece_id || t.agente === "revisor") {
    await fallar(t, "La pieza de este cambio ya no está.")
    return []
  }
  const pieceId = t.piece_id
  const agente = t.agente
  const avance = (paso: number, etiqueta: string) =>
    supabase.from("chat_trabajos").update({ paso, etiqueta, updated_at: new Date().toISOString() }).eq("id", t.id).eq("estado", "trabajando")

  const { hechos, faltan } = await disenarCambios({
    accountId: t.account_id,
    pieceId,
    cambios: pedido.cambios,
    hechos: pedido.disenos ?? {},
    hasta: Date.now() + PLAZO_CAMBIO_MS,
    alAvance: async (etiqueta) => {
      await avance(1, etiqueta)
    },
  })
  // Lo diseñado se guarda siempre: detenido a mitad, "sigue" no lo vuelve a pagar.
  await supabase.from("chat_trabajos").update({ pedido: { ...pedido, disenos: hechos } }).eq("id", t.id)
  if (faltan) return []

  const { data } = await supabase.from("chat_trabajos").select("estado").eq("id", t.id).maybeSingle()
  if ((data as { estado: string } | null)?.estado !== "trabajando") return []
  await avance(1, "Dibujando el carrusel")
  try {
    await terminarCambio(t, await aplicarCambios({ accountId: t.account_id, pieceId, cambios: pedido.cambios, agente, disenos: hechos }))
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    if (esPasajero(motivo)) throw e
    await fallar(t, motivo)
  }
  return []
}

/** Corre la fase en la que va el trabajo. */
async function avanzar(t: TrabajoChat): Promise<string[]> {
  if (t.tipo === "editar") return conContexto({ noticia: t.id, red: t.agente }, () => faseCambio(t))
  if (t.fase === "investigar") return conContexto({ noticia: t.id, red: t.agente }, () => faseInvestigar(t))
  await liberarColgados(t)
  if (t.fase === "angulo") return faseAngulo(t)
  if (t.fase === "pieza") return fasePieza(t)
  return []
}

export async function correrPasada(o: { trabajoId: string; leaseId: string; despachar?: boolean }): Promise<void> {
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from("chat_trabajos")
    .update({ lease_hasta: nuevoTope(TURNO_S) })
    .eq("id", o.trabajoId)
    .eq("lease_id", o.leaseId)
    .gt("lease_hasta", new Date().toISOString())
    .select("*")
    .maybeSingle()
  const t = data as TrabajoChat | null
  if (!t) return

  const inicio = Date.now()
  const suelta: Record<string, unknown> = { lease_id: null, lease_hasta: null }
  try {
    // Detenido entre el turno y aqui: el turno se devuelve sin gastar nada.
    if (t.estado === "trabajando") {
      const errores = await avanzar(t)
      if (errores.some(esLimiteDelPlan)) suelta.reintentar_desde = nuevoTope(ESPERA_LIMITE_S)
      else if (errores.length) suelta.error = errores.join(" · ").slice(0, 500)
      else suelta.fallos = 0
    }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error("[chat] La pasada falló:", t.id, motivo)
    if (e instanceof TrabajoImposible) await fallar(t, motivo)
    else if (esLimiteDelPlan(motivo)) suelta.reintentar_desde = nuevoTope(ESPERA_LIMITE_S)
    else suelta.error = motivo.slice(0, 500)
  }

  try {
    await actualizarTrabajos({ conversacionId: t.conversacion_id })
  } catch (e) {
    console.error("[chat] No se pudo poner al día el trabajo:", e instanceof Error ? e.message : e)
  }

  // Volvio enseguida sin cambiar de fase: lo que falta no esta en sus manos.
  const { data: ahora } = await supabase.from("chat_trabajos").select("fase").eq("id", t.id).maybeSingle()
  const avanzo = (ahora as { fase: string | null } | null)?.fase !== t.fase
  if (!avanzo && !suelta.reintentar_desde && Date.now() - inicio < PASADA_VACIA_MS) {
    suelta.reintentar_desde = nuevoTope(ESPERA_PASADA_VACIA_S)
  }

  await supabase.from("chat_trabajos").update(suelta).eq("id", t.id).eq("lease_id", o.leaseId)
  if (o.despachar !== false) await despachar(t.account_id)
}
