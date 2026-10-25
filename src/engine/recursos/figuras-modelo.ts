import { cifrasPerdidas } from "../content/revisor"
import { NOMBRE_ETAPA_RECURSO, ROTULOS, type Recurso, type Rotulo } from "./modelo"

/**
 * Las figuras de un recurso: la portada, una figura por cada cifra o idea
 * central y, si encaja, una foto de la biblioteca de la marca. Modulo puro (lo
 * lee tambien el cliente); el diseño y el dibujo estan en figuras.ts.
 *
 * Las reglas son las del kit (FLUJO-REPORTE-DM, seccion 21): cada figura usa
 * solo cifras del recurso, dice su fuente dentro de la imagen, y lo que es
 * calculo de la marca o ejemplo inventado lo dice tambien.
 */

export const PASOS_FIGURAS = ["plan", "foto", "disenar", "revisar", "corregir", "subir", "listo", "fallo"] as const
export type PasoFiguras = (typeof PASOS_FIGURAS)[number]

export const NOMBRE_PASO_FIGURAS: Record<PasoFiguras, string> = {
  plan: "planeando las figuras",
  foto: "eligiendo la foto",
  disenar: "diseñando las figuras",
  revisar: "revisando el diseño",
  corregir: "corrigiendo el diseño",
  subir: "subiendo las imágenes",
  listo: "figuras listas",
  fallo: "sin figuras",
}

/** Como se lee lo que hace el agente ahora mismo, desde lo que guardo en `pendiente`. */
export function etapaLegible(pendiente: { etapa?: string; figuras?: { paso?: string } } | null | undefined, status: string): string {
  const etapa = pendiente?.etapa
  if (etapa === "figuras") return NOMBRE_PASO_FIGURAS[(pendiente?.figuras?.paso ?? "plan") as PasoFiguras] ?? "diseñando las figuras"
  if (etapa) return NOMBRE_ETAPA_RECURSO[etapa] ?? etapa
  return status === "processing" ? "trabajando" : "en cola"
}

export const ANCHO_FIGURA = 1600
export const ALTO_FIGURA = 900

export const TIPOS_FIGURA = ["portada", "cifras", "comparacion", "barras", "formula", "proceso", "ejemplo", "tabla"] as const
export type TipoFigura = (typeof TIPOS_FIGURA)[number]
export const NOMBRE_TIPO_FIGURA: Record<TipoFigura, string> = {
  portada: "Portada",
  cifras: "Cifras",
  comparacion: "Comparación",
  barras: "Barras",
  formula: "Fórmula",
  proceso: "Proceso",
  ejemplo: "Ejemplo",
  tabla: "Tabla",
}

/** Un dato de la figura: lo que se lee, con de donde sale y que es. */
export type DatoFigura = { texto: string; valor: string; fuente: string; rotulo: Rotulo | null }

/** Donde va la figura en el recurso: tras el bloque `despues_de` de la seccion (-1, al empezarla). */
export type Lugar = { seccion: string; despues_de: number }

export type PlanFigura = Lugar & {
  clave: string
  tipo: TipoFigura
  antetitulo: string
  titulo: string
  datos: DatoFigura[]
  nota: string
  /** El pie de figura, con la fuente: va debajo en la pagina y dentro de la imagen. */
  pie: string
  /** El texto alternativo: describe la cifra, no solo la imagen. */
  alt: string
}

export type PlanFoto = Lugar & { terminos: string[]; pie: string; alt: string }

export type PlanFiguras = { figuras: PlanFigura[]; foto: PlanFoto | null }

/** Una figura ya dibujada y subida. */
export type FiguraHecha = Lugar & { clave: string; tipo: TipoFigura; url: string; alt: string; pie: string; ancho: number; alto: number }

export type FotoRecurso = Lugar & { url: string; alt: string; pie: string; imagenId: string; ancho: number; alto: number }

