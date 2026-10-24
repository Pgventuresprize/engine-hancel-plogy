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
  /** En diseño libre: el texto que se lee en la lamina, sin la paginacion. */
  texto?: string
  ms: number
}

export type OpcionesDibujo = {
  ancho: number
  alto: number
  /** Diseño libre: se mide todo texto visible, no los huecos de una plantilla. */
  libre?: { letraMinima: number }
}

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
 * - En la lamina (`data-lamina`): `data-seguro="x1,y1,x2,y2"`, el area segura.
 */
const MEDIR = `(() => {
  const lamina = document.querySelector('[data-lamina]') || document.querySelector('.lamina') || document.body
  const [sx1, sy1, sx2, sy2] = (lamina.dataset.seguro || '0,0,' + innerWidth + ',' + innerHeight).split(',').map(Number)
  const huecos = [...document.querySelectorAll('[data-hueco]')]
  // Un fondo (la foto a sangre, un velo) no es algo con lo que el texto pueda
  // chocar: va encima a proposito. Cuenta como fondo lo que tapa media lamina.
  const zonas = [...document.querySelectorAll('[data-zona]')].filter((z) => {
    const r = z.getBoundingClientRect()
    return r.width * r.height < innerWidth * innerHeight * 0.5
  })
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
  const figuraDe = (el) => el.querySelector(':scope > .fig')
  // La letra que se ve: la de una figura achicada con zoom es su tamano por el zoom.
  const conTexto = (n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
  const letraVista = (n) => {
    const f = n.closest('.fig')
    return parseFloat(getComputedStyle(n).fontSize) * (f && f.style.zoom ? Number(f.style.zoom) : 1)
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
    // Una figura tiene que caber en la caja que le da la plantilla.
    const fig = figuraDe(el)
    if (fig) {
      const f = fig.getBoundingClientRect(), c = el.getBoundingClientRect()
      if (f.bottom > c.bottom + 2 || f.right > c.right + 2)
        out.push({ tipo: 'desborda', detalle: 'la figura no entra en su caja' })
    }
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
  // (de los que lo permiten), y se vuelve a medir todo. Un texto baja su letra
  // de 4 en 4 px; una figura se achica entera (zoom) de 5 en 5 %, hasta que su
  // letra mas pequena llegue al minimo del hueco o al 55 %.
  const encogibles = [
    ...huecos.filter((el) => el.dataset.encoger).map((el) => {
      const [desde, hasta] = el.dataset.encoger.split(':').map(Number)
      el.style.fontSize = desde + 'px'
      return { el, desde, hasta, t: desde, paso: 4, poner: (t) => { el.style.fontSize = t + 'px' } }
    }),
    ...huecos.filter(figuraDe).map((el) => {
      const fig = figuraDe(el)
      const letras = [fig, ...fig.querySelectorAll('*')].filter(conTexto).map((n) => parseFloat(getComputedStyle(n).fontSize))
      const min = Number(el.dataset.min || 0)
      const hasta = Math.ceil(Math.max(55, letras.length && min ? (100 * min) / Math.min(...letras) : 55))
      return { el, desde: 100, hasta: Math.min(100, hasta), t: 100, paso: 5, poner: (t) => { fig.style.zoom = String(t / 100) } }
    }),
  ]
  const hayFallos = () => huecos.some((el) => fallos(el).length)
  for (let vuelta = 0; vuelta < 80 && hayFallos(); vuelta++) {
    const c = encogibles.filter((e) => e.t - e.paso >= e.hasta).sort((a, b) => b.t / b.hasta - a.t / a.hasta)[0]
    if (!c) break
    c.t -= c.paso
    c.poner(c.t)
  }
  const encogidos = {}
  for (const e of encogibles) if (e.t !== e.desde) encogidos[e.el.dataset.hueco] = e.t
  const problemas = []
  for (const el of huecos) {
    for (const f of fallos(el)) problemas.push({ ...f, hueco: el.dataset.hueco })
    const min = Number(el.dataset.min || 0)
    // Solo cuenta la letra de lo que tiene texto propio: un hueco vacio o la
    // caja de una lista no se leen, aunque su tamano de letra sea el de base.
    const letras = [el, ...el.querySelectorAll('*')].filter(conTexto).map(letraVista)
    const menor = letras.length ? Math.min(...letras) : Infinity
    if (min && menor < min - 0.5) problemas.push({ tipo: 'letra_pequena', hueco: el.dataset.hueco, detalle: Math.round(menor) + ' px, el minimo es ' + min })
  }
  return { problemas, encogidos }
})()`

