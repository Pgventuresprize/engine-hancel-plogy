import { DashboardShell } from "@/components/dashboard-shell"
import { exigirAdvance } from "@/lib/accounts"
import { GaleriaPilar } from "@/components/estudio/galeria-pilar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getEstudio } from "@/lib/estudio-data"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export const metadata = { title: "Estudio de pilares · Engine Hancel" }

/**
 * El estudio del pipeline nuevo: lo que produce cada pilar.
 *
 * Una pestana por pilar, porque cada pilar es como una marca con sus ideas y
 * sus recetas. Las noticias siguen en su propio tablero (Estudio).
 */
export default async function EstudioPilaresPage() {
  await exigirAdvance()
  const pilares = await getEstudio()

  return (
    <DashboardShell title="Estudio de pilares">
      {pilares.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">
          No hay pilares todavía. Créalos en Capas.
        </p>
      ) : (
        <Tabs defaultValue={pilares[0].id} className="flex flex-col gap-4">
          <TabsList className="h-auto flex-wrap">
            {pilares.map((p) => (
              <TabsTrigger key={p.id} value={p.id}>
                {p.name}
                <span className="text-muted-foreground ml-1.5 text-xs">{p.piezas.length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {pilares.map((p) => (
            <TabsContent key={p.id} value={p.id}>
              <GaleriaPilar pilar={p} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </DashboardShell>
  )
}
