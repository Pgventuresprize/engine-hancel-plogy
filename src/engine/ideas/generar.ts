import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"
import { arreglarOrtografia } from "../render/carousel"
import { supabaseAdmin } from "../supabase-admin"
import { todas } from "../paginar"

/**
 * El agente de ideas: convierte las capas de un pilar en cartuchos.
 *
 * Una idea nace de una combinacion: un tema (o subtema, si el tema tiene) por
 * una intencion por una narrativa que esa intencion desbloquea. El agente
 * recorre TODAS las combinaciones de un pilar y escribe una idea distinta para
 * cada una. Eso es una ronda.
 *
 * La regla que manda sobre todo es la diversidad: dos combinaciones pueden
 * compartir tema, subtema o intencion, pero la idea concreta de cada una tiene
 * que ser de un asunto diferente. Nada de "la roya del cafe" para una intencion
 * y "la roya del cafe" para otra. Por eso la ronda se genera viendo todas las
 * combinaciones a la vez: el modelo reparte asuntos distintos entre ellas.
 */

export const IDEAS_OFICIO = `Eres un editor que propone ideas de contenido para las redes sociales de la marca que se describe más abajo.

Recibes una lista de COMBINACIONES. Cada una es un tema (a veces enfocado a un subtema concreto), una intención (el propósito) y una narrativa (la forma de contarlo). Por cada combinación escribes UNA idea de contenido.

LA REGLA QUE MANDA: TODAS LAS IDEAS DE LA RONDA SON DE ASUNTOS DISTINTOS.
Dos combinaciones pueden compartir el mismo tema, subtema o intención. Sus ideas NO pueden ser del mismo asunto. Prohibido "cómo fijar precios" en dos ideas, aunque una sea para Informar y otra para Advertir, o con narrativas distintas. Cada idea abre una puerta nueva: otro problema, otra práctica, otro momento del proceso, otra decisión de quien lee.

CADA IDEA:
- Es concreta y accionable, no un tema vago. "Cómo leer un estado de resultados" está bien; "hablar de finanzas" no.
- Respeta su intención y su narrativa: si la intención es Advertir y la narrativa El error, la idea es un error común que cuesta caro.
- Si la combinación trae un subtema, la idea es de ese subtema: "Finanzas/Impuestos enfocado a restaurantes" da una idea de impuestos DE RESTAURANTES, no de impuestos en general.
- Le habla a la audiencia de la marca y cabe en lo que la marca cubre.
- No inventa datos falsos. Propone el asunto; el contenido se documenta después.

ORTOGRAFÍA: cada idea y cada nota llevan sus tildes y sus eñes. Se leen tal cual en la interfaz y son el punto de partida del texto publicado.

Antes de responder, relee y confirma que no hay dos ideas del mismo asunto y que nada le falta una tilde.`

export const IDEAS_CONTRATO = `RESPONDE SOLO con este JSON, sin texto alrededor:
{"ideas":[{"n":<número de la combinación>,"idea":"<título concreto de la idea, una frase>","notes":"<1-2 frases de por dónde va>"}]}

Devuelve exactamente una idea por combinación, con su número.`

type Comb = {
  n: number
  topicId: string
  subtopicId: string | null
  intentId: string
  narrativeId: string
  linea: string
}

type FilaCapa = { id: string; name: string; description: string | null }

/**
 * Todas las combinaciones de un pilar.
 *
 * Por cada tema: si tiene subtemas, una entrada por subtema; si no, una del
 * tema entero. Cada una por cada intencion y por cada narrativa que esa
 * intencion desbloqueo. Si falta cualquier pieza (sin intenciones, sin
 * narrativas enlazadas) no hay combinaciones, y no es un fallo: es un pilar a
 * medio configurar.
 */
