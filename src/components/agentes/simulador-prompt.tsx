"use client"

import * as React from "react"

import { simularPrompt, type Simulacion } from "@/app/agentes/actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { Receta } from "@/engine/agents/armador"
import { TOPE_PROMPT } from "@/engine/marca/bloque"
import { NOMBRE_OBJETIVO, OBJETIVOS } from "@/engine/marca/clasificacion"
import { FORMATOS_ANGULO, NOMBRE_FORMATO, NOMBRE_TIPO_CTA, type Situacion } from "@/engine/marca/cuando"
import type { TipoCta } from "@/engine/marca/editorial-modelo"

/** 12345 -> "12.345", igual en el servidor y en el navegador. */
const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".")

type Opcion = { id: string; name: string }
type CtaOpcion = { id: string; name: string; tipo: TipoCta }

const SELECT =
  "border-input bg-background h-8 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

/**
 * El prompt que recibiria el agente segun como venga clasificada la pieza.
 *
 * Sustituye al "Ver prompt final" en los agentes que escriben una pieza ya
 * clasificada: ahi el prompt depende del pilar, del CTA y de las senales, y
 * uno solo no lo cuenta. No llama a Claude ni escribe nada.
 */
export function SimuladorPrompt({
  clave,
  pilares,
  ctas,
  inicial,
  situacionInicial,
}: {
  clave: string
  pilares: Opcion[]
  ctas: CtaOpcion[]
  inicial: Simulacion
  situacionInicial: Situacion
}) {
  const [situacion, setSituacion] = React.useState<Situacion>(situacionInicial)
  const [ctaId, setCtaId] = React.useState<string>(ctas.find((c) => c.tipo === situacionInicial.cta_tipo)?.id ?? "")
  const [resultado, setResultado] = React.useState<Simulacion>(inicial)
  const [pending, startTransition] = React.useTransition()

  const cambiar = (nueva: Situacion) => {
    setSituacion(nueva)
    startTransition(async () => setResultado(await simularPrompt(clave, nueva)))
  }
  const set = <K extends keyof Situacion>(k: K, v: Situacion[K]) => cambiar({ ...situacion, [k]: v })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Simulador del prompt</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          El prompt cambia según cómo venga clasificada la pieza. Elige una clasificación y mira el prompt exacto que
          recibiría el agente, qué entra y qué no. No gasta nada.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">Pilar</Label>
            <select className={SELECT} value={situacion.pilar ?? ""} onChange={(e) => set("pilar", e.target.value || null)}>
              <option value="">Sin pilar</option>
              {pilares.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Objetivo</Label>
            <select
              className={SELECT}
              value={situacion.objetivo ?? ""}
              onChange={(e) => set("objetivo", (e.target.value || null) as Situacion["objetivo"])}
            >
              <option value="">Sin objetivo</option>
              {OBJETIVOS.map((o) => (
                <option key={o} value={o}>
                  {NOMBRE_OBJETIVO[o]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">CTA</Label>
            <select
              className={SELECT}
              value={ctaId}
              onChange={(e) => {
                setCtaId(e.target.value)
                set("cta_tipo", ctas.find((c) => c.id === e.target.value)?.tipo ?? null)
              }}
            >
              <option value="">Sin CTA</option>
              {ctas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({NOMBRE_TIPO_CTA[c.tipo]})
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Formato del ángulo</Label>
            <select className={SELECT} value={situacion.formato ?? ""} onChange={(e) => set("formato", e.target.value || null)}>
              <option value="">Sin formato</option>
              {FORMATOS_ANGULO.map((f) => (
                <option key={f} value={f}>
                  {NOMBRE_FORMATO[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="sim-logro" checked={situacion.logro} onCheckedChange={(x) => set("logro", Boolean(x))} />
            <Label htmlFor="sim-logro" className="text-sm font-normal">
              Es un logro
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="sim-poco"
              checked={situacion.poco_material}
              onCheckedChange={(x) => set("poco_material", Boolean(x))}
            />
            <Label htmlFor="sim-poco" className="text-sm font-normal">
              Poco material
            </Label>
          </div>
        </div>

        <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {resultado.ok ? (
            <Resultado fijo={resultado.fijo} resto={resultado.resto} receta={resultado.receta} />
          ) : (
            <p className="text-destructive text-sm">{resultado.error}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Resultado({ fijo, resto, receta }: { fijo: string; resto: string; receta: Receta }) {
  return (
    <div className="flex flex-col gap-3">
      <RecetaDelPrompt receta={receta} />
      {receta.caracteres > TOPE_PROMPT ? (
        <p className="text-xs text-amber-600">
          Pasa de {miles(TOPE_PROMPT)} caracteres. Revisa si sobra algo en la marca, el oficio o las skills.
        </p>
      ) : null}
      <details className="rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Ver el prompt</summary>
        <pre className="bg-muted mt-2 max-h-[32rem] overflow-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {fijo}
          {"\n\n"}
          <span className="text-muted-foreground">{"──────── desde aquí cambia según la pieza ────────"}</span>
          {"\n\n"}
          {resto}
        </pre>
      </details>
    </div>
  )
}

const etiqueta = (p: { capa: string; nombre: string }) =>
  p.capa === "skill" ? `Skill: ${p.nombre}` : p.capa === "ejemplo" ? `Ejemplo: ${p.nombre}` : p.nombre

/**
 * Que entro en el prompt y que no, y por que. La usa tambien la ficha de una
 * pieza, con la receta que se guardo al escribirla.
 */
export function RecetaDelPrompt({ receta }: { receta: Receta }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-muted-foreground">
        {receta.situacion} · {miles(receta.caracteres)} caracteres, {miles(receta.fijo)} fijos (se reaprovechan entre
        llamadas)
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">Entró:</span>
        {receta.entro.map((e, i) => (
          <Badge key={i} variant={e.porCondicion ? "default" : "secondary"} className="font-normal">
            {etiqueta(e)}
          </Badge>
        ))}
      </div>
      {receta.fuera.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">Fuera:</span>
          <ul className="text-muted-foreground flex flex-col gap-0.5">
            {receta.fuera.map((f, i) => (
              <li key={i}>
                {etiqueta(f)} · {f.porque}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
