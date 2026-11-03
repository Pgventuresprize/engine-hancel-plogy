"use client"

import * as React from "react"

import { disconnectLinkedinAccount, type ActionResult } from "@/app/estudio/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { LinkedinStatus } from "@/engine/publish/linkedin"
import { formatDateTime } from "@/lib/format"
import { LinkIcon, Link2OffIcon } from "lucide-react"

/**
 * Conectar y desconectar la cuenta de LinkedIn.
 *
 * La conexion se hace con un enlace normal y no con una accion de servidor: el
 * OAuth necesita que el navegador viaje a LinkedIn y vuelva, y eso solo lo hace
 * una navegacion de verdad.
 *
 * LinkedIn emite tokens de 60 dias y los refresh programaticos estan
 * restringidos a partners, asi que reconectar es manual: de ahi el aviso cuando
 * queda poco.
 */
export function LinkedinConnection({
  status,
  resultado,
  motivo,
}: {
  status: LinkedinStatus
  /** Lo que devuelve el callback de OAuth en la URL. */
  resultado?: string
  motivo?: string
}) {
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">Cuenta de LinkedIn</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Hancel publica en el feed de esta cuenta, en tu nombre.
          </p>
        </div>
        {status.connected ? (
          <Badge variant={status.expired ? "destructive" : "default"}>
            {status.expired ? "Caducada" : "Conectada"}
          </Badge>
        ) : (
          <Badge variant="secondary">Sin conectar</Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {resultado === "ok" ? (
          <p className="text-sm text-success">Cuenta conectada: {motivo}.</p>
        ) : null}
        {resultado === "error" ? (
          <p className="text-destructive text-sm">No se pudo conectar: {motivo}</p>
        ) : null}

        {!status.configured ? (
          <p className="text-sm text-warning">
            Faltan <code className="text-xs">LINKEDIN_CLIENT_ID</code>,{" "}
            <code className="text-xs">LINKEDIN_CLIENT_SECRET</code> y{" "}
            <code className="text-xs">LINKEDIN_REDIRECT_URI</code> en el entorno. Sin ellas no se
            puede conectar ninguna cuenta.
          </p>
        ) : null}

        {status.connected ? (
          <div className="text-sm">
            <p className="font-medium">{status.displayName ?? "Cuenta conectada"}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              El acceso {status.expired ? "caduco el" : "caduca el"}{" "}
              {formatDateTime(status.expiresAt)}
              {status.expiringSoon && !status.expired
                ? " — conviene reconectar antes de que pase."
                : ""}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={status.connected ? "outline" : "default"}
            disabled={!status.configured}
            render={<a href="/api/auth/linkedin/start" />}
          >
            <LinkIcon />
            {status.connected ? "Reconectar" : "Conectar LinkedIn"}
          </Button>

          {status.connected ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setResult(null)
                startTransition(async () => setResult(await disconnectLinkedinAccount()))
              }}
            >
              <Link2OffIcon />
              {pending ? "Desconectando…" : "Desconectar"}
            </Button>
          ) : null}

          {result && !result.ok ? (
            <span className="text-destructive text-sm">{result.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
