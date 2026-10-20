import type { PerfilMarca } from "../marca/perfil-modelo"

/**
 * El revisor automatico: las reglas que se pueden comprobar sin IA.
 *
 * Mira cada pieza en cuanto el agente la escribe y dice tres cosas:
 *
 * - Lo que FRENA: un fallo que no puede salir publicado (un guion largo, una
 *   frase prohibida de la marca, una cifra o un alcance que no estan en la
 *   noticia). Si no se arregla, la pieza no se publica sola: espera a que
 *   alguien la apruebe.
 * - Los AVISOS: lo que conviene mirar pero no tumba la pieza.
 *
 * Frenos y avisos vuelven al agente con el pedido exacto de lo que tiene que
 * corregir: la calidad manda sobre el costo de una llamada mas.
 * - Los ARREGLOS: lo mecanico, que se corrige solo sin tocar el sentido y queda
 *   anotado.
 *
 * Cada hallazgo dice donde esta, que pasa y que hay que hacer. Ese "que hay que
 * hacer" es lo que se le manda al agente para corregir, y lo que se enseña en
 * la ficha: las dos cosas leen lo mismo.
 *
 * Todo es puro y sin base, para que el motor, el tablero y las pruebas usen
 * exactamente las mismas reglas.
 */

export type Regla =
  | "guion_largo"
  | "frase_prohibida"
  | "frase_de_fabrica"
  | "cifra_fuera"
  | "no_es_x_es_y"
  | "emoji"
  | "laminas"
  | "largo"
  | "hashtags"
  | "caption_frases"
  | "caption_sin_cta"
  | "sin_cierre"
  | "longitud_post"
  | "guion_en_nombre"
  | "alcance"
  | "copia_de_ejemplo"

export type Nivel = "frena" | "aviso"

export type Hallazgo = {
  regla: Regla
  nivel: Nivel
  /** "lámina 2 (título)", "caption"... */
  donde: string
  /** Lo que pasa, con el texto que lo provoca. */
  detalle: string
  /** Lo que hay que hacer para que deje de pasar. */
  pide: string
}

export type Arreglo = { regla: Regla; donde: string; detalle: string }

/** Una vuelta al agente para corregir lo que freno. */
export type Correccion = {
  fecha: string
  origen: "automatica" | "manual"
  /** Lo que se le pidio corregir. */
  pedido: Hallazgo[]
  /** Cuantos frenos quedaron despues. 0 = resuelto. */
  frenosDespues: number
}

export type Revision = {
  version: 1
  revisada: string
  frena: boolean
  hallazgos: Hallazgo[]
  arreglos: Arreglo[]
  correcciones: Correccion[]
}

/** Lo de la marca que el revisor necesita. */
export type ReglasMarca = Pick<
  PerfilMarca,
  | "handle"
  | "frases_prohibidas"
  | "hashtags_min"
  | "hashtags_max"
  | "laminas_min"
  | "laminas_max"
  | "emojis_instagram"
  | "emojis_linkedin"
>

export type ContextoRevision = {
  reglas: ReglasMarca
  /** El texto de la noticia que vio el agente: titulo, resumen y material. */
  material: string
  /** Los ejemplos activos de la marca: la pieza no puede copiar de ellos. */
  ejemplos?: { nombre: string; texto: string }[]
  /**
   * Los nombres y descripciones de los CTA de la marca. Lo que dicen se puede
   * repetir aunque un ejemplo lo diga igual: es la misma invitacion de siempre.
   */
  textoCtas?: string
}

/** Lo que la noticia dice: con esto se comprueban las cifras y los nombres. */
export function materialDe(n: { title?: string | null; snippet?: string | null; full_content?: string | null }): string {
  return [n.title, n.snippet, n.full_content].filter(Boolean).join("\n")
}

export function reglasDe(perfil: PerfilMarca): ReglasMarca {
  return {
    handle: perfil.handle,
    frases_prohibidas: perfil.frases_prohibidas,
    hashtags_min: perfil.hashtags_min,
    hashtags_max: perfil.hashtags_max,
    laminas_min: perfil.laminas_min,
    laminas_max: perfil.laminas_max,
    emojis_instagram: perfil.emojis_instagram,
    emojis_linkedin: perfil.emojis_linkedin,
  }
}

/**
 * Las muletillas que el oficio ya prohibe. Son de fabrica y algunas tienen usos
 * legitimos ("impulsar" un motor), por eso solo avisan; las de la marca frenan.
 */
export const FRASES_DE_FABRICA = [
  "revolucionario",
  "sin precedentes",
  "cambio de juego",
  "en el panorama actual",
  "en un mundo cada vez más",
  "esto lo cambia todo",
  "desbloquear",
  "aprovechar el potencial",
  "impulsar",
  "fomentar",
  "en resumen",
]

/** Los topes que pide el oficio. La plantilla no corta, pero se lee peor. */
export const TOPES_CARRUSEL = { hook: 95, titulo: 65, frasesCuerpo: 2, cierreTitulo: 40, cierreTexto: 140 }

