"use client"

import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { borrarFila, guardarFila, moverFila } from "@/app/capas/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Fila = { id: string; name: string; description: string | null; pregunta?: string | null }
type Tabla = "content_pillars" | "content_audiences" | "content_verticals"

/**
 * Una lista de la identidad editorial: pilares, audiencias o verticales.
 *
 * Como el resto de capas, cada fila se guarda al salir del campo y lo nuevo
 * tiene boton. Se anade el orden, porque aqui importa: el primero es el
 * principal.
 */
export function EditorLista({
  tabla,
  filas,
  titulo,
  descripcion,
  ejemploNombre,
  ejemploDescripcion,
  conPregunta = false,
  avisoAlBorrar,
}: {
  tabla: Tabla
  filas: Fila[]
  titulo: string
  descripcion: string
  ejemploNombre: string
  ejemploDescripcion: string
  /** Pilares: la pregunta guia que responde cada uno. */
  conPregunta?: boolean
  /** Si borrar se lleva algo mas por delante, se pide confirmacion. */
  avisoAlBorrar?: string
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const correr = (accion: () => Promise<{ ok: true } | { ok: false; error: string }>, alTerminar?: () => void) => {
    setError(null)
    startTransition(async () => {
      const r = await accion()
      if (!r.ok) setError(r.error)
      else alTerminar?.()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">{descripcion}</p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {filas.map((f, i) => (
          <FilaEditable
            key={f.id}
            fila={f}
            conPregunta={conPregunta}
            disabled={pending}
            primera={i === 0}
            ultima={i === filas.length - 1}
            onGuardar={(campos) => correr(() => guardarFila(tabla, { id: f.id, ...campos }))}
            onMover={(dir) => correr(() => moverFila(tabla, f.id, dir))}
            onBorrar={() => {
              if (avisoAlBorrar && !window.confirm(`${avisoAlBorrar}\n\n¿Borrar "${f.name}"?`)) return
              correr(() => borrarFila(tabla, f.id))
            }}
          />
        ))}
      </div>

      <NuevaFila
        conPregunta={conPregunta}
        disabled={pending}
        ejemploNombre={ejemploNombre}
        ejemploDescripcion={ejemploDescripcion}
        onCrear={(campos, limpiar) => correr(() => guardarFila(tabla, campos), limpiar)}
      />
    </div>
  )
}

type Campos = { name: string; description: string | null; pregunta?: string | null }

function FilaEditable({
  fila,
  conPregunta,
  disabled,
  primera,
  ultima,
  onGuardar,
  onMover,
  onBorrar,
}: {
  fila: Fila
  conPregunta: boolean
  disabled: boolean
  primera: boolean
  ultima: boolean
  onGuardar: (campos: Campos) => void
  onMover: (direccion: "arriba" | "abajo") => void
  onBorrar: () => void
}) {
  const [name, setName] = React.useState(fila.name)
  const [desc, setDesc] = React.useState(fila.description ?? "")
  const [pregunta, setPregunta] = React.useState(fila.pregunta ?? "")

  const guardarSiCambio = () => {
    const igual =
      name.trim() === fila.name &&
      desc.trim() === (fila.description ?? "") &&
      (!conPregunta || pregunta.trim() === (fila.pregunta ?? ""))
    if (igual || !name.trim()) return
    onGuardar({
      name: name.trim(),
      description: desc.trim() || null,
      ...(conPregunta ? { pregunta: pregunta.trim() || null } : {}),
    })
  }

  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-3">
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled || primera}
            onClick={() => onMover("arriba")}
            aria-label="Subir"
          >
            <ArrowUpIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled || ultima}
            onClick={() => onMover("abajo")}
            aria-label="Bajar"
          >
            <ArrowDownIcon className="size-4" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Input
            value={name}
            disabled={disabled}
            onChange={(e) => setName(e.target.value)}
            onBlur={guardarSiCambio}
            className="font-medium"
          />
          {conPregunta ? (
            <Input
              value={pregunta}
              disabled={disabled}
              maxLength={160}
              placeholder="La pregunta que responde: ¿Qué creemos?"
              onChange={(e) => setPregunta(e.target.value)}
              onBlur={guardarSiCambio}
              className="text-sm"
            />
          ) : null}
          <Textarea
            value={desc}
            disabled={disabled}
            rows={2}
            placeholder="Cómo lo entiende el agente…"
            onChange={(e) => setDesc(e.target.value)}
            onBlur={guardarSiCambio}
            className="text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onBorrar}
          aria-label="Borrar"
          className="text-muted-foreground hover:text-destructive shrink-0"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

function NuevaFila({
  conPregunta,
  disabled,
  ejemploNombre,
  ejemploDescripcion,
  onCrear,
}: {
  conPregunta: boolean
  disabled: boolean
  ejemploNombre: string
  ejemploDescripcion: string
  onCrear: (campos: Campos, limpiar: () => void) => void
}) {
  const [name, setName] = React.useState("")
  const [desc, setDesc] = React.useState("")
  const [pregunta, setPregunta] = React.useState("")

  const crear = () => {
    if (!name.trim()) return
    onCrear(
      {
        name: name.trim(),
        description: desc.trim() || null,
        ...(conPregunta ? { pregunta: pregunta.trim() || null } : {}),
      },
      () => {
        setName("")
        setDesc("")
        setPregunta("")
      }
    )
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 py-3">
        <div className="flex flex-1 flex-col gap-2">
          <Input value={name} disabled={disabled} placeholder={ejemploNombre} onChange={(e) => setName(e.target.value)} />
          {conPregunta ? (
            <Input
              value={pregunta}
              disabled={disabled}
              maxLength={160}
              placeholder="La pregunta que responde"
              onChange={(e) => setPregunta(e.target.value)}
            />
          ) : null}
          <Textarea
            value={desc}
            disabled={disabled}
            rows={2}
            placeholder={ejemploDescripcion}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <Button size="icon" disabled={disabled || !name.trim()} onClick={crear} aria-label="Añadir" className="shrink-0">
          <PlusIcon className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
