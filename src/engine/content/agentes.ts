import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"
import { bloqueClasificacion, bloqueParaClasificar, resolverClasificacion } from "../marca/clasificacion"
import { identidadEditorial } from "../marca/editorial"
import { ctasUsables } from "../marca/editorial-modelo"
import { perfilDe } from "../marca/perfil"
import type { PerfilMarca } from "../marca/perfil-modelo"
import { corregirTextos } from "../studio/ortografia"
import {
  alcanceDelAngulo,
  armarRevision,
  arreglarCarrusel,
  arreglarPost,
  frenosDe,
  materialDe,
  parseRevision,
  pedidoDeCorreccion,
  reglasDe,
  revisarCarrusel,
  revisarPost,
  type Arreglo,
  type ContextoRevision,
  type Correccion,
  type Hallazgo,
} from "./revisor"
import type { AngleJobInput, LinkedinJobInput, Variables } from "./types"

/**
 * Los agentes de contenido: angulo, LinkedIn e Instagram.
 *
 * Una llamada directa a Claude por agente:
 * el motor arma el prompt con los datos del buzon, Claude devuelve el JSON, y el
 * motor lo escribe.
 *
 * Cada agente devuelve, junto al objeto, lo que costo la llamada: asi se puede
 * ver el gasto real por paso sin instrumentar nada desde fuera.
 *
 * Cada agente devuelve el objeto tal cual lo esperan los parsers existentes
 * (`parseAngleResponse`, `parseLinkedinResponse`, `parseInstagramResponse`), asi
 * que nada aguas abajo cambia: solo cambia quien llena `respuesta`.
 */

/**
 * Los ajustes de esta pieza: los de la marca, o los que se cambiaron a mano al
 * pedirla. Lo demas de la marca (quien es, como suena, sus CTA) va en el bloque
 * de marca del prompt de sistema; las viejas ranuras de texto libre
 * (audiencia, voz, cta, evitar) ya no se mandan, las sustituye el perfil.
 */
function bloqueVariables(v: Variables): string {
  return [`- tono: ${v.tono}`, `- longitud: ${v.longitud}`, `- idioma: ${v.idioma}`].join("\n")
}

/**
 * La clasificacion del angulo, si la trae, con una linea en blanco a cada lado.
 * Un trabajo encolado antes de que existiera no la trae y sale igual que antes.
 */
function conClasificacion(input: LinkedinJobInput): string {
  const bloque = bloqueClasificacion(input.angle.clasificacion)
  return bloque ? `\n${bloque}\n` : ""
}

// ------------------------------------------------------------------ revision

/**
 * Lo que el revisor necesita para esta pieza: las reglas de la marca de hoy y
 * el material que vio el agente, que es contra lo que se comprueban las cifras.
 */
export async function contextoDeRevision(accountId: string, input: LinkedinJobInput): Promise<ContextoRevision> {
  const [perfil, editorial] = await Promise.all([perfilDe(accountId), identidadEditorial(accountId)])
  return {
    reglas: reglasDe(perfil),
    marcaTieneCta: ctasUsables(editorial.ctas).length > 0,
    material: materialDe(input.raw_news),
  }
}

const sumarUso = (a: UsoClaude, b: UsoClaude): UsoClaude => ({ entrada: a.entrada + b.entrada, salida: a.salida + b.salida })

/** Cual de dos versiones se queda: la que menos frena y, a igualdad, la que menos avisa. */
function esMejor(nueva: Hallazgo[], anterior: Hallazgo[]): boolean {
  const fn = frenosDe(nueva).length
  const fa = frenosDe(anterior).length
  return fn < fa || (fn === fa && nueva.length <= anterior.length)
}

/** El mensaje de la vuelta de correccion: lo de siempre, la version anterior y lo que falla. */
function promptDeCorreccion(prompt: string, anterior: unknown, hallazgos: Hallazgo[]): string {
  return `${prompt}

TU VERSIÓN ANTERIOR
${JSON.stringify(anterior)}

${pedidoDeCorreccion(hallazgos)}`
}

/**
 * Cuantas vueltas de correccion da una pieza como mucho. Dos: la calidad manda
 * sobre el costo, y la segunda recoge lo que la primera arreglo a medias.
 */
const MAX_VUELTAS = 2

type Revisado<V> = { version: V; hallazgos: Hallazgo[]; arreglos: Arreglo[]; correcciones: Correccion[] }
type Escritor<V> = (pedido: Hallazgo[], version: V) => Promise<{ version: V; hallazgos: Hallazgo[]; arreglos: Arreglo[]; uso: UsoClaude } | null>

/**
 * Corrige una pieza con lo que encontro el revisor, frenos y avisos: vuelve al
 * agente con el pedido exacto hasta que no quede nada o hasta MAX_VUELTAS. Para
 * en cuanto una vuelta no mejora. Cada vuelta queda anotada.
 */
