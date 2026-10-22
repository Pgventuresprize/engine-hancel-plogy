/**
 * El kit de diseño de una marca: tipos, reglas y el lenguaje de las
 * plantillas, sin base de datos.
 *
 * Aparte de kit.ts para que la pantalla de revision pueda importarlo.
 *
 * Una plantilla es la lamina del kit en HTML con huecos:
 *
 *   {{t:titulo}}          texto de la pieza (escapado; *asi* resalta y **asi** pone negrita)
 *   {{#items}}..{{/items}} se repite por cada elemento de una lista: {{.}} es el
 *                          texto del elemento y {{i}} su numero (1, 2, 3...)
 *   {{?fuente}}..{{/fuente}} solo aparece si el hueco (o la foto) tiene algo
 *   {{a:logo_oscuro}}     un archivo del kit como data URI; {{a:foto}} es la foto de la lamina
 *   {{p:marco}}           un trozo comun del kit (el marco con logo, contador y puntos)
 *   {{s:n}} {{s:total}}   numero de lamina y total; {{s:n2}} y {{s:total2}} con dos cifras (01)
 *   {{s:puntos}}          un <i></i> por lamina; la actual lleva class="on"
 *
 * El resaltado sale como <span class="resalte">: el CSS del kit dice como se ve.
 * La lamina va dentro de un elemento con data-lamina (y data-seguro con su area
 * segura); el navegador mide los elementos con data-hueco y data-zona.
 */

export const BUCKET_KITS = "marca-kits"

export const FORMATOS = {
  carrusel_4x5: { ancho: 1080, alto: 1350, nombre: "Carrusel 4:5" },
} as const
export type Formato = keyof typeof FORMATOS

export const ESTADOS_KIT = ["borrador", "revision", "activo", "archivado"] as const
export type EstadoKit = (typeof ESTADOS_KIT)[number]

export const ESTADOS_PLANTILLA = ["pendiente", "aprobada", "rehacer"] as const
export type EstadoPlantilla = (typeof ESTADOS_PLANTILLA)[number]

export const FONDOS = ["claro", "oscuro", "acento", "foto"] as const
export type Fondo = (typeof FONDOS)[number]

export const TIPOS_ARCHIVO = ["fuente", "logo", "imagen", "referencia"] as const
export type TipoArchivo = (typeof TIPOS_ARCHIVO)[number]

export const MIME_ARCHIVO: Record<string, string> = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
}

/**
 * Los tipos de lamina que ya conoce el agente. Un kit puede traer otros: van
 * con su descripcion en `cuando_usar`.
 */
export const TIPOS_COMUNES: Record<string, string> = {
  portada: "La primera lamina: el gancho que abre la deuda narrativa.",
  idea: "Una idea con su titular y una o dos frases de apoyo.",
  dato: "Una cifra protagonista, lo que significa y su fuente.",
  lista: "Varios puntos cortos del mismo nivel.",
  comparacion: "Dos cosas lado a lado: antes y despues, error y acierto.",
  cita: "Lo que dijo alguien, con su autor.",
  tesis: "La postura de la marca en una frase fuerte.",
  criterio: "Lo que la marca recomienda hacer: reglas o pasos propios.",
  cierre: "La ultima lamina: sintesis y una sola accion (el CTA).",
}

/**
 * Los nombres de hueco comunes a todas las marcas, para que el agente escriba
 * igual para cualquier kit. Un kit puede declarar otros con su descripcion.
 */
export const HUECOS_COMUNES: Record<string, string> = {
  antetitulo: "2 a 4 palabras que situan la pieza.",
  titulo: "El titular de la lamina.",
  cuerpo: "Una o dos frases de apoyo.",
  numero: "La cifra protagonista, tal cual se lee (62.000, 29 %, $3,98).",
  etiqueta: "Lo que mide la cifra o el rotulo de un bloque.",
  fuente: "De donde sale el dato, con fecha.",
  items: "Los puntos de una lista.",
  autor: "Quien lo dijo y su cargo.",
  izquierda: "El lado izquierdo de una comparacion.",
  derecha: "El lado derecho de una comparacion.",
  cta: "La accion del cierre (Sigue a la marca, Comenta PALABRA...).",
  motivo: "Una linea con la razon para hacer la accion.",
}

