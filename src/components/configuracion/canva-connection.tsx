"use client"

import * as React from "react"

import { conectarCanva } from "@/app/configuracion/actions"
import type { EstadoCanva } from "@/engine/studio/canva-conexion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Canva, el generador de imagenes del estudio nuevo.
 *
 * Solo hay que iniciar sesion: el boton pide a Composio un enlace, se entra a
 * Canva y se vuelve aqui. No hay ningun id que copiar.
 */
export function CanvaConnection({ estado, recienConectado }: { estado: EstadoCanva; recienConectado?: boolean }) {
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const conectar = () => {
    setError(null)
    startTransition(async () => {
      const r = await conectarCanva()
      if (r.ok) window.location.href = r.url
      else setError(r.error)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Canva</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          {estado.conectado
            ? "Conectado. El agente de contenido dibuja las piezas en Canva con tus estilos gráficos."
            : "Sin conectar. Inicia sesion en Canva para que el agente de contenido pueda dibujar las piezas."}
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button onClick={conectar} disabled={pending} variant={estado.conectado ? "outline" : "default"}>
          {pending ? "Abriendo Canva…" : estado.conectado ? "Reconectar" : "Conectar Canva"}
        </Button>
        {recienConectado && estado.conectado ? (
          <span className="text-sm text-success">Canva quedo conectado.</span>
        ) : null}
        {recienConectado && !estado.conectado ? (
          <span className="text-destructive text-sm">
            No se completo la conexion. Vuelve a intentarlo.
          </span>
        ) : null}
        {error ? <span className="text-destructive text-sm">{error}</span> : null}
      </CardContent>
    </Card>
  )
}
