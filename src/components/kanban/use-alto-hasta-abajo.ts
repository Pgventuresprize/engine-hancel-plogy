"use client"

import * as React from "react"

/**
 * El alto que le queda a un elemento hasta el fondo de la ventana.
 *
 * El tablero lleva el scroll horizontal debajo de todo, y para verlo tiene que
 * caber entero en pantalla. Restarle al alto de la ventana un numero fijo no
 * aguanta: el aviso de "Hecho." al mover una tarjeta, la tarjeta de falta el
 * token o la linea del umbral lo empujan hacia abajo y la barra se sale. Asi
 * se mide donde empieza de verdad, y se vuelve a medir cuando algo de arriba
 * cambia de tamaño.
 *
 * `margen` es lo que queda por debajo: el relleno del marco del dashboard.
 */
export function useAltoHastaAbajo<T extends HTMLElement>(margen = 32) {
  const ref = React.useRef<T>(null)
  const [alto, setAlto] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const medir = () => {
      // Contra el documento, no la ventana: si la pagina esta algo bajada, el
      // tablero no debe encogerse por eso.
      const arriba = el.getBoundingClientRect().top + window.scrollY
      // Un minimo para que en una ventana muy baja no quede una rendija.
      setAlto(Math.max(240, Math.floor(window.innerHeight - arriba - margen)))
    }

    medir()
    // El body cambia de alto cuando aparece o se va algo por encima.
    const observador = new ResizeObserver(medir)
    observador.observe(document.body)
    window.addEventListener("resize", medir)
    return () => {
      observador.disconnect()
      window.removeEventListener("resize", medir)
    }
  }, [margen])

  return [ref, alto] as const
}
