import { llamarClaude, parsearJSONDeClaude, type Bloque, type UsoClaude } from "../claude/messages"
import { cssDeFiguras } from "../marca/figuras"
import { elegirDeBiblioteca, hayFotosEnBiblioteca } from "../marca/imagenes"
import { archivosComoDatos, kitActivo, type KitCargado } from "../marca/kit"
import { cssDeFuentes, revisarHtmlLibre } from "../marca/kit-modelo"
import { piezasParecidas, type PiezaDeEjemplo } from "../marca/kit-piezas"
import { partes, piezasConHtml, reducida, unir, type Critica } from "../render/kit-libre"
import { agregado, quitado } from "../render/kit-maqueta"
import { dibujarLaminas, type LaminaDibujada } from "../render/navegador"
import { subirArchivoPublico } from "../render/storage"
import { supabaseAdmin } from "../supabase-admin"
import {
  ALTO_FIGURA,
  ANCHO_FIGURA,
  normalizarPlan,
  revisarPlan,
  textoDeFigura,
  type FiguraHecha,
  type FigurasGuardadas,
  type FotoRecurso,
  NOMBRE_PASO_FIGURAS,
  type PasoFiguras,
  type PlanFiguras,
} from "./figuras-modelo"
import type { Registro } from "./investigacion"
import { nombreDeMarca } from "./pagina"
import { NOMBRE_ROTULO, textoRecurso, type Recurso } from "./modelo"

/**
 * Las figuras del recurso: la portada, una figura por cada cifra o idea central
 * y una foto de la biblioteca si encaja, dibujadas con el kit de la marca.
 *
 * Es el diseño libre de los carruseles (render/kit-libre.ts) llevado a 1600x900:
 * un plan de figuras con sus datos (Opus) que el codigo revisa, Opus diseña
 * todas en un HTML mirando piezas de la marca, el codigo dibuja y mide, un
 * critico compara con las piezas, y hay hasta dos correcciones.
 *
 * Va por pasos sueltos, como el resto del agente de recursos: cada paso cabe en
 * una pasada del servidor y el estado viaja en `pendiente.figuras`. Nunca lanza:
 * un fallo se anota y, si se repite, el recurso sale sin figuras y con aviso.
 */

export const MODELO_FIGURAS = "claude-opus-5-5"
const MAX_RONDAS = 2
const MAX_INTENTOS = 2
const MAX_PASADAS = 10
const PUNTAJE_BUENO = 8
/** Piezas de la marca que ve el diseñador, y cuantas ve el critico. */
const PIEZAS_DISENO = 3
const PIEZAS_CRITICO = 2
/**
 * Figuras por llamada de diseño: Opus escribe unos 100 tokens por segundo y
 * cada figura, con su razonamiento, son unos 5.000; seis de una vez no caben en
 * una pasada. Van de dos en dos con el estilo de las primeras, y una correccion
 * toca como mucho dos a la vez.
 */
const LOTE = 2

/** Lo que tiene que quedar en la pasada para empezar cada paso. */
const DURACION = { plan: 150_000, foto: 60_000, disenar: 170_000, revisar: 150_000, corregir: 170_000, subir: 60_000 } as const

export type EstadoFiguras = {
  paso: PasoFiguras
  /** Donde se suben las imagenes de esta version. */
  carpeta: string
  plan?: PlanFiguras
  foto?: { imagenId: string; motivo: string } | null
  /** Cuantas figuras del plan ya tienen diseño (se diseñan por lotes). */
  disenadas?: number
  fuente?: string
  /** La version con menos fallos medidos, por si una correccion empeora. */
  mejor?: { fuente: string; graves: number }
  cambios?: [number, string[]][]
  rondas: number
  puntaje: number | null
  intentos: number
  pasadas: number
  avisos: string[]
  hechas?: FigurasGuardadas
}

export function nuevoEstadoFiguras(accountId: string, angleId: string): EstadoFiguras {
  return { paso: "plan", carpeta: `recursos/${accountId}/${angleId}/${Date.now().toString(36)}`, rondas: 0, puntaje: null, intentos: 0, pasadas: 0, avisos: [] }
}

export const figurasTerminadas = (e: EstadoFiguras) => e.paso === "listo" || e.paso === "fallo"

/** Lo que el recurso guarda de un estado terminado. */
export function figurasDe(e: EstadoFiguras | undefined): FigurasGuardadas {
  if (e?.hechas) return { ...e.hechas, avisos: e.avisos }
  return { lista: [], foto: null, avisos: e?.avisos ?? [], puntaje: e?.puntaje ?? null, rondas: e?.rondas ?? 0 }
}

/** Lo que el plan necesita del recurso: su texto, de donde salen sus datos y de quien es. */
export type MaterialFiguras = {
  accountId: string
  recurso: Recurso
  registro: Registro
  fuentes: { id: string; medio: string; titulo: string; fecha: string }[]
}

