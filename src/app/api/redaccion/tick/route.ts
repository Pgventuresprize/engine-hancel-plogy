import { NextResponse } from "next/server"

import { todasLasCuentas } from "@/engine/accounts"
import { tickRedaccion } from "@/engine/redaccion/tick"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

/** Investigar y redactar una noticia toma de veinte segundos a un minuto y medio. */
export const maxDuration = 300

/**
 * El tick del pipeline de redaccion: selecciona por el umbral de redaccion y
 * redacta lo que haya en cola, tres a la vez.
 *
 * Lo llama el cron de Postgres cada cinco minutos (fire_redaccion_tick) y la
 * interfaz cuando alguien pide una redaccion, para no esperar a la pasada.
 * `?cuenta=<slug>` corre una sola.
 */
async function handle(request: Request) {
  const denied = authorizeEngineRequest(request)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })

  const soloCuenta = new URL(request.url).searchParams.get("cuenta")
  const inicio = Date.now()
  const corridas: unknown[] = []
  for (const cuenta of (await todasLasCuentas()).filter((c) => !soloCuenta || c.slug === soloCuenta)) {
    if (Date.now() - inicio > 200_000) break
    try {
      const r = await tickRedaccion(cuenta.id, { limite: 3, paralelo: 3, hastaMs: inicio + 200_000 })
      corridas.push({ cuenta: cuenta.slug, ...r })
    } catch (error) {
      corridas.push({ cuenta: cuenta.slug, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return NextResponse.json({ at: new Date().toISOString(), corridas })
}

export async function POST(request: Request) {
  return handle(request)
}

export async function GET(request: Request) {
  return handle(request)
}
