import type { Browser, HTTPRequest, HTTPResponse, Page } from "puppeteer-core"

import { lanzar } from "../render/navegador"
import { direccionPrivada, segura } from "./leer"

/**
 * Abrir la web de una marca como la ve una persona: con su JavaScript, sus fuentes y
 * sus colores reales. De ahi sale lo que `leer.ts` no puede ver.
 *
 * Es el unico navegador con red, y por eso va aparte del que dibuja laminas, que
 * sigue sin ella a proposito. La direccion la escribe cualquiera y la abre nuestro
 * servidor: cada peticion de la pagina (tambien cada redireccion) pasa por el mismo
 * filtro de direcciones privadas, y un documento que resulte servido desde una
 * direccion interna se descarta. Lo que se lee es material, nunca instrucciones.
 */

const VISTA = { width: 1280, height: 800, deviceScaleFactor: 1 }
const MAX_PAGINAS = 5
const MAX_POR_PAGINA = 8_000
const MAX_PETICIONES = 250
const PLAZO_PAGINA_MS = 18_000
const PLAZO_TOTAL_MS = 60_000
const TIPOS_FUERA = new Set(["media", "websocket", "eventsource", "manifest", "ping", "cspviolationreport", "prefetch"])

const PAGINAS_UTILES = /(nosotros|quienes|quien-soy|sobre|about|historia|servicio|producto|solucion|equipo|team|contact|bio|manifiesto)/i

export type ColorMedido = { hex: string; peso: number; de: "fondo" | "texto" | "borde" }
export type PaginaLeida = { url: string; titulo: string | null; descripcion: string | null; texto: string }

export type CapturaWeb = {
  paginas: PaginaLeida[]
  /** Por area real en pantalla, de mas a menos. El peso es el porcentaje del total. */
  colores: ColorMedido[]
  fuentes: { titulos: string | null; texto: string | null }
  /** Candidatos a logo, del mas probable al menos. Siempre lo confirma la persona. */
  logos: string[]
  imagenes: { url: string; alt: string | null }[]
  /** Fotos de la home en JPEG, para mirarlas. */
  capturas: Buffer[]
}

type Medida = {
  url: string
  titulo: string | null
  descripcion: string | null
  texto: string
  colores?: { css: string; peso: number; de: ColorMedido["de"] }[]
  fuentes?: { titulos: string | null; texto: string | null; uso: { familia: string; area: number; grande: number }[] }
  logos?: (string | null)[]
  imagenes: { url: string; alt: string | null; ancho: number; alto: number; area: number }[]
  enlaces: { href: string; menu: boolean }[]
}

/** Cierra banners de cookies: primero rechaza, y si no hay boton quita el overlay. */
const CERRAR_COOKIES = `(() => {
  const RECHAZO = /^(rechazar( todo| todas)?|solo (las )?necesarias|necesarias|continuar sin aceptar|reject( all)?|decline|deny|only necessary|essential only)/i
  for (const el of document.querySelectorAll("button, a, [role='button']")) {
    const t = (el.textContent || "").replace(/\\s+/g, " ").trim()
    const r = el.getBoundingClientRect()
    if (t && t.length <= 40 && RECHAZO.test(t) && r.width > 0 && r.height > 0) { el.click(); break }
  }
  const MOLESTA = /cookie|consent|gdpr|onetrust|didomi|cookiebot|usercentrics/i
  for (const el of [...document.querySelectorAll("body *")]) {
    if (!MOLESTA.test(el.id + " " + (el.getAttribute("class") || ""))) continue
    const e = getComputedStyle(el)
    if (e.position === "fixed" || e.position === "sticky" || Number(e.zIndex) >= 100) el.remove()
  }
  document.documentElement.style.overflow = ""
  if (document.body) document.body.style.overflow = ""
})()`

/** Baja por tramos para que carguen las imagenes diferidas y vuelve arriba. */
const BAJAR = `(async () => {
  const max = Math.min(document.body ? document.body.scrollHeight : 0, 14000)
  for (let y = 0; y < max; y += 800) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 90))
  }
  window.scrollTo(0, 0)
  return document.body ? document.body.scrollHeight : 0
})()`

/**
 * Lo que se mide dentro de la pagina. Con `medir` (la home): colores por area,
 * fuentes por uso real y candidatos a logo. Texto, imagenes y enlaces, siempre.
 */
