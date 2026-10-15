"use client"

import * as React from "react"

import { ejecutarAgente } from "@/app/agentes/actions"
import { moverFicha, type DestinoTablero } from "@/app/estudio/actions"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FichaDialog } from "@/components/kanban/ficha-dialog"
import type { Etapa, Ficha, ModoDeEtapa, Tablero as TableroDatos } from "@/lib/kanban-data"
import { PlayIcon } from "lucide-react"

/**
 * El tablero del pipeline.
 *
 * Cuatro fases y, dentro, las etapas por las que pasa el hecho. Se agrupa asi
 * porque "noticia traida" y "noticia analizada" son momentos distintos del
 * mismo trabajo, y verlos como dos columnas sueltas perdia esa relacion.
 *
 * Una tarjeta por hecho, no por pieza: un hecho produce un angulo y de ahi
 * varios posts, y todo eso es la misma historia. La tarjeta se mueve sola.
 *
 * Arrastrar una tarjeta no la reetiqueta: la etapa se deduce de lo que existe
 * —hay angulo, hay pieza, esta publicada— asi que soltarla mas adelante solo
 * puede significar hacer el trabajo que falta. Por eso el arrastre dispara el
 * pipeline y por eso solo admite la etapa siguiente.
 */

type Grupo = { titulo: string; etapas: { id: Etapa; titulo: string; pista: string }[] }

const NOMBRE_RED_COLUMNA: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
}

/**
 * Las columnas, con Post abierto en una por red activa.
 *
 * Post era una columna sola y una tarjeta por hecho, pero un hecho produce un
 * post por red y cada uno se revisa y se aprueba por separado: verlos apilados
 * en la misma tarjeta obligaba a abrirla para saber que habia de que. Solo
 * salen las redes con agente en servicio y canal conectado.
 */
function gruposCon(redes: string[]): Grupo[] {
  return GRUPOS_BASE.map((g) =>
    g.titulo !== "Contenido"
      ? g
      : {
          ...g,
          etapas: [
            g.etapas[0],
            ...redes.map((red) => ({
              id: `post_${red}` as Etapa,
              titulo: NOMBRE_RED_COLUMNA[red] ?? red,
              pista: "Piezas generadas",
            })),
          ],
        }
  )
}

const GRUPOS_BASE: Grupo[] = [
  {
    titulo: "Noticias",
    etapas: [
      { id: "sin_analizar", titulo: "Traidas", pista: "Recien llegadas, en cola" },
      { id: "analizada", titulo: "Analizadas", pista: "Con score y notas" },
    ],
  },
  {
    titulo: "Contenido",
    etapas: [
      { id: "angulo", titulo: "Angulo", pista: "Enfoque decidido" },
    ],
  },
  {
    titulo: "Publicado",
    etapas: [{ id: "publicado", titulo: "Publicado", pista: "Ya salio a las redes" }],
  },
  {
    titulo: "Descartados",
    etapas: [
      { id: "descartado", titulo: "A mano", pista: "Rechazados por ti" },
      { id: "descartado_fecha", titulo: "Por fecha", pista: "Ya eran viejas al llegar" },
      { id: "repetida", titulo: "Repetidas", pista: "Ese hecho ya lo conto otra" },
      { id: "vetada", titulo: "Vetadas", pista: "Tema que no cubrimos" },
    ],
  },
]

const NOMBRE_RED: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
}

/**
 * El orden del recorrido, para saber que es "avanzar".
 *
 * Lo descartado queda fuera: no es un punto del camino sino una salida, y se
 * puede llegar desde cualquier sitio.
 */
const ORDEN: Partial<Record<Etapa, number>> = {
  sin_analizar: 0,
  analizada: 1,
  angulo: 2,
  post_linkedin: 3,
  post_instagram: 3,
  post_facebook: 3,
  publicado: 4,
}

/** Las etapas que aceptan tarjetas, y con que intencion. */
const DESTINOS: Partial<Record<Etapa, DestinoTablero>> = {
  analizada: "analizada",
  angulo: "angulo",
  post_linkedin: "post",
  post_instagram: "post",
  post_facebook: "post",
  publicado: "publicado",
  descartado: "descartado",
}

/**
 * Si una tarjeta puede soltarse ahi.
 *
 * Solo el paso siguiente: generar un post exige un angulo y publicar exige una
 * pieza, asi que un salto de dos etapas dejaria al usuario esperando algo que
 * no va a pasar. Descartar es la excepcion —se puede desde cualquier punto—
 * salvo con lo ya publicado, que no se puede retirar desde aqui.
 */