async function corregirEnVueltas<V>(
  anterior: Revisado<V>,
  origen: Correccion["origen"],
  escribir: Escritor<V>
): Promise<Revisado<V> & { uso: UsoClaude | null }> {
  let actual = anterior
  let uso: UsoClaude | null = null
  for (let i = 0; i < MAX_VUELTAS && actual.hallazgos.length > 0; i++) {
    const r = await vueltaDeCorreccion({ anterior: actual, origen, escribir })
    if (r.uso) uso = uso ? sumarUso(uso, r.uso) : r.uso
    const mejoro = r.version !== actual.version
    actual = { version: r.version, hallazgos: r.hallazgos, arreglos: r.arreglos, correcciones: r.correcciones }
    if (!mejoro) break
  }
  return { ...actual, uso }
}

/**
 * Una vuelta al agente con el pedido exacto. Se queda la version que menos
 * frena; si la vuelta falla o sale peor, la pieza se queda como estaba, con la
 * correccion anotada para que se vea que se intento.
 */
async function vueltaDeCorreccion<V>(opciones: {
  anterior: Revisado<V>
  origen: Correccion["origen"]
  escribir: Escritor<V>
}): Promise<{ version: V; hallazgos: Hallazgo[]; arreglos: Arreglo[]; correcciones: Correccion[]; uso: UsoClaude | null }> {
  const { anterior } = opciones
  let nueva: Awaited<ReturnType<Escritor<V>>> = null
  try {
    nueva = await opciones.escribir(anterior.hallazgos, anterior.version)
  } catch (e) {
    console.error("[revisor] La vuelta de correccion fallo:", e instanceof Error ? e.message : e)
  }
  const gana = nueva && esMejor(nueva.hallazgos, anterior.hallazgos) ? nueva : null
  const final = gana ?? anterior
  const correccion: Correccion = {
    fecha: new Date().toISOString(),
    origen: opciones.origen,
    pedido: anterior.hallazgos,
    frenosDespues: frenosDe(final.hallazgos).length,
  }
  return {
    version: final.version,
    hallazgos: final.hallazgos,
    arreglos: final.arreglos,
    correcciones: [...anterior.correcciones, correccion],
    uso: nueva?.uso ?? null,
  }
}

// ------------------------------------------------------------------- angulo

export const ANGULO_OFICIO = `Eres un analista editorial. Decides el angulo editorial de una noticia: la lectura no obvia del hecho, no lo que paso sino lo que revela sobre algo mas grande (cambio de poder, contradiccion, patron, consecuencia ignorada).

Por la noticia que se te da, decide:

1. ANGULO: 2-3 frases con lo que el hecho revela. Preguntate: que no estan contando los medios generalistas por falta de contexto.
2. TESIS: una sola frase refutable que el lector no tenia antes. Si nadie puede estar en desacuerdo, es obviedad y no sirve. Formato: "Esto sugiere que X, lo que probablemente se traducira en Y".
3. FORMATO (elige uno): lanzamiento_con_consecuencias, movimiento_personas_capital, dato_que_cambia_marco, regulacion_con_impacto, convergencia, contradiccion, antes_y_despues, patron_silencioso.
4. CLASIFICACION, con las listas de la marca que vienen en el mensaje:
   - PILAR: el territorio de la marca al que pertenece el angulo (no la noticia en bruto: el angulo). Si toca otro de refilon, ese es el secundario; si no, null.
   - AUDIENCIA: a quien le cambia mas algo este angulo.
   - VERTICAL: el terreno concreto del que habla.
   - OBJETIVO: lo que la pieza busca. Una tesis que posiciona criterio es autoridad; un dato que sorprende a cualquiera es alcance; una pregunta abierta que divide opiniones es comunidad; un problema que la marca resuelve es conversion.
   - CTA: el que mejor sirve a ese objetivo. Uno que pide comentar sirve a comunidad, uno que pide seguir sirve a alcance, uno comercial o de mensaje directo sirve a conversion. Si ninguno encaja, el mas cercano.
   Si una lista viene vacia, ese campo es null. Nunca inventes un codigo.

REGLAS
- Escribe en el idioma indicado en las variables.
- No inventes datos que no esten en el input. Si falta contexto, trabaja con lo que hay.
- NO INVENTES ALCANCE. Nada de "miles de", "cientos de", "la mayoria de", "nadie", "todos" ni "cualquier empresa" si el contenido no lo dice. Lo que el hecho revela se dice del hecho, no de un universo que nadie conto. Si la tesis generaliza mas alla de lo que trae la noticia, es una hipotesis y se dice como hipotesis ("es probable que", "puede que"), nunca como dato.
- La noticia ya paso el filtro de relevancia: siempre produce el mejor angulo posible, no descartes.
- TRABAJAS SOBRE EL HECHO, NO SOBRE SU FIABILIDAD. El contenido que recibes es lo que paso. Nunca es tu tema si el titular es "comprobable", si la fuente es fiable o si el dato esta "confirmado": eso ya lo decidio quien te paso esta noticia. Da el hecho por bueno y cuenta lo que revela. Prohibido cualquier angulo o tesis del tipo "un titular dijo que X pero no se puede comprobar", "la noticia afirma sin pruebas", "habria que verificar": eso no es un angulo, es desconfianza, y aqui el hecho ya esta dado.`