const leerPagina = (medir: boolean) => `(() => {
  const FUERA = /cookie|consent|gdpr|mini-?cart|cart-drawer/i
  const FUERA_SI_FIJO = /popup|newsletter|subscribe|suscri|age-?gate/i
  const estorba = (el) => {
    for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      const firma = n.id + " " + (n.getAttribute("class") || "")
      if (FUERA.test(firma)) return true
      if (FUERA_SI_FIJO.test(firma) && getComputedStyle(n).position === "fixed") return true
    }
    return false
  }
  const limpio = (s) => String(s || "").replace(/\\s+/g, " ").trim()
  const abs = (u) => { try { return new URL(u, location.href).href } catch { return null } }
  const familia = (f) => String(f || "").split(",")[0].trim().replace(/^["']|["']$/g, "").replace(/^__(.+?)(_Fallback)?_[0-9a-f]{5,8}$/i, "$1").replace(/_/g, " ")

  const leerTexto = () => {
    if (!document.body) return ""
    const BLOQUE = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DIV|DT|FIGCAPTION|FOOTER|H[1-6]|HEADER|LI|MAIN|NAV|P|PRE|SECTION|TD|TH|TR|BUTTON|A|LABEL)$/
    const lineas = []
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => {
      const p = n.parentElement
      if (!p || p.closest("script,style,noscript,svg,template,[aria-hidden=true]") || estorba(p)) return NodeFilter.FILTER_REJECT
      return n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    } })
    let actual = "", bloque = null
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      let b = n.parentElement
      while (b && b !== document.body && !BLOQUE.test(b.tagName)) b = b.parentElement
      if (b !== bloque) { const t = limpio(actual); if (t && t !== lineas[lineas.length - 1]) lineas.push(t); actual = ""; bloque = b }
      actual += " " + n.textContent
    }
    const t = limpio(actual)
    if (t && t !== lineas[lineas.length - 1]) lineas.push(t)
    const vistas = new Map()
    for (const l of lineas) vistas.set(l, (vistas.get(l) || 0) + 1)
    const dichas = new Set()
    return lineas.filter((l) => { if (l.length < 40 || vistas.get(l) < 3) return true; if (dichas.has(l)) return false; dichas.add(l); return true }).join("\\n").slice(0, 30000)
  }

  const salida = {
    url: location.href,
    titulo: document.title || null,
    descripcion: document.querySelector('meta[name="description"]')?.content || null,
    texto: leerTexto(),
  }

  if (${medir}) {
    const lienzo = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
    const aRgba = (css) => {
      if (!css || /^rgba?\\(/.test(css) || !lienzo) return css
      lienzo.clearRect(0, 0, 1, 1); lienzo.fillStyle = "#010203"; lienzo.fillStyle = css
      if (lienzo.fillStyle === "#010203") return null
      lienzo.fillRect(0, 0, 1, 1)
      const d = lienzo.getImageData(0, 0, 1, 1).data
      return "rgba(" + d[0] + ", " + d[1] + ", " + d[2] + ", " + d[3] / 255 + ")"
    }
    const pesos = new Map()
    const sumar = (crudo, peso, de) => {
      const css = aRgba(crudo)
      if (!css || peso <= 0) return
      const clave = css + "|" + de
      pesos.set(clave, (pesos.get(clave) || 0) + peso)
    }
    const fuentes = new Map()
    for (const el of [...document.querySelectorAll("body *")].slice(0, 6000)) {
      const r = el.getBoundingClientRect()
      const area = r.width * r.height
      if (area < 16) continue
      const e = getComputedStyle(el)
      if (e.display === "none" || e.visibility === "hidden" || Number(e.opacity) === 0 || estorba(el)) continue
      sumar(e.backgroundColor, area, "fondo")
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
        sumar(e.color, area, "texto")
        const f = familia(e.fontFamily)
        if (f) {
          const u = fuentes.get(f) || { area: 0, grande: 0 }
          u.area += area
          if (parseFloat(e.fontSize) >= 28) u.grande += area
          fuentes.set(f, u)
        }
      }
      if (parseFloat(e.borderTopWidth) > 0) sumar(e.borderTopColor, area * 0.1, "borde")
    }
    salida.colores = [...pesos].map(([clave, peso]) => { const [css, de] = clave.split("|"); return { css, peso, de } })
    const fuenteDe = (sel) => { const el = document.querySelector(sel); return el ? familia(getComputedStyle(el).fontFamily) : null }
    salida.fuentes = {
      titulos: fuenteDe("h1") || fuenteDe("h2"),
      texto: fuenteDe("p") || fuenteDe("body"),
      uso: [...fuentes].map(([f, u]) => ({ familia: f, area: Math.round(u.area), grande: Math.round(u.grande) })),
    }
    const LOGO = /(^|[\\/_.\\s-])logos?([\\/_.\\s-]|$)|\\blogo/i
    const pareceLogo = (i) => LOGO.test([i.getAttribute("src") || "", i.alt, i.getAttribute("class") || "", i.id, i.parentElement?.getAttribute("class") || ""].join(" "))
    const cabecera = [...document.querySelectorAll("header img, [role=banner] img, nav img")]
    const vaAlInicio = (el) => {
      const a = el.closest("a[href]")
      if (!a) return false
      try { const u = new URL(a.getAttribute("href"), location.href); return u.origin === location.origin && /^\\/([a-z]{2}(-[a-z]{2})?\\/?)?$/i.test(u.pathname) } catch { return false }
    }
    // Muchas webs dibujan el logo como SVG en linea: se serializa con su color real.
    const svgALogo = (s) => {
      const copia = s.cloneNode(true)
      copia.setAttribute("xmlns", "http://www.w3.org/2000/svg")
      copia.style.color = getComputedStyle(s).color
      const xml = new XMLSerializer().serializeToString(copia)
      return xml.length < 60000 ? "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml))) : null
    }
    const svgs = [...document.querySelectorAll("header svg, [role=banner] svg, nav svg")].filter((s) => vaAlInicio(s) && s.getBoundingClientRect().width >= 40)
    const iconos = [...document.querySelectorAll('link[rel="apple-touch-icon"], link[rel~="icon" i]')].map((l) => l.href).filter((u) => !/\\.ico(\\?|$)/i.test(u))
    const fuente = (i) => i.currentSrc || i.src
    const enCabecera = [...cabecera.filter(pareceLogo).map(fuente), ...svgs.map(svgALogo), ...cabecera.filter(vaAlInicio).map(fuente)]
    // Fuera de la cabecera suelen ser logos de clientes: solo cuentan si no hay otro.
    const sueltos = enCabecera.length ? [] : [...document.querySelectorAll("img")].filter((i) => vaAlInicio(i) || pareceLogo(i)).slice(0, 2).map(fuente)
    salida.logos = [...enCabecera, ...sueltos, ...iconos]
  }

  // Las fotos: <img> con su mejor version y tambien fondos CSS, donde muchas webs ponen
  // las mejores. Lo que mas ocupa en pantalla va primero.
  const NO_ES_FOTO = /logo|icon|sprite|favicon|avatar|flag|bandera|\\.svg|\\.gif/i
  const mayor = (srcset) => {
    let mejor = null, n = 0
    for (const c of String(srcset || "").split(",")) {
      const [u, d] = c.trim().split(/\\s+/)
      const v = d ? parseFloat(d) * (/x$/i.test(d) ? 1000 : 1) : 0
      if (u && v >= n) { mejor = u; n = v }
    }
    return mejor
  }
  const imagenes = new Map()
  const anotarFoto = (u, alt, ancho, alto, area) => {
    const url = u && abs(u)
    if (!url || !/^https?:/.test(url) || NO_ES_FOTO.test(url)) return
    const previa = imagenes.get(url)
    if (!previa || previa.area < area) imagenes.set(url, { url, alt: alt || previa?.alt || null, ancho, alto, area })
  }
  for (const i of document.querySelectorAll("img")) {
    if (estorba(i)) continue
    const r = i.getBoundingClientRect()
    anotarFoto(mayor(i.getAttribute("srcset")) || i.currentSrc || i.src || i.getAttribute("data-src"), limpio(i.alt), i.naturalWidth || 1000, i.naturalHeight || 1000, r.width * r.height)
  }
  for (const el of [...document.querySelectorAll("body *")].slice(0, 5000)) {
    const r = el.getBoundingClientRect()
    if (r.width < 300 || r.height < 200) continue
    const fondo = getComputedStyle(el).backgroundImage
    if (!fondo || !fondo.includes("url(") || estorba(el)) continue
    for (const m of fondo.matchAll(/url\\(["']?([^"')]+)["']?\\)/g)) anotarFoto(m[1], null, Math.round(r.width), Math.round(r.height), r.width * r.height)
  }
  const portada = document.querySelector('meta[property="og:image"]')?.content
  if (portada) anotarFoto(portada, null, 1200, 630, 1)
  salida.imagenes = [...imagenes.values()].sort((a, b) => b.area - a.area).slice(0, 120)

  const enlaces = new Map()
  const anotar = (a, menu) => {
    const u = abs(a.getAttribute("href") || "")
    if (!u) return
    const x = new URL(u)
    if (x.hostname !== location.hostname || !/^https?:$/.test(x.protocol)) return
    const href = x.origin + x.pathname
    if (href !== location.origin + location.pathname && !enlaces.has(href)) enlaces.set(href, { href, menu })
  }
  for (const a of document.querySelectorAll("header a[href], nav a[href]")) anotar(a, true)
  for (const a of document.querySelectorAll("a[href]")) anotar(a, false)
  salida.enlaces = [...enlaces.values()].slice(0, 200)
  return salida
})()`

