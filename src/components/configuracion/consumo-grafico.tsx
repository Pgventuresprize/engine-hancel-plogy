"use client"

import * as React from "react"

import { formatTokens } from "@/lib/format"
import type { ConsumoDia, Grupo } from "@/lib/consumo-data"

/**
 * Tokens por dia, apilados por grupo de pasos.
 *
 * Los colores son los cuatro primeros de la paleta categorica de referencia,
 * validados como serie apilada en claro y en oscuro (separacion para
 * daltonismo >= 8,4). Dos quedan por debajo de 3:1 sobre el fondo claro: por
 * eso hay leyenda, tooltip y la tabla por paso debajo.
 */
const SERIES: { clave: Grupo; etiqueta: string; color: string }[] = [
  { clave: "analisis", etiqueta: "Análisis", color: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { clave: "guion", etiqueta: "Guion", color: "bg-[#eb6834] dark:bg-[#d95926]" },
  { clave: "diseno", etiqueta: "Diseño", color: "bg-[#1baf7a] dark:bg-[#199e70]" },
  { clave: "otros", etiqueta: "Otros", color: "bg-[#eda100] dark:bg-[#c98500]" },
]

const ALTO = 180

/** Un tope redondo por encima del maximo, para que las lineas caigan en numeros limpios. */
function topeRedondo(maximo: number): number {
  if (maximo <= 0) return 1
  const paso = 10 ** Math.floor(Math.log10(maximo)) / 2
  return Math.ceil(maximo / paso) * paso
}

const fechaCorta = (dia: string) =>
  new Date(`${dia}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" })

export function ConsumoGrafico({ dias }: { dias: ConsumoDia[] }) {
  const [activo, setActivo] = React.useState<number | null>(null)
  const totales = dias.map((d) => SERIES.reduce((n, s) => n + d[s.clave], 0))
  const tope = topeRedondo(Math.max(...totales))
  const lineas = [tope, tope / 2, 0]
  const sel = activo === null ? null : dias[activo]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.clave} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-[3px] ${s.color}`} aria-hidden />
            {s.etiqueta}
          </span>
        ))}
      </div>

      <div className="relative flex gap-2">
        {/* Eje: tres lineas, la de cero es la base. */}
        <div className="flex w-10 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-muted-foreground" style={{ height: ALTO }}>
          {lineas.map((v) => (
            <span key={v} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {formatTokens(v)}
            </span>
          ))}
        </div>

        <div className="relative flex-1" style={{ height: ALTO }} onMouseLeave={() => setActivo(null)}>
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
            {lineas.map((v) => (
              <div key={v} className={v === 0 ? "border-t border-border" : "border-t border-dashed border-border/60"} />
            ))}
          </div>

          <div
            className="absolute inset-0 flex items-end gap-[2px]"
            role="img"
            aria-label={`Tokens por día de los últimos ${dias.length} días; el máximo es ${formatTokens(Math.max(...totales))}.`}
          >
            {dias.map((d, i) => {
              const conValor = SERIES.filter((s) => d[s.clave] > 0)
              const arriba = conValor[conValor.length - 1]?.clave
              return (
                <button
                  key={d.dia}
                  type="button"
                  className={`flex h-full flex-1 flex-col-reverse gap-[2px] rounded-t-[4px] ${activo === i ? "bg-muted/70" : ""}`}
                  onMouseEnter={() => setActivo(i)}
                  onFocus={() => setActivo(i)}
                  onClick={() => setActivo(i)}
                  aria-label={`${fechaCorta(d.dia)}: ${formatTokens(totales[i])} tokens`}
                >
                  {conValor.map((s) => (
                    <span
                      key={s.clave}
                      className={`block w-full ${s.color} ${s.clave === arriba ? "rounded-t-[4px]" : ""}`}
                      style={{ height: `${(d[s.clave] / tope) * 100}%`, minHeight: 2 }}
                    />
                  ))}
                </button>
              )
            })}
          </div>

          {sel && activo !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 w-44 rounded-lg border bg-popover p-2.5 text-xs shadow-md"
              style={{
                left: `${((activo + 0.5) / dias.length) * 100}%`,
                transform: `translate(${activo > dias.length / 2 ? "-100%" : "0"}, -100%)`,
              }}
            >
              <div className="mb-1.5 font-medium text-foreground">{fechaCorta(sel.dia)}</div>
              {SERIES.map((s) => (
                <div key={s.clave} className="flex items-center justify-between gap-3 text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`size-2 rounded-[2px] ${s.color}`} aria-hidden />
                    {s.etiqueta}
                  </span>
                  <span className="tabular-nums text-foreground">{formatTokens(sel[s.clave])}</span>
                </div>
              ))}
              <div className="mt-1.5 flex justify-between border-t pt-1.5 font-medium text-foreground">
                <span>Total</span>
                <span className="tabular-nums">{formatTokens(totales[activo])}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="ml-12 flex justify-between text-[11px] text-muted-foreground">
        <span>{fechaCorta(dias[0].dia)}</span>
        <span>{fechaCorta(dias[Math.floor(dias.length / 2)].dia)}</span>
        <span>Hoy</span>
      </div>
    </div>
  )
}
