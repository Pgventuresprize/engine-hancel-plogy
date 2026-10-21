import { ajustesDe } from "../agents/settings"
import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"
import { bloqueClasificacion } from "../marca/clasificacion"
import {
  camposCarrusel,
  camposPost,
  normalizar,
  type Campo,
  type EstadoClaude,
  type Hallazgo,
  type Nivel,
  type Regla,
} from "./revisor"
import type { LinkedinJobInput } from "./types"

/**
 * El revisor con Claude: lo que solo se ve leyendo la pieza junto a la noticia.
 *
 * El revisor de codigo (revisor.ts) comprueba lo mecanico: guiones, cifras que
 * no estan en el material, largos, copias de ejemplos. No puede ver que una
 * pieza quito el "descritos como" de una cifra, que el criterio de la marca es
 * el de la fuente con otras palabras o que una opinion suena a dato. En la
 * prueba de la pieza 004 y en la de Anthropic esos fueron los fallos que
 * quedaron, y ninguna regla de codigo los encuentra.
 *
 * Corre despues del de codigo, con su propio modelo, oficio y skills (el
 * agente "revisor" de Configuracion > Agentes), y devuelve hallazgos con el
 * mismo formato: entran al mismo ciclo de correccion y a la misma ficha. El
 * nivel de cada regla lo pone el codigo, no el modelo.
 */

/** Quality first: el revisor tiene que entender mas que quien escribe. */
export const MODELO_REVISOR = "claude-opus-5-5"

export const REGLAS_CLAUDE = {
  sin_respaldo: "frena",
  matiz_perdido: "frena",
  opinion_como_hecho: "frena",
  criterio_copiado: "frena",
  criterio_ajeno: "frena",
  dos_ideas: "aviso",
  falta_contexto: "aviso",
  cta_desconectado: "aviso",
} as const satisfies Partial<Record<Regla, Nivel>>

export type ReglaClaude = keyof typeof REGLAS_CLAUDE

const esRegla = (v: unknown): v is ReglaClaude => typeof v === "string" && v in REGLAS_CLAUDE

export const REVISOR_OFICIO = `Eres el revisor editorial de la marca. Lees una pieza ya escrita (un carrusel de Instagram o un post de LinkedIn) junto con la noticia de la que sale, y dices qué falla. No reescribes la pieza: señalas el fallo, citas el texto exacto y dices qué hay que hacer. Lo que digas vuelve a quien la escribió para que la corrija.

Un revisor de código ya comprobó lo mecánico: guiones, frases prohibidas, cifras que no están en el material, largos, hashtags, emojis y copias de los ejemplos. No repitas eso. Tú revisas lo que solo se ve leyendo y entendiendo.

LA FUENTE DE VERDAD ES EL MATERIAL
Sabes cosas por tu cuenta, pero no cuentan: si el material no lo dice, la pieza no lo puede afirmar como hecho. Tampoco cuentan el plan de cada lámina ni la tesis del ángulo: los escribió el mismo equipo y son afirmaciones a comprobar.

QUÉ REVISAS
1. sin_respaldo. La pieza afirma como hecho algo que el material no dice: un dato, una característica, una causa, una consecuencia o una fecha, o se lo atribuye a una fuente que no lo dice. Compara cada afirmación con el material. No cuenta lo que la pieza presenta como lectura de la marca o como posibilidad.
2. matiz_perdido. El material dice algo con una condición o una reserva y la pieza la quita: "descritos como", "según la empresa", "en sus pruebas", "hasta", "frente a X", "en promedio", "un usuario reportó". O la pieza generaliza: lo que vale para un caso, un modelo o una comparación lo dice como si valiera siempre. La reserva tiene que llegarle al lector.
3. opinion_como_hecho. Una interpretación, una predicción o una conclusión de la marca escrita como si fuera un hecho de la noticia, sin que el lector pueda saber que es lectura de la marca. Un consejo o un criterio explícito ("mide X antes de Y") se entiende como opinión y no cuenta; cuenta lo que suena a dato y no lo es ("las empresas ya están migrando", "esto encarece todo").
4. criterio_copiado. El criterio de la marca (la lámina o el párrafo donde la marca dice qué haría o qué mirar, a menudo con el rótulo "Criterio de" y el nombre de la marca) repite o parafrasea recomendaciones, pasos o conclusiones que ya trae el material. Si la fuente ya lo recomienda, no es criterio de la marca: o se atribuye a la fuente, o la marca aporta algo que la fuente no dice. En "detalle" di qué parte del material lo dice. Es lo más importante de la pieza: revísalo siempre.
5. criterio_ajeno. El criterio de la marca serviría para cualquier noticia o para cualquier cuenta ("evalúa tus necesidades", "mantente al día", "capacita a tu equipo"), no sale de cómo trabaja y piensa esta marca según QUIÉN ES, CÓMO SUENA y sus skills, o lo contradice. El criterio es lo que esta marca, por cómo trabaja, haría o miraría ante este hecho concreto.
6. dos_ideas. Una lámina lleva dos ideas que compiten (dos hechos sin relación, o un hecho y un criterio distinto) y el lector no sabe con cuál quedarse. Un hecho con su consecuencia directa es una sola idea. En LinkedIn no aplica.
7. falta_contexto. Un dato que solo se entiende con una referencia que el material trae y la pieza no da: un plazo sin el plazo normal, una cifra sin con qué compararla, un término técnico sin qué es. Solo si el lector se queda sin poder valorar el dato.
8. cta_desconectado. El cierre o el final del caption piden algo que no nace de lo que enseñó la pieza, o prometen algo que el CTA de la marca no ofrece.

CÓMO REVISAS
- Lee primero el material entero y después la pieza, texto por texto.
- Cada hallazgo cita el texto exacto de la pieza que lo provoca, copiado tal cual. Si no puedes citarlo, no es un hallazgo.
- Solo lo que de verdad falla. Una pieza buena sale sin hallazgos, y es lo esperable. No inventes fallos para llenar la lista, no reportes gustos de estilo y no pidas lo que el formato no admite (más láminas, más largo).
- "pide" dice qué cambiar y cómo, para que se pueda corregir sin volver a preguntarte: qué reserva añadir, qué quitar, a quién atribuirlo. Si el fallo está en el criterio, di qué tendría que mirar la marca ante este hecho, desde lo que sabes de ella, sin escribirle la lámina.
- Escribe en el idioma de la marca.`

