import { supabaseAdmin } from "../supabase-admin"

const BUCKET = "carousels"

/**
 * La imagen de la noticia redactada. Es proceso, no IA: la imagen principal del
 * articulo original (og:image), y si no se deja bajar, la miniatura que trajo
 * la extraccion o la de alguna de las fuentes.
 *
 * Se copia a nuestro storage en JPEG: el enlace del medio puede caducar o
 * bloquear que se muestre desde otro sitio, y la noticia redactada no puede
 * quedarse sin foto por eso.
 */
export async function imagenDeNoticia(accountId: string, newsId: string, candidatas: (string | null | undefined)[]): Promise<string | null> {
  const sharp = (await import("sharp")).default
  const supabase = supabaseAdmin()
  const vistas = new Set<string>()
  for (const url of candidatas) {
    if (!url || vistas.has(url) || !/^https?:\/\//.test(url)) continue
    vistas.add(url)
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", Accept: "image/*" },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) continue
      const bruto = Buffer.from(await res.arrayBuffer())
      if (bruto.length < 8_000) continue
      const img = sharp(bruto)
      const info = await img.metadata()
      // Una miniatura o un icono no sirven de foto de la noticia.
      if (!info.width || info.width < 400) continue
      const jpg = await img.rotate().resize({ width: 1600, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 86 }).toBuffer()
      const ruta = `redaccion/${accountId}/${newsId}.jpg`
      const { error } = await supabase.storage.from(BUCKET).upload(ruta, jpg, { contentType: "image/jpeg", upsert: true })
      if (error) return url
      return `${supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl}?v=${Date.now().toString(36)}`
    } catch {
      continue
    }
  }
  return null
}