/** Palabras del post de LinkedIn segun la variable de longitud. */
const PALABRAS_POST: Record<string, [number, number]> = {
  corto: [80, 120],
  medio: [120, 220],
  largo: [220, 320],
}

// ------------------------------------------------------------------ utilidades

/** Minusculas y sin tildes, para comparar frases sin depender de como se escribieron. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function contieneFrase(texto: string, frase: string): boolean {
  const f = normalizar(frase).trim()
  if (!f) return false
  return new RegExp(`(^|[^a-z0-9])${escapar(f)}($|[^a-z0-9])`).test(normalizar(texto))
}

/** Un trozo del texto alrededor de una posicion, para citarlo en el hallazgo. */
function fragmento(texto: string, indice: number, ancho = 50): string {
  const desde = Math.max(0, indice - ancho)
  const hasta = Math.min(texto.length, indice + ancho)
  return `${desde > 0 ? "…" : ""}${texto.slice(desde, hasta).trim()}${hasta < texto.length ? "…" : ""}`
}

const cita = (t: string, tope = 110) => `«${t.length > tope ? `${t.slice(0, tope - 1).trim()}…` : t}»`

/** Las frases de un texto. Los decimales ("12,5") no cortan. */
export function frases(texto: string): string[] {
  return texto
    .replace(/(\d)[.,](\d)/g, "$1$2")
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter(Boolean)
}

// --------------------------------------------------------------------- cifras

/**
 * Las formas en que se puede escribir la misma cifra: "1.500", "1,500" y "1500"
 * son la misma; "12,5" y "12.5" tambien.
 */
function formas(token: string): string[] {
  const t = token.replace(/[.,]+$/, "")
  return [t, t.replace(/,/g, "."), t.replace(/[.,]/g, ""), t.replace(/,/g, ""), t.replace(/\./g, "").replace(/,/g, ".")]
}

/**
 * Todas las cifras del material, en todas sus formas. "1.8B" o "1.8 billion"
 * suma ademas su forma en millones ("1.800"), que es como se escribe en
 * español y no puede contar como inventada.
 */
function cifrasDelMaterial(material: string): Set<string> {
  const vistas = new Set<string>()
  for (const m of material.matchAll(/(\d+(?:[.,]\d+)*)\s*(billion|bn|b\b|mil millones)?/gi)) {
    for (const f of formas(m[1])) vistas.add(f)
    if (m[2]) {
      const valor = Number(m[1].replace(/,/g, "")) * 1000
      if (Number.isFinite(valor)) {
        const entero = Math.round(valor)
        vistas.add(String(entero))
        vistas.add(entero.toLocaleString("de-DE"))
      }
    }
  }
  return vistas
}

/**
 * Las cifras de un texto que hay que comprobar. Las de un solo digito sin
 * porcentaje se saltan: suelen ser conteos de la propia pieza ("tres claves",
 * "2 frases") o parte de un nombre ("Gemini 4"), y frenarlas seria ruido.
 */
function cifrasDelTexto(texto: string): { token: string; indice: number }[] {
  const salida: { token: string; indice: number }[] = []
  for (const m of texto.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const token = m[0].replace(/[.,]+$/, "")
    const indice = m.index ?? 0
    const conPorcentaje = /^\s*%/.test(texto.slice(indice + m[0].length))
    if (/^\d$/.test(token) && !conPorcentaje) continue
    salida.push({ token, indice })
  }
  return salida
}

// --------------------------------------------------------------- los textos

type Campo = { donde: string; texto: string }

const NOMBRE_CAMPO: Record<string, string> = {
  hook: "hook",
  title: "título",
  body: "cuerpo",
  lead: "entradilla",
  items: "lista",
}

type Bruto = Record<string, unknown>

const esObjeto = (v: unknown): v is Bruto => Boolean(v) && typeof v === "object" && !Array.isArray(v)

function slidesDe(bruto: Bruto): Bruto[] {
  return Array.isArray(bruto.slides) ? bruto.slides.filter(esObjeto) : []
}

/**
 * Pasa una funcion por cada texto del guion y devuelve el guion nuevo. Es la
 * misma lista de textos que se revisa, asi que lo que se arregla y lo que se
 * comprueba nunca se desfasan.
 */
function mapearTextosCarrusel(bruto: Bruto, fn: (donde: string, texto: string) => string): Bruto {
  const slides = slidesDe(bruto).map((s, i) => {
    const nueva: Bruto = { ...s }
    for (const clave of ["hook", "title", "body", "lead"]) {
      if (typeof s[clave] === "string") nueva[clave] = fn(`lámina ${i + 1} (${NOMBRE_CAMPO[clave]})`, s[clave] as string)
    }
    if (Array.isArray(s.items)) {
      nueva.items = s.items.map((it) => (typeof it === "string" ? fn(`lámina ${i + 1} (lista)`, it) : it))
    }
    return nueva
  })
  const cierre = esObjeto(bruto.cierre)
    ? {
        ...bruto.cierre,
        ...(typeof bruto.cierre.title === "string" ? { title: fn("cierre (título)", bruto.cierre.title) } : {}),
        ...(typeof bruto.cierre.body === "string" ? { body: fn("cierre (texto)", bruto.cierre.body) } : {}),
      }
    : bruto.cierre
  return {
    ...bruto,
    slides,
    cierre,
    ...(typeof bruto.caption === "string" ? { caption: fn("caption", bruto.caption) } : {}),
  }
}

