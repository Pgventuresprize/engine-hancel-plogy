import "server-only"

import { headers } from "next/headers"

/**
 * El origen (`https://host`) por el que entro esta peticion.
 *
 * Con el se arma el `redirectTo` de los correos de Supabase, para que el enlace
 * vuelva a donde se pidio: localhost, un deploy de prueba o produccion, sin una
 * variable de entorno por cada uno. Cambiar el Host a mano no lleva a ningun
 * lado: Supabase solo acepta los origenes de su lista de Redirect URLs, y si
 * no esta en ella manda el enlace a la Site URL.
 */
export async function origenDeLaPeticion(): Promise<string> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100"
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https")
  return `${proto}://${host}`
}
