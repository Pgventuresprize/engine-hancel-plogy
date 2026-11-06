/**
 * Recorre /empezar como una persona, con un navegador de verdad: crea un usuario de
 * prueba, entra, elige tipo, sube un archivo, pide rellenar todo, elige tema y llega
 * al brief. Guarda una foto de cada pantalla.
 *
 * Necesita la app corriendo con ONBOARDING_ACTIVO=si y CHAT_SIN_DESPACHO=1:
 *   npx tsx --env-file=.env.local scripts/probar-pantalla.ts <url> <archivo.pdf> [foto] [web]
 *
 * Con web tambien confirma el logo encontrado; con foto la sube en "Tus fotos".
 */
import { randomBytes, randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"

import type { Page } from "puppeteer-core"

import { crearEmpresa } from "../src/engine/empresas"
import { lanzar } from "../src/engine/render/navegador"
import { supabaseAdmin } from "../src/engine/supabase-admin"

const DIR = process.env.PANTALLA_DIR ?? "scripts/.salida/pantalla"
const TIPO_WEB = "negocio local"
const ms = (t: number) => `${((Date.now() - t) / 1000).toFixed(1)} s`

async function foto(p: Page, nombre: string) {
  await p.screenshot({ path: `${DIR}/${nombre}.png` as `${string}.png`, fullPage: true })
  console.log("foto", nombre, "en", p.url())
}

const clicEnTexto = (p: Page, texto: string) =>
  p.evaluate((t) => {
    const el = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t) && !b.disabled)
    if (!el) return false
    el.click()
    return true
  }, texto)

/** Pregunta de a poco: un solo waitForFunction se cae a los 180 s, el limite de puppeteer. */
async function esperarTexto(p: Page, texto: string, plazo: number) {
  const hasta = Date.now() + plazo
  while (Date.now() < hasta) {
    if (await p.evaluate((t) => document.body.innerText.includes(t), texto).catch(() => false)) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No apareció "${texto}" en ${plazo / 1000} s.`)
}

async function main() {
  const [url, pdf, fotoPropia, web] = process.argv.slice(2)
  mkdirSync(DIR, { recursive: true })
  process.env.ONBOARDING_ACTIVO = "si"
  const supabase = supabaseAdmin()
  const email = `prueba-onboarding-${randomUUID().slice(0, 8)}@example.com`
  const clave = randomBytes(18).toString("base64url")
  const { data, error } = await supabase.auth.admin.createUser({ email, password: clave, email_confirm: true })
  if (error || !data.user) throw new Error(error?.message ?? "sin usuario")
  console.log("usuario", data.user.id)
  const empresa = await crearEmpresa("Prueba pantalla", "basic", data.user.id)
  if (!empresa.ok) throw new Error(empresa.error)
  console.log("empresa", empresa.slug)

  const navegador = await lanzar()
  const p = await navegador.newPage()
  await p.setViewport({ width: Number(process.env.PANTALLA_ANCHO ?? 1100), height: 900 })
  const errores: string[] = []
  p.on("pageerror", (e) => errores.push(`pagina: ${e instanceof Error ? e.message : String(e)}`))
  p.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("favicon")) errores.push(`${r.status()} ${r.url().slice(0, 100)}`)
  })

  try {
    await p.goto(`${url}/login`, { waitUntil: "networkidle2", timeout: 120_000 })
    await p.type('input[type="email"]', email)
    await p.type('input[type="password"]', clave)
    await p.click('button[type="submit"]')
    await p.waitForFunction(() => location.pathname === "/empezar", { timeout: 120_000 })
    await esperarTexto(p, "¿Qué estamos creando?", 60_000)
    await foto(p, "1-tipo")

    await clicEnTexto(p, web ? TIPO_WEB : "Mi marca personal")
    await esperarTexto(p, "Trae lo que tengas", 30_000)
    if (!web) await p.type("textarea", "Soy Marta Gil, abogada laboral en Pereira. Asesoro a trabajadores despedidos sin justa causa. Hablo claro porque la ley no debería necesitar traductor.")
    if (web) await p.type('input[inputmode="url"]', web)
    const [archivos, fotos] = await p.$$('input[type="file"]')
    if (pdf !== "-") await archivos.uploadFile(pdf)
    if (fotoPropia) await fotos.uploadFile(fotoPropia)
    await p.click('input[type="checkbox"]')
    await foto(p, "2-traer")
    let t = Date.now()
    await clicEnTexto(p, "Seguir")
    await esperarTexto(p, "Rellenar todo lo que falta", 150_000)
    console.log("fuentes y primer turno:", ms(t))
    await foto(p, "3-conversacion")

    t = Date.now()
    await clicEnTexto(p, "Rellenar todo lo que falta")
    await esperarTexto(p, "Elige tu primer post", 120_000)
    console.log("rellenar todo:", ms(t))
    if (await p.evaluate(() => document.body.innerText.includes("¿Cuál es tu logo?"))) {
      await foto(p, "4-logo")
      await p.evaluate(() => (document.querySelector("button img") as HTMLElement | null)?.closest("button")?.click())
      await p.waitForFunction(() => !document.body.innerText.includes("¿Cuál es tu logo?"), { timeout: 60_000 })
    }
    await foto(p, "4-temas")

    t = Date.now()
    await p.evaluate(() => {
      const tema = [...document.querySelectorAll("button")].find((b) => b.querySelector("span.block"))
      tema?.click()
    })
    await esperarTexto(p, "Ver mi primer post", 280_000)
    console.log("brief y kit:", ms(t))
    await foto(p, "5-brief")
    await clicEnTexto(p, "Ver mi primer post")
    await p.waitForFunction(() => location.search.includes("c="), { timeout: 60_000 })
    await new Promise((r) => setTimeout(r, 4000))
    await foto(p, "6-chat")
  } catch (e) {
    await foto(p, "fallo").catch(() => undefined)
    console.error("FALLÓ:", e instanceof Error ? e.message : e)
    console.log("texto en pantalla:", (await p.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 500))
  } finally {
    console.log("errores:", errores)
    await navegador.close()
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
