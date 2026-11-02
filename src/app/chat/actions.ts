"use server"

import { detenerConversacion } from "@/engine/chat/trabajos"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { cuentaActual } from "@/lib/accounts"
import { usuarioActual } from "@/lib/supabase/auth"

/**
 * Lo que se hace con una conversacion desde la lista o su cabecera. Cualquier
 * miembro de la marca puede hacerlo todo, incluido borrar y restaurar: las
 * conversaciones son del equipo, no de quien las empezo.
 *
 * Borrar la manda a la papelera; el cron `engine_hancel_papelera_chat` la borra
 * de verdad a los 15 dias (supabase/scheduler.sql).
 */

type Resultado = { ok: true } | { ok: false; error: string }

async function cambiar(id: string, cambios: Record<string, unknown>, soloEn: "activas" | "papelera" | "todas" = "activas"): Promise<Resultado> {
  try {
    const cuenta = await cuentaActual()
    let q = supabaseAdmin().from("conversaciones").update(cambios).eq("id", id).eq("account_id", cuenta.id)
    if (soloEn === "activas") q = q.is("borrada_at", null)
    if (soloEn === "papelera") q = q.not("borrada_at", "is", null)
    const { data, error } = await q.select("id")
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: "Esa conversación ya no está." }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Pone el nombre a mano: desde ahi Hancel ya no lo cambia solo. */
export async function renombrarConversacion(id: string, titulo: string): Promise<Resultado> {
  const limpio = titulo.replace(/\s+/g, " ").trim().slice(0, 120)
  if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío." }
  return cambiar(id, { titulo: limpio, titulo_auto: false })
}

export async function guardarConversacion(id: string, guardada: boolean): Promise<Resultado> {
  return cambiar(id, { guardada })
}

/** A la papelera. Lo que estaba trabajando se detiene: las piezas ya hechas siguen donde estan. */
export async function mandarAPapelera(id: string): Promise<Resultado> {
  const usuario = await usuarioActual()
  const r = await cambiar(id, { borrada_at: new Date().toISOString(), borrada_por: usuario?.id ?? null })
  if (r.ok) {
    try {
      await detenerConversacion((await cuentaActual()).id, id)
    } catch (e) {
      console.error("[chat] No se pudo detener lo que trabajaba al borrar:", e instanceof Error ? e.message : e)
    }
  }
  return r
}

/** Deshacer el borrado, o sacarla de la papelera. */
export async function restaurarConversacion(id: string): Promise<Resultado> {
  return cambiar(id, { borrada_at: null, borrada_por: null }, "papelera")
}

/** Borrar para siempre desde la papelera: mensajes y trabajos se van en cascada; las piezas quedan. */
export async function borrarConversacionYa(id: string): Promise<Resultado> {
  try {
    const cuenta = await cuentaActual()
    const { error } = await supabaseAdmin()
      .from("conversaciones")
      .delete()
      .eq("id", id)
      .eq("account_id", cuenta.id)
      .not("borrada_at", "is", null)
    return error ? { ok: false, error: error.message } : { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * "Abrir en el chat" desde la ficha del tablero: devuelve la conversacion de la
 * pieza (la crea si no tiene) para abrirla con la pieza en el panel.
 */
export async function abrirPiezaEnChat(pieceId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const [cuenta, usuario] = await Promise.all([cuentaActual(), usuarioActual()])
    if (!usuario) return { ok: false, error: "Sin sesión." }
    const { conversacionDePieza } = await import("@/engine/chat/piezas")
    return { ok: true, id: await conversacionDePieza(cuenta.id, pieceId, usuario.id) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
