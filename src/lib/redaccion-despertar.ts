import "server-only"

import { after } from "next/server"
import { headers } from "next/headers"

/**
 * Despierta el tick de redaccion sin esperarlo.
 *
 * Redactar tarda mas de lo que aguanta una accion de la interfaz, asi que la
 * accion deja la noticia en cola y llama a la ruta del tick, que tiene cinco
 * minutos. La llamada sale despues de responder (`after`) y no se espera: la
 * ruta sigue sola. Si no llegara, el cron la recoge en la proxima pasada.
 */
export async function despertarRedaccion(cuentaSlug?: string): Promise<void> {
  const secreto = process.env.INGEST_SECRET
  if (!secreto) return
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  if (!host) return
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const url = `${proto}://${host}/api/redaccion/tick${cuentaSlug ? `?cuenta=${encodeURIComponent(cuentaSlug)}` : ""}`
  after(async () => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secreto}` },
        signal: AbortSignal.timeout(8_000),
      })
    } catch {
      // Se corta a proposito: la ruta sigue trabajando aunque nadie la espere.
    }
  })
}