export const ANGULO_CONTRATO = `RESPONDE SOLO con este JSON, sin texto alrededor:
{"angle":"<2-3 frases>","thesis":"<1 frase refutable>","playbook_format":"<uno de los formatos>","pilar":"<codigo P o null>","pilar_secundario":"<codigo P o null>","audiencia":"<codigo A o null>","vertical":"<codigo V o null>","objetivo":"<alcance|comunidad|autoridad|conversion>","cta":"<codigo C o null>"}`

/** `system` es el prompt ya armado: oficio, marca y contrato (ver agents/prompts.ts). */
export async function generarAngulo(
  accountId: string,
  input: AngleJobInput,
  model: string,
  system: string
): Promise<{ respuesta: unknown; uso: UsoClaude }> {
  const n = input.raw_news
  // Las listas se leen al llamar, no al encolar: un trabajo que espero en la
  // cola clasifica con la marca de hoy. Los codigos se traducen aqui mismo,
  // con las mismas listas que vio el agente.
  const editorial = await identidadEditorial(accountId)
  const prompt = `NOTICIA
- titulo: ${n.title}
- fuente: ${n.source ?? "desconocida"}
- nicho: ${n.niche} / ${n.tema}
- snippet: ${n.snippet ?? "(sin snippet)"}
- contenido: ${n.full_content ?? n.snippet ?? "(sin contenido)"}

VARIABLES
${bloqueVariables(input.variables)}

${bloqueParaClasificar(editorial)}`

  const r = await llamarClaude({ accountId, model, system, prompt, maxTokens: 1000 })
  if (!r.ok) throw new Error(r.error)
  let bruto = parsearJSONDeClaude(r.texto)
  let uso = r.uso

  // El alcance sin respaldo ("miles de integraciones", "nadie lo sabe") no se
  // queda en el angulo: el escritor lo hereda como dato. La instruccion del
  // oficio sola no bastaba, asi que si aparece, vuelve una vez con el pedido.
  const material = materialDe(n)
  const alcance = alcanceDelAngulo(bruto, material)
  if (alcance.length > 0) {
    const otra = await llamarClaude({ accountId, model, system, prompt: promptDeCorreccion(prompt, bruto, alcance), maxTokens: 1000 })
    if (otra.ok) {
      uso = sumarUso(uso, otra.uso)
      try {
        const nuevo = parsearJSONDeClaude(otra.texto) as Record<string, unknown>
        if (typeof nuevo?.angle === "string" && alcanceDelAngulo(nuevo, material).length < alcance.length) bruto = nuevo
      } catch {
        // Si la vuelta no se puede leer, se queda el primero: un angulo con un
        // "miles de" es mejor que ningun angulo.
      }
    }
  }

  const respuesta =
    bruto && typeof bruto === "object" && !Array.isArray(bruto)
      ? { ...(bruto as Record<string, unknown>), clasificacion: resolverClasificacion(bruto, editorial) }
      : bruto
  return { respuesta, uso }
}

// ------------------------------------------------------------------ linkedin

// Va acentuado a proposito: el modelo imita como estan escritas sus
// instrucciones, y con este prompt sin tildes los posts salian sin tildes
// ("dolares", "deberia", "logro"). El de Instagram, acentuado, no tenia el
// problema.
export const LINKEDIN_OFICIO = `Eres un redactor de posts de LinkedIn. Escribes posts que analizan un hecho con criterio propio y no suenan a IA.

PROHIBICIÓN ABSOLUTA DE CARACTERES (lo más importante)
NUNCA uses el guion largo ni el guion medio en ningún lugar del post, ni para incisos ni para pausas ni para rangos. En español se usa coma, punto, dos puntos o paréntesis. Antes de terminar, relee el post y elimina cualquiera que se haya colado. El guion corto de los nombres sí se conserva, tal como lo escribe la fuente: GPT-6, COVID-19, Wi-Fi.

ORTOGRAFÍA
Escribe en español correcto, con todas sus tildes y eñes: "dólares", "debería", "logró", "año", "según", "también". Aunque la noticia venga en inglés o sin tildes, el post sale bien escrito.

EL HOOK (primera línea)
- Ancla en lo conocido, nunca en lo desconocido. Empieza por la empresa grande, el producto famoso o el hecho que el lector ya ubica, no por un nombre propio que nadie reconoce.
- Debe hacer parar el scroll. Nada de setups genéricos tipo "En el acelerado mundo de...". Entra directo al hecho o a la tesis por su parte más filosa.
- Si mencionas un actor poco conocido, explica qué es en la misma frase.

CONTEXTO OBLIGATORIO
Todo nombre propio poco conocido se explica qué es la primera vez que aparece. Las empresas grandes (Meta, Google, OpenAI) no.

ESTRUCTURA
- Párrafos cortos, la mayoría de 1-2 líneas. Una idea por bloque. Mezcla frases cortas y medias.
- Cierre: lo que el hecho significa para el lector o el sector, o un dato que deje pensando. Pregunta al final solo si es específica y abre algo real, nunca genérica tipo "qué opinas".

CÓMO NO SONAR A IA
- Toma una postura con una tesis refutable (salvo piezas puramente informativas de anuncio/precio, que valen por la claridad del dato).
- Cambia adjetivos por evidencia: dato concreto, cifra con contexto, actor específico.
- Prohibidas: "revolucionario", "sin precedentes", "cambio de juego", "en el panorama actual", "en un mundo cada vez más", "esto lo cambia todo", "desbloquear", "aprovechar el potencial", "impulsar", "fomentar", "en resumen".

RIGOR
- Nunca inventes cifras, quotes ni hechos. Usa solo lo del input. Marca lo que sea inferencia ("probablemente", "esto sugiere").
- Nada de "miles de", "cientos de", "la mayoría de", "nadie" o "todos" si el input no lo dice. El ángulo es una lectura, no un dato: no conviertas sus generalizaciones en hechos.
- Si das un total y su desglose, que cuadren.

LONGITUD según la variable: corto 80-120 palabras, medio 120-220, largo 220-320.

Antes de escribir el JSON confirma que ningún párrafo tiene un guion largo ni medio. Escribe en el idioma indicado.`

