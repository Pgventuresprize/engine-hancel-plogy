"use client"

import * as React from "react"
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { borrarEjemploMarca, guardarEjemploMarca } from "@/app/configuracion/marca/ejemplos-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { NOMBRE_OBJETIVO, OBJETIVOS } from "@/engine/marca/clasificacion"
import { NOMBRE_TIPO_CTA } from "@/engine/marca/cuando"
import { TIPOS_CTA } from "@/engine/marca/editorial-modelo"
import {
  NOMBRE_RED_EJEMPLO,
  REDES_EJEMPLO,
  TOPES_EJEMPLO,
  type CamposEjemplo,
  type Ejemplo,
} from "@/engine/marca/ejemplos-modelo"

import { CampoTexto, useFormulario } from "./campos"

type Pilar = { id: string; name: string }

const VACIO: CamposEjemplo = {
  red: "instagram",
  nombre: "",
  texto: "",
  por_que: "",
  pilar_id: null,
  cta_tipo: null,
  objetivo: null,
  origen: "",
  activo: true,
}

const SELECT =
  "border-input bg-background h-8 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

/**
 * Los ejemplos de la marca: piezas suyas que salieron bien. En cada pieza
 * entran los dos de su red que mas se le parecen; lo que se dice aqui de cada
 * uno (pilar, CTA, objetivo) es lo que decide cuales.
 */
