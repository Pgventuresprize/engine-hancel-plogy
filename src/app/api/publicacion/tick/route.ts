import { NextResponse } from "next/server"

import { esAdvance, todasLasCuentas } from "@/engine/accounts"
import { publicarPendientes } from "@/engine/studio/publicar"
import { publicarVideosPendientes } from "@/engine/videos/publicar"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

/** Un carrusel en Instagram tarda segundos; un reel, minutos en procesarse. */
export const maxDuration = 300

/**
 * El tick de publicacion: publica lo que llego a su hora en Facebook e
 * Instagram, con las conexiones de Composio de cada empresa.
 *
 * Lo llama el cron de Postgres cada cinco minutos (fire_publicacion_tick), asi
 * que cae justo en las horas de los huecos (:00, :15, :30, :45). Por empresa
 * advance: primero el carrusel del estudio que toque y despues, si queda
 * tiempo, el video que toque. `?cuenta=<slug>` corre una sola.
 */
async function handle(request: Request) {
  const denied = authorizeEngineRequest(request)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })

  const soloCuenta = new URL(request.url).searchParams.get("cuenta")
  const now = new Date()
  const inicio = Date.now()
  const corridas: unknown[] = []
  for (const cuenta of (await todasLasCuentas()).filter((c) => esAdvance(c) && (!soloCuenta || c.slug === soloCuenta))) {
    try {
      const carruseles = await publicarPendientes(cuenta.id, now)
      // Un reel puede tardar hasta cuatro minutos: solo si queda pasada.
      const videos = Date.now() - inicio < 60_000 ? await publicarVideosPendientes(cuenta.id, now) : { acciones: [], errores: ["Sin tiempo en esta pasada; sigue en la próxima."] }
      corridas.push({ cuenta: cuenta.slug, carruseles, videos })
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