/**
 * Mide una lamina de diseño libre (render/kit-libre.ts), que no marca huecos:
 * cuenta como texto todo elemento visible con texto propio. Comprueba que no se
 * salga del area segura, que no choque con otro texto, que su letra no baje de
 * `minimo` y que no desborde su caja. Lo marcado con data-adorno (una palabra
 * gigante de fondo) no se mide; data-paginacion no cuenta como texto de la pieza.
 * Devuelve tambien el texto que se lee, para compararlo con el guion.
 */
const medirLibre = (minimo: number) => `(() => {
  const lamina = document.querySelector('[data-lamina]') || document.body
  const [sx1, sy1, sx2, sy2] = (lamina.dataset.seguro || '48,48,' + (innerWidth - 48) + ',' + (innerHeight - 48)).split(',').map(Number)
  const visible = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const e = getComputedStyle(n)
      if (e.display === 'none' || e.visibility === 'hidden' || Number(e.opacity) < 0.15) return false
    }
    return true
  }
  const propio = (el) => [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
  const fuera = (el) => el.closest('[data-adorno],[data-paginacion]')
  const textos = [...lamina.querySelectorAll('*')].filter((el) => propio(el) && !fuera(el) && visible(el))
  const zoom = (el) => { let z = 1; for (let n = el; n && n !== document.body; n = n.parentElement) { const v = parseFloat(getComputedStyle(n).zoom); if (v && v !== 1) z *= v } return z }
  const lineas = (el) => {
    const rango = document.createRange()
    const salida = []
    for (const c of el.childNodes) {
      if (c.nodeType !== 3 || !c.textContent.trim()) continue
      rango.selectNodeContents(c)
      const alto = parseFloat(getComputedStyle(el).fontSize) * zoom(el) * 0.9
      for (const r of rango.getClientRects()) {
        if (!(r.width > 0 && r.height > 0)) continue
        const medio = (r.top + r.bottom) / 2, h = Math.min(r.height, alto)
        salida.push({ left: r.left, right: r.right, top: medio - h / 2, bottom: medio + h / 2 })
      }
    }
    return salida
  }
  const chocan = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1
  const nombre = (el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : '')) + ' «' + el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40) + '»'
  const todas = textos.map((el) => ({ el, rs: lineas(el) }))
  const problemas = []
  for (const [i, { el, rs }] of todas.entries()) {
    if (!rs.length) continue
    const caja = { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) }
    if (caja.left < sx1 - 1 || caja.top < sy1 - 1 || caja.right > sx2 + 1 || caja.bottom > sy2 + 1)
      problemas.push({ tipo: 'se_sale', hueco: nombre(el), detalle: 'ocupa ' + Math.round(caja.left) + ',' + Math.round(caja.top) + ' a ' + Math.round(caja.right) + ',' + Math.round(caja.bottom) })
    for (let n = el; n && n !== lamina; n = n.parentElement) {
      const e = getComputedStyle(n)
      if ((e.overflow !== 'visible' || e.overflowY !== 'visible') && n.scrollHeight > n.clientHeight + 2) { problemas.push({ tipo: 'desborda', hueco: nombre(el), detalle: 'el texto no entra en su caja' }); break }
    }
    for (const otro of todas.slice(i + 1)) {
      if (otro.el.contains(el) || el.contains(otro.el)) continue
      if (rs.some((a) => otro.rs.some((b) => chocan(a, b)))) problemas.push({ tipo: 'choca', hueco: nombre(el), detalle: 'con ' + nombre(otro.el) })
    }
    const letra = parseFloat(getComputedStyle(el).fontSize) * zoom(el)
    if (letra < ${minimo} - 0.5) problemas.push({ tipo: 'letra_pequena', hueco: nombre(el), detalle: Math.round(letra) + ' px, el minimo es ${minimo}' })
  }
  const copia = lamina.cloneNode(true)
  for (const n of copia.querySelectorAll('[data-paginacion],style,script')) n.remove()
  document.body.append(copia)
  copia.style.position = 'absolute'; copia.style.left = '-99999px'
  const texto = copia.innerText.replace(/\\s+/g, ' ').trim()
  copia.remove()
  return { problemas, encogidos: {}, texto }
})()`

