/**
 * El importador de kits: que se sube de un kit y en que va la importacion.
 *
 * Sin base de datos, para que el navegador clasifique la carpeta con las mismas
 * reglas que luego lee el servidor. Ver kit-importar.ts.
 */

import type { Figura, TipoFigura } from "./figuras"

/** Cada archivo de la carpeta del kit, segun para que sirve al importar. */
export type ClaseArchivo =
  | "html" // piezas o paginas del kit: se dibujan para sacar las laminas y su HTML
  | "css"
  | "texto" // .md, .txt, .json: reglas, briefs, tokens
  | "fuente"
  | "logo" // svg, o imagen con nombre de logo
  | "pdf" // manual de marca
  | "lamina" // imagen con forma de lamina, de una pieza sin HTML
  | "foto" // imagen que usa alguna pieza HTML
  | "fuera" // no hace falta

export const MAX_ARCHIVOS_IMPORTAR = 600
export const MAX_BYTES_IMPORTAR = 80 * 1024 * 1024
export const MAX_BYTES_TEXTO = 3 * 1024 * 1024
export const MAX_BYTES_PDF = 25 * 1024 * 1024
/** El lado largo de las laminas y fotos que se suben: el de la lamina. */
export const LADO_IMPORTAR = 1080

const CARPETAS_FUERA = new Set(["node_modules", ".git", "__pycache__", ".next", ".venv", "venv", "dist", "build"])

/** Normaliza una ruta de la carpeta: barras hacia adelante, sin ./ ni ../ sueltos. */
export function normalizarRuta(ruta: string): string {
  const partes: string[] = []
  for (const p of ruta.replace(/\\/g, "/").split("/")) {
    if (!p || p === ".") continue
    if (p === "..") partes.pop()
    else partes.push(p)
  }
  return partes.join("/")
}

export const extension = (ruta: string) => /\.([a-z0-9]+)$/i.exec(ruta)?.[1]?.toLowerCase() ?? ""
export const carpetaDe = (ruta: string) => ruta.split("/").slice(0, -1).join("/")

/** La clase por la extension. Las imagenes se deciden despues, con sus medidas. */
export function claseInicial(ruta: string, bytes: number): ClaseArchivo | "imagen" {
  const partes = normalizarRuta(ruta).split("/")
  if (partes.some((p) => CARPETAS_FUERA.has(p) || (p.startsWith(".") && p.length > 1))) return "fuera"
  const ext = extension(ruta)
  if (["html", "htm"].includes(ext)) return bytes <= MAX_BYTES_TEXTO ? "html" : "fuera"
  if (ext === "css") return bytes <= MAX_BYTES_TEXTO ? "css" : "fuera"
  if (["md", "txt", "json", "csv"].includes(ext)) return bytes <= 1024 * 1024 ? "texto" : "fuera"
  if (["ttf", "otf", "woff", "woff2"].includes(ext)) return "fuente"
  if (ext === "svg") return bytes <= 1024 * 1024 ? "logo" : "fuera"
  if (ext === "pdf") return bytes <= MAX_BYTES_PDF ? "pdf" : "fuera"
  if (["png", "jpg", "jpeg", "webp", "jfif", "gif"].includes(ext)) return "imagen"
  return "fuera"
}

/** Las proporciones de una lamina de redes: 4:5, 1:1, 9:16 y 1,91:1. */
const PROPORCIONES_LAMINA = [4 / 5, 1, 9 / 16, 1.91]

export function pareceLamina(ancho: number, alto: number): boolean {
  if (Math.min(ancho, alto) < 600) return false
  const r = ancho / alto
  return PROPORCIONES_LAMINA.some((p) => Math.abs(r - p) / p < 0.02)
}

const NOMBRE_LOGO = /logo|isotipo|imagotipo|simbolo|symbol|wordmark|lockup|marca|brand/i

/**
 * Que hacer con una imagen. `usadas` son las rutas que nombra algun HTML o CSS;
 * `carpetasConHtml`, las carpetas que tienen una pieza HTML (sus exports sobran:
 * la pieza se dibuja y da ademas su HTML).
 */
export function claseDeImagen(
  ruta: string,
  bytes: number,
  medidas: { ancho: number; alto: number } | null,
  usadas: Set<string>,
  carpetasConHtml: Set<string>
): ClaseArchivo {
  const r = normalizarRuta(ruta)
  if (usadas.has(r)) return "foto"
  const nombre = r.split("/").pop() ?? ""
  if (NOMBRE_LOGO.test(nombre) && bytes <= 2 * 1024 * 1024) return "logo"
  if (!medidas || !pareceLamina(medidas.ancho, medidas.alto)) return "fuera"
  // Los exports de una pieza HTML (exports/, exports/cta/...) sobran: la pieza
  // se dibuja y da ademas su HTML y su foto. Se mira hasta tres carpetas arriba.
  let carpeta = carpetaDe(r)
  for (let i = 0; i < 3; i++) {
    if (carpetasConHtml.has(carpeta)) return "fuera"
    if (!carpeta) break
    carpeta = carpetaDe(carpeta)
  }
  return "lamina"
}