/** Corta lo que no hace falta y lo que no sea publico. Una decision por host. */
function filtrar(pagina: Page, cuenta: { n: number }): void {
  const decisiones = new Map<string, Promise<boolean>>()
  const decidir = async (peticion: HTTPRequest): Promise<boolean> => {
    if (TIPOS_FUERA.has(peticion.resourceType()) || ++cuenta.n > MAX_PETICIONES) return false
    const direccion = peticion.url()
    if (direccion.startsWith("data:") || direccion.startsWith("blob:")) return true
    let url: URL
    try {
      url = new URL(direccion)
    } catch {
      return false
    }
    const host = url.protocol + url.host
    if (!decisiones.has(host)) decisiones.set(host, segura(url))
    return (await decisiones.get(host)) === true
  }
  pagina.on("request", (peticion) => {
    decidir(peticion).then(
      (pasa) => void (pasa ? peticion.continue() : peticion.abort("blockedbyclient")).catch(() => undefined),
      () => void peticion.abort("blockedbyclient").catch(() => undefined)
    )
  })
}

type Abierta = { pagina: Page; fallo?: undefined } | { fallo: string; pagina?: undefined }

/** Abre una direccion. Devuelve la pagina lista para leer o por que no se debe leer. */
async function abrir(navegador: Browser, direccion: string): Promise<Abierta> {
  const pagina = await navegador.newPage()
  const cerrar = () => pagina.close().catch(() => undefined)
  await pagina.setRequestInterception(true)
  await pagina.setViewport(VISTA)
  await pagina.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 PlogyStudio/1.0"
  )
  filtrar(pagina, { n: 0 })
  let principal: HTTPResponse | null = null
  pagina.on("response", (r) => {
    if (r.request().isNavigationRequest() && r.frame() === pagina.mainFrame()) principal = r
  })
  try {
    await pagina.goto(direccion, { waitUntil: "domcontentloaded", timeout: PLAZO_PAGINA_MS }).catch(async (e) => {
      // Una web pesada puede agotar el plazo con la pagina ya en pantalla: se lee lo que hay.
      const conTexto = await pagina.evaluate("(document.body && document.body.innerText || '').trim().length > 200").catch(() => false)
      if (!conTexto) throw e
    })
    const respuesta = principal as HTTPResponse | null
    if (!respuesta) throw new Error("sin respuesta")
    if (!respuesta.ok()) {
      await cerrar()
      return { fallo: `la página respondió ${respuesta.status()}` }
    }
    // El filtro mira el DNS antes de abrir; aqui se comprueba adonde se conecto de verdad.
    const ip = respuesta.remoteAddress().ip
    if (ip && direccionPrivada(ip)) {
      await cerrar()
      return { fallo: "no se puede leer esa dirección" }
    }
    await pagina.waitForNetworkIdle({ idleTime: 500, timeout: 5_000 }).catch(() => undefined)
    await pagina.evaluate(CERRAR_COOKIES).catch(() => undefined)
    return { pagina }
  } catch (e) {
    console.error("[onboarding] No abrió", direccion, e instanceof Error ? e.message : e)
    await cerrar()
    return { fallo: "la página no abrió" }
  }
}

