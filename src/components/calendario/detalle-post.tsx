"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangleIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, LockIcon, SendIcon } from "lucide-react"

import { EtiquetaRed, IconoRed, sePuedeMover } from "@/components/calendario/tarjeta-post"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { aHora, fechaCorta, PASO_MINUTOS, sumarDias } from "@/engine/calendario/reparto"
import { NOMBRE_RED, type Ahora, type PostCalendario } from "@/lib/calendario-tipos"
import { cn } from "@/lib/utils"

const HORAS = Array.from({ length: (24 * 60) / PASO_MINUTOS }, (_, i) => aHora(i * PASO_MINUTOS))

const ESTADO: Record<PostCalendario["estado"], [string, string]> = {
  bandeja: ["Sin programar", "bg-muted text-muted-foreground"],
  programada: ["Programada", "bg-info-soft text-info"],
  publicando: ["Publicando", "bg-info-soft text-info"],
  publicada: ["Publicada", "bg-success-soft text-success"],
  fallida: ["No salió", "bg-destructive/10 text-destructive"],
  revisar: ["Por revisar", "bg-warning-soft text-warning"],
}

function Aviso({ tono, titulo, children }: { tono: "warn" | "bad" | "ok" | "info"; titulo?: string; children?: React.ReactNode }) {
  const clases = { warn: "bg-warning-soft text-warning", bad: "bg-destructive/10 text-destructive", ok: "bg-success-soft text-success", info: "bg-info-soft text-info" }
  const Icono = tono === "ok" ? LockIcon : tono === "info" ? EyeIcon : AlertTriangleIcon
  return (
    <div className={cn("flex gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-snug", clases[tono])}>
      <Icono className="mt-0.5 size-4 shrink-0" />
      <span>
        {titulo ? <b className="block font-semibold">{titulo}</b> : null}
        {children}
      </span>
    </div>
  )
}

function Laminas({ imagenes }: { imagenes: string[] }) {
  const [i, setI] = React.useState(0)
  const n = imagenes.length
  const actual = Math.min(i, n - 1)
  return (
    <div className="bg-muted relative grid shrink-0 place-items-center overflow-hidden rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imagenes[actual]} alt={`Lámina ${actual + 1} del carrusel`} className="block max-h-[360px] w-full object-contain" />
      {n > 1 ? (
        <>
          <button type="button" aria-label="Lámina anterior" onClick={() => setI((actual - 1 + n) % n)} className="bg-background/90 absolute top-1/2 left-2 grid size-8 -translate-y-1/2 place-items-center rounded-full shadow">
            <ChevronLeftIcon className="size-4" />
          </button>
          <button type="button" aria-label="Lámina siguiente" onClick={() => setI((actual + 1) % n)} className="bg-background/90 absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full shadow">
            <ChevronRightIcon className="size-4" />
          </button>
          <span className="bg-foreground/70 text-background absolute right-2 bottom-2 rounded-full px-2 py-0.5 text-[11px] tabular-nums">
            {actual + 1} / {n}
          </span>
        </>
      ) : null}
    </div>
  )
}

export type AccionesDetalle = {
  colocar: (ids: string[], dia: string, hora: string | null) => void
  quitar: (ids: string[]) => void
  aprobar: (id: string) => void
  reintentar: (id: string) => void
  resolver: (id: string, salio: boolean) => void
  publicarYa: (id: string) => void
  abrirPorId: (id: string) => void
}

