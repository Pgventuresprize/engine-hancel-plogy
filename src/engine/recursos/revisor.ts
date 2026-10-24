import { armarPorPiezas } from "../agents/armador"
import { ajustesDe } from "../agents/settings"
import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"
import { bloqueClasificacion } from "../marca/clasificacion"
import { datosParaPrompt } from "../marca/prompt"
import { bloqueCriterioRevisor } from "../content/criterio"
import { hallazgosDeRespuesta } from "../content/revisor-claude"
import type { EstadoClaude, Hallazgo, Nivel, Regla } from "../content/revisor"
import type { LinkedinJobInput } from "../content/types"
import { textoFuentes, textoRegistro, type FuenteRecurso, type Registro } from "./investigacion"
import { camposRecurso, CRITERIOS_RECURSO, textoRecurso, VEREDICTOS, type Nota, type Recurso, type Veredicto } from "./modelo"

/**
 * El revisor del recurso: lee el recurso junto a las fuentes y el registro, y
 * dice que falla y cuanto vale con una rubrica. Es el mismo agente "revisor" de
 * Configuracion > Agentes (su modelo, si esta encendido y sus skills, como la
 * rubrica editorial de la marca), con un oficio propio para recursos: el de los
 * carruseles habla de laminas y caption.
 *
 * Devuelve hallazgos con el formato de siempre, para el mismo ciclo de
 * correccion, y ademas la nota de cada criterio y un veredicto para la ficha.
 */

export const REGLAS_RECURSO = {
  sin_respaldo: "frena",
  matiz_perdido: "frena",
  opinion_como_hecho: "frena",
  criterio_copiado: "frena",
  criterio_ajeno: "frena",
  contradiccion_oculta: "frena",
  promesa_sin_contenido: "frena",
  interes_no_declarado: "aviso",
  recurso_debil: "aviso",
  falta_contexto: "aviso",
} as const satisfies Partial<Record<Regla, Nivel>>

const RECURSO_REVISOR_OFICIO = `Eres el revisor editorial de la marca. Esta vez no revisas un carrusel: revisas un recurso largo (un reporte o una guía) que se entrega por DM a quien comenta una palabra, junto con su promesa y sus mensajes de DM. Lo lees al lado de las fuentes y del registro de verificación, y dices qué falla. No lo reescribes: señalas el fallo, citas el texto exacto y dices qué hay que hacer.

Un revisor de código ya comprobó lo mecánico: guiones, frases prohibidas, cifras que no están en las fuentes, bloques sin rótulo o sin fuente, secciones que faltan, la palabra y el formato del DM. No repitas eso.

LA FUENTE DE VERDAD SON LAS FUENTES
Lo que sabes por tu cuenta no cuenta. El registro lo armó otro agente: sirve de guía, pero manda lo que dicen las fuentes.

QUÉ REVISAS
1. sin_respaldo. Un bloque rotulado "hecho" (o una tabla) dice algo que sus fuentes no dicen, o se lo atribuye a quien no lo dijo.
2. matiz_perdido. La fuente lo dice con una condición o reserva ("según la empresa", "en sus pruebas", "hasta", "estimado") y el recurso la quita, o generaliza un caso.
3. opinion_como_hecho. Una interpretación o predicción de la marca rotulada o escrita como hecho.
4. criterio_copiado. La lectura de la marca o lo que "haría primero" repite lo que ya concluye o recomienda una fuente. Si la fuente ya lo dice, no es de la marca.
5. criterio_ajeno. La lectura serviría para cualquier noticia o cualquier marca, o contradice cómo trabaja esta marca.
6. contradiccion_oculta. Las fuentes (o el registro) se contradicen en un punto y el recurso da una sola versión como cierta, o lo que no se sabe no aparece.
7. promesa_sin_contenido. La promesa, el mensaje 1 o el mensaje 2 nombran algo que el recurso no trae (una lista, una plantilla, una sección, un número de pasos).
8. interes_no_declarado. Una fuente con interés en la noticia (vende lo que comenta, es parte) se usa sin decirlo.
9. recurso_debil. La lista, la plantilla o la tabla son genéricas: servirían para cualquier tema ("evalúa tus necesidades", "capacita a tu equipo") en vez de decir qué revisar, dónde y con qué umbral ante este hecho.
10. falta_contexto. Un dato que quien lee no puede valorar sin una referencia que las fuentes traen y el recurso no da.

LA RÚBRICA
Además de los hallazgos, pon nota de 1 a 5 a cada criterio (1 falla, 3 correcto pero mejorable, 5 ejemplar), con una frase de por qué:
- evidencia: cada dato con su fuente, hipótesis rotuladas, lo no verificado a la vista.
- se_sabe: lo confirmado, lo de terceros y las contradicciones separados, sin forzar conclusiones.
- lectura: una tesis de la marca que la fuente no tiene, que sale de su criterio.
- valor: quien lee se lleva algo que puede usar mañana.
- recurso: la lista, plantilla o tabla es concreta y usable.
- voz: suena a la marca, sin humo ni muletillas.
- orden: se lee de corrido, cada sección dice lo que promete su título.
- promesa: la promesa y el DM dicen solo lo que hay, y el DM entrega sin insistir.
Y un veredicto: "publicar" (sin frenos y ninguna nota de 1 o 2), "mejorar" (algún freno, o algún 1 o 2), "replantear" (la noticia no da para un recurso de la marca y no se arregla sin cambiar el tema).

CÓMO REVISAS
- Lee primero las fuentes y el registro, después el recurso entero.
- Cada hallazgo cita el texto exacto del recurso, copiado tal cual. Si no lo puedes citar, no es un hallazgo.
- Solo lo que de verdad falla. Un recurso bueno sale sin hallazgos.
- "pide" dice qué cambiar y cómo, para corregirlo sin volver a preguntarte.
- Escribe en el idioma de la marca.`

