import { SeleccionDeNoticias } from "@/components/configuracion/seleccion-noticias"
import { ZonaHoraria } from "@/components/configuracion/zona-horaria"
import { DashboardShell } from "@/components/dashboard-shell"
import { getSettings, hourIn } from "@/engine/schedule"
import { idDeCuentaActual } from "@/lib/accounts"
import { configuracionDeGeneracion, getScoreDistribution } from "@/lib/content-data"

export const dynamic = "force-dynamic"

/**
 * Las server actions de esta pagina corren en su misma ruta, asi que heredan
 * este tope. Sin declararlo se quedan en el de por defecto de la plataforma.
 */
export const maxDuration = 60

export const metadata = { title: "General · Plogy Studio" }

/**
 * Lo que vale para toda la cuenta y no pertenece a ningun agente.
 *
 * El umbral y el huso horario. Ninguno encaja en Conexiones ni en Marca, y
 * meterlos en un agente concreto mentiria: el liston es de la cuenta aunque lo
 * mire el agente de angulo, y el huso es lo que da sentido a las horas de
 * todos los agentes a la vez.
 */
export default async function ConfiguracionGeneralPage() {
  const [config, distribution, ajustes] = await Promise.all([
    configuracionDeGeneracion(),
    getScoreDistribution(),
    getSettings(await idDeCuentaActual()),
  ])

  return (
    <DashboardShell title="General">
      <div className="flex max-w-3xl flex-col gap-4">
        <SeleccionDeNoticias config={config} distribution={distribution} />
        <ZonaHoraria
          timezone={ajustes.timezone}
          horaActual={hourIn(ajustes.timezone, new Date())}
        />
      </div>
    </DashboardShell>
  )
}
