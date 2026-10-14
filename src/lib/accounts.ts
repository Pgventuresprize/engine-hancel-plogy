import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import type { Cuenta } from "@/engine/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { usuarioActual } from "@/lib/supabase/auth"

/**
 * La cuenta con la que trabaja la interfaz.
 *
 * Todo lo que se ve en el dashboard esta acotado a una cuenta, y cual es se
 * decide aqui una vez por peticion. La eleccion vive en una cookie, pero la
 * cookie no manda: solo propone. Lo que decide es la pertenencia —quien esta en
 * `account_members`— porque la cookie la escribe el navegador y cambiarla a mano
 * seria, si no, la forma mas facil de leer los datos de otro.
 */

export const COOKIE_CUENTA = "hancel_cuenta"

export type { Cuenta }

export type Rol = "owner" | "member"
export type CuentaConRol = Cuenta & { rol: Rol }

/** Las cuentas a las que el usuario de la sesion tiene acceso. */
export async function cuentasDelUsuario(): Promise<CuentaConRol[]> {
  const usuario = await usuarioActual()
  if (!usuario) return []

  // Con la service role y filtrando por el usuario de la sesion: las tablas
  // tienen RLS sin politicas, asi que el filtro lo pone el codigo.
  const { data, error } = await supabaseAdmin()
    .from("account_members")
    .select("role, accounts (id, name, slug, plan)")
    .eq("user_id", usuario.id)

  if (error) throw new Error(`No se pudieron leer las cuentas: ${error.message}`)

  const cuentas = ((data ?? []) as unknown as { role: Rol; accounts: Cuenta | null }[])
    .filter((fila) => fila.accounts !== null)
    .map((fila) => ({ ...(fila.accounts as Cuenta), rol: fila.role }))

  return cuentas.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * La cuenta activa.
 *
 * Redirige a /login si no hay sesion, que es lo mismo que hace el resto del
 * dashboard. Si el usuario no pertenece a ninguna cuenta lanza: es un estado que
 * solo se da si alguien creo el usuario y olvido darle acceso, y fallar en claro
 * es mejor que enseñar un panel vacio que parece roto.
 */
export async function cuentaActual(): Promise<CuentaConRol> {
  const cuentas = await cuentasDelUsuario()
  if (cuentas.length === 0) {
    const usuario = await usuarioActual()
    if (!usuario) redirect("/login")
    throw new Error(
      `El usuario ${usuario.email} no pertenece a ninguna cuenta. ` +
        "Añadelo a una en account_members."
    )
  }

  const elegida = (await cookies()).get(COOKIE_CUENTA)?.value
  return cuentas.find((cuenta) => cuenta.slug === elegida) ?? cuentas[0]
}

/**
 * Para las paginas del plan advance (estudio, publicacion, videos): una
 * empresa basic que entre por el enlace directo vuelve al tablero.
 */
export async function exigirAdvance(): Promise<CuentaConRol> {
  const cuenta = await cuentaActual()
  if (cuenta.plan !== "advance") redirect("/")
  return cuenta
}

/** Para lo que solo puede hacer quien gestiona la empresa (owner). */
export async function exigirOwner(): Promise<CuentaConRol> {
  const cuenta = await cuentaActual()
  if (cuenta.rol !== "owner") throw new Error("Solo un owner de la empresa puede hacer esto.")
  return cuenta
}

/** Atajo para lo habitual: casi todo solo necesita el id. */
export async function idDeCuentaActual(): Promise<string> {
  return (await cuentaActual()).id
}
