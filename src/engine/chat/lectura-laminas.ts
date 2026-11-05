import { parseFigura, type Figura, type TipoFigura } from "../marca/figuras"
import { MAX_LAMINAS } from "./posts-carpeta"

/**
 * De lo que se leyo en las laminas de un post subido a un guion como el que
 * escribe el agente de Instagram. Puro y sin red: `leer-post.ts` hace la lectura.
 *
 * Con guion, un post subido se cambia igual que cualquier carrusel. Lo que importa
 * aqui es no perder nada: lo que no cabe donde va se mueve a otro sitio y se avisa.
 */

/** Marca el guion de un post subido: esos conservan todas sus laminas. */
export const ORIGEN_SUBIDO = "post-subido"

/** Lo que admite la lamina de cierre antes de recortar (render/carousel.ts). */
const TOPE_CIERRE = { titulo: 70, texto: 200 }
const MAX_ANTETITULO = 40
const MAX_ITEMS = 5
const MIN_LAMINAS = 2

export type LaminaLeida = {
  n?: unknown
  rol?: unknown
  antetitulo?: unknown
  titulo?: unknown
  lead?: unknown
  cuerpo?: unknown
  items?: unknown
  figura?: unknown
  /** La letra pequeña con de donde sale el dato. */
  fuente?: unknown
  dudas?: unknown
}

