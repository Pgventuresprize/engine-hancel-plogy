"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { desconectar, enlaceConexion, type Toolkit } from "@/engine/composio/conexiones"

/**
 * Empieza la conexion de la empresa abierta con un servicio de Composio
 * (Canva, Facebook o Instagram): devuelve la url donde se inicia sesion. Al
 * terminar, Composio vuelve a Conexiones con `?<servicio>=ok`.
 */
export async function conectarServicio(
  toolkit: Toolkit
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!["canva", "facebook", "instagram"].includes(toolkit)) return { ok: false, error: "Servicio desconocido." }
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  if (!host) return { ok: false, error: "No se pudo saber la direccion de la app." }
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return enlaceConexion(await idDeCuentaActual(), toolkit, `${proto}://${host}/configuracion/conexiones?${toolkit}=ok`)
}

export async function conectarCanva() {
  return conectarServicio("canva")
}

/** Desconecta un servicio de Composio de la empresa abierta. */
export async function desconectarServicio(toolkit: Toolkit): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!["canva", "facebook", "instagram"].includes(toolkit)) return { ok: false, error: "Servicio desconocido." }
  const accountId = await idDeCuentaActual()
  const r = await desconectar(accountId, toolkit)
  if (r.ok && toolkit !== "canva") {
    const { guardarSecretos } = await import("@/engine/secretos")
    await guardarSecretos(
      accountId,
      toolkit === "facebook" ? { facebook_page_id: null, facebook_page_name: null } : { instagram_user_id: null, instagram_username: null }
    )
  }
  revalidatePath("/configuracion/conexiones")
  return r
}

/** La pagina de Facebook en la que publica la empresa abierta. */
export async function guardarPaginaFacebook(id: string, nombre: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountId = await idDeCuentaActual()
  const { paginasFacebook, elegirPaginaFacebook } = await import("@/engine/publish/meta")
  // La pagina tiene que ser una de las que maneja la cuenta conectada.
  const r = await paginasFacebook(accountId)
  if (!r.ok) return r
  if (!r.paginas.some((p) => p.id === id)) return { ok: false, error: "Esa página no la maneja la cuenta de Facebook conectada." }
  await elegirPaginaFacebook(accountId, { id, name: nombre })
  revalidatePath("/configuracion/conexiones")
  return { ok: true }
}

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * La zona horaria de la cuenta.
 *
 * Lo unico que sobrevive de la pantalla de horario: las horas de ejecucion las
 * lleva ahora cada agente en su ficha, pero el huso sigue siendo uno solo para
 * toda la cuenta, porque es el que da sentido a todas esas horas. Tenerlo por
 * agente permitiria configurarlos en husos distintos, que no es una libertad
 * que nadie quiera y si una forma nueva de equivocarse.
 */
export async function updateTimezone(timezone: string): Promise<ActionResult> {
  const limpia = timezone.trim() || "America/Bogota"

  try {
    // Falla pronto si la zona no existe, en vez de silenciarse en cada pasada.
    new Intl.DateTimeFormat("en-GB", { timeZone: limpia })
  } catch {
    return { ok: false, error: `La zona horaria "${limpia}" no es valida.` }
  }

  try {
    const { error } = await supabaseAdmin()
      .from("engine_settings")
      .update({ timezone: limpia, updated_at: new Date().toISOString() })
      .eq("account_id", await idDeCuentaActual())

    if (error) throw new Error(error.message)

    // El huso cambia lo que significa "las 11" en todas las fichas de agente.
    revalidatePath("/configuracion/general")
    revalidatePath("/agentes", "layout")
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message || "No se pudo guardar la zona horaria." }
  }
}
