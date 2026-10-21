import { ajustesDe } from "../agents/settings"
import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"
import { supabaseAdmin } from "../supabase-admin"
import type { CriterioDecidido, LinkedinJobInput } from "./types"

/**
 * El agente de criterio: decide, antes de escribir, lo que la marca haria o
 * miraria primero ante la noticia.
 *
 * Cuando el mismo agente que escribe tenia que inventar ademas el criterio, lo
 * sacaba del material: en la prueba de LinkedIn (2026-10-21) las 9 primeras
 * versiones lo copiaban y 6 seguian copiandolo despues de corregir, con las
 * skills de la marca o sin ellas. Con este paso antes, que primero anota todo
 * lo que el material ya recomienda y despues decide algo que no este ahi,
 * fueron 2 y 1 de 9.
 *
 * Se decide una vez por angulo y se guarda en el: el post y el carrusel de la
 * misma noticia dicen el mismo criterio, y la ficha lo enseña. Lo decide el
 * primer escritor que lo necesita, asi que un angulo que nunca se convierte en
 * pieza no gasta la llamada.
 */

/** La calidad manda: es lo mas importante de la pieza. */
export const MODELO_CRITERIO = "claude-opus-5-5"

export const CRITERIO_OFICIO = `Eres el estratega de la marca. Antes de que nadie escriba la pieza, decides el criterio de la marca ante esta noticia: lo que la marca haría o miraría primero. Es lo más importante de la pieza y no puede salir de la fuente.

CÓMO TRABAJAS
1. Primero lee el material y anota TODO lo que ya recomienda, concluye, propone o advierte: la empresa de la noticia, los medios, los analistas y los usuarios citados. Cada cosa con quién la dice. Sé exhaustivo: lo que no anotes aquí es lo que después se cuela como si fuera de la marca.
2. Luego decide el criterio con la forma de trabajar de la marca (la del bloque de marca y sus skills): desde su método, su territorio y lo que la marca sabe hacer, no desde lo que dice la noticia.
3. El criterio son 2 acciones concretas para quien lee (3 solo si la tercera es imprescindible), atadas a este hecho y que pueda hacer esta semana con lo que ya tiene. Cada una en una o dos frases, hasta 45 palabras. Ninguna puede estar en tu lista del paso 1 ni ser una paráfrasis de algo de esa lista. Si coincides con algo de la lista, no lo pongas como criterio: busca lo que la marca suma encima (el paso previo, la medida, la condición, el responsable).
4. Nada de cifras ni resultados que el material no traiga. Nada que sirva para cualquier noticia.
5. Comprueba cada acción contra la lista del paso 1 y explica por qué no está ahí.
6. Si la noticia no da para un criterio propio de la marca, devuelve "acciones" vacío. Es mejor que forzarlo.

Escribe en el idioma de la marca.`

export const CRITERIO_CONTRATO = `RESPONDE SOLO con este JSON, sin texto alrededor y sin comillas dobles dentro de las cadenas:
{"ya_dice_el_material":[{"quien":"<fuente>","dice":"<lo que recomienda, concluye o advierte>"}],"acciones":["<acción 1>","<acción 2>"],"por_que_es_propio":"<1 o 2 frases>"}`

/** El razonamiento de Opus sale del mismo presupuesto que la respuesta. */
const MAX_TOKENS_CRITERIO = 6000
const TIMEOUT_CRITERIO_MS = 180_000

const textoNoVacio = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

/** La respuesta del agente, o un criterio guardado, comprobado. Null si no sirve. */
export function parseCriterio(bruto: unknown, modelo = "", fecha = ""): CriterioDecidido | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null
  const r = bruto as Record<string, unknown>
  if (!Array.isArray(r.acciones) || !Array.isArray(r.ya_dice_el_material)) return null
  const acciones = r.acciones.map(textoNoVacio).filter((a): a is string => a !== null).slice(0, 3)
  const ya_dice_el_material = r.ya_dice_el_material
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>
      const dice = textoNoVacio(o.dice)
      return dice ? { quien: textoNoVacio(o.quien) ?? "el material", dice } : null
    })
    .filter((x): x is { quien: string; dice: string } => x !== null)
  return {
    acciones,
    ya_dice_el_material,
    por_que_es_propio: textoNoVacio(r.por_que_es_propio) ?? "",
    modelo: textoNoVacio(r.modelo) ?? modelo,
    fecha: textoNoVacio(r.fecha) ?? fecha,
  }
}

export function promptCriterio(input: LinkedinJobInput): string {
  const n = input.raw_news
  return `ÁNGULO
- angulo: ${input.angle.angle}
- tesis: ${input.angle.thesis ?? "(sin tesis)"}

NOTICIA
- titulo: ${n.title}
- fuente: ${n.source ?? "desconocida"}
- contenido: ${n.full_content ?? n.snippet ?? "(sin contenido)"}`
}

/**
 * Decide el criterio. `criterio` null si la cuenta tiene el agente apagado o si
 * falla dos veces: la pieza se escribe entonces como antes, sin criterio
 * decidido, y la ficha lo dice.
 */
