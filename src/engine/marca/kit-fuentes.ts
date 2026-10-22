import opentype from "opentype.js"

/**
 * Las fuentes de un kit: las que trae, las que pide a Google Fonts y las del
 * sistema que nombra sin traer.
 *
 * El navegador del servidor no tiene ninguna fuente instalada y dibuja sin red,
 * asi que todo lo que una pagina del kit usa tiene que llegarle dentro, como
 * @font-face con data URI. Las del sistema (Arial, Helvetica) se reemplazan por
 * sus equivalentes libres de mismas medidas, para que el texto ocupe lo mismo
 * que en el original.
 */

export type Fuente = {
  familia: string
  peso: number
  estilo: "normal" | "italic"
  datos: Buffer
  mime: string
  /** Otros nombres que la usan: los de sistema que reemplaza. */
  alias: string[]
  origen: "archivo" | "css" | "google" | "sustituto"
}

/** Las del sistema y su equivalente libre de mismas medidas (o el mas parecido). */
const SUSTITUTOS: Record<string, string> = {
  arial: "Arimo",
  helvetica: "Arimo",
  "helvetica neue": "Arimo",
  "arial nova": "Arimo",
  "liberation sans": "Arimo",
  "times new roman": "Tinos",
  times: "Tinos",
  "courier new": "Cousine",
  courier: "Cousine",
  georgia: "Gelasio",
  calibri: "Carlito",
  cambria: "Caladea",
  "segoe ui": "Noto Sans",
  "san francisco": "Inter",
  "-apple-system": "Inter",
  "system-ui": "Inter",
  blinkmacsystemfont: "Inter",
  verdana: "Noto Sans",
  tahoma: "Noto Sans",
}

const GENERICAS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "inherit", "initial", "unset"])

const limpiarNombre = (n: string) =>
  n
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim()

/** Las listas de familias que nombra un CSS (font-family, font y variables con pinta de fuente). */
export function pilasDeFamilias(css: string): string[][] {
  const pilas: string[][] = []
  const agregar = (valor: string) => {
    const nombres = valor
      .split(",")
      .map(limpiarNombre)
      .filter((n) => n && !n.startsWith("var(") && !/^\d/.test(n))
    if (nombres.length) pilas.push(nombres)
  }
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) agregar(m[1])
  // font: 700 30px/1 var(--display) -> lo que va despues del tamano.
  for (const m of css.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}{]+)/gi)) {
    const despues = /\d+(?:\.\d+)?(?:px|rem|em|pt|%)(?:\s*\/\s*[\d.]+[a-z%]*)?\s+(.+)$/i.exec(m[1].trim())
    if (despues) agregar(despues[1])
  }
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;}{]+)/g)) {
    if (
      /font|display|body|heading|head|texto|text|titul|family|serif|sans/i.test(m[1]) &&
      /["',]|sans|serif/i.test(m[2])
    )
      agregar(m[2])
  }
  return pilas
}

/** Los @font-face de un CSS: familia, peso, estilo y de donde sale el archivo. */
export function caraDeFuentes(
  css: string
): { familia: string; peso: number; estilo: "normal" | "italic"; url: string }[] {
  const out: { familia: string; peso: number; estilo: "normal" | "italic"; url: string }[] = []
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/gi)) {
    const cuerpo = m[1]
    const familia = limpiarNombre(/font-family\s*:\s*([^;]+)/i.exec(cuerpo)?.[1] ?? "")
    const urls = [...cuerpo.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((u) => u[1])
    // Si trae varias, la que el navegador del servidor lee seguro: no woff2 si hay otra.
    const url = urls.find((u) => !/woff2/i.test(u)) ?? urls[0]
    if (!familia || !url) continue
    const pesoBruto = /font-weight\s*:\s*([^;]+)/i.exec(cuerpo)?.[1]?.trim() ?? "400"
    const peso = pesoBruto === "bold" ? 700 : pesoBruto === "normal" ? 400 : Number.parseInt(pesoBruto) || 400
    const estilo = /font-style\s*:\s*italic/i.test(cuerpo) ? "italic" : "normal"
    out.push({ familia, peso, estilo, url })
  }
  return out
}

