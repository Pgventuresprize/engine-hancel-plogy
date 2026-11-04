"use server"

import { revalidatePath } from "next/cache"

import { redesActivas } from "@/engine/agents/redes"
import { aHora, aMin, claveHueco, horaLibre, PASO_MINUTOS, sumarDias } from "@/engine/calendario/reparto"
import { recursoSinPublicar } from "@/engine/publish/publish-piece"
import { REDES_CALENDARIO } from "@/engine/publish/programadas"
import { dayIn, getSettings, partsIn } from "@/engine/schedule"
import { instanteLocal } from "@/engine/studio/publicar"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { cuentaActual } from "@/lib/accounts"
import type { Colocacion, ResultadoCalendario } from "@/lib/calendario-tipos"

/**
 * Acciones del calendario.
 *
 * Todas escriben con una condicion, no solo con el id: lo publicado o lo que esta
 * saliendo no se mueve, ni lo que espera en Revisar, aunque la pantalla lo pida.
 * La hora la decide el servidor en la zona de la cuenta; el navegador solo manda
 * dia y hora tal como se ven.
 */

const DIA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const SE_MOVIO = "Ya no se puede mover: se publicó, se está publicando o espera revisión."

function refrescar() {
  revalidatePath("/calendario")
  revalidatePath("/estudio")
}

/** El tick solo publica en cuentas con plan: la pantalla no es lo unico que llega aqui. */
async function cuentaConCalendario() {
  const cuenta = await cuentaActual()
  if (cuenta.plan !== "advance") throw new Error("El calendario es del plan advance.")
  return cuenta
}

/** Las piezas que aun se pueden cambiar de sitio. */
const movibles = (accountId: string, ids: string[]) =>
  supabaseAdmin()
    .from("content_pieces")
    .select("id, network")
    .eq("account_id", accountId)
    .in("id", ids)
    .in("network", [...REDES_CALENDARIO])
    .in("status", ["generated", "approved"])
    .is("published_at", null)
    .eq("programada_revisar", false)

async function avisosDe(accountId: string, piezas: { id: string; network: string }[]): Promise<string | undefined> {
  const avisos: string[] = []
  const redes = await redesActivas(accountId)
  if (piezas.some((p) => p.network === "linkedin") && !redes.includes("linkedin")) {
    avisos.push("LinkedIn no está conectado: no saldrá hasta conectarlo.")
  }
  if (piezas.some((p) => p.network === "instagram") && !redes.includes("instagram")) {
    avisos.push("Instagram no está conectado: no saldrá hasta conectarlo.")
  }
  for (const p of piezas.slice(0, 10)) {
    const falta = await recursoSinPublicar(p.id)
    if (falta) {
      avisos.push(falta)
      break
    }
  }
  return avisos.length ? avisos.join(" ") : undefined
}

export async function programarPiezas(lista: Colocacion[]): Promise<ResultadoCalendario> {
  if (lista.length === 0) return { ok: false, error: "No hay piezas para programar." }
  const cuenta = await cuentaConCalendario()

  try {
    if (lista.some((c) => !DIA.test(c.dia) || !HORA.test(c.hora))) return { ok: false, error: "Esa fecha no es válida." }
    if (lista.some((c) => aMin(c.hora) % PASO_MINUTOS !== 0)) return { ok: false, error: `La hora va de ${PASO_MINUTOS} en ${PASO_MINUTOS} minutos.` }

    const supabase = supabaseAdmin()
    const { timezone } = await getSettings(cuenta.id)
    const now = new Date()
    if (lista.some((c) => instanteLocal(c.dia, c.hora, timezone).getTime() <= now.getTime())) {
      return { ok: false, error: "Esa hora ya pasó: elige una más adelante." }
    }

    const { data: piezas, error } = await movibles(cuenta.id, lista.map((c) => c.id))
    if (error) throw new Error(error.message)
    const redDe = new Map(((piezas ?? []) as { id: string; network: string }[]).map((p) => [p.id, p.network]))
    if (redDe.size === 0) return { ok: false, error: SE_MOVIO }

    // Los huecos ya ocupados en esos dias, sin contar lo que se esta moviendo.
    const dias = lista.map((c) => c.dia).sort()
    const { data: ocupadas, error: errorOcupadas } = await supabase
      .from("content_pieces")
      .select("id, network, programada_para")
      .eq("account_id", cuenta.id)
      .neq("status", "rejected")
      .gte("programada_para", instanteLocal(dias[0], "00:00", timezone).toISOString())
      .lt("programada_para", instanteLocal(sumarDias(dias[dias.length - 1], 1), "00:00", timezone).toISOString())
    if (errorOcupadas) throw new Error(errorOcupadas.message)

    const huecos = new Set<string>()
    for (const o of (ocupadas ?? []) as { id: string; network: string; programada_para: string }[]) {
      if (redDe.has(o.id)) continue
      const fecha = new Date(o.programada_para)
      const { hour, minute } = partsIn(timezone, fecha)
      huecos.add(claveHueco(o.network, dayIn(timezone, fecha), aHora(hour * 60 + minute)))
    }

    const colocadas: Colocacion[] = []
    for (const c of lista) {
      const red = redDe.get(c.id)
      if (!red) continue
      const hora = horaLibre(c.dia, c.hora, red, huecos)
      if (!hora) return { ok: false, error: "No queda sitio ese día a partir de esa hora." }

      const { data: movida, error: errorMover } = await supabase
        .from("content_pieces")
        .update({
          programada_para: instanteLocal(c.dia, hora, timezone).toISOString(),
          programada_intentos: 0,
          publish_error: null,
        })
        .eq("id", c.id)
        .eq("account_id", cuenta.id)
        .in("status", ["generated", "approved"])
        .is("published_at", null)
        .eq("programada_revisar", false)
        .select("id")
      if (errorMover) throw new Error(errorMover.message)
      if (!movida?.length) continue

      huecos.add(claveHueco(red, c.dia, hora))
      colocadas.push({ id: c.id, dia: c.dia, hora })
    }

    if (colocadas.length === 0) return { ok: false, error: SE_MOVIO }
    const warning = await avisosDe(cuenta.id, colocadas.map((c) => ({ id: c.id, network: redDe.get(c.id) as string })))
    refrescar()
    return { ok: true, colocadas, warning }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo programar." }
  }
}

