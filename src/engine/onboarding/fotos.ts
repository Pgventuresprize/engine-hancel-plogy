import { createHash, randomUUID } from "node:crypto"
import sharp from "sharp"

import { BUCKET_IMAGENES, CALIDAD_IMAGEN, CALIDAD_MINI, LADO_IMAGEN, LADO_MINI, MAX_BYTES_IMAGEN } from "../marca/imagenes-modelo"
import { etiquetarPendientes, registrarImagenes, type ImagenSubida } from "../marca/imagenes"
import { supabaseAdmin } from "../supabase-admin"
import { bajarArchivo, enCola } from "./archivos"
import { segura } from "./leer"

/**
 * Las fotos de la marca, a su biblioteca desde el primer momento.
 *
 * Primero las que subio la persona y despues las de su web. Quedan como cualquier otra
 * imagen de la biblioteca: se ven, se editan y el carrusel las elige antes de ir a un
 * banco. Que una imagen este en una web no la hace una foto: los iconos, los recortes y
 * los graficos se descartan aqui, y lo que el etiquetador califica mal (banners con
 * texto encima, capturas) se guarda desactivado para que nadie lo publique sin querer.
 */

const MAX_FOTOS = 16
const MAX_DE_LA_WEB = 40
const MAX_BYTES_BAJADA = 12 * 1024 * 1024
const MIN_LADO_LARGO = 700
const MIN_LADO_CORTO = 450
/** Mas alargada que esto es una franja: recortada a 4:5 no queda nada. */
const MAX_PROPORCION = 2.4
/** Por debajo de esta entropia es un grafico plano, no una foto. */
const MIN_ENTROPIA = 5.2
/** Del etiquetador: 1 y 2 son borrosas, con marca de agua o con texto que no se tapa. */
const MIN_CALIDAD = 3
const A_LA_VEZ = 5
const PLAZO_MS = 12_000
const MAX_SALTOS = 3

async function bajarDeLaWeb(direccion: string): Promise<Buffer | null> {
  let url: URL
  try {
    url = new URL(direccion)
  } catch {
    return null
  }
  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    if (!(await segura(url))) return null
    try {
      const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(PLAZO_MS) })
      if (r.status >= 300 && r.status < 400) {
        const destino = r.headers.get("location")
        if (!destino) return null
        url = new URL(destino, url)
        continue
      }
      const tipo = r.headers.get("content-type") ?? ""
      if (!r.ok || !tipo.startsWith("image/") || /svg|gif/.test(tipo)) return null
      if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES_BAJADA) return null
      const datos = Buffer.from(await r.arrayBuffer())
      return datos.length <= MAX_BYTES_BAJADA ? datos : null
    } catch {
      return null
    }
  }
  return null
}

type Preparada = { imagen: Buffer; mini: Buffer; ancho: number; alto: number; huella: string }

/**
 * Comprueba que sea una foto y la deja lista. Null si no sirve. La huella sale de la
 * imagen reducida: la misma foto en dos tamaños de una web cuenta como una sola. Lo que
 * subio la persona no se filtra: ya la eligio ella, y perderla sin avisar seria peor.
 */
export async function prepararFoto(datos: Buffer, propia = false): Promise<Preparada | null> {
  try {
    const base = sharp(datos, { failOn: "none" }).rotate()
    const { width: w = 0, height: h = 0 } = await base.metadata()
    const [largo, corto] = [Math.max(w, h), Math.min(w, h)]
    if (!largo) return null
    if (!propia) {
      if (largo < MIN_LADO_LARGO || corto < MIN_LADO_CORTO || largo / corto > MAX_PROPORCION) return null
      const stats = await base.clone().stats()
      if (!stats.isOpaque || stats.entropy < MIN_ENTROPIA) return null
    }

    const lado = { width: LADO_IMAGEN, height: LADO_IMAGEN, fit: "inside", withoutEnlargement: true } as const
    const { data: imagen, info } = await base
      .clone()
      .resize(lado)
      .webp({ quality: Math.round(CALIDAD_IMAGEN * 100) })
      .toBuffer({ resolveWithObject: true })
    if (imagen.length > MAX_BYTES_IMAGEN) return null
    const mini = await base
      .clone()
      .resize({ width: LADO_MINI, height: LADO_MINI, fit: "inside" })
      .webp({ quality: Math.round(CALIDAD_MINI * 100) })
      .toBuffer()
    const reducida = await base.clone().resize(16, 16, { fit: "fill" }).greyscale().raw().toBuffer()
    return { imagen, mini, ancho: info.width, alto: info.height, huella: createHash("sha256").update(reducida).digest("hex") }
  } catch {
    return null
  }
}

