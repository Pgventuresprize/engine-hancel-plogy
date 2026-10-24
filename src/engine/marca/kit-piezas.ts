import { supabaseAdmin } from "../supabase-admin"
import { BUCKET_KITS, type ArchivoKit } from "./kit-modelo"
import { subirArchivoKit, type KitCargado } from "./kit"

/**
 * Las piezas de ejemplo del kit: carruseles completos que la marca ya publico,
 * con su HTML y una hoja con sus laminas. Son lo que el diseñador libre
 * (render/kit-libre.ts) mira para dibujar como la marca: no plantillas que
 * rellenar, sino piezas enteras de las que aprende composicion, ritmo y como
 * construye sus graficos.
 *
 * Se guardan como archivos del kit de tipo "referencia" (no se dibujan nunca:
 * el HTML solo entra en el prompt), con papel pieza_<n> y pieza_<n>_hoja.
 */

export const PREFIJO_PIEZA = "pieza_"
/** Lo que entra de cada pieza en el prompt: el HTML de una pieza tipica cabe entero. */
export const MAX_HTML_PIEZA = 30_000

export type PiezaDeEjemplo = {
  papel: string
  titulo: string
  origen: string
  laminas: number
}

/**
 * El HTML de una pieza listo para leerlo: sin imagenes en data URI (se quedan
 * como "(imagen)"), sin scripts ni enlaces, y recortado al tope.
 */
export function limpiarHtmlDePieza(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "(imagen)")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, MAX_HTML_PIEZA)
}

/** Guarda una pieza de ejemplo en el kit (o la reemplaza si ya estaba con ese numero). */
export async function guardarPiezaDeEjemplo(
  accountId: string,
  kitId: string,
  n: number,
  pieza: { titulo: string; origen: string; html: string; hoja: Buffer; laminas: number }
): Promise<void> {
  const meta = { titulo: pieza.titulo.slice(0, 200), origen: pieza.origen.slice(0, 300), laminas: pieza.laminas }
  await subirArchivoKit(accountId, kitId, {
    papel: `${PREFIJO_PIEZA}${n}`,
    tipo: "referencia",
    contenido: Buffer.from(limpiarHtmlDePieza(pieza.html)),
    mime: "text/html",
    nombre_original: pieza.origen,
    meta,
    descripcion: "Pieza de ejemplo de la marca: su HTML, para el diseñador.",
  })
  await subirArchivoKit(accountId, kitId, {
    papel: `${PREFIJO_PIEZA}${n}_hoja`,
    tipo: "referencia",
    contenido: pieza.hoja,
    mime: "image/jpeg",
    nombre_original: pieza.origen,
    meta,
    descripcion: "Pieza de ejemplo de la marca: sus laminas en una hoja.",
  })
}

const esPieza = (a: ArchivoKit) => a.papel.startsWith(PREFIJO_PIEZA) && a.mime === "text/html"

/** Las piezas de ejemplo que tiene el kit. */
export function piezasDelKit(kc: KitCargado): PiezaDeEjemplo[] {
  return kc.archivos.filter(esPieza).map((a) => ({
    papel: a.papel,
    titulo: String(a.meta.titulo ?? a.nombre_original),
    origen: String(a.meta.origen ?? a.nombre_original),
    laminas: Number(a.meta.laminas) || 0,
  }))
}

/** El HTML y la hoja de una pieza de ejemplo. */
export async function cargarPieza(kc: KitCargado, papel: string): Promise<{ html: string; hoja: Buffer | null }> {
  const bajar = async (p: string) => {
    const a = kc.archivos.find((x) => x.papel === p)
    if (!a) return null
    const { data } = await supabaseAdmin().storage.from(BUCKET_KITS).download(a.ruta)
    return data ? Buffer.from(await data.arrayBuffer()) : null
  }
  const [html, hoja] = await Promise.all([bajar(papel), bajar(`${papel}_hoja`)])
  return { html: html?.toString("utf8") ?? "", hoja }
}

/** Las laminas de una pieza en una tira, para verla de un vistazo. */
export async function hojaDePieza(laminas: Buffer[]): Promise<Buffer> {
  const sharp = (await import("sharp")).default
  const W = 270
  const H = 338
  const G = 8
  const capas = await Promise.all(
    laminas.map(async (l, i) => ({
      input: await sharp(l).resize(W, H, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer(),
      left: G + i * (W + G),
      top: G,
    }))
  )
  return sharp({ create: { width: G + laminas.length * (W + G), height: H + 2 * G, channels: 3, background: "#808080" } })
    .composite(capas)
    .jpeg({ quality: 82 })
    .toBuffer()
}

const palabrasDe = (s: string) =>
  new Set(
    s
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .match(/[a-z0-9ñ]{4,}/g) ?? []
  )

/**
 * Las piezas que mas se parecen a lo que se va a dibujar (por las palabras de
 * su titulo y su HTML), sin repetir carpeta. Si ninguna se parece, las primeras.
 */
export function piezasParecidas(
  piezas: (PiezaDeEjemplo & { html: string })[],
  texto: string,
  cuantas: number
): (PiezaDeEjemplo & { html: string })[] {
  const buscadas = palabrasDe(texto)
  return piezas
    .map((p, i) => {
      const suyas = palabrasDe(`${p.titulo} ${p.html.replace(/<[^>]+>/g, " ")}`)
      const comunes = [...buscadas].filter((w) => suyas.has(w)).length
      return { p, puntos: comunes - i * 0.01 }
    })
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, cuantas)
    .map((x) => x.p)
}