/**
 * Las rutas que nombra un HTML o un CSS (src, href, url()), ya resueltas desde su
 * carpeta. Solo locales: lo de internet no se sube.
 */
export function rutasNombradas(texto: string, desde: string): string[] {
  const out = new Set<string>()
  const re = /(?:src|href)\s*=\s*["']([^"'#?]+)[^"']*["']|url\(\s*["']?([^"')#?]+)[^"')]*["']?\s*\)/gi
  for (const m of texto.matchAll(re)) {
    const ruta = (m[1] ?? m[2] ?? "").trim()
    if (!ruta || /^(https?:|data:|\/\/|mailto:|#|javascript:)/i.test(ruta)) continue
    out.add(normalizarRuta(`${desde}/${decodeURIComponent(ruta)}`))
  }
  return [...out]
}

export const MIME_IMPORTAR: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/plain",
  json: "application/json",
  pdf: "application/pdf",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  webp: "image/webp",
}

// ------------------------------------------------------------------ estado

/** Un archivo que se subio para importar. */
export type ArchivoImportado = {
  /** La ruta dentro de la carpeta del kit, normalizada. */
  ruta: string
  /** Donde quedo la copia en el bucket. */
  storage: string
  clase: ClaseArchivo
  mime: string
  bytes: number
  ancho?: number
  alto?: number
}

/** Una lamina del kit: dibujada desde su HTML o subida como imagen. */
export type Referencia = {
  n: number
  /** JPEG de la lamina en el bucket. */
  imagen: string
  /** De donde salio: la ruta del archivo y, si es HTML, el numero de lamina dentro. */
  origen: string
  ancho: number
  alto: number
  /** El HTML de la lamina (outerHTML), si salio de una pieza HTML. */
  html?: string
  /** La foto principal de la lamina, para comprobar la plantilla con la misma foto. */
  foto?: string
  /** El CSS de la pagina de la que salio (en el bucket). */
  css?: string
  /** Su numero dentro de su pieza y cuantas tiene la pieza. */
  indice?: number
  total?: number
}

export const ETAPAS_PLANTILLA = ["escribir", "comprobar", "estres", "hecha", "fallo"] as const
export type EtapaPlantilla = (typeof ETAPAS_PLANTILLA)[number]

/** Una plantilla que el importador tiene que escribir y comprobar. */
export type TareaPlantilla = {
  clave: string
  tipo: string
  nombre: string
  cuando_usar: string
  cta_tipos: string[]
  /** Las referencias de este tipo, la mejor primero. */
  referencias: number[]
  plantilla_id?: string
  etapa: EtapaPlantilla
  /** Cuantas veces se corrigio despues de compararla con su original. */
  ronda: number
  /** De 0 a 10, lo que se parece a su original segun Claude. */
  parecido?: number
  /** Diferencia media por pixel (0 a 255) con su original. */
  diferencia?: number
  /** Lo que Claude vio distinto en la ultima comparacion: va a la siguiente correccion. */
  diferencias?: string[]
  /** Lo que fallo al revisar lo que escribio: va al siguiente intento. */
  errores?: string[]
  error?: string
}

export const ETAPAS_FIGURA = ["escribir", "comprobar", "estres", "hecha", "fallo"] as const
export type EtapaFigura = (typeof ETAPAS_FIGURA)[number]

/**
 * Una figura del kit (barras, tabla, niveles...: ver figuras.ts) cuyo CSS hay
 * que escribir mirando como la dibuja el kit.
 */
export type TareaFigura = {
  tipo: TipoFigura
  /** Las laminas donde aparece, la mejor primero. */
  referencias: number[]
  /** Como la dibuja el kit, en una linea (lo dice el catalogo). */
  como: string
  etapa: EtapaFigura
  ronda: number
  /** El CSS escrito; pasa a los trozos comunes del kit al terminar el paso. */
  css?: string
  /** La lamina con la que se compara y donde esta la figura en ella (px de 1080x1350). */
  ref?: number
  caja?: [number, number, number, number]
  fondo?: string
  /** Los datos de la figura de esa lamina, para dibujarla igual. */
  datos?: Figura
  parecido?: number
  diferencias?: string[]
  errores?: string[]
  problemas?: string[]
  error?: string
}

export const PASOS_IMPORTACION = [
  { clave: "subir", nombre: "Subir el kit", detalle: "Se sube una copia de lo necesario." },
  { clave: "leer", nombre: "Leer colores y fuentes", detalle: "Lo exacto: CSS, fuentes y logos." },
  { clave: "referencias", nombre: "Dibujar las láminas del kit", detalle: "Cada pieza HTML, lámina por lámina." },
  { clave: "catalogo", nombre: "Entender el kit", detalle: "Claude ve todas las láminas y los documentos." },
  { clave: "base", nombre: "Escribir la base", detalle: "El CSS común y el marco de las láminas." },
  {
    clave: "figuras",
    nombre: "Escribir las figuras",
    detalle: "Barras, tablas, pasos, encuestas... con el estilo del kit.",
  },
  {
    clave: "plantillas",
    nombre: "Escribir y comprobar plantillas",
    detalle: "Una por tipo, comparada con su original.",
  },
  { clave: "cerrar", nombre: "Dejar listo para revisar", detalle: "Guarda las referencias y limpia la copia." },
] as const
export type PasoImportacion = (typeof PASOS_IMPORTACION)[number]["clave"] | "listo" | "fallo"

export type Importacion = {
  paso: PasoImportacion
  archivos: ArchivoImportado[]
  referencias: Referencia[]
  tareas: TareaPlantilla[]
  /** Las figuras del kit que hay que escribir (las de un kit importado antes no tienen). */
  figuras?: TareaFigura[]
  /** Las paginas HTML ya dibujadas (el paso de referencias va por tandas). */
  paginas_hechas?: string[]
  /** Los colores que mas usa el CSS del kit, con cuantas veces aparecen. */
  colores?: { valor: string; veces: number }[]
  /** Las fuentes que ya se guardaron en el kit. */
  fuentes?: { familia: string; peso: number; estilo: string; papel: string; alias: string[] }[]
  /** Lo que Claude entendio del kit, en dos lineas. */
  resumen?: string
  /** Fuentes que el kit nombra y no trae: con cual se reemplazaron. */
  sustituciones: { pedida: string; usada: string }[]
  avisos: string[]
  log: { cuando: string; texto: string }[]
  /** Tokens de Claude gastados, para ver el costo de la importacion. */
  tokens: { entrada: number; salida: number }
  /** Mientras un paso corre, hasta cuando: otra pestana no lo pisa. */
  ocupado_hasta?: string
  error?: string
  empezado: string
  terminado?: string
}

export function parseImportacion(bruto: unknown): Importacion | null {
  const o = (bruto ?? {}) as Partial<Importacion>
  if (!o.paso) return null
  return {
    paso: o.paso,
    archivos: Array.isArray(o.archivos) ? o.archivos : [],
    referencias: Array.isArray(o.referencias) ? o.referencias : [],
    tareas: Array.isArray(o.tareas) ? o.tareas : [],
    figuras: Array.isArray(o.figuras) ? o.figuras : [],
    paginas_hechas: Array.isArray(o.paginas_hechas) ? o.paginas_hechas : [],
    colores: Array.isArray(o.colores) ? o.colores : [],
    fuentes: Array.isArray(o.fuentes) ? o.fuentes : [],
    resumen: o.resumen,
    sustituciones: Array.isArray(o.sustituciones) ? o.sustituciones : [],
    avisos: Array.isArray(o.avisos) ? o.avisos : [],
    log: Array.isArray(o.log) ? o.log : [],
    tokens: o.tokens ?? { entrada: 0, salida: 0 },
    ocupado_hasta: o.ocupado_hasta,
    error: o.error,
    empezado: o.empezado ?? "",
    terminado: o.terminado,
  }
}

/** Un archivo elegido para subir, con su clase. */
export type PlanDeArchivo = { ruta: string; bytes: number; clase: ClaseArchivo; ancho?: number; alto?: number }

/**
 * Decide que se sube de la carpeta de un kit: lo que hace falta para dibujar
 * sus piezas y entenderlo, sin las fotos y exports que sobran. `leerTexto` y
 * `medidas` los pone quien llama (el navegador, o un script).
 */
export async function planificarSubida(
  entradas: { ruta: string; bytes: number }[],
  leerTexto: (ruta: string) => Promise<string>,
  medidas: (ruta: string) => Promise<{ ancho: number; alto: number } | null>
): Promise<PlanDeArchivo[]> {
  const iniciales = entradas.map((e) => ({
    ...e,
    ruta: normalizarRuta(e.ruta),
    inicial: claseInicial(e.ruta, e.bytes),
  }))
  const usadas = new Set<string>()
  const carpetasConHtml = new Set<string>()
  for (const e of iniciales) {
    if (e.inicial !== "html" && e.inicial !== "css") continue
    if (e.inicial === "html") carpetasConHtml.add(carpetaDe(e.ruta))
    for (const r of rutasNombradas(await leerTexto(e.ruta), carpetaDe(e.ruta))) usadas.add(r)
  }
  const plan: PlanDeArchivo[] = []
  for (const e of iniciales) {
    if (e.inicial === "fuera") continue
    if (e.inicial !== "imagen") {
      plan.push({ ruta: e.ruta, bytes: e.bytes, clase: e.inicial })
      continue
    }
    const m = await medidas(e.ruta)
    const clase = claseDeImagen(e.ruta, e.bytes, m, usadas, carpetasConHtml)
    if (clase !== "fuera") plan.push({ ruta: e.ruta, bytes: e.bytes, clase, ...(m ?? {}) })
  }
  return plan
}