function aHex(css: string): { hex: string; alfa: number } | null {
  const m = /rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)(?:[,/ ]+\s*([\d.]+))?/.exec(css)
  if (!m) return null
  const hex = [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")
  return { hex: `#${hex.toUpperCase()}`, alfa: m[4] === undefined ? 1 : Number(m[4]) }
}

/** Junta los colores medidos y deja los que pesan. El transparente no es un color. */
export function resumirColores(medidos: NonNullable<Medida["colores"]>): ColorMedido[] {
  const juntos = new Map<string, ColorMedido>()
  for (const c of medidos) {
    const h = aHex(c.css)
    if (!h || h.alfa < 0.5) continue
    const clave = `${h.hex}|${c.de}`
    const previo = juntos.get(clave)
    juntos.set(clave, { hex: h.hex, de: c.de, peso: (previo?.peso ?? 0) + c.peso })
  }
  const total = [...juntos.values()].reduce((n, c) => n + c.peso, 0) || 1
  return [...juntos.values()]
    .map((c) => ({ ...c, peso: Math.round((c.peso / total) * 1000) / 10 }))
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 12)
}

/** La fuente de titulos sale de lo grande; la de texto, de lo que mas area ocupa. */
function resumirFuentes(f: Medida["fuentes"]): CapturaWeb["fuentes"] {
  if (!f) return { titulos: null, texto: null }
  const genericas = /^(serif|sans-serif|system-ui|-apple-system|ui-sans-serif|inherit|arial|helvetica|times new roman)$/i
  const utiles = f.uso.filter((u) => !genericas.test(u.familia))
  const mayor = (clave: "area" | "grande") => [...utiles].sort((a, b) => b[clave] - a[clave])[0]
  const grande = mayor("grande")
  return {
    titulos: f.titulos && !genericas.test(f.titulos) ? f.titulos : grande?.grande ? grande.familia : null,
    texto: mayor("area")?.familia ?? (f.texto && !genericas.test(f.texto) ? f.texto : null),
  }
}