export const TIPOS_HUECO = ["texto", "lista", "numero"] as const
export type TipoHueco = (typeof TIPOS_HUECO)[number]

export type Hueco = {
  nombre: string
  tipo: TipoHueco
  /** Caracteres maximos (de cada elemento, en una lista). */
  max: number
  min_items?: number
  max_items?: number
  obligatorio: boolean
  /** Si admite *resaltado*. */
  resaltado: boolean
  descripcion: string
}

/** Que foto acepta una plantilla. */
export type FotoPlantilla = {
  usa: "no" | "opcional" | "obligatoria"
  uso: "portada" | "fondo" | "cierre"
  tono: "oscura" | "clara" | "cualquiera"
  espacio: "arriba" | "abajo" | "centro" | "cualquiera"
  orientacion: "vertical" | "apaisada" | "cuadrada" | "cualquiera"
}

export const SIN_FOTO: FotoPlantilla = {
  usa: "no",
  uso: "fondo",
  tono: "cualquiera",
  espacio: "cualquiera",
  orientacion: "cualquiera",
}

export type ColorKit = { nombre: string; valor: string; papel: string }

/** El sistema visual de la marca, sacado del kit. */
export type SistemaVisual = {
  colores: ColorKit[]
  /** Familia de cada papel tipografico (titulos, texto...), como la nombra el CSS. */
  fuentes: { papel: string; familia: string }[]
  /** El papel del archivo de logo para cada fondo. */
  logos: Partial<Record<Fondo | "simbolo", string>>
  /** El orden de fondos que sigue el kit a lo largo de un carrusel. */
  ritmo: Fondo[]
  reglas: { letra_minima: number; notas: string[] }
}

export type Kit = {
  id: string
  account_id: string
  version: number
  estado: EstadoKit
  nombre: string
  origen: string
  sistema: SistemaVisual
  css: string
  parciales: Record<string, string>
  activado_at: string | null
  created_at: string
  updated_at: string
}

export type ArchivoKit = {
  id: string
  kit_id: string
  papel: string
  tipo: TipoArchivo
  ruta: string
  mime: string
  bytes: number
  nombre_original: string
  meta: Record<string, unknown>
  descripcion: string
}

export type Plantilla = {
  id: string
  kit_id: string
  tipo: string
  nombre: string
  cuando_usar: string
  formato: Formato
  html: string
  huecos: Hueco[]
  foto: FotoPlantilla
  fondo: Fondo
  cta_tipos: string[]
  referencia_archivo_id: string | null
  estado: EstadoPlantilla
  notas: string
  prueba: Record<string, unknown>
  orden: number
}

/** Lo que una pieza pone en los huecos de una lamina. */
export type DatosLamina = {
  textos: Record<string, string>
  listas: Record<string, string[]>
  n: number
  total: number
  /** La foto de la lamina como data URI, si la plantilla la usa. */
  foto?: string | null
}

// ------------------------------------------------------------------ parseo

const texto = (v: unknown, tope: number) => (typeof v === "string" ? v.trim().slice(0, tope) : "")
const de = <T extends string>(lista: readonly T[], v: unknown, porDefecto: T): T =>
  lista.includes(v as T) ? (v as T) : porDefecto
const nombreValido = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9_]{2,40}$/.test(v)

export function parseHuecos(bruto: unknown): Hueco[] {
  if (!Array.isArray(bruto)) return []
  const vistos = new Set<string>()
  const out: Hueco[] = []
  for (const h of bruto) {
    const o = (h ?? {}) as Record<string, unknown>
    if (!nombreValido(o.nombre) || vistos.has(o.nombre)) continue
    vistos.add(o.nombre)
    const tipo = de(TIPOS_HUECO, o.tipo, "texto")
    const max = Math.min(600, Math.max(1, Math.round(Number(o.max) || 120)))
    out.push({
      nombre: o.nombre,
      tipo,
      max,
      ...(tipo === "lista"
        ? {
            min_items: Math.min(12, Math.max(1, Math.round(Number(o.min_items) || 2))),
            max_items: Math.min(12, Math.max(1, Math.round(Number(o.max_items) || 5))),
          }
        : {}),
      obligatorio: o.obligatorio !== false,
      resaltado: o.resaltado === true,
      descripcion: texto(o.descripcion, 300) || HUECOS_COMUNES[o.nombre] || "",
    })
  }
  return out
}

