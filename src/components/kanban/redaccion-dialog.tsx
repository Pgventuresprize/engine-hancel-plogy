"use client"

import * as React from "react"
import { CheckIcon, CopyIcon, ExternalLinkIcon, PenLineIcon, RefreshCwIcon, SendIcon, XIcon } from "lucide-react"

import { contenidoDeNoticia } from "@/app/estudio/actions"
import { moverEnRedaccion, publicarEnWeb, redaccionCompleta, type RedaccionCompleta } from "@/app/estudio/redaccion-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Redaccion } from "@/engine/redaccion/agente"
import { formatDateTime } from "@/lib/format"
import type { FichaRedaccion } from "@/lib/redaccion-data"

/**
 * La ficha de una noticia en el pipeline de redaccion: la noticia, su analisis
 * (el mismo del pipeline de redes), las fuentes investigadas y la noticia
 * redactada tal como se leeria publicada.
 */

const PANEL = "min-h-0 flex-1 overflow-y-auto pr-1"

const NOMBRE_TIPO: Record<string, string> = {
  primaria: "Primaria",
  parte_interesada: "Parte interesada",
  medio: "Medio",
}

export function RedaccionDialog({
  ficha,
  abierta,
  onOpenChange,
}: {
  ficha: FichaRedaccion | null
  abierta: boolean
  onOpenChange: (v: boolean) => void
}) {
  const id = ficha?.newsId
  const estado = ficha?.redaccion?.status
  const clave = `${id}:${estado}`
  // Lo cargado va con la clave de lo que se pidio: si la ficha o su estado
  // cambian, lo de antes deja de valer y se ve "cargando" sin tocar estado.
  const [carga, setCarga] = React.useState<{ clave: string; datos: RedaccionCompleta | null } | null>(null)
  const cargando = carga?.clave !== clave
  const datos = carga && carga.datos && carga.clave.startsWith(`${id}:`) ? carga.datos : null

  // Se pide al abrir y cada vez que cambia el estado (al terminar de redactar
  // el tablero se revalida y la ficha abierta se pone al dia sola).
  React.useEffect(() => {
    if (!id || !abierta) return
    let vivo = true
    redaccionCompleta(id).then((r) => {
      if (vivo) setCarga({ clave: `${id}:${estado}`, datos: r.ok ? r.datos : null })
    })
    return () => {
      vivo = false
    }
  }, [id, abierta, estado])

  if (!ficha) return null
  const inicial = ficha.redaccion?.status === "redactada" ? "redaccion" : ficha.analizada ? "analisis" : "noticia"

  return (
    <Dialog open={abierta} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">{ficha.titulo}</DialogTitle>
          <DialogDescription>
            {ficha.niche} · {ficha.tema}
            {ficha.fuente ? ` · ${ficha.fuente}` : ""}
          </DialogDescription>
        </DialogHeader>

        <Tabs key={ficha.newsId} defaultValue={inicial} className="flex min-h-0 flex-1 flex-col gap-3">
          <TabsList className="h-auto shrink-0 flex-wrap">
            <TabsTrigger value="noticia">Noticia</TabsTrigger>
            {ficha.analizada ? <TabsTrigger value="analisis">Análisis</TabsTrigger> : null}
            <TabsTrigger value="fuentes">Fuentes</TabsTrigger>
            <TabsTrigger value="redaccion">Redacción</TabsTrigger>
          </TabsList>

          <TabsContent value="noticia" className={PANEL}>
            <div className="flex flex-col gap-3 text-sm">
              <Campo etiqueta="Traída">{formatDateTime(ficha.creada)}</Campo>
              {ficha.fechaSerper ? <Campo etiqueta="Publicada">{ficha.fechaSerper}</Campo> : null}
              <Campo etiqueta="Snippet">{ficha.snippet ?? "(sin snippet)"}</Campo>
              <div className="border-t pt-3">
                <Button size="sm" variant="outline" render={<a href={ficha.link} target="_blank" rel="noreferrer" />}>
                  <ExternalLinkIcon />
                  Ver la fuente
                </Button>
              </div>
            </div>
          </TabsContent>

          {ficha.analizada ? (
            <TabsContent value="analisis" className={PANEL}>
              <PanelAnalisis ficha={ficha} />
            </TabsContent>
          ) : null}

          <TabsContent value="fuentes" className={PANEL}>
            <PanelFuentes datos={datos} cargando={cargando} />
          </TabsContent>

          <TabsContent value="redaccion" className={PANEL}>
            <PanelRedaccion ficha={ficha} datos={datos} cargando={cargando} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium">{etiqueta}</span>
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

function PanelAnalisis({ ficha }: { ficha: FichaRedaccion }) {
  const [contenido, setContenido] = React.useState<string | null>(null)
  const [cargando, setCargando] = React.useState(true)
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
      <p className="text-muted-foreground text-xs">Es el mismo análisis del pipeline de redes: no se repite.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={ficha.score !== null && ficha.score >= 8 ? "default" : "secondary"}>Score {ficha.score ?? "-"}/10</Badge>
        {(ficha.keywords ?? []).map((k) => (
          <Badge key={k} variant="outline" className="font-normal">
            {k}
          </Badge>
        ))}
      </div>
      <Campo etiqueta="Notas del análisis">{ficha.notas ?? "(sin notas)"}</Campo>
      <Campo etiqueta="Contenido consolidado">
        <span className="whitespace-pre-wrap">{cargando ? "Cargando…" : (contenido ?? "(sin contenido)")}</span>
      </Campo>
    </div>
  )
}

function PanelFuentes({ datos, cargando }: { datos: RedaccionCompleta | null; cargando: boolean }) {
  if (cargando && !datos) return <p className="text-muted-foreground text-sm">Cargando…</p>
  const lista = datos?.investigadas ?? []
  if (lista.length === 0) {
    return <p className="text-muted-foreground text-sm">Aún no hay fuentes investigadas: se buscan al analizar y al redactar.</p>
  }
  const citada = new Map((datos?.citadas ?? []).map((c) => [c.url, c.id]))
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground text-xs">
        Lo que se investigó de esta noticia. Las marcadas con un id (f1, f2…) son las que recibió el agente de redacción; “leída” es que
        se pudo traer el texto completo de la página.
      </p>
      {lista.map((f) => (
        <a
          key={f.id}
          href={f.url}
          target="_blank"
          rel="noreferrer"
          className="hover:bg-accent/50 flex flex-col gap-1 rounded-md border px-3 py-2 transition-colors"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            {citada.get(f.url) ? <Badge>{citada.get(f.url)}</Badge> : null}
            <span className="font-medium">{f.medio ?? f.url}</span>
            <Badge variant="outline" className="font-normal">
              {NOMBRE_TIPO[f.tipo] ?? f.tipo}
            </Badge>
            {f.origen === "noticia" ? <Badge variant="secondary">Origen de la noticia</Badge> : null}
            {f.leida ? <Badge variant="secondary">Leída</Badge> : <Badge variant="outline">Solo extracto</Badge>}
          </span>
          {f.titulo ? <span className="text-muted-foreground line-clamp-2 text-xs">{f.titulo}</span> : null}
        </a>
      ))}
    </div>
  )
}

