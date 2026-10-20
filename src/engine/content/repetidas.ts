import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"

/**
 * Quita del camino las noticias que cuentan un hecho ya cubierto.
 *
 * El mismo hecho llega decenas de veces: un anuncio de la FNC lo publican
 * veintisiete medios el mismo dia, cada uno con su titular. La deduplicacion de
 * la ingesta compara palabra a palabra y en español no llega ni de lejos: "El
 * Niño golpea al cafe: Fedecafe sube a $12.000 el kilo de pasilla" y "Federacion
 * de Cafeteros ajusta precios de la pasilla para blindar ingresos frente a El
 * Niño" solo comparten la palabra "pasilla". Sobre los titulares reales de ese
 * dia detectaba 0 de 171 pares.
 *
 * Por eso se decide aqui y no antes. En este punto ya solo quedan las que
 * pasaron el umbral, que son pocas, asi que se puede leer el sentido de cada
 * titular en vez de contar palabras, y sale casi gratis. Comparar antes
 * obligaria a hacerlo sobre cientos de noticias por pasada y a tirar material
 * que todavia no se sabe si vale.
 *
 * El corpus no se toca: la repetida se marca y se queda enlazada a la que si
 * cubrio el hecho. Eso deja ver de cuantos medios salio la misma historia y
 * permite revisar la decision si el juicio se equivoco.
 */

/** Una noticia que aspira a generar contenido. */
export type Aspirante = {
  id: string
  title: string
  /** Decide quien se queda con el hecho cuando dos lo cuentan. */
  score: number | null
  /** Desempata cuando el score es el mismo: gana la que llego primero. */
  created_at: string
}

/** Una noticia que ya genero contenido y por tanto ya ocupa su hecho. */
export type YaCubierta = { id: string; title: string }

export type Veredicto = {
  /** Las que siguen: una por hecho. */
  elegidas: Aspirante[]
  /** id de la repetida -> id de la que se quedo con el hecho. */
  repetidas: Map<string, string>
  uso: UsoClaude
}

const SYSTEM = `Agrupas titulares de prensa por el hecho del que informan.

Dos titulares son EL MISMO HECHO cuando informan del mismo suceso concreto, aunque los redacten distinto, los firme otro medio o cambien el enfoque. Ejemplo de mismo hecho: "El banco central sube la tasa al 9 % y frena el credito" y "Nueva alza de tasas: la autoridad monetaria lleva el interes al 9 % para contener la inflacion".

NO son el mismo hecho dos noticias que solo comparten tema, sector o protagonista. Dos noticias sobre la misma empresa son hechos distintos si una habla de sus resultados del trimestre y otra de un producto nuevo. Ante la duda, son hechos DISTINTOS: descartar una noticia buena cuesta mas que publicar dos parecidas.

Recibes dos listas:
- CUBIERTOS: hechos de los que ya se publico. Solo sirven para comparar.
- CANDIDATOS: los que se van a publicar si no repiten.

Para cada candidato di si repite un CUBIERTO o un CANDIDATO anterior. Si no repite a nadie, no lo incluyas en la respuesta.

RESPONDE SOLO con este JSON, sin texto alrededor:
{"repetidos":[{"id":"<id del candidato>","mismo_hecho_que":"<id del cubierto o candidato que ya contaba ese hecho>"}]}

Si ningun candidato repite, responde {"repetidos":[]}.`

type Bruto = { repetidos?: unknown }
type Par = { id?: unknown; mismo_hecho_que?: unknown }

/**
 * Decide que aspirantes siguen y cuales repiten un hecho.
 *
 * Gana el score mas alto; a igual score, la que llego primero. Es la misma
 * regla mire donde mire para que el resultado no dependa del orden en que
 * lleguen las candidatas a esta funcion.
 */
export async function elegirPorHecho(
  accountId: string,
  aspirantes: Aspirante[],
  yaCubiertas: YaCubierta[],
  model: string
): Promise<Veredicto> {
  const sinUso = { entrada: 0, salida: 0 }
  const repetidas = new Map<string, string>()

  // Con una sola candidata y nada cubierto no hay nada que comparar, y una
  // llamada para eso seria gasto puro.
  if (aspirantes.length === 0) return { elegidas: [], repetidas, uso: sinUso }
  if (aspirantes.length === 1 && yaCubiertas.length === 0) {
    return { elegidas: aspirantes, repetidas, uso: sinUso }
  }

  // Los uuid se cambian por etiquetas cortas: treinta y seis caracteres por
  // noticia, dos veces, es casi todo el prompt en identificadores que al modelo
  // no le dicen nada.
  const etiqueta = new Map<string, string>()
  const porEtiqueta = new Map<string, string>()
  const registrar = (id: string, prefijo: string, n: number) => {
    const corta = `${prefijo}${n}`
    etiqueta.set(id, corta)
    porEtiqueta.set(corta, id)
    return corta
  }

  const cubiertos = yaCubiertas
    .map((c, i) => `${registrar(c.id, "p", i + 1)}: ${c.title}`)
    .join("\n")

  // Por score y, a igual score, por antiguedad: asi el primero de la lista es
  // siempre el que debe ganar el hecho, y el modelo apunta hacia atras.
  const ordenados = [...aspirantes].sort(ordenPorMerito)
  const candidatos = ordenados
    .map((a, i) => `${registrar(a.id, "c", i + 1)}: ${a.title}`)
    .join("\n")

  const prompt = `CUBIERTOS
${cubiertos || "(ninguno)"}

CANDIDATOS
${candidatos}`

  const r = await llamarClaude({ accountId, model, system: SYSTEM, prompt, maxTokens: 1000 })
  if (!r.ok) throw new Error(`No se pudo comparar los hechos: ${r.error}`)

  const bruto = parsearJSONDeClaude(r.texto) as Bruto
  const pares = Array.isArray(bruto.repetidos) ? (bruto.repetidos as Par[]) : []

  for (const par of pares) {
    if (typeof par.id !== "string" || typeof par.mismo_hecho_que !== "string") continue
    const repetida = porEtiqueta.get(par.id)
    const duena = porEtiqueta.get(par.mismo_hecho_que)
    // Una etiqueta inventada, o una noticia marcada como repeticion de si
    // misma, se ignora: mejor un duplicado de mas que perder una noticia por
    // una respuesta mal formada.
    if (!repetida || !duena || repetida === duena) continue
    repetidas.set(repetida, duena)
  }

  // Cadenas: si c3 repite a c2 y c2 repite a p1, c3 pertenece a p1. Sin esto la
  // repetida podria apuntar a otra repetida y el tablero enseñaria un enlace que
  // no lleva a ningun contenido.
  for (const [repetida] of repetidas) {
    const vistos = new Set<string>([repetida])
    let duena = repetidas.get(repetida)!
    while (repetidas.has(duena) && !vistos.has(duena)) {
      vistos.add(duena)
      duena = repetidas.get(duena)!
    }
    repetidas.set(repetida, duena)
  }

  return {
    elegidas: ordenados.filter((a) => !repetidas.has(a.id)),
    repetidas,
    uso: r.uso,
  }
}

function ordenPorMerito(a: Aspirante, b: Aspirante): number {
  const scoreA = a.score ?? 0
  const scoreB = b.score ?? 0
  if (scoreA !== scoreB) return scoreB - scoreA
  return a.created_at.localeCompare(b.created_at)
}