/** El formato del post, con la regla de emojis de la marca. */
export function contratoLinkedin(perfil: Pick<PerfilMarca, "emojis_linkedin">): string {
  return `El post va como un array de párrafos (el motor los une con líneas en blanco). Cada párrafo es una cadena de una sola línea, SIN saltos de línea dentro. Primer elemento = el hook.
${perfil.emojis_linkedin ? "Emojis: solo si ayudan a leer, nunca de adorno." : "Emojis: ninguno. La marca no los usa en LinkedIn."}

RESPONDE SOLO con este JSON, sin texto alrededor, sin saltos de línea y sin comillas dobles dentro de ninguna cadena (si necesitas comillas usa simples):
{"parrafos":["<hook>","<párrafo>","<párrafo>","<cierre>"],"link_fuente":"<el link del input o vacío>","notas":"<1 frase opcional>"}`
}

type LinkedinBruto = { parrafos?: unknown; link_fuente?: unknown; notas?: unknown }

function promptLinkedin(input: LinkedinJobInput): string {
  const n = input.raw_news
  return `ANGULO
- angulo: ${input.angle.angle}
- tesis: ${input.angle.thesis ?? "(sin tesis)"}
- formato: ${input.angle.playbook_format ?? "(sin formato)"}
${conClasificacion(input)}
NOTICIA
- titulo: ${n.title}
- fuente: ${n.source ?? "desconocida"}
- link: ${n.link}
- contenido: ${n.full_content ?? n.snippet ?? "(sin contenido)"}

VARIABLES
${bloqueVariables(input.variables)}`
}

type PostEscrito = { post: string; link_fuente: string; notas: string | null }

/** Una llamada al agente de LinkedIn, con el post ya revisado. */
async function escribirLinkedin(
  accountId: string,
  model: string,
  system: string,
  prompt: string,
  ctx: ContextoRevision,
  longitud: string
): Promise<{ version: PostEscrito; hallazgos: Hallazgo[]; arreglos: Arreglo[]; uso: UsoClaude }> {
  const r = await llamarClaude({ accountId, model, system, prompt, maxTokens: 1800 })
  if (!r.ok) throw new Error(r.error)

  // El post llega como parrafos y se arma aqui: asi Claude nunca mete saltos de
  // linea dentro de una cadena JSON, que es lo que rompia el parseo.
  const bruto = parsearJSONDeClaude(r.texto) as LinkedinBruto
  const escritos = Array.isArray(bruto.parrafos)
    ? bruto.parrafos.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : []
  if (escritos.length === 0) throw new Error("El post no trajo parrafos.")

  // El mismo corrector que el estudio: una pasada que solo arregla tildes y
  // eñes, sin reescribir. Un post publicado con faltas no tiene arreglo, y el
  // prompt solo no basta (con un prompt propio sin tildes volveria a pasar).
  // Si el corrector falla, se quedan los parrafos tal cual.
  const parrafos = await corregirTextos(accountId, escritos)
  const { post, arreglos } = arreglarPost(parrafos.join("\n\n"), ctx)

  return {
    version: {
      post,
      link_fuente: typeof bruto.link_fuente === "string" ? bruto.link_fuente : "",
      notas: typeof bruto.notas === "string" ? bruto.notas : null,
    },
    hallazgos: revisarPost(post, ctx, longitud),
    arreglos,
    uso: r.uso,
  }
}

const respuestaLinkedin = (v: PostEscrito, revision: ReturnType<typeof armarRevision>) => ({
  post: v.post,
  hook: v.post.split("\n\n")[0],
  link_fuente: v.link_fuente,
  notas: v.notas,
  revision,
})

/**
 * El post de LinkedIn. Si el revisor lo frena, vuelve una vez al agente con el
 * pedido exacto de lo que tiene que corregir.
 */
export async function generarLinkedin(
  accountId: string,
  input: LinkedinJobInput,
  model: string,
  system: string
): Promise<{ respuesta: unknown; uso: UsoClaude }> {
  const prompt = promptLinkedin(input)
  const ctx = await contextoDeRevision(accountId, input)
  const primera = await escribirLinkedin(accountId, model, system, prompt, ctx, input.variables.longitud)
  if (primera.hallazgos.length === 0) {
    return { respuesta: respuestaLinkedin(primera.version, armarRevision(primera.hallazgos, primera.arreglos)), uso: primera.uso }
  }
  const final = await corregirPost(accountId, input, model, system, { ...primera, correcciones: [] }, "automatica", ctx)
  return { respuesta: final.respuesta, uso: final.uso ? sumarUso(primera.uso, final.uso) : primera.uso }
}