function camposCarrusel(bruto: Bruto): Campo[] {
  const campos: Campo[] = []
  mapearTextosCarrusel(bruto, (donde, texto) => {
    if (texto.trim()) campos.push({ donde, texto })
    return texto
  })
  return campos
}

// ------------------------------------------------- reglas comunes a las redes

/**
 * Los nombres con guion de la fuente ("GPT-6", "COVID-19", "Wi-Fi"). Solo los
 * que llevan mayuscula o digito: "e-commerce" o "bien-estar" no son nombres.
 */
function nombresConGuion(material: string): string[] {
  const vistos = new Set<string>()
  for (const m of material.matchAll(/\b[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g)) {
    if (/[A-Z0-9]/.test(m[0])) vistos.add(m[0])
  }
  return [...vistos]
}

/**
 * Devuelve el texto con el guion de los nombres repuesto, y lo que cambio. El
 * guion se pierde de dos formas: cambiado por un espacio ("GPT 6") o quitado
 * sin mas ("GPT4o", "gpt6luna"), que es lo que hace un agente que entiende la
 * regla de "sin guiones" de mas.
 */
function reponerGuiones(texto: string, nombres: string[]): { texto: string; cambios: string[] } {
  let salida = texto
  const cambios: string[] = []
  for (const nombre of nombres) {
    for (const perdido of new Set([nombre.replace(/-/g, " "), nombre.replace(/-/g, "")])) {
      if (perdido.length < 3) continue
      const patron = new RegExp(`(?<![A-Za-z0-9-])${escapar(perdido)}(?![A-Za-z0-9])`, "g")
      if (patron.test(salida)) {
        salida = salida.replace(patron, nombre)
        cambios.push(`${perdido} → ${nombre}`)
      }
    }
  }
  return { texto: salida, cambios }
}

/**
 * Las expresiones de alcance: cuantos o que tan extendido es algo. Suenan a
 * dato, y en la prueba de la pieza 004 fueron el fallo que mas resto: "miles de
 * bots", "los modelos que mas pymes integraron", "nadie sabe". Valen si el
 * material las trae, en español o en ingles, que es como llegan muchas fuentes.
 */
const ALCANCE: { es: RegExp; en: RegExp; tipo: "cantidad" | "absoluto" }[] = [
  { es: /(?<!\d\s?)\bmiles de\b/, en: /\bthousands\b|\bmiles de\b/, tipo: "cantidad" },
  { es: /(?<!\d\s?)\bcientos de\b/, en: /\bhundreds\b|\bcientos de\b/, tipo: "cantidad" },
  { es: /(?<!\d\s?)\bdecenas de\b/, en: /\bdozens\b|\btens of\b|\bdecenas de\b/, tipo: "cantidad" },
  { es: /(?<![\d.,]\s?)\bmillones de\b/, en: /\bmillions of\b|(?<![\d.,]\s?)\bmillones de\b/, tipo: "cantidad" },
  { es: /\bla (mayoria|mayor parte) de\b/, en: /\bmost\b|\bmajority\b|\bla (mayoria|mayor parte)\b/, tipo: "cantidad" },
  { es: /\bnadie\b/, en: /\bnobody\b|\bno one\b|\bnadie\b/, tipo: "absoluto" },
  { es: /\btodo el mundo\b/, en: /\beveryone\b|\beverybody\b|\btodo el mundo\b/, tipo: "absoluto" },
  { es: /\b(ninguna empresa|ningun negocio|ninguna marca)\b/, en: /\bno (company|business|one)\b|\bninguna empresa\b|\bningun negocio\b/, tipo: "absoluto" },
  { es: /\btod[oa]s l[oa]s (empresas|negocios|pymes|marcas|companias)\b/, en: /\b(all|every) (companies|company|businesses|business)\b|\btod[oa]s l[oa]s (empresas|negocios)\b/, tipo: "absoluto" },
]

/** El alcance sin respaldo en el angulo y la tesis: lo que el escritor heredaria como dato. */
export function alcanceDelAngulo(respuesta: unknown, material: string): Hallazgo[] {
  if (!esObjeto(respuesta)) return []
  const campos: Campo[] = []
  if (typeof respuesta.angle === "string") campos.push({ donde: "ángulo", texto: respuesta.angle })
  if (typeof respuesta.thesis === "string") campos.push({ donde: "tesis", texto: respuesta.thesis })
  return reglaDeAlcance(campos, material)
}

/**
 * Lo dicho como posibilidad no es un dato: "puede que nadie lo recuerde" es
 * justo como el oficio pide decirlo. Se mira lo que va justo antes.
 */
const POSIBILIDAD = /\b(puede que|pueda que|es probable que|probablemente|posiblemente|quiza|quizas|tal vez|podria|podrian|seguramente|es posible que|si)\b[^.!?;:]{0,40}$/

/** Palabras que no dicen de que se habla: no sirven para saber si el respaldo es el mismo. */
const VACIAS = new Set([
  "porque", "cuando", "donde", "sobre", "entre", "desde", "hasta", "puede", "pueden", "tiene", "tienen", "hacer", "hacen",
  "estos", "estas", "otros", "otras", "mismo", "misma", "nadie", "mayoria", "mayor", "parte", "todos", "todas", "mundo",
  "miles", "cientos", "decenas", "millones", "ninguna", "ningun", "which", "there", "their", "about", "would", "could",
  "these", "those", "other", "nobody", "everyone", "everybody", "thousands", "hundreds", "dozens", "millions", "majority",
  "still", "every", "being", "after", "before", "where", "while", "should", "because",
])

/** Las raices de un texto: los primeros cinco caracteres de cada palabra con peso. Cruzan idiomas (integraciones, integrations). */
function raices(texto: string): Set<string> {
  return new Set(
    (normalizar(texto).match(/[\p{L}]{5,}/gu) ?? []).filter((w) => !VACIAS.has(w)).map((w) => w.slice(0, 5))
  )
}

const frasesDe = (texto: string) => texto.split(/(?<=[.!?;:])\s+|\n+/).filter((f) => f.trim())

/** Las palabras que siguen a una posicion: lo que se esta contando ("la mayoria de *integraciones de IA*"). */
const loQueSigue = (t: string, desde: number, cuantas: number) =>
  (t.slice(desde).match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, cuantas).join(" ")

/**
 * El material respalda una expresion de alcance si alguna frase suya la trae
 * contando lo mismo: lo que sigue a la expresion en el texto y lo que sigue a
 * la del material comparten alguna raiz. Que "most" aparezca en "our most
 * efficient model" no respalda "la mayoria de integraciones"; "most
 * integrations were built..." si.
 */
function respaldada(a: (typeof ALCANCE)[number], loContado: string, frasesDelMaterial: string[]): boolean {
  const delTexto = raices(loContado)
  if (delTexto.size === 0) return false
  return frasesDelMaterial.some((f) => {
    const n = normalizar(f)
    const m = new RegExp(a.en.source, "g")
    for (const hallado of n.matchAll(m)) {
      for (const r of raices(loQueSigue(n, hallado.index + hallado[0].length, 6))) if (delTexto.has(r)) return true
    }
    return false
  })
}

function reglaDeAlcance(campos: Campo[], material: string): Hallazgo[] {
  const delMaterial = frasesDe(material)
  const hallazgos: Hallazgo[] = []
  for (const { donde, texto } of campos) {
    if (donde.startsWith("cierre")) continue
    for (const frase of frasesDe(texto)) {
      const t = normalizar(frase)
      for (const a of ALCANCE) {
        const m = a.es.exec(t)
        if (!m) continue
        if (POSIBILIDAD.test(t.slice(0, m.index))) continue
        if (respaldada(a, loQueSigue(t, m.index + m[0].length, 5), delMaterial)) continue
        hallazgos.push({
          regla: "alcance",
          nivel: "frena",
          donde,
          detalle: `Dice «${m[0]}» y el material no dice ${a.tipo === "cantidad" ? "cuántos son" : "que sea así para todos"}: ${cita(fragmento(frase, m.index, 60))}`,
          pide:
            a.tipo === "cantidad"
              ? "Quita la cantidad o dila como posibilidad («puede afectar a…»). Solo afirma cuántos si el material lo dice de esto mismo."
              : "Dilo como lo que se sabe («puede que no te llegue el aviso») o atribúyelo a la fuente. Solo afirma «nadie» o «todos» si el material lo dice de esto mismo.",
        })
      }
    }
  }
  return hallazgos
}

/** Cuantas palabras seguidas iguales a un ejemplo ya son copia y no coincidencia. */
export const PALABRAS_COPIA = 7

const palabrasDe = (texto: string) => texto.match(/[\p{L}\p{N}]+/gu) ?? []

function gramas(texto: string): Set<string> {
  const p = palabrasDe(normalizar(texto))
  const salida = new Set<string>()
  for (let i = 0; i + PALABRAS_COPIA <= p.length; i++) salida.add(p.slice(i, i + PALABRAS_COPIA).join(" "))
  return salida
}

/**
 * Una pieza que repite siete palabras seguidas de un ejemplo lo esta copiando.
 * Frena: el ejemplo enseña el tono, no se publica dos veces. No cuenta lo que
 * tambien dice el material (una cita de la fuente) ni lo que dicen los CTA de
 * la marca, y el cierre no se mira: es la misma invitacion de siempre.
 */
function reglaDeCopia(campos: Campo[], ctx: ContextoRevision): Hallazgo[] {
  if (!ctx.ejemplos?.length) return []
  const permitidos = new Set([...gramas(ctx.material), ...gramas(ctx.textoCtas ?? "")])
  const ejemplos = ctx.ejemplos.map((e) => ({ nombre: e.nombre, gramas: gramas(e.texto) }))
  const hallazgos: Hallazgo[] = []
  for (const { donde, texto } of campos) {
    if (donde.startsWith("cierre")) continue
    const originales = palabrasDe(texto)
    const p = palabrasDe(normalizar(texto))
    for (let i = 0; i + PALABRAS_COPIA <= p.length; i++) {
      const g = p.slice(i, i + PALABRAS_COPIA).join(" ")
      if (permitidos.has(g)) continue
      const de = ejemplos.find((e) => e.gramas.has(g))
      if (!de) continue
      hallazgos.push({
        regla: "copia_de_ejemplo",
        nivel: "frena",
        donde,
        detalle: `Copia del ejemplo «${de.nombre}»: «…${originales.slice(i, i + PALABRAS_COPIA).join(" ")}…»`,
        pide: "Escríbelo con tus palabras y desde el contenido de esta pieza: el ejemplo enseña el tono, no se copia.",
      })
      break
    }
  }
  return hallazgos
}

const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u

const FORMULA_NO_ES = /\b(ya )?no (es|son|fue|era)\b[^.;:!?]{1,90}?,\s*(sino\s+)?(es|son|fue|era)\b/i
/** La misma formula partida en dos frases: "No es miedo. Es criterio." */
const FORMULA_NO_ES_EN_DOS = /\b(ya )?no (es|son|fue|era)\b[^.;:!?\n]{1,60}\.\s+(es|son|fue|era)\b/i

/**
 * Lo que el revisor castiga en un texto cualquiera, en una linea cada cosa.
 * Para los ejemplos que se importan: el agente imita lo que ve, asi que un
 * vicio en un ejemplo acaba en todas las piezas. Aqui cuenta tambien la
 * formula partida en dos frases, que en un ejemplo pesa igual.
 */
export function viciosDeTexto(texto: string, frasesProhibidas: string[]): string[] {
  const vicios: string[] = []
  for (const regla of [FORMULA_NO_ES, FORMULA_NO_ES_EN_DOS]) {
    const formula = regla.exec(texto)
    if (formula) vicios.push(`Usa la fórmula «No es X, es Y»: ${cita(fragmento(texto, formula.index, 60))}`)
  }
  const guion = texto.search(/[—–]/)
  if (guion >= 0) vicios.push(`Tiene un guion largo o medio: ${cita(fragmento(texto, guion))}`)
  for (const frase of frasesProhibidas) {
    if (contieneFrase(texto, frase)) vicios.push(`Usa «${frase}», que está en las frases prohibidas de la marca.`)
  }
  for (const frase of FRASES_DE_FABRICA) {
    if (contieneFrase(texto, frase)) vicios.push(`Usa «${frase}», una muletilla que suena a texto genérico.`)
  }
  return vicios
}

function reglasDeTexto(campos: Campo[], ctx: ContextoRevision, emojisPermitidos: boolean): Hallazgo[] {
  const hallazgos: Hallazgo[] = []
  const cifras = cifrasDelMaterial(ctx.material)

  for (const { donde, texto } of campos) {
    const guion = texto.search(/[—–]/)
    if (guion >= 0) {
      hallazgos.push({
        regla: "guion_largo",
        nivel: "frena",
        donde,
        detalle: `Tiene un guion ${texto[guion] === "—" ? "largo (—)" : "medio (–)"}: ${cita(fragmento(texto, guion))}`,
        pide: "Cambia el guion por coma, punto, dos puntos o paréntesis.",
      })
    }

    for (const frase of ctx.reglas.frases_prohibidas) {
      if (contieneFrase(texto, frase)) {
        hallazgos.push({
          regla: "frase_prohibida",
          nivel: "frena",
          donde,
          detalle: `Usa «${frase}», que está en las frases prohibidas de la marca.`,
          pide: `Reescribe esa frase sin «${frase}» ni nada parecido.`,
        })
      }
    }
    for (const frase of FRASES_DE_FABRICA) {
      if (ctx.reglas.frases_prohibidas.some((p) => normalizar(p) === normalizar(frase))) continue
      if (contieneFrase(texto, frase)) {
        hallazgos.push({
          regla: "frase_de_fabrica",
          nivel: "aviso",
          donde,
          detalle: `Usa «${frase}», una muletilla que suena a texto genérico.`,
          pide: `Cámbiala por el hecho o el dato concreto que quiere decir.`,
        })
      }
    }

    // "No es X, es Y", y sus variantes con "sino" o "ya no es". El oficio la
    // prohibe y es la muletilla que mas se colaba: tres de cinco carruseles.
    const formula = FORMULA_NO_ES.exec(texto)
    if (formula) {
      hallazgos.push({
        regla: "no_es_x_es_y",
        nivel: "aviso",
        donde,
        detalle: `Usa la fórmula «No es X, es Y»: ${cita(fragmento(texto, formula.index, 70))}`,
        pide: "Dilo en afirmativo: lo que es, sin contraponerlo a lo que no es.",
      })
    }

    if (!emojisPermitidos) {
      const emoji = EMOJI.exec(texto)
      if (emoji) {
        hallazgos.push({
          regla: "emoji",
          nivel: "frena",
          donde,
          detalle: `Lleva un emoji (${emoji[0]}) y la marca no los usa en esta red.`,
          pide: "Quita el emoji.",
        })
      }
    }

    // El cierre es la invitacion de la marca: sus numeros, si los hay, no
    // salen de la noticia.
    if (donde.startsWith("cierre")) continue
    for (const { token, indice } of cifrasDelTexto(texto)) {
      if (formas(token).some((f) => cifras.has(f))) continue
      hallazgos.push({
        regla: "cifra_fuera",
        nivel: "frena",
        donde,
        detalle: `La cifra «${token}» no aparece en el material de la noticia: ${cita(fragmento(texto, indice))}`,
        pide: "Usa solo cifras que estén en el material. Si esta no está, quítala o di lo mismo sin el número.",
      })
    }
  }

  return [...hallazgos, ...reglaDeAlcance(campos, ctx.material), ...reglaDeCopia(campos, ctx)]
}

// ------------------------------------------------------------------ carrusel

/** Un hashtag como se publica: minusculas, sin tildes, sin espacios ni signos. */
export function limpiarHashtag(h: string): string {
  return normalizar(h.replace(/^#+/, "")).replace(/[^a-z0-9_]/g, "")
}

/**
 * Lo que se arregla solo en el guion del carrusel, antes de dibujarlo: los
 * guiones perdidos en los nombres y los hashtags. Nada de esto cambia lo que
 * dice la pieza.
 */
export function arreglarCarrusel(respuesta: unknown, ctx: ContextoRevision): { respuesta: unknown; arreglos: Arreglo[] } {
  if (!esObjeto(respuesta)) return { respuesta, arreglos: [] }
  const arreglos: Arreglo[] = []

  const nombres = nombresConGuion(ctx.material)
  let bruto = respuesta
  if (nombres.length > 0) {
    bruto = mapearTextosCarrusel(respuesta, (donde, texto) => {
      const r = reponerGuiones(texto, nombres)
      for (const c of r.cambios) arreglos.push({ regla: "guion_en_nombre", donde, detalle: c })
      return r.texto
    })
  }

  if (Array.isArray(bruto.hashtags)) {
    const originales = bruto.hashtags.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    const limpios: string[] = []
    for (const h of originales) {
      const limpio = limpiarHashtag(h)
      if (!limpio) continue
      if (limpios.includes(limpio)) {
        arreglos.push({ regla: "hashtags", donde: "hashtags", detalle: `#${limpio} repetido, se quita` })
        continue
      }
      if (limpio !== h.replace(/^#+/, "").trim()) {
        arreglos.push({ regla: "hashtags", donde: "hashtags", detalle: `${h.trim()} → #${limpio}` })
      }
      limpios.push(limpio)
    }
    const max = ctx.reglas.hashtags_max
    if (limpios.length > max) {
      const sobran = limpios.splice(max)
      arreglos.push({
        regla: "hashtags",
        donde: "hashtags",
        detalle: `${sobran.length > 1 ? "Sobraban" : "Sobraba"} ${sobran.map((h) => `#${h}`).join(" ")}: la marca pide como máximo ${max}`,
      })
    }
    bruto = { ...bruto, hashtags: limpios }
  }

  return { respuesta: bruto, arreglos }
}

/** Lo que el caption tiene que nombrar para pedir lo mismo que el cierre. */
function captionPideElCta(caption: string, cierre: Bruto, handle: string): boolean {
  const titulo = typeof cierre.title === "string" ? cierre.title : ""
  const palabras = titulo.match(/\b[A-ZÁÉÍÓÚÑ]{3,}\b/g) ?? []
  if (palabras.length > 0) return palabras.every((p) => caption.includes(p))

  const c = normalizar(caption)
  switch (cierre.tipo) {
    case "seguir":
      return (handle !== "" && c.includes(normalizar(handle))) || /\bsig(ue|uenos|an|ueme|uir)\b/.test(c) || c.includes("seguir")
    case "comentar":
    case "palabra":
      return c.includes("coment")
    case "dm":
      return /mensaje|\bdm\b|escrib/.test(c)
    default:
      return true
  }
}

export function revisarCarrusel(respuesta: unknown, ctx: ContextoRevision): Hallazgo[] {
  if (!esObjeto(respuesta)) {
    return [{ regla: "laminas", nivel: "frena", donde: "guion", detalle: "El guion no se pudo leer.", pide: "Devuelve el JSON completo con el formato pedido." }]
  }
  const r = ctx.reglas
  const hallazgos = reglasDeTexto(camposCarrusel(respuesta), ctx, r.emojis_instagram)

  const slides = slidesDe(respuesta)
  if (slides.length < r.laminas_min || slides.length > r.laminas_max) {
    const rango = r.laminas_min === r.laminas_max ? `${r.laminas_min}` : `de ${r.laminas_min} a ${r.laminas_max}`
    hallazgos.push({
      regla: "laminas",
      nivel: "aviso",
      donde: "láminas",
      detalle: `Tiene ${slides.length} láminas (sin el cierre) y la marca pide ${rango}.`,
      pide:
        slides.length > r.laminas_max
          ? `Quédate con ${r.laminas_max} como máximo: junta o quita la lámina más débil.`
          : `Llega a ${r.laminas_min} con ideas que estén en el material; si no da para más, no rellenes.`,
    })
  }

  slides.forEach((s, i) => {
    const n = i + 1
    if (typeof s.hook === "string" && s.hook.length > TOPES_CARRUSEL.hook) {
      hallazgos.push({
        regla: "largo",
        nivel: "aviso",
        donde: `lámina ${n} (hook)`,
        detalle: `El hook tiene ${s.hook.length} caracteres y el máximo es ${TOPES_CARRUSEL.hook}.`,
        pide: `Acórtalo a ${TOPES_CARRUSEL.hook} quitando adjetivos y conectores; la cifra y el actor se quedan.`,
      })
    }
    if (typeof s.title === "string" && s.title.length > TOPES_CARRUSEL.titulo) {
      hallazgos.push({
        regla: "largo",
        nivel: "aviso",
        donde: `lámina ${n} (título)`,
        detalle: `El título tiene ${s.title.length} caracteres y el máximo es ${TOPES_CARRUSEL.titulo}: ${cita(s.title)}`,
        pide: `Déjalo en ${TOPES_CARRUSEL.titulo} o menos; el matiz o la condición pasan al cuerpo.`,
      })
    }
    if (typeof s.body === "string" && frases(s.body).length > TOPES_CARRUSEL.frasesCuerpo) {
      hallazgos.push({
        regla: "largo",
        nivel: "aviso",
        donde: `lámina ${n} (cuerpo)`,
        detalle: `El cuerpo tiene ${frases(s.body).length} frases y el máximo es ${TOPES_CARRUSEL.frasesCuerpo}.`,
        pide: `Déjalo en ${TOPES_CARRUSEL.frasesCuerpo} frases.`,
      })
    }
  })

  const cierre = esObjeto(respuesta.cierre) ? respuesta.cierre : null
  const tituloCierre = typeof cierre?.title === "string" ? cierre.title.trim() : ""
  if (cierre && tituloCierre) {
    if (tituloCierre.length > TOPES_CARRUSEL.cierreTitulo) {
      hallazgos.push({
        regla: "largo",
        nivel: "aviso",
        donde: "cierre (título)",
        detalle: `Tiene ${tituloCierre.length} caracteres y el máximo es ${TOPES_CARRUSEL.cierreTitulo}.`,
        pide: `Deja la acción en ${TOPES_CARRUSEL.cierreTitulo} caracteres o menos.`,
      })
    }
    const textoCierre = typeof cierre.body === "string" ? cierre.body : ""
    if (textoCierre.length > TOPES_CARRUSEL.cierreTexto) {
      hallazgos.push({
        regla: "largo",
        nivel: "aviso",
        donde: "cierre (texto)",
        detalle: `Tiene ${textoCierre.length} caracteres y el máximo es ${TOPES_CARRUSEL.cierreTexto}.`,
        pide: `Deja la razón en ${TOPES_CARRUSEL.cierreTexto} caracteres o menos.`,
      })
    }
  } else {
    // Frena siempre: no hay texto de respaldo, y un carrusel sin cierre no pide nada.
    hallazgos.push({
      regla: "sin_cierre",
      nivel: "frena",
      donde: "cierre",
      detalle: "El guion no trae cierre: el carrusel saldría sin lámina de cierre.",
      pide: "Escribe el cierre con el CTA de la clasificación, o invitando a seguir la cuenta si no hay CTA, ligado a lo que enseñó este carrusel.",
    })
  }

  const caption = typeof respuesta.caption === "string" ? respuesta.caption.trim() : ""
  // La linea de la fuente ("Fuente: Mashable.") no es una frase del caption.
  const nFrases = frases(caption).filter((f) => !/^fuentes?\s*:/i.test(f)).length
  if (nFrases < 2 || nFrases > 4) {
    hallazgos.push({
      regla: "caption_frases",
      nivel: "aviso",
      donde: "caption",
      detalle: `El caption tiene ${nFrases} ${nFrases === 1 ? "frase" : "frases"} y se piden de 2 a 4.`,
      pide: nFrases > 4 ? "Déjalo en 4 frases: la tesis, el porqué y el CTA." : "Escribe de 2 a 4 frases con la tesis y el CTA.",
    })
  }
  if (cierre && tituloCierre && caption && !captionPideElCta(caption, cierre, r.handle)) {
    hallazgos.push({
      regla: "caption_sin_cta",
      nivel: "aviso",
      donde: "caption",
      detalle: `El caption no pide lo mismo que el cierre (${cita(tituloCierre)}).`,
      pide: "Termina el caption con la misma acción del cierre, con sus mismas palabras clave.",
    })
  }

  const hashtags = Array.isArray(respuesta.hashtags) ? respuesta.hashtags.length : 0
  if (hashtags < r.hashtags_min) {
    hallazgos.push({
      regla: "hashtags",
      nivel: "aviso",
      donde: "hashtags",
      detalle: `Lleva ${hashtags} hashtags y la marca pide al menos ${r.hashtags_min}.`,
      pide: `Añade hasta llegar a ${r.hashtags_min}, específicos y buscables, del tema de la pieza.`,
    })
  }

  return hallazgos
}

// --------------------------------------------------------------------- post

/** El post de LinkedIn con los guiones de los nombres repuestos. */
export function arreglarPost(post: string, ctx: ContextoRevision): { post: string; arreglos: Arreglo[] } {
  const r = reponerGuiones(post, nombresConGuion(ctx.material))
  return { post: r.texto, arreglos: r.cambios.map((detalle) => ({ regla: "guion_en_nombre", donde: "post", detalle })) }
}

export function revisarPost(post: string, ctx: ContextoRevision, longitud?: string): Hallazgo[] {
  const parrafos = post.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const campos = parrafos.map((texto, i) => ({ donde: i === 0 ? "post (hook)" : `post (párrafo ${i + 1})`, texto }))
  const hallazgos = reglasDeTexto(campos, ctx, ctx.reglas.emojis_linkedin)

  const rango = longitud ? PALABRAS_POST[longitud] : undefined
  if (rango) {
    const palabras = post.split(/\s+/).filter(Boolean).length
    // Un diez por ciento de holgura: el oficio da un rango, no una cifra exacta.
    if (palabras < rango[0] * 0.9 || palabras > rango[1] * 1.1) {
      hallazgos.push({
        regla: "longitud_post",
        nivel: "aviso",
        donde: "post",
        detalle: `Tiene ${palabras} palabras y la longitud «${longitud}» pide de ${rango[0]} a ${rango[1]}.`,
        pide: palabras > rango[1] ? `Recórtalo a ${rango[1]} palabras como mucho.` : `Llévalo a ${rango[0]} palabras al menos, sin relleno.`,
      })
    }
  }
  return hallazgos
}

// ------------------------------------------------------------------ revision

export function armarRevision(hallazgos: Hallazgo[], arreglos: Arreglo[], correcciones: Correccion[] = []): Revision {
  return {
    version: 1,
    revisada: new Date().toISOString(),
    frena: hallazgos.some((h) => h.nivel === "frena"),
    hallazgos,
    arreglos,
    correcciones,
  }
}

export const frenosDe = (hallazgos: Hallazgo[]) => hallazgos.filter((h) => h.nivel === "frena")

export function parseRevision(valor: unknown): Revision | null {
  if (!esObjeto(valor) || valor.version !== 1) return null
  const lista = <T>(v: unknown) => (Array.isArray(v) ? (v.filter(esObjeto) as T[]) : [])
  const hallazgos = lista<Hallazgo>(valor.hallazgos)
  return {
    version: 1,
    revisada: typeof valor.revisada === "string" ? valor.revisada : "",
    frena: hallazgos.some((h) => h.nivel === "frena"),
    hallazgos,
    arreglos: lista<Arreglo>(valor.arreglos),
    correcciones: lista<Correccion>(valor.correcciones),
  }
}

/**
 * El pedido de correccion que se le manda al agente: cada hallazgo con donde
 * esta, que pasa y que hacer. Lo que frena va primero y marcado como
 * obligatorio; los avisos, como mejora si no empeora la pieza.
 */
export function pedidoDeCorreccion(hallazgos: Hallazgo[]): string {
  const ordenados = [...frenosDe(hallazgos), ...hallazgos.filter((h) => h.nivel === "aviso")]
  const lineas = ordenados.map(
    (h, i) => `${i + 1}. ${h.nivel === "frena" ? "OBLIGATORIO" : "Mejora"} · ${h.donde}: ${h.detalle} Qué hacer: ${h.pide}`
  )
  return `EL REVISOR AUTOMÁTICO ENCONTRÓ ESTO EN TU VERSIÓN ANTERIOR
Lo marcado OBLIGATORIO impide publicar la pieza: corrígelo sí o sí. Lo marcado Mejora, corrígelo si puedes sin empeorar la pieza.
${lineas.join("\n")}

Devuelve la pieza completa, con el mismo formato de respuesta. Cambia solo lo necesario para resolver esto; lo que estaba bien se queda igual.`
}
