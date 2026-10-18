import type { EstiloPlantilla, TipoEstilo } from "@/lib/plantillas-catalogo"
import { anchoReal } from "./metricas"

/**
 * El compositor: escribe cada pieza como HTML siguiendo su estilo.
 *
 * Canva importa ese HTML y lo convierte en un diseno editable (cada texto un
 * elemento de texto, cada imagen un hueco, cada bloque una forma). Por eso el
 * texto lo controla siempre el sistema, con su tipografia y sus tildes, y el
 * estilo sale igual en todas las piezas: lo deciden estas reglas, no un
 * generador que interpreta a su manera.
 *
 * Restricciones de la importacion, comprobadas: los bloques (div) con fondo y
 * borde redondeado se importan como formas; el SVG en linea no se importa. Por
 * eso los graficos se construyen con bloques, no con SVG.
 *
 * Todo se mide sobre un lienzo de 1080 de ancho y se escala (k) al tamano real
 * del formato. Los apaisados (mas anchos que altos) usan composiciones en dos
 * columnas.
 */

export type Grafico = {
  tipo: "barras" | "columnas" | "ranking" | "cifras"
  unidad: string
  items: {
    etiqueta: string
    valor: number | string
    variacion?: "sube" | "baja" | "estable"
    nota?: string
    /** El icono pedido (en ingles) y su url ya resuelta. */
    icono?: string
    iconoUrl?: string
  }[]
  destacado?: number
}

/**
 * Un apoyo del estilo Fotografico, dentro de la columna de texto: solo los que
 * informan. "lista" numerada, "cifra" con su explicacion, "datos" en pastillas.
 */
export type Recurso = {
  tipo: "cifra" | "lista" | "datos"
  valor?: string
  texto?: string
  items?: string[]
}

export type LaminaCompuesta = {
  rol: "portada" | "contenido" | "cierre" | "unica"
  /** Fotografico: la palabra o frase corta que encabeza ("PASO 02", "EL ERROR"). */
  antetitulo: string
  titulo: string
  cuerpo: string
  etiquetas: string[]
  grafico: Grafico | null
  fuente: string
  periodo: string
  /** La imagen principal: foto (Fotografico), dibujo o render generado. */
  imagen: string | null
  /** Una foto real de apoyo: la que acompana al dibujo o al grafico. */
  foto: string | null
  recurso: Recurso | null
  /** Data-viz: la url del icono de la lamina. */
  icono: string | null
  /** Infografia: como se organizan las etiquetas sobre la imagen. */
  esquema: "partes" | "pasos"
  /** Infografia: donde esta en la imagen la parte de cada etiqueta (0 a 1), o null. */
  puntos: ({ x: number; y: number } | null)[]
  /** Ancho / alto de la imagen generada, para que su caja la respete y los puntos caigan en su sitio. */
  aspecto: number | null
}

type Ctx = {
  W: number
  H: number
  k: number
  m: number
  apaisado: boolean
  e: EstiloPlantilla
  logo: string | null
  oscuro: boolean
  /** El logo para fondo claro, si la marca lo tiene. */
  logoOscuro?: string | null
}

// ------------------------------------------------------------------ piezas

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const px = (n: number) => `${Math.round(n)}px`

/**
 * Un texto, con las lineas partidas por el sistema.
 *
 * Las lineas se parten aqui, midiendo cada palabra con la fuente real (ver
 * medir), y van con <br>. Canva no tiene que partir nada: la caja es un poco
 * mas ancha que la linea mas larga, porque si una linea no le cabe la parte por
 * su cuenta y el texto crece hacia abajo, encima de lo que venga despues.
 *
 * Red contra desbordes: la caja no pasa del borde del lienzo, una palabra que no
 * cabe en su linea encoge el texto, y un texto que se sale por abajo tambien
 * encoge (hasta el 60 %). Cada texto queda anotado con su caja real para la
 * revision de solapes.
 */
function texto(t: string, x: number, y: number, ancho: number, s: string) {
  if (!t.trim()) return ""
  const base = Number(/font-size:(\d+)px/.exec(s)?.[1] ?? 32)
  const lh = Number(/line-height:([\d.]+)/.exec(s)?.[1] ?? 1.3)
  const peso = /font-weight:(7|8|9)00/.test(s) ? PESO_GRUESO : PESO_NORMAL
  const espaciado = Number(/letter-spacing:([\d.]+)px/.exec(s)?.[1] ?? 0)
  const alinear = /text-align:center/.test(s) ? "centro" : /text-align:right/.test(s) ? "derecha" : "izquierda"
  const borde = 20 * (LIENZO.W / 1080)
  ancho = Math.max(40, Math.min(ancho, LIENZO.W - borde - x))
  const palabraMasLarga = Math.max(...t.trim().split(/\s+/).map((p) => medir(p, base, peso, espaciado)))
  let size = Math.min(base, Math.floor(base * ((ancho * 0.98) / palabraMasLarga)))
  let partido = lineas(t, size, ancho, peso, espaciado)
  // Encoger por alto tiene un minimo (el 60 %); encoger para que quepa la
  // palabra mas larga no: una palabra que se sale de su caja es peor.
  while (size > base * 0.6 && y + partido.length * size * lhReal(lh) > LIENZO.H - borde) {
    size = Math.max(Math.floor(size * 0.93), Math.min(size, Math.ceil(base * 0.6)))
    partido = lineas(t, size, ancho, peso, espaciado)
    if (size <= Math.ceil(base * 0.6)) break
  }
  const estilo = size === base ? s : s.replace(/font-size:\d+px/, `font-size:${px(size)}`)
  const h = partido.length * size * lhReal(lh)
  const usado = Math.max(...partido.map((l) => medir(l, size, peso, espaciado)))
  anotar(t, alinear === "izquierda" ? x : alinear === "centro" ? x + (ancho - usado) / 2 : x + ancho - usado, y, usado, h)

  // Holgura de la caja hacia donde el texto no se mueve: a la derecha si va a
  // la izquierda, a los dos lados si va centrado, a la izquierda si va a la
  // derecha. Nunca fuera del lienzo.
  const holgura = Math.min(size * 1.5, ancho * 0.15)
  let cx = x
  let cw = ancho
  if (alinear === "izquierda") cw = Math.min(ancho + holgura, LIENZO.W - x)
  else if (alinear === "centro") {
    const d = Math.min(holgura / 2, x, LIENZO.W - x - ancho)
    cx = x - d
    cw = ancho + 2 * d
  } else {
    const d = Math.min(holgura, x)
    cx = x - d
    cw = ancho + d
  }
  return `<p style="position:absolute;left:${px(cx)};top:${px(y)};width:${px(cw)};min-height:${px(h * 1.1 + size * 0.4)};margin:0;${estilo.includes("font-size") ? estilo : `font-size:${px(size)};${estilo}`}">${partido.map(esc).join("<br>")}</p>`
}

/**
 * El interlineado con que Canva pinta un texto: con line-height por debajo de
 * ~1.15 no aprieta mas las lineas, asi que se mide con ese minimo.
 */
const lhReal = (lh: number) => Math.max(lh, 1.15)

/** Las cajas de texto de la lamina que se esta componiendo, para revisar solapes. */
let CAJAS: { t: string; x: number; y: number; w: number; h: number; tipo: "texto" | "imagen" | "sobreImagen" }[] = []
let MIDIENDO = false
/** Mientras es true, los textos van sobre una imagen a proposito (los numeros de los pasos). */
let SOBRE_IMAGEN = false
function anotar(t: string, x: number, y: number, w: number, h: number, tipo: "texto" | "imagen" = "texto") {
  if (!MIDIENDO) CAJAS.push({ t, x, y, w, h, tipo: tipo === "texto" && SOBRE_IMAGEN ? "sobreImagen" : tipo })
}

/** Compone algo solo para medirlo: sus cajas no cuentan como texto de la lamina. */
function soloMedir<T>(fn: () => T): T {
  const antes = MIDIENDO
  MIDIENDO = true
  try {
    return fn()
  } finally {
    MIDIENDO = antes
  }
}

/** La tipografia de la pieza que se esta componiendo. */
let FUENTE = "Montserrat"

/**
 * Ancho de un texto con la fuente real del estilo (cargada antes con
 * cargarFuente), con un 6 % de margen. Si la fuente no se pudo cargar, se cae a
 * un ancho promedio por letra, por lo alto.
 */
function medir(t: string, size: number, peso: number, espaciado = 0) {
  const real = anchoReal(t, size, FUENTE, peso)
  const w = real ?? t.length * size * (peso >= 700 ? 0.7 : 0.58)
  return w * 1.06 + espaciado * t.length
}

/** El tamano (hasta `size`) con que `t` cabe en una linea de `ancho`. */
function tamanoQueCabe(t: string, size: number, ancho: number, peso: number) {
  // Con un 2 % de margen: ajustado al ancho exacto, el redondeo la partia.
  const w = medir(t, size, peso)
  // Redondeado hacia abajo, que es como se escribe en el HTML sin pasarse.
  return w <= ancho * 0.98 ? size : Math.floor(size * ((ancho * 0.98) / w))
}

/** El lienzo de la pieza que se esta componiendo, para la red contra desbordes. */
let LIENZO = { W: 1080, H: 1350 }

/**
 * Una pastilla de una linea: se mide con el mismo ancho de caracter con que se
 * parte el texto, y si no cabe en `maxW` encoge la letra en vez de partirse
 * (una pastilla partida en dos se sale por abajo).
 */
function pildora(t: string, x: number, y: number, maxW: number, opciones: { size: number; alto: number; pad: number; fondo: string; color: string; borde?: string }) {
  const size = tamanoQueCabe(t, opciones.size, maxW - 2 * opciones.pad, PESO_GRUESO)
  const w = Math.min(maxW, medir(t, size, PESO_GRUESO) + 2 * opciones.pad)
  const html =
    bloque(x, y, w, opciones.alto, `background:${opciones.fondo};${opciones.borde ? `border:${opciones.borde};` : ""}border-radius:${px(opciones.alto / 2)};`) +
    texto(t, x, y + (opciones.alto - size * 1.2) / 2, w, `font-size:${px(size)};font-weight:700;line-height:1.2;text-align:center;color:${opciones.color};`)
  return { html, w }
}

function bloque(x: number, y: number, w: number, h: number, s: string) {
  return `<div style="position:absolute;left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};${s}"></div>`
}

