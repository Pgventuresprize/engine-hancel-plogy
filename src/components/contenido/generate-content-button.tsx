"use client"

import * as React from "react"

import { encolarContenido, type ActionResult } from "@/app/estudio/actions"
import { Button } from "@/components/ui/button"
import { Loader2Icon, PenLineIcon } from "lucide-react"

/**
 * Manda una noticia a la cola de generación de contenido.
 *
 * Disponible en cualquier noticia, en cualquier modo y sin importar el umbral:
 * es una accion del usuario, no de la seleccion automatica. Por eso vive tanto
 * en la lista de candidatas como en el estudio.
 *
 * No espera a que el agente trabaje, solo a que el trabajo quede encolado: el
 * angulo aparece despues, cuando el agente responde y el tick lo materializa.
 */
export function GenerateContentButton({
  rawNewsId,
  size = "sm",
  variant = "outline",
}: {
  rawNewsId: string
  size?: "sm" | "default"
  variant?: "outline" | "secondary"
}) {
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size={size}
        variant={variant}
        disabled={pending || result?.ok === true}
        onClick={() => {
          setResult(null)
          startTransition(async () => setResult(await encolarContenido(rawNewsId)))
        }}
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />}
        {pending ? "Enviando…" : result?.ok ? "En cola" : "Generar contenido"}
      </Button>

      <span role="status" aria-live="polite" className="min-w-0 text-xs">
        {result && !result.ok ? (
          <span className="text-destructive">{result.error}</span>
        ) : result?.ok && result.warning ? (
          // Encolado si, procesado no: mejor decirlo que dejarlo esperando.
          <span className="text-warning">{result.warning}</span>
        ) : null}
      </span>
    </div>
  )
}
