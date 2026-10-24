import { llamarClaude, parsearJSONDeClaude } from "../claude/messages"
import { perfilDe } from "../marca/perfil"
import { arreglarOrtografia } from "../render/carousel"

/**
 * Un pase de correccion ortografica sobre el texto ya escrito.
 *
 * El prompt de escritura ya pide tildes y eñes y va acentuado, pero no basta:
 * el modelo se contagia del material que recibe, y el cartucho viene de un
 * agente que a veces escribe sin tildes. En la prueba salio "pequenos",
 * "nitrogeno", "comun" mezclado con texto bien escrito. Un error asi publicado
 * no tiene arreglo, asi que se hace una segunda llamada con un solo trabajo:
 * corregir, sin reescribir.
 *
 * Se manda una lista de textos y se exige la misma lista de vuelta. Si la
 * respuesta no cuadra (otra longitud, un texto vacio, JSON roto), se quedan los
 * originales: un corrector que falla no puede dejar la pieza peor de lo que
 * estaba. Despues pasa la red de palabras fijas, como ultima capa.
 */

const MODELO_CORRECTOR = "claude-haiku-4-5-20251001"

const CORRECTOR_SYSTEM = `Eres corrector ortográfico de español. Recibes una lista JSON de textos y devuelves la MISMA lista con la ortografía corregida.

Corriges solo:
- Tildes que faltan o sobran: "está", "más", "análisis", "café", "común", "pequeños", "según", "cuál", "dónde", "práctico".
- Eñes escritas como n: "pequenos" es "pequeños", "anos" es "años".
- Mayúsculas al inicio de oración si faltan.

NO cambias nada más: ni palabras, ni orden, ni puntuación, ni el sentido, ni la longitud. No mejoras el estilo. Si un texto ya está bien, lo devuelves idéntico.

Cuidado con las palabras que cambian de sentido según la tilde: decide por el contexto. "esta" demostrativo ("esta empresa") no lleva tilde; "está" verbo ("el precio está alto") sí. "que" relativo no; "qué" interrogativo o exclamativo sí. "perdida" participio no; "pérdida" sustantivo sí.

RESPONDE SOLO con este JSON, sin texto alrededor:
{"textos":["<texto 1 corregido>","<texto 2 corregido>"]}

Exactamente el mismo número de textos y en el mismo orden.`

/**
 * Corrige una lista de textos. Nunca lanza: ante cualquier fallo, la red fija.
 *
 * Solo para marcas que escriben en español: el corrector y la red son de
 * español, y sobre un texto en ingles no tienen nada que hacer.
 */
export async function corregirTextos(accountId: string, textos: string[]): Promise<string[]> {
  const { idioma } = await perfilDe(accountId).catch(() => ({ idioma: "es" }))
  if (idioma !== "es") return textos

  const conRed = (lista: string[]) => lista.map(arreglarOrtografia)
  const indices = textos.map((t, i) => (t.trim() ? i : -1)).filter((i) => i >= 0)
  if (indices.length === 0) return textos

  const aCorregir = indices.map((i) => textos[i])
  try {
    const r = await llamarClaude({ paso: "estudio-ortografia",
      accountId,
      model: MODELO_CORRECTOR,
      system: CORRECTOR_SYSTEM,
      prompt: JSON.stringify({ textos: aCorregir }),
      maxTokens: 4000,
    })
    if (!r.ok) return conRed(textos)

    const bruto = parsearJSONDeClaude(r.texto) as { textos?: unknown }
    const vuelta = Array.isArray(bruto.textos) ? bruto.textos : []
    const valida =
      vuelta.length === aCorregir.length &&
      vuelta.every(
        (t, k) =>
          typeof t === "string" &&
          t.trim().length > 0 &&
          // Un corrector no alarga ni acorta de verdad un texto: si cambia mucho
          // la longitud, reescribio en vez de corregir, y se descarta.
          Math.abs(t.length - aCorregir[k].length) <= Math.max(12, aCorregir[k].length * 0.15)
      )
    if (!valida) return conRed(textos)

    const salida = [...textos]
    indices.forEach((i, k) => {
      salida[i] = vuelta[k] as string
    })
    return conRed(salida)
  } catch {
    return conRed(textos)
  }
}