export function parseFoto(bruto: unknown): FotoPlantilla {
  const o = (bruto ?? {}) as Record<string, unknown>
  return {
    usa: de(["no", "opcional", "obligatoria"] as const, o.usa, "no"),
    uso: de(["portada", "fondo", "cierre"] as const, o.uso, "fondo"),
    tono: de(["oscura", "clara", "cualquiera"] as const, o.tono, "cualquiera"),
    espacio: de(["arriba", "abajo", "centro", "cualquiera"] as const, o.espacio, "cualquiera"),
    orientacion: de(["vertical", "apaisada", "cuadrada", "cualquiera"] as const, o.orientacion, "cualquiera"),
  }
}

const COLOR = /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$/i

export function parseSistema(bruto: unknown): SistemaVisual {
  const o = (bruto ?? {}) as Record<string, unknown>
  const colores = Array.isArray(o.colores)
    ? o.colores
        .map((c) => (c ?? {}) as Record<string, unknown>)
        .filter((c) => typeof c.valor === "string" && COLOR.test(c.valor.trim()))
        .map((c) => ({ nombre: texto(c.nombre, 40), valor: String(c.valor).trim(), papel: texto(c.papel, 40) }))
        .slice(0, 40)
    : []
  const fuentes = Array.isArray(o.fuentes)
    ? o.fuentes
        .map((f) => (f ?? {}) as Record<string, unknown>)
        .filter((f) => texto(f.papel, 40) && texto(f.familia, 80))
        .map((f) => ({ papel: texto(f.papel, 40), familia: texto(f.familia, 80) }))
        .slice(0, 8)
    : []
  const logosBrutos = (o.logos ?? {}) as Record<string, unknown>
  const logos: SistemaVisual["logos"] = {}
  for (const k of [...FONDOS, "simbolo"] as const) if (nombreValido(logosBrutos[k])) logos[k] = logosBrutos[k] as string
  const ritmo = Array.isArray(o.ritmo)
    ? o.ritmo.filter((f): f is Fondo => FONDOS.includes(f as Fondo)).slice(0, 20)
    : []
  const reglas = (o.reglas ?? {}) as Record<string, unknown>
  return {
    colores,
    fuentes,
    logos,
    ritmo,
    reglas: {
      letra_minima: Math.min(60, Math.max(12, Math.round(Number(reglas.letra_minima) || 28))),
      notas: Array.isArray(reglas.notas)
        ? reglas.notas
            .map((n) => texto(n, 300))
            .filter(Boolean)
            .slice(0, 30)
        : [],
    },
  }
}

export function parseKit(fila: Record<string, unknown>): Kit {
  const parciales: Record<string, string> = {}
  const p = (fila.parciales ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(p)) if (nombreValido(k) && typeof v === "string") parciales[k] = v
  return {
    id: String(fila.id),
    account_id: String(fila.account_id),
    version: Number(fila.version) || 1,
    estado: de(ESTADOS_KIT, fila.estado, "borrador"),
    nombre: String(fila.nombre ?? ""),
    origen: String(fila.origen ?? ""),
    sistema: parseSistema(fila.sistema),
    css: String(fila.css ?? ""),
    parciales,
    activado_at: typeof fila.activado_at === "string" ? fila.activado_at : null,
    created_at: String(fila.created_at ?? ""),
    updated_at: String(fila.updated_at ?? ""),
  }
}

export function parseArchivo(fila: Record<string, unknown>): ArchivoKit {
  return {
    id: String(fila.id),
    kit_id: String(fila.kit_id),
    papel: String(fila.papel),
    tipo: de(TIPOS_ARCHIVO, fila.tipo, "imagen"),
    ruta: String(fila.ruta),
    mime: String(fila.mime),
    bytes: Number(fila.bytes) || 0,
    nombre_original: String(fila.nombre_original ?? ""),
    meta: (fila.meta ?? {}) as Record<string, unknown>,
    descripcion: String(fila.descripcion ?? ""),
  }
}

