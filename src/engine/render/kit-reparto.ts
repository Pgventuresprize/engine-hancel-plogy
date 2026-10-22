import type { Fondo, Plantilla } from "../marca/kit-modelo"
import type { Slide } from "./templates"

/**
 * Que plantilla del kit va en cada lamina de la pieza. Sin base de datos ni
 * navegador: lo usa kit-carrusel.ts y se prueba solo.
 *
 * Cada lamina trae su tipo (portada, idea, dato...) y sus textos con los
 * nombres de hueco comunes (titulo, cuerpo, items...). Entre las plantillas
 * aprobadas de ese tipo gana la que mejor encaja: la que puede enseñar todo lo
 * que trae la lamina sin pasarse de sus limites, sigue el ritmo de fondos del
 * kit y no repite la de al lado.
 */

/** Una lamina de la pieza, escrita para los huecos del kit. */
export type LaminaKit = {
  tipo: string
  /** La plantilla que pidio quien escribio la pieza (su id), si pidio una. */
  plantilla?: string | null
  textos: Record<string, string>
  listas: Record<string, string[]>
  /** Solo en el cierre: que pide el CTA (seguir, comentar, palabra...). */
  cta_tipo?: string | null
}

export type LaminaRepartida = {
  plantilla: Plantilla
  /** La lamina con sus textos en los huecos de esa plantilla. */
  lamina: LaminaKit
  /** Las otras que tambien sirven, de mejor a peor: si la elegida no cabe al dibujarla. */
  alternativas: { plantilla: Plantilla; lamina: LaminaKit }[]
}

/**
 * Otro nombre con el que un kit puede llamar al mismo hueco. Si la plantilla no
 * tiene el nombre comun pero si uno de estos, el texto va ahi.
 */
const SINONIMOS: Record<string, string[]> = {
  antetitulo: ["rotulo", "etiqueta", "tema"],
  cuerpo: ["motivo", "subtitulo", "texto"],
  titulo: ["cita"],
}

/** Si un tipo no tiene plantilla en el kit, con que otro tipo se dice lo mismo. */
const TIPO_RESPALDO: Record<string, string[]> = {
  criterio: ["lista", "idea"],
  lista: ["idea"],
  dato: ["idea"],
  comparacion: ["idea"],
  cita: ["idea"],
  tesis: ["idea"],
}

const lleno = (l: LaminaKit, nombre: string) =>
  Boolean(l.textos[nombre]?.trim()) || (l.listas[nombre]?.length ?? 0) > 0

/** La lamina con sus textos movidos a los nombres de hueco de la plantilla. */
export function adaptar(p: Plantilla, l: LaminaKit): LaminaKit {
  const nombres = new Set(p.huecos.map((h) => h.nombre))
  const textos = { ...l.textos }
  for (const [comun, otros] of Object.entries(SINONIMOS)) {
    if (nombres.has(comun) || !textos[comun]?.trim()) continue
    const destino = otros.find((o) => nombres.has(o) && !lleno({ ...l, textos }, o))
    if (!destino) continue
    textos[destino] = textos[comun]
    delete textos[comun]
  }
  return { ...l, textos }
}

/**
 * Cuanto encaja una lamina en una plantilla, o null si no puede ir ahi (le falta
 * un hueco obligatorio o perderia el titular). 10 es encaje perfecto.
 */
export function encaje(p: Plantilla, l: LaminaKit): number | null {
  let puntos = 10
  const nombres = new Set(p.huecos.map((h) => h.nombre))
  for (const h of p.huecos) {
    if (h.tipo === "lista") {
      const items = (l.listas[h.nombre] ?? []).filter((s) => s.trim())
      if (!items.length) {
        if (h.obligatorio) return null
        continue
      }
      if (h.min_items && items.length < h.min_items) puntos -= 2
      if (h.max_items && items.length > h.max_items) puntos -= 2 * (items.length - h.max_items)
      puntos -= 1.5 * items.filter((s) => s.length > h.max).length
    } else {
      const t = (l.textos[h.nombre] ?? "").trim()
      if (!t) {
        if (h.obligatorio) return null
        continue
      }
      // Pasarse un poco lo arregla el navegador encogiendo la letra; mucho, no.
      if (t.length > h.max) puntos -= Math.min(6, (t.length / h.max - 1) * 8)
    }
  }
  // Lo que la lamina trae y la plantilla no enseña se pierde.
  for (const [k, v] of Object.entries(l.textos)) {
    if (!v.trim() || nombres.has(k)) continue
    if (k === "titulo") return null
    puntos -= 3
  }
  for (const [k, v] of Object.entries(l.listas)) if (v.length && !nombres.has(k)) puntos -= 6
  return puntos
}

