import { NextResponse } from "next/server"

/**
 * El HTML de una pieza del Estudio, servido como pagina para que Canva lo importe.
 *
 * El storage de InsForge entrega los .html como application/octet-stream (no
 * sirve paginas desde su dominio) y Canva solo importa una URL que responda
 * text/html. Esta ruta lo lee del storage y lo devuelve con su tipo. Solo
 * atiende archivos .html dentro de studio/, que es donde el compositor los deja.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ ruta: string[] }> }) {
  const { ruta } = await params
  const clave = ruta.map(decodeURIComponent).join("/")
  if (!clave.startsWith("studio/") || !clave.endsWith(".html") || clave.includes("..")) {
    return new NextResponse("No encontrado", { status: 404 })
  }
  const base = (process.env.INSFORGE_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL ?? "").replace(/\/$/, "")
  const r = await fetch(`${base}/api/storage/buckets/carousels/objects/${clave.split("/").map(encodeURIComponent).join("/")}`, { cache: "no-store" })
  if (!r.ok) return new NextResponse("No encontrado", { status: 404 })
  return new NextResponse(await r.text(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  })
}