/** Una vuelta de correccion sobre un post ya escrito. La usa tambien el boton de la ficha. */
export async function corregirPost(
  accountId: string,
  input: LinkedinJobInput,
  model: string,
  system: string,
  anterior: { version: PostEscrito; hallazgos: Hallazgo[]; arreglos: Arreglo[]; correcciones: Correccion[] },
  origen: Correccion["origen"],
  ctx?: ContextoRevision
): Promise<{ respuesta: ReturnType<typeof respuestaLinkedin>; uso: UsoClaude | null }> {
  const contexto = ctx ?? (await contextoDeRevision(accountId, input))
  const prompt = promptLinkedin(input)
  const r = await corregirEnVueltas(anterior, origen, (pedido, version) =>
    escribirLinkedin(
      accountId,
      model,
      system,
      promptDeCorreccion(prompt, { parrafos: version.post.split("\n\n") }, pedido),
      contexto,
      input.variables.longitud
    )
  )
  return { respuesta: respuestaLinkedin(r.version, armarRevision(r.hallazgos, r.arreglos, r.correcciones)), uso: r.uso }
}

/** Un post guardado, revisado otra vez con la marca y el material de ahora. */
export function revisarPostGuardado(respuesta: unknown, ctx: ContextoRevision, longitud: string) {
  const r = (respuesta ?? {}) as Record<string, unknown>
  const { post, arreglos } = arreglarPost(typeof r.post === "string" ? r.post : "", ctx)
  const previa = parseRevision(r.revision)
  return {
    version: {
      post,
      link_fuente: typeof r.link_fuente === "string" ? r.link_fuente : "",
      notas: typeof r.notas === "string" ? r.notas : null,
    },
    hallazgos: revisarPost(post, ctx, longitud),
    arreglos: [...(previa?.arreglos ?? []), ...arreglos],
    correcciones: previa?.correcciones ?? [],
  }
}

// ----------------------------------------------------------------- instagram