/** Las fuentes que respaldan un bloque, como enlaces pequenos bajo el texto. */
function Refs({ ids, citadas }: { ids: string[]; citadas: RedaccionCompleta["citadas"] }) {
  if (!ids.length) return null
  return (
    <p className="mt-1 flex flex-wrap gap-1">
      {ids.map((id) => {
        const c = citadas.find((x) => x.id === id)
        return c ? (
          <a
            key={id}
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground rounded border px-1.5 py-0.5 font-sans text-[10px] transition-colors"
            title={c.titulo}
          >
            {id} · {c.medio || c.titulo}
          </a>
        ) : null
      })}
    </p>
  )
}

/** El texto plano de la noticia, para copiarlo y pegarlo donde se publique. */
function comoTexto(r: Redaccion, citadas: RedaccionCompleta["citadas"]): string {
  const fuentes = citadas.filter((c) => r.fuentes_usadas.includes(c.id))
  return [
    r.titular,
    "",
    ...r.entrada.parrafos.flatMap((p) => [p, ""]),
    ...r.secciones.flatMap((s) => [s.subtitulo, "", ...s.parrafos.flatMap((p) => [p, ""])]),
    "Fuentes:",
    ...fuentes.map((c) => `- ${c.medio || c.titulo}: ${c.url}`),
  ].join("\n")
}

