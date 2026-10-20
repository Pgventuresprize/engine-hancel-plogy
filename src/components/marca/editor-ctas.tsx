"use client"

import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { borrarFila, guardarFila, moverFila, type CamposExtra } from "@/app/capas/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ctasUsables, TIPOS_CTA, type Cta, type TipoCta } from "@/engine/marca/editorial-modelo"

const NOMBRE_TIPO: Record<TipoCta, string> = {
  seguir: "Seguir",
  comentar: "Comentar",
  palabra: "Palabra clave",
  dm: "Escribir por DM",
  comercial: "Comercial",
}

/**
 * Las llamadas a la accion de la marca. El agente elige una por pieza, y solo
 * entre las que puede cumplir: activas y, si prometen un recurso, con el
 * recurso listo.
 */
export function EditorCtas({ ctas }: { ctas: Cta[] }) {
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const usables = ctasUsables(ctas).length

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
        <h3 className="text-sm font-semibold">Llamadas a la acción</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Lo que la pieza pide al final, siempre una sola acción. La descripción es lo que el agente lee para saber
          cuándo usarla y con qué motivo.{" "}
          {ctas.length > 0 ? `${usables} de ${ctas.length} disponibles para el agente.` : null}
        </p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {ctas.map((c, i) => (
          <TarjetaCta
            key={c.id}
            cta={c}
            disabled={pending}
            primera={i === 0}
            ultima={i === ctas.length - 1}
            onGuardar={(campos) => correr(() => guardarFila("content_ctas", { id: c.id, ...campos }))}
            onMover={(dir) => correr(() => moverFila("content_ctas", c.id, dir))}
            onBorrar={() => correr(() => borrarFila("content_ctas", c.id))}
          />
        ))}
      </div>

      <NuevoCta disabled={pending} onCrear={(campos, limpiar) => correr(() => guardarFila("content_ctas", campos), limpiar)} />
    </div>
  )
}

type Campos = { name: string; description: string | null } & Required<Omit<CamposExtra, "pregunta">>

function camposDe(c: Cta): Campos {
  return {
    name: c.name,
    description: c.description,
    tipo: c.tipo,
    requiere_recurso: c.requiere_recurso,
    recurso_listo: c.recurso_listo,
    activo: c.activo,
  }
}

function TarjetaCta({
  cta,
  disabled,
  primera,
  ultima,
  onGuardar,
  onMover,
  onBorrar,
}: {
  cta: Cta
  disabled: boolean
  primera: boolean
  ultima: boolean
  onGuardar: (campos: Campos) => void
  onMover: (direccion: "arriba" | "abajo") => void
  onBorrar: () => void
}) {
  const [v, setV] = React.useState(camposDe(cta))

  // Los textos se guardan al salir del campo; tipo e interruptores, al cambiar.
  const guardar = (siguiente: Campos) => {
    if (!siguiente.name.trim()) return
    if (JSON.stringify(siguiente) === JSON.stringify(camposDe(cta))) return
    onGuardar({ ...siguiente, name: siguiente.name.trim(), description: siguiente.description?.trim() || null })
  }
  const cambiar = (parcial: Partial<Campos>) => {
    const siguiente = { ...v, ...parcial }
    setV(siguiente)
    guardar(siguiente)
  }

  const pendiente = v.requiere_recurso && !v.recurso_listo

  return (
    <Card className={v.activo ? undefined : "opacity-60"}>
      <CardContent className="flex items-start gap-3 py-3">
        <div className="flex shrink-0 flex-col gap-1">
          <Button variant="ghost" size="icon-sm" disabled={disabled || primera} onClick={() => onMover("arriba")} aria-label="Subir">
            <ArrowUpIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={disabled || ultima} onClick={() => onMover("abajo")} aria-label="Bajar">
            <ArrowDownIcon className="size-4" />
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={v.name}
              disabled={disabled}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              onBlur={() => guardar(v)}
              className="min-w-48 flex-1 font-medium"
            />
            {pendiente ? <Badge variant="outline">El agente no lo usará: recurso pendiente</Badge> : null}
            {!v.activo ? <Badge variant="outline">Inactivo</Badge> : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TIPOS_CTA.map((t) => (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => cambiar({ tipo: t })}
                aria-pressed={v.tipo === t}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  v.tipo === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent border-input"
                }`}
              >
                {NOMBRE_TIPO[t]}
              </button>
            ))}
          </div>

          <Textarea
            value={v.description ?? ""}
            disabled={disabled}
            rows={2}
            placeholder="Cuándo usarlo y con qué motivo."
            onChange={(e) => setV({ ...v, description: e.target.value })}
            onBlur={() => guardar(v)}
            className="text-sm"
          />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
            <Interruptor
              id={`recurso-${cta.id}`}
              label="Promete un recurso"
              checked={v.requiere_recurso}
              disabled={disabled}
              onChange={(x) => cambiar({ requiere_recurso: x, recurso_listo: x ? v.recurso_listo : false })}
            />
            {v.requiere_recurso ? (
              <Interruptor
                id={`listo-${cta.id}`}
                label="Recurso listo"
                checked={v.recurso_listo}
                disabled={disabled}
                onChange={(x) => cambiar({ recurso_listo: x })}
              />
            ) : null}
            <Interruptor
              id={`activo-${cta.id}`}
              label="Activo"
              checked={v.activo}
              disabled={disabled}
              onChange={(x) => cambiar({ activo: x })}
            />
          </div>
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

function Interruptor({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled: boolean
  onChange: (valor: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={(x) => onChange(Boolean(x))} />
      <Label htmlFor={id} className="text-xs font-normal">
        {label}
      </Label>
    </div>
  )
}

function NuevoCta({
  disabled,
  onCrear,
}: {
  disabled: boolean
  onCrear: (campos: { name: string; description: string | null; tipo: TipoCta }, limpiar: () => void) => void
}) {
  const [name, setName] = React.useState("")
  const [desc, setDesc] = React.useState("")
  const [tipo, setTipo] = React.useState<TipoCta>("seguir")

  const crear = () => {
    if (!name.trim()) return
    onCrear({ name: name.trim(), description: desc.trim() || null, tipo }, () => {
      setName("")
      setDesc("")
      setTipo("seguir")
    })
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 py-3">
        <div className="flex flex-1 flex-col gap-2">
          <Input value={name} disabled={disabled} placeholder="Sigue a la cuenta, Comenta GUÍA…" onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_CTA.map((t) => (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => setTipo(t)}
                aria-pressed={tipo === t}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  tipo === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent border-input"
                }`}
              >
                {NOMBRE_TIPO[t]}
              </button>
            ))}
          </div>
          <Textarea
            value={desc}
            disabled={disabled}
            rows={2}
            placeholder="Ej: cuando la pieza enseña algo útil; el motivo es seguir aprendiendo."
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
