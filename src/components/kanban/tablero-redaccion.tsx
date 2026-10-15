"use client"

import * as React from "react"

import { moverEnRedaccion } from "@/app/estudio/redaccion-actions"
import { IndicadorModo } from "@/components/kanban/tablero"
import { RedaccionDialog } from "@/components/kanban/redaccion-dialog"
import { Badge } from "@/components/ui/badge"
import type { EtapaRedaccion, FichaRedaccion, TableroRedaccion as Datos } from "@/lib/redaccion-data"

/**
 * El tablero del pipeline de redaccion.
 *
 * Noticias es lo mismo que en el de redes (las mismas traidas y el mismo
 * analisis). Contenido es otra cosa: el agente de redaccion investiga, decide
 * como contar la noticia y la escribe entera, citando sus fuentes.
 *
 * Se arrastra hacia adelante para pedir el trabajo que falta: una traida a
 * Analizadas la analiza, una analizada a Redactadas la redacta. Descartar aqui
 * solo la saca de este pipeline.
 */

type Grupo = { titulo: string; etapas: { id: EtapaRedaccion; titulo: string; pista: string }[] }

const GRUPOS: Grupo[] = [
  {
    titulo: "Noticias",
    etapas: [
      { id: "sin_analizar", titulo: "Traidas", pista: "Las mismas que en redes" },
      { id: "analizada", titulo: "Analizadas", pista: "El mismo análisis que en redes" },
    ],
  },
  {
    titulo: "Contenido",
    etapas: [
      { id: "en_redaccion", titulo: "En redacción", pista: "Investigando y escribiendo" },
      { id: "redactada", titulo: "Redactadas", pista: "Noticia escrita, con sus fuentes" },
    ],
  },
  {
    titulo: "Descartados",
    etapas: [
      { id: "sin_material", titulo: "Sin material", pista: "No alcanzó para 600 palabras" },
      { id: "descartado", titulo: "A mano", pista: "Rechazadas por ti" },
      { id: "descartado_fecha", titulo: "Por fecha", pista: "Ya eran viejas al llegar" },
      { id: "repetida", titulo: "Repetidas", pista: "Ese hecho ya se contó" },
      { id: "vetada", titulo: "Vetadas", pista: "Tema que no cubrimos" },
    ],
  },
]

/** A donde se puede soltar cada tarjeta, y que pide eso. */
function destino(origen: EtapaRedaccion, etapa: EtapaRedaccion): "analizada" | "redaccion" | "descartado" | null {
  if (etapa === "analizada" && origen === "sin_analizar") return "analizada"
  if (etapa === "redactada" && (origen === "analizada" || origen === "sin_material" || origen === "descartado")) return "redaccion"
  if (etapa === "en_redaccion" && (origen === "analizada" || origen === "sin_material")) return "redaccion"
  if (etapa === "descartado" && ["analizada", "en_redaccion", "redactada", "sin_material"].includes(origen)) return "descartado"
  return null
}