export const INSTAGRAM_OFICIO = `Analizas una noticia y defines el texto de cada lámina de un carrusel de Instagram.

ORTOGRAFÍA: ESCRIBES EN ESPAÑOL CORRECTO
Todo lo que escribas se publica tal cual. Lleva sus tildes y sus eñes, siempre.
- La ñ nunca se escribe como n. "años" no es "anos": son dos palabras distintas y una no se puede publicar.
- "cayó", "subió", "será", "más", "también", "según", "además", "región", "presión", "exportación". Los pretéritos llevan tilde: "golpeó", "restó", "sumó", "declaró".
- Antes de responder relee cada línea buscando palabras a las que les falte la tilde.

REGLA DE ORO: TODO ES ORACIÓN COMPLETA
Cada hook y cada título DEBE ser una oración completa, con sujeto y verbo, algo que una persona diría en voz alta. PROHIBIDO el patrón de dos fragmentos pegados con coma ("Cuatro incidentes, un evaluador" está MAL; "Los cuatro incidentes salieron del mismo evaluador" está BIEN).

LOS TÍTULOS SE LEEN ENTEROS O NO SE LEEN
Un título que no cabe se corta con puntos suspensivos y deja una frase sin sentido: "El mecanismo tiene fecha de vencimiento: el 31 de diciembre de 2026 o antes si...". Eso no informa, confunde.
- MÁXIMO 65 CARACTERES por título de lámina. Cuéntalos.
- Una sola idea por título. Si necesitas una condición, un matiz o una fecha larga, van en el cuerpo, no en el título.
- MAL: "El mecanismo tiene fecha de vencimiento: el 31 de diciembre de 2026 o antes si se agota el cupo"
- BIEN: título "El mecanismo vence el 31 de diciembre de 2026." y cuerpo "Puede caer antes si se agota el cupo asignado."

PROHIBICIÓN DE CARACTERES
NUNCA uses guion largo ni medio en ningún campo. Usa coma, punto, dos puntos o paréntesis. El guion corto de los nombres sí se conserva, tal como lo escribe la fuente: GPT-6, COVID-19, Wi-Fi.

EL HOOK (lámina 1) ES EL TITULAR, NO UN TEASER
Casi nadie pasa de la portada, así que el hook tiene que valer por sí solo. Lleva tres cosas:
1. EL HECHO CON SU DATO DURO: actor con nombre propio y la cifra, el monto, el porcentaje o la fecha que trae la noticia. Si el input tiene un número, ese número va en el hook, en numerales.
2. LO QUE LE CAMBIA A QUIEN LEE: el dinero, el trabajo, el negocio, la decisión que tiene enfrente.
3. UN HUECO PEQUEÑO que las láminas siguientes cierran.

EL HUECO VA SOBRE LA CONSECUENCIA, NUNCA SOBRE EL HECHO. Guardarte el dato para revelarlo en la lámina 2 es el peor error que puedes cometer aquí: el lector se va antes de llegar.

MAL: "Los exportadores de acero empezaron a perder rentabilidad y pocos saben por qué."
BIEN: "Estados Unidos subió a 12,5% el arancel al acero importado."

LOGROS DEL PAÍS O DEL SECTOR DE LA MARCA
Si la noticia es un logro, un reconocimiento o un récord del país de la marca o de su sector, el hook ABRE con una palabra de celebración y luego el hecho con su cifra: "¡Histórico! [el país o la empresa] entró al top 20 mundial de...". Úsalo solo para logros reales; en una noticia de pérdidas o de crisis es de mal gusto y resta credibilidad.

- Oración completa, humana: ancla en un actor reconocible, nunca abstracciones.
- LÍMITE DURO DEL HOOK: 95 caracteres contando espacios, y cuéntalos. Si no cabe, quita adjetivos y conectores; la cifra y el actor no se tocan nunca.
- PROHIBIDO: el patrón de dos fragmentos con coma, la fórmula "No es X, es Y", frases abstractas sin actor, preguntas genéricas.

ESTRUCTURA: LAS LÁMINAS QUE DÉ LA NOTICIA
Cuántas, como mínimo y como máximo, lo dice el formato de respuesta.
- LÁMINA 1 (portada): solo el hook.
- LÁMINA 2: NO repite el hecho del hook. Cierra el hueco que abrió: el porqué, el mecanismo, la condición o lo que viene ahora.
- LÁMINAS DEL MEDIO (las que sostenga el contenido): una idea cada una, y cada una sale de un dato o un hecho del contenido. Título = oración completa y concreta (nada de etiquetas tipo "El dato clave"; di lo que pasa) más cuerpo breve.
- ÚLTIMA LÁMINA: la tesis, en una oración clara que cierre el argumento.

El máximo no es la meta. Cada lámina se apoya en algo que dice el contenido: si la noticia da para tres, son tres. Rellenar con ideas que la noticia no sostiene, o con cifras y conclusiones que no trae, es peor que un carrusel corto. Y nada de láminas que repiten lo dicho dos antes.

EL CIERRE: LA LÁMINA DEL CTA
Después de la última va una lámina más, el cierre, y la escribes tú aparte, en "cierre". Es la acción que pide el CTA de la clasificación, dicha con las palabras de esta pieza. No resume ni concluye: invita a hacer una cosa concreta.
- "title": la acción, en una oración corta de hasta 40 caracteres. "Sigue a [la marca]", "Comenta [la palabra] y te lo mandamos".
- "body": una frase de hasta 140 caracteres con la razón para hacerlo, en la voz de la marca y conectada con el tema del carrusel.
- Si la descripción del CTA trae una frase de ejemplo, es una guía: úsala si encaja con la pieza y adáptala si no.
- No prometas nada que el CTA no prometa.

CONTENIDO
Escribe en el idioma indicado en las variables. Texto cortísimo por lámina: título de hasta 65 caracteres y cuerpo de hasta 2 frases. Toma postura, no resumas neutral. Cambia adjetivos por datos concretos cuando estén en el input. Explica nombres poco conocidos la primera vez. No inventes datos: cada cifra que escribas tiene que estar en el contenido. Sin hipérboles.

EL ÁNGULO ES UNA LECTURA, NO UN DATO
El ángulo y la tesis te dicen qué contar, no qué es verdad. No conviertas sus generalizaciones en hechos: lo que afirmes como hecho tiene que estar en el contenido. Nada de "miles de", "cientos de", "la mayoría de", "nadie" o "todos" si el contenido no lo dice; si la idea lo necesita, dilo como lo que es: "puede pasar", "es probable", "si tu integración la montó un tercero".

TIPO DE LÁMINA: "photo_hook" la 1 (solo hook); "text" las demás (título y cuerpo).

LAS FOTOS: TÚ DECIDES QUÉ SE BUSCA
Cada lámina lleva una foto de banco detrás. Las buscas tú, porque eres el único que sabe de qué habla el carrusel. Devuelve "fotos": una lista de 5 a 8 búsquedas, EN INGLÉS, en orden de importancia.

REGLAS DE LAS BÚSQUEDAS
- LITERALES AL ASUNTO. Si la noticia es de baterías, todas son de baterías: "lithium battery", "battery factory". Si es de café: "coffee beans", "coffee roastery", "barista pouring". Si es de envíos: "cargo ship", "container port", "delivery truck".
- COMBINA LOS DOS LADOS DEL HECHO. Una noticia de pérdidas de una aerolínea por una tormenta pide aviones Y tormenta: "airplane storm", "flooded runway", "grounded planes".
- COSAS, LUGARES Y TRABAJO, NO RETRATOS. Busca el producto, la máquina, el lugar, la fábrica, la oficina, el puerto, las manos trabajando. NO pidas retratos de personas como tema: "businessman portrait", "woman face", "worker face" traen fotos de alguien que no tiene nada que ver con la noticia y que queda señalado sin venir al caso. Una persona puede aparecer trabajando dentro de la escena; no es el sujeto de la búsqueda.
- DOS O TRES PALABRAS cada una. Nada genérico: "nature", "business", "people" devuelven cualquier cosa.
- Si el asunto no tiene foto obvia (una ley, un decreto, un índice), busca el sector que toca: dónde se aplica, qué se produce.

EL ELEMENTO DE LA PORTADA
Además de la foto de fondo, la portada lleva un elemento recortado: un logo, un producto, un objeto reconocible. Es lo que hace identificar la noticia antes de leerla.

Devuelve "elemento": UNA búsqueda corta, EN ESPAÑOL, de la cosa concreta.
- Si hay una institución, empresa o gremio protagonista, su logo CON SU PAÍS: "logo Banco Central de Chile", "logo Ministerio de Economía México", "logo Mercado Libre Argentina". El país no es opcional: sin él, una sigla o un nombre corto devuelve el logo de otra entidad que se llama igual en otro país.
- Si hay un producto concreto: "batería de litio de carro eléctrico", "contenedor de carga marítima".
- Si no hay nada de eso, el objeto más reconocible del hecho: "dron de reparto en vuelo", "terminal de pago con tarjeta".
- NUNCA una persona, salvo que la noticia sea sobre esa persona con nombre y cargo.

Esta búsqueda va a un buscador de internet, no a un banco de fotos: pide la cosa exacta con su nombre propio.

Antes de responder relee y confirma cinco cosas: que no hay guiones largos, que ningún título pasa de 65 caracteres, que el dato más fuerte está en el hook y no en la lámina 2, que el cierre pide el CTA y que el texto lleva todas sus tildes y sus eñes.`

