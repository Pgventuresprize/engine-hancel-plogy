"use client"

import * as React from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Completitud, Pendiente } from "@/lib/marca-data"

export const PESTANAS = [
  { valor: "identidad", etiqueta: "Identidad" },
  { valor: "voz", etiqueta: "Voz" },
  { valor: "editorial", etiqueta: "Editorial" },
  { valor: "cta", etiqueta: "CTA" },
  { valor: "visual", etiqueta: "Visual" },
] as const
export type Pestana = (typeof PESTANAS)[number]["valor"]

/**
 * Las cinco pestanas de Marca, con el indicador de lo que falta encima.
 *
 * La pestana abierta va en la URL (?tab=voz) para que recargar, o volver de
 * otra pantalla, no devuelva a la primera.
 */
export function MarcaTabs({
  inicial,
  completitud,
  paneles,
}: {
  inicial: Pestana
  completitud: Completitud
  paneles: Record<Pestana, React.ReactNode>
}) {
  const [pestana, setPestana] = React.useState<Pestana>(inicial)

  const abrir = (valor: Pestana) => {
    setPestana(valor)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", valor)
    window.history.replaceState(null, "", url)
  }

  return (
    <div className="flex flex-col gap-5">
      <Indicador completitud={completitud} onAbrir={abrir} />
      <Tabs value={pestana} onValueChange={(v) => abrir(v as Pestana)} className="flex flex-col gap-5">
        <TabsList className="h-auto flex-wrap">
          {PESTANAS.map((p) => (
            <TabsTrigger key={p.valor} value={p.valor}>
              {p.etiqueta}
            </TabsTrigger>
          ))}
        </TabsList>
        {PESTANAS.map((p) => (
          <TabsContent key={p.valor} value={p.valor}>
            {paneles[p.valor]}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function Indicador({ completitud, onAbrir }: { completitud: Completitud; onAbrir: (p: Pestana) => void }) {
  const { listos, total, faltan } = completitud
  const porcentaje = Math.round((listos / total) * 100)
  const [abierto, setAbierto] = React.useState(false)
  const visibles = abierto ? faltan : faltan.slice(0, 4)

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {listos === total ? "Marca completa" : "Tu marca"}
        </span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {listos} de {total} listo
        </span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100}>
        <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${porcentaje}%` }} />
      </div>
      {faltan.length > 0 ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Falta:{" "}
          {visibles.map((p: Pendiente, i) => (
            <React.Fragment key={p.campo}>
              {i > 0 ? " · " : null}
              <button type="button" onClick={() => onAbrir(p.pestana)} className="hover:text-foreground underline-offset-2 hover:underline">
                {p.campo}
              </button>
            </React.Fragment>
          ))}
          {faltan.length > 4 ? (
            <>
              {" "}
              <button type="button" onClick={() => setAbierto(!abierto)} className="text-foreground underline-offset-2 hover:underline">
                {abierto ? "ver menos" : `y ${faltan.length - 4} más`}
              </button>
            </>
          ) : null}
          . Lo vacío se llena con valores generales.
        </p>
      ) : null}
    </div>
  )
}
