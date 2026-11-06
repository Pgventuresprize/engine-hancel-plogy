/**
 * Lo que cuesta cada modelo de Claude, en dolares por millon de tokens, a precio
 * de API (revisado el 2026-11-05).
 *
 * El panel usa esto para estimar: una empresa con suscripcion de Claude paga una
 * cuota fija, asi que para ella el numero dice cuanto valdria su uso, no cuanto
 * paga. Solo las que conectan una API key pagan exactamente esto.
 *
 * Sin dependencias de servidor, para poder importarlo desde cualquier lado.
 */

type Precio = { entrada: number; salida: number; cacheLeido: number }

/** Del mas especifico al mas general: `claude-opus-5-5` tiene que ir antes que `claude-opus-5`. */
const PRECIOS: [prefijo: string, precio: Precio][] = [
  ["claude-fable-5-1", { entrada: 10, salida: 50, cacheLeido: 0.25 }],
  ["claude-fable-5", { entrada: 10, salida: 50, cacheLeido: 1 }],
  ["claude-opus-5-5", { entrada: 4, salida: 20, cacheLeido: 0.2 }],
  ["claude-opus-5", { entrada: 5, salida: 25, cacheLeido: 0.5 }],
  ["claude-opus-4", { entrada: 5, salida: 25, cacheLeido: 0.5 }],
  ["claude-sonnet-5", { entrada: 2, salida: 10, cacheLeido: 0.2 }],
  ["claude-sonnet-4", { entrada: 3, salida: 15, cacheLeido: 0.3 }],
  ["claude-haiku-5-5", { entrada: 0.1, salida: 0.5, cacheLeido: 0.01 }],
  ["claude-haiku-4", { entrada: 1, salida: 5, cacheLeido: 0.1 }],
]

/** Un modelo que no este en la lista se estima como Sonnet, el mas usado. */
const POR_DEFECTO: Precio = { entrada: 2, salida: 10, cacheLeido: 0.2 }

/** Escribir en cache cuesta un 25 % mas que la entrada normal. */
const FACTOR_CACHE_ESCRITA = 1.25

export function precioDe(modelo: string): Precio {
  const id = modelo.startsWith("claude-") ? modelo : `claude-${modelo}`
  return PRECIOS.find(([prefijo]) => id.startsWith(prefijo))?.[1] ?? POR_DEFECTO
}

export type UsoDeTokens = {
  modelo: string
  /** Todo lo leido: incluye lo que salio de cache y lo que se escribio en ella. */
  entrada: number
  salida: number
  deCache: number
  cacheEscrita: number
}

/** El costo estimado en dolares de un conjunto de llamadas al mismo modelo. */
export function costoUsd(u: UsoDeTokens): number {
  const p = precioDe(u.modelo)
  const normal = Math.max(0, u.entrada - u.deCache - u.cacheEscrita)
  const dolares =
    normal * p.entrada + u.cacheEscrita * p.entrada * FACTOR_CACHE_ESCRITA + u.deCache * p.cacheLeido + u.salida * p.salida
  return dolares / 1_000_000
}

/** $12,40. Por debajo de un centavo no finge precision. */
export function formatUsd(valor: number): string {
  if (valor === 0) return "$0"
  if (valor < 0.01) return "<$0,01"
  return `$${valor.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
