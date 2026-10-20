import { NOMBRE_OBJETIVO, OBJETIVOS, type Objetivo } from "./clasificacion"
import { TIPOS_CTA, type TipoCta } from "./editorial-modelo"

/**
 * Cuando entra una pieza del prompt: una skill de la marca o una pieza del
 * oficio de fabrica.
 *
 * Se mira contra lo que ya se sabe de la pieza antes de escribirla: la
 * clasificacion que decidio el agente de angulo, su formato y dos senales que
 * pone el motor. Entre claves distintas se tienen que cumplir todas; dentro de
 * una misma clave basta con una. Vacio es "siempre".
 *
 * Lo decide el codigo, no una IA: con la misma clasificacion sale siempre el
 * mismo prompt.
 *
 * Puro y sin base, para la interfaz y para la prueba de cobertura.
 */

/** Los formatos que elige el agente de angulo (ver ANGULO_OFICIO). */
export const FORMATOS_ANGULO = [
  "lanzamiento_con_consecuencias",
  "movimiento_personas_capital",
  "dato_que_cambia_marco",
  "regulacion_con_impacto",
  "convergencia",
  "contradiccion",
  "antes_y_despues",
  "patron_silencioso",
] as const

export const NOMBRE_FORMATO: Record<string, string> = {
  lanzamiento_con_consecuencias: "Lanzamiento con consecuencias",
  movimiento_personas_capital: "Movimiento de personas o capital",
  dato_que_cambia_marco: "Dato que cambia el marco",
  regulacion_con_impacto: "Regulación con impacto",
  convergencia: "Convergencia",
  contradiccion: "Contradicción",
  antes_y_despues: "Antes y después",
  patron_silencioso: "Patrón silencioso",
}

/**
 * Lo que el motor sabe de la noticia sin preguntarle a nadie mas: si el angulo
 * la marco como logro y si entro con poco material.
 */
export const SENALES = ["logro", "poco_material"] as const
export type Senal = (typeof SENALES)[number]

export const NOMBRE_SENAL: Record<Senal, string> = {
  logro: "Es un logro",
  poco_material: "Poco material",
}

export const NOMBRE_TIPO_CTA: Record<TipoCta, string> = {
  seguir: "Seguir",
  comentar: "Comentar",
  palabra: "Palabra clave",
  dm: "Mensaje directo",
  comercial: "Comercial",
}

export type Cuando = {
  pilares: string[]
  objetivos: Objetivo[]
  cta_tipos: TipoCta[]
  formatos: string[]
  senales: Senal[]
}

export const SIEMPRE: Cuando = { pilares: [], objetivos: [], cta_tipos: [], formatos: [], senales: [] }

/** Lo que se sabe de una pieza al armar su prompt. */
export type Situacion = {
  /** Id del pilar principal. */
  pilar: string | null
  objetivo: Objetivo | null
  cta_tipo: TipoCta | null
  formato: string | null
  logro: boolean
  poco_material: boolean
}

const lista = <T extends string>(v: unknown, validos?: readonly T[]): T[] => {
  const crudo = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []
  const limpios = validos ? crudo.filter((x): x is T => (validos as readonly string[]).includes(x)) : (crudo as T[])
  return [...new Set(limpios)]
}

/** Lee un "cuando" guardado. Lo que no se reconozca se cae: nunca deja una condicion a medias. */
export function parseCuando(v: unknown): Cuando {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>
  return {
    pilares: lista(o.pilares),
    objetivos: lista(o.objetivos, OBJETIVOS),
    cta_tipos: lista(o.cta_tipos, TIPOS_CTA),
    formatos: lista(o.formatos, FORMATOS_ANGULO),
    senales: lista(o.senales, SENALES),
  }
}

/** Una situacion que llega de fuera (el simulador), con lo que no se reconozca en null. */
export function parseSituacion(v: unknown): Situacion {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>
  const de = <T extends string>(x: unknown, validos: readonly T[]): T | null =>
    typeof x === "string" && (validos as readonly string[]).includes(x) ? (x as T) : null
  return {
    pilar: typeof o.pilar === "string" && o.pilar ? o.pilar : null,
    objetivo: de(o.objetivo, OBJETIVOS),
    cta_tipo: de(o.cta_tipo, TIPOS_CTA),
    formato: de(o.formato, FORMATOS_ANGULO),
    logro: o.logro === true,
    poco_material: o.poco_material === true,
  }
}

