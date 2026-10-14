"use client"

import * as React from "react"

import {
  guardarTokenClaude,
  probarConexionClaude,
  type EstadoTokenClaude,
} from "@/app/cuenta/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * La conexion con Claude: el token que corre toda la IA del motor.
 *
 * Es de la empresa abierta: cada empresa usa su propio token y paga su propio
 * consumo. El valor guardado nunca vuelve entero, solo enmascarado.
 */
export function ClaudeConnection({ estado }: { estado: EstadoTokenClaude }) {
  const [valor, setValor] = React.useState("")
  const [guardando, guardar] = React.useTransition()
  const [probando, probar] = React.useTransition()
  const [guardado, setGuardado] = React.useState<
    { ok: true } | { ok: false; error: string } | null
  >(null)
  const [prueba, setPrueba] = React.useState<
    { ok: true; modelo: string } | { ok: false; error: string } | null
  >(null)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Conexion con Claude · IA</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          El token que corre <strong>todos los pasos de IA</strong> (analizar, angulo, LinkedIn,
          Instagram, carruseles, videos) de <strong>esta empresa</strong>. Lo generas una vez con{" "}
          <code className="text-[11px]">claude setup-token</code> y lo pegas aqui.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {estado.configurado ? (
          <p className="text-sm">
            Conectado:{" "}
            <code className="text-[11px]">{estado.vistaPrevia}</code>
            {estado.actualizado ? (
              <span className="text-muted-foreground">
                {" "}
                · guardado el {new Date(estado.actualizado).toLocaleDateString()}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-amber-700 dark:text-amber-400 text-sm">
            Sin token: la IA no funcionara hasta que pegues uno.
          </p>
        )}

        <div className="grid gap-2">
          <Label htmlFor="claude_token">
            {estado.configurado ? "Reemplazar token" : "Pegar token"}
          </Label>
          <Input
            id="claude_token"
            type="password"
            className="max-w-md font-mono"
            placeholder="sk-ant-oat01-…"
            value={valor}
            onChange={(event) => {
              setGuardado(null)
              setPrueba(null)
              setValor(event.target.value)
            }}
          />
          <p className="text-muted-foreground text-xs">
            Tiene que ser el de <code className="text-[11px]">claude setup-token</code> (tu
            suscripcion). Una API key de consola tambien vale. Si se
            revoca, generas uno nuevo y lo pegas otra vez.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={guardando || valor.trim().length === 0}
            onClick={() =>
              guardar(async () => {
                const r = await guardarTokenClaude(valor)
                setGuardado(r)
                if (r.ok) setValor("")
              })
            }
          >
            {guardando ? "Guardando…" : "Guardar token"}
          </Button>

          <Button
            variant="outline"
            disabled={probando || !estado.configurado}
            onClick={() => probar(async () => setPrueba(await probarConexionClaude()))}
          >
            {probando ? "Probando…" : "Probar conexion"}
          </Button>

          {guardado?.ok ? <span className="text-sm text-emerald-600">Token guardado.</span> : null}
          {guardado && !guardado.ok ? (
            <span className="text-destructive text-sm">{guardado.error}</span>
          ) : null}
          {prueba?.ok ? (
            <span className="text-sm text-emerald-600">Conexion OK ({prueba.modelo}).</span>
          ) : null}
          {prueba && !prueba.ok ? (
            <span className="text-destructive text-sm">{prueba.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
