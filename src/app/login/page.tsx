import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = {
  title: "Entrar · Plogy Studio",
}

/**
 * La pagina de login (bloque login-05 de shadcn).
 *
 * `destino` lo pone el proxy al desviar a quien no tiene sesion, para devolverlo
 * a donde iba una vez dentro.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>
}) {
  const { destino } = await searchParams

  return (
    <div className="plogy-liquid flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="plogy-glass w-full max-w-md p-8 md:p-10">
        <LoginForm destino={destino} />
      </div>
    </div>
  )
}
