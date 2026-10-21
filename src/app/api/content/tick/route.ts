import { NextResponse } from "next/server"

import { runContentTick } from "@/engine/content/tick"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

/**
 * Una generacion con Opus son casi un minuto, y el revisor con Claude lee la
 * noticia entera otra vez despues de cada version: con sesenta segundos la
 * pasada se cortaba a media pieza.
 */
export const maxDuration = 300

/**
 * Cuantos trabajos hace cada pasada.
 *
 * Uno. Medido con la cola llena y Sonnet: con dos la pasada tardaba 54
 * segundos cuando el limite era 60, demasiado cerca para una red que a veces
 * va lenta. Con Opus y el revisor con Claude, una sola pieza ya pasa del minuto.
 *
 * Ir despacio no es el problema; quedarse a medias si: una pasada cortada deja
 * trabajo reclamado y pasos enteros sin ejecutar. El ritmo se compensa con la
 * frecuencia del cron, que es gratis, no apretando la pasada.
 */
const PRESUPUESTO_POR_TICK = 1

/**
 * "Despierta y revisa la cola de contenido".
 *
 * Lo llaman los triggers de Postgres cuando un buzon pasa a 'done' o 'failed',
 * cuando una noticia queda 'analyzed', y el cron de respaldo cada cinco minutos.
 * Ninguno transporta trabajo: todos dicen lo mismo y la pasada averigua sola que
 * hay que hacer. Por eso recibir el aviso dos veces es inofensivo.
 */
async function handle(request: Request) {
  const denied = authorizeEngineRequest(request)
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 401 })
  }

  const url = new URL(request.url)
  const trigger = url.searchParams.get("trigger")

  try {
    const summary = await runContentTick({
      trigger: trigger === "cron" || trigger === "manual" ? trigger : "trigger",
      signal: request.signal,
      // El tick tiene un minuto y el trabajo no es barato: una generacion son
      // unos quince segundos de Claude y dibujar un carrusel casi veinte. Sin
      // tope intentaba vaciar la cola entera, lo mataban a media faena y lo que
      // quedaba detras —encolar los angulos que esperan— no llegaba a correr
      // nunca, por mucho que sus agentes estuvieran en automatico.
      presupuesto: PRESUPUESTO_POR_TICK,
    })
    return NextResponse.json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return handle(request)
}

/** pg_net usa POST; el GET esta para poder probarlo a mano. */
export async function GET(request: Request) {
  return handle(request)
}
