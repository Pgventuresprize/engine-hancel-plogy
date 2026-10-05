"use client"

import * as React from "react"
import { CheckIcon, ClapperboardIcon, CopyIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react"

import {
  descartarVideo,
  entregarVideo,
  generarGuionAhora,
  moverVideo,
  publicarVideoAhora,
  reescribirGuion,
  reintentarExportacion,
  type ResultadoVideo,
} from "@/app/videos/actions"
import type { AjustesVideo } from "@/engine/videos/ajustes"
import type { EtapaVideo, VideoVista } from "@/lib/videos-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * El tablero de Video studio: el recorrido de cada video, de la idea a las
 * redes. Unas etapas las hace el sistema y otras una persona:
 *
 * - Ideas: el agente tomo la idea y esta escribiendo el guion.
 * - Guion / Escenas: el guion listo; cada escena se copia por separado en Flow.
 * - Clips: referencia del trabajo manual (pegar los clips, recortar, poner
 *   subtitulos en Canva). Se llega arrastrando la tarjeta.
 * - Video: la persona entrega el enlace de Canva al soltar la tarjeta; el
 *   sistema exporta el MP4 y lo publica a su hora.
 * - Publicacion: una fila por red, programada o publicada.
 */

const COLUMNAS: { id: EtapaVideo; titulo: string; pista: string }[] = [
  { id: "idea", titulo: "Ideas", pista: "El agente toma la idea y escribe el guion" },
  { id: "escenas", titulo: "Guion / Escenas", pista: "Copia cada escena en Flow" },
  { id: "clips", titulo: "Clips", pista: "Pegar, recortar y subtitular en Canva" },
  { id: "video", titulo: "Video", pista: "Al soltar aquí, pega el enlace de Canva" },
  { id: "publicado", titulo: "Publicación", pista: "Una fila por red" },
]

const RED: Record<string, string> = { instagram: "Instagram", facebook: "Facebook" }

/** A que columnas se puede arrastrar una tarjeta desde la suya. */
function acepta(origen: EtapaVideo, destino: EtapaVideo) {
  if (origen === destino) return false
  if (destino === "clips") return origen === "escenas"
  if (destino === "escenas") return origen === "clips"
  if (destino === "video") return origen === "escenas" || origen === "clips"
  return false
}

export function TableroVideos({ videos, ajustes }: { videos: VideoVista[]; ajustes: AjustesVideo }) {
  const [arrastrando, setArrastrando] = React.useState<VideoVista | null>(null)
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [entregando, setEntregando] = React.useState<string | null>(null)
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [trabajando, setTrabajando] = React.useState<string | null>(null)

  const correr = (etiqueta: string, fn: () => Promise<ResultadoVideo>, despues?: () => void) => {
    setAviso(null)
    setTrabajando(etiqueta)
    startTransition(async () => {
      const r = await fn()
      setTrabajando(null)
      if (r.ok) {
        if (r.aviso) setAviso({ ok: true, texto: r.aviso })
        despues?.()
      } else setAviso({ ok: false, texto: r.error })
    })
  }

  const soltar = (v: VideoVista, destino: EtapaVideo) => {
    if (!acepta(v.status, destino)) return
    if (destino === "video") setEntregando(v.id)
    else correr("Moviendo…", () => moverVideo(v.id, destino as "escenas" | "clips"))
  }

  const detalle = videos.find((v) => v.id === abierto) ?? null
  const aEntregar = videos.find((v) => v.id === entregando) ?? null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {ajustes.modo === "automatico"
            ? `Automático: ${ajustes.horas.length} ${ajustes.horas.length === 1 ? "video" : "videos"} al día. El guion de cada uno queda listo con un día de antelación.`
            : "Manual: los guiones se generan con el botón."}
          {ajustes.publicarActivo ? "" : " La publicación está apagada en la configuración."}
        </p>
        <Button disabled={pending} onClick={() => correr("Escribiendo guion…", generarGuionAhora)}>
          {trabajando === "Escribiendo guion…" ? <Loader2Icon className="size-4 animate-spin" /> : <ClapperboardIcon className="size-4" />}
          {trabajando === "Escribiendo guion…" ? "Escribiendo guion (≈1 min)…" : "Generar guion"}
        </Button>
      </div>

      {aviso ? <p className={`text-sm ${aviso.ok ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p> : null}
      {trabajando && trabajando !== "Escribiendo guion…" ? <p className="text-muted-foreground text-sm">{trabajando}</p> : null}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNAS.map((col) => (
          <Columna
            key={col.id}
            columna={col}
            videos={videos.filter((v) => v.status === col.id)}
            arrastrando={arrastrando}
            onArrastrar={setArrastrando}
            onSoltar={(v) => soltar(v, col.id)}
            onAbrir={(v) => setAbierto(v.id)}
          />
        ))}
      </div>

      <Dialog open={Boolean(detalle)} onOpenChange={(o) => !o && setAbierto(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {detalle ? (
            <Detalle
              v={detalle}
              pending={pending}
              trabajando={trabajando}
              onAccion={(etiqueta, fn, cerrar) => correr(etiqueta, fn, cerrar ? () => setAbierto(null) : undefined)}
              onEntregar={() => {
                setAbierto(null)
                setEntregando(detalle.id)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(aEntregar)} onOpenChange={(o) => !o && !pending && setEntregando(null)}>
        <DialogContent className="sm:max-w-lg">
          {aEntregar ? (
            <Entregar
              v={aEntregar}
              pending={pending}
              onEntregar={(url) => correr("Exportando de Canva…", () => entregarVideo(aEntregar.id, url), () => setEntregando(null))}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Columna({
  columna,
  videos,
  arrastrando,
  onArrastrar,
  onSoltar,
  onAbrir,
}: {
  columna: (typeof COLUMNAS)[number]
  videos: VideoVista[]
  arrastrando: VideoVista | null
  onArrastrar: (v: VideoVista | null) => void
  onSoltar: (v: VideoVista) => void
  onAbrir: (v: VideoVista) => void
}) {
  const [encima, setEncima] = React.useState(false)
  const admite = arrastrando ? acepta(arrastrando.status, columna.id) : false
  return (
    <div
      className="flex w-72 shrink-0 flex-col gap-2"
      onDragOver={(e) => {
        if (!admite) return
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        setEncima(false)
        if (!admite || !arrastrando) return
        e.preventDefault()
        onSoltar(arrastrando)
      }}
    >
      <div className="px-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-medium">{columna.titulo}</h3>
          <span className="text-muted-foreground text-xs tabular-nums">{videos.length}</span>
        </div>
        <p className="text-muted-foreground text-[11px]">{columna.pista}</p>
      </div>
      <div
        className={`flex min-h-24 flex-col gap-2 rounded-lg transition-colors ${
          admite ? (encima ? "ring-primary bg-accent/40 ring-2" : "ring-primary/30 ring-1 ring-dashed") : ""
        }`}
      >
        {videos.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs">
            {admite ? `Soltar en ${columna.titulo}` : "Nada por aquí"}
          </p>
        ) : (
          videos.map((v) => <Tarjeta key={v.id} v={v} onAbrir={() => onAbrir(v)} onArrastrar={onArrastrar} />)
        )}
      </div>
    </div>
  )
}

function Tarjeta({ v, onAbrir, onArrastrar }: { v: VideoVista; onAbrir: () => void; onArrastrar: (v: VideoVista | null) => void }) {
  const arrastrable = v.status === "escenas" || v.status === "clips"
  return (
    <button
      type="button"
      onClick={onAbrir}
      draggable={arrastrable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", v.id)
        e.dataTransfer.effectAllowed = "move"
        onArrastrar(v)
      }}
      onDragEnd={() => onArrastrar(null)}
      className="hover:bg-accent/50 flex flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors"
    >
      <p className="line-clamp-3 text-sm leading-snug font-medium">{v.idea}</p>
      <div className="flex flex-wrap gap-1.5">
        {v.capas?.intencion ? <Badge variant="outline" className="font-normal">{v.capas.intencion.name}</Badge> : null}
        {v.capas?.narrativa ? <Badge variant="outline" className="font-normal">{v.capas.narrativa.name}</Badge> : null}
        {v.capas?.pilar ? <Badge variant="secondary" className="font-normal">{v.capas.pilar}</Badge> : null}
      </div>

      {v.publica ? (
        <p className="text-xs">
          <span className="text-muted-foreground">Publica </span>
          {v.publica}
          {v.entregarAntes && ["idea", "escenas", "clips"].includes(v.status) ? (
            <span className={`block ${v.atrasado ? "text-destructive" : "text-muted-foreground"}`}>
              {v.atrasado ? "Atrasado: " : ""}video listo antes de {v.entregarAntes}
            </span>
          ) : null}
        </p>
      ) : null}

      <EstadoTarjeta v={v} />
    </button>
  )
}

function EstadoTarjeta({ v }: { v: VideoVista }) {
  if (v.status === "idea")
    return v.error ? (
      <Badge variant="destructive" title={v.error}>Error en el guion</Badge>
    ) : (
      <Badge variant="secondary">Escribiendo guion…</Badge>
    )
  if (v.status === "escenas" && v.guion) return <span className="text-muted-foreground text-xs">{v.guion.escenas.length} escenas</span>
  if (v.status === "video") {
    if (v.exportStatus === "listo") return <Badge className="bg-emerald-600 text-white">Listo para publicar</Badge>
    if (v.exportStatus === "error") return <Badge variant="destructive" title={v.error ?? ""}>Error al exportar</Badge>
    return <Badge variant="secondary">Exportando de Canva…</Badge>
  }
  if (v.status === "publicado")
    return (
      <div className="flex flex-col gap-1">
        {v.publicaciones.map((p) => (
          <div key={p.red} className="flex items-center justify-between gap-2 text-xs">
            <span>{RED[p.red] ?? p.red}</span>
            <EstadoRed status={p.status} hora={p.hora} error={p.error} />
          </div>
        ))}
      </div>
    )
  return null
}

function EstadoRed({ status, hora, error }: { status: string; hora: string | null; error: string | null }) {
  if (status === "publicada") return <Badge className="bg-emerald-600 text-white">Publicada{hora ? ` · ${hora}` : ""}</Badge>
  if (status === "programada") return <Badge variant="secondary">Programada{hora ? ` · ${hora}` : ""}</Badge>
  if (status === "programando") return <Badge variant="outline">Programando…</Badge>
  return <Badge variant="destructive" title={error ?? ""}>Error</Badge>
}

function Copiar({ texto, etiqueta = "Copiar" }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = React.useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(texto)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1500)
      }}
    >
      {copiado ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      {copiado ? "Copiado" : etiqueta}
    </Button>
  )
}

function Detalle({
  v,
  pending,
  trabajando,
  onAccion,
  onEntregar,
}: {
  v: VideoVista
  pending: boolean
  trabajando: string | null
  onAccion: (etiqueta: string, fn: () => Promise<ResultadoVideo>, cerrar?: boolean) => void
  onEntregar: () => void
}) {
  const g = v.guion
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">{v.idea}</DialogTitle>
        <p className="text-muted-foreground text-sm">
          {[v.capas?.pilar, v.capas?.tema, v.capas?.subtema, v.capas?.intencion?.name, v.capas?.narrativa?.name].filter(Boolean).join(" · ")}
        </p>
        {v.publica ? (
          <p className="text-sm">
            Publica {v.publica}
            {v.entregarAntes && ["idea", "escenas", "clips"].includes(v.status) ? ` · el video debe estar en Video antes de ${v.entregarAntes}` : ""}
          </p>
        ) : null}
      </DialogHeader>

      {v.error ? <p className="text-destructive text-sm">{v.error}</p> : null}
      {trabajando ? <p className="text-muted-foreground text-sm">{trabajando}</p> : null}

      {v.status === "publicado" || v.publicaciones.length ? (
        <div className="flex flex-col gap-1.5 rounded-md border p-3">
          <p className="text-xs font-medium">Publicación</p>
          {v.publicaciones.map((p) => (
            <div key={p.red} className="flex items-center justify-between gap-2 text-sm">
              <span>{RED[p.red] ?? p.red}</span>
              <span className="flex items-center gap-2">
                {p.error && p.status === "error" ? <span className="text-destructive max-w-72 truncate text-xs" title={p.error}>{p.error}</span> : null}
                <EstadoRed status={p.status} hora={p.hora} error={p.error} />
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {v.canvaUrl || v.videoUrl ? (
        <div className="flex flex-col gap-2">
          {v.canvaUrl ? (
            <a href={v.canvaUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-sm underline">
              Abrir en Canva <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : null}
          {v.videoUrl ? <video src={v.videoUrl} controls className="max-h-96 w-auto self-start rounded-md border" /> : null}
        </div>
      ) : null}

      {g ? (
        <>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold">Escenas</p>
            {g.escenas.map((e) => (
              <div key={e.n} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Escena {e.n} · {e.titulo}
                    {e.duracion ? <span className="text-muted-foreground font-normal"> · {e.duracion} s</span> : null}
                  </p>
                  <Copiar texto={e.texto} />
                </div>
                <pre className="bg-muted max-h-64 overflow-auto rounded p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{e.texto}</pre>
              </div>
            ))}
          </div>

          {g.narracion ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Narración completa</p>
                <Copiar texto={g.narracion} />
              </div>
              <p className="text-sm leading-relaxed">{g.narracion}</p>
            </div>
          ) : null}

          {g.descripcion ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Descripción del post</p>
                <Copiar texto={g.descripcion} />
              </div>
              <pre className="bg-muted rounded p-2 text-xs leading-relaxed whitespace-pre-wrap">{g.descripcion}</pre>
            </div>
          ) : null}

          {g.supuestos.length ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">Supuestos para revisar</p>
              <ul className="text-muted-foreground list-disc pl-5 text-sm">
                {g.supuestos.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      <DialogFooter className="flex-wrap gap-2 sm:justify-between">
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={pending}
          onClick={() => {
            if (window.confirm("¿Descartar este video? Si no se publicó, su idea vuelve al banco de ideas.")) onAccion("Descartando…", () => descartarVideo(v.id), true)
          }}
        >
          Descartar
        </Button>
        <div className="flex flex-wrap gap-2">
          {v.status === "idea" || v.status === "escenas" ? (
            <Button variant="outline" disabled={pending} onClick={() => onAccion("Escribiendo guion (≈1 min)…", () => reescribirGuion(v.id))}>
              {v.status === "idea" ? "Reintentar guion" : "Reescribir guion"}
            </Button>
          ) : null}
          {v.status === "escenas" ? (
            <Button variant="outline" disabled={pending} onClick={() => onAccion("Moviendo…", () => moverVideo(v.id, "clips"))}>
              Pasar a Clips
            </Button>
          ) : null}
          {v.status === "clips" ? (
            <Button variant="outline" disabled={pending} onClick={() => onAccion("Moviendo…", () => moverVideo(v.id, "escenas"))}>
              Volver a Escenas
            </Button>
          ) : null}
          {v.status === "escenas" || v.status === "clips" || v.status === "video" ? (
            <Button variant={v.status === "video" ? "outline" : "default"} disabled={pending} onClick={onEntregar}>
              {v.status === "video" ? "Cambiar enlace de Canva" : "Entregar video"}
            </Button>
          ) : null}
          {v.status === "video" && v.exportStatus === "error" ? (
            <Button variant="outline" disabled={pending} onClick={() => onAccion("Exportando de Canva…", () => reintentarExportacion(v.id))}>
              Reintentar exportación
            </Button>
          ) : null}
          {v.status === "video" || v.publicaciones.some((p) => p.status === "error") ? (
            <Button disabled={pending} onClick={() => onAccion("Publicando…", () => publicarVideoAhora(v.id))}>
              Publicar ahora
            </Button>
          ) : null}
        </div>
      </DialogFooter>
    </div>
  )
}

function Entregar({ v, pending, onEntregar }: { v: VideoVista; pending: boolean; onEntregar: (url: string) => void }) {
  const [url, setUrl] = React.useState(v.canvaUrl ?? "")
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Entregar el video</DialogTitle>
        <p className="text-muted-foreground text-sm">
          Pega el enlace del video terminado en Canva (con los clips pegados, recortados y con subtítulos). El sistema lo
          exporta en MP4 vertical y lo publica {v.publica ? `a su hora (${v.publica})` : "cuando pulses Publicar ahora"}.
        </p>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="canva-url">Enlace de Canva</Label>
        <Input
          id="canva-url"
          value={url}
          disabled={pending}
          placeholder="https://www.canva.com/design/DAG…/edit"
          onChange={(e) => setUrl(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          El diseño tiene que estar en la cuenta de Canva conectada al sistema, o compartido con ella.
        </p>
      </div>
      <DialogFooter>
        <Button disabled={pending || !url.trim()} onClick={() => onEntregar(url)}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {pending ? "Exportando de Canva (1-2 min)…" : "Entregar y exportar"}
        </Button>
      </DialogFooter>
    </div>
  )
}
