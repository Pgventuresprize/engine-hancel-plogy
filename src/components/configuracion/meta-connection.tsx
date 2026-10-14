"use client"

import * as React from "react"

import { conectarServicio, desconectarServicio, guardarPaginaFacebook } from "@/app/configuracion/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * Facebook o Instagram de la empresa, conectados a traves de Composio.
 *
 * Igual que Canva: solo hay que iniciar sesion, no hay ningun id que copiar.
 * Facebook publica en una pagina, asi que al conectar se elige cual; Instagram
 * publica en la cuenta business conectada.
 */
export function MetaConnection({
  red,
  conectado,
  detalle,
  paginas,
  paginaActual,
  recienConectado,
}: {
  red: "facebook" | "instagram"
  conectado: boolean
  /** Instagram: @usuario; Facebook: nombre de la pagina elegida. */
  detalle: string | null
  /** Facebook: las paginas que maneja la cuenta conectada. */
  paginas?: { id: string; name: string }[]
  paginaActual?: string | null
  recienConectado?: boolean
}) {
  const nombre = red === "facebook" ? "Facebook" : "Instagram"
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [aviso, setAviso] = React.useState<string | null>(null)

  const conectar = () => {
    setError(null)
    startTransition(async () => {
      const r = await conectarServicio(red)
      if (r.ok) window.location.href = r.url
      else setError(r.error)
    })
  }
  const quitar = () => {
    setError(null)
    startTransition(async () => {
      const r = await desconectarServicio(red)
      if (!r.ok) setError(r.error)
    })
  }
  const elegir = (id: string) => {
    const p = paginas?.find((x) => x.id === id)
    if (!p) return
    setError(null)
    setAviso(null)
    startTransition(async () => {
      const r = await guardarPaginaFacebook(p.id, p.name)
      if (r.ok) setAviso(`Publicará en ${p.name}.`)
      else setError(r.error)
    })
  }

  const faltaPagina = red === "facebook" && conectado && !paginaActual

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{nombre}</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          {!conectado
            ? `Sin conectar. Inicia sesión en ${nombre} para publicar los carruseles, las noticias y los videos de esta empresa.`
            : faltaPagina
              ? "Conectado. Falta elegir la página en la que se publica."
              : `Conectado${detalle ? `: ${detalle}` : ""}. Los carruseles, las noticias y los videos de esta empresa salen aquí.`}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {red === "facebook" && conectado ? (
          <div className="flex flex-col gap-1.5 sm:w-80">
            <span className="text-sm font-medium">Página donde se publica</span>
            {paginas && paginas.length ? (
              <Select value={paginaActual ?? ""} onValueChange={(v) => elegir(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => paginas.find((p) => p.id === paginaActual)?.name ?? "Elegir página"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {paginas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-muted-foreground text-sm">
                La cuenta conectada no administra ninguna página, o no dio permiso para verlas. Reconecta y marca la página.
              </span>
            )}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={conectar} disabled={pending} variant={conectado ? "outline" : "default"}>
            {pending ? `Abriendo ${nombre}…` : conectado ? "Reconectar" : `Conectar ${nombre}`}
          </Button>
          {conectado ? (
            <Button variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={quitar}>
              Desconectar
            </Button>
          ) : null}
          {recienConectado && conectado ? <span className="text-sm text-emerald-600">{nombre} quedó conectado.</span> : null}
          {recienConectado && !conectado ? <span className="text-destructive text-sm">No se completó la conexión. Vuelve a intentarlo.</span> : null}
          {aviso ? <span className="text-sm text-emerald-600">{aviso}</span> : null}
          {error ? <span className="text-destructive text-sm">{error}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
