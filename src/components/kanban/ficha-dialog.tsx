"use client"

import * as React from "react"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  SendIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"

import {
  approvePiece,
  contenidoDeNoticia,
  encolarContenido,
  generateFromAngle,
  publishPieceNow,
  regenerateCarousel,
  rechazarFicha,
} from "@/app/estudio/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Ficha, PiezaDelTablero } from "@/lib/kanban-data"
import { formatDateTime } from "@/lib/format"

/**
 * La ficha de un hecho, con una pestaña por etapa.
 *
 * Abre en la etapa donde el hecho esta ahora, que es lo que uno quiere ver al
 * hacer clic; las anteriores quedan al lado para consultar de donde salio.
 */

const NOMBRE_RED: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
}

const REDES = ["linkedin", "instagram", "facebook"] as const

/** Cada panel scrollea por su cuenta para que la ventana no crezca sin fin. */
const PANEL = "min-h-0 flex-1 overflow-y-auto pr-1"

/** La pestaña que toca abrir: la etapa mas avanzada que alcanzo el hecho. */
function pestanaInicial(f: Ficha): string {
  if (f.piezas.length > 0) {
    const publicada = f.piezas.find((p) => p.status === "published")
    return `pieza:${(publicada ?? f.piezas[0]).id}`
  }
  if (f.angulo) return "angulo"
  if (f.analizada) return "analisis"
  return "noticia"
}

/**
 * Corre una accion del servidor y deja el boton a la espera mientras tanto.
 *
 * El try/catch no es por elegancia: las acciones devuelven sus fallos como
 * `{ ok: false }`, pero una que no llega a responder —se corto por tiempo, se
 * cayo la red— rechaza la promesa, y sin recogerla la transicion no termina
 * nunca: los botones se quedan deshabilitados para siempre y sin un solo
 * mensaje. Parecia que la accion se hubiera tragado el clic.
 */
function useAccion() {
  const [pending, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const correr = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      try {
        const r = await fn()
        if (!r.ok) setError(r.error ?? "Algo fallo.")
      } catch (e) {
        setError(
          e instanceof Error && e.message
            ? `No se pudo completar: ${e.message}`
            : "No se pudo completar: la accion no respondio. Puede haber tardado de mas."
        )
      }
    })
  return { pending, error, correr }
}

