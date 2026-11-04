import Link from "next/link"
import { AlertTriangleIcon } from "lucide-react"

import { DashboardShell } from "@/components/dashboard-shell"
import { Tablero } from "@/components/kanban/tablero"
import { TableroRedaccion } from "@/components/kanban/tablero-redaccion"
import { Card, CardContent } from "@/components/ui/card"
import { getEstadoIA } from "@/lib/content-data"
import { getTablero } from "@/lib/kanban-data"
import { getTableroRedaccion } from "@/lib/redaccion-data"

// Cambia con cada pasada del pipeline: nada que prerenderizar.
export const dynamic = "force-dynamic"

/**
 * Las server actions de esta pagina corren en su misma ruta, asi que heredan
 * este tope. Sin declararlo se quedan en el de por defecto de la plataforma
 * —unos segundos— y las acciones largas (redibujar un carrusel, analizar una
 * noticia, publicar) se cortan a media faena sin decir nada.
 */
// Generar a mano una noticia sin analizar la analiza primero: lee el articulo y
// sus fuentes, y despues escribe el angulo. Un minuto no alcanza.
export const maxDuration = 300


export const metadata = {
  title: "Estudio · Plogy Studio",
}

const PIPELINES = [
  { id: "redes", nombre: "Redes sociales" },
  { id: "redaccion", nombre: "Redacción" },
] as const

/**
 * El pipeline como tablero.
 *
 * Fue la pantalla de inicio hasta que llego el chat con los agentes; ahora vive
 * en /estudio y el inicio es la conversacion con el equipo.
 *
 * Sustituye a las listas sueltas de candidatas, angulos y piezas, que no dejaban
 * ver que un post venia de un angulo y ese angulo de una noticia. Aqui cada
 * tarjeta es un hecho y se mueve de columna segun avanza.
 *
 * Hay dos pipelines sobre las mismas noticias: el de redes sociales (angulo y
 * piezas por red) y el de redaccion (la noticia redactada entera, con fuentes).
 * Comparten la extraccion y el analisis; se cambia de uno a otro arriba.
 */
export default async function ContenidoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const q = await searchParams
  const pipeline = q.pipeline === "redaccion" ? "redaccion" : "redes"
  const [ia, datos, datosRedaccion] = await Promise.all([
    getEstadoIA(),
    // `?pieza=` abre su ficha: asi llega el Calendario a lo que hay que corregir.
    pipeline === "redes" ? getTablero(typeof q.pieza === "string" ? q.pieza : null) : null,
    pipeline === "redaccion" ? getTableroRedaccion() : null,
  ])

  return (
    <DashboardShell title="Estudio">
      <div className="flex min-w-0 flex-col gap-4">
        {!ia.tokenConfigurado ? (
          <Card className="border-warning/40 bg-warning-soft">
            <CardContent className="flex gap-3 py-4">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-warning">
                  Falta conectar Claude
                </p>
                <p className="mt-1 text-warning">
                  Sin token no se analiza ni se genera nada: lo que envies se queda esperando.
                  Pegalo en la tarjeta <strong>Conexion con Claude</strong> de la configuracion.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <nav className="bg-muted text-muted-foreground inline-flex w-fit rounded-lg p-1 text-sm" aria-label="Pipeline">
          {PIPELINES.map((p) => (
            <Link
              key={p.id}
              href={p.id === "redes" ? "/estudio" : "/estudio?pipeline=redaccion"}
              aria-current={pipeline === p.id ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                pipeline === p.id ? "bg-background text-foreground font-medium shadow-sm" : "hover:text-foreground"
              }`}
            >
              {p.nombre}
            </Link>
          ))}
        </nav>

        {datos ? <Tablero datos={datos} /> : null}
        {datosRedaccion ? <TableroRedaccion datos={datosRedaccion} /> : null}
      </div>
    </DashboardShell>
  )
}
