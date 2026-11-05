import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"

import { registroAbierto } from "@/app/(acceso)/actions"
import { EncabezadoAcceso } from "@/components/auth/encabezado"
import { RegistroForm } from "@/components/auth/formularios"
import { listaDePaises, paisConocido } from "@/lib/paises"

export const metadata: Metadata = {
  title: "Crear cuenta · Plogy Studio",
}

/**
 * Crear cuenta: la persona y su propia empresa, en plan basic. Abierta sin
 * sesion. Con `REGISTRO_ABIERTO=no` solo se entra por invitacion.
 */
export default async function RegistroPage() {
  if (!(await registroAbierto())) {
    return (
      <div className="flex flex-col gap-6">
        <EncabezadoAcceso titulo="Por ahora solo por invitación">
          Pide a alguien de tu empresa que te invite desde Configuración › Empresa.
        </EncabezadoAcceso>
        <p className="text-center text-sm">
          <Link href="/login" className="text-brand-text underline underline-offset-4">
            Volver a entrar
          </Link>
        </p>
      </div>
    )
  }

  // Vercel dice desde que pais llega la visita. Solo elige con que abre el
  // selector: no se guarda, y sin ese dato la persona elige.
  const paisInicial = paisConocido((await headers()).get("x-vercel-ip-country"))

  return <RegistroForm paises={listaDePaises()} paisInicial={paisInicial} />
}