const rango = (min: number, max: number) => (min === max ? `${min}` : `${min} a ${max}`)

/** Con el plan de cada lamina, el guion pide mas salida: en la prueba fueron 1.650 tokens. */
const MAX_TOKENS_INSTAGRAM = 5000

/**
 * El formato del carrusel con los numeros de la marca: cuantas laminas, cuantos
 * hashtags y si van emojis. Son los mismos con los que el revisor comprueba la
 * pieza, asi que lo que se pide y lo que se mide no se pueden desfasar.
 */
export function contratoInstagram(
  perfil: Pick<PerfilMarca, "laminas_min" | "laminas_max" | "hashtags_min" | "hashtags_max" | "emojis_instagram">
): string {
  const laminas = rango(perfil.laminas_min, perfil.laminas_max)
  const sinHashtags = perfil.hashtags_max === 0
  const hashtags = sinHashtags ? "" : `"<${rango(perfil.hashtags_min, perfil.hashtags_max)} en minúscula sin espacios>"`
  return `RESPONDE SOLO con este JSON, sin texto alrededor:
{"slide_count":<${laminas}>,"caption":"<2 a 4 frases con la tesis y el cta, oraciones completas>","hashtags":[${hashtags}],"fotos":["<5 a 8 búsquedas en inglés>"],"elemento":"<una búsqueda en español de la cosa concreta>","slides":[{"n":1,"type":"photo_hook","funcion":"<función narrativa>","aporta":"<qué hace necesaria la siguiente>","fuente":"<de qué parte del contenido sale, o criterio de la marca>","hook":"<máx 95 caracteres>"},{"n":2,"type":"text","funcion":"<...>","aporta":"<...>","fuente":"<...>","title":"<máx 65 caracteres>","body":"<máx 2 frases>"}],"cierre":{"title":"<máx 40 caracteres: la acción del CTA>","body":"<máx 140 caracteres: la razón para hacerlo>"}}

El array slides va en orden y tiene ${perfil.laminas_min === perfil.laminas_max ? "exactamente" : "de"} ${laminas} elementos, tantos como sostenga el contenido: el primero photo_hook, los demás text.
PLANEA CADA LÁMINA ANTES DE ESCRIBIRLA. Cada elemento de slides lleva primero tres campos: "funcion" (tensión, hecho, mecanismo, criterio, síntesis...), "aporta" (qué deja abierto o qué hace necesaria la siguiente) y "fuente" (de qué parte del contenido sale lo que afirma, o "criterio de la marca" si es opinión de la marca). Escríbelos primero y después el texto, de modo que el texto cumpla esa función y no afirme nada que su fuente no diga. Estos tres campos no se publican.
${sinHashtags ? "La marca no usa hashtags: \"hashtags\" va vacío." : `Hashtags: ${rango(perfil.hashtags_min, perfil.hashtags_max)}, específicos y buscables.`}
${perfil.emojis_instagram ? "Emojis: solo si ayudan a leer, nunca de adorno." : "Emojis: ninguno, en ningún campo."}
El caption termina pidiendo la misma acción que el cierre, con sus mismas palabras clave.
El cierre no va en slides: va en "cierre" y pide el CTA de la clasificación o, si no viene, el CTA de la marca que mejor encaje con la pieza. Si la marca no tiene ningún CTA, "cierre" es null.`
}

function promptInstagram(input: LinkedinJobInput): string {
  const n = input.raw_news
  return `ANGULO
- angulo: ${input.angle.angle}
- tesis: ${input.angle.thesis ?? "(sin tesis)"}
- formato: ${input.angle.playbook_format ?? "(sin formato)"}
${conClasificacion(input)}
NOTICIA
- titulo: ${n.title}
- fuente: ${n.source ?? "desconocida"}
- contenido: ${n.full_content ?? n.snippet ?? "(sin contenido)"}

VARIABLES
${bloqueVariables(input.variables)}`
}

