"use client"

import * as React from "react"
import Link from "next/link"

import {
  iniciarSesion,
  reenviarConfirmacion,
  type EnvioResult,
  type LoginResult,
} from "@/app/(acceso)/actions"
import { EncabezadoAcceso } from "@/components/auth/encabezado"
import { CampoContrasena } from "@/components/auth/campo-contrasena"
import { VerificacionHumana } from "@/components/auth/verificacion-humana"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Los avisos que llegan por `?aviso=` desde otras pantallas. */
const AVISOS: Record<string, string> = {
  enlace: "Ese enlace ya no sirve: venció o ya lo usaste. Pide uno nuevo.",
}

/**
 * El formulario de entrada.
 *
 * Es el bloque login-05 de shadcn con dos cambios: lleva contraseña —el bloque
 * original pide solo el correo— y no tiene los botones de Apple y Google, que
 * aqui no hay. Debajo van "¿Olvidaste tu contraseña?" y "Crear cuenta".
 *
 * Los campos no son controlados a proposito. `useActionState` mantiene el
 * formulario montado entre intentos, asi que lo que escribiste sigue ahi despues
 * de un fallo sin necesidad de estado en React. Por lo mismo, "Reenviar el
 * correo" es otro boton del mismo formulario: manda el correo que ya esta escrito.
 */
export function LoginForm({
  destino,
  aviso,
  registro,
  className,
  ...props
}: { destino?: string; aviso?: string; registro: boolean } & React.ComponentPropsWithoutRef<"div">) {
  const [resultado, enviar, pendiente] = React.useActionState<LoginResult, FormData>(iniciarSesion, undefined)
  const [reenvio, reenviar, reenviando] = React.useActionState<EnvioResult, FormData>(reenviarConfirmacion, undefined)
  const avisoInicial = aviso ? AVISOS[aviso] : undefined

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form action={enviar}>
        <input type="hidden" name="destino" value={destino ?? ""} />

        <div className="flex flex-col gap-6">
          <EncabezadoAcceso>Entra para automatizar todo tu contenido.</EncabezadoAcceso>

          {avisoInicial && !resultado ? (
            <p role="status" className="text-sm">
              {avisoInicial}{" "}
              <Link href="/recuperar" className="text-brand-text underline underline-offset-4">
                Pedir otro enlace
              </Link>
            </p>
          ) : null}

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
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="password">Contraseña</Label>
                <Link href="/recuperar" className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <CampoContrasena
                id="password"
                name="password"
                autoComplete="current-password"
                required
                className="h-11 bg-white/85"
              />
            </div>

            <VerificacionHumana reinicio={resultado} tambien={reenvio} />

            {resultado?.error ? (
              <div role="alert" className="text-destructive flex flex-col items-start gap-1 text-sm">
                <p>{resultado.error}</p>
                {resultado.sinConfirmar && !reenvio ? (
                  <Button
                    type="submit"
                    formAction={reenviar}
                    formNoValidate
                    variant="link"
                    className="text-brand-text h-auto p-0"
                    disabled={reenviando}
                  >
                    {reenviando ? "Mandando…" : "Reenviar el correo"}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {reenvio ? (
              <p role="status" className={cn("text-sm", "error" in reenvio && "text-destructive")}>
                {"error" in reenvio ? reenvio.error : reenvio.ok}
              </p>
            ) : null}

            <Button type="submit" variant="brand" className="h-12 w-full" disabled={pendiente}>
              {pendiente ? "Entrando…" : "Entrar"}
            </Button>
          </div>
        </div>
      </form>

      {registro ? (
        <p className="text-center text-sm">
          ¿No tienes cuenta?{" "}
          <Link href="/registro" className="text-brand-text font-medium underline underline-offset-4">
            Crear cuenta
          </Link>
        </p>
      ) : null}

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