function imagen(url: string, x: number, y: number, w: number, h: number, alt: string, extra = "", ajuste = "cover") {
  // Las fotos a sangre (de borde a borde) son fondo: el texto va encima a
  // proposito. Las demas imagenes e iconos no se pueden tapar.
  if (w < LIENZO.W * 0.98) anotar(alt, x, y, w, h, "imagen")
  return `<img src="${esc(url)}" alt="${esc(alt)}" style="position:absolute;left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};object-fit:${ajuste};${extra}">`
}

/** Los pesos con que se mide: el grueso de titulos y cifras, y el normal. */
const PESO_GRUESO = 800
const PESO_NORMAL = 400

/** Parte un texto en lineas que caben en `ancho`, midiendo con la fuente real. */
function lineas(t: string, size: number, ancho: number, peso: number, espaciado = 0): string[] {
  // Con el tamano que de verdad se escribe en el HTML (redondeado): medio
  // pixel de mas bastaba para que un titulo al limite ganara una linea.
  size = Math.round(size)
  const salida: string[] = []
  let actual = ""
  for (const p of t.trim().split(/\s+/)) {
    const prueba = actual ? `${actual} ${p}` : p
    if (actual && medir(prueba, size, peso, espaciado) > ancho + 0.5) {
      salida.push(actual)
      actual = p
    } else actual = prueba
  }
  if (actual) salida.push(actual)
  return salida
}

/** Alto de un texto con las mismas lineas que va a llevar. */
function alto(t: string, size: number, ancho: number, lh: number, peso = PESO_NORMAL) {
  return lineas(t, size, ancho, peso).length * Math.round(size) * lhReal(lh)
}

/**
 * Titulo y cuerpo que caben en `maxH`: a su tamano si caben; si no, los dos
 * encogen en la misma proporcion (hasta el 55 %). Es lo que impide que un
 * titulo largo en un formato bajo (cuadrado, apaisado) empuje todo lo demas
 * fuera de la lamina o encima del pie.
 */
function cabeceraQueCabe(o: {
  titulo: string
  cuerpo: string
  ancho: number
  sizeT: number
  sizeC: number
  lhT: number
  lhC: number
  gap: number
  maxH: number
}) {
  // Si ni encogidos caben, el cuerpo se queda fuera (el titulo y la imagen o
  // el grafico bastan) antes que montarse sobre lo que viene debajo.
  // Con cuerpo encogen hasta el 55 %; solo el titulo, hasta el 40 % (el caso
  // de un titulo largo en el apaisado de LinkedIn, de 627 px de alto).
  for (const cuerpo of o.cuerpo ? [o.cuerpo, ""] : [""]) {
    for (let f = 1; f >= (cuerpo ? 0.55 : 0.4); f *= 0.94) {
      const sizeT = o.sizeT * f
      const sizeC = o.sizeC * f
      const hT = alto(o.titulo, sizeT, o.ancho, o.lhT, PESO_GRUESO)
      const hC = cuerpo ? alto(cuerpo, sizeC, o.ancho, o.lhC) : 0
      const h = hT + (cuerpo ? o.gap + hC : 0)
      if (h <= o.maxH) return { sizeT, sizeC, hT, hC, h, cuerpo }
    }
  }
  const sizeT = o.sizeT * 0.4
  const hT = alto(o.titulo, sizeT, o.ancho, o.lhT, PESO_GRUESO)
  return { sizeT, sizeC: o.sizeC * 0.4, hT, hC: 0, h: hT, cuerpo: "" }
}

/** Reduce el tamano cuando el texto es largo, para que no se coma la lamina. */
function ajustar(t: string, base: number, comodo: number) {
  if (t.length <= comodo) return base
  return Math.round(base * Math.max(0.62, Math.sqrt(comodo / t.length)))
}

function luminancia(hex: string) {
  const h = hex.replace("#", "")
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function formatearValor(v: number | string) {
  if (typeof v === "string") return v
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 }).format(v)
}

/**
 * El logo de la marca es blanco: sobre fondo claro va dentro de un sello oscuro,
 * salvo que la marca tenga su version para fondo claro, que va tal cual.
 */
function logo(c: Ctx, x: number, y: number, lado: number, sobreOscuro: boolean) {
  if (!c.e.logo || !c.logo) return ""
  if (sobreOscuro) return imagen(c.logo, x - lado * 0.18, y - lado * 0.22, lado, lado, "logo", "", "contain")
  if (c.logoOscuro) return imagen(c.logoOscuro, x - lado * 0.18, y - lado * 0.22, lado, lado, "logo", "", "contain")
  return (
    bloque(x, y, lado * 0.7, lado * 0.5, `background:${c.e.colores.texto};border-radius:${px(10 * c.k)};`) +
    imagen(c.logo, x - lado * 0.08, y - lado * 0.3, lado * 0.86, lado * 1.1, "logo", "", "contain")
  )
}

/**
 * El logo arriba a la izquierda en las laminas sin foto, frente a la
 * numeracion. Devuelve tambien cuanto baja el contenido para dejarle sitio.
 */
function logoArriba(c: Ctx): { html: string; baja: number } {
  if (!c.e.logo || !c.logo) return { html: "", baja: 0 }
  return { html: logo(c, c.m + 6 * c.k, c.m - 4 * c.k, 128 * c.k, c.oscuro), baja: 70 * c.k }
}

function numeracion(c: Ctx, n: number, total: number, color: string) {
  if (!c.e.numeracion || total < 2) return ""
  const t = `${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`
  return texto(t, c.W - c.m - 220 * c.k, c.m, 220 * c.k, `font-size:${px(26 * c.k)};font-weight:700;color:${color};text-align:right;`)
}

function desliza(c: Ctx, color: string) {
  if (!c.e.textoDesliza) return ""
  return texto(c.e.textoDesliza, c.m, c.H - c.m - 30 * c.k, 500 * c.k, `font-size:${px(26 * c.k)};font-weight:700;letter-spacing:4px;color:${color};`)
}

const textoPie = (l: LaminaCompuesta) =>
  [l.fuente ? `Fuente: ${l.fuente}` : "", l.periodo ? `Periodo: ${l.periodo}` : ""].filter(Boolean).join(" · ")

/** Lo que ocupa el pie de fuente y periodo, desde el borde de abajo (0 si no hay). */
function altoPie(c: Ctx, l: LaminaCompuesta) {
  const t = textoPie(l)
  return t ? alto(t, 22 * c.k, c.W - 2 * c.m, 1.3) : 0
}

/** Fuente y periodo al pie, en una o dos lineas, siempre dentro del margen. */
function pieDeDatos(c: Ctx, l: LaminaCompuesta) {
  const t = textoPie(l)
  return texto(t, c.m, c.H - c.m * 0.8 - altoPie(c, l), c.W - 2 * c.m, `font-size:${px(22 * c.k)};line-height:1.3;color:${c.e.colores.textoSuave};`)
}

/** Donde acaba el espacio util de una lamina de datos: encima del pie (o del "desliza"). */
function finUtil(c: Ctx, l: LaminaCompuesta) {
  const pie = altoPie(c, l)
  const desliza = l.rol === "portada" && !textoPie(l) && c.e.textoDesliza ? 70 * c.k : 0
  return c.H - c.m * 0.8 - Math.max(pie, desliza) - 40 * c.k
}

/**
 * Las pastillas que caben en `maxH`: encogen y, si ni asi, se quedan las dos
 * primeras (la primera es la clave). Devuelve la escala y las etiquetas.
 */
function pastillasQueCaben(c: Ctx, etiquetas: string[], ancho: number, maxH: number) {
  for (const lista of [etiquetas, etiquetas.slice(0, 2), etiquetas.slice(0, 1)])
    for (let escala = 1; escala >= 0.7; escala -= 0.1) {
      const h = soloMedir(() => pastillas(c, lista, 0, 0, ancho, escala).alto)
      if (h <= maxH) return { etiquetas: lista, escala, alto: h }
    }
  return { etiquetas: [] as string[], escala: 1, alto: 0 }
}

/** Etiquetas como pastillas, en filas. Devuelve el html y el alto usado. */
function pastillas(c: Ctx, etiquetas: string[], x: number, y: number, ancho: number, escala = 1) {
  const k = c.k * escala
  let html = ""
  let cx = x
  let cy = y
  const size = 28 * k
  const altoP = 58 * k
  etiquetas.slice(0, 4).forEach((t, i) => {
    const w = Math.min(ancho, medir(t, size, PESO_GRUESO) + 50 * k)
    if (cx + w > x + ancho) {
      cx = x
      cy += altoP + 14 * k
    }
    const destacada = i === 0
    const p = pildora(t, cx, cy, ancho, {
      size,
      alto: altoP,
      pad: 25 * k,
      fondo: destacada ? c.e.colores.acento : "transparent",
      color: destacada ? c.e.colores.fondo : c.e.colores.texto,
      borde: `${px(3 * k)} solid ${destacada ? c.e.colores.acento : c.e.colores.textoSuave}`,
    })
    html += p.html
    cx += p.w + 14 * k
  })
  return { html, alto: etiquetas.length ? cy - y + altoP : 0 }
}

// ------------------------------------------------------------------- cierre

function cierre(c: Ctx, l: LaminaCompuesta) {
  const { W, H, k, m, e } = c
  // Sin las marcas de enfasis: en el cierre se veria el asterisco.
  const titulo = sinMarcas(e.cierre.modo === "fijo" ? e.cierre.titulo : l.titulo)
  const cuerpo = sinMarcas(e.cierre.modo === "fijo" ? e.cierre.texto : l.cuerpo)
  // En un formato bajo el logo encoge y el texto se mide para caber entre el
  // logo y el borde de abajo.
  const lado = Math.min(300 * k, H * 0.26)
  const yTexto = H * 0.17 + lado * 0.9
  const cab = cabeceraQueCabe({
    titulo,
    cuerpo,
    ancho: W - 2 * m,
    sizeT: ajustar(titulo, 72 * k, 40),
    sizeC: 34 * k,
    lhT: 1.1,
    lhC: 1.4,
    gap: 40 * k,
    maxH: H - yTexto - m * 0.8,
  })
  let html = logo(c, (W - lado * (c.oscuro ? 1 : 0.7)) / 2 + (c.oscuro ? lado * 0.18 : 0), H * 0.17, lado, c.oscuro)
  html += texto(titulo, m, yTexto, W - 2 * m, `font-size:${px(cab.sizeT)};line-height:1.1;font-weight:800;color:${e.colores.texto};text-align:center;`)
  if (cab.cuerpo) html += texto(cab.cuerpo, m, yTexto + cab.hT + 40 * k, W - 2 * m, `font-size:${px(cab.sizeC)};line-height:1.4;color:${e.colores.textoSuave};text-align:center;`)
  return html
}