export const esSiempre = (c: Cuando) =>
  c.pilares.length + c.objetivos.length + c.cta_tipos.length + c.formatos.length + c.senales.length === 0

const tieneSenal = (s: Situacion, senal: Senal) => (senal === "logro" ? s.logro : s.poco_material)

/**
 * Por que no entra, o null si entra. Sin situacion (un agente que trabaja antes
 * de que la pieza este clasificada) solo entra lo que va siempre.
 */
export function porQueNoEntra(c: Cuando, s: Situacion | null, nombrePilar: (id: string) => string): string | null {
  if (esSiempre(c)) return null
  if (!s) return "la pieza aún no está clasificada"
  if (c.pilares.length > 0 && !(s.pilar && c.pilares.includes(s.pilar))) {
    return `el pilar no es ${c.pilares.map(nombrePilar).join(" ni ")}`
  }
  if (c.objetivos.length > 0 && !(s.objetivo && c.objetivos.includes(s.objetivo))) {
    return `el objetivo no es ${c.objetivos.map((o) => NOMBRE_OBJETIVO[o]).join(" ni ")}`
  }
  if (c.cta_tipos.length > 0 && !(s.cta_tipo && c.cta_tipos.includes(s.cta_tipo))) {
    return s.cta_tipo ? `el CTA es de tipo ${NOMBRE_TIPO_CTA[s.cta_tipo]}` : "la pieza no tiene CTA"
  }
  if (c.formatos.length > 0 && !(s.formato && c.formatos.includes(s.formato))) {
    return `el formato no es ${c.formatos.map((f) => NOMBRE_FORMATO[f] ?? f).join(" ni ")}`
  }
  if (c.senales.length > 0 && !c.senales.some((x) => tieneSenal(s, x))) {
    return c.senales.map((x) => (x === "logro" ? "no es un logro" : "el material es completo")).join(" y ")
  }
  return null
}

export const cumple = (c: Cuando, s: Situacion | null) => porQueNoEntra(c, s, (id) => id) === null

/** "pilar Conocimiento · CTA Palabra clave", para enseñar una condicion en una linea. */
export function describirCuando(c: Cuando, nombrePilar: (id: string) => string): string {
  if (esSiempre(c)) return "Siempre"
  return [
    c.pilares.length ? `pilar ${c.pilares.map(nombrePilar).join(" o ")}` : "",
    c.objetivos.length ? `objetivo ${c.objetivos.map((o) => NOMBRE_OBJETIVO[o]).join(" o ")}` : "",
    c.cta_tipos.length ? `CTA ${c.cta_tipos.map((t) => NOMBRE_TIPO_CTA[t]).join(" o ")}` : "",
    c.formatos.length ? `formato ${c.formatos.map((f) => NOMBRE_FORMATO[f] ?? f).join(" o ")}` : "",
    c.senales.length ? c.senales.map((x) => NOMBRE_SENAL[x].toLowerCase()).join(" o ") : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

/** La situacion en una linea, para la receta y la cabecera de lo que entra por condicion. */
export function describirSituacion(s: Situacion | null, nombrePilar: (id: string) => string): string {
  if (!s) return "sin clasificar"
  return [
    s.pilar ? `pilar ${nombrePilar(s.pilar)}` : "sin pilar",
    s.objetivo ? `objetivo ${NOMBRE_OBJETIVO[s.objetivo]}` : "",
    s.cta_tipo ? `CTA ${NOMBRE_TIPO_CTA[s.cta_tipo]}` : "sin CTA",
    s.formato ? `formato ${NOMBRE_FORMATO[s.formato] ?? s.formato}` : "",
    s.logro ? "logro" : "",
    s.poco_material ? "poco material" : "",
  ]
    .filter(Boolean)
    .join(" · ")
}