const sumar = (a: UsoClaude | null, b: UsoClaude | null): UsoClaude | null =>
  !a ? b : !b ? a : { entrada: a.entrada + b.entrada, salida: a.salida + b.salida, deCache: (a.deCache ?? 0) + (b.deCache ?? 0) }

// ------------------------------------------------------------------- plan

const sistemaPlan = (marca: string) => `Eres quien decide las figuras de un reporte o una guía de ${marca}: las imágenes de 1600x900 que acompañan el texto en la página web. Recibes el recurso ya escrito y revisado, sus fuentes y el registro de verificación. No reescribes el recurso: eliges qué se ve.

QUÉ FIGURAS
- Una portada (tipo "portada"): antetítulo corto (tipo de recurso y tema, por ejemplo "Reporte de ${marca} · IA y costos") y un titular de portada en dos tiempos, más corto que el del recurso, que diga lo mismo. Sin fechas ni cifras que no estén en el recurso.
- Una figura por cada cifra o idea central del recurso: precios, una comparación, una evolución, una fórmula o un marco de la lectura de la marca, un proceso en pasos, un ejemplo con números. De 2 a 6 además de la portada. Solo lo que gana al verse: una frase que ya se entiende leyendo no necesita figura.
- Cada figura va en un lugar del recurso: la clave de una sección y el índice del bloque tras el que va (-1 para ponerla al empezar la sección), cerca del texto que enseña.
- Si una foto ayuda (personas, un lugar, el contexto humano de la noticia), pide una de la biblioteca de la marca con términos de búsqueda en español e inglés y su lugar. Si no ayuda, "foto": null.

LOS DATOS DE CADA FIGURA
- Solo cifras, nombres y afirmaciones que están en el recurso, con el identificador de su fuente (f1, f2...) y su rótulo: hecho, lectura, hipotesis, calculo, traduccion o ejemplo, el mismo que tiene en el recurso.
- Un cálculo de la marca lo dice en la nota o el pie ("Cálculo de ${marca}: 62.000 ÷ 2,3"). Un ejemplo con números inventados lleva "Ejemplo hipotético" en el antetítulo o la nota.
- El pie dice de dónde sale: "Fuente: <medio>, <fecha>." Para una figura de la lectura de la marca: "Criterio de ${marca}." Si mezcla las dos, las dos.
- El texto alternativo describe la cifra o la idea con sus números, no la imagen ("Precio por millón de tokens: $2 de entrada y $10 de salida hasta el 30 de noviembre"), para quien no la ve.
- Títulos de figura cortos y con la idea, como un titular: "El precio de lanzamiento se duplica el 1 de diciembre", no "Precios".

RESPONDE SOLO con este JSON, sin texto alrededor:
{"figuras":[{"clave":"<corta, sin espacios>","tipo":"portada|cifras|comparacion|barras|formula|proceso|ejemplo|tabla","seccion":"<clave de sección, o portada>","despues_de":<índice de bloque o -1>,"antetitulo":"","titulo":"","datos":[{"texto":"<lo que se lee>","valor":"<la cifra, si la hay>","fuente":"<f1>","rotulo":"hecho"}],"nota":"","pie":"","alt":""}],"foto":{"seccion":"","despues_de":-1,"terminos":[""],"pie":"Imagen de la biblioteca de ${marca}.","alt":""}}`

function recursoNumerado(r: Recurso): string {
  return [
    `TIPO: ${r.tipo}`,
    `TITULAR: ${r.titular}`,
    `RESUMEN:\n${r.resumen.map((t) => `- ${t}`).join("\n")}`,
    ...r.secciones.map(
      (s) =>
        `SECCIÓN ${s.clave} «${s.titulo}»\n${s.bloques
          .map((b, i) => {
            const etiqueta = (rot: string | null, f: string[]) => `${rot ? NOMBRE_ROTULO[rot as keyof typeof NOMBRE_ROTULO] ?? rot : "sin rótulo"}${f.length ? `, ${f.join(" ")}` : ""}`
            if (b.tipo === "parrafo") return `  [${i}] párrafo (${etiqueta(b.rotulo, b.fuentes)}): ${b.texto}`
            if (b.tipo === "lista" || b.tipo === "checklist")
              return `  [${i}] ${b.tipo}:\n${b.items.map((it) => `      - (${etiqueta(it.rotulo, it.fuentes)}) ${it.texto}`).join("\n")}`
            if (b.tipo === "tabla")
              return `  [${i}] tabla «${b.titulo}» (${etiqueta(b.rotulo, b.fuentes)}): ${b.columnas.join(" | ")}\n${b.filas.map((f) => `      ${f.join(" | ")}`).join("\n")}`
            return `  [${i}] plantilla «${b.titulo}»`
          })
          .join("\n")}`
    ),
  ].join("\n\n")
}

