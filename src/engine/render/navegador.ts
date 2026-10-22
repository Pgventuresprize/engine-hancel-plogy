import { existsSync } from "node:fs"
import type { Browser, Page } from "puppeteer-core"

/**
 * Dibuja laminas con un navegador de verdad (Chromium sin ventana).
 *
 * Cada lamina es una pagina HTML completa: se abre, se mide y se le saca una
 * foto. A diferencia de Satori, entiende todo el CSS (desenfoque, mezclas,
 * balanceo de lineas) y deja medir lo que ocupa cada texto, que es lo que hace
 * falta para dibujar con el kit de cualquier marca sin traducirlo a mano.
 *
 * La pagina se abre sin red: solo carga lo que trae dentro (fuentes, logos y
 * fotos como data URI). Cualquier otra peticion se corta, asi una plantilla no
 * puede pedir nada a internet ni filtrar nada.
 *
 * En Vercel usa el Chromium de @sparticuz/chromium; en local, el Chrome o el
 * Edge del equipo (o el que diga CHROME_PATH).
 */

const RUTAS_LOCALES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
]

const enServidor = () =>
  process.platform === "linux" && Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

async function lanzar(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default
  if (enServidor()) {
    const chromium = (await import("@sparticuz/chromium")).default
    chromium.setGraphicsMode = false
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      executablePath: await chromium.executablePath(),
      headless: "shell",
    })
  }
  const ruta = process.env.CHROME_PATH || RUTAS_LOCALES.find((r) => existsSync(r))
  if (!ruta) throw new Error("No hay Chrome ni Edge en este equipo. Pon la ruta en CHROME_PATH.")
  return puppeteer.launch({ executablePath: ruta, headless: true, args: ["--font-render-hinting=none"] })
}

/** Un solo navegador por instancia: arrancarlo es lo caro. */
let navegador: Promise<Browser> | null = null

function abrir(): Promise<Browser> {
  if (!navegador) {
    navegador = lanzar().then((b) => {
      b.on("disconnected", () => {
        navegador = null
      })
      return b
    })
    navegador.catch(() => {
      navegador = null
    })
  }
  return navegador
}

export async function cerrarNavegador(): Promise<void> {
  const b = navegador
  navegador = null
  if (b) await (await b).close().catch(() => undefined)
}

/** Lo que el navegador encontro mal en una lamina. */
export type Problema = {
  tipo: "se_sale" | "choca" | "letra_pequena" | "desborda"
  hueco: string
  detalle: string
}

export type LaminaDibujada = {
  png: Buffer
  problemas: Problema[]
  /** Tamano de letra final de los huecos que se encogieron para caber. */
  encogidos: Record<string, number>
  ms: number
}

export type OpcionesDibujo = { ancho: number; alto: number }

/**
 * Mide y ajusta la lamina dentro de la pagina. Se pasa como texto para que no
 * dependa de como compile Next esta funcion.
 *
 * Convenciones de la plantilla:
 * - `data-hueco="titulo"`: un texto que viene de la pieza. Se comprueba que no
 *   se salga del area segura, que no choque con otro hueco ni con una zona, y que
 *   su letra no baje del minimo.
 * - `data-zona="logo"`: algo fijo de la plantilla con lo que un texto no puede chocar.
 * - `data-encoger="132:96"`: si el hueco no cabe, se baja la letra de 132 a 96 px
 *   de 4 en 4 hasta que quepa.
 * - `data-min="34"`: la letra mas pequena permitida en ese hueco.
 * - En la lamina (`.lamina`): `data-seguro="x1,y1,x2,y2"`, el area segura.
 */