const RECURSO_REVISOR_CONTRATO = `RESPONDE SOLO con este JSON, sin texto alrededor:
{"hallazgos":[{"regla":"<${Object.keys(REGLAS_RECURSO).join(" | ")}>","donde":"<como aparece en el recurso: sección 2 «título», bloque 3; resumen (punto 1); DM, mensaje 2; promesa>","cita":"<el texto exacto del recurso, hasta 160 caracteres>","detalle":"<qué pasa; si viene de una fuente, qué dice la fuente>","pide":"<qué hacer, concreto>"}],"notas":[{"criterio":"<${CRITERIOS_RECURSO.map((c) => c.clave).join(" | ")}>","nota":<1 a 5>,"por_que":"<una frase>"}],"veredicto":"<publicar | mejorar | replantear>"}
Como mucho 10 hallazgos, los más graves primero. Las ocho notas siempre.`

export type RevisionDelRecurso = {
  hallazgos: Hallazgo[]
  notas: Nota[]
  veredicto: Veredicto | null
  estado: EstadoClaude
  uso: UsoClaude | null
}

function notasDe(bruto: unknown): { notas: Nota[]; veredicto: Veredicto | null } {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>
  const claves = new Set<string>(CRITERIOS_RECURSO.map((c) => c.clave))
  const notas = (Array.isArray(o.notas) ? o.notas : [])
    .map((n) => (n && typeof n === "object" ? (n as Record<string, unknown>) : {}))
    .map((n) => ({ criterio: String(n.criterio ?? ""), nota: Math.round(Number(n.nota)), por_que: String(n.por_que ?? "").trim() }))
    .filter((n) => claves.has(n.criterio) && n.nota >= 1 && n.nota <= 5)
  const veredicto = typeof o.veredicto === "string" && o.veredicto in VEREDICTOS ? (o.veredicto as Veredicto) : null
  return { notas, veredicto }
}

/** El sistema del revisor de recursos: su oficio, la marca y las skills del agente revisor. */
async function sistemaRevisor(accountId: string) {
  const datos = await datosParaPrompt(accountId)
  return armarPorPiezas({
    datos,
    agente: "revisor",
    oficio: RECURSO_REVISOR_OFICIO,
    oficioEditado: false,
    piezasDeOficio: [],
    contrato: RECURSO_REVISOR_CONTRATO,
    situacion: null,
  })
}

const MAX_TOKENS = 8000
const TIMEOUT_MS = 200_000

/**
 * Revisa una version del recurso. `null` si la cuenta tiene el revisor apagado.
 * No lanza: si falla dos veces, la version queda con el estado "fallo".
 */
export async function revisarRecursoConClaude(o: {
  accountId: string
  recurso: Recurso
  input: LinkedinJobInput
  registro: Registro
  fuentes: FuenteRecurso[]
  hasta?: number
}): Promise<RevisionDelRecurso | null> {
  const ajustes = await ajustesDe(o.accountId, "revisor")
  if (!ajustes.enabled) return null
  const [modelo, system] = await Promise.all([
    import("../agents/modelos").then((m) => m.modeloDe(o.accountId, "revisor")),
    sistemaRevisor(o.accountId),
  ])
  const a = o.input.angle
  const clasificacion = bloqueClasificacion(a.clasificacion)
  const prompt = `EL ÁNGULO QUE SE PIDIÓ
- ángulo: ${a.angle}
- tesis: ${a.thesis ?? "(sin tesis)"}
${clasificacion ? `\n${clasificacion}\n` : ""}${bloqueCriterioRevisor(a.criterio)}
REGISTRO DE VERIFICACIÓN
${textoRegistro(o.registro)}

FUENTES
${textoFuentes(o.fuentes)}

EL RECURSO (${o.recurso.tipo})
${textoRecurso(o.recurso)}

LA PROMESA
${o.recurso.promesa}

EL DM
- mensaje 1: ${o.recurso.dm.mensaje1}
- botón: ${o.recurso.dm.boton}
- mensaje 2: ${o.recurso.dm.mensaje2}
- cierre: ${o.recurso.dm.cierre}`

  const campos = camposRecurso(o.recurso)
  let uso: UsoClaude | null = null
  let error = ""
  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0 && o.hasta && Date.now() + TIMEOUT_MS > o.hasta) break
    const r = await llamarClaude({ paso: "recurso-revisor", accountId: o.accountId, model: modelo, system, prompt, maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS })
    if (!r.ok) {
      error = r.error
      continue
    }
    uso = uso ? { entrada: uso.entrada + r.uso.entrada, salida: uso.salida + r.uso.salida, deCache: (uso.deCache ?? 0) + (r.uso.deCache ?? 0) } : r.uso
    try {
      const bruto = parsearJSONDeClaude(r.texto)
      const { hallazgos, descartados } = hallazgosDeRespuesta(bruto, campos, REGLAS_RECURSO)
      if (descartados > 0) console.warn(`[recursos] ${descartados} hallazgos sin cita en el recurso, descartados.`)
      return { hallazgos, ...notasDe(bruto), estado: { estado: "revisada", modelo }, uso }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
  console.error("[recursos] No se pudo revisar el recurso:", error)
  return { hallazgos: [], notas: [], veredicto: null, estado: { estado: "fallo", modelo, error: error.slice(0, 300) }, uso }
}
