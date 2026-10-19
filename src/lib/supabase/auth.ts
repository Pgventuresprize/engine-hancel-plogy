import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { SupabaseClient, User } from "@supabase/supabase-js"

/**
 * Sesion de usuario contra Supabase Auth, entera en el servidor.
 *
 * No hay cliente de Supabase en el navegador, y no es por comodidad: las tablas
 * `raw_news` y `pipeline_runs` tienen RLS desactivado, asi que la clave
 * publicable concede lectura y escritura sobre todo el corpus. Publicarla como
 * `NEXT_PUBLIC_` para poder llamar a `signInWithPassword` desde el navegador
 * regalaria esa credencial a cualquiera que abra la pagina de login — que es
 * justo la pagina que ve quien todavia no ha entrado.
 *
 * Asi que el login es una accion de servidor, la sesion vive en cookies httpOnly
 * que escribe `@supabase/ssr`, y la clave no sale de aqui.
 *
 * Lo que esto protege es la interfaz, no los datos: quien tenga la service role
 * sigue pudiendo con todo. Para un panel interno de una sola cuenta es
 * suficiente; si algun dia hay varios usuarios con permisos distintos, el
 * control tiene que bajar a politicas RLS.
 */

function credenciales(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL y/o SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local."
    )
  }

  return { url, key }
}

/**
 * Cliente atado a las cookies de la peticion.
 *
 * Vale para Server Components y para acciones de servidor. En un Server
 * Component escribir cookies lanza —Next no deja tocar la respuesta una vez
 * empezo a renderizar— y por eso `setAll` se traga el error: ahi solo interesa
 * leer la sesion, y de refrescarla ya se encarga el proxy en cada peticion.
 */
export async function authClient(): Promise<SupabaseClient> {
  const { url, key } = credenciales()
  const store = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options)
          }
        } catch {
          // Server Component: no hay respuesta que tocar. Lo refresca el proxy.
        }
      },
    },
  })
}

/**
 * El usuario de la sesion, o `null`.
 *
 * `getUser()` y no `getSession()`: la sesion sale de una cookie que el navegador
 * manda tal cual, mientras que `getUser()` valida el token contra Supabase. Para
 * decidir si alguien entra o no, hay que preguntar.
 */
export async function usuarioActual(): Promise<User | null> {
  const supabase = await authClient()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}
