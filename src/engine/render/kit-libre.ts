import { llamarClaude, parsearJSONDeClaude, type Bloque } from "../claude/messages"
import { cssDeFiguras, textoDeFigura } from "../marca/figuras"
import { archivosComoDatos, type KitCargado } from "../marca/kit"
import { cssDeFuentes, FORMATOS, paginaDeLamina, revisarHtmlLibre } from "../marca/kit-modelo"
import { cargarPieza, piezasDelKit, piezasParecidas, type PiezaDeEjemplo } from "../marca/kit-piezas"
import { agregado, quitado } from "./kit-maqueta"
import { dibujarLaminas, type LaminaDibujada } from "./navegador"
import type { Slide } from "./templates"

/**
 * El diseñador libre: dibuja el carrusel entero como lo haria la persona que
 * diseña la marca, sin plantillas. Opus escribe el HTML de todas las laminas
 * mirando piezas que la marca ya publico (su HTML y sus laminas), con el
 * sistema del kit (colores, fuentes, logos) y las fotos elegidas. Cada lamina
 * puede construir lo que su contenido pida: una tabla, una escalera, una
 * maqueta de interfaz, un grafico. Las figuras y plantillas del kit no lo
 * limitan; son el respaldo.
 *
 * Lo que no se negocia lo comprueba el codigo: el texto es el del guion (sin
 * cifras nuevas ni texto perdido), nada se sale ni choca, la letra no baja del
 * minimo del kit, nada se ejecuta ni se carga de fuera. Un critico mira el
 * carrusel dibujado al lado de las piezas de la marca, y el diseñador corrige lo
 * medido y lo que pide el critico.
 *
 * Va por pasos sueltos (primerDiseno, medirDiseno, criticarDiseno,
 * corregirDiseno) porque cada llamada de diseño tarda de 2 a 4 minutos: el
 * carrusel de una pasada del servidor los encadena entre pasadas (ver
 * kit-libre-pasos.ts). disenarLibre los encadena de una vez, para probar.
 */

export const MODELO_DISENO = "claude-opus-5-5"
export const MAX_RONDAS_LIBRE = 2
/** Piezas de la marca que ve el diseñador, y cuantas de ellas ve el critico. */
const PIEZAS_DISENO = 3
const PIEZAS_CRITICO = 2
/** A partir de este puntaje del critico (0 a 10) no se corrige mas. */
export const PUNTAJE_BUENO = 8
/** Palabras que el diseño puede sumar por lamina: rotulos ("Antes", "No cuenta", "Criterio de la marca"). */
const PALABRAS_DE_DISENO = 14
/** Lo que puede perder una lamina del texto del guion: conectores o una muletilla, no una idea. */
const PERDIDA_TOLERADA = 0.2

export type GuionLibre = {
  slides: Slide[]
  antetitulo: string
  cierre: { titulo: string; texto: string; tipo: string | null } | null
}

/** Una foto elegida para una lamina (1 es la portada), como data URI. */
export type FotoLibre = { clave: string; lamina: number; datos: string; descripcion: string }

/** Lo que el codigo midio de un diseño: lo dibujado y lo que falla, por lamina (0 es el documento). */
export type Medida = { dibujadas: LaminaDibujada[]; fallos: Map<number, string[]>; graves: number }

export type Critica = { puntaje: number; cambios: { lamina: number; que: string }[] }

export type DisenoLibre = {
  dibujadas: LaminaDibujada[]
  /** El HTML de cada lamina, listo para el navegador (con sus archivos dentro). */
  paginas: string[]
  /** La fuente editable: el estilo y las laminas, con las marcas {{a:...}}. */
  fuente: string
  rondas: number
  puntaje: number | null
  piezas: string[]
  avisos: string[]
}