export function FichaDialog({
  ficha,
  abierta,
  onOpenChange,
}: {
  ficha: Ficha | null
  abierta: boolean
  onOpenChange: (v: boolean) => void
}) {
  if (!ficha) return null

  const redesHechas = new Set(ficha.piezas.map((p) => p.network))

  return (
    <Dialog open={abierta} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">{ficha.titulo}</DialogTitle>
          <DialogDescription>
            {ficha.niche} · {ficha.tema}
            {ficha.fuente ? ` · ${ficha.fuente}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* `key` por ficha: al abrir otra, las pestañas se remontan y vuelven a
            su etapa actual sin tener que sincronizar estado a mano. */}
        <Tabs
          key={ficha.newsId}
          defaultValue={pestanaInicial(ficha)}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <TabsList className="h-auto shrink-0 flex-wrap">
            <TabsTrigger value="noticia">Noticia</TabsTrigger>
            {ficha.analizada ? <TabsTrigger value="analisis">Analisis</TabsTrigger> : null}
            {ficha.angulo ? <TabsTrigger value="angulo">Angulo</TabsTrigger> : null}
            {ficha.piezas.map((p) => (
              <TabsTrigger key={p.id} value={`pieza:${p.id}`}>
                {NOMBRE_RED[p.network] ?? p.network}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="noticia" className={PANEL}>
            <PanelNoticia ficha={ficha} />
          </TabsContent>

          {ficha.analizada ? (
            <TabsContent value="analisis" className={PANEL}>
              <PanelAnalisis ficha={ficha} />
            </TabsContent>
          ) : null}

          {ficha.angulo ? (
            <TabsContent value="angulo" className={PANEL}>
              <PanelAngulo ficha={ficha} redesHechas={redesHechas} />
            </TabsContent>
          ) : null}

          {ficha.piezas.map((p) => (
            <TabsContent key={p.id} value={`pieza:${p.id}`} className={PANEL}>
              <PanelPieza pieza={p} newsId={ficha.newsId} />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------------- noticia

function PanelNoticia({ ficha }: { ficha: Ficha }) {
  const { pending, error, correr } = useAccion()
  // Generar solo tiene sentido mientras no haya nada generado: con el angulo ya
  // hecho, lo que se quiere es regenerar la pieza, que es otra cosa.
  const yaArranco = ficha.angulo !== null || ficha.piezas.length > 0

  return (
    <div className="flex flex-col gap-3 text-sm">
      <Campo etiqueta="Traida">{formatDateTime(ficha.creada)}</Campo>
      {ficha.fechaSerper ? <Campo etiqueta="Publicada">{ficha.fechaSerper}</Campo> : null}
      <Campo etiqueta="Snippet">{ficha.snippet ?? "(sin snippet)"}</Campo>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button
          size="sm"
          variant="outline"
          render={<a href={ficha.link} target="_blank" rel="noreferrer" />}
        >
          <ExternalLinkIcon />
          Ver la fuente
        </Button>
        {!yaArranco ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => correr(() => encolarContenido(ficha.newsId))}
          >
            <SparklesIcon />
            {pending ? "Generando…" : "Generar contenido"}
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">
            Ya paso a contenido: esta en las pestañas de la derecha.
          </span>
        )}
        {error ? <span className="text-destructive text-xs">{error}</span> : null}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ analisis

function PanelAnalisis({ ficha }: { ficha: Ficha }) {
  // El texto consolidado se pide al abrir: no viaja con el tablero porque son
  // miles de caracteres por noticia y solo se leen de uno en uno.
  const [contenido, setContenido] = React.useState<string | null>(null)
  const [cargando, setCargando] = React.useState(true)

  // Sin reiniciar estado aqui: el panel se remonta con cada ficha (las pestañas
  // llevan `key`), asi que arranca ya en "cargando" y solo escribe al responder.
  React.useEffect(() => {
    let vivo = true
    contenidoDeNoticia(ficha.newsId).then((r) => {
      if (!vivo) return
      setContenido(r.ok ? r.contenido : null)
      setCargando(false)
    })
    return () => {
      vivo = false
    }
  }, [ficha.newsId])

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={ficha.score !== null && ficha.score >= 8 ? "default" : "secondary"}>
          Score {ficha.score ?? "-"}/10
        </Badge>
        {ficha.estadoContenido ? <Badge variant="outline">{ficha.estadoContenido}</Badge> : null}
        {(ficha.keywords ?? []).map((k) => (
          <Badge key={k} variant="outline" className="font-normal">
            {k}
          </Badge>
        ))}
      </div>
      <Campo etiqueta="Notas del analisis">{ficha.notas ?? "(sin notas)"}</Campo>
      <Campo etiqueta="Contenido consolidado">
        <span className="whitespace-pre-wrap">
          {cargando ? "Cargando…" : (contenido ?? "(sin contenido)")}
        </span>
      </Campo>
    </div>
  )
}

// -------------------------------------------------------------------- angulo

function PanelAngulo({ ficha, redesHechas }: { ficha: Ficha; redesHechas: Set<string> }) {
  const { pending, error, correr } = useAccion()
  const a = ficha.angulo
  if (!a) return null

  return (
    <div className="flex flex-col gap-3 text-sm">
      {a.playbook_format ? <Badge variant="outline">{a.playbook_format}</Badge> : null}
      <Campo etiqueta="Angulo">{a.angle}</Campo>
      {a.thesis ? <Campo etiqueta="Tesis">{a.thesis}</Campo> : null}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {REDES.map((red) =>
          redesHechas.has(red) ? (
            <Badge key={red} variant="secondary">
              <CheckIcon className="size-3" />
              {NOMBRE_RED[red]} hecho
            </Badge>
          ) : (
            <Button
              key={red}
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => correr(() => generateFromAngle(a.id, red))}
            >
              <SparklesIcon />
              Generar {NOMBRE_RED[red]}
            </Button>
          )
        )}
        {error ? <span className="text-destructive text-xs">{error}</span> : null}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------- pieza

function PanelPieza({ pieza, newsId }: { pieza: PiezaDelTablero; newsId: string }) {
  const { pending, error, correr } = useAccion()
  const [copiado, setCopiado] = React.useState(false)

  const esCarrusel = pieza.network === "instagram"
  const publicada = pieza.status === "published"
  const rechazada = pieza.status === "rejected"
  // Las laminas del carrusel o, en Facebook, su imagen unica.
  const imagenes = esCarrusel
    ? (pieza.payload.images ?? [])
    : pieza.payload.image
      ? [pieza.payload.image]
      : []

  const texto = esCarrusel
    ? [pieza.payload.caption, (pieza.payload.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n")
    : [pieza.payload.hook, pieza.payload.body, (pieza.payload.hashtags ?? []).join(" ")]
        .filter(Boolean)
        .join("\n\n")

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={publicada ? "default" : rechazada ? "outline" : "secondary"}>
          {publicada
            ? "Publicada"
            : rechazada
              ? "Rechazada"
              : pieza.status === "approved"
                ? "Aprobada"
                : "Por revisar"}
        </Badge>
        {pieza.published_at ? (
          <span className="text-muted-foreground text-xs">{formatDateTime(pieza.published_at)}</span>
        ) : null}
        {pieza.network === "linkedin" && pieza.linkedin_urn ? (
          <a
            href={`https://www.linkedin.com/feed/update/${pieza.linkedin_urn}/`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground text-xs underline"
          >
            ver en LinkedIn
          </a>
        ) : null}
      </div>

      {pieza.publish_error ? <p className="text-destructive text-xs">{pieza.publish_error}</p> : null}

      {/* Con imagen, la pieza se lee como en el feed: la lamina grande a un lado
          y el texto al otro, en la misma ficha. Sin imagen, solo el texto. */}
      {imagenes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <VisorLaminas imagenes={imagenes} />
          <p className="leading-relaxed whitespace-pre-wrap">{texto || "(sin texto)"}</p>
        </div>
      ) : (
        <p className="leading-relaxed whitespace-pre-wrap">{texto || "(sin texto)"}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {!publicada && !rechazada ? (
          <Button size="sm" disabled={pending} onClick={() => correr(() => approvePiece(pieza.id))}>
            <CheckIcon />
            Aprobar
          </Button>
        ) : null}

        {esCarrusel ? (
          <>
            <Button
              size="sm"
              variant="outline"
              render={<a href={`/api/content/carousel?piece=${pieza.id}`} download />}
            >
              <DownloadIcon />
              Descargar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || publicada}
              title="Vuelve a dibujar y subir las imagenes desde el guion original"
              onClick={() => correr(() => regenerateCarousel(pieza.id))}
            >
              <RefreshCwIcon />
              Regenerar
            </Button>
          </>
        ) : null}

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(texto)
            setCopiado(true)
            window.setTimeout(() => setCopiado(false), 2000)
          }}
        >
          <CopyIcon />
          {copiado ? "Copiado" : "Copiar"}
        </Button>

        {!publicada ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => correr(() => publishPieceNow(pieza.id))}
            >
              <SendIcon />
              Publicar
            </Button>
            {/* Rechazar aparta el hecho entero, no solo esta pieza: dejar viva
                la de la otra red mantenia la tarjeta en "Post", que es lo
                contrario de lo que se pide al pulsar aqui. El motivo decide a
                que columna de descartados va, y "repetida" es ademas con lo que
                se revisa si el agrupador de hechos acierta. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size="sm" variant="ghost" disabled={pending || rechazada} />}
              >
                <XIcon />
                Rechazar
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {/* La etiqueta de Base UI solo existe dentro de un grupo: suelta,
                    el menu lanzaba "MenuGroupContext is missing" al abrirse. */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Motivo del descarte</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => correr(() => rechazarFicha(newsId, "repetida"))}>
                    Repetida
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => correr(() => rechazarFicha(newsId, "fecha"))}>
                    Por fecha
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => correr(() => rechazarFicha(newsId, "otra"))}>
                    Otra razon
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}

        {error ? <span className="text-destructive text-xs">{error}</span> : null}
      </div>
    </div>
  )
}