export async function decidirCriterio(
  accountId: string,
  input: LinkedinJobInput
): Promise<{ criterio: CriterioDecidido | null; uso: UsoClaude | null }> {
  const ajustes = await ajustesDe(accountId, "criterio")
  if (!ajustes.enabled) return { criterio: null, uso: null }

  // Dinamicos: prompts.ts y modelos.ts importan de aqui el oficio y el modelo.
  const [modelo, system] = await Promise.all([
    import("../agents/modelos").then((m) => m.modeloDe(accountId, "criterio")),
    import("../agents/prompts").then((p) => p.promptPara(accountId, "criterio", null)),
  ])
  const prompt = promptCriterio(input)
  let uso: UsoClaude | null = null
  let error = ""
  for (let intento = 0; intento < 2; intento++) {
    const r = await llamarClaude({ accountId, model: modelo, system, prompt, maxTokens: MAX_TOKENS_CRITERIO, timeoutMs: TIMEOUT_CRITERIO_MS })
    if (!r.ok) {
      error = r.error
      continue
    }
    uso = uso
      ? { entrada: uso.entrada + r.uso.entrada, salida: uso.salida + r.uso.salida, deCache: (uso.deCache ?? 0) + (r.uso.deCache ?? 0) }
      : r.uso
    try {
      const criterio = parseCriterio(parsearJSONDeClaude(r.texto), modelo, new Date().toISOString())
      if (criterio) return { criterio, uso }
      error = "La respuesta no trae acciones ni lo que dice el material."
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
  console.error("[criterio] No se pudo decidir:", error)
  return { criterio: null, uso }
}

/** Los ids de las pruebas ("exp") no son de un angulo guardado: no se leen ni se escriben. */
const esUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

async function criterioGuardado(angleId: string): Promise<CriterioDecidido | null> {
  if (!esUuid(angleId)) return null
  const { data, error } = await supabaseAdmin().from("content_angles").select("criterio").eq("id", angleId).maybeSingle()
  if (error) {
    console.error("[criterio] No se pudo leer el criterio del angulo:", error.message)
    return null
  }
  return parseCriterio((data as { criterio?: unknown } | null)?.criterio)
}

/**
 * La entrada de un escritor con el criterio de su angulo: el que ya trae, el
 * guardado o, si `decidir`, uno nuevo que se guarda en el angulo. Si otro
 * escritor lo guardo mientras tanto, se usa el suyo: el post y el carrusel
 * dicen el mismo. Sin criterio, la entrada sale como llego.
 */
export async function conCriterio(
  accountId: string,
  input: LinkedinJobInput,
  decidir = true
): Promise<{ input: LinkedinJobInput; uso: UsoClaude | null }> {
  const con = (criterio: CriterioDecidido) => ({ ...input, angle: { ...input.angle, criterio } })
  if (input.angle.criterio) return { input, uso: null }
  const guardado = await criterioGuardado(input.angle.id)
  if (guardado) return { input: con(guardado), uso: null }
  if (!decidir) return { input, uso: null }

  const { criterio, uso } = await decidirCriterio(accountId, input)
  if (!criterio) return { input, uso }
  if (esUuid(input.angle.id)) {
    const { error } = await supabaseAdmin()
      .from("content_angles")
      .update({ criterio })
      .eq("id", input.angle.id)
      .is("criterio", null)
    if (error) console.error("[criterio] No se pudo guardar en el angulo:", error.message)
  }
  return { input: con((await criterioGuardado(input.angle.id)) ?? criterio), uso }
}

/** Lo que recibe quien escribe: el criterio decidido y lo que no puede presentar como suyo. */
export function bloqueCriterioEscritor(c: CriterioDecidido | null | undefined): string {
  if (!c) return ""
  const material = c.ya_dice_el_material.length
    ? `\nLO QUE YA DICE EL MATERIAL (no es criterio de la marca: si lo usas, va atribuido a quien lo dice y fuera del criterio)\n${c.ya_dice_el_material.map((x) => `- ${x.quien}: ${x.dice}`).join("\n")}\n`
    : ""
  const criterio = c.acciones.length
    ? `\nCRITERIO DE LA MARCA (decidido antes de escribir: es lo que la marca haría o miraría primero ante este hecho)\n${c.acciones.map((a) => `- ${a}`).join("\n")}\nEl criterio de la pieza (la lámina o el párrafo de criterio) dice esto con tus palabras, sin cifras que el material no traiga. No lo cambies por pasos del material ni le sumes pasos que el material ya recomienda. Lo mismo vale para cualquier otra lectura que firmes como de la marca ("nuestra lectura", "esto sugiere", "lo que importa es"): sale de este criterio. Si una conclusión está en la lista de lo que ya dice el material, va atribuida a quien la dice, nunca como de la marca.\n`
    : `\nCRITERIO DE LA MARCA: esta noticia no da para un criterio propio de la marca. No lo fuerces: cuenta el hecho y su consecuencia, con sus fuentes, y atribuye cada conclusión a quien la dice.\n`
  return `${criterio}${material}`
}

/** Lo que recibe el revisor: el criterio sirve de referencia, pero manda el material. */
export function bloqueCriterioRevisor(c: CriterioDecidido | null | undefined): string {
  if (!c) return ""
  const acciones = c.acciones.length ? c.acciones.map((a) => `- ${a}`).join("\n") : "- (ninguno: la noticia no daba para criterio propio)"
  const material = c.ya_dice_el_material.map((x) => `- ${x.quien}: ${x.dice}`).join("\n")
  return `
EL CRITERIO QUE LA MARCA DECIDIÓ ANTES DE ESCRIBIR (compruébalo igual contra el material: si repite algo que ya está ahí, es criterio_copiado)
${acciones}
${material ? `\nLO QUE YA DICE EL MATERIAL, SEGÚN QUIEN DECIDIÓ EL CRITERIO (puede estar incompleto: manda el material)\n${material}\n` : ""}`
}