const SISTEMA_DISENO = `Eres quien diseña los carruseles de Instagram de la marca. Recibes un carrusel ya escrito y aprobado, el sistema visual de la marca y piezas que la marca ya publicó, con su HTML. Diseñas cada lámina en HTML y CSS como las diseña la marca: misma familia visual, mismo marco, mismo oficio, pero construyendo para ESTE contenido.

CÓMO DISEÑAS
- Mira primero las piezas de la marca: cómo arman el marco (logo, contador, puntos), cómo alternan fondos, cómo resaltan, cuánto aire dejan y, sobre todo, cómo construyen dentro de cada lámina lo que el texto dice: tablas, barras, escaleras de niveles, tarjetas, pastillas, checklists, flujos con flechas, maquetas de interfaz (un chat, una terminal, un comentario), cuadrículas. Ese es el nivel.
- Cada lámina del medio lleva su construcción cuando el contenido tiene forma (cifras que se comparan, pasos, opciones, un antes y un después, una lista de cosas, una cita, un comando): la inventas para ese contenido, con HTML y CSS (o SVG en línea). Una lámina de idea pura puede ser tipográfica o llevar su foto.
- Varía la composición a lo largo del carrusel como lo hacen las piezas: fondos alternados, una lámina de golpe, fotos en sitios distintos.
- La portada frena el scroll; el cierre pide una sola acción, como los cierres de las piezas.

EL TEXTO ES EL DEL GUION
- Cada lámina usa el texto de SU lámina del guion: título, cuerpo, puntos, figura sugerida. Puedes partirlo en jerarquía (un dato a grande, su explicación debajo), pasar puntos a celdas o pasos, y resaltar palabras que ya están (las marcadas con *asteriscos* van resaltadas; quita los asteriscos).
- Puedes sumar rótulos cortos de diseño como los de las piezas (un antetítulo, "Antes" y "Después", el nombre de una columna, "Ejemplo hipotético", la etiqueta del criterio de la marca). Nunca una afirmación, un dato, un nombre ni una cifra que no esté en el guion.
- Todo el texto de la lámina tiene que estar: ninguna cifra, condición, atribución ("según...") ni fuente se queda fuera.

REGLAS TÉCNICAS
- Responde con un documento HTML sin <html>, <head> ni <body>: primero UN <style> con todo el CSS, después una <section data-lamina="N" data-seguro="x1,y1,x2,y2"> por lámina, en orden, de 1080x1350 px. data-seguro es el área donde va todo el texto (por ejemplo 60,60,1020,1290). No pongas una <section> dentro de otra.
- Los archivos van como marcas: {{a:papel}} para los logos del kit y {{a:fotoN}} para las fotos de la pieza (en src="" o en url()). Nada más se carga: ni enlaces, ni @import, ni @font-face, ni url(http...), ni scripts, ni eventos, ni <button>, <input> o <form> (una maqueta de botón se hace con un <span>).
- Usa las familias de fuente del kit tal cual se nombran.
- El contador y los puntos de paginación llevan data-paginacion. Una palabra gigante de fondo que se sale a propósito lleva data-adorno.
- Ningún texto por debajo de la letra mínima del kit. Ningún texto se sale de su área segura ni se monta sobre otro texto. El texto y el logo van por delante de las fotos.
- Sin texto alrededor del documento.`

/** Lo que dice una lamina del guion, y de donde puede salir lo que se lee en ella. */
function textoDeLamina(g: GuionLibre, i: number): { propio: string; permitido: string; guion: string } {
  if (i === g.slides.length) {
    const c = g.cierre ? `${g.cierre.titulo} ${g.cierre.texto}` : ""
    return { propio: c, permitido: c, guion: `CIERRE (CTA: ${g.cierre?.tipo ?? "sin tipo"})\n  título: ${g.cierre?.titulo ?? ""}\n  cuerpo: ${g.cierre?.texto ?? ""}` }
  }
  const s = g.slides[i]
  if (s.type === "photo_hook") {
    const hook = s.hook ?? ""
    return {
      propio: hook,
      permitido: `${hook} ${g.antetitulo}`,
      guion: `LÁMINA ${i + 1} (portada)\n  antetítulo de la pieza: ${g.antetitulo || "(ninguno)"}\n  gancho: ${hook}`,
    }
  }
  const figura = s.figura ? textoDeFigura(s.figura) : ""
  const propio = [s.lead, s.title, s.body, ...(s.items ?? []), figura].filter(Boolean).join(" ")
  const guion = [
    `LÁMINA ${i + 1}${s.tipoLamina ? ` (${s.tipoLamina})` : ""}`,
    i === 0 ? `  antetítulo de la pieza: ${g.antetitulo || "(ninguno)"}` : "",
    s.lead ? `  rótulo: ${s.lead}` : "",
    s.title ? `  título: ${s.title}` : "",
    s.body ? `  cuerpo: ${s.body}` : "",
    s.items?.length ? `  puntos:\n${s.items.map((t) => `    - ${t}`).join("\n")}` : "",
    s.figura ? `  figura que sugirió quien escribió (sus datos son del guion; dibújala a tu manera): ${JSON.stringify(s.figura)}` : "",
  ]
    .filter(Boolean)
    .join("\n")
  return { propio, permitido: i === 0 ? `${propio} ${g.antetitulo}` : propio, guion }
}