async function pedirPlan(m: MaterialFiguras, marca: string, correccion: string | null, timeoutMs: number) {
  const prompt = `${recursoNumerado(m.recurso)}

FUENTES
${m.fuentes.map((f) => `${f.id}: ${f.medio}${f.titulo ? `, «${f.titulo}»` : ""}${f.fecha ? `, ${f.fecha}` : ""}`).join("\n")}

REGISTRO DE VERIFICACIÓN
${m.registro.datos.map((d) => `- ${d.dato} (${d.estado}${d.fuentes.length ? `, ${d.fuentes.join(" ")}` : ""})`).join("\n")}
${correccion ?? ""}`
  const r = await llamarClaude({
    paso: "recurso-figuras-plan",
    accountId: m.accountId,
    model: MODELO_FIGURAS,
    esfuerzo: "medium",
    system: sistemaPlan(marca),
    prompt,
    maxTokens: 8000,
    timeoutMs,
  })
  if (!r.ok) throw new Error(`El plan de figuras no llegó: ${r.error}`)
  return { plan: normalizarPlan(parsearJSONDeClaude(r.texto)), uso: r.uso, bruto: r.texto }
}

/** El material contra el que se revisan las cifras: el recurso y el registro. */
const materialDe = (m: MaterialFiguras) => [textoRecurso(m.recurso), ...m.registro.datos.map((d) => d.dato)].join("\n")

const listaDeFallos = (fallos: Map<string, string[]>) =>
  [...fallos.entries()].map(([k, qs]) => `${k ? `Figura ${k}` : "El plan"}:\n${qs.map((q) => `  - ${q}`).join("\n")}`).join("\n")

/** El plan, revisado y corregido una vez; lo que siga fallando se queda fuera. */
async function planear(m: MaterialFiguras, marca: string, hasta: number): Promise<{ plan: PlanFiguras; uso: UsoClaude | null; avisos: string[] }> {
  const material = materialDe(m)
  let uso: UsoClaude | null = null
  const primero = await pedirPlan(m, marca, null, tiempoPara(hasta, 140_000))
  uso = sumar(uso, primero.uso)
  let plan = primero.plan
  let fallos = revisarPlan(plan, m.recurso, material)
  if (fallos.size && Date.now() + 90_000 < hasta) {
    const segundo = await pedirPlan(
      m,
      marca,
      `\nTU PLAN ANTERIOR\n${primero.bruto}\n\nEsto no se puede quedar así; corrígelo y responde el plan entero:\n${listaDeFallos(fallos)}`,
      tiempoPara(hasta, 140_000)
    )
    uso = sumar(uso, segundo.uso)
    plan = segundo.plan
    fallos = revisarPlan(plan, m.recurso, material)
  }
  const avisos: string[] = []
  if (fallos.get("")?.some((q) => q.includes("portada"))) throw new Error(`El plan de figuras no tiene una portada válida: ${fallos.get("")!.join("; ")}`)
  const malas = new Set([...fallos.keys()].filter((k) => k && k !== "foto"))
  if (malas.size) avisos.push(`Quedaron fuera ${malas.size} figura(s) que no pasaron la revisión: ${[...malas].map((k) => `${k} (${fallos.get(k)!.join("; ")})`).join(" | ")}`.slice(0, 600))
  const figuras = plan.figuras.filter((f) => !malas.has(f.clave) || f.tipo === "portada")
  if (figuras.some((f) => f.tipo === "portada" && malas.has(f.clave))) throw new Error(`La portada no pasó la revisión: ${fallos.get(figuras.find((f) => f.tipo === "portada")!.clave)!.join("; ")}`)
  return { plan: { figuras, foto: fallos.has("foto") ? null : plan.foto }, uso, avisos }
}

// ------------------------------------------------------------------- foto

async function elegirFoto(accountId: string, plan: PlanFiguras, recurso: Recurso): Promise<{ imagenId: string; motivo: string } | null> {
  if (!plan.foto || !(await hayFotosEnBiblioteca(accountId))) return null
  const elegidas = await elegirDeBiblioteca({
    accountId,
    huecos: [{ indice: 0, uso: "inserto", texto: `${plan.foto.pie} ${plan.foto.alt} ${recurso.titular}` }],
    terminos: [...plan.foto.terminos, recurso.titular],
    apaisada: true,
  })
  const e = elegidas.get(0)
  return e ? { imagenId: e.imagenId, motivo: e.motivo } : null
}

// ------------------------------------------------------------------ diseño

