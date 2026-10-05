import { NextResponse } from "next/server"

import { todasLasCuentas } from "@/engine/accounts"
import { tickVideos } from "@/engine/videos/publicar"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

/** Escribir un guion o exportar un video de Canva son minutos. */
export const maxDuration = 300

/**
 * El tick de Video studio: marca lo publicado, programa en Buffer lo listo y
 * hace una tarea larga (exportar un video entregado o escribir un guion).
 *
 * Lo llama el cron de Postgres cada diez minutos (fire_videos_tick), aparte del
 * tick del estudio de carruseles. `?cuenta=<slug>` corre una sola cuenta.
 */
async function handle(request: Request) {
  const denied = authorizeEngineRequest(request)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })

  const soloCuenta = new URL(request.url).searchParams.get("cuenta")
  const now = new Date()
  const corridas: unknown[] = []
  for (const cuenta of (await todasLasCuentas()).filter((c) => !soloCuenta || c.slug === soloCuenta)) {
    try {
      corridas.push({ cuenta: cuenta.slug, ...(await tickVideos(cuenta.id, now)) })
    } catch (error) {
      corridas.push({ cuenta: cuenta.slug, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return NextResponse.json({ at: now.toISOString(), corridas })
}

export async function POST(request: Request) {
  return handle(request)
}

export async function GET(request: Request) {
  return handle(request)
}
