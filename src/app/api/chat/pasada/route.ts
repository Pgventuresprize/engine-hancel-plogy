import { after, NextResponse } from "next/server"

import { correrPasada } from "@/engine/chat/pasada"
import { authorizeEngineRequest } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

/** Dibujar un carrusel necesita el mismo margen que el tick. */
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Una pasada de un trabajo del chat. La llama Postgres (chat_despachar) con el
 * turno ya apartado: responde enseguida y trabaja despues, con su propio tiempo
 * de funcion. Asi tres pasadas a la vez son tres funciones y no se reparten una.
 */
export async function POST(request: Request) {
  const denied = authorizeEngineRequest(request)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { trabajo?: unknown; lease?: unknown } | null
  const trabajoId = typeof body?.trabajo === "string" ? body.trabajo : ""
  const leaseId = typeof body?.lease === "string" ? body.lease : ""
  if (!UUID.test(trabajoId) || !UUID.test(leaseId)) return NextResponse.json({ error: "Falta el trabajo o el turno." }, { status: 400 })

  after(async () => {
    try {
      await correrPasada({ trabajoId, leaseId })
    } catch (e) {
      console.error("[chat] La pasada se cayó:", e instanceof Error ? e.message : e)
    }
  })
  return NextResponse.json({ ok: true }, { status: 202 })
}
