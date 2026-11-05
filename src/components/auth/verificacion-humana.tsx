"use client"

import * as React from "react"
import Script from "next/script"

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

declare global {
  interface Window {
    turnstile?: {
      render: (caja: HTMLElement, opciones: Record<string, string | (() => void)>) => string
      reset: (widget: string) => void
      remove: (widget: string) => void
    }
  }
}

/**
 * El widget de Turnstile. Va dentro del formulario y agrega solo el campo
 * `cf-turnstile-response`, que la accion valida con `pasoElCaptcha`.
 *
 * Cada token sirve una sola vez, asi que `reinicio` (el ultimo resultado del
 * formulario) pide uno nuevo despues de cada error. `tambien` es para el login,
 * que tiene dos acciones en el mismo formulario. Sin site key no pinta nada.
 *
 * Tambien frena el envio mientras falte el token: React vacia el formulario al
 * terminar una accion, y quien pulsa antes de verificarse perderia lo escrito.
 */
export function VerificacionHumana({ reinicio, tambien }: { reinicio: unknown; tambien?: unknown }) {
  const caja = React.useRef<HTMLDivElement>(null)
  const widget = React.useRef<string | undefined>(undefined)
  const [falta, setFalta] = React.useState(false)

  const pintar = React.useCallback(() => {
    if (!SITE_KEY || !caja.current || !window.turnstile || widget.current !== undefined) return
    widget.current = window.turnstile.render(caja.current, {
      sitekey: SITE_KEY,
      language: "es",
      theme: "light",
      // "flexible" pide 300 px y la tarjeta queda mas angosta en un telefono.
      size: caja.current.offsetWidth < 300 ? "compact" : "flexible",
      callback: () => setFalta(false),
    })
  }, [])

  // Al volver a la pagina el script ya esta cargado y `onReady` puede llegar antes que la caja.
  React.useEffect(() => {
    pintar()
    return () => {
      if (widget.current !== undefined) window.turnstile?.remove(widget.current)
      widget.current = undefined
    }
  }, [pintar])

  React.useEffect(() => {
    if ((reinicio || tambien) && widget.current !== undefined) window.turnstile?.reset(widget.current)
  }, [reinicio, tambien])

  // En captura y sobre el form: asi no llega a React, que es quien dispara la accion.
  React.useEffect(() => {
    const form = caja.current?.closest("form")
    if (!form) return

    const frenar = (evento: SubmitEvent) => {
      const token = form.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')
      if (!token || token.value) return
      evento.preventDefault()
      evento.stopImmediatePropagation()
      setFalta(true)
    }

    form.addEventListener("submit", frenar, true)
    return () => form.removeEventListener("submit", frenar, true)
  }, [])

  if (!SITE_KEY) return null

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={pintar} />
      <div ref={caja} className="min-h-[65px] w-full" />
      {falta ? (
        <p role="alert" className="text-destructive text-sm">
          Completa la verificación para continuar.
        </p>
      ) : null}
    </>
  )
}
