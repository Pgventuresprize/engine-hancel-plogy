import { NextResponse } from "next/server"

import { BUCKET_IMAGENES, parseRecorte } from "@/engine/marca/imagenes-modelo"
import { cargarFoto } from "@/engine/marca/imagenes"
import { dibujarLaminas } from "@/engine/render/navegador"
import { htmlDe, laminasDelKit } from "@/engine/render/prototipo/plantillas"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * PROTOTIPO 4.0 (se quita cuando exista el importador de kits).
 *
 * Dibuja tres laminas del kit de Plogy con Chromium para medir, en Vercel, si
 * el navegador arranca, cuanto tarda y si dibuja igual que en local. No escribe
 * nada: la foto del cierre se lee de la biblioteca y el PNG vuelve en la
 * respuesta.
 *
 *   /api/render/navegador                 -> JSON con tiempos y problemas
 *   /api/render/navegador?lamina=cierre   -> el PNG de esa lamina
 */

// Si esta instancia ya arranco el navegador antes (arranque en caliente).
let usada = false

/** Una foto cualquiera de la biblioteca, para el cierre. Solo lee. */
async function fotoDeBiblioteca(): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("brand_imagenes")
    .select("ruta, recorte")
    .eq("activa", true)
    .eq("etiquetado", "hecho")
    .order("created_at", { ascending: true })
    .limit(1)
  const fila = data?.[0] as { ruta: string; recorte: unknown } | undefined
  const foto = fila ? await cargarFoto(fila.ruta, parseRecorte(fila.recorte)) : null
  if (!foto) throw new Error(`No hay fotos en ${BUCKET_IMAGENES} para el cierre.`)
  return foto
}

export async function GET(request: Request) {
  const rechazo = authorizeEngineRequest(request)
  if (rechazo) return NextResponse.json({ error: rechazo }, { status: 401 })

  const url = new URL(request.url)
  const pedida = url.searchParams.get("lamina")
  const frio = !usada
  usada = true

  try {
    const inicio = Date.now()
    const foto = await fotoDeBiblioteca()
    const msFoto = Date.now() - inicio
    const l = laminasDelKit()
    const casos = [
      { k: "portada", html: htmlDe(l.portada, 1, 6) },
      { k: "dato", html: htmlDe(l.dato, 3, 7) },
      { k: "cierre", html: htmlDe(l.cierre, 6, 6, { foto }) },
    ].filter((c) => !pedida || c.k === pedida)
    if (!casos.length) return NextResponse.json({ error: "lamina: portada, dato o cierre" }, { status: 400 })

    const antes = Date.now()
    const dibujadas = await dibujarLaminas(
      casos.map((c) => c.html),
      { ancho: 1080, alto: 1350 }
    )
    const msDibujo = Date.now() - antes

    if (pedida) {
      return new NextResponse(new Uint8Array(dibujadas[0].png), {
        headers: { "content-type": "image/png", "x-ms": String(msDibujo), "x-frio": String(frio) },
      })
    }
    const msLaminas = dibujadas.reduce((s, d) => s + d.ms, 0)
    return NextResponse.json({
      frio,
      msFoto,
      msDibujo,
      msArranque: msDibujo - msLaminas,
      laminas: casos.map((c, i) => ({
        lamina: c.k,
        ms: dibujadas[i].ms,
        bytes: dibujadas[i].png.length,
        problemas: dibujadas[i].problemas,
        encogidos: dibujadas[i].encogidos,
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), frio }, { status: 500 })
  }
}
