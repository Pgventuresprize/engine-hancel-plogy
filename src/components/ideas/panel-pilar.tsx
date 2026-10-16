"use client"

import * as React from "react"
import { SparklesIcon, Trash2Icon } from "lucide-react"

import { generarIdeas, limpiarDisponibles } from "@/app/ideas/actions"
import type { Cartucho, PilarConIdeas } from "@/lib/ideas-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Los cartuchos de un pilar, y el boton que genera una ronda.
 *
 * Una ronda es una idea por cada combinacion de capas del pilar. Generar puede
 * tardar: recorre todas las combinaciones y las escribe de una en varias
 * llamadas, asi que el boton se queda a la espera y avisa cuando termina.
 */
export function PanelPilar({ pilar }: { pilar: PilarConIdeas }) {
  const [pending, startTransition] = React.useTransition()
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)
  // null = todas. Una intencion y una narracion a la vez, o todas.
  const [intencion, setIntencion] = React.useState<string | null>(null)
  const [narrativa, setNarrativa] = React.useState<string | null>(null)

  const cumple = (c: Cartucho, i: string | null, n: string | null) =>
    (i === null || c.intencion === i) && (n === null || c.narrativa === n)
  const visibles = pilar.disponibles.filter((c) => cumple(c, intencion, narrativa))
  // Las opciones salen de las ideas del pilar, con cuantas hay de cada una
  // segun el otro filtro: asi se ve antes de pulsar que combinaciones existen.
  const opciones = (campo: "intencion" | "narrativa") => {
    const cuenta = new Map<string, number>()
    for (const c of pilar.disponibles) {
      const valor = c[campo]
      if (!valor) continue
      const pasa = campo === "intencion" ? cumple(c, null, narrativa) : cumple(c, intencion, null)
      cuenta.set(valor, (cuenta.get(valor) ?? 0) + (pasa ? 1 : 0))
    }
    return [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"))
  }

  const generar = () => {
    setAviso(null)
    startTransition(async () => {
      try {
        const r = await generarIdeas(pilar.id)
        setAviso(
          r.ok
            ? { ok: true, texto: `Ronda ${r.ronda}: ${r.generadas} ideas nuevas.` }
            : { ok: false, texto: r.error }
        )
      } catch {
        setAviso({ ok: false, texto: "No respondio. Puede haber tardado de mas." })
      }
    })
  }

  const limpiar = () => {
    setAviso(null)
    startTransition(async () => {
      const r = await limpiarDisponibles(pilar.id)
      if (!r.ok) setAviso({ ok: false, texto: r.error })
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">{pilar.name}</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            {pilar.disponibles.length} disponibles · {pilar.totalUsados} usadas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pilar.disponibles.length > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              onClick={limpiar}
              title="Borrar los cartuchos disponibles"
              aria-label="Borrar disponibles"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2Icon className="size-4" />
            </Button>
          ) : null}
          <Button disabled={pending} onClick={generar}>
            <SparklesIcon className="size-4" />
            {pending ? "Generando…" : "Generar ronda"}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {aviso ? (
          <p className={`mb-3 text-sm ${aviso.ok ? "text-emerald-600" : "text-destructive"}`}>
            {aviso.texto}
          </p>
        ) : null}

        {pilar.disponibles.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
            Sin cartuchos. Pulsa Generar ronda para que el agente proponga una idea por cada
            combinacion de este pilar.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <Filtro titulo="Intención" valor={intencion} opciones={opciones("intencion")} onCambio={setIntencion} />
              <Filtro titulo="Narración" valor={narrativa} opciones={opciones("narrativa")} onCambio={setNarrativa} />
              <p className="text-muted-foreground text-xs">
                Mostrando {visibles.length} de {pilar.disponibles.length}
                {intencion !== null || narrativa !== null ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="hover:text-foreground underline underline-offset-2"
                      onClick={() => {
                        setIntencion(null)
                        setNarrativa(null)
                      }}
                    >
                      quitar filtros
                    </button>
                  </>
                ) : null}
              </p>
            </div>
            {visibles.length === 0 ? (
              <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
                No hay ideas con esa combinación de intención y narración.
              </p>
            ) : null}
            {visibles.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{c.idea}</p>
                {c.notes ? <p className="text-muted-foreground mt-1 text-sm">{c.notes}</p> : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.tema ? <Badge variant="outline">{c.tema}</Badge> : null}
                  {c.subtema ? <Badge variant="outline">{c.subtema}</Badge> : null}
                  {c.intencion ? <Badge variant="secondary">{c.intencion}</Badge> : null}
                  {c.narrativa ? <Badge variant="secondary">{c.narrativa}</Badge> : null}
                  <Badge variant="outline" className="text-muted-foreground">
                    ronda {c.round}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Una fila de filtro: "Todas" o una sola opcion, con cuantas ideas tiene cada una. */
function Filtro({
  titulo,
  valor,
  opciones,
  onCambio,
}: {
  titulo: string
  valor: string | null
  opciones: [string, number][]
  onCambio: (v: string | null) => void
}) {
  const chip = (activo: boolean, vacio = false) =>
    `rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
      activo
        ? "border-primary bg-primary text-primary-foreground"
        : vacio
          ? "border-dashed text-muted-foreground/60 hover:bg-accent"
          : "border-input text-muted-foreground hover:bg-accent"
    }`
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-xs font-medium">{titulo}</span>
      <button type="button" className={chip(valor === null)} onClick={() => onCambio(null)} aria-pressed={valor === null}>
        Todas
      </button>
      {opciones.map(([nombre, n]) => (
        <button
          key={nombre}
          type="button"
          className={chip(valor === nombre, n === 0)}
          onClick={() => onCambio(valor === nombre ? null : nombre)}
          aria-pressed={valor === nombre}
        >
          {nombre} <span className="tabular-nums opacity-70">{n}</span>
        </button>
      ))}
    </div>
  )
}
