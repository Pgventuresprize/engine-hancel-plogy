import { NextResponse } from "next/server"

import { crearConversacion } from "@/engine/chat/pedidos"
import { loteDe } from "@/engine/chat/posts-propios"
import { actualizarTrabajos } from "@/engine/chat/trabajos"
import { estadoChat, noticiasConAngulo } from "@/lib/chat-data"
import { dispararPasada, sesionChat } from "@/lib/chat-sesion"
import type { AgenteElegible, NoticiaAdjunta } from "@/lib/chat-tipos"

export const dynamic = "force-dynamic"

/** Lo que encola una pieza puede seguir con una pasada (after): necesita el mismo margen que el tick. */
export const maxDuration = 300

/**
 * GET: lo que la pantalla del chat consulta cada pocos segundos mientras algo
 * trabaja. Antes de leer pone al dia los trabajos de la marca, asi el avance no
 * depende solo del tick. `?c=` es la conversacion abierta; `?noticias=1` suma
 * las noticias que se pueden adjuntar.
 */
export async function GET(request: Request) {
  const sesion = await sesionChat()
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const url = new URL(request.url)
  const c = url.searchParams.get("c")

  try {
    const { disparar } = await actualizarTrabajos({ accountId: sesion.accountId })
    dispararPasada(disparar)
  } catch (e) {
    console.error("[chat] No se pudieron actualizar los trabajos:", e instanceof Error ? e.message : e)
  }

  const [estado, noticias] = await Promise.all([
    estadoChat(sesion.accountId, c && /^[0-9a-f-]{36}$/i.test(c) ? c : null),
    url.searchParams.get("noticias") ? noticiasConAngulo(sesion.accountId) : Promise.resolve(undefined),
  ])
  return NextResponse.json({ ...estado, ...(noticias ? { noticias } : {}) })
}

const ELEGIBLES: AgenteElegible[] = ["instagram", "linkedin", "revisor"]

/** POST: una conversacion nueva desde la portada. */
export async function POST(request: Request) {
  const sesion = await sesionChat()
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    texto?: unknown
    noticia?: NoticiaAdjunta | null
    agentes?: unknown
    lote?: unknown
  } | null
  const texto = typeof body?.texto === "string" ? body.texto.trim().slice(0, 8000) : ""
  if (!texto) return NextResponse.json({ error: "El mensaje está vacío." }, { status: 400 })
  const agentes = Array.isArray(body?.agentes)
    ? ELEGIBLES.filter((a) => (body.agentes as unknown[]).includes(a))
    : []
  const n = body?.noticia
  const noticia: NoticiaAdjunta | null =
    n && typeof n.angleId === "string"
      ? {
          angleId: n.angleId,
          newsId: String(n.newsId ?? ""),
          titulo: String(n.titulo ?? "").slice(0, 300),
          puntaje: typeof n.puntaje === "number" ? n.puntaje : null,
          fuente: typeof n.fuente === "string" ? n.fuente.slice(0, 120) : null,
        }
      : null

  try {
    const lote = await loteDe(sesion.accountId, body?.lote)
    const { conversacionId, disparar, responder } = await crearConversacion({ ...sesion, texto, noticia, agentes, referencias: lote ? [lote] : [] })
    dispararPasada(disparar)
    return NextResponse.json({ id: conversacionId, responder })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