/** Las plantillas que pueden servir a una lamina, con lo que les resta no ser de su tipo o de su CTA. */
function candidatas(plantillas: Plantilla[], l: LaminaKit): { p: Plantilla; castigo: number }[] {
  const deTipo = (tipo: string) => plantillas.filter((p) => p.tipo === tipo)
  if (l.tipo === "cierre") {
    // El cierre enseña un gesto (seguir, comentar...): uno que no es el del CTA
    // manda al lector a otra parte, asi que casi nunca compensa.
    return deTipo("cierre").map((p) => ({
      p,
      castigo: !l.cta_tipo || p.cta_tipos.includes(l.cta_tipo) ? 0 : p.cta_tipos.length === 0 ? 1 : 6,
    }))
  }
  const propias = deTipo(l.tipo)
  if (propias.length) return propias.map((p) => ({ p, castigo: 0 }))
  for (const otro of TIPO_RESPALDO[l.tipo] ?? []) {
    const suyas = deTipo(otro)
    if (suyas.length) return suyas.map((p) => ({ p, castigo: 2 }))
  }
  return []
}

/**
 * La plantilla de cada lamina, en orden. null en una lamina que ninguna
 * plantilla del kit puede enseñar.
 */
export function repartirKit(
  plantillas: Plantilla[],
  laminas: LaminaKit[],
  ritmo: Fondo[] = []
): (LaminaRepartida | null)[] {
  const usadas = new Map<string, number>()
  let fondoAnterior: Fondo | null = null
  return laminas.map((l, i) => {
    // Si ninguna plantilla de su tipo puede con el texto (un dato sin la cifra
    // aparte, por ejemplo), la lamina se enseña como una idea antes que no salir.
    const deSuTipo = candidatas(plantillas, l).filter(({ p }) => encaje(p, adaptar(p, l)) !== null)
    const posibles =
      deSuTipo.length || l.tipo === "portada" || l.tipo === "cierre" || l.tipo === "idea"
        ? deSuTipo
        : candidatas(plantillas, { ...l, tipo: "idea" }).map((c) => ({ ...c, castigo: c.castigo + 2 }))
    const puntuadas = posibles
      .flatMap(({ p, castigo }) => {
        const adaptada = adaptar(p, l)
        const e = encaje(p, adaptada)
        if (e === null) return []
        let puntos = e - castigo
        if (l.plantilla && l.plantilla === p.id) puntos += 20
        if (ritmo.length && p.fondo === ritmo[i % ritmo.length]) puntos += 1
        if (fondoAnterior && p.fondo === fondoAnterior) puntos -= 1.5
        puntos -= 2.5 * (usadas.get(p.id) ?? 0)
        return [{ plantilla: p, lamina: adaptada, puntos }]
      })
      .sort((a, b) => b.puntos - a.puntos)
    if (!puntuadas.length) return null
    const [mejor, ...resto] = puntuadas
    usadas.set(mejor.plantilla.id, (usadas.get(mejor.plantilla.id) ?? 0) + 1)
    fondoAnterior = mejor.plantilla.fondo
    return {
      plantilla: mejor.plantilla,
      lamina: mejor.lamina,
      alternativas: resto.map(({ plantilla, lamina }) => ({ plantilla, lamina })),
    }
  })
}

/**
 * Un guion de los de antes (portada con gancho y laminas de titulo y cuerpo) en
 * laminas del kit. Es un puente: el guion escrito para el kit (con el tipo y los
 * huecos de cada lamina) enseña mucho mas.
 */
export function laminasDeGuionClasico(
  slides: Slide[],
  antetitulo: string,
  cierre: { titulo: string; texto: string; tipo: string | null } | null
): LaminaKit[] {
  const limpio = (t: string | null | undefined) => (t ?? "").trim()
  const laminas = slides.map((s, i): LaminaKit => {
    if (s.type === "photo_hook" || i === 0) {
      const titulo = s.type === "photo_hook" ? limpio(s.hook) : limpio(s.title)
      return {
        tipo: "portada",
        textos: { titulo, antetitulo, cuerpo: s.type === "text" ? limpio(s.body) : "" },
        listas: {},
      }
    }
    const items = (s.items ?? []).map(limpio).filter(Boolean)
    return {
      // El que pidio quien escribio; si no lo trae, el que se deduce del texto.
      tipo: s.tipoLamina && s.tipoLamina !== "portada" && s.tipoLamina !== "cierre" ? s.tipoLamina : items.length >= 2 ? "lista" : "idea",
      textos: { titulo: limpio(s.title), cuerpo: limpio(s.body), antetitulo: limpio(s.lead) },
      listas: items.length >= 2 ? { items } : {},
    }
  })
  if (cierre)
    laminas.push({
      tipo: "cierre",
      textos: { titulo: cierre.titulo, cuerpo: cierre.texto },
      listas: {},
      cta_tipo: cierre.tipo,
    })
  // Un hueco vacio no cuenta: que no reste como texto perdido.
  for (const l of laminas) for (const k of Object.keys(l.textos)) if (!l.textos[k]) delete l.textos[k]
  return laminas
}
