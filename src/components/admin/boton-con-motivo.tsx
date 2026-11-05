"use client"

import * as React from "react"

import type { Resultado } from "@/app/admin/actions"
import { avisar } from "@/components/admin/avisos"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * Un boton que abre una confirmacion con lo que va a pasar y pide el motivo.
 * El motivo queda en la actividad, por eso no se puede confirmar sin escribirlo.
 */
export function BotonConMotivo({
  etiqueta,
  variante = "destructive",
  tamano = "sm",
  disabled,
  title,
  titulo,
  descripcion,
  efectos,
  confirmar,
  accion,
  children,
  puedeConfirmar = true,
}: {
  etiqueta: string
  variante?: "destructive" | "outline" | "brand"
  tamano?: "sm" | "default"
  disabled?: boolean
  title?: string
  titulo: string
  descripcion?: string
  efectos?: string[]
  confirmar: string
  accion: (motivo: string) => Promise<Resultado>
  children?: React.ReactNode
  puedeConfirmar?: boolean
}) {
  const [abierto, setAbierto] = React.useState(false)
  const [motivo, setMotivo] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pendiente, startTransition] = React.useTransition()

  const enviar = () =>
    startTransition(async () => {
      setError(null)
      const r = await accion(motivo)
      if (r.ok) {
        setAbierto(false)
        setMotivo("")
        avisar(true, r.aviso)
      } else setError(r.error)
    })

  return (
    <>
      <Button type="button" variant={variante} size={tamano} disabled={disabled} title={title} onClick={() => setAbierto(true)}>
        {etiqueta}
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !pendiente && setAbierto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {descripcion ? <DialogDescription>{descripcion}</DialogDescription> : null}
          </DialogHeader>
          {children}
          {efectos?.length ? (
            <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-sm">
              {efectos.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo-admin">Motivo</Label>
            <Textarea id="motivo-admin" rows={2} value={motivo} disabled={pendiente} placeholder="Queda en la actividad" onChange={(e) => setMotivo(e.target.value)} />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pendiente} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="button" variant={variante === "outline" ? "brand" : variante} disabled={pendiente || motivo.trim().length < 3 || !puedeConfirmar} onClick={enviar}>
              {pendiente ? "Guardando…" : confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Corre una accion sin confirmacion y avisa como termino. */
export function useAccion() {
  const [pendiente, startTransition] = React.useTransition()
  const correr = (fn: () => Promise<Resultado>, despues?: () => void) =>
    startTransition(async () => {
      const r = await fn()
      avisar(r.ok, r.ok ? r.aviso : r.error)
      if (r.ok) despues?.()
    })
  return { pendiente, correr }
}
