import { NextResponse } from "next/server"

import { vistaDePieza } from "@/engine/chat/piezas"
import { sesionChat } from "@/lib/chat-sesion"

export const dynamic = "force-dynamic"

/** Lo que enseña el panel de una pieza: sus laminas o su post, y sus versiones. */
export async function GET(_request: Request, { params }: { params: Promise<{ pieceId: string }> }) {
  const sesion = await sesionChat()
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const { pieceId } = await params
  try {
    return NextResponse.json(await vistaDePieza(sesion.accountId, pieceId))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 })
  }
}
