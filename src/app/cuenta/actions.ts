"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import { COOKIE_CUENTA, cuentasDelUsuario } from "@/lib/accounts"

/**
 * Cambia la cuenta activa.
 *
 * Solo escribe la cookie si el usuario pertenece a esa cuenta. La comprobacion
 * es aqui y no en el cliente porque la cookie la escribe el navegador: sin esto,
 * cambiarla a mano seria la forma mas facil de leer los datos de otro.
 */
export async function cambiarCuenta(slug: string): Promise<void> {
  const cuentas = await cuentasDelUsuario()
  if (!cuentas.some((cuenta) => cuenta.slug === slug)) return

  const store = await cookies()
  store.set(COOKIE_CUENTA, slug, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  })

  // Todo el dashboard cuelga de la cuenta, asi que se invalida entero.
  revalidatePath("/", "layout")
}

/**
 * El token de Claude de la empresa abierta: el que corre sus pasos de IA.
 *
 * Cada empresa tiene el suyo (en `account_secrets`); lo que gasta una no sale
 * de la cuenta de otra. La interfaz nunca recibe el valor entero de vuelta
 * —solo una vista enmascarada—, porque es un secreto.
 */
export type EstadoTokenClaude = {
  configurado: boolean
  /** Algo como `sk-ant-oat01…fQAA`, para reconocerlo sin exponerlo. */
  vistaPrevia: string | null
  actualizado: string | null
}

async function cuenta() {
  const { idDeCuentaActual } = await import("@/lib/accounts")
  return idDeCuentaActual()
}

export async function estadoTokenClaude(): Promise<EstadoTokenClaude> {
  const { secretosDe } = await import("@/engine/secretos")
  const s = await secretosDe(await cuenta())
  const valor = s.claude_oauth_token
  if (!valor) return { configurado: false, vistaPrevia: null, actualizado: null }
  const vista = valor.length > 16 ? `${valor.slice(0, 14)}…${valor.slice(-4)}` : "••••"
  return { configurado: true, vistaPrevia: vista, actualizado: s.claude_token_updated_at }
}

export async function guardarTokenClaude(
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Sin ningun espacio ni salto de linea: al copiar el token de la terminal,
  // esta le parte la linea larga y se cuelan en medio.
  const limpio = token.replace(/\s+/g, "")
  const { guardarSecretos } = await import("@/engine/secretos")
  try {
    // Vacio = desconectar. Util para quitar un token revocado a proposito.
    if (limpio.length === 0) {
      await guardarSecretos(await cuenta(), { claude_oauth_token: null, claude_token_updated_at: null })
      revalidatePath("/", "layout")
      return { ok: true }
    }
    // Se acepta el token de suscripcion (setup-token) y la API key de consola.
    if (!/^sk-ant-(oat01|api03)/.test(limpio)) {
      return {
        ok: false,
        error: "El token debe empezar por sk-ant-oat01 (el de `claude setup-token`) o sk-ant-api03.",
      }
    }
    await guardarSecretos(await cuenta(), { claude_oauth_token: limpio, claude_token_updated_at: new Date().toISOString() })
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Hace una llamada real y minima para ver si el token funciona de verdad. */
export async function probarConexionClaude(): Promise<
  { ok: true; modelo: string } | { ok: false; error: string }
> {
  const { llamarClaude } = await import("@/engine/claude/messages")
  const modelo = "claude-haiku-4-5-20251001"
  const r = await llamarClaude({
    accountId: await cuenta(),
    model: modelo,
    system: "Responde de la forma mas breve posible.",
    prompt: "Responde solo con la palabra: ok",
    maxTokens: 16,
  })
  return r.ok ? { ok: true, modelo } : { ok: false, error: r.error }
}

/** Cambia el modelo de un paso de IA (analisis, angulo, LinkedIn, Instagram) de la empresa. */
export async function guardarModeloIA(
  paso: import("@/lib/modelos-ia").PasoIA,
  modelo: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { guardarModelo } = await import("@/engine/claude/modelos")
    await guardarModelo(await cuenta(), paso, modelo)
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ------------------------------------------------------------------- serper

/**
 * La clave de Serper de la empresa abierta, la que paga sus busquedas de
 * noticias. Cada empresa tiene la suya: no hay clave compartida ni de respaldo
 * en el entorno. Se guarda entera y se devuelve enmascarada.
 */
export type EstadoSerper = {
  configurado: boolean
  vistaPrevia: string | null
  /** Se conserva por compatibilidad con la interfaz: ya no hay clave de entorno. */
  soloEnEntorno: boolean
}

export async function estadoSerper(): Promise<EstadoSerper> {
  const { secretosDe } = await import("@/engine/secretos")
  const valor = (await secretosDe(await cuenta())).serper_api_key?.trim()
  if (!valor) return { configurado: false, vistaPrevia: null, soloEnEntorno: false }
  return {
    configurado: true,
    vistaPrevia: valor.length > 10 ? `${valor.slice(0, 6)}…${valor.slice(-4)}` : "••••",
    soloEnEntorno: false,
  }
}

export async function guardarClaveSerper(
  clave: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const limpio = clave.trim()
  // Vacio = quitar la clave de esta empresa.
  if (limpio.length > 0 && limpio.length < 20) {
    return { ok: false, error: "Esa clave es demasiado corta para ser de Serper." }
  }
  try {
    const { guardarSecretos } = await import("@/engine/secretos")
    await guardarSecretos(await cuenta(), { serper_api_key: limpio || null })
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