const SISTEMA_FIGURAS = `Eres quien diseña las figuras de los reportes y guías de la marca: imágenes de 1600x900 px que van dentro de una página web, entre los párrafos. Recibes el plan de figuras (sus textos y datos ya decididos), el sistema visual de la marca y piezas que la marca ya publicó (carruseles de Instagram de 1080x1350, con su HTML). Diseñas cada figura en HTML y CSS como la diseñaría la marca, llevando su lenguaje al formato apaisado.

CÓMO DISEÑAS
- Mira primero las piezas: marco (logo, etiquetas), fondos y cómo alternan, cómo resaltan una palabra o una cifra, tarjetas, barras, pastillas, tablas, flujos con flechas, cifras grandes con su explicación debajo, cuánto aire dejan. Ese es el nivel y esa es la familia visual.
- Cada figura construye su contenido: un precio en tarjetas, una comparación en barras proporcionales a sus valores, una fórmula en bloques con sus operadores, un proceso en pasos con flechas, un ejemplo en una cuenta clara. Inventas la construcción para ESE dato, con HTML y CSS (o SVG en línea).
- La portada es la de un reporte: titular grande en dos tiempos (la segunda parte en el color de acento), antetítulo, logo, y un gesto gráfico de la marca. Es la imagen que encabeza la página.
- Alterna fondos entre figuras como lo hacen las piezas (claro, alterno, oscuro), sin que todas sean iguales.
- Lo que es un cálculo de la marca se distingue a la vista (por ejemplo, una barra rayada) y lo dice; un ejemplo hipotético lleva su pastilla.

EL TEXTO ES EL DEL PLAN
- Cada figura usa el antetítulo, el título, los datos, la nota y el pie de SU figura del plan. El pie (la fuente) va dentro de la imagen, abajo, en letra pequeña de apoyo.
- Puedes sumar rótulos cortos de diseño (el nombre de una columna, "Antes" y "Después", una unidad). Nunca una afirmación, un nombre ni una cifra que no esté en el plan.
- Ninguna cifra ni atribución del plan se queda fuera.

REGLAS TÉCNICAS
- Responde con un documento HTML sin <html>, <head> ni <body>: primero UN <style> con todo el CSS, después una <section data-lamina="N" data-seguro="x1,y1,x2,y2"> por figura, en el orden del plan, de 1600x900 px. data-seguro es el área donde va todo el texto (por ejemplo 72,56,1528,860). No pongas una <section> dentro de otra.
- Los logos van como marcas {{a:papel}} (en src="" o en url()). Nada más se carga: ni enlaces, ni @import, ni @font-face, ni url(http...), ni scripts, ni eventos, ni <button>, <input> o <form>.
- Usa las familias de fuente del kit tal cual se nombran.
- Una forma o palabra gigante de fondo que se sale a propósito lleva data-adorno.
- Ningún texto por debajo de la letra mínima. Ningún texto se sale de su área segura ni se monta sobre otro.
- Sin texto alrededor del documento.`

/** Lo que necesitan los pasos de diseño; se arma en cada pasada. */
type ContextoFiguras = {
  accountId: string
  kc: KitCargado
  plan: PlanFiguras
  minimo: number
  elegidas: (PiezaDeEjemplo & { html: string; hoja: Buffer | null })[]
  archivos: Record<string, string>
  papeles: string[]
  encargo: string
  bloques: Bloque[]
}

/** La letra minima del kit es para una lamina de 1080 px que se ve entera en el celular; la figura se ve mas chica. */
const minimoDe = (kc: KitCargado) => Math.max(24, Math.round(kc.kit.sistema.reglas.letra_minima * 1.2))

