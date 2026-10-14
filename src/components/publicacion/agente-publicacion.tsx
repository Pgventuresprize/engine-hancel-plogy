"use client"

import * as React from "react"

import { guardarPublicacion } from "@/app/publicacion/actions"
import type { EstadoRed, PublicacionVista } from "@/lib/publicacion-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const REDES = [
  { id: "instagram", nombre: "Instagram" },
  { id: "facebook", nombre: "Facebook" },
]

/**
 * El agente de publicacion: sus ajustes y el plan de hoy.
 *
 * El plan sale de las recetas encendidas: cada una publica tantas piezas al dia
 * como genera, en huecos que se turnan entre recetas e intercalan pilares. Cada
 * pieza se publica a la hora de su hueco con las conexiones de Facebook e
 * Instagram de la empresa; un carrusel de
 * Instagram sale igual en Facebook, con todas sus laminas.
 */
export function Publicacion({ vista }: { vista: PublicacionVista }) {
  const a = vista.ajustes
  const [activo, setActivo] = React.useState(a.activo)
  const [desde, setDesde] = React.useState(a.desde)
  const [cada, setCada] = React.useState(String(a.cadaMin))
  const [redes, setRedes] = React.useState<string[]>(a.redes)
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)
  const [pending, startTransition] = React.useTransition()

  const guardar = () => {
    setAviso(null)
    startTransition(async () => {
      const r = await guardarPublicacion({ activo, desde, cadaMin: Number(cada), redes })
      setAviso(r.ok ? { ok: true, texto: "Publicación guardada." } : { ok: false, texto: r.error })
    })
  }

  const programadas = vista.huecos.filter((h) => h.instagram || h.facebook).length

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agente de publicación</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Cada receta publica al día las piezas que genera. Las publicaciones salen una cada tantos
            minutos desde la hora de inicio, turnando recetas e intercalando pilares, y quedan
            publican a su hora con las conexiones de Facebook e Instagram de la empresa (Configuración → Conexiones).
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Switch checked={activo} disabled={pending} onCheckedChange={setActivo} aria-label="Publicación activa" />
            <span className="text-sm">{activo ? "Activa" : "Apagada"}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pub-desde">Desde (hora local)</Label>
              <Input id="pub-desde" type="time" value={desde} disabled={pending} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pub-cada">Cada (minutos)</Label>
              <Input id="pub-cada" type="number" min={5} max={240} value={cada} disabled={pending} onChange={(e) => setCada(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Redes</Label>
              <div className="flex flex-wrap gap-1.5">
                {REDES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={pending}
                    onClick={() => setRedes((v) => (v.includes(r.id) ? v.filter((x) => x !== r.id) : [...v, r.id]))}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      redes.includes(r.id) ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {r.nombre}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {aviso ? <p className={`text-sm ${aviso.ok ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p> : null}
          <div>
            <Button onClick={guardar} disabled={pending}>
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Plan de hoy</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            {vista.huecos.length} publicaciones · {programadas} ya salieron o se están publicando. El agente
            revisa cada cinco minutos y publica cada hueco a su hora.
          </p>
        </CardHeader>
        <CardContent>
          {vista.huecos.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay recetas encendidas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Receta</TableHead>
                  <TableHead>Pieza</TableHead>
                  <TableHead>Instagram</TableHead>
                  <TableHead>Facebook</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vista.huecos.map((h) => (
                  <TableRow key={h.slot}>
                    <TableCell className="whitespace-nowrap font-medium">{h.hora}</TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-xs">{h.pilar}</span>
                      <br />
                      <span className="text-xs">{h.receta}</span>
                    </TableCell>
                    <TableCell className="max-w-56 text-xs" title={h.pieza ?? ""}>
                      {h.pieza ? <span className="line-clamp-2">{h.pieza}</span> : null}
                      {h.pendiente?.tipo === "sinPieza" ? (
                        <span className="text-amber-600">Sin pieza: la receta genera a las {h.pendiente.generaA}</span>
                      ) : null}
                    </TableCell>
                    {h.pendiente?.tipo === "prevista" ? (
                      <TableCell colSpan={2} className="text-muted-foreground text-xs">
                        Lista. Se publica {h.pendiente.seProgramaA}
                      </TableCell>
                    ) : (
                      <>
                        <TableCell>
                          <Estado e={h.instagram} />
                        </TableCell>
                        <TableCell>
                          <Estado e={h.facebook} />
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Estado({ e }: { e: EstadoRed }) {
  if (!e) return <span className="text-muted-foreground text-xs">—</span>
  if (e.status === "publicada") return <Badge className="bg-emerald-600 text-white">Publicada</Badge>
  if (e.status === "programada") return <Badge variant="secondary">Programada</Badge>
  if (e.status === "programando") return <Badge variant="outline">Programando…</Badge>
  return (
    <Badge variant="destructive" title={e.error ?? ""}>
      Error
    </Badge>
  )
}