// -------------------------------------------------------------- fotografico

/** El color de texto que se lee sobre un fondo dado. */
function sobre(fondo: string) {
  return luminancia(fondo) > 0.55 ? "#0A0A0A" : "#FFFFFF"
}

/** Un color de la paleta con transparencia. */
function conAlfa(hex: string, a: number) {
  const h = hex.replace("#", "")
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

type Tramo = { texto: string; marca: "normal" | "acento" | "negrita" }

/**
 * Lee las marcas del agente: *acento* en los titulos y **negrita** en el
 * cuerpo. Son las que dan jerarquia dentro de la frase, como en un carrusel
 * hecho a mano: la idea clave cambia de color y de peso.
 */
function tramos(t: string): Tramo[] {
  const salida: Tramo[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let ultimo = 0
  for (let m = re.exec(t); m; m = re.exec(t)) {
    if (m.index > ultimo) salida.push({ texto: t.slice(ultimo, m.index), marca: "normal" })
    salida.push({ texto: m[1] ?? m[2], marca: m[1] ? "negrita" : "acento" })
    ultimo = m.index + m[0].length
  }
  if (ultimo < t.length) salida.push({ texto: t.slice(ultimo), marca: "normal" })
  return salida.filter((x) => x.texto.trim())
}

export const sinMarcas = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1")

/**
 * Texto con tramos de distinto estilo, con las lineas partidas por el sistema
 * (Canva las parte con otra fuente si se le deja). `saltoAntesDeAcento` pone
 * la parte destacada en su propia linea, como la portada de un carrusel.
 */
function textoRico(
  t: string,
  x: number,
  y: number,
  ancho: number,
  base: { size: number; lh: number; peso: number; css: string },
  estilos: Record<Tramo["marca"], string>,
  saltoAntesDeAcento = false
): { html: string; h: number } {
  // Cada palabra se mide con el peso y la caja de su tramo: el acento en
  // mayusculas o la negrita ocupan mas que el texto normal.
  const pesoDe = (marca: Tramo["marca"]) => {
    if (marca === "normal") return base.peso
    return /font-weight:(7|8|9)00/.test(estilos[marca]) ? PESO_GRUESO : PESO_NORMAL
  }
  const mayus = (marca: Tramo["marca"]) => /text-transform:uppercase/.test(estilos[marca])
  // "pegada": la palabra va junto a la anterior, sin espacio (la coma o el
  // punto que siguen a un tramo destacado: "*cierre*, no..." no lleva "cierre ,").
  const palabras: { p: string; marca: Tramo["marca"]; corte: boolean; pegada: boolean; w: number }[] = []
  let previo = ""
  for (const tr of tramos(t)) {
    const pegadaAlInicio = palabras.length > 0 && !/\s$/.test(previo) && !/^\s/.test(tr.texto)
    previo = tr.texto
    tr.texto
      .trim()
      .split(/\s+/)
      .forEach((p, i) =>
        palabras.push({
          p,
          marca: tr.marca,
          corte: saltoAntesDeAcento && tr.marca === "acento" && i === 0,
          pegada: i === 0 && pegadaAlInicio,
          w: medir(mayus(tr.marca) ? p.toUpperCase() : p, base.size, pesoDe(tr.marca)),
        })
      )
  }
  const espacio = medir(" ", base.size, base.peso)
  const lineasP: (typeof palabras)[] = [[]]
  let largo = 0
  for (const w of palabras) {
    const actual = lineasP[lineasP.length - 1]
    if (actual.length && !w.pegada && (w.corte || largo + espacio + w.w > ancho)) {
      lineasP.push([w])
      largo = w.w
    } else {
      actual.push(w)
      largo += (actual.length > 1 && !w.pegada ? espacio : 0) + w.w
    }
  }
  const usado = Math.max(...lineasP.map((l) => l.reduce((s2, w, i) => s2 + w.w + (i ? espacio : 0), 0)))
  const html = lineasP
    .map((linea) => {
      let out = ""
      let i = 0
      while (i < linea.length) {
        const marca = linea[i].marca
        const sep = out && !linea[i].pegada ? " " : ""
        let run = ""
        while (i < linea.length && linea[i].marca === marca) {
          run += (run && !linea[i].pegada ? " " : "") + linea[i].p
          i++
        }
        const pedazo = esc(run)
        out += marca === "normal" ? sep + pedazo : `${sep}<span style="${estilos[marca]}">${pedazo}</span>`
      }
      return out
    })
    .join("<br>")
  const h = lineasP.length * base.size * lhReal(base.lh)
  anotar(sinMarcas(t), x, y, usado, h)
  return {
    html: `<p style="position:absolute;left:${px(x)};top:${px(y)};width:${px(Math.min(ancho + base.size * 1.5, LIENZO.W - x))};min-height:${px(h * 1.1 + base.size * 0.4)};margin:0;font-size:${px(base.size)};line-height:${base.lh};${base.css}">${html}</p>`,
    h,
  }
}

/** Logo y numeracion sobre pastillas translucidas: se leen sobre cualquier foto. */
function cabeceraSobreFoto(c: Ctx, n: number, total: number) {
  const { W, k, m, e } = c
  let html = ""
  if (e.logo && c.logo) {
    html += bloque(m - 14 * k, m - 6 * k, 150 * k, 92 * k, `background:rgba(0,0,0,0.42);border-radius:${px(14 * k)};`)
    html += logo(c, m + 6 * k, m - 4 * k, 128 * k, true)
  }
  if (e.numeracion && total > 1) {
    html += bloque(W - m - 150 * k, m - 6 * k, 164 * k, 52 * k, `background:rgba(0,0,0,0.42);border-radius:${px(26 * k)};`)
    html += texto(`${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, W - m - 150 * k, m + 4 * k, 164 * k, `font-size:${px(26 * k)};font-weight:700;color:#FFFFFF;text-align:center;`)
  }
  return html
}

/** "Desliza" como un boton: una pastilla con flecha, abajo a la izquierda. */
function botonDesliza(c: Ctx) {
  const { k, m, H, e } = c
  if (!e.textoDesliza) return ""
  const t = e.textoDesliza.replace(/→/g, "").trim()
  const w = medir(`${t}  →`, 24 * k, PESO_GRUESO, 2) + 80 * k
  const h = 56 * k
  const y = H - m - h + 10 * k
  return (
    // Relleno solido, sin borde: con borde, Canva dibujaba un recuadro cuadrado
    // alrededor de la pastilla redondeada.
    bloque(m, y, w, h, `background:${e.colores.acento};border-radius:${px(h / 2)};`) +
    texto(`${t}  →`, m, y + 14 * k, w, `font-size:${px(24 * k)};line-height:1.1;font-weight:700;letter-spacing:2px;text-align:center;color:${sobre(e.colores.acento)};`)
  )
}

/**
 * Un recurso de apoyo dentro de la columna de texto, de arriba abajo. Solo los
 * que informan: una lista numerada, una cifra con su explicacion o pastillas
 * con datos. Devuelve el html y el alto.
 */
function recursoEnColumna(c: Ctx, r: Recurso, x: number, y: number, ancho: number) {
  const { k, e } = c
  if (r.tipo === "lista" && r.items?.length) {
    const size = 32 * k
    let html = ""
    r.items.slice(0, 4).forEach((it, i) => {
      const fila = textoRico(`*${String(i + 1).padStart(2, "0")}* ${it}`, x, y + i * size * 1.6, ancho, { size, lh: 1.3, peso: PESO_NORMAL, css: `font-weight:400;color:${e.colores.texto};` }, { normal: "", negrita: "", acento: `color:${e.colores.acento};font-weight:800;` })
      html += fila.html
    })
    return { html, h: r.items.slice(0, 4).length * size * 1.6 }
  }
  if (r.tipo === "cifra" && r.valor) {
    const size = ajustar(r.valor, 92 * k, 7)
    // La cifra en negrita gruesa es mas ancha que un texto normal ("%" sobre
    // todo): se mide con margen para que la linea separadora no la pise.
    const anchoValor = Math.min(ancho * 0.55, medir(r.valor, size, PESO_GRUESO) + 10 * k)
    let html = texto(r.valor, x, y, anchoValor + 40 * k, `font-size:${px(size)};line-height:1;font-weight:800;color:${e.colores.acento};`)
    if (r.texto) {
      const xTexto = x + anchoValor + 48 * k
      const anchoTexto = ancho - anchoValor - 48 * k
      const altoTexto = alto(r.texto, 28 * k, anchoTexto, 1.2)
      html += bloque(x + anchoValor + 22 * k, y + size * 0.1, 3 * k, size * 0.8, `background:${conAlfa(e.colores.texto, 0.5)};`)
      // La explicacion, centrada en vertical respecto a la cifra.
      html += texto(r.texto, xTexto, y + Math.max(0, (size - altoTexto) / 2), anchoTexto, `font-size:${px(28 * k)};line-height:1.2;font-weight:400;color:${e.colores.textoSuave};`)
    }
    return { html, h: size * 1.05 }
  }
  if (r.tipo === "datos" && r.items?.length) {
    const size = 24 * k
    const h = 50 * k
    let cx = x
    let cy = y
    let html = ""
    r.items.slice(0, 3).forEach((it, i) => {
      const w = Math.min(ancho, medir(it, size, PESO_GRUESO) + 50 * k)
      if (cx + w > x + ancho) {
        cx = x
        cy += h + 12 * k
      }
      const fondo = i === 0 ? e.colores.acento : conAlfa(e.colores.texto, 0.16)
      const p = pildora(it, cx, cy, ancho, { size, alto: h, pad: 25 * k, fondo, color: i === 0 ? sobre(e.colores.acento) : e.colores.texto })
      html += p.html
      cx += p.w + 12 * k
    })
    return { html, h: cy - y + h }
  }
  return { html: "", h: 0 }
}

/**
 * El bloque de texto de una lamina fotografica: antetitulo, titulo en dos
 * tonos (la idea clave en acento y otro peso), cuerpo con la frase clave en
 * negrita y, si informa, un recurso. Se mide antes de colocarlo.
 */
function bloqueFoto(c: Ctx, l: LaminaCompuesta, ancho: number, portada: boolean, escala = 1, conRecurso = true, conCuerpo = true) {
  const { e } = c
  const k = c.k * escala
  const partes: { h: number; html: (x: number, y: number) => string }[] = []
  const sep = (h: number) => partes.push({ h, html: () => "" })

  if (l.antetitulo) {
    const t = l.antetitulo.toUpperCase()
    partes.push({ h: 24 * k * 1.3, html: (x, y) => texto(t, x, y, ancho, `font-size:${px(24 * k)};line-height:1.3;font-weight:700;letter-spacing:3px;color:${e.colores.acento};`) })
    sep(16 * k)
  }

  const sizeT = ajustar(sinMarcas(l.titulo), (portada ? 80 : 60) * k, portada ? 60 : 55)
  const baseT = { size: sizeT, lh: 1.06, peso: PESO_GRUESO, css: `font-weight:800;color:${e.colores.texto};` }
  const estT = { normal: "", negrita: "", acento: `color:${e.colores.acento};font-weight:300;${portada ? "text-transform:uppercase;" : ""}` }
  const medidaT = soloMedir(() => textoRico(l.titulo, 0, 0, ancho, baseT, estT, portada))
  partes.push({ h: medidaT.h, html: (x, y) => textoRico(l.titulo, x, y, ancho, baseT, estT, portada).html })

  if (l.cuerpo && conCuerpo) {
    sep(22 * k)
    const baseC = { size: 32 * k, lh: 1.38, peso: PESO_NORMAL, css: `font-weight:300;color:${e.colores.textoSuave};` }
    const estC = { normal: "", acento: `color:${e.colores.acento};font-weight:700;`, negrita: `font-weight:800;color:${e.colores.texto};` }
    const medidaC = soloMedir(() => textoRico(l.cuerpo, 0, 0, ancho, baseC, estC))
    partes.push({ h: medidaC.h, html: (x, y) => textoRico(l.cuerpo, x, y, ancho, baseC, estC).html })
  }

  if (l.recurso && !portada && conRecurso) {
    const medida = soloMedir(() => recursoEnColumna(c, l.recurso!, 0, 0, ancho))
    if (medida.h) {
      sep(30 * k)
      partes.push({ h: medida.h, html: (x, y) => recursoEnColumna(c, l.recurso!, x, y, ancho).html })
    }
  }

  const h = partes.reduce((s, p) => s + p.h, 0)
  return {
    h,
    html: (x: number, y: number) => {
      let out = ""
      let cy = y
      for (const p of partes) {
        out += p.html(x, cy)
        cy += p.h
      }
      return out
    },
  }
}

/**
 * Fotografico. La foto manda. La composicion alterna la foto a sangre (con el
 * texto sobre un degradado) y la foto arriba con un panel solido, y el
 * refuerzo visual esta en el texto mismo: jerarquia de antetitulo, titulo en
 * dos tonos, frase clave en negrita, y recursos que informan (lista, cifra,
 * datos). Nada de formas que solo adornan.
 */
function fotografico(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  const dividida = !portada && !c.apaisado && n % 2 === 0
  return dividida ? fotoDividida(c, l, n, total) : fotoInmersiva(c, l, n, total, portada)
}

/** El bloque de texto fotografico mas grande que cabe en `maxH`. */
function bloqueQueCabe(c: Ctx, l: LaminaCompuesta, ancho: number, portada: boolean, maxH: number) {
  for (const conRecurso of [true, false])
    for (let escala = 1; escala >= 0.6; escala -= 0.05) {
      const b = bloqueFoto(c, l, ancho, portada, escala, conRecurso)
      if (b.h <= maxH) return b
    }
  // Ultimo recurso: sin cuerpo, el titulo solo puede bajar hasta el 40 %.
  for (let escala = 1; escala >= 0.4; escala -= 0.05) {
    const b = bloqueFoto(c, l, ancho, portada, escala, false, false)
    if (b.h <= maxH) return b
  }
  return bloqueFoto(c, l, ancho, portada, 0.4, false, false)
}

function fotoInmersiva(c: Ctx, l: LaminaCompuesta, n: number, total: number, portada: boolean) {
  const { W, H, k, m, e } = c
  let html = l.imagen ? imagen(l.imagen, 0, 0, W, H, "foto") : ""
  const ancho = c.apaisado ? W * 0.62 : W - 2 * m
  const pie = l.rol === "portada" && e.textoDesliza ? 110 * k : 40 * k
  // El bloque cabe entre la cabecera (logo y numeracion) y el pie: si no,
  // encoge y, como ultimo recurso, deja el recurso fuera.
  const bloqueT = bloqueQueCabe(c, l, ancho, portada, H - m - pie - (m + 110 * k))
  const yTexto = H - m - pie - bloqueT.h

  // Degradado de contraste: escalones finos de velo, porque el degradado CSS
  // no se importa de forma fiable.
  const inicioVelo = Math.max(H * 0.25, yTexto - 120 * k)
  // Muchos escalones iguales que, apilados, llegan al velo pedido: sin el
  // salto final se ven como un degradado y no como franjas.
  const pasos = 24
  const altoDegradado = 420 * k
  const alfa = 1 - Math.pow(1 - Math.min(0.95, e.velo * 0.9), 1 / pasos)
  for (let i = 0; i < pasos; i++) {
    html += bloque(0, inicioVelo - altoDegradado + (altoDegradado / pasos) * (i + 1), W, H, `background:rgba(0,0,0,${alfa.toFixed(3)});`)
  }

  html += bloqueT.html(m, yTexto)
  html += cabeceraSobreFoto(c, n, total)
  if (l.rol === "portada") html += botonDesliza(c)
  return html
}

function fotoDividida(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, H, k, m, e } = c
  // El panel crece con el texto: la foto cede lo justo (nunca menos del 40 %)
  // para que el bloque respire arriba y abajo.
  const bloqueT = bloqueQueCabe(c, l, W - 2 * m, false, H * 0.6 - 2 * 60 * k)
  const fotoH = Math.max(H * 0.4, Math.min(H * 0.55, H - bloqueT.h - 2 * 80 * k))
  let html = l.imagen ? imagen(l.imagen, 0, 0, W, fotoH, "foto") : ""
  html += bloque(0, fotoH, W, H - fotoH, `background:${e.colores.fondo};`)
  // Una linea de acento marca el corte entre la foto y el panel.
  html += bloque(0, fotoH, W, 6 * k, `background:${e.colores.acento};`)
  const y = Math.max(fotoH + 70 * k, fotoH + (H - fotoH - bloqueT.h) / 2)
  html += bloqueT.html(m, y)
  html += cabeceraSobreFoto(c, n, total)
  return html
}

// -------------------------------------------------------------- ilustracion


function ilustracion(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, H, k, m, e } = c
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  const cabeza = logoArriba(c)
  let html = cabeza.html

  if (c.apaisado) {
    const colTexto = W * 0.5 - m - 40 * k
    const pas = pastillasQueCaben(c, l.etiquetas, colTexto, (H - 2 * m) * 0.3)
    const altoPastillas = pas.alto ? pas.alto + 30 * k : 0
    const pieI = portada && e.textoDesliza ? 70 * k : 0
    const cab = cabeceraQueCabe({
      titulo: l.titulo,
      cuerpo: l.cuerpo,
      ancho: colTexto,
      sizeT: ajustar(l.titulo, 58 * k, 50),
      sizeC: 28 * k,
      lhT: 1.1,
      lhC: 1.4,
      gap: 20 * k,
      maxH: H - (m + 30 * k + cabeza.baja) - m - altoPastillas - pieI,
    })
    html += texto(l.titulo, m, m + 30 * k + cabeza.baja, colTexto, `font-size:${px(cab.sizeT)};line-height:1.1;font-weight:800;color:${e.colores.texto};`)
    const yC = m + 30 * k + cabeza.baja + cab.hT + 20 * k
    html += texto(cab.cuerpo, m, yC, colTexto, `font-size:${px(cab.sizeC)};line-height:1.4;color:${e.colores.textoSuave};`)
    html += pastillas(c, pas.etiquetas, m, H - m - pieI - altoPastillas + 30 * k, colTexto, pas.escala).html
    // Debajo de la numeracion, que va arriba a la derecha.
    if (l.imagen) html += imagen(l.imagen, W * 0.5, m + 50 * k, W * 0.5 - m, H - 2 * m - 50 * k, "ilustracion", `border-radius:${px(28 * k)};`)
  } else {
    const yT = m + 60 * k + cabeza.baja
    // Las pastillas se miden (pueden ir en dos filas) y el titulo con su
    // cuerpo se quedan con la mitad del alto como mucho: la otra mitad es del
    // dibujo.
    const pas = pastillasQueCaben(c, l.etiquetas, W - 2 * m, H * 0.2)
    const altoPastillas = pas.alto ? pas.alto + 30 * k : 0
    const reservaAbajo = altoPastillas + (portada && e.textoDesliza ? 70 * k : 0) + m
    const cab = cabeceraQueCabe({
      titulo: l.titulo,
      cuerpo: l.cuerpo,
      ancho: W - 2 * m,
      sizeT: ajustar(l.titulo, (portada ? 80 : 60) * k, portada ? 60 : 55),
      sizeC: 32 * k,
      lhT: 1.08,
      lhC: 1.35,
      gap: 18 * k,
      maxH: (H - yT - reservaAbajo) * 0.5,
    })
    html += texto(l.titulo, m, yT, W - 2 * m, `font-size:${px(cab.sizeT)};line-height:1.08;font-weight:800;color:${e.colores.texto};`)
    let y = yT + cab.hT + 18 * k
    if (cab.cuerpo) {
      html += texto(cab.cuerpo, m, y, W - 2 * m, `font-size:${px(cab.sizeC)};line-height:1.35;color:${e.colores.textoSuave};`)
      y += cab.hC + 30 * k
    }
    const altoImg = H - y - reservaAbajo
    if (l.imagen) html += imagen(l.imagen, m, y, W - 2 * m, altoImg, "ilustracion", `border-radius:${px(32 * k)};`)
    html += pastillas(c, pas.etiquetas, m, y + altoImg + 30 * k, W - 2 * m, pas.escala).html
  }
  html += numeracion(c, n, total, e.colores.textoSuave)
  if (l.rol === "portada") html += desliza(c, e.colores.textoSuave)
  return html
}

// --------------------------------------------------------------- infografia

/** Una caja del aspecto de la imagen, lo mas grande posible dentro de la zona y centrada. */
function cajaConAspecto(zona: { x: number; y: number; w: number; h: number }, aspecto: number) {
  const w = Math.min(zona.w, zona.h * aspecto)
  const h = w / aspecto
  return { x: zona.x + (zona.w - w) / 2, y: zona.y + (zona.h - h) / 2, w, h }
}

/** La leyenda de un esquema de pasos: numero en un circulo y su accion, en una o dos columnas. */
function leyendaPasos(c: Ctx, pasos: string[], x: number, y: number, ancho: number, escala = 1) {
  const { e } = c
  const k = c.k * escala
  const cols = pasos.length >= 3 ? 2 : 1
  const gapX = 36 * k
  const anchoCol = (ancho - gapX * (cols - 1)) / cols
  const circulo = 52 * k
  const size = 28 * k
  const anchoTexto = anchoCol - circulo - 18 * k
  let html = ""
  let h = 0
  for (let fila = 0; fila * cols < pasos.length; fila++) {
    const enFila = pasos.slice(fila * cols, fila * cols + cols)
    const altoFila = Math.max(circulo, ...enFila.map((p) => alto(p, size, anchoTexto, 1.2, PESO_GRUESO)))
    enFila.forEach((p, j) => {
      const i = fila * cols + j
      const cx = x + j * (anchoCol + gapX)
      const cy = y + h
      html += bloque(cx, cy, circulo, circulo, `background:${e.colores.acento};border-radius:${px(circulo / 2)};`)
      html += texto(String(i + 1), cx, cy + (circulo - size * 1.15) / 2, circulo, `font-size:${px(size)};line-height:1.15;font-weight:800;text-align:center;color:${sobre(e.colores.acento)};`)
      html += texto(p, cx + circulo + 18 * k, cy + Math.max(0, (circulo - alto(p, size, anchoTexto, 1.2, PESO_GRUESO)) / 2), anchoTexto, `font-size:${px(size)};line-height:1.2;font-weight:700;color:${e.colores.texto};`)
    })
    h += altoFila + 20 * k
  }
  return { html, h: Math.max(0, h - 20 * k) }
}

type Llamada = { t: string; i: number; px: number; py: number }

/**
 * Las etiquetas de un esquema de partes, en filas fuera de la imagen: arriba las
 * de las partes de la mitad de arriba, abajo las de la mitad de abajo. Cada
 * tarjeta vive en su propia franja de la fila (no puede pisar a otra) y una
 * linea baja hasta el punto de su parte. Ninguna tarjeta tapa la imagen, ni un
 * punto, ni una linea ajena: antes iban encima de la imagen y se apilaban.
 */
function filasDeEtiquetas(c: Ctx, items: Llamada[], ancho: number, escala = 1) {
  const k = c.k * escala
  const size = 28 * k
  const pad = 16 * k
  const gap = 18 * k
  let arriba = items.filter((it) => it.py < 0.5)
  let abajo = items.filter((it) => it.py >= 0.5)
  // Maximo tres por fila: lo que sobra pasa a la otra, empezando por la mas
  // cercana a la mitad.
  const pasar = (de: Llamada[], a: Llamada[]) => {
    de.sort((x, y) => Math.abs(y.py - 0.5) - Math.abs(x.py - 0.5))
    while (de.length > 3) a.push(de.pop()!)
  }
  pasar(arriba, abajo)
  pasar(abajo, arriba)
  arriba = arriba.sort((a, b) => a.px - b.px)
  abajo = abajo.sort((a, b) => a.px - b.px)

  const medirFila = (fila: Llamada[]) => {
    if (!fila.length) return { h: 0, tarjetas: [] as { it: Llamada; w: number; h: number; franja: number; anchoFranja: number }[] }
    const anchoFranja = (ancho - gap * (fila.length - 1)) / fila.length
    const tarjetas = fila.map((it, j) => {
      const ls = lineas(it.t, size, anchoFranja - 2 * pad, PESO_GRUESO)
      const w = Math.min(anchoFranja, Math.max(...ls.map((l) => medir(l, size, PESO_GRUESO))) + 2 * pad)
      return { it, w, h: ls.length * size * lhReal(1.18) + 2 * pad, franja: j * (anchoFranja + gap), anchoFranja }
    })
    return { h: Math.max(...tarjetas.map((t) => t.h)), tarjetas }
  }
  return { size, pad, arriba: medirFila(arriba), abajo: medirFila(abajo) }
}

function dibujarFila(
  c: Ctx,
  fila: ReturnType<typeof filasDeEtiquetas>["arriba"],
  x0: number,
  yFila: number,
  img: { x: number; y: number; w: number; h: number },
  deArriba: boolean,
  size: number,
  pad: number
) {
  const { k, e } = c
  let html = ""
  fila.tarjetas.forEach((t, j) => {
    const px0 = img.x + t.it.px * img.w
    const py0 = img.y + t.it.py * img.h
    // La tarjeta, dentro de su franja, lo mas cerca posible de su parte.
    const xMin = x0 + t.franja
    const x = Math.min(Math.max(px0 - t.w / 2, xMin), xMin + t.anchoFranja - t.w)
    const y = deArriba ? yFila + (fila.h - t.h) : yFila
    const color = t.it.i === 0 ? e.colores.acento : e.colores.texto
    const linea = (lx: number, ly: number, lw: number, lh: number) =>
      bloque(lx, ly, Math.max(lw, 4 * k), Math.max(lh, 4 * k), `background:${color};`)

    // La linea sale del borde de la tarjeta que mira a la imagen. Si la parte
    // no queda debajo de la tarjeta, hace un codo en el hueco entre la fila y
    // la imagen (a una altura distinta por tarjeta, para que no se monten).
    const xSale = Math.min(Math.max(px0, x + 20 * k), x + t.w - 20 * k)
    const ySale = deArriba ? y + t.h : y
    const yBorde = deArriba ? img.y : img.y + img.h
    const yCodo = ySale + (yBorde - ySale) * (0.35 + 0.3 * (j / Math.max(1, fila.tarjetas.length - 1)))
    if (Math.abs(xSale - px0) < 2 * k) {
      html += linea(px0 - 2 * k, Math.min(ySale, py0), 4 * k, Math.abs(py0 - ySale))
    } else {
      html += linea(xSale - 2 * k, Math.min(ySale, yCodo), 4 * k, Math.abs(yCodo - ySale))
      html += linea(Math.min(xSale, px0) - 2 * k, yCodo - 2 * k, Math.abs(px0 - xSale) + 4 * k, 4 * k)
      html += linea(px0 - 2 * k, Math.min(yCodo, py0), 4 * k, Math.abs(py0 - yCodo))
    }
    html += bloque(px0 - 14 * k, py0 - 14 * k, 28 * k, 28 * k, `background:${color};border-radius:${px(14 * k)};border:${px(5 * k)} solid ${e.colores.fondo};`)
    html += bloque(x, y, t.w, t.h, `background:${color};border-radius:${px(14 * k)};`)
    html += texto(t.it.t, x + pad, y + pad, t.w - 2 * pad, `font-size:${px(size)};line-height:1.18;font-weight:800;color:${sobre(color)};`)
  })
  return html
}

/**
 * Infografia. La imagen manda y las etiquetas explican lo que se ve en ella:
 * - "partes": cada etiqueta en una tarjeta fuera de la imagen, con una linea
 *   hasta su parte.
 * - "pasos": un numero sobre el lugar de cada paso y la leyenda debajo.
 * Los puntos salen de ubicar cada parte en la imagen ya generada; una etiqueta
 * sin punto no lleva linea: va en una pastilla debajo.
 *
 * Todo se mide antes de colocarse, de arriba abajo: titulo, cuerpo, fila de
 * etiquetas de arriba, imagen, fila de abajo, leyenda. La imagen se queda con
 * lo que sobra, asi que nada se monta sobre nada.
 */
function infografia(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, H, k, m, e } = c
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  let html = ""

  // Titulo arriba, grueso y grande; subtitulo breve debajo. En vertical se
  // quedan con menos de la mitad del alto: el resto es de la imagen.
  // En apaisado la imagen ocupa desde la mitad: el texto acaba antes, con aire.
  const anchoTit = c.apaisado ? W * 0.5 - m - 40 * k : W - 2 * m
  const cabeza = logoArriba(c)
  html += cabeza.html
  const yT = m + 50 * k + cabeza.baja
  const pieT = portada && e.textoDesliza ? 70 * k : 0
  const cab = cabeceraQueCabe({
    titulo: l.titulo,
    cuerpo: l.cuerpo,
    ancho: anchoTit,
    sizeT: ajustar(l.titulo, (portada ? 76 : 62) * k, 50),
    sizeC: 30 * k,
    lhT: 1.06,
    lhC: 1.3,
    gap: 20 * k,
    maxH: (H - yT - m - pieT) * (c.apaisado ? 1 : 0.42),
  })
  html += texto(l.titulo, m, yT, anchoTit, `font-size:${px(cab.sizeT)};line-height:1.06;font-weight:800;color:${e.colores.texto};`)
  let y = yT + cab.hT + 20 * k
  if (cab.cuerpo) {
    html += texto(cab.cuerpo, m, y, anchoTit, `font-size:${px(cab.sizeC)};line-height:1.3;color:${e.colores.textoSuave};`)
    y += cab.hC + 36 * k
  } else y += 16 * k

  const etiquetas = l.etiquetas.slice(0, 4)
  const pasos = l.esquema === "pasos" && etiquetas.length > 0
  const conPunto = etiquetas.map((t, i) => ({ t, i, p: l.imagen ? (l.puntos[i] ?? null) : null }))
  const sinPunto = conPunto.filter((x) => !x.p).map((x) => x.t)
  const pie = portada && e.textoDesliza ? 70 * k : 0
  const zona = c.apaisado
    ? { x: W * 0.5, y: m + 50 * k, w: W * 0.5 - m, h: H - 2 * m - 50 * k - pie }
    : { x: m, y, w: W - 2 * m, h: H - y - m - pie }
  const sep = 40 * k

  // Lo que va debajo de todo: la leyenda de los pasos, o las etiquetas que no
  // se pudieron ubicar.
  const llamadas = pasos
    ? []
    : conPunto.filter((x): x is { t: string; i: number; p: { x: number; y: number } } => Boolean(x.p)).map((x) => ({ t: x.t, i: x.i, px: x.p.x, py: x.p.y }))
  // Etiquetas y leyenda encogen hasta que a la imagen le quede al menos el
  // 40 % de su zona: en un formato bajo, cuatro tarjetas largas se la comian.
  const medirTodo = (escala: number) => {
    const leyenda = soloMedir(() => (pasos ? leyendaPasos(c, etiquetas, 0, 0, zona.w, escala).h : sinPunto.length ? pastillas(c, sinPunto, 0, 0, zona.w, escala).alto : 0))
    const filas = filasDeEtiquetas(c, llamadas, zona.w, escala)
    const hArriba = filas.arriba.h ? filas.arriba.h + sep : 0
    const hAbajo = filas.abajo.h ? filas.abajo.h + sep : 0
    const hLeyenda = leyenda ? leyenda + 32 * k : 0
    return { escala, filas, hArriba, hAbajo, hLeyenda, libre: zona.h - hArriba - hAbajo - hLeyenda }
  }
  let medida = medirTodo(1)
  for (let escala = 0.9; medida.libre < zona.h * 0.4 && escala >= 0.55; escala -= 0.1) medida = medirTodo(escala)
  const { filas, hArriba, hAbajo, hLeyenda } = medida

  const img = cajaConAspecto({ x: zona.x, y: zona.y + hArriba, w: zona.w, h: zona.h - hArriba - hAbajo - hLeyenda }, l.aspecto ?? 1)
  if (l.imagen) html += imagen(l.imagen, img.x, img.y, img.w, img.h, "render", `border-radius:${px(24 * k)};`, "cover")

  if (filas.arriba.h) html += dibujarFila(c, filas.arriba, zona.x, img.y - sep - filas.arriba.h, img, true, filas.size, filas.pad)
  if (filas.abajo.h) html += dibujarFila(c, filas.abajo, zona.x, img.y + img.h + sep, img, false, filas.size, filas.pad)

  if (pasos && l.imagen) {
    // El numero de cada paso, sobre el lugar donde ocurre. En una imagen
    // pequena los numeros tambien lo son.
    const lado = Math.min(64 * k, img.w / 5, img.h / 5)
    const marcas = conPunto
      .filter((x): x is { t: string; i: number; p: { x: number; y: number } } => Boolean(x.p))
      .map((x) => ({ i: x.i, px: img.x + x.p.x * img.w, py: img.y + x.p.y * img.h }))
    // Dos pasos en el mismo sitio se apartan y ninguno sale de la imagen; se
    // repite hasta que no se tocan (encajar uno en el borde puede juntarlo con
    // otro).
    for (let vuelta = 0; vuelta < 8; vuelta++) {
      let tocan = false
      for (let i = 1; i < marcas.length; i++)
        for (let j = 0; j < i; j++) {
          const a = marcas[j]
          const b = marcas[i]
          const d = Math.hypot(b.px - a.px, b.py - a.py)
          if (d < lado * 1.1) {
            tocan = true
            const ux = d ? (b.px - a.px) / d : vuelta % 2 ? 0 : 1
            const uy = d ? (b.py - a.py) / d : vuelta % 2 ? 1 : 0
            const empuje = (lado * 1.1 - d) / 2 + 1
            a.px -= ux * empuje
            a.py -= uy * empuje
            b.px += ux * empuje
            b.py += uy * empuje
          }
        }
      for (const it of marcas) {
        it.px = Math.min(Math.max(it.px, img.x + lado / 2), img.x + img.w - lado / 2)
        it.py = Math.min(Math.max(it.py, img.y + lado / 2), img.y + img.h - lado / 2)
      }
      if (!tocan) break
    }
    SOBRE_IMAGEN = true
    for (const it of marcas) {
      html += bloque(it.px - lado / 2, it.py - lado / 2, lado, lado, `background:${e.colores.acento};border-radius:${px(lado / 2)};border:${px(5 * k)} solid ${e.colores.fondo};`)
      html += texto(String(it.i + 1), it.px - lado / 2, it.py - lado * 0.47 * 0.6, lado, `font-size:${px(lado * 0.47)};line-height:1.15;font-weight:800;text-align:center;color:${sobre(e.colores.acento)};`)
    }
    SOBRE_IMAGEN = false
  }

  const yLeyenda = img.y + img.h + hAbajo + 32 * k
  if (pasos) html += leyendaPasos(c, etiquetas, zona.x, yLeyenda, zona.w, medida.escala).html
  else if (sinPunto.length) html += pastillas(c, sinPunto, zona.x, yLeyenda, zona.w, medida.escala).html

  html += numeracion(c, n, total, e.colores.textoSuave)
  if (l.rol === "portada") html += desliza(c, e.colores.textoSuave)
  return html
}

