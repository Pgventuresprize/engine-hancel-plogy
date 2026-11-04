"use client"

import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { cambiarPublicacionProgramada, guardarHorarios } from "@/app/calendario/actions"
import { IconoRed } from "@/components/calendario/tarjeta-post"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { aHora, aMin, REDES_HORARIO, type Horarios, type RedHorario } from "@/engine/calendario/reparto"
import { NOMBRE_RED } from "@/lib/calendario-tipos"
import { cn } from "@/lib/utils"

/** De lunes a domingo; la clave es la de `Date.getUTCDay`. */
const DIAS: [string, string][] = [["1", "Lunes"], ["2", "Martes"], ["3", "Miércoles"], ["4", "Jueves"], ["5", "Viernes"], ["6", "Sábado"], ["0", "Domingo"]]

const HORAS = Array.from({ length: 33 }, (_, i) => aHora(6 * 60 + i * 30))

/** Una fila por hora, con cuantos huecos tiene, para no pintar tres chips iguales. */
function agrupar(horarios: Horarios, dia: string) {
  const filas: { red: RedHorario; hora: string; n: number }[] = []
  for (const red of REDES_HORARIO) {
    for (const hora of horarios[red][dia] ?? []) {
      const fila = filas.find((f) => f.red === red && f.hora === hora)
      if (fila) fila.n++
      else filas.push({ red, hora, n: 1 })
    }
  }
  return filas.sort((a, b) => aMin(a.hora) - aMin(b.hora))
}

