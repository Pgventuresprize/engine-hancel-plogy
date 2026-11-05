import { NextResponse } from "next/server"

import { confirmarDesdeBoton } from "@/engine/chat/posts-propios"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { sesionChat } from "@/lib/chat-sesion"

export const dynamic = "force-dynamic"

/** El boton de la propuesta: programa lo que la persona esta viendo, sin pasar por el agente. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionChat()
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { mensajeId?: unknown } | null
  if (typeof body?.mensajeId !== "string") return NextResponse.json({ error: "Falta la propuesta." }, { status: 400 })

  const { data: conv } = await supabaseAdmin().from("conversaciones").select("id").eq("id", id).eq("account_id", sesion.accountId).is("borrada_at", null).maybeSingle()
  if (!conv) return NextResponse.json({ error: "Esa conversación no existe o está en la papelera." }, { status: 404 })

  try {
    const r = await confirmarDesdeBoton(sesion.accountId, id, body.mensajeId)
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 409 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