async function subir(accountId: string, p: Preparada, nombre: string): Promise<ImagenSubida | null> {
  const id = randomUUID()
  const ruta = `${accountId}/${id}.webp`
  const rutaMini = `${accountId}/${id}-mini.webp`
  const storage = supabaseAdmin().storage.from(BUCKET_IMAGENES)
  const [a, b] = await Promise.all([
    storage.upload(ruta, p.imagen, { contentType: "image/webp" }),
    storage.upload(rutaMini, p.mini, { contentType: "image/webp" }),
  ])
  if (a.error || b.error) return null
  return { id, ruta, rutaMini, ancho: p.ancho, alto: p.alto, bytes: p.imagen.length, huella: p.huella, nombreOriginal: nombre }
}

export type FotosTraidas = { encontradas: number; guardadas: number; utiles: number }

/** Baja, filtra, guarda y etiqueta. Nunca lanza: sin fotos la marca sigue adelante. */
export async function traerFotos(
  accountId: string,
  propias: string[],
  deLaWeb: { url: string; alt: string | null }[]
): Promise<FotosTraidas> {
  const vacio = { encontradas: propias.length + deLaWeb.length, guardadas: 0, utiles: 0 }
  try {
    const candidatas = [
      ...propias.map((ruta) => ({ nombre: "Tu foto", propia: true, bajar: () => bajarArchivo(accountId, ruta) })),
      ...deLaWeb.slice(0, MAX_DE_LA_WEB).map((f) => ({ nombre: f.alt || "De su web", propia: false, bajar: () => bajarDeLaWeb(f.url) })),
    ]
    const preparadas = await enCola(candidatas, A_LA_VEZ, async (c) => {
      const datos = await c.bajar()
      const foto = datos && (await prepararFoto(datos, c.propia))
      return foto ? { ...c, foto } : null
    })

    const vistas = new Set<string>()
    const unicas = preparadas
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .filter((p) => {
        if (vistas.has(p.foto.huella)) return false
        vistas.add(p.foto.huella)
        return true
      })
      .slice(0, MAX_FOTOS)

    const subidas = await enCola(unicas, A_LA_VEZ, async (p) => ({ propia: p.propia, ficha: await subir(accountId, p.foto, p.nombre) }))
    const fichas = subidas.flatMap((s) => (s.ficha ? [s.ficha] : []))
    if (!fichas.length) return vacio
    const guardadas = await registrarImagenes(accountId, fichas)
    await etiquetarPendientes(accountId, MAX_FOTOS)

    // Las de la web que salieron mal quedan guardadas pero fuera de juego. Las propias
    // las eligio la persona: esa decision es suya.
    const web = subidas.flatMap((s) => (s.ficha && !s.propia ? [s.ficha.id] : []))
    const supabase = supabaseAdmin()
    if (web.length) await supabase.from("brand_imagenes").update({ activa: false }).in("id", web).lt("calidad", MIN_CALIDAD)
    const { count } = await supabase
      .from("brand_imagenes")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .eq("activa", true)
      .eq("etiquetado", "hecho")
    return { encontradas: vacio.encontradas, guardadas, utiles: count ?? 0 }
  } catch (e) {
    console.error("[onboarding] No se pudieron traer las fotos:", e instanceof Error ? e.message : e)
    return vacio
  }
}
