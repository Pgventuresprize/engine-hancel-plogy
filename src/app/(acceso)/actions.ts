"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { asegurarEmpresaPropia } from "@/engine/empresas"
import { authClient, usuarioActual } from "@/lib/supabase/auth"
import { origenDeLaPeticion } from "@/lib/supabase/origen"
import { CAPTCHA_FALLO, pasoElCaptcha } from "@/lib/turnstile"

/**
 * Entrar, salir, registrarse y recuperar la contraseña.
 *
 * Todas son acciones de servidor porque el cliente de Supabase vive solo en el
 * servidor (ver `lib/supabase/auth.ts`): el navegador manda el formulario y lo
 * que le vuelve es una cookie de sesion, nunca una clave.
 *
 * Ninguna dice si un correo tiene cuenta o no. Distinguir "no existe" de "la
 * contraseña no es esa" (o "te mandamos el enlace" de "ese correo no esta")
 * le dice a quien prueba correos cuales son validos.
 */

export type LoginResult = { error: string; sinConfirmar?: boolean } | undefined
export type EnvioResult = { error: string } | { ok: string } | undefined

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MINIMO = 8

/** El enlace de los correos: vuelve al mismo origen desde el que se pidio. */
async function volverA(): Promise<string> {
  return `${await origenDeLaPeticion()}/auth/confirm`
}

/** Supabase limita cuantos correos se piden por minuto; el resto de fallos es del envio. */
function falloDeEnvio(error: { status?: number }): string {
  return error.status === 429
    ? "Ya pediste uno hace poco. Espera un minuto antes de pedir otro."
    : "No pudimos mandar el correo. Intenta otra vez en un rato."
}

export async function iniciarSesion(_previo: LoginResult, form: FormData): Promise<LoginResult> {
  const email = String(form.get("email") ?? "").trim()
  const password = String(form.get("password") ?? "")
  const destino = String(form.get("destino") ?? "")

  if (!email || !password) {
    return { error: "Escribe el correo y la contraseña." }
  }

  const supabase = await authClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // El motivo real no se enseña (ver arriba). Los casos que si sirven de
    // algo se traducen.
    if (error.code === "email_not_confirmed") {
      return { error: "Todavía no confirmaste tu correo: abre el enlace que te mandamos.", sinConfirmar: true }
    }
    return {
      error: error.status === 429 ? "Demasiados intentos. Espera un momento." : "Correo o contraseña incorrectos.",
    }
  }

  // El destino solo puede ser una ruta de esta aplicacion: aceptar una URL
  // completa convertiria el login en un redirector abierto hacia cualquier sitio.
  const vuelta = destino.startsWith("/") && !destino.startsWith("//") ? destino : "/"

  revalidatePath("/", "layout")
  redirect(vuelta)
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await authClient()
  await supabase.auth.signOut()

  revalidatePath("/", "layout")
  redirect("/login")
}

/** Vuelve a mandar el correo de confirmacion del registro (desde el login). */
export async function reenviarConfirmacion(_previo: EnvioResult, form: FormData): Promise<EnvioResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase()
  if (!CORREO.test(email)) return { error: "Escribe tu correo." }

  const supabase = await authClient()
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: await volverA() } })
  if (error) return { error: falloDeEnvio(error) }
  return { ok: `Te volvimos a mandar el enlace a ${email}. Revisa también spam.` }
}

/** "¿Olvidaste tu contraseña?": manda el enlace para elegir una nueva. */
export async function pedirRecuperacion(_previo: EnvioResult, form: FormData): Promise<EnvioResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase()
  if (!CORREO.test(email)) return { error: "Ese correo no es válido." }
  if (!(await pasoElCaptcha(form))) return { error: CAPTCHA_FALLO }

  const supabase = await authClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: await volverA() })
  // Para un correo sin cuenta Supabase no da error y no manda nada: la
  // respuesta es la misma en los dos casos.
  if (error) return { error: falloDeEnvio(error) }
  return { ok: `Si hay una cuenta con ${email}, te llegó un enlace para elegir una contraseña nueva. Revisa también spam.` }
}

