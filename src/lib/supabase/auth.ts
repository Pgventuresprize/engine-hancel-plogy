import "server-only"

import { cookies } from "next/headers"
import { createAuthActions, createServerClient } from "@insforge/sdk/ssr"

/**
 * Sesion de usuario contra InsForge Auth, entera en el servidor.
 *
 * El login es una accion de servidor: el navegador manda correo y contraseña,
 * y lo que le vuelve son las cookies de sesion que escriben los helpers SSR de
 * InsForge (el refresh token httpOnly). Ninguna clave sale de aqui.
 *
 * Lo que esto protege es la interfaz, no los datos: el motor usa la API key del
 * proyecto, que puede con todo. Las tablas tienen RLS sin politicas, asi que la
 * anon key (publica) no lee ni escribe nada.
 */

export type Usuario = { id: string; email: string }

function config() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY
  if (!baseUrl || !anonKey) {
    throw new Error("Faltan NEXT_PUBLIC_INSFORGE_URL y/o NEXT_PUBLIC_INSFORGE_ANON_KEY. Copia .env.example a .env.local.")
  }
  return { baseUrl, anonKey }
}

/** Entrar, salir: escriben o borran las cookies de sesion. */
export async function accionesDeSesion() {
  return createAuthActions({ ...config(), cookies: await cookies() })
}

/**
 * El usuario de la sesion, o `null`. Valida el token contra InsForge: para
 * decidir si alguien entra o no, hay que preguntar.
 */
export async function usuarioActual(): Promise<Usuario | null> {
  try {
    const cliente = createServerClient({ ...config(), cookies: await cookies() })
    const { data } = await cliente.auth.getCurrentUser()
    const u = data?.user
    return u?.id ? { id: u.id, email: u.email ?? "" } : null
  } catch {
    return null
  }
}
