import { DashboardShell } from "@/components/dashboard-shell"
import { exigirAdvance } from "@/lib/accounts"
import { PanelPilar } from "@/components/ideas/panel-pilar"
import { getIdeasPorPilar } from "@/lib/ideas-data"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export const metadata = { title: "Ideas · Engine Hancel" }

/**
 * Los cartuchos: las ideas que produce el bloque 1.
 *
 * Una tarjeta por pilar, con sus cartuchos disponibles y el boton que genera
 * una ronda nueva. Un cartucho es una idea lista para que un agente de
 * contenido la convierta en pieza.
 */
export default async function IdeasPage() {
  await exigirAdvance()
  const pilares = await getIdeasPorPilar()

  return (
    <DashboardShell title="Ideas">
      <div className="flex max-w-3xl flex-col gap-4">
        {pilares.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">
            No hay pilares todavia. Crealos en Capas para que el agente de ideas tenga de que
            hablar.
          </p>
        ) : (
          pilares.map((p) => <PanelPilar key={p.id} pilar={p} />)
        )}
      </div>
    </DashboardShell>
  )
}
