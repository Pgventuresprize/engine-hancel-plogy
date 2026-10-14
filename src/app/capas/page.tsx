import { DashboardShell } from "@/components/dashboard-shell"
import { EditorIntenciones } from "@/components/capas/editor-intenciones"
import { EditorListas } from "@/components/capas/editor-listas"
import { EditorPilares } from "@/components/capas/editor-pilares"
import { EditorPlantillas } from "@/components/capas/editor-plantillas"
import { EditorSimple } from "@/components/capas/editor-simple"
import { VistaCanales } from "@/components/capas/vista-canales"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CANALES } from "@/lib/canales-catalogo"
import { getIntenciones, getListas, getPilares, getSimples } from "@/lib/capas-data"
import { getPlantillas } from "@/lib/plantillas-data"
import { cuentaActual, exigirAdvance } from "@/lib/accounts"
import { redesMetaListas } from "@/engine/publish/meta"
import { getLinkedinStatus } from "@/engine/publish/linkedin"

export const dynamic = "force-dynamic"
// Generar la muestra de un estilo en Canva corre dentro de la accion y tarda.
export const maxDuration = 300

export const metadata = { title: "Capas · Engine Hancel" }

/**
 * Las capas del bloque 1: de que puede hablar el contenido y como.
 *
 * Una pantalla, una pestana por capa. Pilar y tema comparten pestana porque son
 * el mismo arbol; canal y formato tambien, porque el formato solo se entiende
 * dibujado dentro de su canal. Estilo define los estilos graficos, que sirven a
 * cualquier receta. Fuente queda de placeholder.
 */
export default async function CapasPage() {
  await exigirAdvance()
  const [pilares, intenciones, narrativas, ctas, cuenta, plantillas, listas] = await Promise.all([
    getPilares(),
    getIntenciones(),
    getSimples("content_narratives"),
    getSimples("content_ctas"),
    cuentaActual(),
    getPlantillas(),
    getListas(),
  ])

  const [linkedin, meta] = await Promise.all([getLinkedinStatus(cuenta.id), redesMetaListas(cuenta.id)])
  const conectados = {
    linkedin: linkedin.connected && !linkedin.expired,
    instagram: meta.instagram,
    facebook: meta.facebook,
  }

  return (
    <DashboardShell title="Capas">
      <Tabs defaultValue="pilares" className="flex flex-col gap-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="pilares">Pilares y temas</TabsTrigger>
          <TabsTrigger value="intencion">Intencion</TabsTrigger>
          <TabsTrigger value="narracion">Narracion</TabsTrigger>
          <TabsTrigger value="cta">CTA</TabsTrigger>
          <TabsTrigger value="canales">Canales</TabsTrigger>
          <TabsTrigger value="estilo">Estilo</TabsTrigger>
          <TabsTrigger value="fuente">Fuente</TabsTrigger>
        </TabsList>

        <div className="max-w-3xl">
          <TabsContent value="pilares">
            <div className="flex flex-col gap-8">
              <EditorPilares pilares={pilares} listas={listas.map((l) => ({ id: l.id, name: l.name, total: l.elementos.length }))} />
              <EditorListas listas={listas} />
            </div>
          </TabsContent>

          <TabsContent value="intencion">
            <EditorIntenciones intenciones={intenciones} narrativas={narrativas} />
          </TabsContent>

          <TabsContent value="narracion">
            <EditorSimple
              tabla="content_narratives"
              filas={narrativas}
              titulo="Narrativas"
              descripcion="Como se cuenta el contenido. La descripcion es lo que el agente lee para saber manejar esa forma."
              ejemploNombre="El error, El paso a paso, El Top…"
              ejemploDescripcion="Ej: se abre con un fallo comun y se corrige."
            />
          </TabsContent>

          <TabsContent value="cta">
            <EditorSimple
              tabla="content_ctas"
              filas={ctas}
              titulo="Llamadas a la accion"
              descripcion="El objetivo a convertir del contenido. El agente elige una al generar."
              ejemploNombre="Seguir, Guardar, Escribir al DM…"
              ejemploDescripcion="Ej: invita a guardar el post para consultarlo despues."
            />
          </TabsContent>

          <TabsContent value="canales">
            <VistaCanales canales={CANALES} conectados={conectados} />
          </TabsContent>

          <TabsContent value="estilo">
            <EditorPlantillas plantillas={plantillas} />
          </TabsContent>

          <TabsContent value="fuente">
            <Placeholder
              titulo="Fuentes"
              texto="Aqui se conectaran las fuentes de las que sale el contenido cuando aplique. Por ahora solo existe la pagina."
            />
          </TabsContent>
        </div>
      </Tabs>
    </DashboardShell>
  )
}

function Placeholder({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
        {texto}
      </p>
    </div>
  )
}
