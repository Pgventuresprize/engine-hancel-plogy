import { ImageResponse } from "next/og"

import { cargarFuente } from "./fonts"
import {
  Composicion,
  TarjetaLinkedin,
  type AjusteInserto,
  type FormaInserto,
  type Slide,
} from "./templates"
import { ALTO, ANCHO, ESTILO_POR_DEFECTO, type Estilo, type Variante } from "./theme"

/**
 * Convierte un slide en un PNG vertical de 1080x1350.
 *
 * El motor es Satori, via `next/og`: renderiza un arbol de React a imagen sin
 * navegador headless. Se eligio sobre Puppeteer porque en serverless un Chromium
 * son cientos de megas y varios segundos de arranque por invocacion, mientras
 * que esto rinde en milisegundos y ya viene con Next.
 *
 * El precio es que Satori entiende un subconjunto de CSS; las plantillas estan
 * escritas para eso.
 */

/** Instagram no admite carruseles de mas de 10, ni de menos de 2. */
/**
 * Cuantas laminas puede tener un carrusel, contando la de cierre.
 *
 * Siete como mucho. Antes eran hasta diez y el guion se estiraba para
 * llenarlas, con laminas que repetian lo dicho dos antes. Cuantas lleva cada
 * carrusel lo decide la marca (Marca > Voz), hasta seis de contenido; esto es
 * solo el techo que el dibujo admite.
 */
export const MAX_SLIDES = 7
export const MIN_SLIDES = 2

/** Tope de la foto: descargarla entera si es enorme no aporta. */
const MAX_FOTO_BYTES = 8 * 1024 * 1024

/**
 * Baja una foto y la deja como data URI.
 *
 * Devuelve `null` ante cualquier problema —404, tipo raro, timeout, demasiado
 * grande— y nunca lanza: una lamina sin foto sigue siendo una lamina, pero un
 * carrusel a medias no es nada.
 */
export async function descargarFoto(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HancelBot/1.0)" },
    })
    if (!response.ok) return null

    const tipo = response.headers.get("content-type") ?? ""
    // Satori solo dibuja mapas de bits; un SVG remoto no le sirve.
    if (!/^image\/(jpeg|jpg|png|webp|gif)/i.test(tipo)) return null

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_FOTO_BYTES) return null

    // Satori solo decodifica bien JPEG y PNG: un WebP o un GIF lo tumban ("u2 is
    // not iterable") y con el la tarjeta entera. Las miniaturas de Google que
    // traen muchas noticias son WebP, asi que se pasan a JPEG antes de dibujar.
    const tipoLimpio = tipo.split(";")[0].toLowerCase()
    if (tipoLimpio === "image/webp" || tipoLimpio === "image/gif") {
      const sharp = (await import("sharp")).default
      const jpg = await sharp(Buffer.from(buffer)).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer()
      return `data:image/jpeg;base64,${jpg.toString("base64")}`
    }

    return `data:${tipoLimpio};base64,${Buffer.from(buffer).toString("base64")}`
  } catch {
    return null
  }
}

/**
 * Baja el elemento de la portada, mas estricto que una foto de fondo.
 *
 * Solo JPEG y PNG, y comprobando la firma de los bytes, no el content-type que
 * declara el servidor. Es lo que evita el circulo negro: Satori a veces no
 * decodifica un WebP o un GIF y deja el hueco vacio sobre el fondo, y un
 * content-type puede mentir. Lo que no pasa esta prueba se descarta y el
 * llamante prueba la siguiente candidata.
 */
export async function descargarInserto(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HancelBot/1.0)" },
    })
    if (!response.ok) return null

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength < 100 || bytes.byteLength > MAX_FOTO_BYTES) return null

    // Firma real de los bytes. JPEG: FF D8 FF. PNG: 89 50 4E 47.
    const esJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    const esPng =
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    if (!esJpeg && !esPng) return null

    const tipo = esJpeg ? "image/jpeg" : "image/png"
    return `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`
  } catch {
    return null
  }
}

export type SlideRender = {
  slide: Slide
  variante: Variante
  foto?: string | null
  /** Antetitulo de la portada. Las laminas interiores lo ignoran. */
  etiqueta?: string | null
  /** El logo ya descargado, para la lamina de cierre. Solo lo usa ella. */
  logo?: string | null
  /** El elemento recortado, ya descargado. Solo lo usa la portada. */
  inserto?: string | null
  /** En cual de las cuatro esquinas va. Se sortea al generar. */
  insertoPos?: number
  /** Circulo o cuadrado. Tambien a suertes. */
  insertoForma?: FormaInserto
  /** Si el elemento llena el hueco o se encaja entero dentro. */
  insertoAjuste?: AjusteInserto
  /** La captura del perfil, ya descargada. Solo la usa el cierre. */
  perfil?: string | null
}

