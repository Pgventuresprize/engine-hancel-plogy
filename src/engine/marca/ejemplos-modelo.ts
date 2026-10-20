import { OBJETIVOS, type Objetivo } from "./clasificacion"
import type { Situacion } from "./cuando"
import { TIPOS_CTA, type TipoCta } from "./editorial-modelo"

/**
 * Los ejemplos de la marca: piezas suyas que salieron bien.
 *
 * Las reglas dicen que hacer; un ejemplo enseña como suena y como avanza una
 * pieza de esta marca. El riesgo es que el agente lo copie como plantilla:
 * el revisor de piezas del kit de Plogy marco justo eso, piezas que repetian
 * casi entera la receta de las anteriores. Por eso:
 *   - entran solo dos, los que mas se parecen a la pieza;
 *   - entre empates rotan con la noticia, para que dos piezas seguidas no lean
 *     los mismos;
 *   - el revisor frena una pieza que copie siete palabras seguidas de uno.
 *
 * Puro y sin base, para la interfaz, el armador y la prueba de cobertura. La
 * lectura y el guardado estan en ejemplos.ts.
 */

export const REDES_EJEMPLO = ["instagram", "linkedin"] as const
export type RedEjemplo = (typeof REDES_EJEMPLO)[number]

export const NOMBRE_RED_EJEMPLO: Record<RedEjemplo, string> = { instagram: "Instagram", linkedin: "LinkedIn" }

export const TOPES_EJEMPLO = { nombre: 120, texto: 12_000, por_que: 600, origen: 120 } as const

/** Cuantos ejemplos entran en una pieza. Dos: con mas, el agente copia la mezcla. */
export const EJEMPLOS_POR_PIEZA = 2

export type Ejemplo = {
  id: string
  red: RedEjemplo
  nombre: string
  /** La pieza tal cual la lee el agente. */
  texto: string
  /** Lo que el agente tiene que aprender de ella. */
  por_que: string
  pilar_id: string | null
  cta_tipo: TipoCta | null
  objetivo: Objetivo | null
  origen: string
  activo: boolean
  position: number
}

export type CamposEjemplo = Omit<Ejemplo, "id" | "position">

const texto = (v: unknown, tope: number) => (typeof v === "string" ? v.trim().slice(0, tope) : "")
const de = <T extends string>(v: unknown, validos: readonly T[]): T | null =>
  typeof v === "string" && (validos as readonly string[]).includes(v) ? (v as T) : null

export function parseEjemplo(fila: Record<string, unknown>): Ejemplo {
  return {
    id: String(fila.id),
    red: de(fila.red, REDES_EJEMPLO) ?? "instagram",
    nombre: texto(fila.nombre, TOPES_EJEMPLO.nombre),
    texto: texto(fila.texto, TOPES_EJEMPLO.texto),
    por_que: texto(fila.por_que, TOPES_EJEMPLO.por_que),
    pilar_id: typeof fila.pilar_id === "string" && fila.pilar_id ? fila.pilar_id : null,
    cta_tipo: de(fila.cta_tipo, TIPOS_CTA),
    objetivo: de(fila.objetivo, OBJETIVOS),
    origen: texto(fila.origen, TOPES_EJEMPLO.origen),
    activo: fila.activo !== false,
    position: typeof fila.position === "number" ? fila.position : 0,
  }
}

/** Mensaje para el usuario, o null si todo vale. */
export function validarEjemplo(c: CamposEjemplo): string | null {
  if (!(REDES_EJEMPLO as readonly string[]).includes(c.red)) return "El ejemplo tiene que ser de Instagram o de LinkedIn."
  if (!c.nombre.trim()) return "El ejemplo necesita un nombre."
  if (c.nombre.trim().length > TOPES_EJEMPLO.nombre) return `El nombre no puede pasar de ${TOPES_EJEMPLO.nombre} caracteres.`
  if (!c.texto.trim()) return "Falta la pieza: es lo que lee el agente."
  if (c.texto.trim().length > TOPES_EJEMPLO.texto) return `La pieza no puede pasar de ${TOPES_EJEMPLO.texto} caracteres.`
  // Sin el porque, el agente ve una pieza y no sabe que mirar de ella: copia.
  if (!c.por_que.trim()) return "Escribe por qué es buena: es lo que el agente tiene que aprender de ella."
  if (c.por_que.trim().length > TOPES_EJEMPLO.por_que) return `El porqué no puede pasar de ${TOPES_EJEMPLO.por_que} caracteres.`
  if (c.cta_tipo && !(TIPOS_CTA as readonly string[]).includes(c.cta_tipo)) return "Ese tipo de CTA no existe."
  if (c.objetivo && !(OBJETIVOS as readonly string[]).includes(c.objetivo)) return "Ese objetivo no existe."
  return null
}