export function parsePlantilla(fila: Record<string, unknown>): Plantilla {
  return {
    id: String(fila.id),
    kit_id: String(fila.kit_id),
    tipo: String(fila.tipo),
    nombre: String(fila.nombre ?? ""),
    cuando_usar: String(fila.cuando_usar ?? ""),
    formato: fila.formato === "carrusel_4x5" ? "carrusel_4x5" : "carrusel_4x5",
    html: String(fila.html ?? ""),
    huecos: parseHuecos(fila.huecos),
    foto: parseFoto(fila.foto),
    fondo: de(FONDOS, fila.fondo, "claro"),
    cta_tipos: Array.isArray(fila.cta_tipos) ? fila.cta_tipos.map(String) : [],
    referencia_archivo_id: typeof fila.referencia_archivo_id === "string" ? fila.referencia_archivo_id : null,
    estado: de(ESTADOS_PLANTILLA, fila.estado, "pendiente"),
    notas: String(fila.notas ?? ""),
    prueba: (fila.prueba ?? {}) as Record<string, unknown>,
    orden: Number(fila.orden) || 0,
  }
}

// --------------------------------------------------------------- seguridad

/**
 * Lo que una plantilla o el CSS del kit no pueden traer. La pagina se dibuja
 * sin red y sin nada que se ejecute: solo lo que trae dentro.
 */
