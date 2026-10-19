import { supabaseAdmin } from "../supabase-admin"

/**
 * Sube las imagenes del carrusel a Supabase Storage.
 *
 * El bucket es publico a proposito: al publicar, Instagram descarga cada imagen
 * desde sus propios servidores, asi que una URL firmada y efimera no le vale.
 * Lo que se sube es contenido pensado para publicarse.
 */

export const BUCKET = "carousels"

/** El orden del array ES el orden del carrusel, y no se puede perder. */
export async function subirCarrusel(
  pieceKey: string,
  imagenes: Buffer[]
): Promise<string[]> {
  const supabase = supabaseAdmin()
  const urls: string[] = []

  // Una marca por regeneracion, la misma para todas las laminas de la tanda.
  // La ruta se reescribe, asi que sin esto la direccion publica seria identica
  // a la de antes y el navegador seguiria enseñando la imagen vieja: se
  // regeneraba de verdad y no se notaba en absoluto.
  const version = Date.now().toString(36)

  for (const [indice, png] of imagenes.entries()) {
    // El numero va con cero delante para que ordenar por nombre en el panel de
    // Supabase coincida con el orden real del carrusel.
    const numero = String(indice + 1).padStart(2, "0")
    const ruta = `${pieceKey}/${numero}.png`

    const { error } = await supabase.storage.from(BUCKET).upload(ruta, png, {
      contentType: "image/png",
      // Regenerar un carrusel reescribe sus imagenes en vez de acumular basura.
      upsert: true,
    })

    if (error) throw new Error(`No se pudo subir la imagen ${numero}: ${error.message}`)

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta)
    urls.push(`${data.publicUrl}?v=${version}`)
  }

  return urls
}

/**
 * Sube una imagen suelta dentro de la carpeta de un carrusel.
 *
 * La usa la portada de Facebook, que es la misma lamina que la del carrusel
 * pero dibujada de nuevo sin numeracion. Vive en la misma carpeta para que
 * borrar el carrusel se la lleve tambien.
 */
export async function subirImagenSuelta(
  pieceKey: string,
  nombre: string,
  png: Buffer
): Promise<string> {
  const supabase = supabaseAdmin()
  const ruta = `${pieceKey}/${nombre}.png`

  const { error } = await supabase.storage.from(BUCKET).upload(ruta, png, {
    contentType: "image/png",
    upsert: true,
  })
  if (error) throw new Error(`No se pudo subir ${nombre}: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta)
  return `${data.publicUrl}?v=${Date.now().toString(36)}`
}

/**
 * Guarda el logo de una cuenta y devuelve su URL publica.
 *
 * Vive en el mismo bucket que los carruseles, que ya es publico, pero en su
 * propia carpeta: `borrarCarrusel` lista por la carpeta del buzon, asi que
 * ningun descarte de pieza se lo lleva por delante.
 *
 * La marca de version es lo que hace que un logo nuevo se vea: la ruta es
 * siempre la misma y sin ella el navegador seguiria sirviendo el anterior.
 */
export async function subirLogo(
  accountId: string,
  version: "claro" | "oscuro" | "perfil",
  bytes: Buffer,
  contentType: string
): Promise<string> {
  const supabase = supabaseAdmin()
  // Con extension: Canva, al importar el HTML de una pieza, no carga una
  // imagen cuya URL no termina en .png/.jpg/...
  const ext = contentType.includes("svg") ? "svg" : contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png"
  const ruta = `marca/${accountId}/logo-${version}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(ruta, bytes, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(`No se pudo subir el logo: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta)
  return `${data.publicUrl}?v=${Date.now().toString(36)}`
}

/** Quita una version del logo. */
export async function borrarLogo(
  accountId: string,
  version: "claro" | "oscuro" | "perfil"
): Promise<void> {
  const base = `marca/${accountId}/logo-${version}`
  await supabaseAdmin().storage.from(BUCKET).remove([base, ...["png", "jpg", "svg", "webp"].map((e) => `${base}.${e}`)])
}

/** Borra las imagenes de un carrusel. Se usa al descartar una pieza. */
export async function borrarCarrusel(pieceKey: string): Promise<void> {
  const supabase = supabaseAdmin()
  const { data } = await supabase.storage.from(BUCKET).list(pieceKey)
  if (!data || data.length === 0) return

  await supabase.storage.from(BUCKET).remove(data.map((f) => `${pieceKey}/${f.name}`))
}
