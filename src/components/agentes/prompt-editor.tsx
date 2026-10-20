"use client"

import * as React from "react"

import { guardarPrompt, type ActionResult } from "@/app/agentes/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

/**
 * El oficio del agente: como hace su trabajo. Es la parte editable del prompt;
 * la marca y el formato de respuesta se le añaden solos y se ven completos en
 * "Ver prompt final".
 *
 * Se enseña siempre el que se va a usar de verdad, venga de la base o del
 * codigo: un editor vacio con el prompt real escondido en el repositorio es la
 * mejor forma de que nadie sepa por que el agente contesta lo que contesta.
 *
 * Mientras no se toque, la fila no existe y las mejoras que lleguen en un
 * despliegue se aplican solas. En cuanto se edita, manda lo escrito y deja de
 * recibirlas; por eso se dice en pantalla y se puede volver a fabrica.
 */
export function PromptEditor({
  clave,
  prompt,
  editado,
  soloLectura = false,
  nota,
}: {
  clave: string
  /** El que se usa ahora: el editado si lo hay, si no el de fabrica. */
  prompt: string
  editado: boolean
  soloLectura?: boolean
  nota?: string
}) {
  const [texto, setTexto] = React.useState(prompt)
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const dirty = texto !== prompt

  const guardar = (valor: string) => {
    setResult(null)
    startTransition(async () => {
      const r = await guardarPrompt(clave, valor)
      setResult(r)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Oficio</CardTitle>
          {editado ? (
            <Badge variant="outline">Editado</Badge>
          ) : (
            <Badge variant="secondary">De fabrica</Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {nota ??
            (editado
              ? "Escrito por ti. Las mejoras que vengan en un despliegue ya no le llegan: manda lo que hay aqui."
              : "El que trae el motor. Si lo editas deja de actualizarse solo y pasa a mandar tu version.")}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Es cómo hace su trabajo. Tu marca y el formato de respuesta se le añaden solos.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <Textarea
          rows={18}
          value={texto}
          readOnly={soloLectura}
          onChange={(e) => {
            setResult(null)
            setTexto(e.target.value)
          }}
          className="font-mono text-xs leading-relaxed"
        />

        {soloLectura ? (
          <p className="text-muted-foreground text-xs">
            Se edita en el agente del que sale. Aqui solo se consulta.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => guardar(texto)} disabled={pending || !dirty}>
              {pending ? "Guardando…" : "Guardar prompt"}
            </Button>
            {editado ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  // Vacio significa volver a fabrica, no dejarlo sin
                  // instrucciones: el servidor lo interpreta asi.
                  setTexto("")
                  guardar("")
                }}
              >
                Volver al de fabrica
              </Button>
            ) : null}
            {result?.ok ? <span className="text-sm text-emerald-600">Guardado.</span> : null}
            {result && !result.ok ? (
              <span className="text-destructive text-sm">{result.error}</span>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