const PROHIBIDO: [RegExp, string][] = [
  [/<\s*script/i, "trae <script>"],
  [
    /<\s*(iframe|object|embed|frame|base|link|form|input|textarea|button|meta|audio|video)\b/i,
    "trae una etiqueta no permitida",
  ],
  [/\son[a-z]+\s*=/i, "trae un atributo de evento (onclick, onload...)"],
  [/javascript\s*:/i, "trae javascript:"],
  [/@import/i, "trae @import"],
  [/(src|href|srcset)\s*=\s*["']?\s*(https?:|\/\/|file:)/i, "enlaza a un archivo de fuera"],
  [/url\(\s*["']?\s*(https?:|\/\/|file:)/i, "enlaza a un archivo de fuera en el CSS"],
  [/expression\s*\(/i, "trae expression() en el CSS"],
]

const SISTEMA = ["n", "total", "n2", "total2", "puntos"]

/** Los problemas de una plantilla: seguridad y huecos que no existen. Vacio si esta bien. */
export function revisarPlantilla(
  html: string,
  huecos: Hueco[],
  ctx: { papeles: string[]; parciales: string[] }
): string[] {
  const errores: string[] = []
  for (const [re, motivo] of PROHIBIDO) if (re.test(html)) errores.push(`La plantilla ${motivo}.`)
  if (!/data-lamina/.test(html)) errores.push("La plantilla no marca su lamina con data-lamina.")
  const nombres = new Set(huecos.map((h) => h.nombre))
  const listas = new Set(huecos.filter((h) => h.tipo === "lista").map((h) => h.nombre))
  const papeles = new Set([...ctx.papeles, "foto"])
  for (const [, marca] of html.matchAll(/\{\{([^}]*)\}\}/g)) {
    const m = /^([tap#?/s]):?(.*)$/.exec(marca.trim())
    const [clase, nombre] = m ? [m[1], m[2].trim()] : ["", marca]
    if (marca === "." || marca === "i") continue
    if (clase === "t" && !nombres.has(nombre)) errores.push(`{{t:${nombre}}} no es un hueco declarado.`)
    else if (clase === "#" && !listas.has(nombre)) errores.push(`{{#${nombre}}} no es una lista declarada.`)
    else if ((clase === "?" || clase === "/") && !nombres.has(nombre) && nombre !== "foto")
      errores.push(`{{${clase}${nombre}}} no es un hueco declarado.`)
    else if (clase === "a" && !papeles.has(nombre)) errores.push(`{{a:${nombre}}} no es un archivo del kit.`)
    else if (clase === "p" && !ctx.parciales.includes(nombre))
      errores.push(`{{p:${nombre}}} no es un trozo comun del kit.`)
    else if (clase === "s" && !SISTEMA.includes(nombre)) errores.push(`{{s:${nombre}}} no existe.`)
    else if (!"tap#?/s".includes(clase)) errores.push(`{{${marca}}} no se entiende.`)
  }
  for (const h of huecos) {
    const usado = h.tipo === "lista" ? html.includes(`{{#${h.nombre}}}`) : html.includes(`{{t:${h.nombre}}}`)
    if (!usado) errores.push(`El hueco ${h.nombre} esta declarado pero la plantilla no lo usa.`)
  }
  return [...new Set(errores)]
}

/** Los problemas del CSS comun o de un trozo comun. */
export function revisarCss(css: string): string[] {
  return PROHIBIDO.filter(([re]) => re.test(css)).map(([, motivo]) => `El CSS del kit ${motivo}.`)
}

// ----------------------------------------------------------------- relleno

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

/** Texto de la pieza a HTML: escapado, `**x**` en negrita y `*x*` resaltado. */
export function textoAHtml(s: string): string {
  return (
    escapar(s)
      // Un texto de la pieza nunca abre un hueco.
      .replace(/\{\{/g, "&#123;&#123;")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\*([^*]+)\*/g, '<span class="resalte">$1</span>')
  )
}

const dosCifras = (n: number) => String(n).padStart(2, "0")

/**
 * Rellena una plantilla. `archivos` son los data URI del kit por papel; los
 * trozos comunes se insertan primero porque tambien llevan huecos.
 */
export function rellenarPlantilla(
  html: string,
  datos: DatosLamina,
  archivos: Record<string, string>,
  parciales: Record<string, string>
): string {
  const tiene = (nombre: string) =>
    nombre === "foto"
      ? Boolean(datos.foto)
      : Boolean(datos.textos[nombre]?.trim()) || (datos.listas[nombre]?.length ?? 0) > 0
  const conParciales = html.replace(/\{\{p:(\w+)\}\}/g, (_, k: string) => parciales[k] ?? "")
  return (
    conParciales
      .replace(/\{\{\?(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k: string, dentro: string) => (tiene(k) ? dentro : ""))
      .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k: string, dentro: string) =>
        (datos.listas[k] ?? [])
          .map((item, i) => dentro.replace(/\{\{\.\}\}/g, () => textoAHtml(item)).replace(/\{\{i\}\}/g, String(i + 1)))
          .join("")
      )
      .replace(/\{\{t:(\w+)\}\}/g, (_, k: string) => textoAHtml(datos.textos[k] ?? ""))
      .replace(/\{\{a:(\w+)\}\}/g, (_, k: string) => (k === "foto" ? (datos.foto ?? "") : (archivos[k] ?? "")))
      // {{s:puntos}} antes que {{s:n}}: no se pisan porque cada uno es exacto.
      .replace(/\{\{s:puntos\}\}/g, () =>
        Array.from({ length: datos.total }, (_, i) => (i + 1 === datos.n ? '<i class="on"></i>' : "<i></i>")).join("")
      )
      .replace(/\{\{s:n2\}\}/g, dosCifras(datos.n))
      .replace(/\{\{s:total2\}\}/g, dosCifras(datos.total))
      .replace(/\{\{s:n\}\}/g, String(datos.n))
      .replace(/\{\{s:total\}\}/g, String(datos.total))
  )
}

/** El @font-face de cada fuente del kit, con su archivo ya como data URI. */
export function cssDeFuentes(archivos: ArchivoKit[], datos: Record<string, string>): string {
  const formato: Record<string, string> = {
    "font/ttf": "truetype",
    "font/otf": "opentype",
    "font/woff": "woff",
    "font/woff2": "woff2",
  }
  return archivos
    .filter((a) => a.tipo === "fuente" && datos[a.papel] && typeof a.meta.familia === "string")
    .map((a) => {
      const familia = String(a.meta.familia).replace(/['"\\]/g, "")
      const peso = Number(a.meta.peso) || 400
      const estilo = a.meta.estilo === "italic" ? "italic" : "normal"
      return `@font-face{font-family:'${familia}';font-weight:${peso};font-style:${estilo};src:url(${datos[a.papel]}) format('${formato[a.mime] ?? "truetype"}')}`
    })
    .join("\n")
}

/** La pagina completa de una lamina, lista para el navegador. */
export function paginaDeLamina(css: string, fuentes: string, cuerpo: string, formato: Formato): string {
  const { ancho, alto } = FORMATOS[formato]
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
${fuentes}
*{box-sizing:border-box;margin:0}
html,body{width:${ancho}px;height:${alto}px;overflow:hidden}
${css}
</style></head><body>${cuerpo}</body></html>`
}
