/**
 * Le escribe al chat desde la terminal, como una persona, y enseña lo que hace
 * el agente: lo que busca, lo que responde y las fuentes.
 *
 *   npx tsx --env-file=.env.local scripts/probar-chat.ts "<mensaje>" [slug-de-cuenta] [--dejar]
 *
 * Usa el token de la cuenta y deja la conversacion en la papelera al terminar,
 * salvo con --dejar. Gasta lo mismo que escribir en el chat.
 */
import { randomUUID } from "node:crypto"

import { responder } from "../src/engine/chat/conversar"
import type { ReferenciaFuente } from "../src/engine/chat/mensajes"
import { crearConversacion } from "../src/engine/chat/pedidos"
import { supabaseAdmin } from "../src/engine/supabase-admin"

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dejar")
  const dejar = process.argv.includes("--dejar")
  const [texto, slug] = args
  if (!texto) throw new Error('Uso: probar-chat.ts "<mensaje>" [slug-de-cuenta] [--dejar]')

  const supabase = supabaseAdmin()
  const { data } = await supabase.from("accounts").select("id, slug").order("created_at").limit(50)
  const cuentas = (data ?? []) as { id: string; slug: string }[]
  const cuenta = slug ? cuentas.find((c) => c.slug === slug) : cuentas[0]
  if (!cuenta) throw new Error("No encontré la cuenta.")

  const { conversacionId, responder: toca } = await crearConversacion({
    accountId: cuenta.id,
    usuarioId: randomUUID(),
    texto,
    noticia: null,
    agentes: [],
  })
  console.log(`Conversación ${conversacionId} en ${cuenta.slug}. ¿Responde un agente? ${toca}\n`)

  const inicio = Date.now()
  const { agente, mensaje } = await responder({
    accountId: cuenta.id,
    conversacionId,
    persona: "Prueba",
    alAgente: (a) => console.log(`[${a}]`),
    alTexto: (t) => process.stdout.write(t),
    alHerramienta: (d) => console.log(`\n  · ${d}`),
  })

  const fuentes = mensaje.referencias.filter((r): r is ReferenciaFuente => r.tipo === "fuente")
  console.log(`\n\n--- ${agente}, ${((Date.now() - inicio) / 1000).toFixed(1)} s, uso ${JSON.stringify((mensaje as unknown as { uso: unknown }).uso)}`)
  console.log(`Fuentes: ${fuentes.map((f) => f.url).join(" ") || "(ninguna)"}`)

  const { count } = await supabase.from("chat_trabajos").select("id", { count: "exact", head: true }).eq("conversacion_id", conversacionId)
  console.log(`Trabajos creados: ${count ?? 0}`)
  if (!dejar) {
    await supabase.from("conversaciones").update({ borrada_at: new Date().toISOString() }).eq("id", conversacionId)
    console.log("Conversación enviada a la papelera.")
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