async function combinacionesDe(accountId: string, pillarId: string): Promise<Comb[]> {
  const supabase = supabaseAdmin()

  const [temas, subtemas, intenciones, narrativas, enlaces] = await Promise.all([
    supabase.from("content_topics").select("id, name, description").eq("pillar_id", pillarId),
    todas((d, h) => supabase.from("content_subtopics").select("id, name, description, topic_id").eq("account_id", accountId).order("id").range(d, h)).then((data) => ({ data, error: null })),
    supabase.from("content_intents").select("id, name, description").eq("account_id", accountId),
    supabase.from("content_narratives").select("id, name, description").eq("account_id", accountId),
    supabase.from("content_intent_narratives").select("intent_id, narrative_id").eq("account_id", accountId),
  ])

  const losTemas = (temas.data ?? []) as FilaCapa[]
  const losIntentos = (intenciones.data ?? []) as FilaCapa[]
  const narrPorId = new Map((narrativas.data ?? []).map((n) => [(n as FilaCapa).id, n as FilaCapa]))
  const subPorTema = new Map<string, FilaCapa[]>()
  for (const s of (subtemas.data ?? []) as (FilaCapa & { topic_id: string })[]) {
    const lista = subPorTema.get(s.topic_id) ?? []
    lista.push(s)
    subPorTema.set(s.topic_id, lista)
  }
  const narrsDeIntento = new Map<string, string[]>()
  for (const e of (enlaces.data ?? []) as { intent_id: string; narrative_id: string }[]) {
    const lista = narrsDeIntento.get(e.intent_id) ?? []
    lista.push(e.narrative_id)
    narrsDeIntento.set(e.intent_id, lista)
  }

  const combs: Comb[] = []
  let n = 0
  for (const tema of losTemas) {
    // El tema entero, o cada subtema si los hay.
    const focos = subPorTema.get(tema.id) ?? [null]
    for (const sub of focos) {
      for (const intento of losIntentos) {
        for (const narrId of narrsDeIntento.get(intento.id) ?? []) {
          const narr = narrPorId.get(narrId)
          if (!narr) continue
          n++
          const foco = sub ? `${tema.name} enfocado a ${sub.name}${sub.description ? ` (${sub.description})` : ""}` : tema.name
          combs.push({
            n,
            topicId: tema.id,
            subtopicId: sub?.id ?? null,
            intentId: intento.id,
            narrativeId: narrId,
            linea:
              `[${n}] Tema: ${foco}` +
              (tema.description ? ` (${tema.description})` : "") +
              ` | Intencion: ${intento.name}` +
              (intento.description ? ` (${intento.description})` : "") +
              ` | Narrativa: ${narr.name}` +
              (narr.description ? ` (${narr.description})` : ""),
          })
        }
      }
    }
  }

  return combs
}

export type ResultadoIdeas = {
  pillarId: string
  generadas: number
  ronda: number
  uso: UsoClaude
  error?: string
}

/** Cuantas combinaciones se mandan en una misma llamada. */
const LOTE = 25

/**
 * Tope de combinaciones por ronda: cuatro llamadas de 25, que caben en el
 * tiempo de una pasada. Por encima, la ronda toma las menos cubiertas.
 */
const MAX_POR_RONDA = 100

/**
 * Genera una ronda de cartuchos para un pilar.
 *
 * Si hay muchas combinaciones se lotea, y a cada lote se le pasan los titulos
 * ya generados para que no repita asunto entre lotes: la diversidad tiene que
 * valer para la ronda entera, no solo dentro de una llamada.
 */
