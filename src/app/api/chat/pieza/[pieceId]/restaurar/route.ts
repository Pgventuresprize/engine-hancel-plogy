import { NextResponse } from "next/server"

import { restaurarVersion } from "@/engine/chat/piezas"
import { sesionChat } from "@/lib/chat-sesion"

export const dynamic = "force-dynamic"

/** Redibujar un carrusel con Chromium lleva su rato. */
export const maxDuration = 300

/** "Restaurar como nueva versión". */
export async function POST(request: Request, { params }: { params: Promise<{ pieceId: string }> }) {
  const sesion = await sesionChat()
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const { pieceId } = await params
  const body = (await request.json().catch(() => null)) as { n?: unknown } | null
  const n = Number(body?.n)
  if (!Number.isInteger(n) || n < 1) return NextResponse.json({ error: "Falta la versión." }, { status: 400 })
  try {
    const nueva = await restaurarVersion(sesion.accountId, pieceId, n, sesion.usuarioId)
    return NextResponse.json({ version: nueva })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
