"use client"

import * as React from "react"
import { ChevronRightIcon, ListPlusIcon, Trash2Icon, XIcon } from "lucide-react"

import {
  anadirALista,
  borrarElemento,
  borrarLista,
  crearLista,
  renombrarLista,
} from "@/app/capas/listas-actions"
import type { ListaSubtemas } from "@/lib/capas-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

/**
 * Listas de subtemas reutilizables.
 *
 * "Frutas" con cien elementos se escribe una vez (pegandola, uno por linea) y
 * la usan los temas que la necesiten. Lo que cambie aqui cambia en todos esos
 * temas.
 */
export function EditorListas({ listas }: { listas: ListaSubtemas[] }) {
  const [error, setError] = React.useState<string | null>(null)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [nombre, setNombre] = React.useState("")
  const [elementos, setElementos] = React.useState("")

  const accion = (fn: () => Promise<{ ok: boolean; error?: string; agregados?: number }>, exito?: (n?: number) => string) => {
    setError(null)
    setAviso(null)
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? "Algo falló.")
      else if (exito) setAviso(exito(r.agregados))
    })
  }

  const crear = () =>
    accion(async () => {
      const r = await crearLista(nombre, elementos)
      if (r.ok) {
        setNombre("")
        setElementos("")
      }
      return r
    }, (n) => `Lista creada con ${n ?? 0} elementos.`)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">Listas de subtemas</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Escríbelas una vez y úsalas en varios temas. Si 100 frutas sirven para Suelo/Abono y para Riego, se
          crean aquí y cada tema elige la lista. Lo que cambie aquí cambia en todos los temas que la usan.
        </p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {aviso ? <p className="text-sm text-success">{aviso}</p> : null}

      {listas.map((l) => (
        <ListaCard key={l.id} lista={l} disabled={pending} accion={accion} />
      ))}

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-2 py-3">
          <Input value={nombre} disabled={pending} placeholder="Nueva lista: Frutas, Hortalizas…" onChange={(e) => setNombre(e.target.value)} />
          <Textarea
            value={elementos}
            disabled={pending}
            rows={4}
            placeholder={"Pega los elementos, uno por línea:\nMango\nAguacate\nFresa…"}
            onChange={(e) => setElementos(e.target.value)}
            className="text-sm"
          />
          <div>
            <Button size="sm" disabled={pending || !nombre.trim()} onClick={crear}>
              <ListPlusIcon className="size-4" />
              Crear lista
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ListaCard({
  lista,
  disabled,
  accion,
}: {
  lista: ListaSubtemas
  disabled: boolean
  accion: (fn: () => Promise<{ ok: boolean; error?: string; agregados?: number }>, exito?: (n?: number) => string) => void
}) {
  const [abierta, setAbierta] = React.useState(false)
  const [nombre, setNombre] = React.useState(lista.name)
  const [previo, setPrevio] = React.useState(lista.name)
  if (lista.name !== previo) {
    setPrevio(lista.name)
    setNombre(lista.name)
  }
  const [nuevos, setNuevos] = React.useState("")
  const muestra = lista.elementos.slice(0, 12)

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAbierta((v) => !v)} className="text-muted-foreground shrink-0" aria-label={abierta ? "Contraer" : "Expandir"}>
            <ChevronRightIcon className={`size-4 transition-transform ${abierta ? "rotate-90" : ""}`} />
          </button>
          <Input
            value={nombre}
            disabled={disabled}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => {
              const limpio = nombre.trim()
              if (limpio && limpio !== lista.name) accion(() => renombrarLista(lista.id, limpio))
              else setNombre(lista.name)
            }}
            className="h-8 flex-1 border-transparent bg-transparent px-1 font-medium hover:border-input focus:border-input"
          />
          <Badge variant="secondary" className="shrink-0">
            {lista.elementos.length} elementos
          </Badge>
          <Badge variant="outline" className="shrink-0">
            {lista.usos === 1 ? "1 tema" : `${lista.usos} temas`}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Borrar lista"
            title={lista.usos ? "Se quitará de los temas que la usan" : "Borrar lista"}
            className="text-muted-foreground hover:text-destructive size-7 shrink-0"
            onClick={() => accion(() => borrarLista(lista.id))}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>

        {!abierta ? (
          <p className="text-muted-foreground pl-6 text-xs">
            {muestra.map((e) => e.name).join(", ")}
            {lista.elementos.length > muestra.length ? ` y ${lista.elementos.length - muestra.length} más` : ""}
          </p>
        ) : (
          <div className="flex flex-col gap-2 pl-6">
            <div className="flex flex-wrap gap-1.5">
              {lista.elementos.map((el) => (
                <span key={el.id} className="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs">
                  {el.name}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => accion(() => borrarElemento(el.id))}
                    className="text-muted-foreground hover:text-destructive rounded-full p-0.5"
                    aria-label={`Quitar ${el.name}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <Textarea
              value={nuevos}
              disabled={disabled}
              rows={3}
              placeholder="Añadir elementos, uno por línea…"
              onChange={(e) => setNuevos(e.target.value)}
              className="text-sm"
            />
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || !nuevos.trim()}
                onClick={() =>
                  accion(async () => {
                    const r = await anadirALista(lista.id, nuevos)
                    if (r.ok) setNuevos("")
                    return r
                  }, (n) => `${n ?? 0} elementos añadidos${lista.usos ? " y llevados a los temas que usan la lista" : ""}.`)
                }
              >
                Añadir a la lista
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
