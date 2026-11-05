import "server-only"

/**
 * Turnstile, el captcha de Cloudflare, en los formularios publicos que mandan
 * correo: crear cuenta y recuperar la contraseña.
 *
 * Se valida aqui, en la accion de servidor, y no con el captcha de Supabase:
 * ese interruptor tambien exige token al iniciar sesion, y activarlo antes de
 * tiempo deja a todos afuera. El cliente de Supabase solo vive en el servidor
 * (ver `lib/supabase/auth.ts`), asi que estas acciones son la unica entrada.
 *
 * Sin `TURNSTILE_SECRET_KEY` no hay captcha: asi funcionan local y los deploys
 * de prueba, igual que `REGISTRO_ABIERTO` abre o cierra el registro por entorno.
 * Con la clave puesta, cualquier duda cuenta como fallo, incluida una caida de
 * Cloudflare: el formulario no manda correos a ciegas.
 */

const VERIFICAR = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/** Lo unico que ve la persona: el motivo real no le sirve a nadie mas que a un bot. */
export const CAPTCHA_FALLO = "No pudimos confirmar que eres una persona. Espera a que termine la verificación e intenta otra vez."

export async function pasoElCaptcha(form: FormData): Promise<boolean> {
  const secreto = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secreto) return true

  // El widget lo agrega solo al formulario con este nombre.
  const token = String(form.get("cf-turnstile-response") ?? "")
  if (!token) return false

  try {
    const respuesta = await fetch(VERIFICAR, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: secreto, response: token }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    })
    if (!respuesta.ok) return false

    const { success } = (await respuesta.json()) as { success?: boolean }
    return success === true
  } catch {
    return false
  }
}
