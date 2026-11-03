import type { Metadata } from "next"

import { registroAbierto } from "@/app/(acceso)/actions"
import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = {
  title: "Entrar · Plogy Studio",
}

/**
 * La pagina de login (bloque login-05 de shadcn). El fondo y la tarjeta salen
 * del layout de `(acceso)`.
 *
 * `destino` lo pone el proxy al desviar a quien no tiene sesion, para devolverlo
 * a donde iba una vez dentro. `aviso` lo pone `/auth/confirm` cuando el enlace
 * de un correo ya no sirve.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; aviso?: string }>
}) {
  const { destino, aviso } = await searchParams

  return <LoginForm destino={destino} aviso={aviso} registro={await registroAbierto()} />
}
