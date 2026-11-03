"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, ImageOffIcon } from "lucide-react"

import type { FichaPieza, PiezaEstudio, PilarEstudio } from "@/lib/estudio-data"
import { formatoPorId } from "@/lib/canales-catalogo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const ESTADO: Record<PiezaEstudio["status"], { texto: string; variante: "default" | "secondary" | "outline" | "destructive" }> = {
  generating: { texto: "Generando", variante: "outline" },
  generated: { texto: "Lista", variante: "secondary" },
  published: { texto: "Publicada", variante: "default" },
  failed: { texto: "Falló", variante: "destructive" },
}

/** Las piezas de un pilar, como una mesa de trabajo: portada al frente, el resto al abrirla. */
export function GaleriaPilar({ pilar }: { pilar: PilarEstudio }) {
  const [abierta, setAbierta] = React.useState<PiezaEstudio | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="outline">{pilar.piezas.length} piezas</Badge>
        <Badge variant="outline">{pilar.cartuchosDisponibles} ideas disponibles</Badge>
        <Badge variant="outline">
          {pilar.recetasActivas} {pilar.recetasActivas === 1 ? "receta activa" : "recetas activas"}
        </Badge>
      </div>

      {pilar.piezas.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">
          Este pilar todavía no tiene piezas. Crea una receta en Recetas y pulsa «Generar ahora».
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {pilar.piezas.map((p) => (
            <TarjetaPieza key={p.id} pieza={p} onAbrir={() => setAbierta(p)} />
          ))}
        </div>
      )}

      <Dialog open={abierta !== null} onOpenChange={(v) => !v && setAbierta(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          {abierta ? <VisorPieza pieza={abierta} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function proporcionDe(format: string): string {
  const f = formatoPorId(format)
  return f && f.formato.ancho ? `${f.formato.ancho} / ${f.formato.alto}` : "4 / 5"
}

function TarjetaPieza({ pieza, onAbrir }: { pieza: PiezaEstudio; onAbrir: () => void }) {
  const fmt = formatoPorId(pieza.format)
  const estado = ESTADO[pieza.status]

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group flex flex-col gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <div
        className="bg-muted relative w-full overflow-hidden rounded-lg border"
        style={{ aspectRatio: proporcionDe(pieza.format) }}
      >
        {pieza.imagenes[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pieza.imagenes[0]}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col justify-center gap-2 p-4 text-xs">
            {pieza.status === "failed" ? (
              <span className="text-destructive line-clamp-6">{pieza.error}</span>
            ) : (
              <>
                <ImageOffIcon className="size-4" />
                <span className="line-clamp-5">{pieza.laminas[0]?.titulo || pieza.parrafos[0] || "Sin imágenes"}</span>
              </>
            )}
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge variant={estado.variante}>{estado.texto}</Badge>
        </div>
        {pieza.imagenes.length > 1 ? (
          <div className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {pieza.imagenes.length} láminas
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <p className="line-clamp-2 text-sm leading-snug font-medium">{pieza.idea ?? pieza.laminas[0]?.titulo ?? "Pieza"}</p>
        {pieza.ficha.tema ? (
          <p className="text-muted-foreground line-clamp-1 text-xs">
            {pieza.ficha.tema}
            {pieza.ficha.subtema ? ` › ${pieza.ficha.subtema}` : ""}
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          {fmt ? `${fmt.canal.nombre} · ${fmt.formato.nombre}` : pieza.format} · {pieza.fecha}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {pieza.ficha.estilo ? <Badge variant="secondary">{pieza.ficha.estilo}</Badge> : null}
          {pieza.ficha.intencion ? <Badge variant="outline">{pieza.ficha.intencion}</Badge> : null}
          {pieza.ficha.narrativa ? <Badge variant="outline">{pieza.ficha.narrativa}</Badge> : null}
        </div>
      </div>
    </button>
  )
}

function VisorPieza({ pieza }: { pieza: PiezaEstudio }) {
  const [i, setI] = React.useState(0)
  const total = pieza.imagenes.length
  const fmt = formatoPorId(pieza.format)

  const ir = (d: number) => setI((x) => Math.min(total - 1, Math.max(0, x + d)))

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="pr-8 leading-snug">{pieza.idea ?? "Pieza"}</DialogTitle>
        <p className="text-muted-foreground text-sm">
          {fmt ? `${fmt.canal.nombre} · ${fmt.formato.nombre}` : pieza.format}
          {pieza.receta ? ` · ${pieza.receta}` : ""} · {pieza.fecha}
        </p>
      </DialogHeader>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-3">
          {total > 0 ? (
            <>
              <div className="relative mx-auto w-full max-w-[460px]">
                <div className="bg-muted overflow-hidden rounded-lg border" style={{ aspectRatio: proporcionDe(pieza.format) }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pieza.imagenes[i]} alt={`Lámina ${i + 1}`} className="h-full w-full object-cover" />
                </div>
                {total > 1 ? (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full shadow"
                      disabled={i === 0}
                      onClick={() => ir(-1)}
                      aria-label="Lámina anterior"
                    >
                      <ChevronLeftIcon className="size-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full shadow"
                      disabled={i === total - 1}
                      onClick={() => ir(1)}
                      aria-label="Lámina siguiente"
                    >
                      <ChevronRightIcon className="size-4" />
                    </Button>
                  </>
                ) : null}
              </div>
              {total > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {pieza.imagenes.map((url, k) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setI(k)}
                      className={`w-16 shrink-0 overflow-hidden rounded-md border-2 transition-opacity ${
                        k === i ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                      style={{ aspectRatio: proporcionDe(pieza.format) }}
                      aria-label={`Ver lámina ${k + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              {pieza.status === "failed" ? <p className="text-destructive text-sm">{pieza.error}</p> : null}
              {pieza.aviso ? <p className="text-sm text-warning">{pieza.aviso}</p> : null}
              {pieza.laminas.map((l, k) => (
                <div key={k}>
                  <p className="text-sm font-semibold">{l.titulo}</p>
                  {l.cuerpo ? <p className="text-muted-foreground text-sm">{l.cuerpo}</p> : null}
                </div>
              ))}
              {pieza.parrafos.map((t, k) => (
                <p key={k} className="text-sm">
                  {t}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Ficha ficha={pieza.ficha} />
          {pieza.caption ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium tracking-wide uppercase">Texto del post</p>
              <p className="text-sm whitespace-pre-line">{pieza.caption}</p>
              {pieza.hashtags.length ? (
                <p className="text-muted-foreground text-sm">{pieza.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
              ) : null}
            </div>
          ) : null}
          {pieza.canvaEditUrl ? (
            <Button variant="outline" render={<a href={pieza.canvaEditUrl} target="_blank" rel="noreferrer" />}>
              <ExternalLinkIcon className="size-4" />
              Abrir en Canva
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Con que se hizo la pieza: cada capa, de la idea al estilo. */
const CAMPOS_FICHA: [keyof FichaPieza, string][] = [
  ["pilar", "Pilar"],
  ["tema", "Tema"],
  ["subtema", "Subtema"],
  ["intencion", "Intención"],
  ["narrativa", "Narrativa"],
  ["cta", "CTA"],
  ["canal", "Canal"],
  ["formato", "Formato"],
  ["estilo", "Estilo"],
  ["receta", "Receta"],
  ["generador", "Generador"],
]

function Ficha({ ficha }: { ficha: FichaPieza }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium tracking-wide uppercase">Ficha</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border p-3 text-sm">
        {CAMPOS_FICHA.map(([clave, etiqueta]) => (
          <div key={clave} className="contents">
            <dt className="text-muted-foreground">{etiqueta}</dt>
            <dd className={ficha[clave] ? "" : "text-muted-foreground"}>{ficha[clave] ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
