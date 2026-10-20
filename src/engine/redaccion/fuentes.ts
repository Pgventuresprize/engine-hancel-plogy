import { investigarEnLaWeb, type CitaWeb } from "../content/composio"
import { supabaseAdmin } from "../supabase-admin"

/**
 * Las fuentes de una noticia: de donde sale cada dato.
 *
 * Hay tres origenes:
 * - "noticia": el articulo que trajo la extraccion (el link de la noticia).
 * - "busqueda": lo que cita la busqueda web del analisis. Antes se usaba su
 *   texto y las citas se tiraban; ahora se guardan para poder atribuir.
 * - "cobertura": reservado para otros medios que cuenten el mismo hecho.
 *
 * No hay IA aqui: es proceso. Leer una pagina es descargarla y quedarse con sus
 * parrafos; el tipo (primaria, parte interesada, medio) sale del dominio.
 */

export type TipoFuente = "primaria" | "parte_interesada" | "medio"

export type Fuente = {
  id: string
  url: string
  origen: "noticia" | "busqueda" | "cobertura"
  medio: string | null
  titulo: string | null
  autor: string | null
  fecha: string | null
  tipo: TipoFuente
  extracto: string | null
  contenido: string | null
  imagen: string | null
}

const COLUMNAS = "id, url, origen, medio, titulo, autor, fecha, tipo, extracto, contenido, imagen"

/** Tope por pagina: un articulo largo cabe entero, una pagina de portal no. */
const MAX_CONTENIDO = 9000

// --------------------------------------------------------------- clasificar

/**
 * Entidades del Estado, organismos y academia: lo que dicen es el dato
 * original. Por el dominio, que vale en cualquier pais (".gov" cubre tambien
 * ".gov.co" o ".gov.uk"), mas los organismos internacionales que no lo usan.
 */
const PRIMARIAS = [
  ".gov", ".gob", ".gouv", ".edu", ".mil", ".int", "europa.eu",
  "worldbank.org", "imf.org", "oecd.org", ".un.org", "cepal.org", "fao.org", "iadb.org", "bis.org",
]

/**
 * Gremios, asociaciones y comunicados: hablan de lo suyo y por su interes. Las
 * webs de las propias empresas no se distinguen por el dominio y quedan como
 * medio; el agente ya atribuye lo que una empresa dice de si misma.
 */
const INTERESADAS = [
  "camara", "chamber", "asociacion", "association", "federacion", "federation", "gremio",
  "prnewswire", "businesswire", "globenewswire",
]

export function tipoDeFuente(url: string): TipoFuente {
  let host = ""
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return "medio"
  }
  if (PRIMARIAS.some((p) => (p.startsWith(".") ? host.endsWith(p) || host.includes(`${p}.`) : host.includes(p)))) return "primaria"
  if (INTERESADAS.some((p) => host.includes(p))) return "parte_interesada"
  return "medio"
}

/**
 * La fecha de la noticia en algo que se pueda leer despues: la del medio si es
 * absoluta, o la que sale de restar el "hace 2 dias" de Serper al momento en
 * que se trajo.
 */
export function fechaAbsoluta(fecha: string | null, traida: string): string | null {
  if (fecha && /\d{4}/.test(fecha)) return fecha
  const t = (fecha ?? "").toLowerCase()
  const m = t.match(/(\d+|un|una|a|an)\s+(\p{L}+)/u)
  const n = m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : 1) : 0
  const ms = !m
    ? /ayer|yesterday/.test(t) ? 86_400_000 : 0
    : /minut|min\b/.test(m[2]) ? n * 60_000
    : /hora|hour/.test(m[2]) ? n * 3_600_000
    : /d[ií]a|day/.test(m[2]) ? n * 86_400_000
    : /semana|week/.test(m[2]) ? n * 7 * 86_400_000
    : 0
  if (!fecha && !ms) return null
  return new Date(new Date(traida).getTime() - ms).toISOString()
}

/** "www.contextoganadero.com" -> "contextoganadero.com". */
export function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

// ----------------------------------------------------------------- leer web

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", iexcl: "¡", iquest: "¿",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", deg: "°",
}

function decodificar(t: string): string {
  return t
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n] ?? m)
}

