import "server-only"

import { after } from "next/server"

import type { RedChat } from "@/engine/chat/trabajos"
import { runContentTick } from "@/engine/content/tick"
import { cuentaActual } from "@/lib/accounts"
import { usuarioActual } from "@/lib/supabase/auth"

/** Quien escribe en el chat y con que marca. `null` si no hay sesion. */
export async function sesionChat(): Promise<{ accountId: string; usuarioId: string } | null> {
  const usuario = await usuarioActual()
  if (!usuario) return null
  const cuenta = await cuentaActual()
  return { accountId: cuenta.id, usuarioId: usuario.id }
}

/**
 * Corre una pasada de contenido despues de responder, para que lo que el chat
 * acaba de encolar empiece ya y no al siguiente cron. La pasada termina sola de
 * poner al dia los trabajos del chat (tick.ts llama a actualizarTrabajos).
 */
export function dispararPasada(redes: RedChat[]): void {
  if (!redes.length) return
  after(async () => {
    try {
      await runContentTick({ trigger: "manual", forzar: [...new Set(redes)], presupuesto: 1 })
    } catch (e) {
      console.error("[chat] La pasada a mano falló:", e instanceof Error ? e.message : e)
    }
  })
}
