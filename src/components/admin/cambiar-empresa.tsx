"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { cambiarCuenta } from "@/app/cuenta/actions"
import { Button } from "@/components/ui/button"

/** Para quien tiene otra empresa activa: salir de la suspendida sin cerrar sesión. */
export function CambiarEmpresa({ empresas }: { empresas: { slug: string; name: string }[] }) {
  const router = useRouter()
  const [pendiente, startTransition] = React.useTransition()
  return (
    <div className="flex flex-col gap-2">
      {empresas.map((e) => (
        <Button
          key={e.slug}
          variant="brand"
          disabled={pendiente}
          onClick={() =>
            startTransition(async () => {
              await cambiarCuenta(e.slug)
              router.push("/")
            })
          }
        >
          Ir a {e.name}
        </Button>
      ))}
    </div>
  )
}