function guionDeFigura(f: PlanFiguras["figuras"][number], n: number): string {
  return [
    `FIGURA ${n} (${f.tipo}, clave ${f.clave})`,
    f.antetitulo ? `  antetítulo: ${f.antetitulo}` : "",
    `  título: ${f.titulo}`,
    f.datos.length
      ? `  datos:\n${f.datos.map((d) => `    - ${d.texto}${d.valor ? ` [cifra: ${d.valor}]` : ""}${d.rotulo && d.rotulo !== "hecho" ? ` (${NOMBRE_ROTULO[d.rotulo]})` : ""}`).join("\n")}`
      : "",
    f.nota ? `  nota: ${f.nota}` : "",
    f.pie ? `  pie (va dentro, abajo): ${f.pie}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

async function contextoFiguras(accountId: string, kc: KitCargado, plan: PlanFiguras): Promise<ContextoFiguras> {
  const todas = await piezasConHtml(kc)
  if (!todas.length) throw new Error("El kit no tiene piezas de ejemplo para diseñar las figuras.")
  const elegidas = piezasParecidas(todas, plan.figuras.map(textoDeFigura).join(" "), PIEZAS_DISENO) as typeof todas
  const archivos = await archivosComoDatos(kc)
  const logos = kc.archivos.filter((a) => a.tipo === "logo").map((a) => a.papel)
  const familias = [...new Set(kc.archivos.filter((a) => a.tipo === "fuente").map((a) => `${String(a.meta.familia)} ${String(a.meta.peso ?? 400)}`))]
  const minimo = minimoDe(kc)
  const bloques: Bloque[] = []
  for (const [k, p] of elegidas.entries()) {
    if (p.hoja)
      bloques.push(
        { tipo: "texto", texto: `Pieza de la marca ${k + 1}: «${p.titulo}», sus láminas:` },
        { tipo: "imagen", mime: "image/jpeg", datos: await reducida(p.hoja, 2000) }
      )
    // El HTML de la primera basta para ver como construye la marca; las demas, por la imagen.
    if (k === 0) bloques.push({ tipo: "texto", texto: `Su HTML:\n${p.html}` })
  }
  const encargo = `EL SISTEMA DE LA MARCA
${JSON.stringify(kc.kit.sistema)}
Letra mínima en las figuras: ${minimo} px.
Fuentes cargadas (familia y peso): ${familias.join(", ")}.
Logos: ${logos.map((l) => `{{a:${l}}}`).join(", ")} (logo_claro va sobre fondo claro, logo_oscuro sobre oscuro, logo_acento sobre el color de acento).
CSS común del kit (ya está cargado; puedes usar sus variables y clases o escribir las tuyas):
${kc.kit.css}

Arriba van ${elegidas.length} piezas que la marca publicó.

LAS FIGURAS DEL REPORTE (${plan.figuras.length}, de 1600x900)
${plan.figuras.map((f, i) => guionDeFigura(f, i + 1)).join("\n\n")}`
  return { accountId, kc, plan, minimo, elegidas, archivos, papeles: logos, encargo, bloques }
}

const tiempoPara = (hasta: number, tope: number) => Math.max(60_000, Math.min(tope, hasta - Date.now() - 20_000))

async function pedirDiseno(ctx: ContextoFiguras, paso: string, prompt: string, bloques: Bloque[], timeoutMs: number) {
  const r = await llamarClaude({
    paso,
    accountId: ctx.accountId,
    model: MODELO_FIGURAS,
    esfuerzo: "medium",
    system: SISTEMA_FIGURAS,
    prompt,
    bloques,
    maxTokens: 48_000,
    timeoutMs,
  })
  if (!r.ok) throw new Error(`El diseñador de figuras no respondió: ${r.error}`)
  const p = partes(r.texto)
  if (!p.laminas.size) throw new Error("El diseñador no devolvió ninguna figura.")
  return { partes: p, uso: r.uso }
}

/** La pagina de una figura, lista para el navegador: 1600x900, con las fuentes y los logos dentro. */
function paginasDeFuente(ctx: Pick<ContextoFiguras, "kc" | "archivos" | "plan">, fuente: string): string[] {
  const p = partes(fuente)
  const fuentes = cssDeFuentes(ctx.kc.archivos, ctx.archivos)
  const css = `${ctx.kc.kit.css}\n${cssDeFiguras(ctx.kc.kit.parciales)}\n${p.estilo}`
  return ctx.plan.figuras.map((_, i) => {
    const seccion = (p.laminas.get(i + 1) ?? `<section data-lamina="${i + 1}"></section>`).replace(/\{\{a:(\w+)\}\}/g, (_, k: string) => ctx.archivos[k] ?? "")
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
${fuentes}
*{box-sizing:border-box;margin:0}
html,body{width:${ANCHO_FIGURA}px;height:${ALTO_FIGURA}px;overflow:hidden}
${css}
</style></head><body>${seccion}</body></html>`
  })
}

type Medida = { dibujadas: LaminaDibujada[]; fallos: Map<number, string[]>; graves: number }

/** Lo que una figura dibujada cambio del plan: cifras nuevas, cifras que faltan, texto perdido. */
function cambiosDeTexto(propio: string, leido: string): string[] {
  const a = agregado(propio, leido)
  const q = quitado(propio, leido)
  const nuevas = a.cifras.filter((c) => !(c.length <= 2 && Number(c) <= 20))
  return [
    nuevas.length ? `agrega cifras que no están en el plan (${nuevas.join(", ")})` : "",
    q.cifras.length ? `le faltan cifras del plan (${q.cifras.join(", ")})` : "",
    q.parteDePalabras > 0.3 ? `le falta el ${Math.round(q.parteDePalabras * 100)} % del texto del plan (el pie con la fuente también va dentro)` : "",
  ].filter(Boolean)
}

async function medir(ctx: ContextoFiguras, fuente: string): Promise<Medida> {
  const p = partes(fuente)
  const fallos = new Map<number, string[]>()
  const agregar = (n: number, que: string) => fallos.set(n, [...(fallos.get(n) ?? []), que])
  for (const e of revisarHtmlLibre(fuente, ctx.papeles)) agregar(0, e)
  ctx.plan.figuras.forEach((_, i) => {
    if (!p.laminas.has(i + 1)) agregar(i + 1, "falta esta figura en el documento")
  })
  const dibujadas = await dibujarLaminas(paginasDeFuente(ctx, fuente), { ancho: ANCHO_FIGURA, alto: ALTO_FIGURA, libre: { letraMinima: ctx.minimo } })
  dibujadas.forEach((d, i) => {
    for (const pr of d.problemas)
      agregar(
        i + 1,
        `${pr.hueco}: ${pr.tipo === "choca" ? `choca ${pr.detalle}` : pr.tipo === "se_sale" ? `se sale del área segura (${pr.detalle})` : pr.tipo === "letra_pequena" ? `letra pequeña (${pr.detalle})` : "no entra en su caja"}`
      )
    for (const c of cambiosDeTexto(textoDeFigura(ctx.plan.figuras[i]), d.texto ?? "")) agregar(i + 1, `texto: ${c}`)
  })
  return { dibujadas, fallos, graves: [...fallos.values()].reduce((s, f) => s + f.length, 0) }
}

