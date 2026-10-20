"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * Piezas comunes de las pestanas de Marca. Los textos de ayuda son genericos
 * a proposito: una marca nueva no tiene que leer los ejemplos de otra.
 */

export type Resultado = { ok: true } | { ok: false; error: string }

/** Un campo de texto con su tope a la vista. */
export function CampoTexto({
  id,
  label,
  ayuda,
  placeholder,
  valor,
  tope,
  filas = 3,
  prefijo,
  onChange,
}: {
  id: string
  label: string
  ayuda?: string
  placeholder?: string
  valor: string
  tope: number
  /** 1 = una linea. */
  filas?: number
  /** Lo que va pegado delante, como la @ del usuario. */
  prefijo?: string
  onChange: (valor: string) => void
}) {
  const cerca = valor.length > tope * 0.9
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className={`text-xs tabular-nums ${cerca ? "text-amber-600" : "text-muted-foreground"}`}>
          {valor.length} / {tope}
        </span>
      </div>
      {filas === 1 ? (
        <div className="flex items-center gap-1.5">
          {prefijo ? <span className="text-muted-foreground text-sm">{prefijo}</span> : null}
          <Input
            id={id}
            maxLength={tope}
            placeholder={placeholder}
            value={valor}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      ) : (
        <Textarea
          id={id}
          rows={filas}
          maxLength={tope}
          placeholder={placeholder}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {ayuda ? <p className="text-muted-foreground text-xs">{ayuda}</p> : null}
    </div>
  )
}

/** Opciones excluyentes como botones, igual que el resto de ajustes. */
export function Opciones<T extends string>({
  label,
  valor,
  opciones,
  onChange,
}: {
  label: string
  valor: T
  opciones: { valor: T; etiqueta: string }[]
  onChange: (valor: T) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange(o.valor)}
            aria-pressed={valor === o.valor}
            className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              valor === o.valor ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent border-input"
            }`}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Una lista de frases cortas: Enter anade, la equis quita. */
export function Chips({
  id,
  label,
  ayuda,
  placeholder,
  valores,
  tope,
  topeFrase,
  onChange,
}: {
  id: string
  label: string
  ayuda?: string
  placeholder?: string
  valores: string[]
  tope: number
  topeFrase: number
  onChange: (valores: string[]) => void
}) {
  const [borrador, setBorrador] = React.useState("")
  const lleno = valores.length >= tope

  const anadir = () => {
    const frase = borrador.trim().slice(0, topeFrase)
    if (!frase || lleno) return
    if (!valores.some((v) => v.toLocaleLowerCase("es") === frase.toLocaleLowerCase("es"))) onChange([...valores, frase])
    setBorrador("")
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {valores.length} / {tope}
        </span>
      </div>
      {valores.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {valores.map((v) => (
            <span key={v} className="bg-muted inline-flex items-center gap-1 rounded-md py-1 pr-1 pl-2 text-xs">
              {v}
              <button
                type="button"
                aria-label={`Quitar "${v}"`}
                onClick={() => onChange(valores.filter((x) => x !== v))}
                className="text-muted-foreground hover:text-foreground rounded p-0.5"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Input
        id={id}
        value={borrador}
        maxLength={topeFrase}
        disabled={lleno}
        placeholder={lleno ? `Caben hasta ${tope}.` : placeholder}
        onChange={(e) => setBorrador(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            anadir()
          }
        }}
        onBlur={anadir}
      />
      {ayuda ? <p className="text-muted-foreground text-xs">{ayuda}</p> : null}
    </div>
  )
}

/** El boton de guardar de una pestana, con su resultado al lado. */
export function BarraGuardar({
  texto,
  pending,
  dirty,
  resultado,
  onGuardar,
}: {
  texto: string
  pending: boolean
  dirty: boolean
  resultado: Resultado | null
  onGuardar: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t pt-4">
      <Button onClick={onGuardar} disabled={pending || !dirty}>
        {pending ? "Guardando…" : texto}
      </Button>
      {resultado?.ok && !dirty ? <span className="text-sm text-emerald-600">Guardado.</span> : null}
      {resultado && !resultado.ok ? <span className="text-destructive text-sm">{resultado.error}</span> : null}
    </div>
  )
}

/** Estado de un formulario de pestana: valores, si cambio y el guardado. */
export function useFormulario<T>(inicial: T, guardar: (valores: T) => Promise<Resultado>) {
  const [valores, setValores] = React.useState(inicial)
  const [base, setBase] = React.useState(inicial)
  const [resultado, setResultado] = React.useState<Resultado | null>(null)
  const [pending, startTransition] = React.useTransition()

  const set = <K extends keyof T>(clave: K, valor: T[K]) => {
    setResultado(null)
    setValores((v) => ({ ...v, [clave]: valor }))
  }

  const dirty = JSON.stringify(valores) !== JSON.stringify(base)

  const onGuardar = () => {
    setResultado(null)
    startTransition(async () => {
      const r = await guardar(valores)
      setResultado(r)
      if (r.ok) setBase(valores)
    })
  }

  return { valores, set, dirty, pending, resultado, onGuardar }
}
