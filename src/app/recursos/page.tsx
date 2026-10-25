import { DashboardShell } from "@/components/dashboard-shell"
import { ListaRecursos } from "@/components/recursos/lista-recursos"
import { getRecursos } from "@/lib/recursos-data"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export const metadata = { title: "Recursos · Engine Hancel" }

/**
 * Los reportes y guias que promete el cierre de las piezas, todos juntos.
 *
 * Cada uno vive tambien en la ficha de su noticia (pestaña Recurso); aqui se
 * revisan sin ir noticia por noticia. Al abrir uno se ve el mismo panel, con
 * sus botones de aprobar, corregir, rehacer y retirar.
 */
export default async function RecursosPage() {
  const filas = await getRecursos()

  return (
    <DashboardShell title="Recursos">
      <div className="flex max-w-4xl flex-col gap-4">
        <div>
          <h1 className="text-base font-medium">Reportes y guías</h1>
          <p className="text-muted-foreground text-sm">
            Lo que reciben por DM quienes comentan la palabra de una pieza. El agente de recursos los escribe antes que el carrusel cuando el CTA
            tiene encendido «Hancel escribe el recurso de cada pieza» (Marca → CTA). Ninguna pieza que promete uno se publica antes que él.
          </p>
        </div>
        {filas.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">
            Todavía no hay reportes ni guías. Aparecen aquí cuando una pieza con ese CTA pide el suyo.
          </p>
        ) : (
          <ListaRecursos filas={filas} />
        )}
      </div>
    </DashboardShell>
  )
}