// ------------------------------------------------------------------ dataviz

/** Un icono en un circulo tenue del color de acento. */
function insignia(c: Ctx, url: string, x: number, y: number, lado: number) {
  return (
    bloque(x, y, lado, lado, `background:${conAlfa(c.e.colores.acento, 0.12)};border-radius:${px(lado / 2)};`) +
    imagen(url, x + lado * 0.22, y + lado * 0.22, lado * 0.56, lado * 0.56, "icono", "", "contain")
  )
}

/**
 * Un grafico que cabe en su zona, sea cual sea su contenido: se compone, se
 * mide lo que ocuparon de verdad sus textos e iconos y, si algo se sale de la
 * zona, se vuelve a componer mas pequeno. Calcular a mano cada caso (nombres de
 * tres lineas, seis barras, una cifra escrita como frase) siempre dejaba alguno
 * fuera; medir el resultado no deja ninguno.
 */
function grafico(c: Ctx, g: Grafico, x: number, y: number, w: number, h: number) {
  for (let escala = 1; ; escala *= 0.9) {
    const antes = CAJAS.length
    const html = graficoEn(c, g, x, y, w, h, escala)
    const cabe = CAJAS.slice(antes).every((b) => b.y >= y - 1 && b.y + b.h <= y + h + 1 && b.x >= x - 1 && b.x + b.w <= x + w + 1)
    if (cabe || escala < 0.45) return html
    CAJAS.length = antes
  }
}