/** Cuanto se parece un ejemplo a la pieza: el pilar pesa mas que el CTA, y el CTA mas que el objetivo. */
export function parecido(e: Ejemplo, s: Situacion | null): number {
  if (!s) return 0
  return (
    (e.pilar_id && e.pilar_id === s.pilar ? 3 : 0) +
    (e.cta_tipo && e.cta_tipo === s.cta_tipo ? 2 : 0) +
    (e.objetivo && e.objetivo === s.objetivo ? 1 : 0)
  )
}

/** Un numero estable a partir de un texto: la misma noticia, la misma rotacion. */
function hash(t: string): number {
  let h = 2166136261
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type Eleccion = { entran: Ejemplo[]; fuera: { ejemplo: Ejemplo; porque: string }[] }

/**
 * Los ejemplos que entran en una pieza: los activos de su red que mas se
 * parecen. Los empates se reparten rotando con la semilla (el id de la
 * noticia); sin semilla, por su orden en la lista.
 */
export function elegirEjemplos(
  ejemplos: Ejemplo[],
  red: RedEjemplo,
  s: Situacion | null,
  semilla?: string,
  cuantos = EJEMPLOS_POR_PIEZA
): Eleccion {
  const suyos = ejemplos
    .filter((e) => e.activo && e.red === red && e.texto.trim())
    .sort((a, b) => a.position - b.position)
  const grupos = new Map<number, Ejemplo[]>()
  for (const e of suyos) grupos.set(parecido(e, s), [...(grupos.get(parecido(e, s)) ?? []), e])

  const entran: Ejemplo[] = []
  const fuera: Eleccion["fuera"] = []
  for (const puntos of [...grupos.keys()].sort((a, b) => b - a)) {
    const grupo = grupos.get(puntos)!
    const quedan = cuantos - entran.length
    if (quedan <= 0) {
      for (const e of grupo) fuera.push({ ejemplo: e, porque: "entraron otros que se parecen más a la pieza" })
      continue
    }
    if (grupo.length <= quedan) {
      entran.push(...grupo)
      continue
    }
    const desde = semilla ? hash(semilla) % grupo.length : 0
    const rotado = [...grupo.slice(desde), ...grupo.slice(0, desde)]
    entran.push(...rotado.slice(0, quedan))
    for (const e of rotado.slice(quedan)) fuera.push({ ejemplo: e, porque: "se parece igual, pero esta vez le tocó a otro" })
  }
  return { entran, fuera }
}

/** La capa de ejemplos del prompt. Vacia si no entra ninguno. */
export function bloqueEjemplos(entran: Ejemplo[]): string {
  if (entran.length === 0) return ""
  return [
    `# EJEMPLOS DE LA MARCA
${entran.length === 1 ? "Una pieza" : `${entran.length} piezas`} de la marca que salieron bien. Sirven para el tono, la densidad y cómo avanza una pieza. No son plantilla: no copies sus frases, sus datos, su número de láminas ni su estructura. Los datos de esta pieza salen solo de su contenido.`,
    ...entran.map((e) => `## Ejemplo: ${e.nombre}\nPor qué es buena: ${e.por_que.trim()}\n\n${e.texto.trim()}`),
  ].join("\n\n")
}

/** Una lamina tal como se guarda en un ejemplo. */
export type LaminaDeEjemplo = { hook?: string | null; lead?: string | null; title?: string | null; body?: string | null; items?: string[] | null }

/**
 * Un carrusel en texto, con el mismo formato para los que vienen del kit y los
 * que se guardan desde una pieza: asi el agente los lee todos igual.
 */
export function textoDeCarrusel(c: {
  laminas: LaminaDeEjemplo[]
  cierre?: { title?: string | null; body?: string | null } | null
  caption?: string | null
  hashtags?: string[]
}): string {
  const laminas = c.laminas.map((l, i) => {
    const cabeza = `Lámina ${i + 1}${i === 0 ? " (portada)" : ""}:`
    if (l.hook) return `${cabeza} ${l.hook.trim()}`
    const lista = l.items?.length ? l.items.map((x, j) => `${j + 1}. ${x.trim()}`).join("\n") : ""
    return [`${cabeza}${l.lead ? ` [${l.lead.trim()}]` : ""} ${(l.title ?? "").trim()}`, l.body?.trim() ?? "", lista]
      .filter(Boolean)
      .join("\n")
  })
  const cierre = c.cierre ? [c.cierre.title, c.cierre.body].map((t) => t?.trim()).filter(Boolean).join(" ") : ""
  const hashtags = (c.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
  return [
    laminas.join("\n\n"),
    cierre ? `Cierre: ${cierre}` : "",
    c.caption?.trim() ? `Caption: ${c.caption.trim()}` : "",
    hashtags ? `Hashtags: ${hashtags}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}