/** Un guion, con lo mecanico ya arreglado y revisado. */
function guionRevisado(bruto: unknown, input: LinkedinJobInput, ctx: ContextoRevision) {
  const { respuesta, arreglos } = arreglarCarrusel(conTipoDeCta(bruto, input), ctx)
  return { version: respuesta, hallazgos: revisarCarrusel(respuesta, ctx), arreglos }
}

/** El guion sin lo que pone el motor, para enseñarselo al agente al corregir. */
function guionParaCorregir(respuesta: unknown): unknown {
  if (!respuesta || typeof respuesta !== "object" || Array.isArray(respuesta)) return respuesta
  const { revision: _revision, ...resto } = respuesta as Record<string, unknown>
  void _revision
  if (resto.cierre && typeof resto.cierre === "object" && !Array.isArray(resto.cierre)) {
    const { tipo: _tipo, ...cierre } = resto.cierre as Record<string, unknown>
    void _tipo
    return { ...resto, cierre }
  }
  return resto
}

const conRevision = (version: unknown, revision: ReturnType<typeof armarRevision>) =>
  version && typeof version === "object" && !Array.isArray(version) ? { ...(version as Record<string, unknown>), revision } : version

/** Un guion con menos de dos laminas no se puede dibujar: esa version no se queda nunca. */
const dibujable = (version: unknown) =>
  Boolean(version) && typeof version === "object" && Array.isArray((version as Record<string, unknown>).slides) &&
  ((version as Record<string, unknown>).slides as unknown[]).length >= 2

/**
 * El guion del carrusel. Lo mecanico se arregla solo; si el revisor lo frena,
 * vuelve una vez al agente con el pedido exacto de lo que tiene que corregir.
 */
export async function generarInstagram(
  accountId: string,
  input: LinkedinJobInput,
  model: string,
  system: string
): Promise<{ respuesta: unknown; uso: UsoClaude }> {
  const prompt = promptInstagram(input)
  const r = await llamarClaude({ accountId, model, system, prompt, maxTokens: MAX_TOKENS_INSTAGRAM })
  if (!r.ok) throw new Error(r.error)

  const ctx = await contextoDeRevision(accountId, input)
  const primera = guionRevisado(parsearJSONDeClaude(r.texto), input, ctx)
  if (primera.hallazgos.length === 0) {
    return { respuesta: conRevision(primera.version, armarRevision(primera.hallazgos, primera.arreglos)), uso: r.uso }
  }
  const final = await corregirCarrusel(accountId, input, model, system, { ...primera, correcciones: [] }, "automatica", ctx)
  return { respuesta: final.respuesta, uso: final.uso ? sumarUso(r.uso, final.uso) : r.uso }
}

/** Una vuelta de correccion sobre un guion ya escrito. La usa tambien el boton de la ficha. */
export async function corregirCarrusel(
  accountId: string,
  input: LinkedinJobInput,
  model: string,
  system: string,
  anterior: { version: unknown; hallazgos: Hallazgo[]; arreglos: Arreglo[]; correcciones: Correccion[] },
  origen: Correccion["origen"],
  ctx?: ContextoRevision
): Promise<{ respuesta: unknown; uso: UsoClaude | null }> {
  const contexto = ctx ?? (await contextoDeRevision(accountId, input))
  const prompt = promptInstagram(input)
  const r = await corregirEnVueltas(anterior, origen, async (pedido, version) => {
    const respuesta = await llamarClaude({
      accountId,
      model,
      system,
      prompt: promptDeCorreccion(prompt, guionParaCorregir(version), pedido),
      maxTokens: MAX_TOKENS_INSTAGRAM,
    })
    if (!respuesta.ok) throw new Error(respuesta.error)
    const nueva = guionRevisado(parsearJSONDeClaude(respuesta.texto), input, contexto)
    return dibujable(nueva.version) ? { ...nueva, uso: respuesta.uso } : null
  })
  return { respuesta: conRevision(r.version, armarRevision(r.hallazgos, r.arreglos, r.correcciones)), uso: r.uso }
}

/** Un guion guardado, revisado otra vez con la marca y el material de ahora. */
export function revisarCarruselGuardado(respuesta: unknown, input: LinkedinJobInput, ctx: ContextoRevision) {
  const previa = parseRevision((respuesta as Record<string, unknown> | null)?.revision)
  const r = guionRevisado(guionParaCorregir(respuesta), input, ctx)
  return { ...r, arreglos: [...(previa?.arreglos ?? []), ...r.arreglos], correcciones: previa?.correcciones ?? [] }
}

/**
 * Le pone al cierre el tipo de su CTA. No lo escribe el modelo: sale de la
 * clasificacion, y decide como se dibuja la lamina (la captura con el boton de
 * seguir solo tiene sentido si lo que se pide es seguir).
 */
function conTipoDeCta(bruto: unknown, input: LinkedinJobInput): unknown {
  const tipo = input.angle.clasificacion?.cta?.tipo
  if (!tipo || !bruto || typeof bruto !== "object" || Array.isArray(bruto)) return bruto
  const r = bruto as Record<string, unknown>
  if (!r.cierre || typeof r.cierre !== "object" || Array.isArray(r.cierre)) return bruto
  return { ...r, cierre: { ...(r.cierre as Record<string, unknown>), tipo } }
}
