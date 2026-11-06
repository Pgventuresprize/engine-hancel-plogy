/**
 * El onboarding en esta maquina, con un solo comando:
 *
 *   npx tsx --env-file=.env.local scripts/probar-local.ts
 *
 * Levanta la app, crea una cuenta de prueba ya confirmada e imprime con que entrar. Tambien
 * atiende el chat: en local no vale el reparto de la base, porque llama a produccion, que
 * corre otro codigo. Solo toca cuentas de prueba. Se apaga con Ctrl+C y las cuentas se
 * borran con scripts/limpiar-pruebas.ts --borrar.
 *
 * Gasta la clave de plataforma de .env.local; con PRUEBA_CLAVE=plogy, el token de Plogy.
 */
import { spawn } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"

import { crearEmpresa } from "../src/engine/empresas"
import { secretosDe } from "../src/engine/secretos"
import { supabaseAdmin } from "../src/engine/supabase-admin"

const PUERTO = process.env.PUERTO ?? "3177"
const URL_APP = `http://localhost:${PUERTO}`
const CADA_MS = 3000
const MINUTOS_POR_CONVERSACION = "20"

process.env.ONBOARDING_ACTIVO = "si"
process.env.CHAT_SIN_DESPACHO = "1"

const supabase = supabaseAdmin()

async function claveDePrueba(): Promise<Record<string, string>> {
  if (process.env.PRUEBA_CLAVE !== "plogy") return {}
  const { data } = await supabase.from("accounts").select("id").eq("slug", "hancel").maybeSingle()
  const token = (await secretosDe((data as { id: string }).id)).claude_oauth_token?.replace(/\s+/g, "")
  if (!token) throw new Error("La cuenta de Plogy no tiene token.")
  return { CLAUDE_PLATAFORMA_KEY: token }
}

async function crearCuenta(): Promise<{ correo: string; clave: string }> {
  const correo = `prueba-onboarding-${randomUUID().slice(0, 8)}@example.com`
  const clave = randomBytes(9).toString("base64url")
  const { data, error } = await supabase.auth.admin.createUser({ email: correo, password: clave, email_confirm: true })
  if (error || !data.user) throw new Error(error?.message ?? "No se pudo crear el usuario.")
  const empresa = await crearEmpresa("Prueba pantalla", "basic", data.user.id)
  if (!empresa.ok) throw new Error(empresa.error)
  return { correo, clave }
}

async function esperarApp() {
  for (let i = 0; i < 120; i++) {
    const lista = await fetch(`${URL_APP}/login`).then((r) => r.ok, () => false)
    if (lista) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error("La app no arrancó en dos minutos.")
}

/** Las conversaciones de las cuentas de prueba que tienen algo por hacer. */
async function conTrabajo(): Promise<string[]> {
  const { data: cuentas } = await supabase.from("accounts").select("id").like("slug", "prueba-%")
  const ids = ((cuentas ?? []) as { id: string }[]).map((c) => c.id)
  if (!ids.length) return []
  const { data } = await supabase.from("chat_trabajos").select("conversacion_id").in("account_id", ids).in("estado", ["espera", "trabajando"])
  return [...new Set(((data ?? []) as { conversacion_id: string }[]).map((t) => t.conversacion_id))]
}

async function main() {
  const env = { ...process.env, ...(await claveDePrueba()) }
  const app = spawn("npx", ["next", "dev", "-p", PUERTO], { shell: true, stdio: ["ignore", "ignore", "inherit"], env })
  app.on("exit", (codigo) => {
    console.error(`La app se cerró (${codigo}). ¿El puerto ${PUERTO} está ocupado? Prueba con PUERTO=3178.`)
    process.exit(1)
  })
  await esperarApp()
  const { correo, clave } = await crearCuenta()
  console.log(`\nListo. Abre ${URL_APP}/login y entra con:\n  correo: ${correo}\n  clave:  ${clave}\n\nDeja esta terminal abierta: aquí se arma el post. Ctrl+C para apagar.\n`)

  const atendidas = new Set<string>()
  for (;;) {
    for (const conversacion of await conTrabajo().catch(() => [])) {
      if (atendidas.has(conversacion)) continue
      atendidas.add(conversacion)
      const pasada = spawn("npx", ["tsx", "--env-file=.env.local", "scripts/pasada-chat.ts", conversacion, MINUTOS_POR_CONVERSACION], { shell: true, stdio: "inherit" })
      pasada.on("exit", () => atendidas.delete(conversacion))
    }
    await new Promise((r) => setTimeout(r, CADA_MS))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
