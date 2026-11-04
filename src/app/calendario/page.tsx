import { Calendario } from "@/components/calendario/calendario"
import { DashboardShell } from "@/components/dashboard-shell"
import { exigirAdvance } from "@/lib/accounts"
import { getCalendario } from "@/lib/calendario-data"

export const dynamic = "force-dynamic"

/**
 * Las server actions de esta pagina heredan este tope, y "Publicar ahora" puede
 * tardar minutos en Instagram: sin esto se cortaria a media publicacion.
 */
export const maxDuration = 300

export const metadata = { title: "Calendario · Plogy Studio" }

/**
 * Cuando sale cada post. El Estudio produce y el Calendario decide la fecha: la
 * bandeja es lo que el Estudio dejo listo, y se arrastra a la semana.
 */
export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await exigirAdvance()
  const q = await searchParams
  const datos = await getCalendario({
    vista: q.vista === "mes" ? "mes" : "semana",
    fecha: typeof q.fecha === "string" ? q.fecha : null,
  })

  return (
    <DashboardShell title="Calendario">
      <Calendario datos={datos} />
    </DashboardShell>
  )
}
