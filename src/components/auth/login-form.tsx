"use client"

import * as React from "react"

import { iniciarSesion, type LoginResult } from "@/app/login/actions"
import { CampoContrasena } from "@/components/auth/campo-contrasena"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PlogyStudioLogo } from "@/components/plogy-studio-logo"
import { cn } from "@/lib/utils"

/**
 * El formulario de entrada.
 *
 * Es el bloque login-05 de shadcn con dos cambios: lleva contraseña —el bloque
 * original pide solo el correo— y no tiene los botones de Apple y Google, que
 * aqui no hay. Tampoco hay "crear cuenta": las cuentas se dan de alta desde
 * Supabase, no se registra nadie solo.
 *
 * Los campos no son controlados a proposito. `useActionState` mantiene el
 * formulario montado entre intentos, asi que lo que escribiste sigue ahi despues
 * de un fallo sin necesidad de estado en React.
 */
export function LoginForm({
  destino,
  className,
  ...props
}: { destino?: string } & React.ComponentPropsWithoutRef<"div">) {
  const [resultado, enviar, pendiente] = React.useActionState<LoginResult, FormData>(
    iniciarSesion,
    undefined
  )

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form action={enviar}>
        <input type="hidden" name="destino" value={destino ?? ""} />

        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3">
            {/* El lockup ya lleva el nombre dentro, asi que hace de titulo y no
                se repite debajo en texto. Su nombre accesible es "Plogy Studio". */}
            <h1 className="flex">
              <PlogyStudioLogo className="text-2xl" />
            </h1>
            <div className="text-muted-foreground text-center text-sm">
              Entra para automatizar todo tu contenido.
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="tu@correo.com"
                autoComplete="username"
                autoFocus
                required
                className="h-11 bg-white/85"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <CampoContrasena
                id="password"
                name="password"
                autoComplete="current-password"
                required
                className="h-11 bg-white/85"
              />
            </div>

            {resultado?.error ? (
              <p role="alert" className="text-destructive text-sm">
                {resultado.error}
              </p>
            ) : null}

            <Button type="submit" variant="brand" className="h-12 w-full" disabled={pendiente}>
              {pendiente ? "Entrando…" : "Entrar"}
            </Button>
          </div>
        </div>
      </form>

      {/* El correo va como enlace: en una pantalla de entrada, quien lee esto
          no tiene cuenta, y pedirle que copie una direccion a mano es perder
          justo a quien venia interesado. */}
      <p className="text-muted-foreground text-center text-xs text-balance">
        Si quieres un demo enviame un mensaje a{" "}
        <a href="mailto:plogydevs@gmail.com" className="text-brand-text underline underline-offset-4">
          plogydevs@gmail.com
        </a>
      </p>
    </div>
  )
}