export function PestanaEjemplos({ ejemplos, pilares }: { ejemplos: Ejemplo[]; pilares: Pilar[] }) {
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [nuevo, setNuevo] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const nombrePilar = (id: string | null) => (id ? (pilares.find((p) => p.id === id)?.name ?? "(pilar borrado)") : null)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">Ejemplos de la marca</h3>
        <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
          Piezas tuyas que salieron bien. Las reglas dicen qué hacer; un ejemplo enseña cómo suena y cómo avanza una pieza
          de tu marca. En cada pieza entran los dos de su red que más se le parecen: primero el mismo pilar, después el
          mismo tipo de CTA y después el mismo objetivo. Si hay empate, rotan entre piezas para que no salga siempre la
          misma receta. El revisor frena una pieza que copie siete palabras seguidas de un ejemplo.
        </p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {ejemplos.length === 0 && !nuevo ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          Todavía no hay ejemplos. Puedes crearlos aquí o con «Guardar como ejemplo» en la ficha de una pieza que te guste.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {ejemplos.map((e) => (
          <Card key={e.id}>
            <CardContent className="flex flex-col gap-3 py-3">
              <button
                type="button"
                onClick={() => setAbierto(abierto === e.id ? null : e.id)}
                aria-expanded={abierto === e.id}
                className="flex min-w-0 flex-col items-start gap-1.5 text-left"
              >
                <span className="flex w-full items-center gap-2">
                  <span className="truncate text-sm font-medium">{e.nombre}</span>
                  {!e.activo ? <Badge variant="outline">Inactivo</Badge> : null}
                  <ChevronDownIcon
                    className={`text-muted-foreground ml-auto size-4 shrink-0 transition-transform ${abierto === e.id ? "rotate-180" : ""}`}
                  />
                </span>
                <span className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="font-normal">
                    {NOMBRE_RED_EJEMPLO[e.red]}
                  </Badge>
                  {nombrePilar(e.pilar_id) ? (
                    <Badge variant="outline" className="font-normal">
                      {nombrePilar(e.pilar_id)}
                    </Badge>
                  ) : null}
                  {e.cta_tipo ? (
                    <Badge variant="outline" className="font-normal">
                      CTA {NOMBRE_TIPO_CTA[e.cta_tipo]}
                    </Badge>
                  ) : null}
                  {e.origen ? <span className="text-muted-foreground self-center text-xs">· {e.origen}</span> : null}
                </span>
                {e.por_que ? <span className="text-muted-foreground text-xs">{e.por_que}</span> : null}
              </button>
              {abierto === e.id ? (
                <EditorEjemplo
                  inicial={e}
                  pilares={pilares}
                  guardar={(campos) => guardarEjemploMarca(e.id, campos)}
                  onBorrar={() => {
                    if (!window.confirm(`¿Borrar el ejemplo "${e.nombre}"?`)) return
                    setError(null)
                    startTransition(async () => {
                      const r = await borrarEjemploMarca(e.id)
                      if (!r.ok) setError(r.error)
                    })
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {nuevo ? (
        <Card className="border-dashed">
          <CardContent className="py-3">
            <EditorEjemplo
              inicial={VACIO}
              pilares={pilares}
              guardar={async (campos) => {
                const r = await guardarEjemploMarca(null, campos)
                if (r.ok) setNuevo(false)
                return r
              }}
              onCancelar={() => setNuevo(false)}
            />
          </CardContent>
        </Card>
      ) : (
        <div>
          <Button variant="outline" onClick={() => setNuevo(true)} disabled={pending}>
            <PlusIcon />
            Nuevo ejemplo
          </Button>
        </div>
      )}
    </div>
  )
}

function EditorEjemplo({
  inicial,
  pilares,
  guardar,
  onBorrar,
  onCancelar,
}: {
  inicial: CamposEjemplo
  pilares: Pilar[]
  guardar: (campos: CamposEjemplo) => Promise<{ ok: true } | { ok: false; error: string }>
  onBorrar?: () => void
  onCancelar?: () => void
}) {
  const f = useFormulario<CamposEjemplo>(
    {
      red: inicial.red,
      nombre: inicial.nombre,
      texto: inicial.texto,
      por_que: inicial.por_que,
      pilar_id: inicial.pilar_id,
      cta_tipo: inicial.cta_tipo,
      objetivo: inicial.objetivo,
      origen: inicial.origen,
      activo: inicial.activo,
    },
    guardar
  )
  const v = f.valores
  const base = React.useId()
  const id = (campo: string) => `${base}-${campo}`

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <CampoTexto
        id={id("nombre")}
        label="Nombre"
        placeholder="GPT-4o se apaga el 14 de enero"
        valor={v.nombre}
        tope={TOPES_EJEMPLO.nombre}
        filas={1}
        onChange={(x) => f.set("nombre", x)}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label className="text-xs">Red</Label>
          <select className={SELECT} value={v.red} onChange={(e) => f.set("red", e.target.value as CamposEjemplo["red"])}>
            {REDES_EJEMPLO.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_RED_EJEMPLO[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Pilar</Label>
          <select className={SELECT} value={v.pilar_id ?? ""} onChange={(e) => f.set("pilar_id", e.target.value || null)}>
            <option value="">Sin pilar</option>
            {pilares.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Tipo de CTA</Label>
          <select
            className={SELECT}
            value={v.cta_tipo ?? ""}
            onChange={(e) => f.set("cta_tipo", (e.target.value || null) as CamposEjemplo["cta_tipo"])}
          >
            <option value="">Sin CTA</option>
            {TIPOS_CTA.map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TIPO_CTA[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Objetivo</Label>
          <select
            className={SELECT}
            value={v.objetivo ?? ""}
            onChange={(e) => f.set("objetivo", (e.target.value || null) as CamposEjemplo["objetivo"])}
          >
            <option value="">Sin objetivo</option>
            {OBJETIVOS.map((o) => (
              <option key={o} value={o}>
                {NOMBRE_OBJETIVO[o]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <CampoTexto
        id={id("por_que")}
        label="Por qué es buena"
        ayuda="Lo que el agente tiene que aprender de ella. Sin esto ve una pieza y no sabe qué mirar: la copia."
        placeholder="La lámina de criterio da pasos que dependen de este hecho; cada cifra lleva su fuente."
        valor={v.por_que}
        tope={TOPES_EJEMPLO.por_que}
        filas={3}
        onChange={(x) => f.set("por_que", x)}
      />

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={id("texto")}>La pieza</Label>
          <span
            className={`text-xs tabular-nums ${v.texto.length > TOPES_EJEMPLO.texto * 0.9 ? "text-amber-600" : "text-muted-foreground"}`}
          >
            {v.texto.length} / {TOPES_EJEMPLO.texto}
          </span>
        </div>
        <Textarea
          id={id("texto")}
          rows={16}
          maxLength={TOPES_EJEMPLO.texto}
          value={v.texto}
          placeholder={"Lámina 1: …\nLámina 2: título. Cuerpo.\n…\nCierre: …\nCaption: …\nHashtags: …"}
          onChange={(e) => f.set("texto", e.target.value)}
          className="font-mono text-xs leading-relaxed"
        />
        <p className="text-muted-foreground text-xs">Es lo que lee el agente, tal cual.</p>
      </div>

      <div className="flex items-center gap-2">
        <Switch id={id("activo")} checked={v.activo} onCheckedChange={(x) => f.set("activo", Boolean(x))} />
        <Label htmlFor={id("activo")} className="text-sm font-normal">
          Activo
        </Label>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button onClick={f.onGuardar} disabled={f.pending || !f.dirty || !v.nombre.trim()}>
          {f.pending ? "Guardando…" : "Guardar ejemplo"}
        </Button>
        {onCancelar ? (
          <Button variant="ghost" onClick={onCancelar} disabled={f.pending}>
            Cancelar
          </Button>
        ) : null}
        {f.resultado?.ok && !f.dirty ? <span className="text-sm text-emerald-600">Guardado.</span> : null}
        {f.resultado && !f.resultado.ok ? <span className="text-destructive text-sm">{f.resultado.error}</span> : null}
        {onBorrar ? (
          <Button
            variant="ghost"
            onClick={onBorrar}
            disabled={f.pending}
            className="text-muted-foreground hover:text-destructive ml-auto"
          >
            <Trash2Icon />
            Borrar
          </Button>
        ) : null}
      </div>
    </div>
  )
}
