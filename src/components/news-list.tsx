"use client"

import * as React from "react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { GenerateContentButton } from "@/components/contenido/generate-content-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { nombreMaterial } from "@/engine/content/material"
import { formatDateTime, formatNumber, statusLabel } from "@/lib/format"
import type { RawNews } from "@/lib/types"
import { ExternalLinkIcon, FileTextIcon, ImageOffIcon } from "lucide-react"

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "analyzed") return "default"
  if (status === "pending_analysis") return "secondary"
  // Caducada sin analizar: sigue ahi, pero ya no entra en la cola.
  if (status === "expired") return "outline"
  return "outline"
}

/** Fila etiqueta/valor del bloque de metadatos. */
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm wrap-break-word">{children}</dd>
    </div>
  )
}

function Thumbnail({ item }: { item: RawNews }) {
  const [failed, setFailed] = React.useState(false)

  if (!item.image_url || failed) {
    return (
      <div className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-md">
        <ImageOffIcon className="size-5" />
      </div>
    )
  }

  return (
    // next/image exigiria declarar cada dominio de origen en remotePatterns y
    // las fuentes de noticias son arbitrarias, asi que usamos <img> directo.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.image_url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="bg-muted size-16 shrink-0 rounded-md object-cover"
    />
  )
}

export function NewsList({ items }: { items: RawNews[] }) {
  const [open, setOpen] = React.useState<string[]>([])

  const allOpen = open.length === items.length && items.length > 0

  if (!items.length) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-12 text-center text-sm">
          No hay noticias que coincidan con los filtros.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {formatNumber(items.length)}{" "}
          {items.length === 1 ? "noticia" : "noticias"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(allOpen ? [] : items.map((item) => item.id))}
        >
          {allOpen ? "Contraer todo" : "Expandir todo"}
        </Button>
      </div>

      <Card className="py-0">
        <CardContent className="px-4">
          <Accordion
            value={open}
            onValueChange={(value) => setOpen(value as string[])}
          >
            {items.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger className="gap-4 py-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Thumbnail item={item} />
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="text-base leading-snug font-semibold wrap-break-word">
                        {item.title}
                      </span>
                      <span className="text-muted-foreground text-xs font-normal">
                        {[item.source, item.date_serper].filter(Boolean).join(" · ") ||
                          "Fuente desconocida"}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <Badge variant="outline">{item.niche}</Badge>
                        <Badge variant="outline">{item.tema}</Badge>
                        <Badge variant={statusVariant(item.status)}>
                          {statusLabel(item.status)}
                        </Badge>
                        {item.relevance_score !== null ? (
                          <Badge variant="secondary">
                            Relevancia {item.relevance_score}
                          </Badge>
                        ) : null}
                        {item.full_content ? (
                          <Badge variant="secondary">
                            <FileTextIcon className="size-3" />
                            {formatNumber(item.full_content.length)} car.
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pb-6">
                  <div className="flex flex-col gap-5">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
                      <Meta label="Nicho">{item.niche}</Meta>
                      <Meta label="Tema">{item.tema}</Meta>
                      <Meta label="Fuente">{item.source ?? "—"}</Meta>
                      <Meta label="Fecha (Serper)">{item.date_serper ?? "—"}</Meta>
                      <Meta label="Estado">{statusLabel(item.status)}</Meta>
                      <Meta label="Relevancia">{item.relevance_score ?? "—"}</Meta>
                      <Meta label="Query usada">{item.query_used ?? "—"}</Meta>
                      <Meta label="Material">
                        {nombreMaterial(item.content_fetch_status) ?? "—"}
                      </Meta>
                      <Meta label="Creada">{formatDateTime(item.created_at)}</Meta>
                      <Meta label="Analizada">{formatDateTime(item.analyzed_at)}</Meta>
                      <Meta label="Contenido obtenido">
                        {formatDateTime(item.content_fetched_at)}
                      </Meta>
                      <Meta label="ID">
                        <code className="text-xs">{item.id}</code>
                      </Meta>
                    </dl>

                    {item.keywords_matched?.length ? (
                      <div>
                        <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                          Keywords detectadas
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {item.keywords_matched.map((keyword) => (
                            <Badge key={keyword} variant="secondary">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {item.snippet ? (
                      <div>
                        <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                          Snippet
                        </h3>
                        <p className="text-sm leading-relaxed">{item.snippet}</p>
                      </div>
                    ) : null}

                    {item.analysis_notes ? (
                      <div>
                        <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                          Notas de analisis
                        </h3>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {item.analysis_notes}
                        </p>
                      </div>
                    ) : null}

                    <div>
                      <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                        Contenido completo
                      </h3>
                      {item.full_content ? (
                        <div className="bg-muted/40 max-h-[32rem] overflow-y-auto rounded-lg border p-4">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {item.full_content}
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                          Todavia no hay texto consolidado (material:{" "}
                          {nombreMaterial(item.content_fetch_status) ?? "sin analizar"}).
                        </p>
                      )}
                    </div>

                    {/* El envio al pipeline vive aqui y no solo en las
                        candidatas: es la unica lista que muestra todas las
                        noticias, y la accion tiene que estar disponible sea
                        cual sea el modo y supere o no el umbral. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<a href={item.link} target="_blank" rel="noreferrer" />}
                      >
                        <ExternalLinkIcon />
                        Abrir original
                      </Button>
                      <GenerateContentButton rawNewsId={item.id} />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}
