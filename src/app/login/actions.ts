"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { accionesDeSesion } from "@/lib/supabase/auth"

/**
 * Entrar y salir.
 *
 * Las dos son acciones de servidor (ver `lib/supabase/auth.ts`): el navegador
 * manda correo y contraseña a esta accion, y lo que le vuelve es una cookie de
 * sesion, nunca una clave.
 */

export type LoginResult = { error: string } | undefined

export async function iniciarSesion(_previo: LoginResult, form: FormData): Promise<LoginResult> {
  const email = String(form.get("email") ?? "").trim()
  const password = String(form.get("password") ?? "")
  const destino = String(form.get("destino") ?? "")

  if (!email || !password) {
    return { error: "Escribe el correo y la contraseña." }
  }

  const auth = await accionesDeSesion()
  const { data, error } = await auth.signInWithPassword({ email, password })

  if (error || !data?.user) {
    // El motivo real no se enseña: distinguir "no existe ese correo" de "la
    // contraseña no es esa" le dice a quien prueba credenciales cuales son
    // validas. Los casos que si sirven de algo se traducen.
    const mensaje =
      error?.statusCode === 403
        ? "La cuenta existe pero no esta confirmada."
        : error?.statusCode === 429
          ? "Demasiados intentos. Espera un momento."
          : "Correo o contraseña incorrectos."

    return { error: mensaje }
  }

  // El destino solo puede ser una ruta de esta aplicacion: aceptar una URL
  // completa convertiria el login en un redirector abierto hacia cualquier sitio.
  const vuelta = destino.startsWith("/") && !destino.startsWith("//") ? destino : "/"

  revalidatePath("/", "layout")
  redirect(vuelta)
}

export async function cerrarSesion(): Promise<void> {
  const auth = await accionesDeSesion()
  await auth.signOut()

  revalidatePath("/", "layout")
  redirect("/login")
}
