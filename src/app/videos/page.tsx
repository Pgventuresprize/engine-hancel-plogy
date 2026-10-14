import { DashboardShell } from "@/components/dashboard-shell"
import { exigirAdvance } from "@/lib/accounts"
import { ConfigVideos } from "@/components/videos/config-videos"
import { TableroVideos } from "@/components/videos/tablero-videos"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getVideoStudio } from "@/lib/videos-data"

export const dynamic = "force-dynamic"
// Las acciones de esta pagina escriben guiones y exportan videos de Canva:
// minutos, no segundos.
export const maxDuration = 300

export const metadata = { title: "Video studio · Engine Hancel" }

/**
 * Video studio: el pipeline de videos, a medias entre el agente y una persona.
 * El agente toma la idea y escribe el guion por escenas; una persona genera los
 * clips en Flow y monta el video en Canva; el sistema lo exporta y lo publica.
 */
export default async function VideosPage() {
  await exigirAdvance()
  const vista = await getVideoStudio()
  return (
    <DashboardShell title="Video studio">
      <Tabs defaultValue="tablero" className="flex flex-col gap-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="tablero">Tablero</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>
        <TabsContent value="tablero">
          <TableroVideos videos={vista.videos} ajustes={vista.ajustes} />
        </TabsContent>
        <TabsContent value="config">
          <ConfigVideos ajustes={vista.ajustes} opciones={vista.opciones} />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  )
}
