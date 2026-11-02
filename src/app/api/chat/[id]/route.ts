import { NextResponse } from "next/server"

import { limpiarSelecciones } from "@/engine/chat/editar"
import { seguirConversacion } from "@/engine/chat/pedidos"
import { dispararPasada, sesionChat } from "@/lib/chat-sesion"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Un mensaje en una conversacion abierta (el campo "Responde o pide un cambio…"),
 * con lo marcado en la pieza si hay. Lo guarda y dice si toca que conteste un agente: eso lo pide la pantalla a
 * /api/chat/[id]/responder, que contesta en streaming.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionChat()
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { texto?: unknown; selecciones?: unknown } | null
  const texto = typeof body?.texto === "string" ? body.texto.trim().slice(0, 8000) : ""
  if (!texto) return NextResponse.json({ error: "El mensaje está vacío." }, { status: 400 })

  try {
    const { disparar, responder } = await seguirConversacion({
      accountId: sesion.accountId,
      conversacionId: id,
      usuarioId: sesion.usuarioId,
      texto,
      selecciones: limpiarSelecciones(body?.selecciones),
    })
    dispararPasada(disparar)
    return NextResponse.json({ responder })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