/**
 * Guarda la contraseña nueva de quien tiene sesion: la que dejo el enlace de
 * recuperar o de la invitacion, o la suya de siempre si la cambia desde el menu.
 */
export async function guardarContrasena(_previo: EnvioResult, form: FormData): Promise<EnvioResult> {
  const password = String(form.get("password") ?? "")
  const repetida = String(form.get("repetida") ?? "")

  if (password.length < MINIMO) return { error: `Tiene que tener al menos ${MINIMO} caracteres.` }
  if (password !== repetida) return { error: "Las dos contraseñas no coinciden." }

  if (!(await usuarioActual())) redirect("/recuperar")

  const supabase = await authClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (error.code === "same_password") return { error: "Esa ya es tu contraseña: elige otra." }
    if (error.code === "weak_password") return { error: "Es demasiado fácil de adivinar: usa una más larga o con más variedad." }
    // Con "Secure password change" activo, Supabase pide haber entrado hace poco.
    if (error.code === "reauthentication_needed") {
      return { error: "Por seguridad, pide un enlace en “¿Olvidaste tu contraseña?” y cámbiala desde ahí." }
    }
    return { error: `No se pudo guardar: ${error.message}` }
  }

  revalidatePath("/", "layout")
  redirect("/")
}

/** Si el registro esta cerrado (`REGISTRO_ABIERTO=no`), solo se entra por invitacion. */
export async function registroAbierto(): Promise<boolean> {
  return (process.env.REGISTRO_ABIERTO ?? "si").trim().toLowerCase() !== "no"
}

/**
 * Crear una cuenta: la persona y su propia empresa en blanco.
 *
 * La empresa no se crea aqui sino al confirmar el correo (`/auth/confirm`):
 * hasta entonces nadie sabe si el correo es de quien lo escribio. Su nombre
 * espera en `user_metadata`.
 */
export async function registrarse(_previo: EnvioResult, form: FormData): Promise<EnvioResult> {
  if (!(await registroAbierto())) return { error: "Por ahora solo se entra por invitación." }

  const empresa = String(form.get("empresa") ?? "").trim()
  const email = String(form.get("email") ?? "").trim().toLowerCase()
  const password = String(form.get("password") ?? "")
  const repetida = String(form.get("repetida") ?? "")

  if (empresa.length < 2) return { error: "Ponle un nombre a tu empresa o marca." }
  if (!CORREO.test(email)) return { error: "Ese correo no es válido." }
  if (password.length < MINIMO) return { error: `La contraseña tiene que tener al menos ${MINIMO} caracteres.` }
  if (password !== repetida) return { error: "Las dos contraseñas no coinciden." }
  if (!(await pasoElCaptcha(form))) return { error: CAPTCHA_FALLO }

  const supabase = await authClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: await volverA(), data: { empresa } },
  })
  if (error) {
    if (error.code === "weak_password") return { error: "Esa contraseña es demasiado fácil de adivinar: usa una más larga o con más variedad." }
    if (error.code === "user_already_exists") return { ok: `Te mandamos un correo a ${email} para confirmar tu cuenta.` }
    return { error: falloDeEnvio(error) }
  }

  // Con "Confirm email" apagado en Supabase, la sesion llega ya: se entra directo.
  if (data.session && data.user) {
    await asegurarEmpresaPropia(data.user.id, empresa)
    revalidatePath("/", "layout")
    redirect("/")
  }

  // Si el correo ya tenia cuenta, Supabase responde igual y no manda nada.
  return { ok: `Te mandamos un correo a ${email} para confirmar tu cuenta. Ábrelo y entras directo a tu empresa.` }
}

/** Desde /bienvenida: la primera empresa de quien entro sin ninguna. */
export async function crearPrimeraEmpresa(_previo: EnvioResult, form: FormData): Promise<EnvioResult> {
  const usuario = await usuarioActual()
  if (!usuario) redirect("/login")

  const nombre = String(form.get("empresa") ?? "").trim()
  if (nombre.length < 2) return { error: "Ponle un nombre a tu empresa o marca." }

  const r = await asegurarEmpresaPropia(usuario.id, nombre)
  if (!r.ok) return { error: r.error }

  revalidatePath("/", "layout")
  redirect("/")
}
