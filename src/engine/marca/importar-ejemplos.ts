import { llamarClaude, parsearJSONDeClaude } from "../claude/messages"
import { viciosDeTexto } from "../content/revisor"
import { NOMBRE_OBJETIVO, OBJETIVOS, type Objetivo } from "./clasificacion"
import { NOMBRE_TIPO_CTA } from "./cuando"
import { identidadEditorial, TIPOS_CTA, type IdentidadEditorial, type TipoCta } from "./editorial"
import {
  ejemplosDe,
  QUE_ES_TIPO_LAMINA,
  textoDeCarrusel,
  TIPOS_LAMINA,
  TOPES_EJEMPLO,
  type CamposEjemplo,
  type LaminaDeEjemplo,
  type RedEjemplo,
  type TipoLamina,
} from "./ejemplos"
import {
  buscarInicio,
  esDuplicado,
  MAX_EJEMPLOS_ARCHIVO,
  partirArchivo,
  TOPE_ARCHIVO,
  trozosAjenos,
  trozosQueFaltan,
  type PropuestaEjemplo,
  type ResultadoImportacion,
} from "./importar-ejemplos-modelo"
import { perfilDe } from "./perfil"

export * from "./importar-ejemplos-modelo"

/**
 * Importar ejemplos desde un archivo: Claude separa y ordena, el codigo
 * comprueba y la persona decide. Nada se guarda aqui.
 *
 * Va en dos pasos para que un archivo con doce piezas no sea una sola
 * respuesta enorme (lenta y facil de cortar): primero un indice con donde
 * empieza cada pieza, y despues una llamada por pieza con solo su trozo, varias
 * a la vez. Opus en las dos: la calidad del ejemplo es la de todas las piezas
 * que lo lean.
 */

const MODELO = "claude-opus-5-5"
const A_LA_VEZ = 6

const SISTEMA_INDICE = `Recibes un archivo con piezas de contenido de una marca: carruseles de Instagram, posts de LinkedIn o los dos. Tu trabajo es hacer el índice: qué piezas hay y dónde empieza cada una.

Cuenta como una pieza cada carrusel de Instagram y cada post de LinkedIn. Si una misma pieza tiene versión de Instagram y de LinkedIn, son dos entradas. No cuentes notas internas, instrucciones para el diseñador ni borradores descartados.

Para cada pieza devuelve:
- "nombre": su título, corto.
- "red": "instagram" o "linkedin".
- "inicio": las primeras 8 a 15 palabras con que empieza su bloque en el archivo, copiadas exactamente, letra por letra. Si el bloque tiene un encabezado o un "por qué" antes del texto, empieza ahí.

Responde solo con JSON, sin comentarios: {"piezas":[{"nombre":"...","red":"instagram","inicio":"..."}]}. Si no hay ninguna pieza, {"piezas":[]}.`

function sistemaPieza(editorial: IdentidadEditorial): string {
  const pilares = editorial.pilares.length
    ? editorial.pilares.map((p) => `- ${p.id}: ${p.name}${p.description ? `. ${p.description}` : ""}`).join("\n")
    : "(la marca no tiene pilares)"
  const ctas = editorial.ctas.length
    ? editorial.ctas.map((c) => `- «${c.name}» es de tipo "${c.tipo}"`).join("\n")
    : "(la marca no tiene CTA)"
  return `Recibes una pieza de contenido de una marca, copiada de un archivo. La vas a guardar como ejemplo: un agente la leerá para aprender cómo suena y cómo avanza una pieza de esta marca. Por eso el texto tiene que quedar exactamente como lo escribió la marca.

REGLA PRINCIPAL: copia el texto tal cual. No corrijas, no resumas, no traduzcas, no cambies palabras ni el orden. Solo lo repartes en campos. Lo que no sea texto de la pieza (notas para el diseñador, metadatos, el nombre del archivo) se queda fuera.

Si es un carrusel de Instagram:
- "laminas": una entrada por lámina, en orden, incluida la de cierre. Cada una con:
  - "tipo": uno de estos:
${TIPOS_LAMINA.map((t) => `    - "${t}": ${QUE_ES_TIPO_LAMINA[t]}`).join("\n")}
  - "antetitulo": la línea pequeña sobre el título (sección, fecha, «Criterio de Plogy»), o "".
  - "titulo": el título de la lámina.
  - "cuerpo": el resto del texto, con sus saltos de línea. Las fuentes y notas al pie también van aquí.
  - "items": si la lámina es una lista, cada elemento sin el número ni la viñeta. Entonces esos elementos no se repiten en "cuerpo".
  - "visual": si la lámina tenía un elemento que no es texto (una tabla, una maqueta, un gráfico, una foto con sentido), descríbelo en una línea; si el archivo ya lo describe entre corchetes, usa esa descripción. Si no, "".
- "caption" y "hashtags" (lista, con #), si están.
- "post": "".

Si es un post de LinkedIn:
- "post": el texto entero, con sus párrafos y sus hashtags si los tiene.
- "laminas": [], "caption": "", "hashtags": [].

Clasifícala con lo que tiene la marca:
- "pilar": el id del pilar que mejor le corresponde, o null si ninguno encaja.
${pilares}
- "cta_tipo": el tipo de la acción que pide el cierre: ${TIPOS_CTA.map((t) => `"${t}" (${NOMBRE_TIPO_CTA[t]})`).join(", ")}, o null si no pide nada. Los CTA de la marca, por si el cierre usa uno:
${ctas}
  "palabra" es «comenta una palabra y te mandamos algo»; "comentar" es pedir una opinión o una experiencia en los comentarios; "dm" es pedir que escriban por mensaje directo.
- "objetivo": ${OBJETIVOS.map((o) => `"${o}" (${NOMBRE_OBJETIVO[o]})`).join(", ")}, o null.

"por_que": qué tiene que aprender un agente de esta pieza, en dos a cuatro frases concretas (cómo trata las fuentes, cómo avanza, qué hace el cierre). Si el archivo trae un «por qué es buena» o algo equivalente para esta pieza, cópialo tal cual y pon "por_que_del_archivo": true. Si no, escríbelo tú y pon false. No inventes méritos que la pieza no tiene.

"nombre": el título de la pieza, corto.

Responde solo con JSON, sin comentarios:
{"red":"instagram","nombre":"...","laminas":[{"tipo":"portada","antetitulo":"","titulo":"...","cuerpo":"...","items":[],"visual":""}],"caption":"...","hashtags":["#..."],"post":"","pilar":null,"cta_tipo":null,"objetivo":null,"por_que":"...","por_que_del_archivo":false}`
}

