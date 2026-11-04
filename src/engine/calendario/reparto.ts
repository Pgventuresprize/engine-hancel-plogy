/**
 * Las reglas del calendario sobre fechas y huecos.
 *
 * Puras y sin `server-only`: las usan el navegador, para pintar al instante, y el
 * servidor, que es quien decide. Los dias van como "2026-11-04" y las horas como
 * "12:05", siempre en la zona de la cuenta; el navegador nunca convierte a su
 * propia zona, y el instante real lo calcula el servidor con `instanteLocal`.
 */

export const PASO_MINUTOS = 5

export const aMin = (hora: string) => {
  const [h, m] = hora.split(":").map(Number)
  return h * 60 + m
}

export const aHora = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`

const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`)

export const sumarDias = (dia: string, n: number) => new Date(aFecha(dia).getTime() + n * 86_400_000).toISOString().slice(0, 10)

/** 0 = domingo, como `Date.getUTCDay`. */
export const diaDeSemana = (dia: string) => aFecha(dia).getUTCDay()

export const lunesDe = (dia: string) => sumarDias(dia, -((diaDeSemana(dia) + 6) % 7))

export const inicioDeMes = (dia: string) => `${dia.slice(0, 7)}-01`

/** El primer dia del mes siguiente (o anterior, con n negativo). */
export const sumarMeses = (dia: string, n: number) => {
  const f = aFecha(inicioDeMes(dia))
  f.setUTCMonth(f.getUTCMonth() + n)
  return f.toISOString().slice(0, 10)
}

/** Si ese dia y hora ya pasaron respecto a `ahora`. La propia hora actual cuenta como pasada. */
export const yaPaso = (dia: string, hora: string, ahora: { dia: string; hora: string }) => `${dia} ${hora}` <= `${ahora.dia} ${ahora.hora}`

export const claveHueco = (red: string, dia: string, hora: string) => `${red}|${dia}|${hora}`

/**
 * La hora libre mas cercana en esa red, a partir de la pedida. Dos posts de una
 * misma red no comparten hora: el segundo sale cinco minutos despues, que es lo
 * que tarda en volver a pasar el tick. Instagram y LinkedIn no chocan entre si.
 * Null si no queda sitio en el dia.
 */
export function horaLibre(dia: string, hora: string, red: string, ocupadas: Set<string>): string | null {
  for (let m = aMin(hora); m < 24 * 60; m += PASO_MINUTOS) {
    if (!ocupadas.has(claveHueco(red, dia, aHora(m)))) return aHora(m)
  }
  return null
}
