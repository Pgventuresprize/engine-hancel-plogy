"use client"

import * as React from "react"

import { guardarHorario, guardarModo, type ActionResult } from "@/app/agentes/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EXPLICACION_MODO } from "@/lib/agentes-catalogo"

type Modo = "manual" | "programado" | "automatico"

const NOMBRE: Record<Modo, string> = {
  manual: "Manual",
  programado: "Programado",
  automatico: "Automatico",
}

/**
 * Cuando corre un agente.
 *
 * Los tres modos se enseñan como tres opciones al mismo nivel, no como un
 * interruptor con ajustes: antes "automatico" queria decir dos cosas distintas
 * —a una hora, o en cuanto llega el trabajo— y nadie podia saber cual sin leer
 * el codigo. Cada uno lleva su frase explicandose.
 */
/** Un minuto del dia como hora legible: 545 es 09:05. */
function comoHora(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * Lee lo que se escribio: "9", "9:20", "18.30", separados por comas o espacios.
 *
 * Se acepta la hora suelta porque es como se escribe deprisa, y "9" no puede
 * significar otra cosa que las nueve en punto. Lo que no se entiende se
 * descarta en silencio; el campo vuelve a pintarse normalizado al guardar, asi
 * que se ve enseguida que se quedo fuera.
 */
function leerHoras(texto: string): number[] {
  const minutos: number[] = []

  for (const trozo of texto.split(/[,;\s]+/)) {
    const limpio = trozo.trim()
    if (!limpio) continue

    const partes = limpio.split(/[:.]/)
    const h = Number(partes[0])
    const m = partes.length > 1 ? Number(partes[1]) : 0
    if (!Number.isInteger(h) || h < 0 || h > 23) continue
    if (!Number.isInteger(m) || m < 0 || m > 59) continue
    minutos.push(h * 60 + m)
  }

  return [...new Set(minutos)].sort((a, b) => a - b)
}

export function CronEditor({
  clave,
  modos,
  modo,
  horas,
  tanda,
  canal = "",
  titulo = "Cron",
  proximas,
  porCanal = false,
  soloLectura = false,
}: {
  clave: string
  modos: Modo[]
  modo: Modo
  /** Minutos del dia. */
  horas: number[]
  /** Cuantas piezas por pasada. Solo tiene sentido en publicacion. */
  tanda: number
  canal?: string
  titulo?: string
  /** Las proximas pasadas previstas, ya calculadas en el servidor. */
  proximas: string[]
  /** Es el agente de publicacion, el unico que publica por tandas. */
  porCanal?: boolean
  soloLectura?: boolean
}) {
  const [elegido, setElegido] = React.useState<Modo>(modo)
  const [texto, setTexto] = React.useState(horas.map(comoHora).join(", "))
  const [porTanda, setPorTanda] = React.useState(String(tanda))
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const cambiarModo = (m: Modo) => {
    if (soloLectura) return
    setResult(null)
    setElegido(m)
    startTransition(async () => setResult(await guardarModo(clave, m, canal)))
  }

  const guardarHoras = () => {
    const minutos = leerHoras(texto)
    setResult(null)
    startTransition(async () => {
      const r = await guardarHorario(
        clave,
        minutos,
        canal,
        porCanal ? Number(porTanda) || 1 : undefined
      )
      setResult(r)
      // Se repinta normalizado: asi se ve que entendio y que descarto.
      if (r.ok) setTexto(minutos.map(comoHora).join(", "))
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">{EXPLICACION_MODO[elegido]}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {modos.map((m) => (
            <button
              key={m}
              type="button"
              disabled={soloLectura || pending}
              onClick={() => cambiarModo(m)}
              aria-pressed={elegido === m}
              className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-60 ${
                elegido === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent border-input"
              }`}
            >
              {NOMBRE[m]}
            </button>
          ))}
        </div>

        {elegido === "programado" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`horas-${clave}-${canal}`}>Horas</Label>
              <Input
                id={`horas-${clave}-${canal}`}
                placeholder="9:00, 9:20, 13:30, 18:00"
                value={texto}
                disabled={soloLectura}
                onChange={(e) => {
                  setResult(null)
                  setTexto(e.target.value)
                }}
                className="font-mono"
              />
              <p className="text-muted-foreground text-xs">
                Separadas por comas, con minuto propio cada una. &quot;9&quot; son las 09:00.
              </p>
            </div>

            {porCanal ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`tanda-${clave}-${canal}`}>Piezas por pasada</Label>
                <Input
                  id={`tanda-${clave}-${canal}`}
                  className="w-24 font-mono"
                  value={porTanda}
                  disabled={soloLectura}
                  onChange={(e) => {
                    setResult(null)
                    setPorTanda(e.target.value)
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  Cuantas salen en cada hora. Lo que sobre espera a la siguiente.
                </p>
              </div>
            ) : null}

            <div>
              <Button onClick={guardarHoras} disabled={pending || soloLectura}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        ) : null}

        {proximas.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            Proximas pasadas: {proximas.join(" · ")}
          </p>
        ) : null}

        {soloLectura ? (
          <p className="text-muted-foreground text-xs">
            Se configura en el agente del que sale. Aqui solo se consulta.
          </p>
        ) : null}

        {result?.ok ? <span className="text-sm text-success">Guardado.</span> : null}
        {result && !result.ok ? (
          <span className="text-destructive text-sm">{result.error}</span>
        ) : null}
      </CardContent>
    </Card>
  )
}