type Indice = { nombre: string; red: RedEjemplo; inicio: string }

type PiezaExtraida = {
  red: RedEjemplo
  nombre: string
  laminas: (LaminaDeEjemplo & { antetitulo?: string; titulo?: string; cuerpo?: string })[]
  caption: string
  hashtags: string[]
  post: string
  pilar: string | null
  cta_tipo: TipoCta | null
  objetivo: Objetivo | null
  por_que: string
  por_que_del_archivo: boolean
}

const cadena = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const lista = (v: unknown) => (Array.isArray(v) ? v.map(cadena).filter(Boolean) : [])
const red = (v: unknown): RedEjemplo => (v === "linkedin" ? "linkedin" : "instagram")

function parseIndice(texto: string): Indice[] {
  const bruto = parsearJSONDeClaude(texto) as { piezas?: unknown }
  return (Array.isArray(bruto?.piezas) ? bruto.piezas : [])
    .map((p) => p as Record<string, unknown>)
    .map((p) => ({ nombre: cadena(p.nombre), red: red(p.red), inicio: cadena(p.inicio) }))
    .filter((p) => p.nombre)
}

function parsePieza(texto: string, editorial: IdentidadEditorial): PiezaExtraida {
  const b = parsearJSONDeClaude(texto) as Record<string, unknown>
  const laminas = (Array.isArray(b.laminas) ? b.laminas : []).map((l) => {
    const x = l as Record<string, unknown>
    const tipo = (TIPOS_LAMINA as readonly string[]).includes(cadena(x.tipo)) ? (cadena(x.tipo) as TipoLamina) : null
    return { tipo, lead: cadena(x.antetitulo) || null, title: cadena(x.titulo), body: cadena(x.cuerpo), items: lista(x.items), visual: cadena(x.visual) || null }
  })
  const pilar = cadena(b.pilar)
  return {
    red: red(b.red),
    nombre: cadena(b.nombre),
    laminas,
    caption: cadena(b.caption),
    hashtags: lista(b.hashtags),
    post: cadena(b.post),
    // Solo un pilar que exista: un id inventado se queda en "sin pilar".
    pilar: editorial.pilares.some((p) => p.id === pilar) ? pilar : null,
    cta_tipo: (TIPOS_CTA as readonly string[]).includes(cadena(b.cta_tipo)) ? (cadena(b.cta_tipo) as TipoCta) : null,
    objetivo: (OBJETIVOS as readonly string[]).includes(cadena(b.objetivo)) ? (cadena(b.objetivo) as Objetivo) : null,
    por_que: cadena(b.por_que),
    por_que_del_archivo: b.por_que_del_archivo === true,
  }
}

/** Corre `fn` sobre la lista con `cuantos` a la vez, en el orden de la lista. */
async function enTandas<T, R>(items: T[], cuantos: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const salida = new Array<R>(items.length)
  let siguiente = 0
  await Promise.all(
    Array.from({ length: Math.min(cuantos, items.length) }, async () => {
      while (siguiente < items.length) {
        const i = siguiente++
        salida[i] = await fn(items[i], i)
      }
    })
  )
  return salida
}

