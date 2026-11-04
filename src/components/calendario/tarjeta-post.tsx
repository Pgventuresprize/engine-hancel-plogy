"use client"

import { AlertTriangleIcon, CheckIcon, EyeIcon, LoaderIcon } from "lucide-react"

import { NOMBRE_RED, type PostCalendario, type RedCalendario } from "@/lib/calendario-tipos"
import { cn } from "@/lib/utils"

/** Las marcas no estan en lucide: son trazos sencillos, del mismo grosor que el resto. */
export function IconoRed({ red, className }: { red: RedCalendario; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("size-3 shrink-0", className)}>
      {red === "instagram" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <path d="M17.5 6.5h.01" />
        </>
      ) : (
        <>
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6Z" />
          <rect x="2" y="9" width="4" height="12" />
          <circle cx="4" cy="4" r="2" />
        </>
      )}
    </svg>
  )
}

export function EtiquetaRed({ red }: { red: RedCalendario }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-none font-semibold", red === "instagram" ? "bg-ig-soft text-ig" : "bg-li-soft text-li")}>
      <IconoRed red={red} />
      {NOMBRE_RED[red]}
    </span>
  )
}

export const sePuedeMover = (p: PostCalendario) => p.estado !== "publicada" && p.estado !== "publicando" && p.estado !== "revisar"

/** Algo impide que salga a su hora y todavia se esta a tiempo de arreglarlo. */
export const tieneAviso = (p: PostCalendario) => p.estado === "programada" && (p.frenada || p.recursoPendiente)

function Sena({ post }: { post: PostCalendario }) {
  if (post.estado === "publicada") return <CheckIcon className="size-3" />
  if (post.estado === "publicando") return <LoaderIcon className="size-3 animate-spin motion-reduce:animate-none" />
  if (post.estado === "revisar") return <EyeIcon className="size-3" />
  if (post.estado === "fallida" || tieneAviso(post)) return <AlertTriangleIcon className="size-3" />
  return null
}

export function Miniatura({ post, className }: { post: PostCalendario; className: string }) {
  return post.imagenes[0] ? (
    // Las laminas viven en el storage de la marca, igual que en el tablero.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={post.imagenes[0]} alt="" draggable={false} loading="lazy" className={cn("bg-muted block object-cover", className)} />
  ) : (
    <span className={cn("bg-li-soft text-li grid place-items-center", className)}>
      <IconoRed red="linkedin" />
    </span>
  )
}

/** Un post colocado: en la semana y en la agenda del celular. */
export function TarjetaPost({
  post,
  grande = false,
  alAbrir,
  alArrastrar,
}: {
  post: PostCalendario
  grande?: boolean
  alAbrir: (p: PostCalendario) => void
  alArrastrar: (id: string, e: React.DragEvent) => void
}) {
  const movible = sePuedeMover(post)
  return (
    <button
      type="button"
      draggable={movible}
      onDragStart={movible ? (e) => alArrastrar(post.id, e) : undefined}
      onClick={() => alAbrir(post)}
      aria-label={`${NOMBRE_RED[post.red]}, ${post.hora}, ${post.titulo}`}
      className={cn(
        "bg-background hover:border-input grid w-full items-start gap-1.5 rounded-md border p-1 text-left shadow-xs @max-[88px]:grid-cols-1",
        grande ? "grid-cols-[40px_minmax(0,1fr)]" : "grid-cols-[30px_minmax(0,1fr)]",
        movible ? "cursor-grab" : "cursor-pointer",
        post.estado === "publicada" && "bg-success-soft border-success/25",
        post.estado === "fallida" && "bg-destructive/10 border-destructive/30",
        post.estado === "publicando" && "bg-info-soft border-info/30",
        post.estado === "revisar" && "bg-warning-soft border-warning/40",
        tieneAviso(post) && "bg-warning-soft border-warning/30"
      )}
    >
      <Miniatura post={post} className={cn("rounded-sm @max-[88px]:hidden", grande ? "h-[50px] w-10" : "h-[38px] w-[30px]")} />
      <span className="min-w-0">
        <span
          className={cn(
            "flex items-center gap-1 text-[11.5px] leading-tight font-semibold tabular-nums",
            post.estado === "publicada" && "text-success",
            post.estado === "fallida" && "text-destructive",
            post.estado === "revisar" && "text-warning"
          )}
        >
          {post.hora}
          <Sena post={post} />
          <span className={cn("ml-auto", post.red === "instagram" ? "text-ig" : "text-li")}>
            <IconoRed red={post.red} />
          </span>
        </span>
        <span className={cn("text-muted-foreground mt-px line-clamp-2 leading-tight", grande ? "text-[12.5px]" : "text-[11px]")}>{post.titulo}</span>
      </span>
    </button>
  )
}

/** Un post en la vista de mes: solo la miniatura. */
export function MiniPost({
  post,
  alAbrir,
  alArrastrar,
}: {
  post: PostCalendario
  alAbrir: (p: PostCalendario) => void
  alArrastrar: (id: string, e: React.DragEvent) => void
}) {
  const movible = sePuedeMover(post)
  return (
    <button
      type="button"
      title={`${post.hora} · ${NOMBRE_RED[post.red]} · ${post.titulo}`}
      aria-label={`${NOMBRE_RED[post.red]}, ${post.hora}, ${post.titulo}`}
      draggable={movible}
      onDragStart={movible ? (e) => alArrastrar(post.id, e) : undefined}
      onClick={() => alAbrir(post)}
      className={cn(
        "overflow-hidden rounded-sm",
        movible ? "cursor-grab" : "cursor-pointer",
        post.estado === "publicada" && "opacity-55",
        (post.estado === "fallida" || post.estado === "revisar") && "ring-destructive ring-2",
        tieneAviso(post) && "ring-warning ring-2"
      )}
    >
      <Miniatura post={post} className="h-[38px] w-[30px]" />
    </button>
  )
}