function FilaDia({ dia, nombre, horarios, alCambiar }: { dia: string; nombre: string; horarios: Horarios; alCambiar: (h: Horarios) => void }) {
  const [red, setRed] = React.useState<RedHorario>("instagram")
  const [hora, setHora] = React.useState("12:00")

  const agregar = () => alCambiar({ ...horarios, [red]: { ...horarios[red], [dia]: [...(horarios[red][dia] ?? []), hora].sort() } })
  const quitar = (r: RedHorario, h: string) => {
    const lista = [...(horarios[r][dia] ?? [])]
    lista.splice(lista.indexOf(h), 1)
    const dias = { ...horarios[r], [dia]: lista }
    if (lista.length === 0) delete dias[dia]
    alCambiar({ ...horarios, [r]: dias })
  }

  return (
    <div className="grid items-center gap-1 border-b py-2 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-2.5">
      <b className="text-[13.5px] font-semibold">{nombre}</b>
      <div className="flex flex-wrap items-center gap-1.5">
        {agrupar(horarios, dia).map((f) => (
          <span key={`${f.red}-${f.hora}`} className={cn("inline-flex items-center gap-1 rounded-md py-1 pr-1 pl-1.5 text-xs font-semibold tabular-nums", f.red === "instagram" ? "bg-ig-soft text-ig" : "bg-li-soft text-li")}>
            <IconoRed red={f.red} />
            {f.hora}
            {f.n > 1 ? ` × ${f.n}` : ""}
            <button type="button" aria-label={`Quitar un hueco de ${NOMBRE_RED[f.red]} a las ${f.hora}, ${nombre}`} onClick={() => quitar(f.red, f.hora)} className="hover:bg-foreground/10 grid size-4 place-items-center rounded">
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <select aria-label={`Red, ${nombre}`} value={red} onChange={(e) => setRed(e.target.value as RedHorario)} className="border-input bg-background h-7 max-w-24 rounded-md border border-dashed px-1 text-xs">
            {REDES_HORARIO.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_RED[r]}
              </option>
            ))}
          </select>
          <select aria-label={`Hora, ${nombre}`} value={hora} onChange={(e) => setHora(e.target.value)} className="border-input bg-background h-7 rounded-md border border-dashed px-1 text-xs tabular-nums">
            {HORAS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
          <button type="button" aria-label={`Agregar hueco, ${nombre}`} onClick={agregar} className="border-input hover:bg-muted grid size-7 place-items-center rounded-md border border-dashed">
            <PlusIcon className="size-3.5" />
          </button>
        </span>
      </div>
    </div>
  )
}

function Formulario({ horarios, publicarActivo, programadas, alAviso, alCerrar }: { horarios: Horarios; publicarActivo: boolean; programadas: number; alAviso: (texto: string) => void; alCerrar: () => void }) {
  const [borrador, setBorrador] = React.useState(horarios)
  const [confirmar, setConfirmar] = React.useState(false)
  const [ocupado, iniciar] = React.useTransition()
  const cambio = JSON.stringify(borrador) !== JSON.stringify(horarios)

  const correr = (accion: () => Promise<void>) =>
    iniciar(async () => {
      try {
        await accion()
      } catch {
        alAviso("No respondió. Revisa tu conexión e inténtalo otra vez.")
      }
    })

  const cambiarInterruptor = (activo: boolean) =>
    correr(async () => {
      const r = await cambiarPublicacionProgramada(activo)
      setConfirmar(false)
      alAviso(r.ok ? (activo ? "Publicación programada encendida." : "Publicación programada apagada: nada sale solo.") : r.error)
    })

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mb-2 rounded-lg px-3 py-2.5", publicarActivo ? "bg-success-soft" : "bg-muted")}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <b className="block text-[13.5px] font-semibold">Publicación programada</b>
              <span className="text-muted-foreground text-[12.5px]">{publicarActivo ? "Encendida: lo programado sale solo a su hora." : "Apagada: puedes organizar todo, pero nada sale solo."}</span>
            </div>
            <Switch
              aria-label="Publicación programada"
              checked={publicarActivo || confirmar}
              disabled={ocupado}
              onCheckedChange={(activo) => {
                if (activo) setConfirmar(true)
                else if (confirmar) setConfirmar(false)
                else cambiarInterruptor(false)
              }}
            />
          </div>
          {confirmar ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
              <p className="m-0 w-full text-[13px]">
                {programadas ? `${programadas} ${programadas === 1 ? "post programado saldrá" : "posts programados saldrán"} solos a su hora, y lo que sale no se deshace.` : "Lo que programes saldrá solo a su hora, y lo que sale no se deshace."}
              </p>
              <Button variant="brand" size="sm" disabled={ocupado} onClick={() => cambiarInterruptor(true)}>
                Encender
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
            </div>
          ) : null}
        </div>

        {DIAS.map(([dia, nombre]) => (
          <FilaDia key={dia} dia={dia} nombre={nombre} horarios={borrador} alCambiar={setBorrador} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <span className="text-muted-foreground mr-auto max-w-[46ch] text-[12.5px]">Varios a la misma hora salen con 5 minutos entre uno y otro.</span>
        <Button variant="outline" onClick={alCerrar}>
          {cambio ? "Cancelar" : "Cerrar"}
        </Button>
        {cambio ? (
          <Button
            variant="brand"
            disabled={ocupado}
            onClick={() =>
              correr(async () => {
                const r = await guardarHorarios(borrador)
                if (!r.ok) return alAviso(r.error)
                alAviso("Horarios guardados.")
                alCerrar()
              })
            }
          >
            Guardar
          </Button>
        ) : null}
      </div>
    </>
  )
}

export function HorariosDialog({ abierto, horarios, publicarActivo, programadas, alAviso, alCerrar }: { abierto: boolean; horarios: Horarios; publicarActivo: boolean; programadas: number; alAviso: (texto: string) => void; alCerrar: () => void }) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => (a ? null : alCerrar())}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Horarios de la semana</DialogTitle>
          <DialogDescription>Los huecos que se repiten cada semana. Repartir los usa y salen punteados en el calendario. Puedes publicar a cualquier otra hora arrastrando.</DialogDescription>
        </DialogHeader>
        {/* Se monta al abrir: asi el borrador siempre parte de lo guardado. */}
        {abierto ? <Formulario horarios={horarios} publicarActivo={publicarActivo} programadas={programadas} alAviso={alAviso} alCerrar={alCerrar} /> : null}
      </DialogContent>
    </Dialog>
  )
}