function limpiar(html: string): string {
  return decodificar(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

function meta(html: string, ...nombres: string[]): string | null {
  for (const n of nombres) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${n}["'][^>]*content=["']([^"']+)["']`, "i")
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${n}["']`, "i")
    const m = html.match(re1) ?? html.match(re2)
    if (m?.[1]) return decodificar(m[1]).trim()
  }
  return null
}

export type Pagina = {
  texto: string | null
  /** El resumen que el medio pone en og:description: respaldo si el cuerpo no se deja leer. */
  descripcion: string | null
  imagen: string | null
  medio: string | null
  titulo: string | null
  fecha: string | null
  autor: string | null
}

/**
 * Descarga una pagina y se queda con lo que importa: sus parrafos, su imagen
 * principal (og:image), el medio, el titulo y la fecha. Si no se puede leer
 * (PDF, bloqueo, caida) devuelve null y la fuente se queda con su extracto.
 */
export async function leerPagina(url: string): Promise<Pagina | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-CO,es;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null
    const html = (await res.text()).slice(0, 2_000_000)

    const imagen = meta(html, "og:image", "og:image:url", "twitter:image", "twitter:image:src")
    const medio = meta(html, "og:site_name", "application-name")
    const titulo = meta(html, "og:title", "twitter:title") ?? (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ? limpiar(html.match(/<title[^>]*>([^<]+)<\/title>/i)![1]) : null)
    const fecha = meta(html, "article:published_time", "datePublished", "pubdate", "date", "DC.date.issued")
    const autor = meta(html, "author", "article:author")
    const descripcion = meta(html, "og:description", "description", "twitter:description")

    // Los parrafos del articulo: si hay <article>, solo los de dentro (fuera
    // estan los menus, los relacionados y la publicidad).
    const sinRuido = html.replace(/<(script|style|noscript|nav|footer|aside|form|svg|button|select)\b[\s\S]*?<\/\1>/gi, " ")
    const parrafosDe = (bloque: string) => {
      // `<p>` exacto: `<p[^>]*>` tambien atrapa <path>, <picture> y <param>.
      const ps = [...bloque.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)]
        .map((m) => limpiar(m[1]))
        .filter((p) => p.length >= 50 && !/cookies|suscr[ií]b|newsletter|todos los derechos|derechos reservados/i.test(p))
      const vistos = new Set<string>()
      return ps.filter((p) => (vistos.has(p) ? false : (vistos.add(p), true)))
    }
    // El cuerpo es el bloque con mas texto: cada <article> (a veces el primero
    // es una tarjeta de relacionados) o, si ninguno sirve, la pagina entera.
    const bloques = [...sinRuido.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((m) => m[0])
    const candidatos = [...bloques, sinRuido].map(parrafosDe)
    const largo = (ps: string[]) => ps.reduce((n, p) => n + p.length, 0)
    let mejor = candidatos.reduce((a, b) => (largo(b) > largo(a) * 1.15 ? b : a), candidatos[0] ?? [])

    // Muchos medios traen el cuerpo entero en su JSON-LD (articleBody), aunque
    // la pagina lo pinte despues con JavaScript.
    for (const m of html.matchAll(/"articleBody"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
      try {
        const cuerpo = limpiar(JSON.parse(`"${m[1]}"`) as string)
        if (cuerpo.length > largo(mejor)) mejor = cuerpo.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"“])/).reduce<string[]>((ps, f) => {
          const ultimo = ps[ps.length - 1]
          if (ultimo && ultimo.length < 500) ps[ps.length - 1] = `${ultimo} ${f}`
          else ps.push(f)
          return ps
        }, [])
      } catch {
        // Un JSON-LD mal escapado no tumba la lectura.
      }
    }

    // Ultimo recurso, para paginas que escriben el texto en <div> (portales del
    // Estado, por ejemplo): los bloques de texto largos.
    if (largo(mejor) < 800) {
      const lineas = decodificar(
        sinRuido
          .replace(/<(header)\b[\s\S]*?<\/\1>/gi, " ")
          .replace(/<\/?(div|li|br|h[1-6]|section|td|tr|p|ul|ol|table)\b[^>]*>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
      )
        .split("\n")
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter((l) => l.length >= 80 && !/cookies|suscr[ií]b|newsletter|derechos reservados|pol[ií]tica de (privacidad|tratamiento)/i.test(l))
      const vistas = new Set<string>()
      const bloquesTexto = lineas.filter((l) => (vistas.has(l) ? false : (vistas.add(l), true)))
      if (largo(bloquesTexto) > largo(mejor)) mejor = bloquesTexto
    }
    const texto = mejor.join("\n\n").slice(0, MAX_CONTENIDO)

    let imagenAbs = imagen
    if (imagen) {
      try {
        imagenAbs = new URL(imagen, url).toString()
      } catch {
        imagenAbs = null
      }
    }
    return { texto: texto.length >= 200 ? texto : null, descripcion, imagen: imagenAbs, medio, titulo, fecha, autor }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ guardar

/** Las frases del texto de la busqueda que citan a la fuente n (marca [n]). */
function extractoDe(texto: string, n: number): string | null {
  // Las marcas llegan como [1], [1][2], [1, 2] o [1-3].
  const citaA = (frase: string) =>
    [...frase.matchAll(/\[(\d+(?:\s*[,\-]\s*\d+)*)\]/g)].some((m) =>
      m[1].split(/\s*,\s*/).some((parte) => {
        const [a, b] = parte.split(/\s*-\s*/).map(Number)
        return b ? n >= a && n <= b : n === a
      })
    )
  const frases = texto.split(/(?<=[.!?])\s+/).filter(citaA)
  const limpio = frases.map((f) => f.replace(/\s*\[[\d,\s\-]+\]/g, "").trim()).join(" ")
  return limpio.length > 0 ? limpio.slice(0, 3000) : null
}

/**
 * Guarda lo que trajo la busqueda web como fuentes de la noticia: cada cita con
 * las frases que se apoyan en ella. Se llama desde el analisis, que es quien
 * hace la busqueda; asi la investigacion se hace una sola vez para los dos
 * pipelines.
 */
export async function guardarBusqueda(
  accountId: string,
  rawNewsId: string,
  busqueda: { texto: string; citas: CitaWeb[] }
): Promise<void> {
  const filas = busqueda.citas.slice(0, 10).map((c, i) => ({
    account_id: accountId,
    raw_news_id: rawNewsId,
    url: c.url,
    origen: "busqueda",
    medio: dominio(c.url),
    titulo: c.titulo,
    autor: c.autor,
    fecha: c.fecha,
    tipo: tipoDeFuente(c.url),
    extracto: extractoDe(busqueda.texto, i + 1),
    imagen: c.imagen,
  }))
  if (filas.length === 0) return
  await supabaseAdmin().from("news_sources").upsert(filas, { onConflict: "raw_news_id,url", ignoreDuplicates: true })
}

/** La noticia misma como fuente (la que la origino). */
export async function guardarFuenteNoticia(
  accountId: string,
  news: { id: string; link: string; source: string | null; title: string; date_serper: string | null; image_url: string | null; snippet: string | null }
): Promise<void> {
  await supabaseAdmin()
    .from("news_sources")
    .upsert(
      {
        account_id: accountId,
        raw_news_id: news.id,
        url: news.link,
        origen: "noticia",
        medio: news.source || dominio(news.link),
        titulo: news.title,
        fecha: news.date_serper,
        tipo: tipoDeFuente(news.link),
        extracto: news.snippet,
        imagen: news.image_url,
      },
      { onConflict: "raw_news_id,url", ignoreDuplicates: true }
    )
}

export async function fuentesDe(rawNewsId: string): Promise<Fuente[]> {
  const { data } = await supabaseAdmin().from("news_sources").select(COLUMNAS).eq("raw_news_id", rawNewsId).order("created_at")
  const filas = (data ?? []) as Fuente[]
  // La noticia primero: es la que origino la pieza.
  return [...filas.filter((f) => f.origen === "noticia"), ...filas.filter((f) => f.origen !== "noticia")]
}

/**
 * Deja la noticia investigada para redactarla: su fuente original y las de la
 * busqueda (si la noticia se analizo antes de que se guardaran, la busqueda se
 * hace ahora), y el contenido de cada pagina que se deje leer.
 *
 * Devuelve las fuentes y la imagen principal del articulo original.
 */
export async function investigarNoticia(
  accountId: string,
  news: { id: string; link: string; source: string | null; title: string; tema: string; date_serper: string | null; image_url: string | null; snippet: string | null }
): Promise<{ fuentes: Fuente[]; imagenArticulo: string | null }> {
  await guardarFuenteNoticia(accountId, news)
  let fuentes = await fuentesDe(news.id)

  if (!fuentes.some((f) => f.origen === "busqueda")) {
    const busqueda = await investigarEnLaWeb(`${news.title} ${news.tema}`.trim())
    if (busqueda.ok) {
      await guardarBusqueda(accountId, news.id, busqueda)
      fuentes = await fuentesDe(news.id)
    }
  }

  // Se leen las que aun no tienen contenido: la noticia y hasta ocho citas.
  const porLeer = fuentes.filter((f) => !f.contenido && !/\.pdf($|\?)/i.test(f.url)).slice(0, 9)
  let imagenArticulo: string | null = null
  const supabase = supabaseAdmin()
  await Promise.all(
    porLeer.map(async (f) => {
      const p = await leerPagina(f.url)
      if (!p) return
      if (f.origen === "noticia") imagenArticulo = p.imagen
      const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (p.texto) cambios.contenido = p.texto
      else if (p.descripcion && p.descripcion.length >= 80 && !f.extracto) cambios.extracto = p.descripcion
      if (p.imagen && (!f.imagen || f.origen === "noticia")) cambios.imagen = p.imagen
      if (p.medio && (!f.medio || f.medio === dominio(f.url))) cambios.medio = p.medio
      // La fecha del medio manda sobre un "hace 2 horas" de Serper, que no dice
      // nada a quien lo lee despues.
      if (p.fecha && (!f.fecha || !/\d{4}/.test(f.fecha))) cambios.fecha = p.fecha
      if (p.autor && !f.autor) cambios.autor = p.autor
      if (p.titulo && !f.titulo) cambios.titulo = p.titulo
      await supabase.from("news_sources").update(cambios).eq("id", f.id)
    })
  )
  fuentes = await fuentesDe(news.id)
  if (!imagenArticulo) imagenArticulo = fuentes.find((f) => f.origen === "noticia")?.imagen ?? null
  return { fuentes, imagenArticulo }
}