const sinRepetir = <T,>(lista: T[]) => [...new Set(lista)]

/**
 * Lee la web de una marca: la home a fondo y hasta 4 paginas internas utiles.
 * Lanza si no pudo abrir la home; quien llama cae a la lectura simple.
 */
export async function capturarWeb(direccion: string): Promise<CapturaWeb> {
  const inicial = new URL(/^https?:\/\//i.test(direccion) ? direccion : `https://${direccion}`)
  if (!(await segura(inicial))) throw new Error("no se puede leer esa dirección")

  const navegador = await lanzar()
  const reloj = setTimeout(() => void navegador.close().catch(() => undefined), PLAZO_TOTAL_MS)
  try {
    const home = await abrir(navegador, inicial.href)
    if (!home.pagina) throw new Error(home.fallo)

    const alto = (await home.pagina.evaluate(BAJAR).catch(() => 0)) as number
    await home.pagina.waitForNetworkIdle({ idleTime: 300, timeout: 2_500 }).catch(() => undefined)
    const medida = (await home.pagina.evaluate(leerPagina(true))) as Medida

    const capturas: Buffer[] = []
    for (const y of alto > 1400 ? [0, Math.min(alto - VISTA.height, 1000)] : [0]) {
      capturas.push(
        Buffer.from(
          await home.pagina.screenshot({
            type: "jpeg",
            quality: 72,
            clip: { x: 0, y, width: VISTA.width, height: VISTA.height },
            captureBeyondViewport: true,
          })
        )
      )
    }
    await home.pagina.close().catch(() => undefined)

    const internas = medida.enlaces
      .filter((e) => PAGINAS_UTILES.test(new URL(e.href).pathname))
      .sort((a, b) => Number(b.menu) - Number(a.menu))
      .slice(0, MAX_PAGINAS - 1)
    const leidas = await Promise.all(
      internas.map(async (e) => {
        const abierta = await abrir(navegador, e.href)
        if (!abierta.pagina) return null
        try {
          await abierta.pagina.evaluate(BAJAR).catch(() => undefined)
          return (await abierta.pagina.evaluate(leerPagina(false))) as Medida
        } catch {
          return null
        } finally {
          await abierta.pagina.close().catch(() => undefined)
        }
      })
    )
    const todas = [medida, ...leidas.filter((m): m is Medida => Boolean(m))]
    const fotos = todas.flatMap((m) => m.imagenes).filter((i) => i.ancho >= 400 && i.alto >= 300)

    return {
      paginas: todas.map((m) => ({ url: m.url, titulo: m.titulo, descripcion: m.descripcion, texto: m.texto.slice(0, MAX_POR_PAGINA) })),
      colores: resumirColores(medida.colores ?? []),
      fuentes: resumirFuentes(medida.fuentes),
      logos: sinRepetir((medida.logos ?? []).filter((u): u is string => Boolean(u))).slice(0, 6),
      imagenes: sinRepetir(fotos.map((i) => i.url))
        .slice(0, 40)
        .map((url) => ({ url, alt: fotos.find((i) => i.url === url)?.alt ?? null })),
      capturas,
    }
  } finally {
    clearTimeout(reloj)
    await navegador.close().catch(() => undefined)
  }
}