export async function renderSlide(
  { slide, variante, foto, etiqueta, logo, inserto, insertoPos, insertoForma, insertoAjuste, perfil }: SlideRender,
  total: number,
  estilo: Estilo = ESTILO_POR_DEFECTO
): Promise<Buffer> {
  const fonts = await cargarFuente(estilo.fuente)

  const respuesta = new ImageResponse(
    <Composicion
      slide={slide}
      total={total}
      estilo={estilo}
      variante={variante}
      foto={foto ?? null}
      etiqueta={etiqueta ?? null}
      logo={logo ?? null}
      inserto={inserto ?? null}
      insertoPos={insertoPos ?? 0}
      insertoForma={insertoForma ?? "circulo"}
      insertoAjuste={insertoAjuste ?? "llenar"}
      perfil={perfil ?? null}
    />,
    { width: ANCHO, height: ALTO, fonts }
  )

  return Buffer.from(await respuesta.arrayBuffer())
}

/**
 * La imagen que acompaña a un post de LinkedIn.
 *
 * 1200x627 es la proporcion que LinkedIn muestra en el feed sin recortar; con
 * una cuadrada se come los bordes.
 */
export const TARJETA_ANCHO = 1200
export const TARJETA_ALTO = 627

export async function renderTarjetaLinkedin(
  titular: string,
  foto: string | null,
  estilo: Estilo = ESTILO_POR_DEFECTO,
  etiqueta: string | null = null
): Promise<Buffer> {
  const fonts = await cargarFuente(estilo.fuente)

  const respuesta = new ImageResponse(
    <TarjetaLinkedin
      titular={titular}
      estilo={estilo}
      foto={foto}
      ancho={TARJETA_ANCHO}
      alto={TARJETA_ALTO}
      etiqueta={etiqueta}
    />,
    { width: TARJETA_ANCHO, height: TARJETA_ALTO, fonts }
  )

  return Buffer.from(await respuesta.arrayBuffer())
}

/**
 * Reparte las composiciones a lo largo del carrusel.
 *
 * No es aleatorio puro: se busca ritmo. La portada siempre lleva foto, la ultima
 * cierra en cita —que es donde suele estar el remate— y en medio se alternan
 * laminas con foto y sin ella para que el pulgar note el cambio. Dos laminas
 * seguidas con foto de fondo se leen como una sola.
 *
 * El reparto depende solo del indice y del total, asi que regenerar un carrusel
 * da el mismo resultado: nada de sorpresas al reintentar.
 */
export function repartirVariantes(slides: Slide[], usarFotos: boolean): Variante[] {
  const total = slides.length

  return slides.map((slide, indice) => {
    if (indice === 0) return "portada"

    const esUltima = indice === total - 1
    const cuerpo = slide.type === "text" ? (slide.body ?? "") : ""
    const titulo = slide.type === "text" ? (slide.title ?? "") : ""

    // Una frase corta y rotunda pide cita; un parrafo largo, aire.
    const esRemate = esUltima && cuerpo.length < 180
    if (esRemate) return "cita"

    if (!usarFotos) {
      return indice % 2 === 0 ? "dato" : "texto"
    }

    // Un texto muy largo no cabe encima de una foto sin volverse ilegible.
    const textoLargo = cuerpo.length + titulo.length > 260

    switch (indice % 4) {
      case 1:
        return textoLargo ? "foto_lateral" : "foto_fondo"
      case 2:
        return "dato"
      case 3:
        return "foto_recuadro"
      default:
        return textoLargo ? "texto" : "foto_lateral"
    }
  })
}

/** Cuantas laminas de este reparto necesitan foto de banco. */
export function necesitanFoto(variantes: Variante[]): boolean[] {
  // `dato` y `cita` tambien: eran las dos laminas de solo tipografia y en un
  // carrusel de seis se leian como un hueco, no como una pausa.
  return variantes.map(
    (v) =>
      v === "foto_fondo" ||
      v === "foto_lateral" ||
      v === "foto_recuadro" ||
      v === "dato" ||
      v === "cita"
  )
}

/**
 * Normaliza lo que venga en `respuesta.slides`.
 *
 * Igual que con los otros agentes, el contrato lo escribe un prompt y puede
 * llegar torcido: se aceptan las variantes plausibles y se recorta al maximo que
 * Instagram admite en vez de fallar por un slide de mas.
 */
export function parseSlides(valor: unknown): Slide[] {
  const bruto = Array.isArray(valor) ? valor : []
  const slides: Slide[] = []

  for (const item of bruto) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const n = slides.length + 1

    const tipo = String(obj.type ?? "").trim()
    if (tipo === "photo_hook") {
      slides.push({ n, type: "photo_hook", hook: texto(obj.hook) ?? texto(obj.title) })
      continue
    }

    const title = texto(obj.title) ?? texto(obj.titulo)
    const body = texto(obj.body) ?? texto(obj.cuerpo) ?? texto(obj.text)
    const items = Array.isArray(obj.items)
      ? obj.items.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, 5)
      : []
    if (!title && !body && items.length === 0) continue

    slides.push({ n, type: "text", title, body, lead: texto(obj.lead), items: items.length ? items : null })
  }

  return slides.slice(0, MAX_SLIDES)
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const limpio = valor.trim()
  return limpio.length > 0 ? limpio : null
}