function admite(origen: Etapa, destino: Etapa): boolean {
  if (origen === destino) return false
  if (destino === "descartado") {
    return (
      origen !== "publicado" &&
      origen !== "descartado_fecha" &&
      origen !== "repetida" &&
      origen !== "vetada"
    )
  }

  const desde = ORDEN[origen]
  const hasta = ORDEN[destino]
  if (desde === undefined || hasta === undefined) return false
  return hasta === desde + 1
}

export function Tablero({ datos }: { datos: TableroDatos }) {
  // Se guarda cual esta abierta, no la ficha: si se guardara la ficha, la
  // ventana pintaria para siempre la copia del momento en que se abrio, y
  // regenerar un carrusel dejaria de verse aunque el servidor ya tuviera las
  // imagenes nuevas. Buscandola en `datos` cada vez, cualquier revalidacion
  // llega sola a la ventana abierta.
  const [abiertaId, setAbiertaId] = React.useState<string | null>(null)
  const [abierta, setAbierta] = React.useState(false)
  const [arrastrando, setArrastrando] = React.useState<Ficha | null>(null)
  const [moviendo, setMoviendo] = React.useState<string | null>(null)
  const [aviso, setAviso] = React.useState<{ tipo: "error" | "ok"; texto: string } | null>(null)

  // Con la que se abrio, de respaldo: al cambiar de etapa una ficha puede
  // quedarse fuera de las visibles de su columna, y es mejor seguir viendo lo
  // de antes que una ventana en blanco de golpe.
  const [respaldo, setRespaldo] = React.useState<Ficha | null>(null)

  const ficha = React.useMemo(() => {
    if (!abiertaId) return null
    for (const lista of Object.values(datos.fichas)) {
      const encontrada = lista.find((f) => `${f.newsId}:${f.red ?? ""}` === abiertaId)
      if (encontrada) return encontrada
    }
    return respaldo
  }, [abiertaId, datos, respaldo])

  function abrir(f: Ficha) {
    setRespaldo(f)
    setAbiertaId(`${f.newsId}:${f.red ?? ""}`)
    setAbierta(true)
  }

  async function soltar(f: Ficha, etapa: Etapa) {
    const destino = DESTINOS[etapa]
    if (!destino || !admite(f.etapa, etapa)) return

    // Publicar sale a las redes y no se deshace: es lo unico que se pregunta
    // antes, porque un arrastre por error no deberia aparecer en el feed.
    if (destino === "publicado") {
      const cuantas = f.piezas.filter((p) => p.status !== "published" && p.status !== "rejected").length
      const ok = window.confirm(
        `Se van a publicar ${cuantas} pieza(s) de "${f.titulo}" en las redes. Esto no se puede deshacer.`
      )
      if (!ok) return
    }

    setAviso(null)
    setMoviendo(f.newsId)
    try {
      // La red sale de la columna donde se solto, no de la tarjeta: soltar en
      // Instagram significa Instagram, aunque la tarjeta venga de Angulo.
      const canal = etapa.startsWith("post_") ? etapa.slice("post_".length) : ""
      const r = await moverFicha(f.newsId, destino, canal)
      if (!r.ok) setAviso({ tipo: "error", texto: r.error })
      else if (r.warning) setAviso({ tipo: "error", texto: r.warning })
      else setAviso({ tipo: "ok", texto: "Hecho." })
    } catch (e) {
      // Una accion que no llega a responder deja la tarjeta atascada en
      // "moviendo" si no se recoge aqui, y ya no se puede volver a arrastrar.
      setAviso({
        tipo: "error",
        texto:
          e instanceof Error && e.message
            ? `No se pudo mover: ${e.message}`
            : "No se pudo mover: la accion no respondio. Puede haber tardado de mas.",
      })
    } finally {
      setMoviendo(null)
    }
  }

  return (
    <>
      {aviso ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            aviso.tipo === "error"
              ? "border-destructive/40 text-destructive bg-destructive/5"
              : "text-muted-foreground"
          }`}
        >
          {aviso.texto}
        </p>
      ) : null}

      {/* Scroll horizontal: las columnas no caben en un portatil, y partirlas
          en dos filas rompe la lectura de izquierda a derecha del proceso. */}
      <div className="flex items-start gap-5 overflow-x-auto pb-2">
        {gruposCon(datos.redes).map((grupo) => {
          const total = grupo.etapas.reduce((n, e) => n + datos.conteos[e.id], 0)
          return (
            <section key={grupo.titulo} className="shrink-0">
              <header className="mb-2 flex items-baseline gap-2 border-b pb-1">
                <h2 className="text-sm font-semibold">{grupo.titulo}</h2>
                <span className="text-muted-foreground text-xs tabular-nums">{total}</span>
              </header>

              <div className="flex gap-3">
                {grupo.etapas.map((etapa) => (
                  <Columna
                    key={etapa.id}
                    etapa={etapa.id}
                    titulo={etapa.titulo}
                    pista={etapa.pista}
                    fichas={datos.fichas[etapa.id]}
                    total={datos.conteos[etapa.id]}
                    modo={datos.modos[etapa.id]}
                    redes={datos.redes}
                    moviendo={moviendo}
                    // Mientras no se arrastre nada, ninguna columna se ilumina.
                    aceptaLaArrastrada={
                      arrastrando !== null && admite(arrastrando.etapa, etapa.id)
                    }
                    onAbrir={abrir}
                    onArrastrar={setArrastrando}
                    onSoltar={(f) => soltar(f, etapa.id)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <FichaDialog ficha={ficha} abierta={abierta} onOpenChange={setAbierta} />
    </>
  )
}

function Columna({
  etapa,
  titulo,
  pista,
  fichas,
  total,
  modo,
  redes,
  moviendo,
  aceptaLaArrastrada,
  onAbrir,
  onArrastrar,
  onSoltar,
}: {
  etapa: Etapa
  titulo: string
  pista: string
  fichas: Ficha[]
  /** Cuantas hay de verdad: puede ser mas de las que se pintan. */
  total: number
  /** Como esta el agente que llena esta etapa, si lo hay. */
  modo?: ModoDeEtapa
  /** Las redes con columna, para poder elegir a cual publicar. */
  redes: string[]
  /** El id de la ficha que se esta moviendo, si hay alguna. */
  moviendo: string | null
  aceptaLaArrastrada: boolean
  onAbrir: (f: Ficha) => void
  onArrastrar: (f: Ficha | null) => void
  onSoltar: (f: Ficha) => void
}) {
  const [encima, setEncima] = React.useState(false)
  const ocultas = total - fichas.length

  return (
    <div
      className="flex w-64 shrink-0 flex-col gap-2"
      onDragOver={(e) => {
        if (!aceptaLaArrastrada) return
        // Sin esto el navegador no considera la zona soltable y nunca hay drop.
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        setEncima(false)
        if (!aceptaLaArrastrada) return
        e.preventDefault()
        const datos = e.dataTransfer.getData("application/json")
        if (!datos) return
        onSoltar(JSON.parse(datos) as Ficha)
      }}
    >
      <div className="px-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-medium">{titulo}</h3>
          <div className="flex items-center gap-1">
            {modo ? <IndicadorModo modo={modo} redes={redes} /> : null}
            <span className="text-muted-foreground text-xs tabular-nums">{total}</span>
          </div>
        </div>
        <p className="text-muted-foreground text-[11px]">
          {modo?.modo === "programado" && modo.horario ? `A las ${modo.horario}` : pista}
        </p>
      </div>

      <div
        className={`flex min-h-24 flex-col gap-2 rounded-lg transition-colors ${
          aceptaLaArrastrada
            ? encima
              ? "ring-primary bg-accent/40 ring-2"
              : "ring-primary/30 ring-1 ring-dashed"
            : ""
        }`}
      >
        {fichas.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs">
            {aceptaLaArrastrada ? `Soltar en ${titulo}` : "Nada por aqui"}
          </p>
        ) : (
          fichas.map((f) => (
            <Tarjeta
              key={`${f.newsId}:${f.red ?? ""}`}
              ficha={f}
              arrastrable={
                etapa !== "descartado_fecha" && etapa !== "repetida" && etapa !== "vetada"
              }
              moviendo={moviendo === f.newsId}
              onAbrir={() => onAbrir(f)}
              onArrastrar={onArrastrar}
            />
          ))
        )}

        {ocultas > 0 ? (
          <p className="text-muted-foreground px-1 py-2 text-center text-xs">y {ocultas} mas</p>
        ) : null}
      </div>
    </div>
  )
}

function Tarjeta({
  ficha,
  arrastrable,
  moviendo,
  onAbrir,
  onArrastrar,
}: {
  ficha: Ficha
  arrastrable: boolean
  moviendo: boolean
  onAbrir: () => void
  onArrastrar: (f: Ficha | null) => void
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      draggable={arrastrable && !moviendo}
      onDragStart={(e) => {
        // La ficha entera viaja en el evento: la columna que la recibe necesita
        // saber de que etapa viene para decidir si la admite.
        e.dataTransfer.setData("application/json", JSON.stringify(ficha))
        e.dataTransfer.effectAllowed = "move"
        onArrastrar(ficha)
      }}
      onDragEnd={() => onArrastrar(null)}
      className={`hover:bg-accent/50 flex flex-col gap-2 overflow-hidden rounded-lg border bg-card text-left transition-colors ${
        moviendo ? "pointer-events-none opacity-50" : ""
      }`}
    >
      {/* La imagen ya generada: en cuanto hay pieza, la tarjeta la enseña, que es
          lo que de verdad se quiere revisar de un vistazo. */}
      {ficha.miniatura ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ficha.miniatura} alt="" className="h-28 w-full object-cover" loading="lazy" />
      ) : null}

      <div className="flex flex-col gap-2 p-3 pt-0 first:pt-3">
        <p className="line-clamp-3 text-sm leading-snug font-medium">{ficha.titulo}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-normal">
            {ficha.tema}
          </Badge>

          {/* El score acompaña al hecho desde que se analiza: en contenido dice
              con que nota entro, que es lo que justifica que se generara. */}
          {ficha.analizada && ficha.score !== null ? (
            <Badge variant={ficha.score >= 8 ? "default" : "secondary"}>{ficha.score}/10</Badge>
          ) : null}

          {/* Que se generara sin llegar al umbral no es un error que esconder:
              es la discrepancia entre el analisis y el criterio de quien
              publica, y se marca para poder buscarla despues. */}
          {ficha.bajoUmbral ? (
            <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
              Bajo umbral
            </Badge>
          ) : null}

          {ficha.etapa === "sin_analizar" ? <Badge variant="secondary">En cola</Badge> : null}
          {moviendo ? <Badge variant="secondary">Moviendo…</Badge> : null}

          {ficha.piezas.map((p) => (
            <Badge key={p.id} variant={p.status === "published" ? "default" : "secondary"}>
              {NOMBRE_RED[p.network] ?? p.network}
            </Badge>
          ))}
        </div>

        {ficha.fuente ? (
          <p className="text-muted-foreground truncate text-xs">{ficha.fuente}</p>
        ) : null}
      </div>
    </button>
  )
}

/**
 * Como corre el agente de esta etapa, y el gatillo si hay que apretarlo.
 *
 * El boton solo aparece en manual. En programado o automatico no haria falta
 * —el agente ya corre solo— y tenerlo ahi invitaria a forzar pasadas sueltas
 * que descuadran las tandas.
 *
 * Lo que ejecuta es el trabajo que dejo la etapa anterior, no lo que se ve en
 * esta columna: pulsar en "Angulo" anguliza lo que esta en "Analizadas". Es lo
 * mismo que haria la pasada automatica; cambia solo quien aprieta.
 */
export function IndicadorModo({ modo, redes }: { modo: ModoDeEtapa; redes: string[] }) {
  const [pending, startTransition] = React.useTransition()
  const [aviso, setAviso] = React.useState<string | null>(null)

  const correr = (canal = "") => {
    setAviso(null)
    startTransition(async () => {
      try {
        const r = await ejecutarAgente(modo.agente, canal)
        setAviso(r.ok ? r.resumen : r.error)
      } catch {
        setAviso("No respondio. Puede haber tardado de mas.")
      }
    })
  }

  // Publicar saca al feed y no se deshace, asi que se pregunta a donde en vez
  // de suponer que quien pulsa quiere las tres redes de una.
  const preguntaRed = modo.agente === "publicacion" && redes.length > 1

  return (
    <span className="flex items-center gap-1">
      {aviso ? (
        <span className="text-muted-foreground max-w-32 truncate text-[10px]" title={aviso}>
          {aviso}
        </span>
      ) : null}

      <Badge
        variant={modo.modo === "manual" ? "outline" : "secondary"}
        className="px-1.5 py-0 text-[10px] font-normal"
        title={`${modo.nombre}: ${modo.modo}`}
      >
        {modo.modo === "manual"
          ? "Manual"
          : modo.modo === "programado"
            ? "Programado"
            : "Automatico"}
      </Badge>

      {modo.modo !== "manual" ? null : preguntaRed ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                disabled={pending}
                title={`Publicar ahora`}
                aria-label="Publicar ahora"
                className="hover:bg-accent rounded p-0.5 transition-colors disabled:opacity-50"
              />
            }
          >
            <PlayIcon className={`size-3 ${pending ? "animate-pulse" : ""}`} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Publicar en</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => correr("")}>Todas las redes</DropdownMenuItem>
            {redes.map((red) => (
              <DropdownMenuItem key={red} onClick={() => correr(red)}>
                {NOMBRE_RED_COLUMNA[red] ?? red}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          onClick={() => correr()}
          disabled={pending}
          title={`Ejecutar ${modo.nombre} ahora`}
          aria-label={`Ejecutar ${modo.nombre} ahora`}
          className="hover:bg-accent rounded p-0.5 transition-colors disabled:opacity-50"
        >
          <PlayIcon className={`size-3 ${pending ? "animate-pulse" : ""}`} />
        </button>
      )}
    </span>
  )
}