/** Los ejemplos de un archivo, listos para revisar. No guarda nada. */
export async function extraerEjemplos(
  accountId: string,
  archivo: { nombre: string; texto: string }
): Promise<ResultadoImportacion> {
  const texto = archivo.texto.replace(/\r\n/g, "\n").trim()
  if (!texto) throw new Error("El archivo está vacío.")
  if (texto.length > TOPE_ARCHIVO) {
    throw new Error(`El archivo tiene ${texto.length} caracteres y el tope es ${TOPE_ARCHIVO}. Pártelo en dos.`)
  }

  const [editorial, perfil, existentes] = await Promise.all([identidadEditorial(accountId), perfilDe(accountId), ejemplosDe(accountId)])
  const avisos: string[] = []

  const indice = await llamarClaude({
    accountId,
    model: MODELO,
    system: SISTEMA_INDICE,
    prompt: `Archivo: ${archivo.nombre}\n\n<archivo>\n${texto}\n</archivo>`,
    maxTokens: 3000,
    timeoutMs: 180_000,
  })
  if (!indice.ok) throw new Error(`Claude no pudo leer el archivo: ${indice.error}`)
  let piezas = parseIndice(indice.texto)
  if (piezas.length === 0) throw new Error("Claude no encontró piezas en el archivo.")
  if (piezas.length > MAX_EJEMPLOS_ARCHIVO) {
    avisos.push(`El archivo tiene ${piezas.length} piezas: se leyeron las primeras ${MAX_EJEMPLOS_ARCHIVO}.`)
    piezas = piezas.slice(0, MAX_EJEMPLOS_ARCHIVO)
  }

  const trozos = partirArchivo(
    texto,
    piezas.map((p) => buscarInicio(texto, p.inicio))
  )
  const sistema = sistemaPieza(editorial)
  const origen = `archivo ${archivo.nombre}`.slice(0, TOPES_EJEMPLO.origen)

  const propuestas = await enTandas(piezas, A_LA_VEZ, async (p, i): Promise<PropuestaEjemplo | null> => {
    const trozo = trozos[i]
    // Si no se encontro donde empieza, va el archivo entero con el nombre de la pieza.
    const prompt = trozo
      ? `<pieza>\n${trozo}\n</pieza>`
      : `Del archivo de abajo, toma solo la pieza «${p.nombre}» (${p.red}).\n\n<archivo>\n${texto}\n</archivo>`
    const r = await llamarClaude({ accountId, model: MODELO, system: sistema, prompt, maxTokens: 6000, timeoutMs: 180_000 })
    if (!r.ok) {
      avisos.push(`No se pudo leer «${p.nombre}»: ${r.error}`)
      return null
    }
    let x: PiezaExtraida
    try {
      x = parsePieza(r.texto, editorial)
    } catch {
      avisos.push(`Claude devolvió «${p.nombre}» en un formato que no se entiende. Vuelve a importar o créalo a mano.`)
      return null
    }

    const esCarrusel = x.red === "instagram" && x.laminas.length > 0
    const textoEjemplo = esCarrusel
      ? textoDeCarrusel({ laminas: x.laminas, caption: x.caption, hashtags: x.hashtags })
      : x.post
    if (!textoEjemplo) {
      avisos.push(`«${p.nombre}» salió sin texto.`)
      return null
    }

    // Lo que tiene que estar en el archivo: todo menos el nombre y la
    // descripcion de lo visual, que son de Claude, y el porque si lo escribio el.
    const deLaMarca = esCarrusel
      ? [...x.laminas.flatMap((l) => [l.lead ?? "", l.title ?? "", l.body ?? "", ...(l.items ?? [])]), x.caption, x.hashtags.join(" ")]
      : [x.post]
    const ajenos = trozosAjenos(deLaMarca, texto)
    const ajenosDelPorQue = x.por_que_del_archivo ? trozosAjenos([x.por_que], texto) : []
    const porQuePropuesto = !x.por_que_del_archivo || ajenosDelPorQue.length > 0
    const faltan = trozo ? trozosQueFaltan([...deLaMarca, x.nombre, x.por_que, ...x.laminas.map((l) => l.visual ?? "")], trozo) : []

    const campos: CamposEjemplo = {
      red: x.red,
      nombre: (x.nombre || p.nombre).slice(0, TOPES_EJEMPLO.nombre),
      texto: textoEjemplo.slice(0, TOPES_EJEMPLO.texto),
      por_que: x.por_que.slice(0, TOPES_EJEMPLO.por_que),
      pilar_id: x.pilar,
      cta_tipo: x.cta_tipo,
      objetivo: x.objetivo,
      origen,
      activo: true,
    }

    const otros: string[] = []
    if (!trozo) otros.push("No se encontró dónde empieza en el archivo: se buscó en el archivo entero.")
    if (!campos.pilar_id && editorial.pilares.length) otros.push("Sin pilar: elige uno, es lo que más pesa para que entre en una pieza.")
    if (textoEjemplo.length > TOPES_EJEMPLO.texto) otros.push(`El texto pasa de ${TOPES_EJEMPLO.texto} caracteres y se cortó.`)
    const duplicado = esDuplicado(campos, existentes)
    if (duplicado) otros.push("Ya tienes un ejemplo con este nombre o este texto.")

    return {
      clave: `${i}-${campos.red}`,
      campos,
      ajenos,
      faltan,
      porQuePropuesto,
      vicios: viciosDeTexto(textoEjemplo, perfil.frases_prohibidas),
      avisos: otros,
      duplicado,
    }
  })

  return { propuestas: propuestas.filter((p): p is PropuestaEjemplo => p !== null), avisos }
}