/**
 * Lo que la lamina dibujada cambio del guion. Las cifras de una o dos que no
 * estan (la numeracion de unos pasos: 1, 2, 3) no cuentan; cualquier otra, si.
 */
export function cambiosDeTexto(fuente: { propio: string; permitido: string }, leido: string): string[] {
  const a = agregado(fuente.permitido, leido)
  const q = quitado(fuente.propio, leido)
  const cifras = a.cifras.filter((c) => !(c.length <= 2 && Number(c) <= 20))
  return [
    cifras.length ? `agrega cifras que no están en el guion (${cifras.join(", ")})` : "",
    a.palabras.length > PALABRAS_DE_DISENO ? `agrega demasiado texto propio (${a.palabras.slice(0, 8).join(", ")}...)` : "",
    q.cifras.length ? `le faltan cifras del guion (${q.cifras.join(", ")})` : "",
    q.parteDePalabras > PERDIDA_TOLERADA ? `le falta el ${Math.round(q.parteDePalabras * 100)} % del texto del guion` : "",
  ].filter(Boolean)
}

/** Las laminas que llevan foto: portada, cierre y, hasta la proporcion del kit, las del medio sin figura. */
export function laminasConFoto(g: GuionLibre, fotosPorCarrusel: number): number[] {
  const total = g.slides.length + (g.cierre ? 1 : 0)
  const objetivo = Math.max(2, Math.round((fotosPorCarrusel * total) / 7))
  const medio = g.slides
    .map((s, i) => ({ s, n: i + 1 }))
    .filter(({ s, n }) => n > 1 && s.type === "text" && !s.figura && !s.items?.length)
    .map(({ n }) => n)
  // Repartidas: ni todas juntas ni pegadas a la portada.
  const elegidas = medio.filter((_, k) => k % 2 === 0).slice(0, Math.max(0, objetivo - 2))
  return [1, ...elegidas, ...(g.cierre ? [total] : [])]
}

type Partes = { estilo: string; laminas: Map<number, string> }