export type GuionLeido = {
  respuesta: Record<string, unknown>
  /** El texto entero, para contar las cifras de una figura como dichas por el post. */
  transcripcion: string
  avisos: string[]
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const lista = (v: unknown) => (Array.isArray(v) ? v.map(texto).filter(Boolean) : [])
const unir = (...partes: string[]) => partes.filter(Boolean).join("\n")

/** La figura en lineas de texto, para cuando no se puede dibujar como figura. */
function lineasDeFigura(bruta: unknown): string[] {
  const o = (bruta ?? {}) as { items?: unknown }
  if (!Array.isArray(o.items)) return []
  return o.items.flatMap((x) => {
    const it = (x ?? {}) as Record<string, unknown>
    const linea = [texto(it.texto), texto(it.cifra), texto(it.nota), ...lista(it.celdas)].filter(Boolean).join(": ")
    return linea ? [linea] : []
  })
}

/** Lo que dice una figura que no se va a dibujar: tambien su titulo y sus columnas. */
function figuraEnTexto(bruta: unknown): string[] {
  const o = (bruta ?? {}) as { titulo?: unknown; columnas?: unknown }
  return [texto(o.titulo), lista(o.columnas).join(" · "), ...lineasDeFigura(bruta)].filter(Boolean)
}

/** Una figura solo sirve si el kit la dibuja y conserva todo lo que dice. */
function figuraUsable(bruta: unknown, permitidas: readonly TipoFigura[]): Figura | null {
  if (!permitidas.length) return null
  const f = parseFigura(bruta, permitidas)
  if (!f) return null
  const antes = lineasDeFigura(bruta)
  const despues = lineasDeFigura(f)
  return despues.length === antes.length && despues.every((l, i) => l === antes[i]) ? f : null
}

type Contenido = { title: string; lead: string; body: string; items: string[]; figura: Figura | null; fuente?: string }

/**
 * Lo escrito en una lamina, sin dejar nada fuera: lo que no cabe en la lista baja
 * al cuerpo. Sin titulo, la linea corta que tenga encima hace de titulo: las
 * plantillas lo piden, y es texto de la lamina, no uno inventado.
 */
function contenidoDe(l: LaminaLeida, permitidas: readonly TipoFigura[]): Contenido & { sobra: string[] } {
  const figura = figuraUsable(l.figura, permitidas)
  const items = [...lista(l.items), ...(figura ? [] : figuraEnTexto(l.figura))]
  // Un solo punto no es una lista: la lamina lo perderia al buscar una plantilla de lista.
  const unico = items.length === 1
  const sobra = items.slice(MAX_ITEMS)
  const title = texto(l.titulo) || texto(l.lead)
  return {
    title,
    lead: texto(l.titulo) ? texto(l.lead) : "",
    body: unir(texto(l.cuerpo), unico ? items[0] : ""),
    items: unico ? [] : items.slice(0, MAX_ITEMS),
    figura,
    fuente: texto(l.fuente),
    sobra,
  }
}

const hayTexto = (c: Contenido) => Boolean(c.title || c.lead || c.body || c.items.length || c.figura)

const aSlide = (c: Contenido, n: number) => ({
  n,
  type: "text",
  title: c.title || null,
  lead: c.lead || null,
  body: c.body || null,
  items: c.items.length ? c.items : null,
  ...(c.figura ? { figura: c.figura } : {}),
  ...(c.fuente ? { fuente: c.fuente } : {}),
})

/**
 * El guion, o por que no se puede armar. La portada va como lamina de texto, no
 * como `photo_hook`: asi conserva su subtitulo, que un gancho no tiene donde poner.
 */
export function guionDeLectura(
  bruto: unknown,
  o: { caption: string; hashtags: string[]; permitidas: readonly TipoFigura[] }
): GuionLeido | { error: string } {
  const raiz = (bruto ?? {}) as { laminas?: unknown; fotos?: unknown }
  const leidas = (Array.isArray(raiz.laminas) ? raiz.laminas : []).filter((l): l is LaminaLeida => Boolean(l) && typeof l === "object")
  if (!leidas.length) return { error: "No encontré texto en las láminas." }

  const avisos: string[] = []
  const slides: ReturnType<typeof aSlide>[] = []
  let antetitulo = ""
  let cierre: { title: string; body: string } | null = null
  const dudas: string[] = []
  const sinTexto: number[] = []

  leidas.forEach((l, i) => {
    const n = i + 1
    for (const d of lista(l.dudas)) dudas.push(`lámina ${n}: ${d}`)
    const c = contenidoDe(l, o.permitidas)

    if (i === 0) {
      const ante = texto(l.antetitulo)
      if (ante.length <= MAX_ANTETITULO) antetitulo = ante
      const body = unir(ante.length > MAX_ANTETITULO ? ante : "", c.lead, c.body)
      slides.push(aSlide({ title: c.title, lead: "", body, items: [], figura: null }, slides.length + 1))
      // Una portada de plantilla no lleva lista ni figura: lo que traia va justo detras,
      // bajo el rotulo de la portada para no inventarle un titulo.
      if (c.items.length || c.figura) {
        if (leidas.length >= MAX_LAMINAS) avisos.push("La portada traía una lista que no cupo: el carrusel ya está en el máximo de 10 láminas.")
        else {
          const title = c.figura?.titulo || ante || c.title
          slides.push(aSlide({ title, lead: "", body: c.sobra.join("\n"), items: c.items, figura: c.figura }, slides.length + 1))
          avisos.push("La portada traía más de lo que cabe en una portada de plantilla: lo pasé a una lámina propia, así que el carrusel queda con una lámina más.")
        }
      }
      return
    }

    const ultima = i === leidas.length - 1
    if (ultima && texto(l.rol) === "cierre") {
      const body = unir(c.lead, c.body, ...c.items, ...c.sobra, ...(c.figura ? lineasDeFigura(c.figura) : []), c.fuente ?? "")
      if (c.title && c.title.length <= TOPE_CIERRE.titulo && body.length <= TOPE_CIERRE.texto) {
        cierre = { title: c.title, body }
        return
      }
      if (c.title || body) avisos.push("El cierre es más largo de lo que admite una lámina de cierre: lo dejé como lámina normal.")
    }

    const completa = { ...c, body: unir(c.body, ...c.sobra) }
    if (hayTexto(completa)) slides.push(aSlide(completa, slides.length + 1))
    else sinTexto.push(n)
  })

  if (slides.length < MIN_LAMINAS) return { error: "Este post tiene una sola lámina con texto: solo se pueden rehacer carruseles." }
  if (sinTexto.length) avisos.push(`${sinTexto.length === 1 ? `La lámina ${sinTexto[0]} no tiene` : `Las láminas ${sinTexto.join(", ")} no tienen`} texto: su imagen no pasa a una versión nueva.`)
  if (dudas.length) avisos.push(`Texto que no se leyó con seguridad (${dudas.join("; ")}).`)

  const lineas = leidas.map((l, i) =>
    `Lámina ${i + 1}: ${[l.antetitulo, l.titulo, l.lead, l.cuerpo, ...lista(l.items), ...lineasDeFigura(l.figura), l.fuente].map(texto).filter(Boolean).join(". ")}`
  )

  return {
    respuesta: {
      origen: ORIGEN_SUBIDO,
      caption: o.caption,
      hashtags: o.hashtags,
      antetitulo,
      fotos: lista(raiz.fotos).slice(0, 8),
      elemento: "",
      slides,
      cierre,
      lectura: { avisos },
    },
    transcripcion: lineas.join("\n"),
    avisos,
  }
}
