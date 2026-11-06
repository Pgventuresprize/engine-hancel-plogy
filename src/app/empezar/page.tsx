import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Empezar } from "@/components/onboarding/empezar"
import { analisisDe } from "@/engine/onboarding/estratega"
import { cuentaActual } from "@/lib/accounts"
import { usuarioActual } from "@/lib/supabase/auth"

export const metadata: Metadata = { title: "Tu marca · Plogy Studio" }
export const dynamic = "force-dynamic"

/** Lo primero que ve una marca nueva: traer su marca o construirla. */
export default async function EmpezarPage() {
  const usuario = await usuarioActual()
  if (!usuario) redirect("/login")
  const cuenta = await cuentaActual()
  if (cuenta.rol !== "owner") redirect("/")
  const analisis = await analisisDe(cuenta.id)
  return <Empezar inicial={analisis} />
}
