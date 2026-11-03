import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { ContrasenaForm } from "@/components/auth/formularios"
import { usuarioActual } from "@/lib/supabase/auth"

export const metadata: Metadata = {
  title: "Contraseña nueva · Plogy Studio",
}

/**
 * Elegir contraseña. Se llega con sesion: la que dejo el enlace de recuperar o
 * de la invitacion (`/auth/confirm`), o la de siempre desde el menu de la
 * cuenta. Sin sesion no hay a quien cambiarsela, y se pide el enlace.
 */
export default async function ContrasenaNuevaPage({
  searchParams,
}: {
  searchParams: Promise<{ primera?: string }>
}) {
  const usuario = await usuarioActual()
  if (!usuario) redirect("/recuperar")
  const { primera } = await searchParams

  return <ContrasenaForm email={usuario.email ?? ""} primera={primera === "1"} />
}
