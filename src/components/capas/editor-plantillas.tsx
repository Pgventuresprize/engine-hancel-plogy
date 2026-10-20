"use client"

import * as React from "react"
import { CopyIcon, ExternalLinkIcon, PencilIcon, SparklesIcon, Trash2Icon } from "lucide-react"

import { borrarEstilo, crearEstilo, generarMuestra, guardarEstilo } from "@/app/capas/plantillas-actions"
import type { PlantillaVista } from "@/lib/plantillas-data"
import { FUENTES_PLANTILLA, TIPOS, type EstiloPlantilla } from "@/lib/plantillas-catalogo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

/**
 * La capa Plantilla: los estilos graficos.
 *
 * Un estilo no es de una red ni de un formato: cualquier receta lo usa, y el
 * sistema compone cada pieza para el tamano de su formato. Aqui se ve cada
 * estilo con una muestra real dibujada en Canva, y se ajusta lo que lo define:
 * la descripcion que leen los agentes, los colores, la tipografia y los
 * elementos fijos.
 */
export function EditorPlantillas({ plantillas }: { plantillas: PlantillaVista[] }) {
  const [editando, setEditando] = React.useState<PlantillaVista | null>(null)
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupada, setOcupada] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const correr = (id: string | null, fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) => {
    setAviso(null)
    setOcupada(id)
    startTransition(async () => {
      try {
        const r = await fn()
        setAviso(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.error ?? "Falló." })
      } catch {
        setAviso({ ok: false, texto: "No respondió a tiempo. Recarga en un momento para ver si terminó." })
      } finally {
        setOcupada(null)
      }
    })
  }

  const guardar = (campos: { name: string; descripcion: string; estilo: EstiloPlantilla }, conMuestra: boolean) => {
    if (!editando) return
    const id = editando.id
    setEditando(null)
    correr(
      id,
      async () => {
        const r = await guardarEstilo({ id, ...campos })
        if (!r.ok || !conMuestra) return r
        return generarMuestra(id)
      },
      conMuestra ? "Estilo guardado y muestra generada en Canva." : "Estilo guardado."
    )
  }

  const cuantosDeTipo = (tipo: string) => plantillas.filter((p) => p.tipo === tipo).length

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">Estilos gráficos</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Son transversales: cualquier receta, en cualquier canal y formato, usa uno. El sistema compone
          cada pieza para el tamaño de su formato siguiendo el estilo, y la deja editable en Canva.
        </p>
      </div>

      {aviso ? <p className={`text-sm ${aviso.ok ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {plantillas.map((p) => {
          const trabajando = ocupada === p.id || p.status === "creando"
          return (
            <Card key={p.id}>
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{p.name}</p>
                      <Badge variant="outline">{TIPOS[p.tipo].nombre}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">{TIPOS[p.tipo].resumen}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {(["fondo", "texto", "acento"] as const).map((c) => (
                      <span
                        key={c}
                        className="size-4 rounded-full border"
                        style={{ background: p.estilo.colores[c] }}
                        title={`${c}: ${p.estilo.colores[c]}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {p.muestras.length > 0 ? (
                    p.muestras.slice(0, 2).map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt="" className="aspect-[4/5] w-full rounded-md border object-cover" />
                    ))
                  ) : (
                    <div className="text-muted-foreground col-span-2 flex aspect-[8/5] items-center justify-center rounded-md border border-dashed px-6 text-center text-sm">
                      {trabajando ? "Componiendo la muestra en Canva…" : "Sin muestra todavía. Genera una para ver el estilo."}
                    </div>
                  )}
                </div>

                {p.status === "error" && p.error ? <p className="text-destructive text-xs">{p.error}</p> : null}

                <div className="flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditando(p)}>
                    <PencilIcon className="size-3.5" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant={p.muestras.length ? "ghost" : "default"}
                    disabled={pending}
                    onClick={() => correr(p.id, () => generarMuestra(p.id), "Muestra generada en Canva.")}
                  >
                    <SparklesIcon className="size-3.5" />
                    {trabajando ? "Generando…" : p.muestras.length ? "Nueva muestra" : "Generar muestra"}
                  </Button>
                  {p.canvaEditUrl ? (
                    <Button size="sm" variant="ghost" render={<a href={p.canvaEditUrl} target="_blank" rel="noreferrer" />}>
                      <ExternalLinkIcon className="size-3.5" />
                      Ver en Canva
                    </Button>
                  ) : null}
                  <div className="flex-1" />
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={pending}
                    title="Crear una variante de este estilo"
                    aria-label="Crear variante"
                    onClick={() => correr(null, () => crearEstilo(p.tipo), "Variante creada. Edítala para darle su propio aire.")}
                  >
                    <CopyIcon className="size-4" />
                  </Button>
                  {cuantosDeTipo(p.tipo) > 1 ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={pending}
                      aria-label="Borrar"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => correr(p.id, () => borrarEstilo(p.id), "Estilo borrado.")}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar estilo</DialogTitle>
          </DialogHeader>
          {editando ? <FormEstilo key={editando.id} plantilla={editando} disabled={pending} onGuardar={guardar} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FormEstilo({
  plantilla,
  disabled,
  onGuardar,
}: {
  plantilla: PlantillaVista
  disabled: boolean
  onGuardar: (campos: { name: string; descripcion: string; estilo: EstiloPlantilla }, conMuestra: boolean) => void
}) {
  const [name, setName] = React.useState(plantilla.name)
  const [descripcion, setDescripcion] = React.useState(plantilla.descripcion)
  const [e, setE] = React.useState<EstiloPlantilla>(plantilla.estilo)
  const set = <K extends keyof EstiloPlantilla>(k: K, v: EstiloPlantilla[K]) => setE((x) => ({ ...x, [k]: v }))
  const tipo = plantilla.tipo
  const colores: [keyof EstiloPlantilla["colores"], string][] = [
    ["fondo", "Fondo"],
    ["texto", "Texto"],
    ["textoSuave", "Texto suave"],
    ["acento", "Acento (dato clave)"],
    ...(tipo === "dataviz" || tipo === "infodatos"
      ? ([
          ["subida", "Subida"],
          ["bajada", "Bajada"],
        ] as [keyof EstiloPlantilla["colores"], string][])
      : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      <Campo label="Nombre">
        <Input value={name} disabled={disabled} onChange={(ev) => setName(ev.target.value)} />
      </Campo>

      <Campo label="Descripción del estilo (la leen los agentes al escribir y al pedir imágenes)">
        <Textarea
          rows={8}
          value={descripcion}
          disabled={disabled}
          onChange={(ev) => setDescripcion(ev.target.value)}
          className="text-sm"
        />
        <p className="text-muted-foreground text-xs">Vacía, vuelve a la descripción de serie de {TIPOS[tipo].nombre}.</p>
      </Campo>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">Paleta y tipografía</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {colores.map(([clave, etiqueta]) => (
            <Campo key={clave} label={etiqueta}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={e.colores[clave]}
                  disabled={disabled}
                  onChange={(ev) => set("colores", { ...e.colores, [clave]: ev.target.value })}
                  className="h-8 w-10 cursor-pointer rounded border bg-transparent"
                />
                <span className="text-muted-foreground font-mono text-xs">{e.colores[clave]}</span>
              </div>
            </Campo>
          ))}
        </div>
        <Campo label="Tipografía">
          <Select value={e.fuente} onValueChange={(v) => set("fuente", v as EstiloPlantilla["fuente"])}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue>{() => e.fuente}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FUENTES_PLANTILLA.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">Elementos</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Interruptor label="Logo de la marca" checked={e.logo} disabled={disabled} onChange={(v) => set("logo", v)} />
          <Interruptor label="Numeración (02 / 07)" checked={e.numeracion} disabled={disabled} onChange={(v) => set("numeracion", v)} />
          <Campo label="Invitación a deslizar (carruseles)">
            <Input value={e.textoDesliza} disabled={disabled} placeholder="Vacío para no ponerla" onChange={(ev) => set("textoDesliza", ev.target.value)} />
          </Campo>
          {tipo === "fotografico" ? (
            <Campo label={`Oscurecer la foto bajo el texto: ${Math.round(e.velo * 100)}%`}>
              <input type="range" min={0.2} max={0.9} step={0.05} value={e.velo} disabled={disabled} onChange={(ev) => set("velo", Number(ev.target.value))} className="w-full" />
            </Campo>
          ) : null}
        </div>
        {tipo === "ilustracion" || tipo === "infografia" || tipo === "infodatos" ? (
          <Campo label="Cómo se piden las imágenes (en inglés: trazo, luz, fondo, nivel de detalle)">
            <Textarea rows={3} value={e.estiloVisual} disabled={disabled} onChange={(ev) => set("estiloVisual", ev.target.value)} className="font-mono text-xs" />
          </Campo>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Última lámina de los carruseles</p>
        <p className="text-muted-foreground text-xs">
          La escribe siempre el agente, con el CTA de cada pieza y lo que enseñó el carrusel.
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button variant="outline" disabled={disabled || !name.trim()} onClick={() => onGuardar({ name, descripcion, estilo: e }, false)}>
          Solo guardar
        </Button>
        <Button disabled={disabled || !name.trim()} onClick={() => onGuardar({ name, descripcion, estilo: e }, true)}>
          <SparklesIcon className="size-4" />
          Guardar y ver muestra
        </Button>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function Interruptor({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      {label}
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  )
}