function PanelRedaccion({ ficha, datos, cargando }: { ficha: FichaRedaccion; datos: RedaccionCompleta | null; cargando: boolean }) {
  const [pending, start] = React.useTransition()
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)
  const [copiado, setCopiado] = React.useState(false)
  const r = datos?.redaccion
  const status = ficha.redaccion?.status ?? "sin_redaccion"
  const enCurso = status === "pendiente" || status === "redactando"

  const accion = (d: "redaccion" | "descartado") =>
    start(async () => {
      setAviso(null)
      try {
        const res = await moverEnRedaccion(ficha.newsId, d)
        setAviso(res.ok ? { ok: true, texto: res.aviso ?? "Hecho." } : { ok: false, texto: res.error })
      } catch {
        setAviso({ ok: false, texto: "La acción no respondió." })
      }
    })

  const web = ficha.redaccion
  const publicarWeb = () =>
    start(async () => {
      setAviso(null)
      try {
        const res = await publicarEnWeb(ficha.newsId)
        setAviso(res.ok ? { ok: true, texto: res.aviso ?? "Hecho." } : { ok: false, texto: res.error })
      } catch {
        setAviso({ ok: false, texto: "La acción no respondió." })
      }
    })

  const barra = (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      {status === "redactada" && web ? (
        <span className="flex w-full flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Portal de noticias:</span>
          {web.web_status === "enviada" ? (
            <Badge className="bg-emerald-600 text-white">Publicada{web.web_version > 1 ? ` (v${web.web_version})` : ""}</Badge>
          ) : web.web_status === "pendiente" || web.web_status === "enviando" ? (
            <Badge variant="secondary">Enviando…</Badge>
          ) : web.web_status === "error" ? (
            <Badge variant="destructive" title={web.web_error ?? ""}>
              Error
            </Badge>
          ) : (
            <Badge variant="outline">Sin enviar</Badge>
          )}
          {web.web_url ? (
            <a href={web.web_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground underline underline-offset-2">
              Ver en el portal
            </a>
          ) : null}
          {web.web_status === "error" && web.web_error ? <span className="text-destructive">{web.web_error}</span> : null}
          {web.web_status !== "pendiente" && web.web_status !== "enviando" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={publicarWeb}>
              <SendIcon />
              {web.web_status === "enviada" ? "Reenviar" : web.web_status === "error" ? "Reintentar" : "Publicar en la web"}
            </Button>
          ) : null}
        </span>
      ) : null}
      {status === "redactada" && r ? (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(comoTexto(r, datos?.citadas ?? []))
            setCopiado(true)
            setTimeout(() => setCopiado(false), 1500)
          }}
        >
          {copiado ? <CheckIcon /> : <CopyIcon />}
          {copiado ? "Copiada" : "Copiar texto"}
        </Button>
      ) : null}
      {ficha.analizada && !enCurso && ficha.etapa !== "vetada" ? (
        <Button size="sm" variant={status === "redactada" ? "outline" : "default"} disabled={pending} onClick={() => accion("redaccion")}>
          {status === "sin_redaccion" ? <PenLineIcon /> : <RefreshCwIcon />}
          {status === "sin_redaccion" ? "Redactar" : "Volver a redactar"}
        </Button>
      ) : null}
      {status !== "sin_redaccion" && status !== "descartada" && !enCurso ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => accion("descartado")}>
          <XIcon />
          Descartar
        </Button>
      ) : null}
      {aviso ? <span className={`text-xs ${aviso.ok ? "text-muted-foreground" : "text-destructive"}`}>{aviso.texto}</span> : null}
    </div>
  )

  if (status === "sin_redaccion") {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          Aún no se ha redactado. {ficha.analizada ? "Arrástrala a Redactadas o pulsa Redactar." : "Primero tiene que pasar por el análisis."}
        </p>
        {barra}
      </div>
    )
  }
  if (enCurso) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          {status === "pendiente" ? "En cola: el agente la toma en la próxima pasada." : "El agente está investigando las fuentes y escribiendo la noticia…"}
        </p>
        {barra}
      </div>
    )
  }
  if (cargando && !datos) return <p className="text-muted-foreground text-sm">Cargando…</p>
  if (status !== "redactada" || !r) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <Badge variant={status === "error" ? "destructive" : "outline"} className="w-fit">
          {status === "material_insuficiente" ? "Material insuficiente" : status === "descartada" ? "Descartada" : "Error"}
        </Badge>
        {status === "material_insuficiente" && r?.faltantes.length ? (
          <Campo etiqueta="Lo que haría falta para escribirla">
            <ul className="list-disc space-y-1 pl-5">
              {r.faltantes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Campo>
        ) : datos?.error ? (
          <p className="text-muted-foreground">{datos.error}</p>
        ) : null}
        {barra}
      </div>
    )
  }

  const usadas = (datos?.citadas ?? []).filter((c) => r.fuentes_usadas.includes(c.id))

  return (
    <div className="flex flex-col gap-3">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        {ficha.redaccion?.nicho_nombre ? <Badge>Nicho: {ficha.redaccion.nicho_nombre}</Badge> : <Badge variant="outline">Sin nicho</Badge>}
        <Badge variant="secondary">{r.word_count} palabras</Badge>
        {datos?.model ? <span>{datos.model}</span> : null}
        {datos?.redactadaAt ? <span>· {formatDateTime(datos.redactadaAt)}</span> : null}
        {r.word_count < 250 ? <Badge variant="destructive">Menos de 250 palabras</Badge> : null}
        {r.word_count > 400 ? <Badge variant="destructive">Más de 400 palabras</Badge> : null}
      </div>

      {/* El preview: la noticia como se leeria publicada. */}
      <article className="bg-background mx-auto w-full max-w-2xl rounded-lg border p-5 font-serif sm:p-8">
        {datos?.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <figure className="mb-5">
            <img src={datos.imagen} alt="" className="aspect-[16/9] w-full rounded object-cover" />
            {datos.imagenCredito?.medio ? (
              <figcaption className="text-muted-foreground mt-1 font-sans text-[11px]">
                Foto:{" "}
                {datos.imagenCredito.url_origen ? (
                  <a href={datos.imagenCredito.url_origen} target="_blank" rel="noreferrer" className="hover:text-foreground underline underline-offset-2">
                    {datos.imagenCredito.medio.replace(/^www\./, "")}
                  </a>
                ) : (
                  datos.imagenCredito.medio
                )}
                {datos.imagenCredito.autor ? ` / ${datos.imagenCredito.autor}` : ""}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
        <p className="text-muted-foreground mb-2 font-sans text-xs tracking-wide uppercase">{ficha.redaccion?.nicho_nombre ?? ficha.tema}</p>
        <h1 className="mb-4 text-2xl leading-tight font-bold sm:text-3xl">{r.titular}</h1>
        <div className="space-y-4 text-[15px] leading-relaxed sm:text-base">
          {r.entrada.parrafos.map((p, i) => (
            <p key={i} className={i === 0 ? "text-lg leading-relaxed" : ""}>
              {p}
            </p>
          ))}
          <Refs ids={r.entrada.fuentes} citadas={datos?.citadas ?? []} />
          {r.secciones.map((s, i) => (
            <section key={i} className="space-y-3 pt-2">
              <h2 className="text-xl leading-snug font-semibold">{s.subtitulo}</h2>
              {s.parrafos.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
              <Refs ids={s.fuentes} citadas={datos?.citadas ?? []} />
            </section>
          ))}
        </div>
        {usadas.length ? (
          <footer className="mt-8 border-t pt-4 font-sans">
            <p className="mb-2 text-xs font-semibold">Fuentes</p>
            <ol className="text-muted-foreground space-y-1 text-xs">
              {usadas.map((c) => (
                <li key={c.id}>
                  <span className="text-foreground font-medium">{c.id}</span> ·{" "}
                  <a href={c.url} target="_blank" rel="noreferrer" className="hover:text-foreground underline underline-offset-2">
                    {c.medio || c.titulo}
                  </a>
                  {c.titulo && c.medio ? `: ${c.titulo}` : ""}
                  {c.id === r.fuente_principal ? " (origen de la noticia)" : ""}
                </li>
              ))}
            </ol>
          </footer>
        ) : null}
      </article>
      {barra}
    </div>
  )
}