export function DetallePost({ post, ahora, publicarActivo, ocupado, acciones, alCerrar }: { post: PostCalendario | null; ahora: Ahora; publicarActivo: boolean; ocupado: boolean; acciones: AccionesDetalle; alCerrar: () => void }) {
  return (
    <Sheet open={post !== null} onOpenChange={(abierto) => (abierto ? null : alCerrar())}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        {/* La clave reinicia el formulario y la lamina al pasar de un post a su hermano. */}
        {post ? <Contenido key={`${post.id}-${post.dia}-${post.hora}`} post={post} ahora={ahora} publicarActivo={publicarActivo} ocupado={ocupado} acciones={acciones} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function Contenido({ post, ahora, publicarActivo, ocupado, acciones }: { post: PostCalendario; ahora: Ahora; publicarActivo: boolean; ocupado: boolean; acciones: AccionesDetalle }) {
  const [dia, setDia] = React.useState(post.dia ?? sumarDias(ahora.dia, 1))
  const [hora, setHora] = React.useState(post.hora ?? "12:00")
  const [confirmar, setConfirmar] = React.useState(false)

  const movible = sePuedeMover(post)
  const [nombreEstado, claseEstado] = ESTADO[post.estado]
  const hermana = post.hermana
  const puedeCopiarHora = hermana && !hermana.dia && post.dia && post.hora && post.estado === "programada" && !hermana.frenada

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b py-3 pr-12 pl-4">
        <EtiquetaRed red={post.red} />
        <span className={cn("rounded px-1.5 py-0.5 text-[11px] leading-none font-semibold", claseEstado)}>{nombreEstado}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        {post.estado === "revisar" ? <Aviso tono="warn" titulo="Puede haber salido">{post.error ?? "Míralo en la red antes de volver a publicarla."}</Aviso> : null}
        {post.estado === "fallida" ? <Aviso tono="bad" titulo="No salió">{post.error ?? "Pasó su hora sin publicarse."}</Aviso> : null}
        {post.frenada ? (
          <Aviso tono="warn" titulo={post.deChat ? "Necesita aprobación" : "Frenada"}>
            {post.hallazgo ? `${post.hallazgo.slice(0, 260)}${post.hallazgo.length > 260 ? "…" : ""}` : "Sin aprobar no saldrá a su hora."}
          </Aviso>
        ) : null}
        {post.recursoPendiente && post.estado === "programada" ? <Aviso tono="warn" titulo="Recurso pendiente">Promete un recurso que aún no está en la web. Si no sale antes, este post no saldrá.</Aviso> : null}

        {post.imagenes.length ? <Laminas imagenes={post.imagenes} /> : <Aviso tono="info">La tarjeta de LinkedIn se dibuja al publicar, por eso aquí solo se ve el texto.</Aviso>}

        <SheetTitle className="font-display text-lg leading-tight text-balance">{post.titulo}</SheetTitle>
        <SheetDescription className="sr-only">Detalle del post y su fecha de publicación</SheetDescription>

        {post.estado === "publicada" || post.estado === "publicando" ? (
          <Aviso tono="ok" titulo={post.estado === "publicada" && post.dia ? `Salió el ${fechaCorta(post.dia)} a las ${post.hora}` : "Publicando ahora"}>
            Ya no se puede mover.
          </Aviso>
        ) : movible ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-semibold">Cuándo sale</span>
            <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
              <label className="text-muted-foreground flex flex-col gap-1 text-xs font-medium">
                Día
                <Input type="date" value={dia} min={ahora.dia} onChange={(e) => setDia(e.target.value)} className="text-foreground" />
              </label>
              <label className="text-muted-foreground flex flex-col gap-1 text-xs font-medium">
                Hora
                <select value={hora} onChange={(e) => setHora(e.target.value)} className="border-input bg-background text-foreground h-8 rounded-lg border px-2 text-sm tabular-nums">
                  {HORAS.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            </div>
            <Button variant="default" disabled={ocupado || !dia} onClick={() => acciones.colocar([post.id], dia, hora)}>
              {post.dia ? "Cambiar fecha" : "Programar"}
            </Button>
          </div>
        ) : null}

        {hermana ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-semibold">La misma noticia en {NOMBRE_RED[hermana.red]}</span>
            <div className="bg-info-soft text-info flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]">
              <IconoRed red={hermana.red} className="size-4" />
              <span className="flex-1">{hermana.dia ? `Programada ${fechaCorta(hermana.dia)}, ${hermana.hora}` : "Sin programar"}</span>
              {puedeCopiarHora ? (
                <Button size="sm" variant="outline" disabled={ocupado} onClick={() => acciones.colocar([hermana.id], post.dia as string, post.hora)}>
                  Misma hora
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => acciones.abrirPorId(hermana.id)}>
                  Ver
                </Button>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-semibold">Texto del post</span>
          <div className="bg-muted max-h-48 overflow-y-auto rounded-lg px-3 py-2.5 text-[13.5px] leading-normal whitespace-pre-wrap">{post.texto}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t px-4 py-3">
        {post.estado === "revisar" ? (
          confirmar ? (
            <>
              <p className="w-full text-[13px]">Si ya está en {NOMBRE_RED[post.red]} saldría dos veces. ¿Seguro que no salió?</p>
              <Button variant="brand" disabled={ocupado} onClick={() => acciones.resolver(post.id, false)}>
                No salió, publicar
              </Button>
              <Button variant="outline" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button variant="brand" disabled={ocupado} onClick={() => acciones.resolver(post.id, true)}>
                <CheckIcon />
                Sí salió
              </Button>
              <Button variant="outline" disabled={ocupado} onClick={() => setConfirmar(true)}>
                No salió, volver a publicar
              </Button>
            </>
          )
        ) : (
          <>
            {post.frenada && post.estado !== "publicando" ? (
              <Button variant="brand" disabled={ocupado} onClick={() => acciones.aprobar(post.id)}>
                <CheckIcon />
                Aprobar
              </Button>
            ) : null}
            {post.estado === "fallida" && !post.frenada ? (
              <Button variant="brand" disabled={ocupado} onClick={() => acciones.reintentar(post.id)}>
                Reintentar
              </Button>
            ) : null}
            {movible && !post.frenada ? (
              confirmar ? (
                <>
                  <p className="w-full text-[13px]">Sale ahora en {NOMBRE_RED[post.red]} y no se puede deshacer.</p>
                  <Button variant="brand" disabled={ocupado} onClick={() => acciones.publicarYa(post.id)}>
                    <SendIcon />
                    Publicar ya
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmar(false)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button variant="outline" disabled={ocupado} onClick={() => setConfirmar(true)}>
                  <SendIcon />
                  Publicar ahora
                </Button>
              )
            ) : null}
            {post.dia && movible && !confirmar ? (
              <Button variant="destructive" disabled={ocupado} onClick={() => acciones.quitar([post.id])}>
                Quitar del calendario
              </Button>
            ) : null}
            {!confirmar ? <Button variant="outline" render={<Link href={`/estudio?pieza=${post.id}`} />} nativeButton={false}>Editar en el Estudio</Button> : null}
          </>
        )}
        {post.estado === "fallida" && !publicarActivo ? <p className="text-muted-foreground w-full text-xs">La publicación programada está apagada: reintentar no saldrá hasta encenderla.</p> : null}
      </div>
    </div>
  )
}