export const REVISOR_CONTRATO = `RESPONDE SOLO con este JSON, sin texto alrededor:
{"hallazgos":[{"regla":"<${Object.keys(REGLAS_CLAUDE).join(" | ")}>","donde":"<como aparece en LA PIEZA: lámina 3 (cuerpo), cierre (texto), caption, post (párrafo 2)>","cita":"<el texto exacto de la pieza que lo provoca, copiado tal cual, hasta 160 caracteres>","detalle":"<qué pasa, en una o dos frases; si viene del material, qué dice el material>","pide":"<qué tiene que hacer quien escribe, concreto>"}]}
Sin fallos: {"hallazgos":[]}. Como mucho 8 hallazgos, los más graves primero.`

export type Red = "instagram" | "linkedin"

/** Los textos que se publican, cada uno con donde esta: lo que el revisor puede citar. */
export function camposDe(red: Red, version: unknown): Campo[] {
  if (red === "instagram") return camposCarrusel(version)
  const post = (version as { post?: unknown } | null)?.post
  return camposPost(typeof post === "string" ? post : "")
}

/** El plan de cada lamina, que no se publica: lo que dice el autor que hizo. */
function planDe(version: unknown): Map<number, string> {
  const plan = new Map<number, string>()
  const slides = (version as { slides?: unknown } | null)?.slides
  if (!Array.isArray(slides)) return plan
  slides.forEach((s, i) => {
    if (!s || typeof s !== "object") return
    const { funcion, fuente } = s as Record<string, unknown>
    const partes = [
      typeof funcion === "string" && funcion.trim() ? `función «${funcion.trim()}»` : "",
      typeof fuente === "string" && fuente.trim() ? `fuente «${fuente.trim()}»` : "",
    ].filter(Boolean)
    if (partes.length) plan.set(i + 1, partes.join(", "))
  })
  return plan
}

