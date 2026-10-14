"use server"

import { revalidatePath } from "next/cache"

import { cambiarCuenta } from "@/app/cuenta/actions"
import type { Plan } from "@/engine/accounts"
import { actualizarEmpresa, agregarMiembro, cambiarRol, crearEmpresa, quitarMiembro, type Rol } from "@/engine/empresas"
import { exigirOwner } from "@/lib/accounts"
import { usuarioActual } from "@/lib/supabase/auth"

/**
 * La gestion de la empresa abierta (nombre, plan, miembros) y la creacion de
 * empresas nuevas. Gestionar la empresa es cosa de sus owners; crear una
 * empresa nueva lo puede cualquier usuario, y queda como su owner.
 */

export type Resultado = { ok: true; aviso?: string } | { ok: false; error: string }

async function comoOwner<T>(fn: (accountId: string) => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    const cuenta = await exigirOwner()
    return await fn(cuenta.id)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function guardarEmpresa(campos: { name: string; plan: Plan }): Promise<Resultado> {
  const r = await comoOwner((id) => actualizarEmpresa(id, campos))
  revalidatePath("/", "layout")
  return r.ok ? { ok: true, aviso: "Empresa guardada." } : r
}

export async function invitarMiembro(email: string, rol: Rol, password: string): Promise<Resultado> {
  const r = await comoOwner((id) => agregarMiembro(id, email, rol, password || undefined))
  revalidatePath("/configuracion/empresa")
  if (!r.ok) return r
  return { ok: true, aviso: "creado" in r && r.creado ? "Usuario creado y añadido. Ya puede entrar con ese correo y contraseña." : "Añadido a la empresa." }
}

export async function cambiarRolMiembro(userId: string, rol: Rol): Promise<Resultado> {
  const r = await comoOwner((id) => cambiarRol(id, userId, rol))
  revalidatePath("/configuracion/empresa")
  return r
}

export async function quitarMiembroDeEmpresa(userId: string): Promise<Resultado> {
  const yo = await usuarioActual()
  if (yo?.id === userId) return { ok: false, error: "No puedes quitarte a ti mismo; pídeselo a otro owner." }
  const r = await comoOwner((id) => quitarMiembro(id, userId))
  revalidatePath("/configuracion/empresa")
  return r
}

export async function nuevaEmpresa(nombre: string, plan: Plan): Promise<Resultado> {
  const yo = await usuarioActual()
  if (!yo) return { ok: false, error: "Sesión caducada: vuelve a entrar." }
  const r = await crearEmpresa(nombre, plan, yo.id)
  if (!r.ok) return r
  // Se abre la empresa recien creada.
  await cambiarCuenta(r.slug)
  return { ok: true, aviso: `Empresa creada. Ahora estás en ella: conecta sus servicios en Conexiones.` }
}