function graficoEn(c: Ctx, g: Grafico, x: number, y: number, w: number, h: number, escala: number) {
  const { e } = c
  // Todas las medidas del grafico escalan juntas.
  const k = c.k * escala
  const items = g.items.slice(0, g.tipo === "cifras" ? 3 : 6)
  if (items.length === 0) return ""
  const numericos = items.map((i) => (typeof i.valor === "number" ? i.valor : parseFloat(String(i.valor).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0))
  const max = Math.max(...numericos.map(Math.abs), 1)
  const destacado = g.destacado ?? numericos.indexOf(Math.max(...numericos))
  const neutro = luminancia(e.colores.fondo) > 0.5 ? "#CFCFCF" : "#4A4A4A"
  const colorVar = (v?: string) => (v === "sube" ? e.colores.subida : v === "baja" ? e.colores.bajada : e.colores.texto)
  // El mismo icono en todas las categorias no distingue nada: sobra.
  if (items.length > 1 && new Set(items.map((i) => i.iconoUrl)).size === 1) items.forEach((i) => (i.iconoUrl = undefined))
  const conIconos = items.some((i) => i.iconoUrl)
  let html = ""

  if (g.tipo === "cifras") {
    // Cada tarjeta mide lo que lleva dentro (cifra, nombre y nota), y la cifra
    // se encoge si la zona no da: antes la tarjeta se encogia y la nota quedaba
    // fuera, tapada por la tarjeta siguiente. El icono va a la derecha.
    const gap = 30 * k
    const pad = 34 * k
    const sizeE = 32 * k
    const sizeN = 26 * k
    const reservaIcono = conIconos ? 130 * k : 0
    const anchoT = w - 100 * k - reservaIcono
    // Lo que ocupa una tarjeta sin su cifra: el nombre y la nota ya partidos.
    const fijo = (it: (typeof items)[number]) =>
      2 * pad + 14 * k + alto(it.etiqueta, sizeE, anchoT, 1.2, PESO_GRUESO) + 6 * k + (it.nota ? alto(it.nota, sizeN, anchoT, 1.2) : 0)
    const disponible = (h - gap * (items.length - 1)) / items.length
    const sizeMax = Math.min(150 * k, Math.max(36 * k, disponible - Math.max(...items.map(fijo))))
    const valores = items.map((it) => valorDe(g, it))
    // La cifra va siempre en una linea (encoge si no cabe) y se mide con el
    // alto de linea con que Canva la pinta (~1.15), no con el del CSS: medida
    // a 1, la cifra pisaba su nombre.
    const altos = items.map((it, i) => {
      const v = medirValor(valores[i], sizeMax, anchoT)
      const textos = alto(it.etiqueta, sizeE, anchoT, 1.2, PESO_GRUESO) + 6 * k + (it.nota ? alto(it.nota, sizeN, anchoT, 1.2) : 0)
      return { size: v.size, altoValor: v.h, h: 2 * pad + v.h + 14 * k + textos }
    })
    const total = altos.reduce((s, a) => s + a.h, 0) + gap * (items.length - 1)
    const fondoTarjeta = luminancia(e.colores.fondo) > 0.5 ? "#F2F2F2" : "#1C1C1C"

    // Si apiladas no caben, van lado a lado: mismas tarjetas, en una fila, con
    // el icono arriba. Si tampoco, se quitan primero las notas y despues la
    // ultima tarjeta, hasta que quepa: una tarjeta fuera de la zona pisa el pie.
    if (total > h && !cabenEnFila(c, g, items, valores, w, h, conIconos)) {
      if (items.some((i) => i.nota)) return graficoEn(c, { ...g, items: items.map((i) => ({ ...i, nota: undefined })) }, x, y, w, h, escala)
      if (items.length > 1) return graficoEn(c, { ...g, items: items.slice(0, -1) }, x, y, w, h, escala)
    }
    if (total > h && items.length > 1) {
      const wc = (w - gap * (items.length - 1)) / items.length
      const ladoIcono = conIconos ? 64 * k : 0
      // Con margen (0.9): justo en el limite, la cifra salta de linea.
      const medidas = valores.map((v) => medirValor(v, 110 * k, 0.9 * (wc - 60 * k)))
      const size = Math.min(...medidas.map((d) => d.size))
      const altoValor = Math.max(...medidas.map((d) => d.h))
      // El nombre y la nota se miden ya partidos al ancho de la tarjeta: en
      // una tarjeta estrecha ocupan varias lineas.
      const altoTextos = Math.max(
        ...items.map((it) => alto(it.etiqueta, 28 * k, wc - 60 * k, 1.2, PESO_GRUESO) + 6 * k + (it.nota ? alto(it.nota, 24 * k, wc - 60 * k, 1.2) : 0))
      )
      const hc = 2 * pad + altoValor + 14 * k + altoTextos + 20 * k + (ladoIcono ? ladoIcono + 18 * k : 0)
      const cy0 = y + Math.max(0, (h - hc) / 2)
      items.forEach((it, i) => {
        const cx = x + i * (wc + gap)
        html += bloque(cx, cy0, wc, hc, `background:${fondoTarjeta};border-radius:${px(24 * k)};`)
        let ty = cy0 + pad
        if (it.iconoUrl) html += imagen(it.iconoUrl, cx + 30 * k, ty, ladoIcono, ladoIcono, "icono", "", "contain")
        if (ladoIcono) ty += ladoIcono + 18 * k
        html += texto(valores[i], cx + 30 * k, ty, wc - 60 * k, `font-size:${px(size)};line-height:1;font-weight:800;color:${it.variacion ? colorVar(it.variacion) : i === destacado ? e.colores.acento : e.colores.texto};`)
        ty += altoValor + 14 * k
        html += texto(it.etiqueta, cx + 30 * k, ty, wc - 60 * k, `font-size:${px(28 * k)};line-height:1.2;font-weight:700;color:${e.colores.texto};`)
        ty += alto(it.etiqueta, 28 * k, wc - 60 * k, 1.2, PESO_GRUESO) + 6 * k
        if (it.nota) html += texto(it.nota, cx + 30 * k, ty, wc - 60 * k, `font-size:${px(24 * k)};line-height:1.2;color:${e.colores.textoSuave};`)
      })
      return html
    }

    let cy = y + Math.max(0, (h - total) / 2)
    items.forEach((it, i) => {
      const { size, h: alto1, altoValor } = altos[i]
      html += bloque(x, cy, w, alto1, `background:${fondoTarjeta};border-radius:${px(24 * k)};`)
      if (it.iconoUrl) {
        const lado = Math.min(100 * k, alto1 - 40 * k)
        html += imagen(it.iconoUrl, x + w - 50 * k - lado, cy + (alto1 - lado) / 2, lado, lado, "icono", "", "contain")
      }
      let ty = cy + pad
      html += texto(valores[i], x + 50 * k, ty, anchoT, `font-size:${px(size)};line-height:1;font-weight:800;color:${it.variacion ? colorVar(it.variacion) : i === destacado ? e.colores.acento : e.colores.texto};`)
      ty += altoValor + 14 * k
      html += texto(it.etiqueta, x + 50 * k, ty, anchoT, `font-size:${px(sizeE)};line-height:1.2;font-weight:700;color:${e.colores.texto};`)
      ty += alto(it.etiqueta, sizeE, anchoT, 1.2, PESO_GRUESO) + 6 * k
      if (it.nota) html += texto(it.nota, x + 50 * k, ty, anchoT, `font-size:${px(sizeN)};line-height:1.2;color:${e.colores.textoSuave};`)
      cy += alto1 + gap
    })
    return html
  }

  if (g.tipo === "columnas") {
    const hueco = w / items.length
    const anchoCol = hueco * 0.6
    const base = y + h - 70 * k
    items.forEach((it, i) => {
      const altoCol = Math.max(8 * k, (Math.abs(numericos[i]) / max) * (h - 170 * k))
      const cx = x + i * hueco + (hueco - anchoCol) / 2
      html += bloque(cx, base - altoCol, anchoCol, altoCol, `background:${i === destacado ? e.colores.acento : neutro};border-radius:${px(8 * k)} ${px(8 * k)} 0 0;`)
      const v = valorDe(g, it)
      html += texto(v, x + i * hueco, base - altoCol - 56 * k, hueco, `font-size:${px(tamanoQueCabe(v, 34 * k, hueco - 8 * k, PESO_GRUESO))};font-weight:800;text-align:center;color:${it.variacion ? colorVar(it.variacion) : e.colores.texto};`)
      html += texto(it.etiqueta, x + i * hueco, base + 14 * k, hueco, `font-size:${px(24 * k)};line-height:1.15;font-weight:700;text-align:center;color:${e.colores.texto};`)
    })
    return html
  }

  // barras y ranking: filas horizontales, el nombre encima de su barra y, si lo
  // hay, su icono delante. Cada fila mide lo que ocupa su nombre (puede ir en
  // dos lineas); si las filas no caben en la zona, todo encoge en proporcion.
  const rank = g.tipo === "ranking"
  const xb = x + (rank ? 80 * k : 0)
  // El icono mide lo que la linea del nombre: si fuera mas alto bajaria hasta
  // la fila de la barra y pisaria la cifra.
  const ladoIcono = conIconos ? 30 * k * 1.1 : 0
  const xEtiqueta = xb + (ladoIcono ? ladoIcono + 14 * k : 0)
  const anchoEtiqueta = x + w - xEtiqueta
  // A la derecha de la barra mas larga cabe su cifra en una sola linea: se
  // reserva el ancho del valor mas largo, sin pasar del 40 % del grafico.
  const valores = items.map((it) => valorDe(g, it))
  const reservaMax = w * 0.4
  const sizeValor = Math.min(...valores.map((v) => tamanoQueCabe(v, ajustar(v, 38 * k, 10), reservaMax - 24 * k, PESO_GRUESO)))
  const reserva = Math.max(...valores.map((v) => medir(v, sizeValor, PESO_GRUESO))) + 24 * k
  const wb = w - (rank ? 80 * k : 0) - reserva
  const filas = (escala: number) => {
    const sizeE = 30 * k * Math.max(0.75, escala)
    const barra = 52 * k * escala
    const alturas = items.map((it) => alto(it.etiqueta, sizeE, anchoEtiqueta, 1.15, PESO_GRUESO) + 10 * k + Math.max(barra, sizeValor * 1.15))
    const hueco = Math.min(40 * k, Math.max(14 * k, (h - alturas.reduce((s2, a2) => s2 + a2, 0)) / Math.max(1, items.length)))
    return { sizeE, barra, alturas, hueco, total: alturas.reduce((s2, a2) => s2 + a2, 0) + hueco * (items.length - 1) }
  }
  let f = filas(1)
  if (f.total > h) f = filas(Math.max(0.6, h / f.total))
  // Si ni encogidas caben, se muestran las filas que caben (el dato destacado
  // primero): una barra fuera de la lamina no se lee.
  let visibles = items.length
  while (visibles > 2 && f.alturas.slice(0, visibles).reduce((s2, a2) => s2 + a2, 0) + f.hueco * (visibles - 1) > h) visibles--
  let cy = y
  items.slice(0, visibles).forEach((it, i) => {
    const hEtiqueta = alto(it.etiqueta, f.sizeE, anchoEtiqueta, 1.15, PESO_GRUESO)
    if (rank) html += texto(String(i + 1), x, cy + hEtiqueta * 0.3, 70 * k, `font-size:${px(56 * k * Math.max(0.75, f.barra / (52 * k)))};line-height:1;font-weight:800;color:${i === destacado ? e.colores.acento : e.colores.textoSuave};`)
    if (it.iconoUrl) html += imagen(it.iconoUrl, xb, cy, Math.min(ladoIcono, f.sizeE * 1.1), Math.min(ladoIcono, f.sizeE * 1.1), "icono", "", "contain")
    html += texto(it.etiqueta, xEtiqueta, cy, anchoEtiqueta, `font-size:${px(f.sizeE)};line-height:1.15;font-weight:700;color:${e.colores.texto};`)
    const yBarra = cy + hEtiqueta + 10 * k
    const altoFila = Math.max(f.barra, sizeValor * 1.15)
    const wBarra = Math.max(10 * k, (Math.abs(numericos[i]) / max) * wb)
    html += bloque(xb, yBarra + (altoFila - f.barra) / 2, wBarra, f.barra, `background:${i === destacado ? e.colores.acento : neutro};border-radius:${px(6 * k)};`)
    html += texto(valores[i], xb + wBarra + 18 * k, yBarra + (altoFila - sizeValor * 1.15) / 2, reserva, `font-size:${px(sizeValor)};line-height:1;font-weight:800;color:${it.variacion ? colorVar(it.variacion) : e.colores.texto};`)
    cy += f.alturas[i] + f.hueco
  })
  return html
}

/** Si las tarjetas de cifras caben lado a lado en la zona (mismo calculo que al dibujarlas). */
function cabenEnFila(c: Ctx, g: Grafico, items: Grafico["items"], valores: string[], w: number, h: number, conIconos: boolean) {
  const { k } = c
  if (items.length < 2) return false
  const gap = 30 * k
  const pad = 34 * k
  const wc = (w - gap * (items.length - 1)) / items.length
  const altoValor = Math.max(...valores.map((v) => medirValor(v, 110 * k, 0.9 * (wc - 60 * k)).h))
  const altoTextos = Math.max(
    ...items.map((it) => alto(it.etiqueta, 28 * k, wc - 60 * k, 1.2, PESO_GRUESO) + 6 * k + (it.nota ? alto(it.nota, 24 * k, wc - 60 * k, 1.2) : 0))
  )
  return 2 * pad + altoValor + 14 * k + altoTextos + 20 * k + (conIconos ? 64 * k + 18 * k : 0) <= h
}

/** El valor de un dato como se lee: flecha de variacion, cifra y unidad. */
function valorDe(g: Grafico, it: Grafico["items"][number]) {
  const flecha = it.variacion === "sube" ? "▲ " : it.variacion === "baja" ? "▼ " : ""
  const t = formatearValor(it.valor)
  // Una "unidad" larga ("puntos criticos de fuga") no es una unidad: es texto
  // que ya dice la etiqueta, y junto a cada barra solo estorba.
  const unidad = g.unidad.length <= 10 ? g.unidad : ""
  return flecha + (unidad && !/[%$]/.test(t) ? `${t} ${unidad}` : t)
}

/**
 * El tamano de una cifra grande: en una linea, encogiendo hasta la mitad; si
 * aun asi no cabe (el agente escribio una frase como cifra), en dos lineas.
 * El alto va con el interlineado con que Canva la pinta (~1.15).
 */
function medirValor(v: string, max: number, ancho: number) {
  const unaLinea = tamanoQueCabe(v, ajustar(v, max, 10), ancho, PESO_GRUESO)
  if (unaLinea >= max * 0.5) return { size: unaLinea, h: unaLinea * lhReal(1) }
  const size = max * 0.5
  return { size, h: lineas(v, size, ancho, PESO_GRUESO).length * size * lhReal(1) }
}

/** Titulo (la conclusion del dato) y cuerpo, desde `y`. Devuelve donde acaban. */
function cabeceraDatos(c: Ctx, l: LaminaCompuesta, y: number, ancho: number, portada: boolean) {
  const { k, m, e } = c
  // En vertical la cabecera se queda con menos de la mitad del espacio util:
  // el resto es del grafico. En apaisado tiene su columna entera.
  const cab = cabeceraQueCabe({
    titulo: l.titulo,
    cuerpo: l.cuerpo,
    ancho,
    sizeT: ajustar(l.titulo, (portada ? 72 : 58) * k, 55),
    sizeC: 30 * k,
    lhT: 1.06,
    lhC: 1.3,
    gap: 20 * k,
    maxH: (finUtil(c, l) - y) * (c.apaisado ? 1 : 0.45),
  })
  let html = texto(l.titulo, m, y, ancho, `font-size:${px(cab.sizeT)};line-height:1.06;font-weight:800;color:${e.colores.texto};`)
  y += cab.hT + 20 * k
  if (cab.cuerpo) {
    html += texto(cab.cuerpo, m, y, ancho, `font-size:${px(cab.sizeC)};line-height:1.3;color:${e.colores.textoSuave};`)
    y += cab.hC + 40 * k
  } else y += 30 * k
  return { html, y }
}

/**
 * Data-viz. El grafico manda; el apoyo visual son iconos del asunto: el de la
 * lamina arriba, en una insignia, y los de las categorias junto a su dato. Una
 * lamina sin grafico lleva su icono en grande.
 */
function dataviz(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, k, m, e } = c
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  let html = ""

  const cabeza = logoArriba(c)
  html += cabeza.html
  let yT = m + 50 * k + cabeza.baja
  if (l.icono) {
    const lado = (portada ? 120 : 100) * k
    html += insignia(c, l.icono, m, m + cabeza.baja, lado)
    yT = m + cabeza.baja + lado + 36 * k
  }
  const anchoTit = c.apaisado ? W * 0.47 - m - 40 * k : W - 2 * m
  const cab = cabeceraDatos(c, l, yT, anchoTit, portada)
  html += cab.html
  const y = cab.y

  const zona = c.apaisado
    ? { x: W * 0.47, y: m + 60 * k, w: W * 0.53 - m, h: finUtil(c, l) - m - 60 * k }
    : { x: m, y: y + 20 * k, w: W - 2 * m, h: finUtil(c, l) - y - 20 * k }
  if (l.grafico) html += grafico(c, l.grafico, zona.x, zona.y, zona.w, zona.h)
  else if (l.icono && zona.h > 200 * k) {
    const lado = Math.min(zona.w * 0.6, zona.h * 0.85)
    html += insignia(c, l.icono, zona.x + (zona.w - lado) / 2, zona.y + (zona.h - lado) / 2, lado)
  }
  html += pieDeDatos(c, l)
  html += numeracion(c, n, total, e.colores.textoSuave)
  if (l.rol === "portada" && !textoPie(l)) html += desliza(c, e.colores.textoSuave)
  return html
}

