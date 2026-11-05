import { NextResponse } from "next/server"

import { descartarSubida, prepararSubida, registrarPosts, type PostASubir, type PostASubirTexto } from "@/engine/chat/posts-propios"
import { sesionChat } from "@/lib/chat-sesion"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Subir posts ya hechos. Las imagenes no pasan por aqui: esta ruta firma a donde
 * subirlas (`preparar`), convierte lo subido en piezas al enviar el mensaje
 * (`registrar`) y limpia si la persona se arrepiente antes (`descartar`).
 */
export async function POST(request: Request) {
  const sesion = await sesionChat()
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { accion?: unknown; posts?: unknown; ids?: unknown } | null

  try {
    if (body?.accion === "preparar" && Array.isArray(body.posts)) {
      return NextResponse.json(await prepararSubida(sesion.accountId, body.posts as PostASubir[]))
    }
    if (body?.accion === "registrar" && Array.isArray(body.posts)) {
      return NextResponse.json(await registrarPosts(sesion.accountId, body.posts as PostASubirTexto[]))
    }
    if (body?.accion === "descartar" && Array.isArray(body.ids)) {
      await descartarSubida(sesion.accountId, body.ids.filter((i): i is string => typeof i === "string"))
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "Pedido no válido." }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
