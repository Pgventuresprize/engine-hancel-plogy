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

// ------------------------------------------------------------------ horarios

export const REDES_HORARIO = ["instagram", "linkedin"] as const
export type RedHorario = (typeof REDES_HORARIO)[number]

/**
 * La plantilla de la semana, por red y dia (0 = domingo). Una hora repetida son
 * varios huecos: tres veces "12:00" salen a las 12:00, 12:05 y 12:10.
 */
export type Horarios = Record<RedHorario, Record<string, string[]>>

export const horariosVacios = (): Horarios => ({ instagram: {}, linkedin: {} })

const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/

/** Lo que venga de la base, sin confiar en su forma: lo que no se entiende se ignora. */
export function parseHorarios(valor: unknown): Horarios {
  const salida = horariosVacios()
  if (!valor || typeof valor !== "object") return salida
  for (const red of REDES_HORARIO) {
    const dias = (valor as Record<string, unknown>)[red]
    if (!dias || typeof dias !== "object") continue
    for (const [dia, horas] of Object.entries(dias)) {
      if (!/^[0-6]$/.test(dia) || !Array.isArray(horas)) continue
      const validas = horas.filter((h): h is string => typeof h === "string" && HORA_VALIDA.test(h) && aMin(h) % PASO_MINUTOS === 0).sort()
      if (validas.length) salida[red][dia] = validas
    }
  }
  return salida
}

export type Hueco = { red: RedHorario; hora: string }

/** Los huecos de un dia concreto, en orden de hora. */
export function huecosDelDia(dia: string, horarios: Horarios): Hueco[] {
  const huecos: Hueco[] = []
  const clave = String(diaDeSemana(dia))
  for (const red of REDES_HORARIO) {
    const vistas = new Map<string, number>()
    for (const hora of horarios[red][clave] ?? []) {
      const n = vistas.get(hora) ?? 0
      vistas.set(hora, n + 1)
      const min = aMin(hora) + n * PASO_MINUTOS
      if (min < 24 * 60) huecos.push({ red, hora: aHora(min) })
    }
  }
  return huecos.sort((a, b) => aMin(a.hora) - aMin(b.hora))
}

/** Tope de dias que mira un reparto: un rango mal escrito no puede colgar la pantalla. */
const MAX_DIAS_REPARTO = 92

/**
 * Llena los huecos libres de la plantilla con las piezas, en el orden dado. Cada
 * red va a sus huecos y lo ya programado no se toca. Lo que no cabe, sobra.
 */
export function repartir<P extends { red: string }>(opciones: {
  piezas: P[]
  desde: string
  hasta: string
  horarios: Horarios
  ocupadas: Set<string>
  ahora: { dia: string; hora: string }
}): { plan: { pieza: P; dia: string; hora: string }[]; sobran: number } {
  const { desde, hasta, horarios, ocupadas, ahora } = opciones
  const cola = [...opciones.piezas]
  const plan: { pieza: P; dia: string; hora: string }[] = []
  // Un campo de fecha vacio llega como texto vacio mientras se escribe.
  if (!desde || !hasta) return { plan, sobran: cola.length }

  for (let dia = desde, i = 0; dia <= hasta && i < MAX_DIAS_REPARTO; dia = sumarDias(dia, 1), i++) {
    for (const { red, hora } of huecosDelDia(dia, horarios)) {
      if (yaPaso(dia, hora, ahora) || ocupadas.has(claveHueco(red, dia, hora))) continue
      const siguiente = cola.findIndex((p) => p.red === red)
      if (siguiente < 0) continue
      const [pieza] = cola.splice(siguiente, 1)
      plan.push({ pieza, dia, hora })
    }
  }
  return { plan, sobran: cola.length }
}
