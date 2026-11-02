import { NextResponse } from "next/server"

import { laminaParaMarcar } from "@/engine/chat/piezas"
import { sesionChat } from "@/lib/chat-sesion"

export const dynamic = "force-dynamic"

/**
 * Una lamina del carrusel armada como se dibuja, con lo necesario para marcar
 * sus partes. El panel la pone en un iframe sin acceso a la pagina.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ pieceId: string; n: string }> }) {
  const sesion = await sesionChat()
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const { pieceId, n } = await params
  try {
    const html = await laminaParaMarcar(sesion.accountId, pieceId, Number(n))
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 })
  }
}
