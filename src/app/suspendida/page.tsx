import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { CambiarEmpresa } from "@/components/admin/cambiar-empresa"
import { Button } from "@/components/ui/button"
import { cuentasDelUsuario } from "@/lib/accounts"
import { adminActual } from "@/lib/admin"
import { usuarioActual } from "@/lib/supabase/auth"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Empresa suspendida · Plogy Studio" }

/**
 * Adonde llega quien abre una empresa suspendida. No usa `cuentaActual`, que es
 * justamente lo que manda aqui, y no muestra el motivo: es una nota interna.
 */
export default async function SuspendidaPage() {
  const usuario = await usuarioActual()
  if (!usuario) redirect("/login")
  const [cuentas, admin] = await Promise.all([cuentasDelUsuario(), adminActual()])
  const suspendidas = cuentas.filter((c) => c.suspendida_en)
  const otras = cuentas.filter((c) => !c.suspendida_en)
  if (suspendidas.length === 0) redirect("/")

  return (
    <main className="bg-sidebar flex min-h-svh items-center justify-center p-4">
      <div className="bg-background flex w-full max-w-md flex-col gap-4 rounded-2xl p-6 shadow-sm">
        <h1 className="font-display text-2xl leading-tight">Esta empresa está suspendida</h1>
        <p className="text-muted-foreground text-sm">
          {suspendidas.map((c) => c.name).join(", ")} no está disponible por ahora. Tus datos siguen guardados y nada se borró. Escríbenos para reactivarla.
        </p>
        {otras.length > 0 ? <CambiarEmpresa empresas={otras.map((c) => ({ slug: c.slug, name: c.name }))} /> : null}
        {admin ? (
          <Button variant="outline" render={<Link href="/admin" />}>
            Ir a Administración
          </Button>
        ) : null}
      </div>
    </main>
  )
}
