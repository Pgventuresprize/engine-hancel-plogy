"use client"

import * as React from "react"
import Link from "next/link"
import { CheckCircle2Icon } from "lucide-react"

import type { Canal, FormatoCanal } from "@/lib/canales-catalogo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

/**
 * Los canales y sus formatos, con una previsualizacion de cada lienzo.
 *
 * No es una lista hacia abajo: cada formato se dibuja como un frame a escala
 * con su proporcion real, para ver de un vistazo que un carrusel es vertical y
 * un post de Facebook apaisado. Es lo que decide, antes de elegir, si el
 * contenido va a caber donde se pretende.
 *
 * Los canales no se crean ni se editan: son universales. Lo unico accionable es
 * activarlos, que es conectar la cuenta, y eso sigue viviendo en Conexiones.
 */
export function VistaCanales({
  canales,
  conectados,
}: {
  canales: Canal[]
  /** Que conexiones estan activas: { instagram: true, ... }. */
  conectados: Record<string, boolean>
}) {
  const [abierto, setAbierto] = React.useState(canales[0]?.id ?? "")

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">Canales y formatos</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Donde puede salir el contenido y con que forma. Universales: aqui solo se activan
          conectando la cuenta.
        </p>
      </div>

      {/* Selector horizontal, no una pila vertical: los canales son pocos y se
          eligen de un toque, y asi el espacio de abajo queda para los frames. */}
      <div className="flex flex-wrap gap-2">
        {canales.map((c) => {
          const activo = conectados[c.conexion]
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setAbierto(c.id)}
              aria-pressed={abierto === c.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                abierto === c.id ? "border-primary ring-primary/40 ring-1" : "hover:bg-accent border-input"
              }`}
            >
              <span className="size-2.5 rounded-full" style={{ background: c.color }} />
              <span className="font-medium">{c.nombre}</span>
              {activo ? (
                <CheckCircle2Icon className="size-4 text-success" />
              ) : (
                <span className="text-muted-foreground text-xs">sin conectar</span>
              )}
            </button>
          )
        })}
      </div>

      {canales
        .filter((c) => c.id === abierto)
        .map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: c.color }} />
                <span className="font-semibold">{c.nombre}</span>
                {conectados[c.conexion] ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2Icon className="size-3 text-success" /> Conectado
                  </Badge>
                ) : null}
              </div>
              <Button variant={conectados[c.conexion] ? "outline" : "default"} size="sm" render={<Link href="/configuracion/conexiones" />}>
                {conectados[c.conexion] ? "Gestionar" : "Conectar"}
              </Button>
            </CardHeader>

            <CardContent>
              <div className="flex flex-wrap gap-5">
                {c.formatos.map((f) => (
                  <FrameFormato key={f.id} formato={f} />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}

/** Un formato dibujado a escala, con su proporcion real. */
function FrameFormato({ formato }: { formato: FormatoCanal }) {
  // La caja de referencia: el frame nunca pasa de aqui, y dentro respeta la
  // proporcion real. Un 9:16 sale alto y estrecho; un 1200x630, ancho y bajo.
  const CAJA = 128
  const soloTexto = formato.ancho === 0 || formato.alto === 0
  const ratio = soloTexto ? 1 : formato.ancho / formato.alto
  const ancho = soloTexto ? CAJA : ratio >= 1 ? CAJA : CAJA * ratio
  const alto = soloTexto ? CAJA * 0.7 : ratio >= 1 ? CAJA / ratio : CAJA

  return (
    <div className="flex w-32 flex-col items-center gap-2">
      <div className="flex h-32 items-center justify-center">
        <div
          className="bg-muted flex items-center justify-center rounded-md border"
          style={{ width: ancho, height: alto }}
        >
          {soloTexto ? (
            <div className="flex flex-col gap-1 px-3">
              <span className="bg-muted-foreground/40 h-1 w-14 rounded" />
              <span className="bg-muted-foreground/40 h-1 w-16 rounded" />
              <span className="bg-muted-foreground/40 h-1 w-10 rounded" />
            </div>
          ) : (
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {formato.ancho}×{formato.alto}
            </span>
          )}
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-medium">{formato.nombre}</p>
        <p className="text-muted-foreground mt-0.5 text-[11px] leading-tight">{formato.resumen}</p>
      </div>
    </div>
  )
}
