"use client"

import * as React from "react"
import Link from "next/link"

import {
  crearPrimeraEmpresa,
  guardarContrasena,
  pedirRecuperacion,
  registrarse,
  type EnvioResult,
} from "@/app/(acceso)/actions"
import { EncabezadoAcceso } from "@/components/auth/encabezado"
import { CampoContrasena } from "@/components/auth/campo-contrasena"
import { VerificacionHumana } from "@/components/auth/verificacion-humana"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Los formularios de acceso que no son el login: recuperar la contraseña,
 * elegir una nueva, crear cuenta y crear la primera empresa.
 *
 * Siguen la forma del login: campos no controlados con `useActionState`, asi
 * lo escrito sigue ahi despues de un error.
 */

function Campo({
  id,
  etiqueta,
  type,
  ...props
}: { id: string; etiqueta: string } & React.ComponentProps<typeof Input>) {
  const comun = { id, name: id, required: true, className: "h-11 bg-white/85", ...props }
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      {/* Las contraseñas llevan el ojo para verlas, como en el login. */}
      {type === "password" ? <CampoContrasena {...comun} /> : <Input type={type} {...comun} />}
    </div>
  )
}

function Fallo({ resultado }: { resultado: EnvioResult }) {
  return resultado && "error" in resultado ? (
    <p role="alert" className="text-destructive text-sm">
      {resultado.error}
    </p>
  ) : null
}

/** Lo que queda en la tarjeta cuando el correo ya salio: no hay nada mas que hacer aqui. */
function Enviado({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoAcceso titulo="Revisa tu correo">{texto}</EncabezadoAcceso>
      <Button render={<Link href="/login" />} nativeButton={false} variant="outline" className="h-11 w-full">
        Volver a entrar
      </Button>
    </div>
  )
}

function VolverAlLogin() {
  return (
    <p className="text-center text-sm">
      <Link href="/login" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
        Volver a entrar
      </Link>
    </p>
  )
}

export function RecuperarForm() {
  const [resultado, enviar, pendiente] = React.useActionState<EnvioResult, FormData>(pedirRecuperacion, undefined)
  if (resultado && "ok" in resultado) return <Enviado texto={resultado.ok} />

  return (
    <div className="flex flex-col gap-6">
      <form action={enviar} className="flex flex-col gap-6">
        <EncabezadoAcceso titulo="¿Olvidaste tu contraseña?">
          Escribe tu correo y te mandamos un enlace para elegir una nueva.
        </EncabezadoAcceso>
        <Campo id="email" etiqueta="Correo" type="email" placeholder="tu@correo.com" autoComplete="email" autoFocus />
        <VerificacionHumana reinicio={resultado} />
        <Fallo resultado={resultado} />
        <Button type="submit" variant="brand" className="h-12 w-full" disabled={pendiente}>
          {pendiente ? "Mandando…" : "Mandar el enlace"}
        </Button>
      </form>
      <VolverAlLogin />
    </div>
  )
}

/**
 * La contraseña nueva. `primera` es el invitado que entra por primera vez: no
 * tiene contraseña que "cambiar", la elige.
 */
export function ContrasenaForm({ email, primera }: { email: string; primera: boolean }) {
  const [resultado, enviar, pendiente] = React.useActionState<EnvioResult, FormData>(guardarContrasena, undefined)

  return (
    <form action={enviar} className="flex flex-col gap-6">
      <EncabezadoAcceso titulo={primera ? "Elige tu contraseña" : "Contraseña nueva"}>
        {primera ? `Te damos la bienvenida. Con ella vas a entrar como ${email}.` : `Para ${email}. Mínimo 8 caracteres.`}
      </EncabezadoAcceso>
      {/* Para que el gestor de contraseñas la guarde con el correo correcto. */}
      <input type="email" name="usuario" value={email} autoComplete="username" readOnly hidden />
      <Campo id="password" etiqueta="Contraseña nueva" type="password" autoComplete="new-password" minLength={8} autoFocus />
      <Campo id="repetida" etiqueta="Repítela" type="password" autoComplete="new-password" minLength={8} />
      <Fallo resultado={resultado} />
      <Button type="submit" variant="brand" className="h-12 w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : primera ? "Guardar y entrar" : "Guardar contraseña"}
      </Button>
    </form>
  )
}

export function RegistroForm() {
  const [resultado, enviar, pendiente] = React.useActionState<EnvioResult, FormData>(registrarse, undefined)
  if (resultado && "ok" in resultado) return <Enviado texto={resultado.ok} />

  return (
    <div className="flex flex-col gap-6">
      <form action={enviar} className="flex flex-col gap-6">
        <EncabezadoAcceso titulo="Crea tu cuenta">
          Tu marca empieza en blanco: subes tu kit, conectas tus servicios y los agentes trabajan para ti.
        </EncabezadoAcceso>
        <Campo id="empresa" etiqueta="Nombre de tu empresa o marca" placeholder="Mi marca" autoComplete="organization" minLength={2} autoFocus />
        <Campo id="email" etiqueta="Correo" type="email" placeholder="tu@correo.com" autoComplete="email" />
        <Campo id="password" etiqueta="Contraseña" type="password" autoComplete="new-password" minLength={8} placeholder="Mínimo 8 caracteres" />
        <Campo id="repetida" etiqueta="Repítela" type="password" autoComplete="new-password" minLength={8} />
        <VerificacionHumana reinicio={resultado} />
        <Fallo resultado={resultado} />
        <Button type="submit" variant="brand" className="h-12 w-full" disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear cuenta"}
        </Button>
      </form>
      <p className="text-center text-sm">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-brand-text font-medium underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </div>
  )
}

export function BienvenidaForm({ email }: { email: string }) {
  const [resultado, enviar, pendiente] = React.useActionState<EnvioResult, FormData>(crearPrimeraEmpresa, undefined)

  return (
    <form action={enviar} className="flex flex-col gap-6">
      <EncabezadoAcceso titulo="Crea tu empresa">
        {email} todavía no está en ninguna empresa. Crea la tuya, o pide a quien te invitó que te agregue.
      </EncabezadoAcceso>
      <Campo id="empresa" etiqueta="Nombre de tu empresa o marca" placeholder="Mi marca" autoComplete="organization" minLength={2} autoFocus />
      <Fallo resultado={resultado} />
      <Button type="submit" variant="brand" className="h-12 w-full" disabled={pendiente}>
        {pendiente ? "Creando…" : "Crear y entrar"}
      </Button>
    </form>
  )
}
