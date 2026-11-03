import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * El logo de Plogy Studio: el lockup del brand kit 02 (esfera + "Plogy.") con
 * "Studio" al lado en Plogy Display. Se dimensiona con el tamaño de letra de
 * quien lo pone (`text-lg`, `text-2xl`...), asi sirve igual en la barra
 * lateral, la entrada y el chat.
 *
 * El SVG va en linea y no como <img> para que el wordmark herede el color del
 * texto. El id del degradado sale de useId: con dos logos en la misma pagina
 * (barra abierta y cerrada) no pueden compartirlo.
 */
export function PlogyStudioLogo({
  forma = "completo",
  className,
  style,
}: {
  /**
   * "simbolo" deja solo la esfera, para espacios de ancho de icono.
   * "compacto" es la esfera con "Studio" al lado, para la barra lateral,
   * donde el wordmark completo quedaria demasiado chico para leerse.
   */
  forma?: "completo" | "compacto" | "simbolo"
  className?: string
  style?: React.CSSProperties
}) {
  const id = React.useId()
  const degradado = (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f75946" />
        <stop offset="0.33" stopColor="#ee5358" />
        <stop offset="0.5" stopColor="#e1556a" />
        <stop offset="0.67" stopColor="#c85981" />
        <stop offset="1" stopColor="#9c5aa7" />
      </linearGradient>
    </defs>
  )

  if (forma === "simbolo") {
    return (
      <svg viewBox="27 27 27 27" role="img" aria-label="Plogy Studio" className={cn("size-[1em] shrink-0", className)} style={style}>
        {degradado}
        <circle cx="40.5" cy="40.5" r="13.5" fill={`url(#${id})`} />
      </svg>
    )
  }

  if (forma === "compacto") {
    // Los `!` ganan al `[&_svg]:size-4` con el que el menu de la barra
    // lateral iguala todos sus iconos.
    return (
      <span role="img" aria-label="Plogy Studio" className={cn("inline-flex items-center gap-[0.45em] text-foreground", className)} style={style}>
        <svg viewBox="27 27 27 27" aria-hidden="true" className="size-[1.4em]! shrink-0">
          {degradado}
          <circle cx="40.5" cy="40.5" r="13.5" fill={`url(#${id})`} />
        </svg>
        <span aria-hidden="true" className="font-display leading-none">
          Studio
        </span>
      </span>
    )
  }

  return (
    <span role="img" aria-label="Plogy Studio" className={cn("inline-flex items-center gap-[0.4em] text-foreground", className)} style={style}>
      <svg viewBox="26 26 113 29" aria-hidden="true" className="h-[1.3em] w-auto shrink-0">
        {degradado}
        <circle cx="40.5" cy="40.5" r="13.5" fill={`url(#${id})`} />
        <g fill="currentColor">
          <path transform="translate(64 46.9375) scale(0.025 -0.025)" d="M594 336V599L488 706H80V0H212V230H487ZM461 399 424 362H213V572H425L461 536Z" />
          <path transform="translate(78.85 46.9375) scale(0.025 -0.025)" d="M441 0V133H307V706H89V572H174V133H41V0Z" />
          <path transform="translate(88.775 46.9375) scale(0.025 -0.025)" d="M569 107V408L462 515H161L55 408V106L162 0H462ZM436 169 400 133H224L188 169V345L224 381H400L436 345Z" />
          <path transform="translate(103.0 46.9375) scale(0.025 -0.025)" d="M569 -84V515H161L55 409V107L162 0H436V-20C422 -33 412 -44 399 -58H149V-191H462ZM436 133H224L188 169V345L224 381H436Z" />
          <path transform="translate(117.475 46.9375) scale(0.025 -0.025)" d="M579 -84V516H446V133H235C221 147 211 158 198 171V516H65V107L172 0H447V-20C433 -33 423 -44 410 -58H160V-191H473Z" />
          <path transform="translate(132.45 46.9375) scale(0.025 -0.025)" d="M202 0V132H69V0Z" />
        </g>
      </svg>
      <span aria-hidden="true" className="font-display leading-none text-muted-foreground">
        Studio
      </span>
    </span>
  )
}
