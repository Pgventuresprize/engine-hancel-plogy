"use client"

import * as React from "react"
import { AlertTriangleIcon, CheckIcon } from "lucide-react"

import { EtiquetaRed, Miniatura } from "@/components/calendario/tarjeta-post"
import type { PostCalendario } from "@/lib/calendario-tipos"
import { cn } from "@/lib/utils"

type Pestana = "listas" | "frenadas" | "todas"

/** Lo que genero el Estudio y aun no tiene fecha. Sirve tambien para devolver un post. */
export function Bandeja({
  posts,
  total,
  seleccion,
  destino,
  encima,
  alSeleccionar,
  alAbrir,
  alArrastrar,
}: {
  posts: PostCalendario[]
  /** Las que hay de verdad: la lista se recorta si son muchas. */
  total: number
  seleccion: Set<string>
  destino: React.HTMLAttributes<HTMLElement>
  encima: boolean
  alSeleccionar: (ids: string[], marcar: boolean) => void
  alAbrir: (p: PostCalendario) => void
  alArrastrar: (id: string, e: React.DragEvent) => void
}) {
  const [pestana, setPestana] = React.useState<Pestana>("listas")
  const listas = posts.filter((p) => !p.frenada)
  const frenadas = posts.filter((p) => p.frenada)
  const ver = pestana === "frenadas" ? frenadas : pestana === "todas" ? posts : listas
  const todas = ver.length > 0 && ver.every((p) => seleccion.has(p.id))

  const pestanas: [Pestana, string, number][] = [
    ["listas", "Listas", listas.length],
    ["frenadas", "Frenadas", frenadas.length],
    ["todas", "Todas", posts.length],
  ]

  return (
    <aside aria-label="Piezas sin programar" {...destino} className={cn("bg-background flex min-h-0 flex-col border-b md:border-r md:border-b-0", encima && "bg-info-soft")}>
      <div className="flex flex-col gap-2 px-4 pt-3.5 pb-2.5">
        <h2 className="font-display flex items-baseline gap-1.5 text-[17px] leading-tight">
          Sin programar <span className="text-muted-foreground font-sans text-[13px] font-medium">{total}</span>
        </h2>
        <p className="text-muted-foreground hidden text-[12.5px] leading-snug md:block">Lo que generó el Estudio y aún no tiene fecha. Arrástralo a la semana.</p>
        <div className="bg-muted inline-flex max-w-full gap-0.5 self-start rounded-lg p-0.5">
          {pestanas.map(([id, nombre, n]) => (
            <button
              key={id}
              type="button"
              aria-pressed={pestana === id}
              onClick={() => setPestana(id)}
              className={cn("rounded-md px-2 py-1 text-[12.5px] whitespace-nowrap", pestana === id ? "bg-background font-semibold shadow-xs" : "text-muted-foreground")}
            >
              {nombre} {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 pb-3">
        {ver.length === 0 ? (
          <p className="text-muted-foreground m-1 text-[13px]">No hay piezas aquí. Cuando el Estudio genere más, aparecen solas.</p>
        ) : (
          ver.map((p) => (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => alArrastrar(p.id, e)}
              className={cn(
                "bg-background hover:bg-muted/40 grid cursor-grab grid-cols-[20px_46px_minmax(0,1fr)] items-center gap-2 rounded-lg border py-1.5 pr-2 pl-1.5",
                seleccion.has(p.id) && "border-info bg-info-soft"
              )}
            >
              <input
                type="checkbox"
                aria-label={`Seleccionar: ${p.titulo}`}
                checked={seleccion.has(p.id)}
                onChange={(e) => alSeleccionar([p.id], e.target.checked)}
                className="accent-info ml-0.5 size-[15px]"
              />
              <Miniatura post={p} className="h-[58px] w-[46px] rounded" />
              <button type="button" onClick={() => alAbrir(p)} className="min-w-0 cursor-pointer text-left">
                <span className="line-clamp-2 text-[12.5px] leading-snug font-medium">{p.titulo}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  <EtiquetaRed red={p.red} />
                  {p.frenada ? (
                    <span className="bg-warning-soft text-warning inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-none font-semibold">
                      <AlertTriangleIcon className="size-3" />
                      {p.deChat ? "Por aprobar" : "Frenada"}
                    </span>
                  ) : p.aprobada ? (
                    <span className="bg-success-soft text-success inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-none font-semibold">
                      <CheckIcon className="size-3" />
                      Aprobada
                    </span>
                  ) : null}
                  {p.imagenes.length > 1 ? <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px] leading-none font-semibold">{p.imagenes.length} láminas</span> : null}
                </span>
              </button>
            </div>
          ))
        )}
      </div>

      <div className="hidden border-t p-2.5 md:block">
        <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={todas} onChange={(e) => alSeleccionar(ver.map((p) => p.id), e.target.checked)} className="accent-info" />
          Seleccionar todas ({ver.length})
        </label>
      </div>
    </aside>
  )
}
