import { ClaudeConnection } from "@/components/contenido/claude-connection"
import { LinkedinConnection } from "@/components/contenido/linkedin-connection"
import { CanvaConnection } from "@/components/configuracion/canva-connection"
import { MetaConnection } from "@/components/configuracion/meta-connection"
import { SerperConnection } from "@/components/configuracion/serper-connection"
import { WebConnection } from "@/components/configuracion/web-connection"
import { DashboardShell } from "@/components/dashboard-shell"
import { estadoSerper, estadoTokenClaude } from "@/app/cuenta/actions"
import { getLinkedinStatus } from "@/engine/publish/linkedin"
import { estadoConexion } from "@/engine/composio/conexiones"
import { esAdvance } from "@/engine/accounts"
import { cuentaInstagram, paginasFacebook } from "@/engine/publish/meta"
import { secretosDe } from "@/engine/secretos"
import { cuentaActual } from "@/lib/accounts"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export const metadata = { title: "Conexiones · Engine Hancel" }

/**
 * Con que habla el motor, para la empresa abierta: cada empresa tiene sus
 * propias conexiones y no ve las de las demas.
 *
 * Tres familias, en el orden en que importan: el modelo que escribe, los
 * canales donde se publica y las integraciones que alimentan el pipeline.
 */
export default async function ConexionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const cuenta = await cuentaActual()
  // Recien vuelto de conectar algo, el estado se lee fresco (sin cache).
  const fresco = Boolean(first("canva") || first("facebook") || first("instagram"))
  const [linkedin, tokenClaude, serper, canva, facebook, instagram, secretos] = await Promise.all([
    getLinkedinStatus(cuenta.id),
    estadoTokenClaude(),
    estadoSerper(),
    estadoConexion(cuenta.id, "canva", fresco),
    estadoConexion(cuenta.id, "facebook", fresco),
    estadoConexion(cuenta.id, "instagram", fresco),
    secretosDe(cuenta.id),
  ])
  const [paginas, ig] = await Promise.all([
    facebook.conectado ? paginasFacebook(cuenta.id) : Promise.resolve(null),
    instagram.conectado ? cuentaInstagram(cuenta.id) : Promise.resolve(null),
  ])

  return (
    <DashboardShell title="Conexiones">
      <div className="flex max-w-3xl flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Modelo de IA</h2>
          <ClaudeConnection estado={tokenClaude} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Canales</h2>
          <LinkedinConnection
            status={linkedin}
            resultado={first("linkedin")}
            motivo={first("motivo") ?? first("cuenta")}
          />
          <MetaConnection
            red="instagram"
            conectado={instagram.conectado}
            detalle={ig?.ok && ig.usuario ? `@${ig.usuario}` : null}
            recienConectado={first("instagram") === "ok"}
          />
          <MetaConnection
            red="facebook"
            conectado={facebook.conectado}
            detalle={secretos.facebook_page_name}
            paginas={paginas?.ok ? paginas.paginas : []}
            paginaActual={secretos.facebook_page_id}
            recienConectado={first("facebook") === "ok"}
          />
          <WebConnection
            url={secretos.web_webhook_url}
            conectado={Boolean(secretos.web_webhook_url && secretos.web_webhook_secret)}
            esOwner={cuenta.rol === "owner"}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Integraciones</h2>
          <SerperConnection estado={serper} />
          {/* Canva solo lo usa el estudio, que es del plan advance. */}
          {esAdvance(cuenta) ? <CanvaConnection estado={canva} recienConectado={first("canva") === "ok"} /> : null}
        </section>
      </div>
    </DashboardShell>
  )
}