// ---------------------------------------------------------------- infodatos

/**
 * Infografia de datos: la lectura de Data-viz con una imagen clave generada.
 * El titulo es la conclusion del dato; la imagen (cuadrada) se pone al lado de
 * las cifras, o al lado del dato destacado con el grafico debajo.
 */
function infodatos(c: Ctx, l: LaminaCompuesta, n: number, total: number) {
  const { W, k, m, e } = c
  if (l.rol === "cierre") return cierre(c, l)
  const portada = l.rol === "portada" || l.rol === "unica"
  const anchoTit = c.apaisado ? W * 0.47 - m - 40 * k : W - 2 * m
  const cabeza = logoArriba(c)
  const cab = cabeceraDatos(c, l, m + 50 * k + cabeza.baja, anchoTit, portada)
  let html = cabeza.html + cab.html
  const g = l.grafico
  const radio = `border-radius:${px(28 * k)};`
  const conImagen = (x: number, y: number, lado: number) =>
    l.imagen ? imagen(l.imagen, x, y, lado, lado, "imagen clave", radio) : ""

  if (c.apaisado) {
    const lado = Math.min(anchoTit, finUtil(c, l) - cab.y)
    html += conImagen(m, cab.y, lado)
    if (g) html += grafico(c, g, W * 0.47, m + 60 * k, W * 0.53 - m, finUtil(c, l) - m - 60 * k)
  } else {
    const zonaW = W - 2 * m
    const disponible = finUtil(c, l) - cab.y
    if (!g) {
      const lado = Math.min(zonaW, disponible)
      html += conImagen(m + (zonaW - lado) / 2, cab.y, lado)
    } else if (g.tipo === "cifras") {
      // La imagen a la izquierda y las cifras a su lado, a la misma altura.
      const lado = Math.min(zonaW * 0.46, disponible)
      html += conImagen(m, cab.y, lado)
      html += grafico(c, g, m + lado + 36 * k, cab.y, zonaW - lado - 36 * k, Math.max(lado, disponible))
    } else {
      // La imagen junto al dato destacado, y el grafico completo debajo.
      const lado = Math.min(zonaW * 0.4, disponible * 0.42)
      html += conImagen(m, cab.y, lado)
      const items = g.items
      const numericos = items.map((i) => (typeof i.valor === "number" ? i.valor : parseFloat(String(i.valor).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0))
      const d = items[g.destacado ?? numericos.indexOf(Math.max(...numericos))] ?? items[0]
      if (d) {
        const xD = m + lado + 40 * k
        const anchoD = zonaW - lado - 40 * k
        const valor = valorDe(g, d)
        // Cifra y nombre caben a la altura de la imagen: encogen juntos si no.
        let f = 1
        let v = medirValor(valor, 96 * k, anchoD)
        let altoNombre = alto(d.etiqueta, 30 * k, anchoD, 1.2, PESO_GRUESO)
        while (v.h + 14 * k + altoNombre > lado && f > 0.4) {
          f *= 0.9
          v = medirValor(valor, 96 * k * f, anchoD)
          altoNombre = alto(d.etiqueta, 30 * k * f, anchoD, 1.2, PESO_GRUESO)
        }
        const yD = cab.y + Math.max(0, (lado - v.h - 14 * k - altoNombre) / 2)
        html += texto(valor, xD, yD, anchoD, `font-size:${px(v.size)};line-height:1;font-weight:800;color:${d.variacion === "baja" ? e.colores.bajada : e.colores.acento};`)
        html += texto(d.etiqueta, xD, yD + v.h + 14 * k, anchoD, `font-size:${px(30 * k * f)};line-height:1.2;font-weight:700;color:${e.colores.texto};`)
      }
      const yG = cab.y + lado + 40 * k
      html += grafico(c, g, m, yG, zonaW, finUtil(c, l) - yG)
    }
  }
  html += pieDeDatos(c, l)
  html += numeracion(c, n, total, e.colores.textoSuave)
  if (l.rol === "portada" && !textoPie(l)) html += desliza(c, e.colores.textoSuave)
  return html
}

// -------------------------------------------------------------------- todo

const COMPONER: Record<TipoEstilo, (c: Ctx, l: LaminaCompuesta, n: number, total: number) => string> = {
  fotografico,
  ilustracion,
  infografia,
  dataviz,
  infodatos,
}

/**
 * Revisa las cajas de texto de una lamina: ninguna puede pisar a otra ni salir
 * del lienzo. Las cajas son las medidas con la fuente real, asi que lo que aqui
 * no choca tampoco choca en Canva.
 */
function revisar(cajas: typeof CAJAS, W: number, H: number): string[] {
  const problemas: string[] = []
  const corto = (t: string) => (t.length > 28 ? `${t.slice(0, 28)}…` : t)
  for (const a of cajas.filter((x) => x.tipo !== "imagen")) {
    if (a.x < -1 || a.y < -1 || a.x + a.w > W + 1 || a.y + a.h > H + 1) problemas.push(`"${corto(a.t)}" se sale del lienzo`)
  }
  for (let i = 0; i < cajas.length; i++)
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i]
      const b = cajas[j]
      // Imagen con imagen no importa; un numero de paso va sobre la imagen.
      if (a.tipo !== "texto" && b.tipo !== "texto") continue
      if ((a.tipo === "sobreImagen" && b.tipo === "imagen") || (b.tipo === "sobreImagen" && a.tipo === "imagen")) continue
      const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (dx > 2 && dy > 2) problemas.push(`"${corto(a.t)}" pisa a "${corto(b.t)}"`)
    }
  return problemas
}

