"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, LoaderCircleIcon } from "lucide-react"

import { PanelRecurso } from "@/components/kanban/panel-recurso"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NOMBRE_TIPO_RECURSO, TIPOS_RECURSO, VEREDICTOS, type TipoRecurso } from "@/engine/recursos/modelo"
import type { EstadoFila, FilaRecurso } from "@/lib/recursos-data"
import { formatDateTime } from "@/lib/format"

/**
 * La lista de Recursos: filtros por estado y por tipo, y una fila por recurso
 * que abre el mismo panel de la ficha en un dialogo.
 */

type FiltroEstado = "todos" | EstadoFila
type FiltroTipo = "todos" | TipoRecurso

const NOMBRE_ESTADO: Record<EstadoFila, string> = {
  por_revisar: "Por revisar",
  en_curso: "Escribiéndose",
  aprobado: "Aprobado, sin publicar",
  en_la_web: "En la web",
  descartado: "Descartado",
  fallido: "Falló",
}
const ORDEN_ESTADOS: EstadoFila[] = ["por_revisar", "en_curso", "aprobado", "en_la_web", "descartado", "fallido"]

export function ListaRecursos({ filas }: { filas: FilaRecurso[] }) {
  const router = useRouter()
  const [estado, setEstado] = React.useState<FiltroEstado>("todos")
  const [tipo, setTipo] = React.useState<FiltroTipo>("todos")
  const [abierta, setAbierta] = React.useState<FilaRecurso | null>(null)

  const porEstado = (e: EstadoFila) => filas.filter((f) => f.estado === e).length
  const visibles = filas.filter((f) => (estado === "todos" || f.estado === estado) && (tipo === "todos" || f.tipo === tipo))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Filtros
          etiqueta="Estado"
          valor={estado}
          onCambio={setEstado}
          opciones={[
            { valor: "todos", nombre: "Todos", cuenta: filas.length },
            // Solo los estados que tienen algo: un filtro que da cero no ayuda a buscar.
            ...ORDEN_ESTADOS.filter((e) => porEstado(e) > 0).map((e) => ({ valor: e, nombre: NOMBRE_ESTADO[e], cuenta: porEstado(e) })),
          ]}
        />
        <Filtros
          etiqueta="Tipo"
          valor={tipo}
          onCambio={setTipo}
          opciones={[
            { valor: "todos", nombre: "Todos" },
            ...TIPOS_RECURSO.map((t) => ({ valor: t, nombre: t === "reporte" ? "Reportes" : "Guías", cuenta: filas.filter((f) => f.tipo === t).length })),
          ]}
        />
      </div>

      {visibles.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">Ninguno con estos filtros.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((f) => (
            <li key={f.angleId}>
              <Fila fila={f} onAbrir={() => setAbierta(f)} />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={Boolean(abierta)}
        onOpenChange={(abrir) => {
          if (abrir) return
          setAbierta(null)
          // Lo que se aprobo, corrigio o retiro dentro se ve en la lista al cerrar.
          router.refresh()
        }}
      >
        {abierta ? (
          <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-base leading-snug">{abierta.titular}</DialogTitle>
              {abierta.noticia && abierta.noticia !== abierta.titular ? <DialogDescription>Noticia: {abierta.noticia}</DialogDescription> : null}
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <PanelRecurso angleId={abierta.angleId} />
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}

function Filtros<T extends string>({
  etiqueta,
  valor,
  onCambio,
  opciones,
}: {
  etiqueta: string
  valor: T
  onCambio: (v: T) => void
  opciones: { valor: T; nombre: string; cuenta?: number }[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={etiqueta}>
      <span className="text-muted-foreground w-12 text-xs">{etiqueta}</span>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onCambio(o.valor)}
          aria-pressed={valor === o.valor}
          className={`rounded-md border px-2 py-1 text-xs transition-colors ${
            valor === o.valor ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent border-input"
          }`}
        >
          {o.nombre}
          {o.cuenta !== undefined ? <span className="ml-1 opacity-70">{o.cuenta}</span> : null}
        </button>
      ))}
    </div>
  )
}

function Fila({ fila: f, onAbrir }: { fila: FilaRecurso; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="hover:bg-accent/50 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors"
    >
      {f.portada ? (
        // eslint-disable-next-line @next/next/no-img-element -- portada publica del bucket
        <img src={f.portada} alt="" width={160} height={90} loading="lazy" className="hidden aspect-video w-40 shrink-0 rounded-md border object-cover sm:block" />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <EstadoBadge estado={f.estado} />
        {f.tipo ? <Badge variant="secondary">{NOMBRE_TIPO_RECURSO[f.tipo]}</Badge> : null}
        {f.palabra ? (
          <Badge variant="outline" className="font-mono">
            {f.palabra}
          </Badge>
        ) : null}
        {f.enCurso && f.estado !== "en_curso" ? (
          <Badge variant="outline" className="border-sky-300 text-sky-700 dark:text-sky-400">
            <LoaderCircleIcon className="size-3 animate-spin" />
            Nueva versión: {f.enCurso}
          </Badge>
        ) : null}
        <span className="text-muted-foreground ml-auto text-xs">{formatDateTime(f.fecha)}</span>
      </div>
      <p className="text-sm leading-snug font-medium">{f.titular}</p>
      {f.noticia && f.noticia !== f.titular ? <p className="text-muted-foreground line-clamp-1 text-xs">Noticia: {f.noticia}</p> : null}
      <Detalle fila={f} />
      </div>
    </button>
  )
}

function Detalle({ fila: f }: { fila: FilaRecurso }) {
  if (f.estado === "en_curso") return <p className="text-xs text-sky-700 dark:text-sky-400">El agente va {f.enCurso}.</p>
  if (f.estado === "fallido") return <p className="text-destructive line-clamp-2 text-xs">{f.error ?? "El agente no pudo escribirlo."}</p>
  const partes = [
    f.veredicto ? `Revisor: ${VEREDICTOS[f.veredicto]}` : null,
    f.palabras ? `${f.palabras.toLocaleString("es")} palabras` : null,
    f.version && f.version > 1 ? `versión ${f.version}` : null,
  ].filter(Boolean)
  return (
    <>
      {partes.length ? <p className="text-muted-foreground text-xs">{partes.join(" · ")}</p> : null}
      {f.webError ? <p className="text-destructive line-clamp-2 text-xs">No llegó a la web: {f.webError}</p> : null}
    </>
  )
}

function EstadoBadge({ estado }: { estado: EstadoFila }) {
  if (estado === "en_la_web")
    return (
      <Badge className="bg-emerald-600 text-white">
        <CheckIcon className="size-3" />
        En la web
      </Badge>
    )
  if (estado === "en_curso")
    return (
      <Badge variant="outline" className="border-sky-300 text-sky-700 dark:text-sky-400">
        <LoaderCircleIcon className="size-3 animate-spin" />
        Escribiéndose
      </Badge>
    )
  if (estado === "fallido") return <Badge variant="destructive">Falló</Badge>
  if (estado === "aprobado") return <Badge variant="secondary">Aprobado, sin publicar</Badge>
  return <Badge variant="outline">{NOMBRE_ESTADO[estado]}</Badge>
}