async function dibujarEn(
  pagina: Page,
  html: string,
  { ancho, alto, libre }: OpcionesDibujo
): Promise<Omit<LaminaDibujada, "ms">> {
  await pagina.setViewport({ width: ancho, height: alto, deviceScaleFactor: 1 })
  await pagina.setContent(html, { waitUntil: "load", timeout: 20_000 })
  await pagina.evaluate("document.fonts.ready.then(() => true)")
  const { problemas, encogidos, texto } = (await pagina.evaluate(libre ? medirLibre(libre.letraMinima) : MEDIR)) as Pick<
    LaminaDibujada,
    "problemas" | "encogidos" | "texto"
  >
  const png = Buffer.from(await pagina.screenshot({ type: "png", clip: { x: 0, y: 0, width: ancho, height: alto } }))
  return { png, problemas, encogidos, ...(texto !== undefined ? { texto } : {}) }
}

/**
 * Dibuja varias laminas en orden, cada una en su pagina. Sin red: lo que no sea
 * data: o about: se corta.
 */
export async function dibujarLaminas(htmls: string[], opciones: OpcionesDibujo): Promise<LaminaDibujada[]> {
  const pagina = await paginaSinRed()
  try {
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

/** Una pagina nueva que solo carga lo que trae dentro (data: y about:). */
async function paginaSinRed(): Promise<Page> {
  const navegador = await abrir()
  const pagina = await navegador.newPage()
  await pagina.setRequestInterception(true)
  pagina.on("request", (peticion) => {
    const url = peticion.url()
    if (url.startsWith("data:") || url.startsWith("about:")) void peticion.continue()
    else void peticion.abort("blockedbyclient")
  })
  return pagina
}

/**
 * Lo que se lee de cada lamina dentro de la pagina: medidas, su foto mas grande
 * y su HTML sin los data URI. Como `new Function` para que llegue al navegador
 * tal cual, sin lo que anada el compilador.
 */
const DATOS_DE_LAMINA = new Function(
  "el",
  `const r = el.getBoundingClientRect()
  const area = r.width * r.height
  let foto = null, mayor = 0
  for (const img of el.querySelectorAll('img')) {
    const b = img.getBoundingClientRect()
    const a = b.width * b.height
    const src = img.currentSrc || img.src
    if (a > mayor && a > area * 0.12 && src.startsWith('data:image/') && !src.startsWith('data:image/svg')) {
      mayor = a
      foto = src
    }
  }
  const html = el.outerHTML
    .replace(/(src|href)="data:[^"]{200,}"/g, '$1="(imagen)"')
    .replace(/url\\(\\s*["']?data:[^)]{200,}\\)/g, 'url((imagen))')
  return { ancho: Math.round(r.width), alto: Math.round(r.height), foto, html }`
) as (el: Element) => { ancho: number; alto: number; foto: string | null; html: string }

/** Una lamina encontrada en una pagina del kit. */
export type LaminaDePagina = {
  jpg: Buffer
  ancho: number
  alto: number
  /** El HTML de la lamina, con las imagenes cambiadas por "(imagen)" para que pese poco. */
  html: string
  /** La imagen mas grande de la lamina (data URI), si ocupa buena parte de ella. */
  foto: string | null
}

/**
 * Las laminas de una pagina del kit (una pieza en HTML), cada una con su foto,
 * su HTML y el CSS de la pagina.
 *
 * No hace falta saber como esta armado el kit: una lamina es cualquier elemento
 * que mide exactamente lo que un formato de redes (1080x1350, 1080x1080...) y no
 * esta dentro de otra. Si la pagina las muestra reducidas (zoom de vista
 * previa), se devuelven a su tamano antes de sacarles la foto.
 *
 * A diferencia de las plantillas, aqui la pagina puede ejecutar su JavaScript
 * (algunos kits arman la vista con el): es el kit de la propia marca y sigue sin
 * red.
 */
export async function laminasDePagina(
  html: string,
  formatos: { ancho: number; alto: number }[],
  max = 40
): Promise<{ laminas: LaminaDePagina[]; css: string }> {
  const pagina = await paginaSinRed()
  try {
    await pagina.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 })
    await pagina.setContent(html, { waitUntil: "load", timeout: 30_000 })
    await pagina.evaluate("document.fonts.ready.then(() => true)")
    const encontradas = (await pagina.evaluate(`(() => {
      const formatos = ${JSON.stringify(formatos)}
      const mide = (el) => {
        const e = getComputedStyle(el)
        if (e.display === 'none' || e.visibility === 'hidden') return false
        const w = parseFloat(e.width), h = parseFloat(e.height)
        return formatos.some((f) => Math.abs(w - f.ancho) <= 1 && Math.abs(h - f.alto) <= 1)
      }
      const todas = [...document.body.querySelectorAll('*')].filter(mide)
      const sueltas = todas.filter((el) => !todas.some((otra) => otra !== el && otra.contains(el))).slice(0, ${max})
      // Sin zoom ni transformaciones de vista previa, una debajo de otra.
      const estilo = document.createElement('style')
      estilo.textContent = '[data-kit-lamina]{zoom:1 !important;transform:none !important;display:block}'
      document.head.appendChild(estilo)
      document.body.style.zoom = '1'
      sueltas.forEach((el, i) => el.setAttribute('data-kit-lamina', String(i)))
      const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\\n')
        .replace(/url\\(\\s*["']?data:[^)]{200,}\\)/g, 'url((archivo))')
      return { n: sueltas.length, css }
    })()`)) as { n: number; css: string }

    const laminas: LaminaDePagina[] = []
    for (let i = 0; i < encontradas.n; i++) {
      const el = await pagina.$(`[data-kit-lamina="${i}"]`)
      if (!el) continue
      const datos = (await el.evaluate(DATOS_DE_LAMINA)) as {
        ancho: number
        alto: number
        foto: string | null
        html: string
      }
      const jpg = Buffer.from(await el.screenshot({ type: "jpeg", quality: 88 }))
      laminas.push({ jpg, ...datos })
    }
    return { laminas, css: encontradas.css }
  } finally {
    await pagina.close().catch(() => undefined)
  }
}

/** Una pagina cualquiera (HTML completo) a imagen, del tamano dado. Para las hojas de contacto. */
export async function capturar(
  html: string,
  ancho: number,
  alto: number,
  tipo: "jpeg" | "png" = "jpeg"
): Promise<Buffer> {
  const pagina = await paginaSinRed()
  try {
    await pagina.setViewport({ width: ancho, height: alto, deviceScaleFactor: 1 })
    await pagina.setContent(html, { waitUntil: "load", timeout: 30_000 })
    await pagina.evaluate("document.fonts.ready.then(() => true)")
    return Buffer.from(
      await pagina.screenshot({
        type: tipo,
        ...(tipo === "jpeg" ? { quality: 85 } : {}),
        clip: { x: 0, y: 0, width: ancho, height: alto },
      })
    )
  } finally {
    await pagina.close().catch(() => undefined)
  }
}
