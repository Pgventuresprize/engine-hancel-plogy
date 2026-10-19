"use client"

import * as React from "react"

import { updateGenerationConfig, type ActionResult } from "@/app/estudio/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { GenerationConfig } from "@/engine/content/types"
// Las mismas listas que valida el servidor al guardar: la interfaz no puede
// ofrecer un valor que la accion vaya a rechazar. El modulo solo tiene
// constantes y tipos, asi que se puede importar desde el cliente.
import { IDIOMAS, LONGITUDES, TONOS } from "@/engine/content/variables"

/**
 * Como habla la marca.
 *
 * No son instrucciones libres: son valores acotados que encajan en huecos que
 * el prompt de cada agente ya dejo abiertos. El texto del prompt se edita en la
 * pagina de su agente, no aqui; aqui vive lo que es igual para todos.
 */
export function Comunicacion({ config }: { config: GenerationConfig }) {
  const [variables, setVariables] = React.useState(config.variables)
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const set = (clave: keyof typeof variables, valor: string) => {
    setResult(null)
    setVariables((actual) => ({ ...actual, [clave]: valor }))
  }

  const dirty = JSON.stringify(variables) !== JSON.stringify(config.variables)

  const save = () => {
    const form = new FormData()
    // Solo las variables: el umbral se guarda en General, y la accion no lo
    // toca si el formulario no lo trae.
    for (const [clave, valor] of Object.entries(variables)) form.set(clave, valor)

    setResult(null)
    startTransition(async () => setResult(await updateGenerationConfig(form)))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Comunicacion</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Se guardan una vez y se inyectan en cada generacion, para todos los agentes.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Selector
            label="Tono"
            value={variables.tono}
            options={[...TONOS]}
            onChange={(v) => set("tono", v)}
          />
          <Selector
            label="Longitud"
            value={variables.longitud}
            options={[...LONGITUDES]}
            onChange={(v) => set("longitud", v)}
          />
          <Selector
            label="Idioma"
            value={variables.idioma}
            options={[...IDIOMAS]}
            onChange={(v) => set("idioma", v)}
          />
        </div>

        <Campo
          id="audiencia"
          label="Audiencia"
          hint="Ej: founders early-stage LATAM"
          value={variables.audiencia}
          onChange={(v) => set("audiencia", v)}
        />
        <Campo
          id="voz_marca"
          label="Voz de marca"
          hint="Ej: primera persona plural, somos una agencia"
          value={variables.voz_marca}
          onChange={(v) => set("voz_marca", v)}
        />
        <Campo
          id="cta"
          label="Llamada a la accion"
          hint="Ej: invitar a agendar demo"
          value={variables.cta}
          onChange={(v) => set("cta", v)}
        />
        <Campo
          id="evitar"
          label="Evitar"
          hint="Ej: no mencionar competidores"
          value={variables.evitar}
          onChange={(v) => set("evitar", v)}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          {result?.ok ? <span className="text-sm text-emerald-600">Guardado.</span> : null}
          {result && !result.ok ? (
            <span className="text-destructive text-sm">{result.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function Selector({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => onChange(opcion)}
            aria-pressed={value === opcion}
            className={`rounded-md border px-2.5 py-1.5 text-xs capitalize transition-colors ${
              value === opcion
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent border-input"
            }`}
          >
            {opcion}
          </button>
        ))}
      </div>
    </div>
  )
}

function Campo({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={2}
        maxLength={240}
        placeholder={hint}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