/** Las familias y pesos que pide un enlace o @import de Google Fonts. */
export function pedidosAGoogle(texto: string): { familia: string; pesos: number[]; italica: boolean }[] {
  const out: { familia: string; pesos: number[]; italica: boolean }[] = []
  for (const m of texto.matchAll(/https?:\/\/fonts\.googleapis\.com\/css2?\?([^"')\s>]+)/gi)) {
    const consulta = m[1].replace(/&amp;/g, "&")
    for (const f of consulta.split("&").filter((p) => p.startsWith("family="))) {
      const valor = decodeURIComponent(f.slice(7).replace(/\+/g, " "))
      const [familia, ejes = ""] = valor.split(":")
      const pesos = [...ejes.matchAll(/(\d{3})/g)].map((p) => Number(p[1]))
      out.push({
        familia: familia.trim(),
        pesos: pesos.length ? [...new Set(pesos)] : [400],
        italica: /ital/.test(ejes),
      })
    }
  }
  return out
}

/** Nombre, peso y estilo leidos del propio archivo de la fuente (no sirve con woff2). */
export function metaDeArchivo(datos: Buffer): { familia: string; peso: number; estilo: "normal" | "italic" } | null {
  try {
    const f = opentype.parse(datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer)
    const nombres = f.names as unknown as Record<string, { en?: string } | undefined>
    const familia = nombres.preferredFamily?.en ?? nombres.fontFamily?.en ?? ""
    const os2 = f.tables.os2 as { usWeightClass?: number; fsSelection?: number } | undefined
    const italica = ((os2?.fsSelection ?? 0) & 1) === 1 || ((f.tables.head as { macStyle?: number }).macStyle ?? 0) & 2
    return familia ? { familia, peso: os2?.usWeightClass ?? 400, estilo: italica ? "italic" : "normal" } : null
  } catch {
    return null
  }
}

/** Las descargas de Google Fonts, una vez por instancia. */
const deGoogle = new Map<string, Promise<Buffer | null>>()

/** Un peso de una familia de Google Fonts en TTF, o null si no existe. */
export function bajarDeGoogle(familia: string, peso: number, italica = false): Promise<Buffer | null> {
  const clave = `${familia}|${peso}|${italica}`
  let p = deGoogle.get(clave)
  if (!p) {
    p = (async () => {
      try {
        const eje = italica ? `ital,wght@1,${peso}` : `wght@${peso}`
        const css = await fetch(`https://fonts.googleapis.com/css2?family=${familia.replace(/ /g, "+")}:${eje}`, {
          signal: AbortSignal.timeout(10_000),
        })
        if (!css.ok) return null
        // Sin cabecera de navegador, la API sirve TTF.
        const url = /url\((https:[^)]+\.ttf)\)/.exec(await css.text())?.[1]
        if (!url) return null
        const ttf = await fetch(url, { signal: AbortSignal.timeout(15_000) })
        return ttf.ok ? Buffer.from(await ttf.arrayBuffer()) : null
      } catch {
        return null
      }
    })()
    deGoogle.set(clave, p)
  }
  return p
}

const MIME_FUENTE: Record<string, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" }

/** El mime de una fuente por su data URI o su extension. */
export function mimeDeFuente(url: string): string {
  const deData = /^data:([^;,]+)/.exec(url)?.[1]
  if (deData) {
    if (/woff2/.test(deData)) return "font/woff2"
    if (/woff/.test(deData)) return "font/woff"
    if (/otf|opentype/.test(deData)) return "font/otf"
    return "font/ttf"
  }
  return MIME_FUENTE[/\.([a-z0-9]+)$/i.exec(url)?.[1]?.toLowerCase() ?? ""] ?? "font/ttf"
}

/**
 * Todas las fuentes que necesita una pagina del kit: las de sus @font-face
 * (`leer` trae un archivo por su url), las de Google que enlaza, y para cada
 * familia de sistema que nombra sin tener, su equivalente libre con ese nombre
 * como alias. Lo que no se consigue va en `faltan`.
 */
export async function fuentesDePagina(
  texto: string,
  leer: (url: string) => Promise<Buffer | null>
): Promise<{ fuentes: Fuente[]; sustituciones: { pedida: string; usada: string }[]; faltan: string[] }> {
  const fuentes: Fuente[] = []
  const tiene = (familia: string) =>
    fuentes.some(
      (f) =>
        f.familia.toLowerCase() === familia.toLowerCase() ||
        f.alias.some((a) => a.toLowerCase() === familia.toLowerCase())
    )

  for (const c of caraDeFuentes(texto)) {
    const datos = c.url.startsWith("data:")
      ? Buffer.from(
          c.url.slice(c.url.indexOf(",") + 1),
          /;base64/.test(c.url.slice(0, c.url.indexOf(","))) ? "base64" : "utf8"
        )
      : await leer(c.url)
    if (datos?.length)
      fuentes.push({
        ...c,
        datos,
        mime: mimeDeFuente(c.url),
        alias: [],
        origen: c.url.startsWith("data:") ? "css" : "archivo",
      })
  }
  for (const g of pedidosAGoogle(texto)) {
    for (const peso of g.pesos) {
      if (fuentes.some((f) => f.familia === g.familia && f.peso === peso)) continue
      const datos = await bajarDeGoogle(g.familia, peso)
      if (datos)
        fuentes.push({
          familia: g.familia,
          peso,
          estilo: "normal",
          datos,
          mime: "font/ttf",
          alias: [],
          origen: "google",
        })
    }
  }

  // Cada lista de familias se resuelve como lo haria el navegador: la primera
  // que este. Si la primera disponible es de sistema, va su equivalente libre.
  const sustituciones: { pedida: string; usada: string }[] = []
  const faltan = new Set<string>()
  for (const pila of pilasDeFamilias(texto)) {
    if (pila.some((n) => tiene(n))) continue
    const sistema = pila.find((n) => SUSTITUTOS[n.toLowerCase()])
    if (!sistema) {
      // Una familia que no trae ni enlaza: si existe en Google Fonts, se baja.
      const propia = pila.find((n) => !GENERICAS.has(n.toLowerCase()))
      if (!propia) continue
      const pesos = await Promise.all(
        [400, 700].map(async (peso) => [peso, await bajarDeGoogle(propia, peso)] as const)
      )
      if (pesos.some(([, d]) => d)) {
        for (const [peso, datos] of pesos)
          if (datos)
            fuentes.push({
              familia: propia,
              peso,
              estilo: "normal",
              datos,
              mime: "font/ttf",
              alias: [],
              origen: "google",
            })
        sustituciones.push({ pedida: propia, usada: `${propia} (Google Fonts)` })
      } else faltan.add(propia)
      continue
    }
    const libre = SUSTITUTOS[sistema.toLowerCase()]
    const alias = pila.filter((n) => SUSTITUTOS[n.toLowerCase()] === libre)
    const existente = fuentes.filter((f) => f.familia === libre)
    if (existente.length) {
      for (const f of existente) f.alias = [...new Set([...f.alias, ...alias])]
    } else {
      for (const peso of [400, 700]) {
        const datos = await bajarDeGoogle(libre, peso)
        if (datos)
          fuentes.push({ familia: libre, peso, estilo: "normal", datos, mime: "font/ttf", alias, origen: "sustituto" })
      }
    }
    for (const a of alias)
      if (!sustituciones.some((s) => s.pedida === a)) sustituciones.push({ pedida: a, usada: libre })
  }
  return { fuentes, sustituciones, faltan: [...faltan] }
}

/** El CSS @font-face de unas fuentes, con sus alias. */
export function cssDeFuentesCargadas(fuentes: Fuente[]): string {
  const formato: Record<string, string> = {
    "font/ttf": "truetype",
    "font/otf": "opentype",
    "font/woff": "woff",
    "font/woff2": "woff2",
  }
  const lineas: string[] = []
  for (const f of fuentes) {
    const src = `url(data:${f.mime};base64,${f.datos.toString("base64")}) format('${formato[f.mime] ?? "truetype"}')`
    for (const nombre of [f.familia, ...f.alias])
      lineas.push(
        `@font-face{font-family:'${nombre.replace(/['"\\]/g, "")}';font-weight:${f.peso};font-style:${f.estilo};src:${src}}`
      )
  }
  return lineas.join("\n")
}
