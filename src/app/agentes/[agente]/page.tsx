import Link from "next/link"
import { notFound } from "next/navigation"

import { ActivoSwitch } from "@/components/agentes/activo-switch"
import { CronEditor } from "@/components/agentes/cron-editor"
import { ModeloEditor } from "@/components/agentes/modelo-editor"
import { PromptEditor } from "@/components/agentes/prompt-editor"
import { DashboardShell } from "@/components/dashboard-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { modeloDe } from "@/engine/agents/modelos"
import { PromptFinal } from "@/components/agentes/prompt-final"
import { PROMPT_DE_FABRICA, promptDe, tienePrompt, type AgenteConPrompt } from "@/engine/agents/prompts"
import { agenteReal, ajustesDe, type Agente } from "@/engine/agents/settings"
import { proximasPasadas } from "@/engine/agents/turno"
import { REDES, NOMBRE_DE_RED } from "@/engine/content/types"
import { getSettings } from "@/engine/schedule"
import { idDeCuentaActual } from "@/lib/accounts"
import { TaxonomyEditor } from "@/components/agentes/taxonomy-editor"
import { getTaxonomy } from "@/lib/engine-data"
import { AGENTES, fichaDe } from "@/lib/agentes-catalogo"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export function generateStaticParams() {
  return AGENTES.map((a) => ({ agente: a.clave }))
}

/**
 * La ficha de un agente: que hace, cuando corre y con que.
 *
 * Todo lo suyo en una pantalla. Antes el prompt vivia en el codigo, el modelo en
 * un bloque que listaba los cuatro pasos juntos y el horario en otro sitio
 * distinto, asi que afinar un agente obligaba a recorrer tres pantallas y a
 * elegir el modelo sin el prompt delante.
 */
export default async function AgentePage({
  params,
}: {
  params: Promise<{ agente: string }>
}) {
  const { agente } = await params
  const ficha = fichaDe(agente)
  if (!ficha) notFound()

  const accountId = await idDeCuentaActual()
  const ajustesCuenta = await getSettings(accountId)
  const ahora = new Date()

  // Facebook comparte fila con Instagram: lee de la de Instagram y no deja
  // escribir, que es lo que de verdad significa "sale del mismo guion".
  const real = agenteReal((ficha.espejoDe ?? ficha.clave) as Agente)
  const espejo = Boolean(ficha.espejoDe)

  const propios = await ajustesDe(accountId, real)

  const canales = ficha.porCanal ? [...REDES] : [""]
  const porCanal = await Promise.all(
    canales.map(async (canal) => ({
      canal,
      ajustes: canal === "" ? propios : await ajustesDe(accountId, real, canal),
    }))
  )

  const conPrompt = tienePrompt(real)
  const promptActual = conPrompt
    ? (propios.prompt?.trim() || PROMPT_DE_FABRICA[real as AgenteConPrompt])
    : null
  const modelo = conPrompt ? await modeloDe(accountId, real as AgenteConPrompt) : null
  const promptFinal = conPrompt ? await promptDe(accountId, real as AgenteConPrompt) : null

  return (
    <DashboardShell title={ficha.nombre}>
      <div className="flex max-w-3xl flex-col gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{ficha.nombre}</CardTitle>
              {ficha.usaIA ? <Badge variant="secondary">Usa IA</Badge> : null}
              {espejo ? <Badge variant="outline">Comparte con {ficha.espejoDe}</Badge> : null}
              <div className="ml-auto">
                <ActivoSwitch clave={ficha.clave} activo={propios.enabled} soloLectura={espejo} />
              </div>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">{ficha.resumen}</p>
          </CardHeader>
          {ficha.etapa ? (
            <CardContent className="pt-0">
              <p className="text-muted-foreground text-xs">
                En el estudio es la etapa <strong>{ficha.etapa}</strong>.
              </p>
            </CardContent>
          ) : null}
        </Card>

        {conPrompt && promptActual ? (
          <PromptEditor
            clave={ficha.clave}
            prompt={promptActual}
            editado={Boolean(propios.prompt)}
            soloLectura={espejo}
            nota={
              espejo
                ? "Es el mismo guion que escribe Instagram: de ahi sale la pieza de Facebook sin gastar una segunda generacion."
                : undefined
            }
          />
        ) : null}

        {promptFinal ? <PromptFinal prompt={promptFinal} /> : null}

        {conPrompt && modelo ? (
          <ModeloEditor clave={ficha.clave} modelo={modelo} soloLectura={espejo} />
        ) : null}

        {porCanal.map(({ canal, ajustes }) => (
          <CronEditor
            key={canal || "unico"}
            clave={ficha.clave}
            canal={canal}
            titulo={canal ? `Cron · ${NOMBRE_DE_RED[canal as keyof typeof NOMBRE_DE_RED]}` : "Cron"}
            modos={ficha.modos}
            modo={ajustes.mode}
            horas={ajustes.run_at}
            tanda={ajustes.batch_size ?? 1}
            porCanal={ficha.porCanal === true}
            proximas={proximasPasadas(ajustes, ajustesCuenta.timezone, ahora)}
            soloLectura={espejo}
          />
        ))}

        {/* La taxonomia es el insumo de la extraccion: define que busca. Vivia
            en una seccion propia, lejos del agente que la usa, asi que cambiar
            un tema y ver que trae obligaba a ir y volver. */}
        {ficha.clave === "extraccion" ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Taxonomia</h2>
            <p className="text-muted-foreground text-sm">
              Lo que sale a buscar: una consulta por segmento, agrupadas en categorias.
            </p>
            <TaxonomyEditor taxonomy={await getTaxonomy(accountId)} />
          </section>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conexiones</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Lo que necesita para funcionar. No se configura aqui.
            </p>
          </CardHeader>
          <CardContent>
            {ficha.conexiones.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Ninguna: trabaja con lo que ya esta en la base.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {ficha.conexiones.map((c) => (
                  <Link
                    key={c.nombre}
                    href={c.href}
                    className="hover:bg-accent rounded-md border px-2.5 py-1.5 text-xs transition-colors"
                  >
                    {c.nombre}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
