import { NextResponse } from "next/server"

import { todasLasCuentas } from "@/engine/accounts"
import { ContentLog } from "@/engine/content/log"
import { publicarProgramadas } from "@/engine/publish/programadas"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

/** Un carrusel en Instagram puede tardar minutos. */
export const maxDuration = 300

/**
 * El tick del calendario: publica lo programado que llego a su hora.
 *
 * Lo llama el cron de Postgres cada cinco minutos (fire_calendario_tick). Va
 * aparte del tick de publicacion para que un carrusel de pilares o un reel no le
 * coman el tiempo: lo que se corta en pleno publicar acaba en Revisar. Recorre
 * todas las cuentas; solo publica en las que tienen el interruptor encendido.
 * `?cuenta=<slug>` corre una sola.
 */
async function handle(request: Request) {
  const denied = authorizeEngineRequest(request)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })

  const soloCuenta = new URL(request.url).searchParams.get("cuenta")
  const now = new Date()
  const inicio = Date.now()
  const log = new ContentLog()
  const corridas: unknown[] = []
  for (const cuenta of (await todasLasCuentas()).filter((c) => !soloCuenta || c.slug === soloCuenta)) {
    // Cada cuenta en su propio try: que una falle no puede impedir que las demas publiquen.
    try {
      corridas.push({ cuenta: cuenta.slug, ...(await publicarProgramadas(cuenta.id, { now, inicio, log })) })
    } catch (error) {
      corridas.push({ cuenta: cuenta.slug, error: error instanceof Error ? error.message : String(error) })
    }
  }
  await log.flush()
  return NextResponse.json({ at: now.toISOString(), corridas })
}

export async function POST(request: Request) {
  return handle(request)
}

export async function GET(request: Request) {
  return handle(request)
}
