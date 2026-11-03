import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { BienvenidaForm } from "@/components/auth/formularios"
import { cuentasDelUsuario } from "@/lib/accounts"
import { usuarioActual } from "@/lib/supabase/auth"

export const metadata: Metadata = {
  title: "Crea tu empresa · Plogy Studio",
}

/**
 * Para quien tiene sesion pero ninguna empresa: si fallo crear la suya al
 * confirmar el registro, o si lo quitaron de la unica que tenia. `cuentaActual`
 * manda aqui en vez de lanzar un error.
 */
export default async function BienvenidaPage() {
  const usuario = await usuarioActual()
  if (!usuario) redirect("/login")
  if ((await cuentasDelUsuario()).length > 0) redirect("/")

  return <BienvenidaForm email={usuario.email ?? ""} />
}
