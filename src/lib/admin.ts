import "server-only"

import { notFound } from "next/navigation"
import { cache } from "react"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { usuarioActual } from "@/lib/supabase/auth"

/**
 * Quien es administrador de la plataforma.
 *
 * No tiene que ver con ser owner: un owner gestiona su empresa, un administrador
 * ve todas. Sale de `platform_admins` en cada peticion, nunca de una cookie ni de
 * algo que mande el navegador.
 */

export type Admin = { id: string; email: string }

/** El administrador de la sesion, o null. Se pregunta una vez por peticion. */
export const adminActual = cache(async (): Promise<Admin | null> => {
  const usuario = await usuarioActual()
  if (!usuario?.email) return null
  const { data, error } = await supabaseAdmin().from("platform_admins").select("user_id").eq("user_id", usuario.id).maybeSingle()
  // Sin la tabla, o con la base caida, la respuesta es no: el panel se cierra.
  if (error || !data) return null
  return { id: usuario.id, email: usuario.email }
})

/**
 * Para las paginas: quien no es administrador recibe un 404, igual que una ruta
 * que no existe. Asi el panel ni siquiera se anuncia.
 *
 * Cada pagina la llama, no solo el layout: Next no vuelve a correr el layout al
 * navegar entre paginas hijas.
 */
export async function exigirAdmin(): Promise<Admin> {
  const admin = await adminActual()
  if (!admin) notFound()
  return admin
}