/** Las figuras dibujadas en una tira de dos por fila, para el critico y las correcciones. */
async function tira(dibujadas: LaminaDibujada[]): Promise<Buffer> {
  const sharp = (await import("sharp")).default
  const W = 800
  const H = 450
  const G = 12
  const porFila = 2
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

const SISTEMA_CRITICO = `Eres director de arte de la marca. Comparas las figuras de un reporte recién diseñadas con piezas que la marca ya publicó y dices, con ojo de diseñador, qué las aleja de ese nivel. No reescribes textos ni opinas del contenido: solo del diseño. Respondes solo con JSON.`

async function criticar(ctx: ContextoFiguras, dibujadas: LaminaDibujada[]): Promise<{ critica: Critica | null; uso: UsoClaude | null }> {
  const bloques: Bloque[] = []
  for (const p of ctx.elegidas.slice(0, PIEZAS_CRITICO))
    if (p.hoja) bloques.push({ tipo: "texto", texto: `Pieza publicada de la marca: «${p.titulo}»` }, { tipo: "imagen", mime: "image/jpeg", datos: await reducida(p.hoja, 2000) })
  bloques.push({ tipo: "texto", texto: "Las figuras nuevas, en orden (de izquierda a derecha y de arriba abajo):" }, { tipo: "imagen", mime: "image/jpeg", datos: await tira(dibujadas) })
  const r = await llamarClaude({
    paso: "recurso-figuras-critica",
    accountId: ctx.accountId,
    model: MODELO_FIGURAS,
    esfuerzo: "low",
    system: SISTEMA_CRITICO,
    prompt: `Lo que enseña cada figura:
${ctx.plan.figuras.map((f, i) => guionDeFigura(f, i + 1)).join("\n\n")}

Compara las figuras nuevas con las piezas de la marca: si se reconocen como de la marca (colores, tipografía, marco, logo), jerarquía, aire, si cada figura construye su dato (barras proporcionales, tarjetas, una fórmula legible) o se queda en texto, si la fuente se lee, variedad entre figuras. Puntúa de 0 a 10 cuánto se acercan al nivel de las piezas. Di solo los cambios que más las acercarían, concretos y por figura (como mucho dos por figura, y solo en las que lo necesitan).

Responde con este JSON:
{"puntaje": <0-10>, "cambios": [{"lamina": <número de figura>, "que": "<qué cambiar en el diseño, concreto>"}]}`,
    bloques,
    maxTokens: 8000,
    timeoutMs: 120_000,
  })
  if (!r.ok) return { critica: null, uso: null }
  try {
    const d = parsearJSONDeClaude(r.texto) as { puntaje?: number; cambios?: { lamina?: number; que?: string }[] }
    return {
      critica: {
        puntaje: Math.max(0, Math.min(10, Number(d.puntaje) || 0)),
        cambios: (d.cambios ?? [])
          .filter((c) => Number(c.lamina) >= 1 && Number(c.lamina) <= dibujadas.length && typeof c.que === "string" && c.que.trim())
          .map((c) => ({ lamina: Number(c.lamina), que: String(c.que).slice(0, 400) }))
          .slice(0, 12),
      },
      uso: r.uso,
    }
  } catch {
    return { critica: null, uso: r.uso }
  }
}

async function corregir(ctx: ContextoFiguras, fuente: string, cambios: [number, string[]][], timeoutMs: number) {
  const actual = partes(fuente)
  const medida = await medir(ctx, fuente)
  const lista = [...cambios]
    .sort((a, b) => a[0] - b[0])
    .map(([n, qs]) => `${n === 0 ? "En todo el documento" : `Figura ${n}`}:\n${qs.map((q) => `  - ${q}`).join("\n")}`)
    .join("\n")
  const r = await pedirDiseno(
    ctx,
    "recurso-figuras-correccion",
    `${ctx.encargo}

TU DISEÑO ACTUAL
${fuente}

Así se ve dibujado (la imagen de arriba) y esto es lo que hay que cambiar:
${lista}

Corrige solo eso, sin romper lo que ya funciona. Responde con el <style> completo y solo las <section> que cambias (con su data-lamina).`,
    [...ctx.bloques, { tipo: "texto", texto: "Tu diseño actual, dibujado:" }, { tipo: "imagen", mime: "image/jpeg", datos: await tira(medida.dibujadas) }],
    timeoutMs
  )
  return { fuente: unir({ estilo: r.partes.estilo || actual.estilo, laminas: new Map([...actual.laminas, ...r.partes.laminas]) }), uso: r.uso }
}

// ------------------------------------------------------------------ subir

async function subir(ctx: ContextoFiguras, e: EstadoFiguras, fuente: string): Promise<FigurasGuardadas> {
  const dibujadas = await dibujarLaminas(paginasDeFuente(ctx, fuente), { ancho: ANCHO_FIGURA, alto: ALTO_FIGURA })
  const lista: FiguraHecha[] = []
  for (const [i, f] of ctx.plan.figuras.entries()) {
    const d = dibujadas[i]
    if (!d) continue
    const url = await subirArchivoPublico(`${e.carpeta}/${f.clave}.png`, d.png, "image/png")
    lista.push({ clave: f.clave, tipo: f.tipo, seccion: f.seccion, despues_de: f.despues_de, url, alt: f.alt, pie: f.pie, ancho: ANCHO_FIGURA, alto: ALTO_FIGURA })
  }
  let foto: FotoRecurso | null = null
  if (e.foto && ctx.plan.foto) {
    const { data } = await supabaseAdmin().from("brand_imagenes").select("ruta").eq("account_id", ctx.accountId).eq("id", e.foto.imagenId).maybeSingle()
    if (data) {
      const { cargarFoto } = await import("../marca/imagenes")
      const uri = await cargarFoto(String(data.ruta), null)
      if (uri) {
        const sharp = (await import("sharp")).default
        const jpg = await sharp(Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64"))
          .resize({ width: ANCHO_FIGURA, withoutEnlargement: true })
          .jpeg({ quality: 84 })
          .toBuffer({ resolveWithObject: true })
        const url = await subirArchivoPublico(`${e.carpeta}/foto.jpg`, jpg.data, "image/jpeg")
        const pf = ctx.plan.foto
        foto = { seccion: pf.seccion, despues_de: pf.despues_de, url, alt: pf.alt || e.foto.motivo, pie: pf.pie, imagenId: e.foto.imagenId, ancho: jpg.info.width, alto: jpg.info.height }
      }
    }
  }
  return { lista, foto, avisos: e.avisos, puntaje: e.puntaje, rondas: e.rondas }
}

// --------------------------------------------------------------- avanzar

/**
 * Avanza las figuras los pasos que caben hasta `hasta`. Nunca lanza: un fallo
 * se anota y, a los MAX_INTENTOS del mismo paso, las figuras quedan en "fallo"
 * y el recurso sale sin ellas.
 */
export async function avanzarFiguras(opciones: {
  material: MaterialFiguras
  estado: EstadoFiguras
  hasta?: number
}): Promise<{ estado: EstadoFiguras; uso: UsoClaude | null }> {
  const { material: m } = opciones
  const hasta = opciones.hasta ?? Date.now() + 15 * 60_000
  let e: EstadoFiguras = opciones.estado
  let uso: UsoClaude | null = null
  const fallar = (por: string): EstadoFiguras => ({ ...e, paso: "fallo", avisos: [...e.avisos, por] })

  if (e.pasadas >= MAX_PASADAS) return { estado: fallar("Las figuras no terminaron en el tope de pasadas: el recurso sale sin ellas."), uso }

  const kc = await kitActivo(m.accountId).catch(() => null)
  if (!kc) return { estado: fallar("La marca no tiene un kit de diseño activo: el recurso sale sin figuras."), uso }
  const marca = await nombreDeMarca(m.accountId)
  let ctx: ContextoFiguras | null = null
  const contexto = async () => (ctx ??= await contextoFiguras(m.accountId, kc, e.plan!))

  let trabajo = false
  while (!figurasTerminadas(e)) {
    const paso = e.paso as Exclude<PasoFiguras, "listo" | "fallo">
    if (Date.now() + DURACION[paso] > hasta) break
    // Una pasada cuenta para el tope solo si hizo algo.
    if (!trabajo) e = { ...e, pasadas: e.pasadas + 1 }
    trabajo = true
    try {
      if (paso === "plan") {
        const r = await planear(m, marca, hasta)
        uso = sumar(uso, r.uso)
        e = { ...e, paso: r.plan.foto ? "foto" : "disenar", plan: r.plan, avisos: [...e.avisos, ...r.avisos], intentos: 0 }
      } else if (paso === "foto") {
        const foto = await elegirFoto(m.accountId, e.plan!, m.recurso)
        if (!foto) e = { ...e, avisos: [...e.avisos, "No se encontró una foto de la biblioteca que vaya con el recurso."] }
        e = { ...e, paso: "disenar", foto, intentos: 0 }
      } else if (paso === "disenar") {
        const c = await contexto()
        const desde = e.disenadas ?? 0
        const hastaN = Math.min(c.plan.figuras.length, desde + LOTE)
        const pedido = desde
          ? `${c.encargo}

YA DISEÑADAS (sigue su sistema: mismas clases, mismo marco, misma familia visual)
${e.fuente}

Diseña ahora solo las figuras ${desde + 1} a ${hastaN} (data-lamina ${desde + 1} a ${hastaN}). Responde con un <style> que traiga solo el CSS nuevo que necesites (el de las ya diseñadas sigue cargado) y solo esas <section>. No repitas las figuras ya diseñadas ni su CSS.`
          : `${c.encargo}

Diseña ahora las figuras 1 a ${hastaN} (data-lamina 1 a ${hastaN}); las demás vienen después con este mismo sistema. Responde con el <style> de todo el sistema y sus <section>.`
        const r = await pedirDiseno(c, "recurso-figuras", pedido, c.bloques, tiempoPara(hasta, 240_000))
        uso = sumar(uso, r.uso)
        const actual = e.fuente ? partes(e.fuente) : { estilo: "", laminas: new Map<number, string>() }
        const nuevas = [...r.partes.laminas].filter(([n]) => n > desde && n <= hastaN)
        if (!nuevas.length) throw new Error(`El diseñador no devolvió las figuras ${desde + 1} a ${hastaN}.`)
        const fuente = unir({ estilo: [actual.estilo, r.partes.estilo].filter(Boolean).join("\n"), laminas: new Map([...actual.laminas, ...nuevas]) })
        e = { ...e, paso: hastaN >= c.plan.figuras.length ? "revisar" : "disenar", fuente, disenadas: hastaN, intentos: 0 }
      } else if (paso === "revisar") {
        const c = await contexto()
        const medida = await medir(c, e.fuente!)
        const mejor = !e.mejor || medida.graves <= e.mejor.graves ? { fuente: e.fuente!, graves: medida.graves } : e.mejor
        // El critico solo mira figuras que ya cumplen lo medible.
        const cr = !medida.graves && Date.now() + 130_000 < hasta ? await criticar(c, medida.dibujadas) : { critica: null, uso: null }
        uso = sumar(uso, cr.uso)
        const puntaje = cr.critica?.puntaje ?? e.puntaje
        const todos = new Map<number, string[]>(medida.fallos)
        for (const k of cr.critica?.cambios ?? []) todos.set(k.lamina, [...(todos.get(k.lamina) ?? []), `crítico: ${k.que}`])
        // Lo del documento y como mucho LOTE figuras por ronda, primero las que mas fallan:
        // una correccion de todas a la vez no cabe en una pasada.
        const porFigura = [...todos].filter(([n]) => n > 0).sort((a, b) => b[1].length - a[1].length).slice(0, LOTE)
        const cambios = new Map<number, string[]>([...(todos.has(0) ? [[0, todos.get(0)!] as [number, string[]]] : []), ...porFigura])
        const bastante = !cambios.size || (cr.critica && cr.critica.puntaje >= PUNTAJE_BUENO && !medida.graves)
        if (bastante || e.rondas >= MAX_RONDAS) {
          if (mejor.graves) {
            const detalle = [...medida.fallos.entries()].map(([n, qs]) => `${n ? `figura ${n}` : "documento"}: ${qs.join("; ")}`).join(" | ")
            e = { ...e, avisos: [...e.avisos, `Las figuras quedaron con ${mejor.graves} detalle(s) sin resolver: ${detalle}`.slice(0, 600)] }
          }
          e = { ...e, paso: "subir", mejor, puntaje, intentos: 0 }
        } else {
          e = { ...e, paso: "corregir", mejor, puntaje, cambios: [...cambios.entries()], intentos: 0 }
        }
      } else if (paso === "corregir") {
        const c = await contexto()
        const r = await corregir(c, e.fuente!, e.cambios ?? [], tiempoPara(hasta, 240_000))
        uso = sumar(uso, r.uso)
        e = { ...e, paso: "revisar", fuente: r.fuente, rondas: e.rondas + 1, cambios: undefined, intentos: 0 }
      } else {
        const c = await contexto()
        const hechas = await subir(c, e, e.mejor?.fuente ?? e.fuente!)
        e = { ...e, paso: "listo", hechas, intentos: 0 }
      }
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error)
      const intentos = e.intentos + 1
      e = intentos >= MAX_INTENTOS ? fallar(`Las figuras fallaron en «${NOMBRE_PASO_FIGURAS[paso]}»: ${motivo}`.slice(0, 600)) : { ...e, intentos }
      // Un plan sin portada valida no mejora reintentando con lo mismo.
      if (paso === "plan" && /portada/.test(motivo)) e = fallar(motivo.slice(0, 600))
    }
  }
  return { estado: e, uso }
}
