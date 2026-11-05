"use client"

import * as React from "react"

/**
 * El aviso de que algo salio o no. Vive fuera de los componentes porque muchas
 * acciones hacen desaparecer la fila desde la que se dispararon.
 */

type Aviso = { ok: boolean; texto: string }

let actual: Aviso | null = null
let reloj: ReturnType<typeof setTimeout> | undefined
const oyentes = new Set<() => void>()

function publicar(aviso: Aviso | null) {
  actual = aviso
  oyentes.forEach((oir) => oir())
}

export function avisar(ok: boolean, texto: string) {
  clearTimeout(reloj)
  publicar({ ok, texto })
  reloj = setTimeout(() => publicar(null), ok ? 4000 : 7000)
}

function suscribir(oir: () => void) {
  oyentes.add(oir)
  return () => {
    oyentes.delete(oir)
  }
}

export function Avisos() {
  const aviso = React.useSyncExternalStore(suscribir, () => actual, () => null)
  if (!aviso) return null
  return (
    <div
      role="status"
      className={`fixed bottom-5 left-1/2 z-[60] max-w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl px-3.5 py-2.5 text-sm shadow-lg ${
        aviso.ok ? "bg-foreground text-background" : "bg-destructive text-white"
      }`}
    >
      {aviso.texto}
    </div>
  )
}
