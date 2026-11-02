import { NextResponse } from "next/server"

import { vistaDeVersion } from "@/engine/chat/piezas"
import { sesionChat } from "@/lib/chat-sesion"

export const dynamic = "force-dynamic"

/** Una version vieja de la pieza: el texto de sus laminas o su post. */
export async function GET(_request: Request, { params }: { params: Promise<{ pieceId: string; n: string }> }) {
  const sesion = await sesionChat()
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const { pieceId, n } = await params
  try {
    return NextResponse.json(await vistaDeVersion(sesion.accountId, pieceId, Number(n)))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 })
  }
}