/** El documento del diseñador en su estilo y sus laminas, por numero. */
function partes(texto: string): Partes {
  const limpio = texto.replace(/^```(?:html)?\s*|```\s*$/g, "")
  const estilo = [...limpio.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n")
  const laminas = new Map<number, string>()
  for (const m of limpio.matchAll(/<section\b[^>]*\bdata-lamina\s*=\s*["']?(\d+)[^>]*>[\s\S]*?<\/section>/gi))
    laminas.set(Number(m[1]), m[0])
  return { estilo, laminas }
}

const unir = (p: Partes) =>
  `<style>\n${p.estilo}\n</style>\n${[...p.laminas.entries()].sort((a, b) => a[0] - b[0]).map(([, html]) => html).join("\n")}`

/** Una imagen reducida para el prompt. */
async function reducida(datos: Buffer, ancho: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default
  return sharp(datos).resize({ width: ancho, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
}

const deDataUri = (uri: string) => Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64")

/** Las laminas dibujadas en una tira, para el critico y para las correcciones. */
export async function tira(dibujadas: LaminaDibujada[]): Promise<Buffer> {
  const sharp = (await import("sharp")).default
  const W = 360
  const H = 450
  const G = 10
  const porFila = 4
  const filas = Math.ceil(dibujadas.length / porFila)
  const capas = await Promise.all(
    dibujadas.map(async (d, i) => ({
      input: await sharp(d.png).resize(W, H).toBuffer(),
      left: G + (i % porFila) * (W + G),
      top: G + Math.floor(i / porFila) * (H + G),
    }))
  )
  return sharp({ create: { width: G + porFila * (W + G), height: G + filas * (H + G), channels: 3, background: "#808080" } })
    .composite(capas)
    .jpeg({ quality: 82 })
    .toBuffer()
}

/** Cache de las piezas de ejemplo por kit: son las mismas para todos sus carruseles. */
const piezasEnMemoria = new Map<string, Promise<(PiezaDeEjemplo & { html: string; hoja: Buffer | null })[]>>()

function piezasConHtml(kc: KitCargado) {
  const clave = `${kc.kit.id}:${kc.kit.updated_at}`
  let p = piezasEnMemoria.get(clave)
  if (!p) {
    p = Promise.all(piezasDelKit(kc).map(async (x) => ({ ...x, ...(await cargarPieza(kc, x.papel)) })))
    p.catch(() => piezasEnMemoria.delete(clave))
    piezasEnMemoria.set(clave, p)
  }
  return p
}

// --------------------------------------------------------------- contexto

/** Todo lo que necesitan los pasos del diseño de una pieza; se arma en cada pasada. */
export type ContextoLibre = {
  accountId: string
  kc: KitCargado
  fotos: FotoLibre[]
  modelo: string
  esfuerzo: "low" | "medium" | "high"
  total: number
  textos: ReturnType<typeof textoDeLamina>[]
  minimo: number
  elegidas: (PiezaDeEjemplo & { html: string; hoja: Buffer | null })[]
  archivos: Record<string, string>
  papeles: string[]
  encargo: string
  bloques: Bloque[]
}

export async function contextoLibre(opciones: {
  accountId: string
  kc: KitCargado
  guion: GuionLibre
  fotos: FotoLibre[]
  modelo?: string
  esfuerzo?: "low" | "medium" | "high"
}): Promise<ContextoLibre> {
  const { accountId, kc, guion, fotos, modelo = MODELO_DISENO, esfuerzo = "medium" } = opciones
  const total = guion.slides.length + (guion.cierre ? 1 : 0)
  const textos = Array.from({ length: total }, (_, i) => textoDeLamina(guion, i))
  const minimo = kc.kit.sistema.reglas.letra_minima
  const todas = await piezasConHtml(kc)
  if (!todas.length) throw new Error("El kit no tiene piezas de ejemplo para el diseño libre.")
  const elegidas = piezasParecidas(todas, textos.map((t) => t.propio).join(" "), PIEZAS_DISENO) as typeof todas
  const archivos = await archivosComoDatos(kc)
  const logos = kc.archivos.filter((a) => a.tipo === "logo").map((a) => a.papel)
  const familias = [
    ...new Set(kc.archivos.filter((a) => a.tipo === "fuente").map((a) => `${String(a.meta.familia)} ${String(a.meta.peso ?? 400)}`)),
  ]

  const bloques: Bloque[] = []
  for (const [k, p] of elegidas.entries()) {
    if (p.hoja)
      bloques.push(
        { tipo: "texto", texto: `Pieza de la marca ${k + 1}: «${p.titulo}», sus láminas:` },
        { tipo: "imagen", mime: "image/jpeg", datos: await reducida(p.hoja, 2000) }
      )
    bloques.push({ tipo: "texto", texto: `Su HTML:\n${p.html}` })
  }
  for (const f of fotos)
    bloques.push(
      { tipo: "texto", texto: `Foto {{a:${f.clave}}}, para la lámina ${f.lamina}: ${f.descripcion}` },
      { tipo: "imagen", mime: "image/jpeg", datos: await reducida(deDataUri(f.datos), 512) }
    )
  const encargo = `EL SISTEMA DE LA MARCA
${JSON.stringify(kc.kit.sistema)}
Letra mínima: ${minimo} px.
Fuentes cargadas (familia y peso): ${familias.join(", ")}.
Logos: ${logos.map((l) => `{{a:${l}}}`).join(", ")} (logo_claro va sobre fondo claro, logo_oscuro sobre oscuro, logo_acento sobre el color de acento).
CSS común del kit (ya está cargado; puedes usar sus variables y clases o escribir las tuyas):
${kc.kit.css}

Arriba van ${elegidas.length} piezas que la marca publicó (sus láminas y su HTML)${fotos.length ? " y las fotos elegidas para esta pieza" : ""}.

EL CARRUSEL QUE DISEÑAS (${total} láminas)
${textos.map((t) => t.guion).join("\n\n")}

Diseña las ${total} láminas.`
  return {
    accountId,
    kc,
    fotos,
    modelo,
    esfuerzo,
    total,
    textos,
    minimo,
    elegidas,
    archivos,
    papeles: [...logos, ...fotos.map((f) => f.clave)],
    encargo,
    bloques,
  }
}

async function pedirDiseno(ctx: ContextoLibre, prompt: string, bloques: Bloque[], timeoutMs: number): Promise<Partes> {
  const r = await llamarClaude({
    accountId: ctx.accountId,
    model: ctx.modelo,
    esfuerzo: ctx.esfuerzo,
    system: SISTEMA_DISENO,
    prompt,
    bloques,
    maxTokens: 48_000,
    timeoutMs,
  })
  if (!r.ok) throw new Error(`El diseñador no respondió: ${r.error}`)
  const p = partes(r.texto)
  if (!p.laminas.size) throw new Error("El diseñador no devolvió ninguna lámina.")
  return p
}

// ------------------------------------------------------------------ pasos

/** El primer diseño del carrusel entero: su fuente. */
export async function primerDiseno(ctx: ContextoLibre, timeoutMs: number): Promise<string> {
  return unir(await pedirDiseno(ctx, ctx.encargo, ctx.bloques, timeoutMs))
}

/** Las paginas de cada lamina, con sus logos y fotos dentro, listas para el navegador. */
export function paginasDeFuente(ctx: Pick<ContextoLibre, "kc" | "fotos" | "archivos" | "total">, fuente: string): string[] {
  const p = partes(fuente)
  return Array.from({ length: ctx.total }, (_, i) => {
    let seccion = p.laminas.get(i + 1) ?? `<section data-lamina="${i + 1}"></section>`
    for (const f of ctx.fotos) seccion = seccion.replaceAll(`{{a:${f.clave}}}`, f.datos)
    seccion = seccion.replace(/\{\{a:(\w+)\}\}/g, (_, k: string) => ctx.archivos[k] ?? "")
    return paginaDeLamina(
      `${ctx.kc.kit.css}\n${cssDeFiguras(ctx.kc.kit.parciales)}\n${p.estilo}`,
      cssDeFuentes(ctx.kc.archivos, ctx.archivos),
      seccion,
      "carrusel_4x5"
    )
  })
}

/** Dibuja el diseño y mide lo que no se negocia: seguridad, texto fiel, nada fuera ni encima, letra minima. */
export async function medirDiseno(ctx: ContextoLibre, fuente: string): Promise<Medida> {
  const { ancho, alto } = FORMATOS.carrusel_4x5
  const p = partes(fuente)
  const fallos = new Map<number, string[]>()
  const agregar = (n: number, que: string) => fallos.set(n, [...(fallos.get(n) ?? []), que])
  for (const e of revisarHtmlLibre(fuente, ctx.papeles)) agregar(0, e)
  for (let n = 1; n <= ctx.total; n++) if (!p.laminas.has(n)) agregar(n, "falta esta lámina en el documento")
  const dibujadas = await dibujarLaminas(paginasDeFuente(ctx, fuente), { ancho, alto, libre: { letraMinima: ctx.minimo } })
  dibujadas.forEach((d, i) => {
    for (const pr of d.problemas)
      agregar(
        i + 1,
        `${pr.hueco}: ${pr.tipo === "choca" ? `choca ${pr.detalle}` : pr.tipo === "se_sale" ? `se sale del área segura (${pr.detalle})` : pr.tipo === "letra_pequena" ? `letra pequeña (${pr.detalle})` : "no entra en su caja"}`
      )
    for (const c of cambiosDeTexto(ctx.textos[i], d.texto ?? "")) agregar(i + 1, `texto: ${c}`)
  })
  return { dibujadas, fallos, graves: [...fallos.values()].reduce((s, f) => s + f.length, 0) }
}

/** Lo que hay que cambiar: lo medido y, si lo hay, lo que pidio el critico. */
export function cambiosPedidos(medida: Medida, critica: Critica | null): Map<number, string[]> {
  const cambios = new Map<number, string[]>(medida.fallos)
  for (const c of critica?.cambios ?? []) cambios.set(c.lamina, [...(cambios.get(c.lamina) ?? []), `crítico: ${c.que}`])
  return cambios
}

/** El diseñador corrige lo pedido y devuelve la fuente nueva (solo cambian las laminas que toca). */
export async function corregirDiseno(
  ctx: ContextoLibre,
  fuente: string,
  cambios: Map<number, string[]>,
  dibujadas: LaminaDibujada[],
  timeoutMs: number
): Promise<string> {
  const actual = partes(fuente)
  const lista = [...cambios.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, qs]) => `${n === 0 ? "En todo el documento" : `Lámina ${n}`}:\n${qs.map((q) => `  - ${q}`).join("\n")}`)
    .join("\n")
  const prompt = `${ctx.encargo}

TU DISEÑO ACTUAL
${fuente}

Así se ve dibujado (la imagen de arriba) y esto es lo que hay que cambiar:
${lista}

Corrige solo eso, sin romper lo que ya funciona. Responde con el <style> completo y solo las <section> que cambias (con su data-lamina).`
  const revisado = await pedirDiseno(
    ctx,
    prompt,
    [...ctx.bloques, { tipo: "texto", texto: "Tu diseño actual, dibujado:" }, { tipo: "imagen", mime: "image/jpeg", datos: await tira(dibujadas) }],
    timeoutMs
  )
  return unir({ estilo: revisado.estilo || actual.estilo, laminas: new Map([...actual.laminas, ...revisado.laminas]) })
}

const SISTEMA_CRITICO = `Eres director de arte de la marca. Comparas un carrusel recién diseñado con piezas que la marca ya publicó y dices, con ojo de diseñador, qué lo aleja de ese nivel. No reescribes textos ni opinas del contenido: solo del diseño. Respondes solo con JSON.`

/** El critico: puntua el carrusel contra las piezas de la marca y dice que cambiar, lamina por lamina. */
export async function criticarDiseno(ctx: ContextoLibre, dibujadas: LaminaDibujada[]): Promise<Critica | null> {
  const bloques: Bloque[] = []
  for (const p of ctx.elegidas.slice(0, PIEZAS_CRITICO))
    if (p.hoja)
      bloques.push(
        { tipo: "texto", texto: `Pieza publicada de la marca: «${p.titulo}»` },
        { tipo: "imagen", mime: "image/jpeg", datos: await reducida(p.hoja, 2000) }
      )
  bloques.push(
    { tipo: "texto", texto: "El carrusel nuevo, láminas en orden (de izquierda a derecha y de arriba abajo):" },
    { tipo: "imagen", mime: "image/jpeg", datos: await tira(dibujadas) }
  )
  const r = await llamarClaude({
    accountId: ctx.accountId,
    model: ctx.modelo,
    esfuerzo: "low",
    system: SISTEMA_CRITICO,
    prompt: `Lo que dice cada lámina (para entender qué tendría que enseñar su diseño):
${ctx.textos.map((t) => t.guion).join("\n\n")}

Compara el carrusel nuevo con las piezas de la marca: jerarquía, aire, composición, si cada lámina del medio construye algo que demuestre lo que dice (como en las piezas) o se queda en texto, variedad entre láminas, uso de fotos, marco y detalles. Puntúa de 0 a 10 cuánto se acerca al nivel de las piezas. Di solo los cambios que más lo acercarían, concretos y por lámina (como mucho uno o dos por lámina, y solo en las que lo necesitan).

Responde con este JSON:
{"puntaje": <0-10>, "cambios": [{"lamina": <número>, "que": "<qué cambiar en el diseño, concreto>"}]}`,
    bloques,
    maxTokens: 8000,
    timeoutMs: 120_000,
  })
  if (!r.ok) return null
  try {
    const d = parsearJSONDeClaude(r.texto) as { puntaje?: number; cambios?: { lamina?: number; que?: string }[] }
    return {
      puntaje: Math.max(0, Math.min(10, Number(d.puntaje) || 0)),
      cambios: (d.cambios ?? [])
        .filter((c) => Number(c.lamina) >= 1 && Number(c.lamina) <= dibujadas.length && typeof c.que === "string" && c.que.trim())
        .map((c) => ({ lamina: Number(c.lamina), que: String(c.que).slice(0, 400) }))
        .slice(0, 12),
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------- todo de una vez

/**
 * El diseño entero en una sola llamada larga: primer diseño, medida, critico y
 * hasta MAX_RONDAS_LIBRE correcciones. Para probar en local; el carrusel de
 * produccion va por pasos. Lanza si no pasa las comprobaciones.
 */
export async function disenarLibre(opciones: {
  accountId: string
  kc: KitCargado
  guion: GuionLibre
  fotos: FotoLibre[]
  presupuestoMs: number
  modelo?: string
  esfuerzo?: "low" | "medium" | "high"
}): Promise<DisenoLibre> {
  const inicio = Date.now()
  const queda = () => opciones.presupuestoMs - (Date.now() - inicio)
  const tiempos: string[] = []
  const cronometro = async <T,>(que: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now()
    try {
      return await fn()
    } finally {
      tiempos.push(`${que} ${Math.round((Date.now() - t) / 1000)} s`)
    }
  }
  const ctx = await contextoLibre(opciones)
  let fuente = await cronometro("diseño", () => primerDiseno(ctx, Math.max(60_000, queda())))
  let medida = await cronometro("dibujo", () => medirDiseno(ctx, fuente))
  let mejor = { fuente, medida }
  let puntaje: number | null = null
  let rondas = 0
  for (; rondas < MAX_RONDAS_LIBRE; rondas++) {
    // El critico solo mira un carrusel que ya cumple lo medible.
    const critica = !medida.graves && queda() > 120_000 ? await cronometro("crítico", () => criticarDiseno(ctx, medida.dibujadas)) : null
    if (critica) puntaje = critica.puntaje
    if (critica && critica.puntaje >= PUNTAJE_BUENO && !critica.cambios.length) break
    const cambios = cambiosPedidos(medida, critica)
    if (!cambios.size || queda() < 100_000) break
    fuente = await cronometro("diseño", () => corregirDiseno(ctx, fuente, cambios, medida.dibujadas, Math.max(60_000, queda())))
    medida = await cronometro("dibujo", () => medirDiseno(ctx, fuente))
    if (medida.graves <= mejor.medida.graves) mejor = { fuente, medida }
  }
  if (mejor.medida.graves) {
    const detalle = [...mejor.medida.fallos.entries()].map(([n, qs]) => `${n ? `lámina ${n}` : "documento"}: ${qs.join("; ")}`).join(" | ")
    throw new Error(`El diseño libre no pasó las comprobaciones (${tiempos.join(", ")}): ${detalle.slice(0, 600)}`)
  }
  return {
    dibujadas: mejor.medida.dibujadas,
    paginas: paginasDeFuente(ctx, mejor.fuente),
    fuente: mejor.fuente,
    rondas,
    puntaje,
    piezas: ctx.elegidas.map((p) => p.origen),
    avisos: [`Tiempos: ${tiempos.join(", ")}.`],
  }
}
