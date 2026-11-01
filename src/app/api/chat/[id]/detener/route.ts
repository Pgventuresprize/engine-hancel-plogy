import { NextResponse } from "next/server"

import { detenerConversacion } from "@/engine/chat/trabajos"
import { sesionChat } from "@/lib/chat-sesion"

export const dynamic = "force-dynamic"

/** "Detener": para lo que esta haciendo la conversacion. Se retoma escribiendo "sigue". */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionChat()
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const { id } = await params
  try {
    const detenidos = await detenerConversacion(sesion.accountId, id)
    return NextResponse.json({ detenidos })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
