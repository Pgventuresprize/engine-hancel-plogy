import { after } from "next/server"

import { nombrarSiToca, responder } from "@/engine/chat/conversar"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { nombreDe } from "@/lib/chat-nombre"
import { sesionChat } from "@/lib/chat-sesion"
import { usuarioActual } from "@/lib/supabase/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * La respuesta de un agente al ultimo mensaje de la conversacion, mientras se
 * escribe. Una linea JSON por evento: quien contesta, cada trozo de texto y el
 * final (o el error). Despues, si toca, Hancel le pone nombre a la conversacion.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [sesion, usuario] = await Promise.all([sesionChat(), usuarioActual()])
  if (!sesion || !usuario) return Response.json({ error: "Sin sesión" }, { status: 401 })
  const { id } = await params

  const { data: conv } = await supabaseAdmin()
    .from("conversaciones")
    .select("id")
    .eq("id", id)
    .eq("account_id", sesion.accountId)
    .is("borrada_at", null)
    .maybeSingle()
  if (!conv) return Response.json({ error: "Esa conversación no existe o está en la papelera." }, { status: 404 })

  const persona = nombreDe(usuario)
  const codificar = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(control) {
      const enviar = (evento: Record<string, unknown>) => {
        try {
          control.enqueue(codificar.encode(`${JSON.stringify(evento)}\n`))
        } catch {
          // La pantalla se fue: la respuesta se guarda igual.
        }
      }
      try {
        await responder({
          accountId: sesion.accountId,
          conversacionId: id,
          persona,
          alAgente: (agente) => enviar({ tipo: "agente", agente }),
          alTexto: (t) => enviar({ tipo: "texto", t }),
        })
        enviar({ tipo: "fin" })
      } catch (e) {
        enviar({ tipo: "error", error: e instanceof Error ? e.message : String(e) })
      } finally {
        try {
          control.close()
        } catch {
          // Ya cerrada.
        }
      }
    },
  })

  after(async () => {
    try {
      await nombrarSiToca(sesion.accountId, id, persona)
    } catch (e) {
      console.error("[chat] No se pudo nombrar la conversación:", e instanceof Error ? e.message : e)
    }
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  })
}
