import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import { capturarWeb, type CapturaWeb } from "./capturar"

/**
 * Leer lo que la marca ya tiene en su web.
 *
 * La URL la escribe una persona cualquiera y la lee nuestro servidor, asi que
 * cada salto se comprueba: solo http(s), puertos normales y direcciones publicas,
 * tambien tras redirecciones. Lo que se lee es material, nunca instrucciones.
 */

const MAX_PAGINAS = 5
const MAX_POR_PAGINA = 6_000
const MAX_HTML = 2_000_000
const PLAZO_MS = 12_000
const MAX_SALTOS = 3

const PAGINAS_UTILES = /(nosotros|quienes|quien-soy|sobre|about|historia|servicio|producto|equipo|team|blog|contact|bio)/i

export function direccionPrivada(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, "")
  if (isIP(v) === 6) return v === "::1" || v === "::" || /^(fc|fd|fe[89ab])/.test(v)
  const [a, b] = v.split(".").map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

export async function segura(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false
  if (url.port && url.port !== "80" && url.port !== "443") return false
  if (url.username || url.password) return false
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (/(^|\.)(localhost|local|internal)$/i.test(host)) return false
  try {
    const ips = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
    return ips.length > 0 && ips.every((i) => !direccionPrivada(i.address))
  } catch {
    return false
  }
}

async function bajar(direccion: string): Promise<{ html: string; url: URL } | { error: string }> {
  let actual: URL
  try {
    actual = new URL(/^https?:\/\//i.test(direccion) ? direccion : `https://${direccion}`)
  } catch {
    return { error: "ese enlace no es válido" }
  }
  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    if (!(await segura(actual))) return { error: "no se puede leer esa dirección" }
    try {
      const res = await fetch(actual, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PlogyStudio/1.0)", Accept: "text/html" },
        signal: AbortSignal.timeout(PLAZO_MS),
      })
      if (res.status >= 300 && res.status < 400) {
        const destino = res.headers.get("location")
        if (!destino) return { error: "la página redirige a ningún lado" }
        actual = new URL(destino, actual)
        continue
      }
      if (!res.ok) return { error: `la página respondió ${res.status}` }
      if (!(res.headers.get("content-type") ?? "").includes("html")) return { error: "no es una página" }
      return { html: (await res.text()).slice(0, MAX_HTML), url: actual }
    } catch {
      return { error: "la página no respondió" }
    }
  }
  return { error: "demasiadas redirecciones" }
}

const ENTIDADES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&aacute;": "á",
  "&eacute;": "é",
  "&iacute;": "í",
  "&oacute;": "ó",
  "&uacute;": "ú",
  "&ntilde;": "ñ",
}

export function textoDe(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|section)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTIDADES[e.toLowerCase()] ?? " ")
    .replace(/[ \t]+/g, " ")
    .replace(/(\s*\n\s*)+/g, "\n")
    .trim()
}

function enlaces(html: string, base: URL): string[] {
  const vistos = new Set<string>()
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base)
      if (u.hostname === base.hostname && u.pathname !== base.pathname && PAGINAS_UTILES.test(u.pathname)) {
        vistos.add(u.origin + u.pathname)
      }
    } catch {
      // Un enlace roto no importa.
    }
  }
  return [...vistos]
}

const saturado = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return Math.max(r, g, b) - Math.min(r, g, b) > 40
}

/** Los colores que usa la pagina, de mas a menos repetidos, sin grises. */
export function coloresDe(html: string): string[] {
  const cuenta = new Map<string, number>()
  const tema = /<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-f]{6})/i.exec(html)?.[1]
  if (tema) cuenta.set(tema.toUpperCase(), 100)
  for (const m of html.matchAll(/#[0-9a-f]{6}\b/gi)) {
    const hex = m[0].toUpperCase()
    if (saturado(hex)) cuenta.set(hex, (cuenta.get(hex) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([hex]) => hex)
}

export type Lectura = {
  corpus: string
  colores: string[]
  /** Colores con su uso real ("#0D1738 fondo 8.7%"), para quien asigna los papeles. */
  medidos: string[]
  tipografias: string[]
  logos: string[]
  imagenes: { url: string; alt: string | null }[]
  /** Fotos de la web, para que el Estratega la mire. No se guardan. */
  capturas: Buffer[]
  avisos: string[]
}

/** La lectura con navegador. Si falla, el texto simple: nadie se queda sin leer. */
async function leerUna(dado: string, avisos: string[]): Promise<{ partes: string[]; web?: CapturaWeb; colores?: string[] }> {
  // Dos intentos: el navegador puede fallar una vez sin que la web tenga la culpa.
  for (let intento = 0; intento < 2; intento++) {
    try {
      const web = await capturarWeb(dado)
      const partes = web.paginas.map((p) => `--- PÁGINA ${p.url}\n${[p.titulo, p.descripcion, p.texto].filter(Boolean).join("\n")}`)
      if (web.paginas[0].texto.length < 200) avisos.push(`${dado}: casi no tiene texto legible.`)
      return { partes, web }
    } catch (e) {
      console.error("[onboarding] No se pudo abrir con navegador:", dado, e instanceof Error ? e.message : e)
    }
  }
  const r = await bajar(dado)
  if ("error" in r) {
    avisos.push(`${dado}: ${r.error}.`)
    return { partes: [] }
  }
  avisos.push(`${dado}: solo pudimos leer el texto, sin sus colores ni sus fuentes reales.`)
  const texto = textoDe(r.html)
  const partes = [`--- PÁGINA ${r.url.href}\n${texto.slice(0, MAX_POR_PAGINA)}`]
  const internas = await Promise.all(enlaces(r.html, r.url).slice(0, MAX_PAGINAS - 1).map(bajar))
  for (const p of internas) {
    if (!("error" in p)) partes.push(`--- PÁGINA ${p.url.href}\n${textoDe(p.html).slice(0, MAX_POR_PAGINA)}`)
  }
  return { partes, colores: coloresDe(r.html) }
}

export async function leerFuentes(dados: string[], pegado: string): Promise<Lectura> {
  const avisos: string[] = []
  const partes: string[] = []
  const salida: Omit<Lectura, "corpus" | "avisos"> = { colores: [], medidos: [], tipografias: [], logos: [], imagenes: [], capturas: [] }

  for (const dado of dados.slice(0, 3)) {
    if (/instagram\.com|linkedin\.com|tiktok\.com|facebook\.com/i.test(dado)) {
      avisos.push(`${dado}: las redes no dejan leerse con un enlace. Pega tu bio o tus textos.`)
      continue
    }
    const una = await leerUna(dado, avisos)
    partes.push(...una.partes)
    if (!salida.colores.length && una.colores) salida.colores = una.colores
    if (una.web && !salida.medidos.length) {
      salida.colores = una.web.colores.map((c) => c.hex).filter((h, i, l) => l.indexOf(h) === i).slice(0, 8)
      salida.medidos = una.web.colores.map((c) => `${c.hex} ${c.de} ${c.peso}%`)
      salida.tipografias = [una.web.fuentes.titulos, una.web.fuentes.texto].filter((f): f is string => Boolean(f))
      salida.logos = una.web.logos
      salida.imagenes = una.web.imagenes
      salida.capturas = una.web.capturas
    }
  }
  const propio = pegado.trim()
  if (propio) partes.push(`--- LO QUE PEGÓ LA PERSONA\n${propio.slice(0, 20_000)}`)
  return { corpus: partes.join("\n\n"), avisos, ...salida }
}
