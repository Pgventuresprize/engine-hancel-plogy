"use client"

import * as React from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import {
  desconectarWeb,
  guardarWebNoticias,
  mostrarSecretoWeb,
  probarWeb,
  rotarSecretoWeb,
  type ResultadoWeb,
} from "@/app/configuracion/web-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * El portal de noticias de la empresa, como un canal mas: la URL a la que se
 * envian las noticias redactadas y el secreto con que se firman.
 *
 * El secreto lo genera el motor al conectar; se copia una vez al portal
 * (HANCEL_WEBHOOK_SECRET) y no viaja por ningun otro lado.
 */
export function WebConnection({ url, conectado, esOwner }: { url: string | null; conectado: boolean; esOwner: boolean }) {
  const [valor, setValor] = React.useState(url ?? "")
  const [secreto, setSecreto] = React.useState<string | null>(null)
  const [copiado, setCopiado] = React.useState(false)
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)
  const [pending, start] = React.useTransition()

  const correr = (fn: () => Promise<ResultadoWeb>) =>
    start(async () => {
      setAviso(null)
      const r = await fn()
      if (r.ok) {
        if (r.secreto) setSecreto(r.secreto)
        if (r.aviso) setAviso({ ok: true, texto: r.aviso })
      } else setAviso({ ok: false, texto: r.error })
    })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Portal de noticias</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          {conectado
            ? "Conectado: las noticias redactadas se envían a este portal con un POST firmado (columna En la web del pipeline de Redacción)."
            : "Pega la URL del webhook del portal. Al guardarla se genera el secreto con que se firman los envíos."}
          {esOwner ? "" : " Solo un owner puede cambiar esta conexión."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-1.5">
          <Label htmlFor="web-url">URL del webhook</Label>
          <Input
            id="web-url"
            value={valor}
            disabled={pending || !esOwner}
            onChange={(e) => setValor(e.target.value)}
            placeholder="https://tuportal.com/api/hancel/webhook"
            className="font-mono text-xs"
          />
        </div>

        {secreto ? (
          <div className="grid gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <Label>Secreto (cópialo en HANCEL_WEBHOOK_SECRET del portal)</Label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs">{secreto}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(secreto)
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 1500)
                }}
              >
                {copiado ? <CheckIcon /> : <CopyIcon />}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
        ) : null}

        {esOwner ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={pending || !valor.trim()} onClick={() => correr(() => guardarWebNoticias(valor))}>
              {conectado ? "Guardar URL" : "Conectar"}
            </Button>
            {conectado ? (
              <>
                <Button variant="outline" disabled={pending} onClick={() => correr(probarWeb)}>
                  Enviar prueba
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => correr(mostrarSecretoWeb)}>
                  Ver secreto
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => correr(rotarSecretoWeb)}>
                  Rotar secreto
                </Button>
                <Button variant="ghost" disabled={pending} className="text-destructive" onClick={() => correr(desconectarWeb)}>
                  Desconectar
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        {aviso ? <p className={`text-sm ${aviso.ok ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p> : null}
      </CardContent>
    </Card>
  )
}
