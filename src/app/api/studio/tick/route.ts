import { NextResponse } from "next/server"

import { esAdvance, todasLasCuentas } from "@/engine/accounts"
import { getSettings } from "@/engine/schedule"
import { correrRecetas } from "@/engine/studio/generar"
import { asegurarCartuchos } from "@/engine/ideas/cadencia"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

/** Generar una pieza es Claude mas Canva: minutos, no segundos. Margen amplio. */
export const maxDuration = 300

/**
 * Cuantas piezas hace una pasada, por cuenta.
 *
 * Cada pieza son unos quince segundos de Claude, y si lleva Canva se suman los
 * jobs de relleno y export, que pueden pasar del minuto. Con dos por pasada
 * nunca se corta a medias; el cron pasa cada diez minutos y termina la tanda.
 */
const PRESUPUESTO = 2

/**
 * El tick del estudio: rellena ideas si hacen falta y corre las recetas. La
 * publicacion va aparte, en el tick de publicacion (cada cinco minutos).
 *
 * Lo llama el cron de Postgres cada diez minutos (fire_studio_tick); que receta
 * toca lo decide su horario, no el cron. Primero la cadencia del
 * agente de ideas (rellena los pilares que bajen de siete dias de cartuchos),
 * despues el agente de contenido (produce las piezas de las recetas que toquen).
 * Cada cuenta en su propio try: un fallo en una no frena a las demas.
 *
 * `?force=1` salta el horario de las recetas. `?cuenta=<slug>` corre una sola.
 * `?soloCadencia=1` solo rellena ideas; `?soloContenido=1` solo produce piezas.
 */
async function handle(request: Request) {
  const denied = authorizeEngineRequest(request)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })

  const url = new URL(request.url)
  const force = url.searchParams.get("force") === "1"
  const soloCuenta = url.searchParams.get("cuenta")
  const soloCadencia = url.searchParams.get("soloCadencia") === "1"
  const soloContenido = url.searchParams.get("soloContenido") === "1"

  const now = new Date()
  // El estudio es del plan advance: las cuentas basic solo tienen noticias.
  const cuentas = (await todasLasCuentas()).filter((c) => esAdvance(c) && (!soloCuenta || c.slug === soloCuenta))

  const corridas: unknown[] = []
  for (const cuenta of cuentas) {
    try {
      const { timezone } = await getSettings(cuenta.id)

      const cadencia = soloContenido ? null : await asegurarCartuchos(cuenta.id)
      const recetas = soloCadencia
        ? null
        : await correrRecetas({ accountId: cuenta.id, timezone, now, force, presupuesto: PRESUPUESTO })

      corridas.push({ cuenta: cuenta.slug, cadencia, recetas })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      corridas.push({ cuenta: cuenta.slug, error: message })
    }
  }

  return NextResponse.json({ at: now.toISOString(), corridas })
}

export async function POST(request: Request) {
  return handle(request)
}

/** pg_net dispara por POST; el GET queda para probar a mano. */
export async function GET(request: Request) {
  return handle(request)
}
