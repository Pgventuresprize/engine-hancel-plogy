"use client"

import * as React from "react"
import { ClockIcon } from "lucide-react"

import { Miniatura } from "@/components/calendario/tarjeta-post"
import { fechaLarga } from "@/components/calendario/vistas"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { lunesDe, repartir, sumarDias, type Horarios } from "@/engine/calendario/reparto"
import type { Ahora, Colocacion, PostCalendario } from "@/lib/calendario-tipos"

export type PlanReparto = { lista: Colocacion[]; aprobar: string[] }

/**
 * Colocar muchas de una vez. La vista previa se calcula aqui, al instante, con la
 * misma regla que usa el servidor; al confirmar, el servidor revalida cada pieza.
 */
export function RepartirDialog({
  abierto,
  piezas,
  haySeleccion,
  horarios,
  ocupadas,
  ahora,
  alCerrar,
  alConfirmar,
  alEditarHorarios,
}: {
  abierto: boolean
  piezas: PostCalendario[]
  haySeleccion: boolean
  horarios: Horarios
  ocupadas: Set<string>
  ahora: Ahora
  alCerrar: () => void
  alConfirmar: (plan: PlanReparto) => void
  alEditarHorarios: () => void
}) {
  const [desde, setDesde] = React.useState(ahora.dia)
  // Hasta el domingo de la semana siguiente: suele ser lo que se quiere planear.
  const [hasta, setHasta] = React.useState(sumarDias(lunesDe(ahora.dia), 13))
  const [orden, setOrden] = React.useState<"nuevas" | "viejas">("nuevas")
  const [conFrenadas, setConFrenadas] = React.useState(false)

  const frenadas = piezas.filter((p) => p.frenada)
  const elegidas = conFrenadas ? piezas : piezas.filter((p) => !p.frenada)
  // La bandeja llega de la mas nueva a la mas vieja.
  const enOrden = orden === "nuevas" ? elegidas : [...elegidas].reverse()
  const { plan, sobran } = repartir({ piezas: enOrden, desde, hasta, horarios, ocupadas, ahora })
  const dias = [...new Set(plan.map((x) => x.dia))]
  const sinHorarios = Object.values(horarios).every((r) => Object.keys(r).length === 0)
  const fueraFrenadas = conFrenadas ? 0 : frenadas.length

  const notas = [sobran ? `${sobran} no ${sobran === 1 ? "cabe" : "caben"} en esas fechas y ${sobran === 1 ? "se queda" : "se quedan"} en la bandeja.` : "", fueraFrenadas ? `${fueraFrenadas} ${fueraFrenadas === 1 ? "frenada se queda" : "frenadas se quedan"} fuera.` : ""].filter(Boolean).join(" ")

  return (
    <Dialog open={abierto} onOpenChange={(a) => (a ? null : alCerrar())}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Repartir {piezas.length} {haySeleccion ? (piezas.length === 1 ? "seleccionada" : "seleccionadas") : piezas.length === 1 ? "pieza" : "piezas"}
          </DialogTitle>
          <DialogDescription>Llena los huecos libres de tus horarios. Instagram va a los de Instagram y LinkedIn a los de LinkedIn. Lo ya programado no se toca.</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-muted-foreground flex flex-col gap-1 text-xs font-medium">
                Desde
                <Input type="date" value={desde} min={ahora.dia} onChange={(e) => setDesde(e.target.value)} className="text-foreground" />
              </label>
              <label className="text-muted-foreground flex flex-col gap-1 text-xs font-medium">
                Hasta
                <Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="text-foreground" />
              </label>
            </div>
            <label className="text-muted-foreground flex flex-col gap-1 text-xs font-medium">
              Orden
              <select value={orden} onChange={(e) => setOrden(e.target.value as "nuevas" | "viejas")} className="border-input bg-background text-foreground h-8 rounded-lg border px-2 text-sm">
                <option value="nuevas">Las más nuevas primero</option>
                <option value="viejas">Las más antiguas primero</option>
              </select>
            </label>
            {frenadas.length ? (
              <label className="flex cursor-pointer items-start gap-2 text-[13px]">
                <input type="checkbox" checked={conFrenadas} onChange={(e) => setConFrenadas(e.target.checked)} className="accent-info mt-0.5" />
                <span>
                  Incluir las {frenadas.length} frenadas
                  <span className="text-muted-foreground block text-xs">Quedan aprobadas sin revisarlas una a una.</span>
                </span>
              </label>
            ) : null}
            <Button variant="outline" className="self-start" onClick={alEditarHorarios}>
              <ClockIcon />
              Editar horarios
            </Button>
          </div>

          <div aria-label="Vista previa del reparto" className="flex min-w-0 flex-col gap-2.5 rounded-xl border px-3 py-2.5">
            {dias.length ? (
              dias.map((dia) => (
                <div key={dia}>
                  <h3 className="text-[12.5px] font-semibold first-letter:uppercase">{fechaLarga(dia)}</h3>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {plan
                      .filter((x) => x.dia === dia)
                      .map((x) => (
                        <span key={x.pieza.id} title={x.pieza.titulo} className="bg-background flex max-w-full items-center gap-1.5 rounded-md border py-0.5 pr-2 pl-0.5 text-[11.5px] font-semibold tabular-nums">
                          <Miniatura post={x.pieza} className="h-7 w-[22px] rounded-sm" />
                          {x.hora}
                        </span>
                      ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground m-0 text-[13px]">{sinHorarios ? "Todavía no tienes horarios. Agrégalos para que Repartir sepa a qué horas publicar." : "No hay huecos libres en esas fechas. Amplía el rango o agrega horarios."}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          {notas ? <span className="text-muted-foreground mr-auto max-w-[46ch] text-[12.5px]">{notas}</span> : null}
          <Button variant="outline" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button
            variant="brand"
            disabled={plan.length === 0}
            onClick={() =>
              alConfirmar({
                lista: plan.map((x) => ({ id: x.pieza.id, dia: x.dia, hora: x.hora })),
                aprobar: plan.filter((x) => x.pieza.frenada).map((x) => x.pieza.id),
              })
            }
          >
            Programar {plan.length}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
