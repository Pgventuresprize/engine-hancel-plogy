"use client"

import * as React from "react"

import { guardarModelo, type ActionResult } from "@/app/agentes/actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MODELOS_DISPONIBLES } from "@/lib/modelos-ia"

/**
 * Con que modelo corre este agente.
 *
 * Estaba en un bloque aparte que listaba los cuatro pasos juntos, lo que
 * obligaba a cambiar de pantalla para tocar algo que pertenece al agente y a
 * elegir a ciegas, sin el prompt delante. Aqui se ve junto a lo que el modelo
 * va a tener que hacer.
 */
export function ModeloEditor({
  clave,
  modelo,
  soloLectura = false,
}: {
  clave: string
  modelo: string
  soloLectura?: boolean
}) {
  const [elegido, setElegido] = React.useState(modelo)
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const cambiar = (id: string) => {
    if (soloLectura) return
    setResult(null)
    setElegido(id)
    startTransition(async () => setResult(await guardarModelo(clave, id)))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Modelo</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Un paso mecanico corre bien con el modelo mas barato; uno donde se decide el criterio
          agradece el mas capaz.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {MODELOS_DISPONIBLES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={soloLectura || pending}
              onClick={() => cambiar(m.id)}
              aria-pressed={elegido === m.id}
              className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-60 ${
                elegido === m.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent border-input"
              }`}
            >
              {m.nombre}
            </button>
          ))}
        </div>

        {soloLectura ? (
          <p className="text-muted-foreground text-xs">
            Se elige en el agente del que sale. Aqui solo se consulta.
          </p>
        ) : null}
        {result?.ok ? <span className="text-sm text-success">Guardado.</span> : null}
        {result && !result.ok ? (
          <span className="text-destructive text-sm">{result.error}</span>
        ) : null}
      </CardContent>
    </Card>
  )
}
