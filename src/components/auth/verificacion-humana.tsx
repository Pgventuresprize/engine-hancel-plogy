"use client"

import * as React from "react"
import Script from "next/script"

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

declare global {
  interface Window {
    turnstile?: {
      render: (caja: HTMLElement, opciones: Record<string, string>) => string
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
 * formulario) pide uno nuevo despues de cada error. Sin site key no pinta nada.
 */
export function VerificacionHumana({ reinicio }: { reinicio: unknown }) {
  const caja = React.useRef<HTMLDivElement>(null)
  const widget = React.useRef<string | undefined>(undefined)

  const pintar = React.useCallback(() => {
    if (!SITE_KEY || !caja.current || !window.turnstile || widget.current !== undefined) return
    widget.current = window.turnstile.render(caja.current, {
      sitekey: SITE_KEY,
      language: "es",
      theme: "light",
      // "flexible" pide 300 px y la tarjeta queda mas angosta en un telefono.
      size: caja.current.offsetWidth < 300 ? "compact" : "flexible",
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
    if (reinicio && widget.current !== undefined) window.turnstile?.reset(widget.current)
  }, [reinicio])

  if (!SITE_KEY) return null

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={pintar} />
      <div ref={caja} className="min-h-[65px] w-full" />
    </>
  )
}