function textoDeLaPieza(red: Red, version: unknown): string {
  const campos = camposDe(red, version)
  if (red === "linkedin") return `LA PIEZA (post de LinkedIn)\n${campos.map((c) => `${c.donde}: ${c.texto}`).join("\n")}`
  const plan = planDe(version)
  const lineas: string[] = []
  let ultima = 0
  for (const c of campos) {
    const n = Number(/^lámina (\d+)/.exec(c.donde)?.[1] ?? 0)
    if (n && n !== ultima && plan.has(n)) lineas.push(`[plan de la lámina ${n}, no se publica: ${plan.get(n)}]`)
    if (n) ultima = n
    lineas.push(`${c.donde}: ${c.texto}`)
  }
  const hashtags = (version as { hashtags?: unknown } | null)?.hashtags
  if (Array.isArray(hashtags) && hashtags.length) lineas.push(`hashtags: ${hashtags.map((h) => `#${String(h)}`).join(" ")}`)
  return `LA PIEZA (carrusel de Instagram)\n${lineas.join("\n")}`
}

export function promptRevisor(red: Red, version: unknown, input: LinkedinJobInput): string {
  const n = input.raw_news
  const clasificacion = bloqueClasificacion(input.angle.clasificacion)
  return `LA NOTICIA: el material que tuvo quien escribió. Es la única fuente de verdad.
- titulo: ${n.title}
- fuente: ${n.source ?? "desconocida"}
- contenido: ${n.full_content ?? n.snippet ?? "(sin contenido)"}

EL ÁNGULO QUE SE LE PIDIÓ
- angulo: ${input.angle.angle}
- tesis: ${input.angle.thesis ?? "(sin tesis)"}
- formato: ${input.angle.playbook_format ?? "(sin formato)"}
${clasificacion ? `\n${clasificacion}\n` : ""}
${textoDeLaPieza(red, version)}`
}

/** Para encontrar una cita sin depender de comillas, espacios ni tildes. */
const plano = (t: string) =>
  normalizar(t)
    .replace(/[«»"“”'‘’…]/g, " ")
    .replace(/\.{3}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?]+$/, "")

const recorta = (t: string, tope: number) => (t.length > tope ? `${t.slice(0, tope - 1).trim()}…` : t)

/**
 * Los hallazgos que devolvio el modelo, comprobados: la regla existe, el texto
 * citado esta en la pieza y el donde sale de ahi. Lo que no se puede citar no
 * se queda: un fallo que no esta en la pieza no se puede corregir.
 */
export function hallazgosDeRespuesta(bruto: unknown, campos: Campo[]): { hallazgos: Hallazgo[]; descartados: number } {
  const lista = Array.isArray((bruto as { hallazgos?: unknown } | null)?.hallazgos)
    ? ((bruto as { hallazgos: unknown[] }).hallazgos)
    : null
  if (!lista) throw new Error("La respuesta del revisor no trae la lista de hallazgos.")
  const enCampos = campos.map((c) => ({ ...c, plano: plano(c.texto) }))
  const todo = plano(campos.map((c) => c.texto).join(" "))
  const hallazgos: Hallazgo[] = []
  let descartados = 0
  for (const h of lista) {
    const r = (h ?? {}) as Record<string, unknown>
    const cita = typeof r.cita === "string" ? r.cita.trim() : ""
    const detalle = typeof r.detalle === "string" ? r.detalle.trim() : ""
    const pide = typeof r.pide === "string" ? r.pide.trim() : ""
    const buscada = plano(cita)
    if (!esRegla(r.regla) || !buscada || !detalle || !pide) {
      descartados++
      continue
    }
    const dicho = typeof r.donde === "string" ? r.donde.trim() : ""
    // La misma frase puede estar en dos sitios (el cierre y el final del
    // caption): manda el que dijo el revisor, si es uno de ellos.
    const conCita = enCampos.filter((c) => c.plano.includes(buscada))
    const campo = conCita.find((c) => plano(c.donde) === plano(dicho)) ?? conCita[0]
    if (!campo && !todo.includes(buscada)) {
      descartados++
      continue
    }
    hallazgos.push({
      regla: r.regla,
      nivel: REGLAS_CLAUDE[r.regla],
      donde: campo?.donde ?? (dicho || "pieza"),
      detalle: `${detalle} Texto: «${recorta(cita, 160)}»`,
      pide,
      por: "claude",
    })
  }
  return { hallazgos, descartados }
}

export type RevisionClaude = { hallazgos: Hallazgo[]; estado: EstadoClaude; uso: UsoClaude | null }

const sumar = (a: UsoClaude | null, b: UsoClaude): UsoClaude =>
  a ? { entrada: a.entrada + b.entrada, salida: a.salida + b.salida, deCache: (a.deCache ?? 0) + (b.deCache ?? 0) } : b

/** El razonamiento de Opus sale del mismo presupuesto que la respuesta. */
const MAX_TOKENS_REVISOR = 6000
/** Lee la noticia entera y piensa antes de responder: mas que un guion. */
const TIMEOUT_REVISOR_MS = 180_000

/**
 * Revisa una version de la pieza. `null` si la cuenta tiene el revisor apagado.
 * No lanza: si falla dos veces, la version queda con el estado "fallo" y quien
 * llama decide (al corregir, una version sin revisar no se queda).
 */
export async function revisarConClaude(o: {
  accountId: string
  red: Red
  version: unknown
  input: LinkedinJobInput
}): Promise<RevisionClaude | null> {
  const ajustes = await ajustesDe(o.accountId, "revisor")
  if (!ajustes.enabled) return null

  // Dinamicos: prompts.ts y modelos.ts importan de aqui el oficio y el modelo.
  const [modelo, system] = await Promise.all([
    import("../agents/modelos").then((m) => m.modeloDe(o.accountId, "revisor")),
    import("../agents/prompts").then((p) => p.promptPara(o.accountId, "revisor", null)),
  ])
  const prompt = promptRevisor(o.red, o.version, o.input)
  const campos = camposDe(o.red, o.version)

  let uso: UsoClaude | null = null
  let error = ""
  for (let intento = 0; intento < 2; intento++) {
    const r = await llamarClaude({
      accountId: o.accountId,
      model: modelo,
      system,
      prompt,
      maxTokens: MAX_TOKENS_REVISOR,
      timeoutMs: TIMEOUT_REVISOR_MS,
    })
    if (!r.ok) {
      error = r.error
      continue
    }
    uso = sumar(uso, r.uso)
    try {
      const { hallazgos, descartados } = hallazgosDeRespuesta(parsearJSONDeClaude(r.texto), campos)
      if (descartados > 0) console.warn(`[revisor-claude] ${descartados} hallazgos sin cita en la pieza, descartados.`)
      return { hallazgos, estado: { estado: "revisada", modelo }, uso }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
  console.error("[revisor-claude] No se pudo revisar:", error)
  return { hallazgos: [], estado: { estado: "fallo", modelo, error: recorta(error, 300) }, uso }
}