/**
 * El carrusel dentro de la ficha, una lamina a la vez y a buen tamaño.
 *
 * Las miniaturas en fila daban el ritmo del carrusel pero no se leian. Aqui se
 * ve cada lamina grande y se pasa de una a otra con las flechas (las de la
 * pantalla o, con el visor enfocado, las del teclado). Las miniaturas quedan
 * debajo para saltar directo a una.
 */
function VisorLaminas({ imagenes }: { imagenes: string[] }) {
  const [actual, setActual] = React.useState(0)
  const total = imagenes.length
  // Si se regenera el carrusel con menos laminas, no quedarse fuera del rango.
  const i = Math.min(actual, total - 1)
  const anterior = () => setActual(Math.max(0, i - 1))
  const siguiente = () => setActual(Math.min(total - 1, i + 1))

  return (
    <div
      className="flex flex-col gap-2 outline-none"
      tabIndex={0}
      aria-label="Laminas de la pieza"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") anterior()
        if (e.key === "ArrowRight") siguiente()
      }}
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenes[i]}
          alt={`Lamina ${i + 1}`}
          className="bg-muted w-full rounded-md border object-contain"
        />
        {total > 1 ? (
          <>
            <Button
              size="icon-sm"
              variant="secondary"
              className="absolute top-1/2 left-2 -translate-y-1/2 opacity-90"
              disabled={i === 0}
              onClick={anterior}
            >
              <ChevronLeftIcon />
              <span className="sr-only">Anterior</span>
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              className="absolute top-1/2 right-2 -translate-y-1/2 opacity-90"
              disabled={i === total - 1}
              onClick={siguiente}
            >
              <ChevronRightIcon />
              <span className="sr-only">Siguiente</span>
            </Button>
            <span className="bg-background/80 absolute right-2 bottom-2 rounded px-1.5 py-0.5 text-xs tabular-nums">
              {i + 1} / {total}
            </span>
          </>
        ) : null}
      </div>

      {total > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {imagenes.map((src, n) => (
            <button
              key={src}
              type="button"
              onClick={() => setActual(n)}
              className={`shrink-0 rounded transition-opacity ${n === i ? "ring-primary ring-2" : "opacity-60 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Ir a la lamina ${n + 1}`} className="h-14 w-11 rounded object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{etiqueta}</p>
      <div className="mt-0.5 leading-relaxed">{children}</div>
    </div>
  )
}
