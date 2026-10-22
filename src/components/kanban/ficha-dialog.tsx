"use client"

import * as React from "react"
import {
  BookmarkPlusIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react"

import {
  approvePiece,
  contenidoDeNoticia,
  corregirPiezaConIA,
  encolarContenido,
  generateFromAngle,
  publishPieceNow,
  regenerateCarousel,
  rechazarFicha,
  revisarPiezaDeNuevo,
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
import { RecetaDelPrompt } from "@/components/agentes/simulador-prompt"
import { Textarea } from "@/components/ui/textarea"
import { guardarPiezaComoEjemploMarca } from "@/app/marca/ejemplos-actions"
import { conPocoMaterial, nombreMaterial } from "@/engine/content/material"
import type { Hallazgo, Revision } from "@/engine/content/revisor"
import type { CriterioDecidido } from "@/engine/content/types"
import { NOMBRE_OBJETIVO, type Clasificacion } from "@/engine/marca/clasificacion"
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
  // Lo que salio bien pero conviene saber: "quedan dos cosas que frenan".
  const [aviso, setAviso] = React.useState<string | null>(null)
  const correr = (fn: () => Promise<{ ok: boolean; error?: string; warning?: string }>) =>
    start(async () => {
      setError(null)
      setAviso(null)
      try {
        const r = await fn()
        if (!r.ok) setError(r.error ?? "Algo fallo.")
        else if (r.warning) setAviso(r.warning)
      } catch (e) {
        setError(
          e instanceof Error && e.message
            ? `No se pudo completar: ${e.message}`
            : "No se pudo completar: la accion no respondio. Puede haber tardado de mas."
        )
      }
    })
  return { pending, error, aviso, correr }
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
  const { pending, error, aviso, correr } = useAccion()
  // Generar solo tiene sentido mientras no haya nada generado: con el angulo ya
  // hecho, lo que se quiere es regenerar la pieza, que es otra cosa.
  const yaArranco = ficha.angulo !== null || ficha.piezas.length > 0
  // No se bloquea: quien la elige a mano puede saber algo que el texto no dice.
  // Pero tiene que saber que el agente va a escribir con muy poco.
  const pocoMaterial = !yaArranco && conPocoMaterial(ficha.estadoContenido)

  return (
    <div className="flex flex-col gap-3 text-sm">
      <Campo etiqueta="Traida">{formatDateTime(ficha.creada)}</Campo>
      {ficha.fechaSerper ? <Campo etiqueta="Publicada">{ficha.fechaSerper}</Campo> : null}
      <Campo etiqueta="Snippet">{ficha.snippet ?? "(sin snippet)"}</Campo>

      {pocoMaterial ? (
        <p className="rounded-md border border-amber-400 bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <strong>{nombreMaterial(ficha.estadoContenido)}.</strong> Los agentes solo tendrían el titular y un resumen
          corto, y para llenar las láminas tienden a inventar. En automático no pasa sola; el motivo está en la
          pestaña Análisis.
        </p>
      ) : null}

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
            variant={pocoMaterial ? "outline" : "default"}
            disabled={pending}
            onClick={() => correr(() => encolarContenido(ficha.newsId))}
          >
            <SparklesIcon />
            {pending
              ? ficha.analizada
                ? "Generando…"
                : "Analizando y generando…"
              : pocoMaterial
                ? "Generar igual"
                : ficha.analizada
                  ? "Generar contenido"
                  : "Analizar y generar"}
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">
            Ya paso a contenido: esta en las pestañas de la derecha.
          </span>
        )}
        {error ? <span className="text-destructive text-xs">{error}</span> : null}
        {aviso ? <span className="text-xs text-amber-700 dark:text-amber-400">{aviso}</span> : null}
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
        {ficha.estadoContenido ? (
          <Badge
            variant="outline"
            className={conPocoMaterial(ficha.estadoContenido) ? "border-amber-400 text-amber-700 dark:text-amber-400" : undefined}
          >
            {nombreMaterial(ficha.estadoContenido)}
          </Badge>
        ) : null}
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

/**
 * De que pilar es, para quien, que busca y que CTA pide: lo decidio el agente
 * de angulo con las listas de la marca. Los angulos anteriores no lo traen.
 */
function EtiquetasClasificacion({ c }: { c: Clasificacion | null }) {
  if (!c) return null
  const etiquetas = [
    c.pilar ? { k: "Pilar", v: c.pilar_secundario ? `${c.pilar.nombre} · ${c.pilar_secundario.nombre}` : c.pilar.nombre } : null,
    c.audiencia ? { k: "Audiencia", v: c.audiencia.nombre } : null,
    c.vertical ? { k: "Vertical", v: c.vertical.nombre } : null,
    c.objetivo ? { k: "Objetivo", v: NOMBRE_OBJETIVO[c.objetivo] } : null,
    c.cta ? { k: "CTA", v: c.cta.nombre } : null,
  ].filter((e): e is { k: string; v: string } => e !== null)
  if (etiquetas.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {etiquetas.map((e) => (
        <Badge key={e.k} variant="secondary" className="font-normal">
          <span className="text-muted-foreground">{e.k}:</span> {e.v}
        </Badge>
      ))}
    </div>
  )
}

/**
 * El criterio de la marca que decidio el agente de criterio antes de escribir,
 * y lo que la noticia ya decia, que no podia presentarse como criterio.
 */
function CriterioDelAngulo({ c, escrito }: { c: CriterioDecidido | null; escrito: boolean }) {
  if (!c) {
    return (
      <p className="text-muted-foreground text-xs">
        {escrito
          ? "Las piezas de este ángulo se escribieron sin un criterio decidido antes: revisa a mano que el criterio no salga de la fuente."
          : "El criterio de la marca se decide al escribir la primera pieza de este ángulo."}
      </p>
    )
  }
  return (
    <Campo etiqueta="Criterio de la marca">
      {c.acciones.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4">
          {c.acciones.map((accion) => (
            <li key={accion}>{accion}</li>
          ))}
        </ul>
      ) : (
        <p>La noticia no daba para un criterio propio de la marca.</p>
      )}
      {c.ya_dice_el_material.length > 0 ? (
        <details className="mt-1.5">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            Lo que ya decía la noticia ({c.ya_dice_el_material.length}): no cuenta como criterio
          </summary>
          <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-4 text-xs">
            {c.ya_dice_el_material.map((x, i) => (
              <li key={i}>
                <span className="font-medium">{x.quien}:</span> {x.dice}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Campo>
  )
}

function PanelAngulo({ ficha, redesHechas }: { ficha: Ficha; redesHechas: Set<string> }) {
  const { pending, error, correr } = useAccion()
  const a = ficha.angulo
  if (!a) return null

  return (
    <div className="flex flex-col gap-3 text-sm">
      {a.playbook_format ? <Badge variant="outline">{a.playbook_format}</Badge> : null}
      <EtiquetasClasificacion c={a.clasificacion} />
      <Campo etiqueta="Angulo">{a.angle}</Campo>
      {a.thesis ? <Campo etiqueta="Tesis">{a.thesis}</Campo> : null}
      <CriterioDelAngulo c={a.criterio ?? null} escrito={redesHechas.size > 0} />

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
  const { pending, error, aviso, correr } = useAccion()
  const [copiado, setCopiado] = React.useState(false)

  const esCarrusel = pieza.network === "instagram"
  const publicada = pieza.status === "published"
  const rechazada = pieza.status === "rejected"
  // Frenada y sin aprobar: no sale sola. Aprobarla o publicarla es decir "sale igual".
  const frenada = Boolean(pieza.revision?.frena) && pieza.status !== "approved"
  const conHallazgos = (pieza.revision?.hallazgos.length ?? 0) > 0
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

      {!publicada ? <PanelRevision revision={pieza.revision} aprobada={pieza.status === "approved"} /> : null}

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

      {/* Lo que el agente planeo antes de escribir cada lamina. No se publica:
          sirve para ver de donde sale cada afirmacion. */}
      {esCarrusel && pieza.payload.plan?.length ? (
        <details className="rounded-lg border p-3 text-xs">
          <summary className="cursor-pointer font-medium">Plan de láminas</summary>
          <ol className="mt-2 flex flex-col gap-1.5">
            {pieza.payload.plan.map((p) => (
              <li key={p.n} className="leading-relaxed">
                <span className="font-medium">
                  {p.n} · {p.funcion || "sin función"}
                </span>
                {p.aporta ? <span className="text-muted-foreground"> · aporta: {p.aporta}</span> : null}
                {p.fuente ? <span className="text-muted-foreground"> · fuente: {p.fuente}</span> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {/* De donde salieron las fotos: las de la biblioteca de la marca, con el
          motivo del agente; las demas laminas con foto vienen de Pexels. Para
          otras fotos, "Regenerar imagenes": las que tiene no vuelven a salir. */}
      {esCarrusel && (pieza.payload.fotosBiblioteca?.length || pieza.payload.terminosFoto?.length) ? (
        <details className="rounded-lg border p-3 text-xs">
          <summary className="cursor-pointer font-medium">
            Fotos{" "}
            {pieza.payload.fotosBiblioteca?.length
              ? `· ${pieza.payload.fotosBiblioteca.length} de la biblioteca`
              : "· de Pexels"}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {(pieza.payload.fotosBiblioteca ?? []).map((f) => (
              <li key={f.lamina} className="leading-relaxed">
                <span className="font-medium">Lámina {f.lamina}</span>
                {f.motivo ? <span className="text-muted-foreground"> · {f.motivo}</span> : null}
              </li>
            ))}
            {pieza.payload.terminosFoto?.length ? (
              <li className="text-muted-foreground leading-relaxed">
                Búsquedas en Pexels para el resto: {pieza.payload.terminosFoto.join(", ")}
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}

      {/* Que entro en el prompt que la escribio y que no: sirve para saber de
          donde sale un fallo que se repite. */}
      {pieza.receta ? (
        <details className="rounded-lg border p-3 text-xs">
          <summary className="cursor-pointer font-medium">Cómo se armó el prompt</summary>
          <div className="mt-2">
            <RecetaDelPrompt receta={pieza.receta} />
          </div>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {!publicada && !rechazada && pieza.status !== "approved" ? (
          <Button
            size="sm"
            variant={frenada ? "outline" : "default"}
            disabled={pending}
            title={frenada ? "La pieza tiene cosas que frenan. Aprobarla es decir que sale igual." : undefined}
            onClick={() => correr(() => approvePiece(pieza.id))}
          >
            <CheckIcon />
            {frenada ? "Aprobar igual" : "Aprobar"}
          </Button>
        ) : null}

        {!publicada && conHallazgos ? (
          <Button
            size="sm"
            variant={frenada ? "default" : "outline"}
            disabled={pending}
            title="Manda la pieza al agente con lo que encontró el revisor. Gasta una llamada a Claude."
            onClick={() => correr(() => corregirPiezaConIA(pieza.id))}
          >
            <WandSparklesIcon />
            Corregir
          </Button>
        ) : null}

        {!publicada ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            title="Vuelve a pasar los dos revisores con las reglas de tu marca de ahora. El de Claude lee la pieza otra vez: gasta una llamada."
            onClick={() => correr(() => revisarPiezaDeNuevo(pieza.id))}
          >
            <ShieldCheckIcon />
            Revisar
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
              {frenada ? "Publicar igual" : "Publicar"}
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
        {aviso ? <span className="text-xs text-amber-700 dark:text-amber-400">{aviso}</span> : null}
      </div>

      {(pieza.network === "instagram" || pieza.network === "linkedin") && !rechazada ? (
        <GuardarComoEjemplo pieceId={pieza.id} />
      ) : null}
    </div>
  )
}

/**
 * Una pieza que salio bien pasa a ser ejemplo de la marca. Se pide el porque:
 * es lo que el agente tiene que aprender de ella, y sin el la copia.
 */
function GuardarComoEjemplo({ pieceId }: { pieceId: string }) {
  const [abierto, setAbierto] = React.useState(false)
  const [porQue, setPorQue] = React.useState("")
  const [estado, setEstado] = React.useState<{ ok: boolean; texto: string } | null>(null)
  const [pending, startTransition] = React.useTransition()

  if (!abierto) {
    return (
      <div>
        <Button size="sm" variant="ghost" onClick={() => setAbierto(true)}>
          <BookmarkPlusIcon />
          Guardar como ejemplo
        </Button>
        {estado?.ok ? <span className="text-xs text-emerald-700 dark:text-emerald-400">{estado.texto}</span> : null}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <label htmlFor={`porque-${pieceId}`} className="text-xs font-medium">
        Por qué es buena
      </label>
      <Textarea
        id={`porque-${pieceId}`}
        rows={3}
        maxLength={600}
        value={porQue}
        placeholder="Lo que el agente tiene que aprender de ella: la lámina de criterio, cómo cita las fuentes, el tono del cierre…"
        onChange={(e) => setPorQue(e.target.value)}
        className="text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending || !porQue.trim()}
          onClick={() =>
            startTransition(async () => {
              const r = await guardarPiezaComoEjemploMarca(pieceId, porQue)
              if (r.ok) {
                setEstado({ ok: true, texto: "Guardada en Marca › Ejemplos." })
                setAbierto(false)
                setPorQue("")
              } else setEstado({ ok: false, texto: r.error })
            })
          }
        >
          {pending ? "Guardando…" : "Guardar ejemplo"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
        {estado && !estado.ok ? <span className="text-destructive text-xs">{estado.texto}</span> : null}
      </div>
    </div>
  )
}

/** Si el revisor con Claude leyo esta version, con que modelo, o por que no pudo. */
function LineaClaude({ revision }: { revision: Revision }) {
  const c = revision.claude
  if (!c) return null
  if (c.estado === "fallo") {
    return (
      <p className="text-red-700 dark:text-red-400">
        El revisor con Claude no pudo leer esta versión{c.error ? ` (${c.error})` : ""}. No sale sola: pulsa «Revisar» o apruébala tú.
      </p>
    )
  }
  return <p className="text-muted-foreground">La leyó también el revisor con Claude ({c.modelo}).</p>
}

/**
 * Lo que encontraron los revisores, el de codigo y el de Claude, con donde
 * esta, que pasa y que hacer. Es el mismo texto que se le manda al agente al
 * corregir.
 */
function PanelRevision({ revision, aprobada }: { revision: Revision | null; aprobada: boolean }) {
  if (!revision) {
    return (
      <p className="text-muted-foreground text-xs">
        Esta pieza es de antes del revisor automático. Pulsa «Revisar» para pasarla.
      </p>
    )
  }

  const frenos = revision.hallazgos.filter((h) => h.nivel === "frena")
  const avisos = revision.hallazgos.filter((h) => h.nivel === "aviso")
  const ultima = revision.correcciones.at(-1)

  if (revision.hallazgos.length === 0 && revision.arreglos.length === 0 && !ultima && revision.claude?.estado !== "fallo") {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        {revision.claude ? "Ni el revisor automático ni el de Claude encontraron nada." : "El revisor automático no encontró nada."}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border p-3 text-xs">
      <LineaClaude revision={revision} />
      {frenos.length > 0 ? (
        <ListaHallazgos
          titulo={aprobada ? "Frenaba la publicación (la aprobaste igual)" : "Frena la publicación"}
          clase="text-red-700 dark:text-red-400"
          hallazgos={frenos}
        />
      ) : null}
      {avisos.length > 0 ? (
        <ListaHallazgos titulo="Avisos" clase="text-amber-700 dark:text-amber-400" hallazgos={avisos} />
      ) : null}

      {revision.arreglos.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground font-medium">Se arregló solo</p>
          <ul className="text-muted-foreground flex flex-col gap-0.5">
            {revision.arreglos.map((a, i) => (
              <li key={i}>
                {a.donde}: {a.detalle}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ultima ? (
        <p className="text-muted-foreground border-t pt-2">
          {ultima.origen === "automatica" ? "Se mandó sola al agente a corregir" : "La mandaste a corregir"}{" "}
          {ultima.pedido.length === 1 ? "1 cosa" : `${ultima.pedido.length} cosas`} ({formatDateTime(ultima.fecha)}).{" "}
          {ultima.frenosDespues === 0
            ? "Quedó sin nada que frene."
            : `Quedan ${ultima.frenosDespues === 1 ? "1 cosa que frena" : `${ultima.frenosDespues} cosas que frenan`}.`}
        </p>
      ) : null}
    </div>
  )
}

function ListaHallazgos({ titulo, clase, hallazgos }: { titulo: string; clase: string; hallazgos: Hallazgo[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className={`font-medium ${clase}`}>{titulo}</p>
      <ul className="flex flex-col gap-1.5">
        {hallazgos.map((h, i) => (
          <li key={i} className="leading-relaxed">
            {h.por === "claude" ? (
              <Badge variant="outline" className="mr-1 px-1.5 py-0 align-middle text-[10px] font-normal">
                Revisor (Claude)
              </Badge>
            ) : null}
            <span className="font-medium">{h.donde}:</span> {h.detalle}{" "}
            <span className="text-muted-foreground">Qué hacer: {h.pide}</span>
          </li>
        ))}
      </ul>
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
