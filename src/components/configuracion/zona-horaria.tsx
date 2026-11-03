"use client"

import * as React from "react"

import { updateTimezone, type ActionResult } from "@/app/configuracion/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * En que huso piensa la cuenta.
 *
 * Es de la cuenta y no de ningun agente: cuando el agente de extraccion dice
 * "a las 11" y el de publicacion dice "a las 18", los dos hablan de esta hora.
 * Tenerlo por agente permitiria configurarlos en husos distintos, que no es una
 * libertad que nadie quiera y si una forma nueva de equivocarse.
 */
export function ZonaHoraria({ timezone, horaActual }: { timezone: string; horaActual: number }) {
  const [valor, setValor] = React.useState(timezone)
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const guardar = () => {
    setResult(null)
    startTransition(async () => setResult(await updateTimezone(valor)))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Zona horaria</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Todas las horas de los agentes son de aqui. Ahora mismo son las{" "}
          <strong>{String(horaActual).padStart(2, "0")}:00</strong> en {timezone}.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid gap-1.5">
          <Label htmlFor="timezone">Identificador IANA</Label>
          <Input
            id="timezone"
            className="max-w-xs font-mono"
            placeholder="America/Bogota"
            value={valor}
            onChange={(e) => {
              setResult(null)
              setValor(e.target.value)
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={guardar} disabled={pending || valor === timezone}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          {result?.ok ? <span className="text-sm text-success">Guardado.</span> : null}
          {result && !result.ok ? (
            <span className="text-destructive text-sm">{result.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
