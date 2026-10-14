import { DashboardShell } from "@/components/dashboard-shell"
import { exigirAdvance } from "@/lib/accounts"
import { ConfigEstudio } from "@/components/recetas/config-estudio"
import { EditorRecetas } from "@/components/recetas/editor-recetas"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getConfigEstudio, getPilaresSimple, getRecetas } from "@/lib/recetas-data"
import { getPlantillas } from "@/lib/plantillas-data"

export const dynamic = "force-dynamic"
// "Generar ahora" corre el agente de contenido dentro de la accion.
export const maxDuration = 300

export const metadata = { title: "Recetas · Engine Hancel" }

/**
 * El bloque 2: que se produce con los cartuchos, y como se configuran los
 * agentes que lo hacen.
 */
export default async function RecetasPage() {
  await exigirAdvance()
  const [recetas, pilares, config, plantillas] = await Promise.all([
    getRecetas(),
    getPilaresSimple(),
    getConfigEstudio(),
    getPlantillas(),
  ])

  return (
    <DashboardShell title="Recetas">
      <Tabs defaultValue="recetas" className="flex flex-col gap-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="recetas">Recetas</TabsTrigger>
          <TabsTrigger value="config">Configuracion</TabsTrigger>
        </TabsList>

        <div className="max-w-3xl">
          <TabsContent value="recetas">
            <EditorRecetas
              recetas={recetas}
              pilares={pilares}
              plantillas={plantillas.map((t) => ({ id: t.id, name: t.name, tipo: t.tipo }))}
            />
          </TabsContent>
          <TabsContent value="config">
            <ConfigEstudio config={config} />
          </TabsContent>
        </div>
      </Tabs>
    </DashboardShell>
  )
}
