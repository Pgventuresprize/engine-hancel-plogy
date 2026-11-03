"use client"

import * as React from "react"

import { guardarModoDiseno, leerModoDiseno, type ModoDisenoDeCuenta } from "@/app/marca/actions"
import { MODOS_DISENO, type ModoDiseno } from "@/engine/render/theme"

/** Como se presenta cada modo; el orden es el de MODOS_DISENO. */
export const NOMBRE_MODO_DISENO: Record<ModoDiseno, { nombre: string; detalle: string }> = {
  inteligencia: {
    nombre: "Con inteligencia",
    detalle:
      "Claude diseña cada lámina mirando las piezas de la marca, y un crítico la revisa. Lo más variado y cuidado; tarda unos minutos más y gasta más.",
  },
  plantillas: {
    nombre: "Plantillas del kit",
    detalle:
      "Claude elige la plantilla aprobada que mejor enseña cada lámina y reparte el texto en sus huecos. Se ve como tus plantillas, más rápido y barato.",
  },
  mecanico: {
    nombre: "Mecánico",
    detalle:
      "El código pone el texto en las plantillas, sin Claude en el diseño. Sale en segundos, pero más repetido; una lámina que pide texto que el guion no trae sale con las plantillas de siempre.",
  },
}

/**
 * Marca > Kit: como se dibujan las piezas con el kit. El texto lo escribe
 * siempre el agente; esto decide solo el dibujo.
 */
export function ModoDisenoKit() {
  const [valor, setValor] = React.useState<ModoDisenoDeCuenta | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    leerModoDiseno().then((r) => (r.ok ? setValor(r.valor) : setError(r.error)))
  }, [])

  if (!valor) return error ? <p className="text-destructive text-sm">{error}</p> : null

  const elegir = (modo: ModoDiseno) => {
    if (modo === valor.modo) return
    const antes = valor
    setValor({ ...valor, modo })
    setError(null)
    startTransition(async () => {
      const r = await guardarModoDiseno(modo)
      if (!r.ok) {
        setValor(antes)
        setError(r.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">Cómo se dibujan las piezas</h3>
        <p className="text-muted-foreground text-sm">
          El texto lo escribe siempre el agente; esto decide solo el dibujo. Desde la ficha de cada pieza puedes
          redibujarla de otra manera.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Cómo se dibujan las piezas">
        {MODOS_DISENO.map((m) => {
          const activo = valor.modo === m
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={activo}
              disabled={pending}
              onClick={() => elegir(m)}
              className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${activo ? "border-primary bg-primary/5" : "hover:bg-accent border-input"}`}
            >
              <span className="text-sm font-medium">
                {NOMBRE_MODO_DISENO[m].nombre}
                {m === "plantillas" ? <span className="text-muted-foreground font-normal"> · por defecto</span> : null}
              </span>
              <span className="text-muted-foreground text-xs leading-relaxed">{NOMBRE_MODO_DISENO[m].detalle}</span>
            </button>
          )
        })}
      </div>
      {!valor.hayKit ? (
        <p className="text-muted-foreground text-xs">
          Mientras no haya un kit activo, las piezas salen con las plantillas de siempre, sea cual sea el modo.
        </p>
      ) : valor.modo === "inteligencia" && valor.piezas === 0 ? (
        <p className="text-xs text-warning">
          El kit activo no tiene piezas de ejemplo, y el diseño con inteligencia las necesita para mirar cómo diseña la
          marca: hasta que las tenga, las piezas salen con las plantillas del kit.
        </p>
      ) : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  )
}
