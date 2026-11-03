import type { EmailOtpType } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"

import { asegurarEmpresaPropia } from "@/engine/empresas"
import { authClient } from "@/lib/supabase/auth"

/**
 * Adonde llegan todos los enlaces de los correos de Supabase: confirmar el
 * registro, la invitacion, restablecer la contraseña, el enlace magico y el
 * cambio de correo.
 *
 * Los enlaces traen `token_hash` y `type` en la query, no la sesion en el `#`
 * de la URL: el `#` no llega al servidor, y aqui la sesion solo vive en el
 * servidor (ver `lib/supabase/auth.ts`). `verifyOtp` cambia el token por una
 * sesion y `@supabase/ssr` la deja en las cookies httpOnly.
 *
 * A donde se va despues lo decide el tipo de enlace y no un parametro de la
 * URL, que cualquiera podria cambiar para usar esta ruta de redirector.
 */

const TIPOS: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"]

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get("token_hash")
  const tipo = searchParams.get("type") as EmailOtpType | null

  if (!tokenHash || !tipo || !TIPOS.includes(tipo)) redirect("/login?aviso=enlace")

  const supabase = await authClient()
  const { data, error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })
  // Vencido o ya usado: el mismo enlace no sirve dos veces.
  if (error || !data.user) redirect("/login?aviso=enlace")

  if (tipo === "recovery") redirect("/contrasena-nueva")
  // Un invitado no tiene contraseña: la elige antes de entrar.
  if (tipo === "invite") redirect("/contrasena-nueva?primera=1")
  if (tipo === "email_change") redirect("/")

  // Registro (o enlace magico de alguien que se registro): su empresa propia,
  // con el nombre que puso al registrarse. Si falla, /bienvenida la crea.
  const nombre = typeof data.user.user_metadata?.empresa === "string" ? data.user.user_metadata.empresa : ""
  await asegurarEmpresaPropia(data.user.id, nombre)
  redirect("/")
}
