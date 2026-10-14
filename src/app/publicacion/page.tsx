import { DashboardShell } from "@/components/dashboard-shell"
import { exigirAdvance } from "@/lib/accounts"
import { Publicacion } from "@/components/publicacion/agente-publicacion"
import { getPublicacion } from "@/lib/publicacion-data"

export const dynamic = "force-dynamic"

export const metadata = { title: "Publicación · Engine Hancel" }

/**
 * El agente de publicacion del estudio: sus ajustes y el plan de hoy. Aparte
 * del agente de publicacion de las noticias, que vive en Agentes.
 */
export default async function PublicacionPage() {
  await exigirAdvance()
  const vista = await getPublicacion()
  return (
    <DashboardShell title="Publicación">
      <div className="max-w-4xl">
        <Publicacion vista={vista} />
      </div>
    </DashboardShell>
  )
}
