/**
 * Corre en esta maquina los trabajos del chat de una conversacion, hasta tres a
 * la vez, sin pasar por pg_net ni por la ruta: reparte los turnos como
 * chat_despachar y llama a la misma pasada que usa la app. Sirve para probar el
 * motor antes de desplegarlo.
 *
 *   npx tsx --env-file=.env.local scripts/pasada-chat.ts <conversacion> [minutos]
 *
 * Enseña cada cambio de las tarjetas. Gasta lo mismo que trabajar desde el chat.
 */
import { randomUUID } from "node:crypto"

import { correrPasada } from "../src/engine/chat/pasada"
import { actualizarTrabajos, type TrabajoChat } from "../src/engine/chat/trabajos"
import { supabaseAdmin } from "../src/engine/supabase-admin"

const TOPE = 3
const CADA_MS = 3000

const supabase = supabaseAdmin()

async function leer(conversacionId: string): Promise<TrabajoChat[]> {
  const { data } = await supabase.from("chat_trabajos").select("*").eq("conversacion_id", conversacionId).order("created_at")
  return (data ?? []) as TrabajoChat[]
}

const ahora = () => new Date().toISOString().slice(11, 19)

async function main() {
  const [conversacionId, minutos] = process.argv.slice(2)
  if (!conversacionId) throw new Error("Uso: pasada-chat.ts <conversacion> [minutos]")
  const hasta = Date.now() + Number(minutos ?? 30) * 60_000

  const corriendo = new Map<string, Promise<void>>()
  const visto = new Map<string, string>()
  let maximo = 0

  while (Date.now() < hasta) {
    const trabajos = await leer(conversacionId)
    if (!trabajos.length) {
      await new Promise((r) => setTimeout(r, CADA_MS))
      continue
    }
    for (const t of trabajos) {
      const firma = `${t.estado} · ${t.fase ?? "-"} · ${t.paso}/${t.total} · ${t.etiqueta ?? ""}${t.error ? ` · ERROR ${t.error.slice(0, 100)}` : ""}`
      if (visto.get(t.id) !== firma) {
        console.log(`${ahora()} [${t.agente}] ${t.titulo ?? ""}: ${firma}`)
        visto.set(t.id, firma)
      }
    }

    const pendientes = trabajos.filter(
      (t) =>
        t.carril === "chat" &&
        t.agente !== "revisor" &&
        (t.estado === "espera" || t.estado === "trabajando") &&
        !corriendo.has(t.id) &&
        t.fallos < 4 &&
        (!t.reintentar_desde || new Date(t.reintentar_desde).getTime() <= Date.now())
    )
    for (const t of pendientes.slice(0, Math.max(0, TOPE - corriendo.size))) {
      const lease = randomUUID()
      await supabase
        .from("chat_trabajos")
        .update({
          lease_id: lease,
          lease_hasta: new Date(Date.now() + 60_000).toISOString(),
          fallos: t.fallos + 1,
          estado: "trabajando",
          vence_at: t.vence_at ?? new Date(Date.now() + 90 * 60_000).toISOString(),
          reintentar_desde: null,
        })
        .eq("id", t.id)
      const p = correrPasada({ trabajoId: t.id, leaseId: lease, despachar: false })
        .catch((e) => console.error(`pasada ${t.id}:`, e))
        .finally(() => corriendo.delete(t.id))
      corriendo.set(t.id, p)
    }
    maximo = Math.max(maximo, corriendo.size)

    await actualizarTrabajos({ conversacionId }).catch((e) => console.error("actualizar:", e instanceof Error ? e.message : e))
    const vivos = (await leer(conversacionId)).filter((t) => t.estado === "espera" || t.estado === "trabajando")
    if (!vivos.length && !corriendo.size) break
    await new Promise((r) => setTimeout(r, CADA_MS))
  }

  console.log(`\nMáximo de pasadas a la vez: ${maximo}`)
  const final = await leer(conversacionId)
  for (const t of final) console.log(`- [${t.agente}] ${t.titulo ?? ""}: ${t.estado}${t.piece_id ? ` · pieza ${t.piece_id}` : ""}${t.error ? ` · ${t.error}` : ""}`)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
