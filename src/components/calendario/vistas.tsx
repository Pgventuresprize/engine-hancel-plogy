"use client"

import * as React from "react"

import { IconoRed, MiniPost, TarjetaPost } from "@/components/calendario/tarjeta-post"
import { aHora, aMin, claveHueco, diaDeSemana, huecosDelDia, sumarDias, yaPaso, type Horarios } from "@/engine/calendario/reparto"
import type { Ahora, PostCalendario } from "@/lib/calendario-tipos"
import { cn } from "@/lib/utils"

export const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

export const numeroDia = (dia: string) => Number(dia.slice(8))
export const mesDe = (dia: string) => Number(dia.slice(5, 7)) - 1
export const fechaCorta = (dia: string) => `${DIAS[diaDeSemana(dia)]} ${numeroDia(dia)} ${MESES[mesDe(dia)].slice(0, 3)}`
export const fechaLarga = (dia: string) => `${DIAS_LARGOS[diaDeSemana(dia)]} ${numeroDia(dia)} de ${MESES[mesDe(dia)]}`

const RAYADO = "bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,var(--background)_6px_12px)]"

type Comun = {
  posts: PostCalendario[]
  ahora: Ahora
  alAbrir: (p: PostCalendario) => void
  alArrastrar: (id: string, e: React.DragEvent) => void
}

type Destinos = {
  destino: (clave: string, bloqueado: boolean, alSoltar: (ids: string[]) => void) => React.HTMLAttributes<HTMLElement>
  encima: string | null
  alSoltar: (ids: string[], dia: string, hora: string | null) => void
}

const delDia = (posts: PostCalendario[], dia: string) => posts.filter((p) => p.dia === dia).sort((a, b) => aMin(a.hora ?? "00:00") - aMin(b.hora ?? "00:00"))

/**
 * La semana como rejilla de horas. De 6:00 a 22:00, y se estira si algo cae fuera:
 * un post que no se ve es peor que una fila de mas.
 */
export function Semana({ lunes, posts, ahora, alAbrir, alArrastrar, destino, encima, alSoltar, horarios, ocupadas, filtro }: Comun & Destinos & { lunes: string; horarios: Horarios; ocupadas: Set<string>; filtro: string }) {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
  const horas = posts.filter((p) => p.hora).map((p) => Math.floor(aMin(p.hora as string) / 60))
  const desde = Math.min(6, ...horas)
  const hasta = Math.max(22, ...horas)

  return (
    <div className="grid min-w-[752px] grid-cols-[52px_repeat(7,minmax(100px,1fr))]">
      <div className="bg-background sticky top-0 left-0 z-20 border-r border-b" />
      {dias.map((dia) => {
        const n = posts.filter((p) => p.dia === dia).length
        const hoy = dia === ahora.dia
        return (
          <div key={dia} className="bg-background sticky top-0 z-10 flex min-h-[50px] flex-col gap-px border-r border-b px-2 py-1.5">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[12.5px]">
              {DIAS[diaDeSemana(dia)]}
              <span className={cn("text-foreground grid size-6 place-items-center rounded-full text-[15px] leading-none font-semibold tabular-nums", hoy && "bg-foreground text-background")}>{numeroDia(dia)}</span>
            </div>
            <small className={cn("text-muted-foreground text-[11px]", !n && !yaPaso(dia, "23:59", ahora) && "text-warning")}>{n ? `${n} ${n === 1 ? "post" : "posts"}` : "Sin posts"}</small>
          </div>
        )
      })}

      {Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i).map((h) => (
        <React.Fragment key={h}>
          <div className="bg-background text-muted-foreground border-border/60 sticky left-0 z-[5] border-r border-b pt-1 pr-1.5 text-right text-[11px] tabular-nums">{h}:00</div>
          {dias.map((dia) => {
            const hora = aHora(h * 60)
            const clave = `${dia} ${hora}`
            const pasado = yaPaso(dia, aHora(h * 60 + 59), ahora)
            const dentro = delDia(posts, dia).filter((p) => Math.floor(aMin(p.hora as string) / 60) === h)
            const conHoraActual = dia === ahora.dia && Math.floor(aMin(ahora.hora) / 60) === h
            // Los huecos de la plantilla que siguen libres: lo que Repartir llenaria.
            const libres = pasado
              ? []
              : huecosDelDia(dia, horarios).filter((s) => Math.floor(aMin(s.hora) / 60) === h && (filtro === "todas" || filtro === s.red) && !ocupadas.has(claveHueco(s.red, dia, s.hora)) && !yaPaso(dia, s.hora, ahora))
            return (
              <div
                key={clave}
                {...destino(clave, pasado, (ids) => alSoltar(ids, dia, hora))}
                className={cn(
                  "border-border/60 @container relative flex min-h-8 flex-col gap-0.5 border-r border-b p-0.5",
                  pasado && RAYADO,
                  encima === clave && "bg-info-soft ring-info ring-2 ring-inset"
                )}
              >
                {conHoraActual ? (
                  <div aria-hidden="true" className="bg-brand before:bg-brand pointer-events-none absolute inset-x-0 z-[2] h-0.5 before:absolute before:-top-[3px] before:-left-px before:size-2 before:rounded-full" style={{ top: `${((aMin(ahora.hora) % 60) / 60) * 100}%` }} />
                ) : null}
                {dentro.map((p) => (
                  <TarjetaPost key={p.id} post={p} alAbrir={alAbrir} alArrastrar={alArrastrar} />
                ))}
                {libres.map((s) => (
                  <div key={`${s.red}-${s.hora}`} title="Hueco de tus horarios" className="text-muted-foreground border-input flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[11px] leading-tight tabular-nums">
                    <IconoRed red={s.red} />
                    {s.hora}
                  </div>
                ))}
              </div>
            )
          })}
        </React.Fragment>
      ))}
    </div>
  )
}

