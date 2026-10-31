import type { Figura } from "../marca/figuras"
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
  /** La figura que construye la lamina (barras, tabla, niveles...), si trae. */
  figura?: Figura | null
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
  cuerpo: ["motivo", "subtitulo", "texto", "respuesta"],
  titulo: ["cita"],
  cta: ["accion"],
}

/** Si un tipo no tiene plantilla en el kit, con que otro tipo se dice lo mismo. */
const TIPO_RESPALDO: Record<string, string[]> = {
  criterio: ["lista", "idea"],
  lista: ["idea"],
  dato: ["idea"],
  comparacion: ["idea"],
  cita: ["idea"],
  tesis: ["idea"],
  figura: ["idea"],
}

const conFigura = (p: Plantilla) => p.huecos.some((h) => h.tipo === "figura")

const lleno = (l: LaminaKit, nombre: string) =>
  Boolean(l.textos[nombre]?.trim()) || (l.listas[nombre]?.length ?? 0) > 0

/** La lamina con sus textos movidos a los nombres de hueco de la plantilla. */
export function adaptar(p: Plantilla, l: LaminaKit): LaminaKit {
  const nombres = new Set(p.huecos.map((h) => h.nombre))
  const obligatorios = new Set(p.huecos.filter((h) => h.obligatorio).map((h) => h.nombre))
  const textos = { ...l.textos }
  for (const [comun, otros] of Object.entries(SINONIMOS)) {
    if (!textos[comun]?.trim()) continue
    // Si la plantilla tiene el hueco comun, el texto se queda ahi, salvo que sea
    // opcional y un sinonimo obligatorio quede vacio (un cierre con "cuerpo"
    // opcional y "motivo" obligatorio).
    const soloObligatorios = nombres.has(comun)
    if (soloObligatorios && obligatorios.has(comun)) continue
    const destino = otros.find(
      (o) => nombres.has(o) && !lleno({ ...l, textos }, o) && (!soloObligatorios || obligatorios.has(o))
    )
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
    if (h.tipo === "figura") {
      if (!l.figura && h.obligatorio) return null
      continue
    }
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
  // Una figura que no se enseña es la mitad de la lamina.
  if (l.figura && !conFigura(p)) puntos -= 6
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
  // Una lamina con figura tambien puede ir en las plantillas con hueco de
  // figura de otro tipo del medio: mejor otro tipo que perder la figura.
  const otrasConFigura = l.figura
    ? plantillas
        .filter((p) => p.tipo !== l.tipo && p.tipo !== "portada" && p.tipo !== "cierre" && conFigura(p))
        .map((p) => ({ p, castigo: 1 }))
    : []
  const propias = deTipo(l.tipo)
  if (propias.length) return [...propias.map((p) => ({ p, castigo: 0 })), ...otrasConFigura]
  for (const otro of TIPO_RESPALDO[l.tipo] ?? []) {
    const suyas = deTipo(otro)
    if (suyas.length) return [...suyas.map((p) => ({ p, castigo: 2 })), ...otrasConFigura]
  }
  return otrasConFigura
}

/**
 * La plantilla de cada lamina, en orden. null en una lamina que ninguna
 * plantilla del kit puede enseñar.
 */
export function repartirKit(
  plantillas: Plantilla[],
  laminas: LaminaKit[],
  ritmo: Fondo[] = [],
  /** Cuantas laminas con foto lleva un carrusel del kit, de media. */
  fotosPorCarrusel = 0
): (LaminaRepartida | null)[] {
  const usadas = new Map<string, number>()
  let fondoAnterior: Fondo | null = null
  let conFoto = 0
  // Las fotos se reparten a lo largo del carrusel: mientras vaya por debajo de
  // la proporcion del kit, una plantilla con foto suma.
  const proporcion = laminas.length ? Math.min(1, fotosPorCarrusel / Math.max(laminas.length, 7)) : 0
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
        if (proporcion && p.foto.usa !== "no" && conFoto < proporcion * (i + 1)) puntos += 1.5
        puntos -= 2.5 * (usadas.get(p.id) ?? 0)
        return [{ plantilla: p, lamina: adaptada, puntos }]
      })
      .sort((a, b) => b.puntos - a.puntos)
    if (!puntuadas.length) return null
    const [mejor, ...resto] = puntuadas
    usadas.set(mejor.plantilla.id, (usadas.get(mejor.plantilla.id) ?? 0) + 1)
    fondoAnterior = mejor.plantilla.fondo
    if (mejor.plantilla.foto.usa !== "no") conFoto += 1
    return {
      plantilla: mejor.plantilla,
      lamina: mejor.lamina,
      alternativas: resto.map(({ plantilla, lamina }) => ({ plantilla, lamina })),
    }
  })
}