/** Los solapes que encontro la ultima composicion (vacio si ninguno). */
let SOLAPES: string[] = []
export const solapesDeLaUltimaPieza = () => [...SOLAPES]
/** Las cajas (textos, imagenes) de la ultima lamina compuesta, para depurar. */
export const cajasDeLaUltimaLamina = () => CAJAS.map((c) => ({ ...c }))

export function componerHTML(opciones: {
  tipo: TipoEstilo
  estilo: EstiloPlantilla
  ancho: number
  alto: number
  laminas: LaminaCompuesta[]
  logo: string | null
  logoOscuro?: string | null
  titulo: string
}): string {
  const { estilo: e } = opciones
  const W = opciones.ancho || 1080
  const H = opciones.alto || 1350
  const k = W / 1080
  LIENZO = { W, H }
  FUENTE = e.fuente
  const ctx: Ctx = {
    W,
    H,
    k,
    m: Math.round(80 * k),
    apaisado: W > H * 1.15,
    e,
    logo: opciones.logo,
    logoOscuro: opciones.logoOscuro ?? null,
    oscuro: luminancia(e.colores.fondo) < 0.5,
  }
  const total = opciones.laminas.length
  SOLAPES = []
  const paginas = opciones.laminas.map((l, i) => {
    CAJAS = []
    const cuerpo = COMPONER[opciones.tipo](ctx, l, i + 1, total)
    SOLAPES.push(...revisar(CAJAS, W, H).map((p) => `Lámina ${i + 1}: ${p}`))
    return `<section data-document-role="page" data-label="${esc(l.rol === "portada" ? "Portada" : l.rol === "cierre" ? "Cierre" : `Lámina ${i + 1}`)}" style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${e.colores.fondo};font-family:'${e.fuente}',Verdana,sans-serif;">${cuerpo}</section>`
  })
  const fuente = e.fuente.replace(/ /g, "+")
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(opciones.titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=${fuente}:wght@400;700;800&display=swap" rel="stylesheet">
<style>body{margin:0}</style></head><body>${paginas.join("\n")}</body></html>`
}