export async function generarRonda(
  accountId: string,
  pillarId: string,
  model: string,
  /** El prompt ya armado: oficio, marca y contrato (ver studio/settings.ts). */
  system: string
): Promise<ResultadoIdeas> {
  const supabase = supabaseAdmin()
  const todasLasCombs = await combinacionesDe(accountId, pillarId)

  const uso: UsoClaude = { entrada: 0, salida: 0 }
  if (todasLasCombs.length === 0) {
    return { pillarId, generadas: 0, ronda: 0, uso, error: "El pilar no tiene combinaciones: le faltan temas, intenciones o narrativas enlazadas." }
  }

  // Con listas grandes las combinaciones se disparan (100 frutas x 3
  // intenciones x 4 narrativas son 1.200): una ronda no las abarca en una sola
  // pasada. Se toma un lote, empezando por las que menos ideas tienen, y las
  // rondas siguientes siguen por las demas: con el tiempo se cubren todas.
  let combs = todasLasCombs
  if (todasLasCombs.length > MAX_POR_RONDA) {
    const previos = await todas<{ topic_id: string | null; subtopic_id: string | null; intent_id: string | null; narrative_id: string | null }>((d, h) =>
      supabase
        .from("content_cartridges")
        .select("id, topic_id, subtopic_id, intent_id, narrative_id")
        .eq("pillar_id", pillarId)
        .order("id")
        .range(d, h)
    )
    const clave = (t: string | null, s: string | null, i: string | null, n: string | null) => `${t}|${s}|${i}|${n}`
    const veces = new Map<string, number>()
    for (const c of previos) {
      const k = clave(c.topic_id, c.subtopic_id, c.intent_id, c.narrative_id)
      veces.set(k, (veces.get(k) ?? 0) + 1)
    }
    combs = [...todasLasCombs]
      .map((c) => ({ c, v: veces.get(clave(c.topicId, c.subtopicId, c.intentId, c.narrativeId)) ?? 0, azar: Math.random() }))
      .sort((a, b) => a.v - b.v || a.azar - b.azar)
      .slice(0, MAX_POR_RONDA)
      .map((x) => x.c)
  }

  // La ronda es la siguiente a la ultima que haya de este pilar.
  const { data: ultima } = await supabase
    .from("content_cartridges")
    .select("round")
    .eq("pillar_id", pillarId)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle()
  const ronda = ((ultima as { round: number } | null)?.round ?? 0) + 1

  const porNumero = new Map(combs.map((c) => [c.n, c]))
  const yaGeneradas: string[] = []
  const aInsertar: Record<string, unknown>[] = []

  for (let i = 0; i < combs.length; i += LOTE) {
    const lote = combs.slice(i, i + LOTE)
    const evita =
      yaGeneradas.length > 0
        ? `\n\nYA PROPUSISTE ESTOS ASUNTOS EN ESTA RONDA, NO LOS REPITAS NI PAREZCAS:\n${yaGeneradas.map((t) => `- ${t}`).join("\n")}`
        : ""

    const prompt = `COMBINACIONES\n${lote.map((c) => c.linea).join("\n")}${evita}`
    // Veinticinco ideas con su nota no caben en 3.000 tokens: el JSON salia
    // cortado. Y si aun asi llega roto, se pide otra vez antes de rendirse.
    let bruto: { ideas?: unknown } | null = null
    for (let intento = 0; intento < 2 && !bruto; intento++) {
      const r = await llamarClaude({ paso: "ideas", accountId, model, system, prompt, maxTokens: 7000 })
      if (!r.ok) return { pillarId, generadas: aInsertar.length, ronda, uso, error: r.error }
      uso.entrada += r.uso.entrada
      uso.salida += r.uso.salida
      try {
        bruto = parsearJSONDeClaude(r.texto) as { ideas?: unknown }
      } catch (e) {
        if (intento === 1) throw e
      }
    }
    if (!bruto) continue
    const ideas = Array.isArray(bruto.ideas) ? bruto.ideas : []
    for (const it of ideas as { n?: unknown; idea?: unknown; notes?: unknown }[]) {
      const comb = typeof it.n === "number" ? porNumero.get(it.n) : undefined
      const idea = typeof it.idea === "string" ? arreglarOrtografia(it.idea.trim()) : ""
      if (!comb || !idea) continue
      yaGeneradas.push(idea)
      aInsertar.push({
        account_id: accountId,
        pillar_id: pillarId,
        topic_id: comb.topicId,
        subtopic_id: comb.subtopicId,
        intent_id: comb.intentId,
        narrative_id: comb.narrativeId,
        idea: idea.slice(0, 500),
        notes: typeof it.notes === "string" ? arreglarOrtografia(it.notes.trim()).slice(0, 500) : null,
        round: ronda,
      })
    }
  }

  if (aInsertar.length > 0) {
    const { error } = await supabase.from("content_cartridges").insert(aInsertar)
    if (error) return { pillarId, generadas: 0, ronda, uso, error: error.message }
  }

  return { pillarId, generadas: aInsertar.length, ronda, uso }
}