export function TableroRedaccion({ datos }: { datos: Datos }) {
  const [abiertaId, setAbiertaId] = React.useState<string | null>(null)
  const [abierta, setAbierta] = React.useState(false)
  const [arrastrando, setArrastrando] = React.useState<FichaRedaccion | null>(null)
  const [moviendo, setMoviendo] = React.useState<string | null>(null)
  const [aviso, setAviso] = React.useState<{ tipo: "error" | "ok"; texto: string } | null>(null)

  const ficha = React.useMemo(() => {
    if (!abiertaId) return null
    for (const lista of Object.values(datos.fichas)) {
      const f = lista.find((x) => x.newsId === abiertaId)
      if (f) return f
    }
    return null
  }, [abiertaId, datos])

  async function soltar(f: FichaRedaccion, etapa: EtapaRedaccion) {
    const d = destino(f.etapa, etapa)
    if (!d) return
    setAviso(null)
    setMoviendo(f.newsId)
    try {
      const r = await moverEnRedaccion(f.newsId, d)
      setAviso(r.ok ? { tipo: "ok", texto: r.aviso ?? "Hecho." } : { tipo: "error", texto: r.error })
    } catch (e) {
      setAviso({ tipo: "error", texto: e instanceof Error && e.message ? `No se pudo mover: ${e.message}` : "No se pudo mover: la acción no respondió." })
    } finally {
      setMoviendo(null)
    }
  }

  return (
    <>
      <p className="text-muted-foreground text-xs">
        Umbral de redacción: {datos.umbral === null ? "sin definir (solo se redacta lo que pidas a mano)" : `${datos.umbral}/10`}. Se
        cambia en Configuración → General.
      </p>
      {aviso ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            aviso.tipo === "error" ? "border-destructive/40 text-destructive bg-destructive/5" : "text-muted-foreground"
          }`}
        >
          {aviso.texto}
        </p>
      ) : null}

      <div className="flex items-start gap-5 overflow-x-auto pb-2">
        {GRUPOS.map((grupo) => {
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
                    moviendo={moviendo}
                    acepta={arrastrando !== null && destino(arrastrando.etapa, etapa.id) !== null}
                    onAbrir={(f) => {
                      setAbiertaId(f.newsId)
                      setAbierta(true)
                    }}
                    onArrastrar={setArrastrando}
                    onSoltar={(f) => soltar(f, etapa.id)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <RedaccionDialog ficha={ficha} abierta={abierta} onOpenChange={setAbierta} />
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
  moviendo,
  acepta,
  onAbrir,
  onArrastrar,
  onSoltar,
}: {
  etapa: EtapaRedaccion
  titulo: string
  pista: string
  fichas: FichaRedaccion[]
  total: number
  modo?: Datos["modos"][EtapaRedaccion]
  moviendo: string | null
  acepta: boolean
  onAbrir: (f: FichaRedaccion) => void
  onArrastrar: (f: FichaRedaccion | null) => void
  onSoltar: (f: FichaRedaccion) => void
}) {
  const [encima, setEncima] = React.useState(false)
  const ocultas = total - fichas.length
  const fija = etapa === "descartado_fecha" || etapa === "repetida" || etapa === "vetada"

  return (
    <div
      className="flex w-64 shrink-0 flex-col gap-2"
      onDragOver={(e) => {
        if (!acepta) return
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        setEncima(false)
        if (!acepta) return
        e.preventDefault()
        const d = e.dataTransfer.getData("application/json")
        if (d) onSoltar(JSON.parse(d) as FichaRedaccion)
      }}
    >
      <div className="px-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-medium">{titulo}</h3>
          <div className="flex items-center gap-1">
            {modo ? <IndicadorModo modo={modo} redes={[]} /> : null}
            <span className="text-muted-foreground text-xs tabular-nums">{total}</span>
          </div>
        </div>
        <p className="text-muted-foreground text-[11px]">{modo?.modo === "programado" && modo.horario ? `A las ${modo.horario}` : pista}</p>
      </div>

      <div
        className={`flex min-h-24 flex-col gap-2 rounded-lg transition-colors ${
          acepta ? (encima ? "ring-primary bg-accent/40 ring-2" : "ring-primary/30 ring-1 ring-dashed") : ""
        }`}
      >
        {fichas.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs">
            {acepta ? `Soltar en ${titulo}` : "Nada por aquí"}
          </p>
        ) : (
          fichas.map((f) => (
            <button
              key={f.newsId}
              type="button"
              onClick={() => onAbrir(f)}
              draggable={!fija && moviendo !== f.newsId}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/json", JSON.stringify(f))
                e.dataTransfer.effectAllowed = "move"
                onArrastrar(f)
              }}
              onDragEnd={() => onArrastrar(null)}
              className={`hover:bg-accent/50 flex flex-col gap-2 overflow-hidden rounded-lg border bg-card text-left transition-colors ${
                moviendo === f.newsId ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {f.miniatura ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.miniatura} alt="" className="h-28 w-full object-cover" loading="lazy" />
              ) : null}
              <div className="flex flex-col gap-2 p-3 pt-0 first:pt-3">
                <p className="line-clamp-3 text-sm leading-snug font-medium">{f.titulo}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="font-normal">
                    {f.redaccion?.nicho_nombre ?? f.tema}
                  </Badge>
                  {f.analizada && f.score !== null ? <Badge variant={f.score >= 8 ? "default" : "secondary"}>{f.score}/10</Badge> : null}
                  {f.bajoUmbral ? (
                    <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
                      Bajo umbral
                    </Badge>
                  ) : null}
                  {f.redaccion?.status === "redactada" && f.redaccion.word_count ? (
                    <Badge variant="secondary">{f.redaccion.word_count} palabras</Badge>
                  ) : null}
                  {f.redaccion?.status === "pendiente" ? <Badge variant="secondary">En cola</Badge> : null}
                  {f.redaccion?.status === "redactando" ? <Badge variant="secondary">Redactando…</Badge> : null}
                  {f.redaccion?.status === "error" ? (
                    <Badge variant="destructive" title={f.redaccion.error ?? ""}>
                      Error{f.redaccion.intentos >= 3 ? "" : " · reintenta"}
                    </Badge>
                  ) : null}
                  {f.etapa === "sin_analizar" ? <Badge variant="secondary">En cola</Badge> : null}
                  {moviendo === f.newsId ? <Badge variant="secondary">Moviendo…</Badge> : null}
                </div>
                {f.fuente ? <p className="text-muted-foreground truncate text-xs">{f.fuente}</p> : null}
              </div>
            </button>
          ))
        )}
        {ocultas > 0 ? <p className="text-muted-foreground px-1 py-2 text-center text-xs">y {ocultas} más</p> : null}
      </div>
    </div>
  )
}
