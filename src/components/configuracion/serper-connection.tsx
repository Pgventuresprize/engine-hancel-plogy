"use client"

import * as React from "react"

import { guardarClaveSerper, type EstadoSerper } from "@/app/cuenta/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * La clave que paga las busquedas de noticias.
 *
 * Se escribe, no se lee: lo que vuelve del servidor es una vista enmascarada,
 * porque devolverla entera la filtraria a cualquiera que abra el panel.
 */
export function SerperConnection({ estado }: { estado: EstadoSerper }) {
  const [clave, setClave] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<{ ok: boolean; error?: string } | null>(null)

  const guardar = () => {
    setResult(null)
    startTransition(async () => {
      const r = await guardarClaveSerper(clave)
      setResult(r)
      if (r.ok) setClave("")
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Serper</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          {estado.soloEnEntorno ? (
            <>
              Ahora mismo se usa la del entorno. Si pegas una aqui, manda esta y podras
              cambiarla sin volver a desplegar.
            </>
          ) : estado.configurado ? (
            <>
              Conectado con <code className="text-xs">{estado.vistaPrevia}</code>. Pega otra
              para reemplazarla, o deja el campo vacio y guarda para quitarla.
            </>
          ) : (
            <>
              Sin clave: la extraccion no puede traer noticias. Sacala del panel de Serper y
              pegala aqui.
            </>
          )}
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid gap-1.5">
          <Label htmlFor="serper">Clave de API</Label>
          <Input
            id="serper"
            type="password"
            autoComplete="off"
            placeholder={estado.configurado ? "dejar vacio para no cambiarla" : "pega la clave"}
            value={clave}
            onChange={(event) => {
              setResult(null)
              setClave(event.target.value)
            }}
            className="font-mono"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={guardar} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          {result?.ok ? <span className="text-sm text-emerald-600">Clave guardada.</span> : null}
          {result && !result.ok ? (
            <span className="text-destructive text-sm">{result.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