/** Aprobar es decir "la vi y sale igual". Va junto a la fecha para que no quede a medias. */
export async function aprobarYProgramar(lista: Colocacion[]): Promise<ResultadoCalendario> {
  if (lista.length === 0) return { ok: false, error: "No hay piezas para programar." }
  const cuenta = await cuentaConCalendario()

  const { error } = await supabaseAdmin()
    .from("content_pieces")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("account_id", cuenta.id)
    .in("id", lista.map((c) => c.id))
    .in("status", ["generated", "approved"])
    .is("published_at", null)
  if (error) return { ok: false, error: error.message }

  return programarPiezas(lista)
}

export async function quitarDelCalendario(ids: string[]): Promise<ResultadoCalendario> {
  if (ids.length === 0) return { ok: false, error: "No hay piezas que quitar." }
  const cuenta = await cuentaConCalendario()

  const { data, error } = await supabaseAdmin()
    .from("content_pieces")
    .update({ programada_para: null, programada_intentos: 0, publish_error: null })
    .eq("account_id", cuenta.id)
    .in("id", ids)
    .in("status", ["generated", "approved"])
    .is("published_at", null)
    .eq("programada_revisar", false)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: SE_MOVIO }

  refrescar()
  return { ok: true, colocadas: [] }
}

/** Vuelve a intentarlo en la proxima pasada: se le da la hora de ahora y se limpian los intentos. */
export async function reintentarPieza(id: string): Promise<ResultadoCalendario> {
  const cuenta = await cuentaConCalendario()

  const { data, error } = await supabaseAdmin()
    .from("content_pieces")
    .update({ programada_para: new Date().toISOString(), programada_intentos: 0, publish_error: null })
    .eq("id", id)
    .eq("account_id", cuenta.id)
    .in("status", ["generated", "approved"])
    .is("published_at", null)
    .eq("programada_revisar", false)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: SE_MOVIO }

  refrescar()
  return { ok: true, colocadas: [] }
}

/**
 * Lo que decide una persona mirando la red cuando no se supo si salio. Si salio,
 * queda publicada a la hora que tenia. Si no, vuelve a la cola de la proxima
 * pasada; y si resulta que estaba, la comprobacion de Instagram la devuelve aqui.
 */
export async function resolverRevision(id: string, salio: boolean): Promise<ResultadoCalendario> {
  const cuenta = await cuentaConCalendario()
  const supabase = supabaseAdmin()

  const { data: pieza, error: errorLeer } = await supabase
    .from("content_pieces")
    .select("programada_para")
    .eq("id", id)
    .eq("account_id", cuenta.id)
    .eq("programada_revisar", true)
    .maybeSingle()
  if (errorLeer) return { ok: false, error: errorLeer.message }
  if (!pieza) return { ok: false, error: "Esa pieza ya no espera revisión." }

  const ahora = new Date().toISOString()
  const { error } = await supabase
    .from("content_pieces")
    .update(
      salio
        ? {
            status: "published",
            published_at: (pieza as { programada_para: string | null }).programada_para ?? ahora,
            programada_revisar: false,
            publish_error: null,
          }
        : { programada_para: ahora, programada_intentos: 0, programada_revisar: false, publish_error: null }
    )
    .eq("id", id)
    .eq("account_id", cuenta.id)
    .eq("programada_revisar", true)
  if (error) return { ok: false, error: error.message }

  refrescar()
  return { ok: true, colocadas: [] }
}