export function Mes({ inicio, primerLunes, posts, ahora, alAbrir, alArrastrar, destino, encima, alSoltar, alIrADia }: Comun & Destinos & { inicio: string; primerLunes: string; alIrADia: (dia: string) => void }) {
  const mes = mesDe(inicio)
  const dias: string[] = []
  for (let i = 0, f = primerLunes; i < 42; i++, f = sumarDias(f, 1)) {
    // Sin una sexta fila vacia cuando el mes ya termino.
    if (i >= 35 && mesDe(f) !== mes) break
    dias.push(f)
  }

  return (
    <div className="grid min-w-[700px] grid-cols-7">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <div key={d} className="bg-background text-muted-foreground border-border/60 sticky top-0 z-10 border-r border-b px-2 py-1.5 text-xs capitalize">
          {DIAS[d]}
        </div>
      ))}
      {dias.map((dia) => {
        const pasado = yaPaso(dia, "23:59", ahora)
        const fuera = mesDe(dia) !== mes
        return (
          <div
            key={dia}
            {...destino(dia, pasado, (ids) => alSoltar(ids, dia, null))}
            className={cn("border-border/60 flex min-h-28 flex-col gap-1 border-r border-b p-1", fuera && "bg-muted/40", pasado && RAYADO, encima === dia && "bg-info-soft ring-info ring-2 ring-inset")}
          >
            <button
              type="button"
              onClick={() => alIrADia(dia)}
              aria-label={`Ver la semana del ${fechaCorta(dia)}`}
              className={cn(
                "hover:bg-muted grid size-6 place-items-center self-start rounded-full text-[12.5px] font-semibold tabular-nums",
                fuera && "text-muted-foreground",
                dia === ahora.dia && "bg-foreground text-background hover:bg-foreground"
              )}
            >
              {numeroDia(dia)}
            </button>
            <div className="flex flex-wrap gap-1">
              {delDia(posts, dia).map((p) => (
                <MiniPost key={p.id} post={p} alAbrir={alAbrir} alArrastrar={alArrastrar} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** En el celular no hay arrastre: la semana es una lista, y la fecha se cambia al abrir el post. */
export function Agenda({ lunes, posts, ahora, alAbrir, alArrastrar }: Comun & { lunes: string }) {
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-2.5 pb-6">
      {Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)).map((dia) => {
        const lista = delDia(posts, dia)
        return (
          <div key={dia}>
            <h3 className="mb-1.5 text-[13px] font-semibold first-letter:uppercase">
              {fechaLarga(dia)}
              {dia === ahora.dia ? <span className="text-muted-foreground font-normal"> · hoy</span> : null}
              {lista.length ? null : <small className="text-muted-foreground font-normal"> · sin posts</small>}
            </h3>
            <div className="flex flex-col gap-1">
              {lista.map((p) => (
                <TarjetaPost key={p.id} post={p} grande alAbrir={alAbrir} alArrastrar={alArrastrar} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
