"use server"

import { revalidatePath } from "next/cache"

import { guardarSecretos, secretosDe } from "@/engine/secretos"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { enviarPrueba, nuevoSecreto } from "@/engine/web/webhook"
import { exigirOwner } from "@/lib/accounts"

/**
 * La conexion con el portal de noticias de la empresa: la URL a la que se
 * envian las noticias redactadas y el secreto con que se firman. La gestiona
 * un owner; cada empresa tiene la suya.
 */

export type ResultadoWeb = { ok: true; aviso?: string; secreto?: string } | { ok: false; error: string }

function falla(e: unknown): ResultadoWeb {
  return { ok: false, error: e instanceof Error ? e.message : String(e) }
}

function refrescar() {
  revalidatePath("/configuracion/conexiones")
  revalidatePath("/")
}

/** Guarda la URL. La primera vez genera el secreto y lo devuelve para copiarlo. */
export async function guardarWebNoticias(url: string): Promise<ResultadoWeb> {
  try {
    const cuenta = await exigirOwner()
    const limpia = url.trim()
    let u: URL
    try {
      u = new URL(limpia)
    } catch {
      return { ok: false, error: "Esa URL no es válida." }
    }
    if (u.protocol !== "https:" && !u.hostname.startsWith("localhost")) return { ok: false, error: "La URL tiene que ser https." }
    const antes = await secretosDe(cuenta.id)
    const secreto = antes.web_webhook_secret || nuevoSecreto()
    await guardarSecretos(cuenta.id, { web_webhook_url: limpia, web_webhook_secret: secreto })
    // El envio automatico arranca desde que se conecta: lo ya redactado no sale
    // de golpe; se publica a mano si se quiere.
    if (!antes.web_webhook_url) {
      await supabaseAdmin()
        .from("generation_config")
        .upsert({ account_id: cuenta.id, web_auto_desde: new Date().toISOString() }, { onConflict: "account_id" })
    }
    refrescar()
    return antes.web_webhook_secret
      ? { ok: true, aviso: "URL guardada. El secreto sigue siendo el mismo." }
      : { ok: true, aviso: "Conectado. Copia el secreto en HANCEL_WEBHOOK_SECRET del portal y pulsa Enviar prueba.", secreto }
  } catch (e) {
    return falla(e)
  }
}

/** El secreto, para volver a copiarlo. Solo un owner. */
export async function mostrarSecretoWeb(): Promise<ResultadoWeb> {
  try {
    const cuenta = await exigirOwner()
    const s = await secretosDe(cuenta.id)
    if (!s.web_webhook_secret) return { ok: false, error: "Aún no hay secreto: guarda primero la URL." }
    return { ok: true, secreto: s.web_webhook_secret }
  } catch (e) {
    return falla(e)
  }
}

/** Un secreto nuevo: el anterior deja de valer al instante. */
export async function rotarSecretoWeb(): Promise<ResultadoWeb> {
  try {
    const cuenta = await exigirOwner()
    const secreto = nuevoSecreto()
    await guardarSecretos(cuenta.id, { web_webhook_secret: secreto })
    refrescar()
    return { ok: true, aviso: "Secreto nuevo. Actualízalo en el portal: los envíos con el anterior fallarán.", secreto }
  } catch (e) {
    return falla(e)
  }
}

export async function desconectarWeb(): Promise<ResultadoWeb> {
  try {
    const cuenta = await exigirOwner()
    await guardarSecretos(cuenta.id, { web_webhook_url: null, web_webhook_secret: null })
    refrescar()
    return { ok: true, aviso: "Portal desconectado. No se envía nada más." }
  } catch (e) {
    return falla(e)
  }
}

export async function probarWeb(): Promise<ResultadoWeb> {
  try {
    const cuenta = await exigirOwner()
    const r = await enviarPrueba(cuenta.id)
    return r.ok ? { ok: true, aviso: r.detalle } : { ok: false, error: r.detalle }
  } catch (e) {
    return falla(e)
  }
}