/** Lo que queda guardado con el recurso (`content_recursos.figuras`). */
export type FigurasGuardadas = {
  lista: FiguraHecha[]
  foto: FotoRecurso | null
  /** Por que salio sin figuras o con menos, si paso. */
  avisos: string[]
  puntaje: number | null
  rondas: number
}

export const SIN_FIGURAS: FigurasGuardadas = { lista: [], foto: null, avisos: [], puntaje: null, rondas: 0 }

// --------------------------------------------------------------- normalizar

type Bruto = Record<string, unknown>
const esObjeto = (v: unknown): v is Bruto => Boolean(v) && typeof v === "object" && !Array.isArray(v)
const texto = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const entero = (v: unknown, def: number) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def)
const claveDe = (v: unknown, i: number) => texto(v, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `figura-${i + 1}`

function normalizarDato(v: unknown): DatoFigura | null {
  if (!esObjeto(v)) return null
  const t = texto(v.texto, 300)
  if (!t) return null
  const rotulo = (ROTULOS as readonly string[]).includes(String(v.rotulo)) ? (v.rotulo as Rotulo) : null
  return { texto: t, valor: texto(v.valor, 60), fuente: texto(v.fuente, 20), rotulo }
}

export function normalizarPlan(bruto: unknown): PlanFiguras {
  const o = esObjeto(bruto) ? bruto : {}
  const vistas = new Set<string>()
  const figuras = (Array.isArray(o.figuras) ? o.figuras : []).filter(esObjeto).map((f, i): PlanFigura => {
    let clave = claveDe(f.clave, i)
    while (vistas.has(clave)) clave = `${clave}-${i + 1}`
    vistas.add(clave)
    const tipo = (TIPOS_FIGURA as readonly string[]).includes(String(f.tipo)) ? (f.tipo as TipoFigura) : "cifras"
    return {
      clave,
      tipo,
      seccion: tipo === "portada" ? "portada" : texto(f.seccion, 40),
      despues_de: entero(f.despues_de, -1),
      antetitulo: texto(f.antetitulo, 80),
      titulo: texto(f.titulo, 200),
      datos: (Array.isArray(f.datos) ? f.datos : []).map(normalizarDato).filter((d): d is DatoFigura => Boolean(d)).slice(0, 8),
      nota: texto(f.nota, 300),
      pie: texto(f.pie, 400),
      alt: texto(f.alt, 400),
    }
  })
  const fb = esObjeto(o.foto) ? o.foto : null
  const foto: PlanFoto | null =
    fb && texto(fb.seccion, 40)
      ? {
          seccion: texto(fb.seccion, 40),
          despues_de: entero(fb.despues_de, -1),
          terminos: (Array.isArray(fb.terminos) ? fb.terminos : []).map((t) => texto(t, 60)).filter(Boolean).slice(0, 6),
          pie: texto(fb.pie, 300),
          alt: texto(fb.alt, 300),
        }
      : null
  return { figuras, foto }
}

/** Todo lo que se lee en una figura, para comprobar sus cifras. */
export function textoDeFigura(f: PlanFigura): string {
  return [f.antetitulo, f.titulo, ...f.datos.flatMap((d) => [d.texto, d.valor]), f.nota, f.pie].filter(Boolean).join(" ")
}

const RE_CALCULO = /c[aá]lculo/i
const RE_EJEMPLO = /ejemplo|hip[oó]tesis|hipot[eé]tic/i

/**
 * Lo que falla en el plan, por figura (clave) o del plan entero (""). Lo que se
 * comprueba es lo que no se negocia: la portada, un lugar que existe, cifras
 * que estan en el recurso, la fuente en el pie y el rotulo de lo que no es un
 * hecho.
 */
export function revisarPlan(plan: PlanFiguras, recurso: Recurso, material: string): Map<string, string[]> {
  const fallos = new Map<string, string[]>()
  const agregar = (k: string, que: string) => fallos.set(k, [...(fallos.get(k) ?? []), que])
  const secciones = new Map(recurso.secciones.map((s) => [s.clave, s.bloques.length]))

  const portadas = plan.figuras.filter((f) => f.tipo === "portada")
  if (portadas.length !== 1) agregar("", portadas.length ? "hay más de una portada" : "falta la portada")
  const resto = plan.figuras.length - portadas.length
  if (resto < 1) agregar("", "no hay ninguna figura además de la portada: cada cifra o idea central del recurso lleva la suya")
  if (resto > 6) agregar("", `son ${resto} figuras además de la portada: como mucho 6, las de las ideas centrales`)

  for (const f of plan.figuras) {
    if (!f.titulo) agregar(f.clave, "no tiene título")
    if (!f.alt) agregar(f.clave, "no tiene texto alternativo")
    if (f.tipo !== "portada") {
      const bloques = secciones.get(f.seccion)
      if (bloques === undefined) agregar(f.clave, `la sección «${f.seccion}» no existe en el recurso`)
      else if (f.despues_de < -1 || f.despues_de >= bloques) agregar(f.clave, `el bloque ${f.despues_de} no existe en la sección «${f.seccion}» (tiene ${bloques})`)
      if (!f.datos.length) agregar(f.clave, "no tiene datos: una figura enseña una cifra o una idea del recurso")
      if (!f.pie) agregar(f.clave, "no tiene pie de figura")
      else if (f.datos.some((d) => d.rotulo === "hecho" || d.fuente) && !/fuente|seg[uú]n/i.test(f.pie))
        agregar(f.clave, "el pie no dice la fuente de los datos")
    }
    const cifras = cifrasPerdidas(textoDeFigura(f), material)
    if (cifras.length) agregar(f.clave, `trae cifras que no están en el recurso ni en el registro (${cifras.join(", ")})`)
    const visible = `${f.antetitulo} ${f.nota} ${f.pie}`
    if (f.datos.some((d) => d.rotulo === "calculo") && !RE_CALCULO.test(visible)) agregar(f.clave, "tiene un cálculo de la marca y no lo dice (en la nota o el pie)")
    if (f.datos.some((d) => d.rotulo === "ejemplo" || d.rotulo === "hipotesis") && !RE_EJEMPLO.test(visible))
      agregar(f.clave, "tiene un ejemplo o una hipótesis y no lo rotula como tal (en el antetítulo, la nota o el pie)")
  }
  if (plan.foto) {
    const bloques = secciones.get(plan.foto.seccion)
    if (bloques === undefined || plan.foto.despues_de >= bloques) agregar("foto", `el lugar de la foto no existe en el recurso («${plan.foto.seccion}», bloque ${plan.foto.despues_de})`)
  }
  return fallos
}

/** Lee lo guardado en `content_recursos.figuras`, que puede faltar o venir de una version anterior. */
export function parseFigurasGuardadas(v: unknown): FigurasGuardadas {
  if (!esObjeto(v)) return SIN_FIGURAS
  return {
    lista: Array.isArray(v.lista) ? (v.lista.filter((f) => esObjeto(f) && typeof f.url === "string") as FiguraHecha[]) : [],
    foto: esObjeto(v.foto) && typeof v.foto.url === "string" ? (v.foto as FotoRecurso) : null,
    avisos: Array.isArray(v.avisos) ? v.avisos.map(String) : [],
    puntaje: typeof v.puntaje === "number" ? v.puntaje : null,
    rondas: typeof v.rondas === "number" ? v.rondas : 0,
  }
}

/** La portada y lo que va en cada lugar del recurso, para pintarlo en orden. */
export function figurasPorLugar(g: FigurasGuardadas): { portada: FiguraHecha | null; en: (seccion: string, despues_de: number) => (FiguraHecha | FotoRecurso)[] } {
  const portada = g.lista.find((f) => f.tipo === "portada") ?? null
  const resto: (FiguraHecha | FotoRecurso)[] = [...g.lista.filter((f) => f.tipo !== "portada"), ...(g.foto ? [g.foto] : [])]
  return { portada, en: (seccion, despues_de) => resto.filter((f) => f.seccion === seccion && f.despues_de === despues_de) }
}