/**
 * El cierre del guion en los huecos que suelen pedir los cierres de un kit,
 * sin escribir nada: el titulo del agente es la llamada ("Sigue a la marca",
 * "Comenta PALABRA"), su texto se parte en titular y motivo por una coma, un
 * punto o una "y" cercanos a la mitad, y la palabra en mayusculas va a su hueco.
 * Si el texto no se deja partir, va como hasta ahora: titulo y cuerpo.
 */
export function laminaDeCierre(cierre: { titulo: string; texto: string; tipo: string | null }): LaminaKit {
  const llamada = cierre.titulo.trim()
  const texto = cierre.texto.trim()
  const base = { tipo: "cierre", listas: {}, cta_tipo: cierre.tipo }
  const partes = partirFrase(texto)
  if (!llamada || !partes) return { ...base, textos: { titulo: llamada, cuerpo: texto } }
  const palabra = (llamada.match(/(?<![\p{L}\d])\p{Lu}{3,}(?![\p{L}\d])/u) ?? texto.match(/(?<![\p{L}\d])\p{Lu}{3,}(?![\p{L}\d])/u))?.[0]
  return {
    ...base,
    textos: { titulo: partes[0], cuerpo: partes[1], cta: llamada, ...(palabra ? { palabra } : {}) },
  }
}

/** Una frase en dos, por el corte mas cercano a la mitad; null si no hay uno que deje dos partes con cuerpo. */
function partirFrase(texto: string): [string, string] | null {
  const mitad = texto.length / 2
  for (const corte of [/[,;:]\s+/g, /\.\s+/g, /\s+y\s+/g]) {
    let mejor: { i: number; fin: number } | null = null
    for (const m of texto.matchAll(corte)) {
      const i = m.index ?? 0
      if (i < texto.length * 0.25 || i > texto.length * 0.75) continue
      if (!mejor || Math.abs(i - mitad) < Math.abs(mejor.i - mitad)) mejor = { i, fin: i + m[0].length }
    }
    if (!mejor) continue
    // La "y" del corte se queda con la segunda parte, que empieza con mayuscula.
    const resto = corte.source.includes("y") ? texto.slice(mejor.i).trim() : texto.slice(mejor.fin).trim()
    const primera = texto.slice(0, mejor.i).trim()
    return [primera, resto.charAt(0).toLocaleUpperCase("es") + resto.slice(1)]
  }
  return null
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
    const deducido = s.figura ? "figura" : items.length >= 2 ? "lista" : "idea"
    return {
      // El que pidio quien escribio; si no lo trae, el que se deduce del texto.
      tipo: s.tipoLamina && s.tipoLamina !== "portada" && s.tipoLamina !== "cierre" ? s.tipoLamina : deducido,
      textos: { titulo: limpio(s.title), cuerpo: limpio(s.body), antetitulo: limpio(s.lead) },
      listas: items.length >= 2 ? { items } : {},
      ...(s.figura ? { figura: s.figura } : {}),
    }
  })
  if (cierre) laminas.push(laminaDeCierre(cierre))
  // Un hueco vacio no cuenta: que no reste como texto perdido.
  for (const l of laminas) for (const k of Object.keys(l.textos)) if (!l.textos[k]) delete l.textos[k]
  return laminas
}
