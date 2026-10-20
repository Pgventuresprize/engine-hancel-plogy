"use client"

import * as React from "react"
import { ChevronRightIcon, ListIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"

import { borrarFila, guardarFila } from "@/app/capas/actions"
import { quitarLista, subtemasEnBloque, usarLista } from "@/app/capas/listas-actions"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Fila = { id: string; name: string; description: string | null; position: number }
type Tema = Fila & { pillar_id: string; subtemas: Fila[]; listas: { id: string; name: string; total: number }[] }
type Pilar = Fila & { temas: Tema[] }
type ListaOpcion = { id: string; name: string; total: number }

/**
 * El arbol pilar -> tema -> subtema.
 *
 * Los tres niveles se editan en el mismo sitio porque son la misma decision
 * vista de cerca: de que habla la cuenta, con cuanto detalle. Separarlos en tres
 * pantallas obligaria a saltar para ver que un subtema cuelga de que tema.
 *
 * Un subtema no es un agrupador: cuando existe, el agente habla del tema pero
 * enfocado a ese subtema. "Suelo/Abono" con subtema "cafe" es contenido de
 * suelos para cafe, no de suelos en general.
 */
export function EditorPilares({ pilares, listas }: { pilares: Pilar[]; listas: ListaOpcion[] }) {
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [nuevoPilar, setNuevoPilar] = React.useState("")

  const accion = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? "Algo fallo.")
    })
  }

  const crearPilar = () => {
    if (!nuevoPilar.trim()) return
    accion(async () => {
      const r = await guardarFila("content_pillars", { name: nuevoPilar.trim() })
      if (r.ok) setNuevoPilar("")
      return r
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">Pilares, temas y subtemas</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          De que habla la cuenta. Un pilar agrupa temas; un tema puede partirse en subtemas para
          enfocar mas.
        </p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {pilares.map((p) => (
        <PilarCard key={p.id} pilar={p} listas={listas} disabled={pending} accion={accion} />
      ))}

      <Card className="border-dashed">
        <CardContent className="flex items-center gap-2 py-3">
          <Input
            value={nuevoPilar}
            disabled={pending}
            placeholder="Nuevo pilar: Tendencias, Guías…"
            onChange={(e) => setNuevoPilar(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crearPilar()}
          />
          <Button size="icon" disabled={pending || !nuevoPilar.trim()} onClick={crearPilar}>
            <PlusIcon className="size-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function PilarCard({
  pilar,
  listas,
  disabled,
  accion,
}: {
  pilar: Pilar
  listas: ListaOpcion[]
  disabled: boolean
  accion: (fn: () => Promise<{ ok: boolean; error?: string }>) => void
}) {
  const [nuevoTema, setNuevoTema] = React.useState("")

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center gap-2">
          <NombreEditable
            valor={pilar.name}
            disabled={disabled}
            className="text-base font-semibold"
            onGuardar={(name) => accion(() => guardarFila("content_pillars", { id: pilar.id, name }))}
          />
          <Badge variant="secondary" className="shrink-0">
            {pilar.temas.length} temas
          </Badge>
          <BotonBorrar disabled={disabled} onClick={() => accion(() => borrarFila("content_pillars", pilar.id))} />
        </div>

        <div className="border-muted flex flex-col gap-2 border-l-2 pl-4">
          {pilar.temas.map((t) => (
            <TemaFila key={t.id} tema={t} listas={listas} disabled={disabled} accion={accion} />
          ))}

          <div className="flex items-center gap-2">
            <Input
              value={nuevoTema}
              disabled={disabled}
              placeholder="Nuevo tema…"
              className="h-8 text-sm"
              onChange={(e) => setNuevoTema(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !nuevoTema.trim()) return
                accion(async () => {
                  const r = await guardarFila("content_topics", { name: nuevoTema.trim() }, { pillar_id: pilar.id })
                  if (r.ok) setNuevoTema("")
                  return r
                })
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TemaFila({
  tema,
  listas,
  disabled,
  accion,
}: {
  tema: Tema
  listas: ListaOpcion[]
  disabled: boolean
  accion: (fn: () => Promise<{ ok: boolean; error?: string }>) => void
}) {
  const [abierto, setAbierto] = React.useState(false)
  const [nuevoSub, setNuevoSub] = React.useState("")

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="text-muted-foreground shrink-0"
          aria-label={abierto ? "Contraer" : "Expandir"}
        >
          <ChevronRightIcon className={`size-4 transition-transform ${abierto ? "rotate-90" : ""}`} />
        </button>
        <NombreEditable
          valor={tema.name}
          disabled={disabled}
          className="text-sm font-medium"
          onGuardar={(name) => accion(() => guardarFila("content_topics", { id: tema.id, name }))}
        />
        {tema.subtemas.length + tema.listas.reduce((s, l) => s + l.total, 0) > 0 ? (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {tema.subtemas.length + tema.listas.reduce((s, l) => s + l.total, 0)}
          </Badge>
        ) : null}
        <BotonBorrar disabled={disabled} onClick={() => accion(() => borrarFila("content_topics", tema.id))} />
      </div>

      {abierto ? (
        <div className="border-muted ml-5 flex flex-col gap-1 border-l pl-3">
          {/* Las listas que usa el tema: aportan sus elementos como subtemas. */}
          {tema.listas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 py-1">
              {tema.listas.map((l) => (
                <span key={l.id} className="bg-secondary inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs">
                  <ListIcon className="size-3" />
                  {l.name} · {l.total}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => accion(() => quitarLista(tema.id, l.id))}
                    className="text-muted-foreground hover:text-destructive rounded-full p-0.5"
                    aria-label={`Dejar de usar ${l.name}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {tema.subtemas.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <NombreEditable
                valor={s.name}
                disabled={disabled}
                className="text-muted-foreground text-sm"
                onGuardar={(name) => accion(() => guardarFila("content_subtopics", { id: s.id, name }))}
              />
              <BotonBorrar disabled={disabled} onClick={() => accion(() => borrarFila("content_subtopics", s.id))} />
            </div>
          ))}
          <Input
            value={nuevoSub}
            disabled={disabled}
            placeholder="Nuevo subtema (o pega varios, uno por línea)"
            className="h-7 text-xs"
            onChange={(e) => setNuevoSub(e.target.value)}
            onPaste={(e) => {
              // Pegar varios renglones crea un subtema por renglon.
              const texto = e.clipboardData.getData("text")
              if (!texto.includes("\n")) return
              e.preventDefault()
              accion(() => subtemasEnBloque(tema.id, texto))
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !nuevoSub.trim()) return
              accion(async () => {
                const r = await guardarFila("content_subtopics", { name: nuevoSub.trim() }, { topic_id: tema.id })
                if (r.ok) setNuevoSub("")
                return r
              })
            }}
          />
          {listas.filter((l) => !tema.listas.some((u) => u.id === l.id)).length > 0 ? (
            <Select value="" onValueChange={(v) => v && accion(() => usarLista(tema.id, v as string))}>
              <SelectTrigger size="sm" className="mt-1 h-7 w-fit text-xs" disabled={disabled}>
                <SelectValue>{() => "Usar una lista de subtemas…"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {listas
                  .filter((l) => !tema.listas.some((u) => u.id === l.id))
                  .map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({l.total})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function NombreEditable({
  valor,
  disabled,
  className,
  onGuardar,
}: {
  valor: string
  disabled: boolean
  className?: string
  onGuardar: (name: string) => void
}) {
  const [texto, setTexto] = React.useState(valor)
  // Ajuste durante render, no en efecto: cuando la fila se guarda y vuelve del
  // servidor con el valor nuevo, el input se sincroniza sin el setState-en-efecto
  // que el compilador rechaza.
  const [previo, setPrevio] = React.useState(valor)
  if (valor !== previo) {
    setPrevio(valor)
    setTexto(valor)
  }

  return (
    <Input
      value={texto}
      disabled={disabled}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const limpio = texto.trim()
        if (limpio && limpio !== valor) onGuardar(limpio)
        else setTexto(valor)
      }}
      className={`h-8 flex-1 border-transparent bg-transparent px-1 hover:border-input focus:border-input ${className ?? ""}`}
    />
  )
}

function BotonBorrar({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={disabled}
      onClick={onClick}
      aria-label="Borrar"
      className="text-muted-foreground hover:text-destructive size-7 shrink-0"
    >
      <Trash2Icon className="size-3.5" />
    </Button>
  )
}