const MEDIR = `(() => {
  const lamina = document.querySelector('.lamina')
  const [sx1, sy1, sx2, sy2] = (lamina.dataset.seguro || '0,0,' + innerWidth + ',' + innerHeight).split(',').map(Number)
  const huecos = [...document.querySelectorAll('[data-hueco]')]
  const zonas = [...document.querySelectorAll('[data-zona]')]
  // Un hueco se mide por las lineas de su texto, no por su caja: un parrafo
  // ocupa todo el ancho aunque su texto sea corto.
  const lineas = (el) => {
    const rango = document.createRange()
    rango.selectNodeContents(el)
    // Cada rectangulo se recorta a lo que ocupa la letra (unas 0,9 veces su
    // tamano): la caja que da el navegador incluye el aire de ascendentes y del
    // interlineado, se pisa con la de la linea vecina cuando el interlineado es
    // apretado, y eso no es un choque.
    const estilo = getComputedStyle(el)
    const alto = Math.min(parseFloat(estilo.lineHeight) || Infinity, parseFloat(estilo.fontSize) * 0.9)
    return [...rango.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => {
      if (!(alto < r.height)) return r
      const medio = (r.top + r.bottom) / 2
      return { left: r.left, right: r.right, top: medio - alto / 2, bottom: medio + alto / 2, width: r.width, height: alto }
    })
  }
  const chocan = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1
  // Una zona redonda (border-radius del 50 %) se mide como circulo.
  const tocaZona = (r, el) => {
    const z = el.getBoundingClientRect()
    if (!chocan(r, z)) return false
    if (!/^50%|9999/.test(getComputedStyle(el).borderTopLeftRadius) && el.dataset.forma !== 'circulo') return true
    const cx = (z.left + z.right) / 2, cy = (z.top + z.bottom) / 2, radio = z.width / 2
    const x = Math.max(r.left, Math.min(cx, r.right)), y = Math.max(r.top, Math.min(cy, r.bottom))
    return (x - cx) ** 2 + (y - cy) ** 2 < radio * radio
  }
  const fallos = (el) => {
    const rs = lineas(el)
    if (!rs.length) return []
    const out = []
    const caja = {
      left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)),
      right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)),
    }
    if (caja.left < sx1 - 1 || caja.top < sy1 - 1 || caja.right > sx2 + 1 || caja.bottom > sy2 + 1)
      out.push({ tipo: 'se_sale', detalle: 'ocupa ' + Math.round(caja.left) + ',' + Math.round(caja.top) + ' a ' + Math.round(caja.right) + ',' + Math.round(caja.bottom) })
    if (el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow !== 'visible')
      out.push({ tipo: 'desborda', detalle: 'el texto no entra en su caja' })
    for (const otro of huecos) {
      if (otro === el || otro.contains(el) || el.contains(otro)) continue
      const suyas = lineas(otro)
      if (rs.some((a) => suyas.some((b) => chocan(a, b)))) out.push({ tipo: 'choca', detalle: 'con ' + otro.dataset.hueco })
    }
    for (const zona of zonas) {
      if (zona.contains(el)) continue
      if (rs.some((r) => tocaZona(r, zona))) out.push({ tipo: 'choca', detalle: 'con ' + zona.dataset.zona })
    }
    return out
  }
  // Mientras algo no quepa, se encoge un paso el hueco que mas margen tenga
  // (de los que lo permiten), y se vuelve a medir todo.
  const encogibles = huecos.filter((el) => el.dataset.encoger).map((el) => {
    const [desde, hasta] = el.dataset.encoger.split(':').map(Number)
    el.style.fontSize = desde + 'px'
    return { el, desde, hasta, t: desde }
  })
  const hayFallos = () => huecos.some((el) => fallos(el).length)
  for (let vuelta = 0; vuelta < 60 && hayFallos(); vuelta++) {
    const c = encogibles.filter((e) => e.t - 4 >= e.hasta).sort((a, b) => b.t / b.hasta - a.t / a.hasta)[0]
    if (!c) break
    c.t -= 4
    c.el.style.fontSize = c.t + 'px'
  }
  const encogidos = {}
  for (const e of encogibles) if (e.t !== e.desde) encogidos[e.el.dataset.hueco] = e.t
  const problemas = []
  for (const el of huecos) {
    for (const f of fallos(el)) problemas.push({ ...f, hueco: el.dataset.hueco })
    const min = Number(el.dataset.min || 0)
    const letras = [el, ...el.querySelectorAll('*')].map((n) => parseFloat(getComputedStyle(n).fontSize))
    const menor = Math.min(...letras)
    if (min && menor < min - 0.5) problemas.push({ tipo: 'letra_pequena', hueco: el.dataset.hueco, detalle: Math.round(menor) + ' px, el minimo es ' + min })
  }
  return { problemas, encogidos }
})()`

async function dibujarEn(
  pagina: Page,
  html: string,
  { ancho, alto }: OpcionesDibujo
): Promise<Omit<LaminaDibujada, "ms">> {
  await pagina.setViewport({ width: ancho, height: alto, deviceScaleFactor: 1 })
  await pagina.setContent(html, { waitUntil: "load", timeout: 20_000 })
  await pagina.evaluate("document.fonts.ready.then(() => true)")
  const { problemas, encogidos } = (await pagina.evaluate(MEDIR)) as Pick<LaminaDibujada, "problemas" | "encogidos">
  const png = Buffer.from(await pagina.screenshot({ type: "png", clip: { x: 0, y: 0, width: ancho, height: alto } }))
  return { png, problemas, encogidos }
}

/**
 * Dibuja varias laminas en orden, cada una en su pagina. Sin red: lo que no sea
 * data: o about: se corta.
 */
export async function dibujarLaminas(htmls: string[], opciones: OpcionesDibujo): Promise<LaminaDibujada[]> {
  const navegador = await abrir()
  const pagina = await navegador.newPage()
  try {
    await pagina.setRequestInterception(true)
    pagina.on("request", (peticion) => {
      const url = peticion.url()
      if (url.startsWith("data:") || url.startsWith("about:")) void peticion.continue()
      else void peticion.abort("blockedbyclient")
    })
    const salida: LaminaDibujada[] = []
    for (const html of htmls) {
      const inicio = Date.now()
      salida.push({ ...(await dibujarEn(pagina, html, opciones)), ms: Date.now() - inicio })
    }
    return salida
  } finally {
    await pagina.close().catch(() => undefined)
  }
}
