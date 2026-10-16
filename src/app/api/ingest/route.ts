import { NextResponse } from "next/server"

import { todasLasCuentas } from "@/engine/accounts"
import { runIngestion, type IngestionSummary } from "@/engine/ingest"
import { ajustesDe, marcarCorrida } from "@/engine/agents/settings"
import { leToca } from "@/engine/agents/turno"
import { getSettings, marcarIngesta } from "@/engine/schedule"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * El cron de Postgres llama y aqui se decide a que cuentas les toca.
 *
 * El cron ya no puede ser el horario de una sola cuenta: es la union de todos,
 * asi que dispara mas veces de las que le toca a cada una y puede llegar a ratos
 * que no son de nadie. Quien decide es esto, comparando la hora con el horario
 * de cada cuenta, que es lo que se edita en /engine/schedule.
 *
 * Las cuentas van en serie y cada una en su propio try: una taxonomia rota o una
 * cuota de Serper agotada no puede impedir que las demas ingieran.
 *
 * `?force=1` salta la comprobacion de hora, para disparos manuales.
 */
async function handle(request: Request) {
  const denied = authorizeEngineRequest(request)
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 401 })
  }

  const url = new URL(request.url)
  const force = url.searchParams.get("force") === "1"
  // Permite disparar una sola cuenta a mano sin tocar a las demas.
  const soloCuenta = url.searchParams.get("cuenta")

  const ahora = new Date()
  const cuentas = (await todasLasCuentas()).filter(
    (cuenta) => !soloCuenta || cuenta.slug === soloCuenta
  )

  const corridas: (
    | { cuenta: string; skipped: true; reason: string }
    | { cuenta: string; skipped: false; summary: IngestionSummary }
    | { cuenta: string; error: string }
  )[] = []

  for (const cuenta of cuentas) {
    try {
      if (!force) {
        const settings = await getSettings(cuenta.id)

        // El agente de extraccion manda: en manual no sale a buscar nada por su
        // cuenta, solo desde el boton del tablero. No tiene modo automatico
        // porque no hay ningun paso antes que le entregue trabajo.
        const suyo = await ajustesDe(cuenta.id, "extraccion")
        // Solo manda el horario del agente (Agentes > Extraccion). La lista de
        // horas vieja de la cuenta ya no cuenta: con las dos, la extraccion
        // corria a la hora de una y no a la de la otra. El cron pasa cada diez
        // minutos y `last_run_at` impide repetir una pasada ya hecha.
        const turno = leToca(suyo, settings.timezone, ahora)
        if (!turno.corre) {
          corridas.push({ cuenta: cuenta.slug, skipped: true, reason: turno.motivo })
          continue
        }
      }

      if (!force) await marcarCorrida(cuenta.id, "extraccion")

      // Se marca antes de correr: si la corrida tarda mas que el siguiente
      // disparo del cron, marcar al final dejaria entrar una segunda.
      await marcarIngesta(cuenta.id)
      const summary = await runIngestion({ accountId: cuenta.id, signal: request.signal })
      corridas.push({ cuenta: cuenta.slug, skipped: false, summary })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      corridas.push({ cuenta: cuenta.slug, error: message })
    }
  }

  return NextResponse.json({ at: ahora.toISOString(), corridas })
}

export async function POST(request: Request) {
  return handle(request)
}

// El cron de Postgres invoca por POST; el GET queda para comprobar a mano.
export async function GET(request: Request) {
  return handle(request)
}
