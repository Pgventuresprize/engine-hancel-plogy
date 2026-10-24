import type { Exigencia, PiezaDeOficio } from "../agents/armador"
import { llamarClaude, parsearJSONDeClaude, type Sistema, type UsoClaude } from "../claude/messages"
import { bloqueClasificacion, bloqueParaClasificar, resolverClasificacion } from "../marca/clasificacion"
import { SIEMPRE, type Situacion } from "../marca/cuando"
import { identidadEditorial } from "../marca/editorial"
import { ejemplosDe } from "../marca/ejemplos"
import { ctasUsables, TIPOS_CTA, type TipoCta } from "../marca/editorial-modelo"
import { perfilDe } from "../marca/perfil"
import { DESCRIPCION_FIGURA, FORMA_FIGURA, LIMITES_FIGURA, type TipoFigura } from "../marca/figuras"
import type { TipoDelKit } from "../marca/kit-modelo"
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
  type EstadoClaude,
  type Hallazgo,
} from "./revisor"
import { revisarConClaude, type Red } from "./revisor-claude"
import { bloqueCriterioEscritor, conCriterio } from "./criterio"
import { conPocoMaterial, estadoDelMaterial } from "./material"
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
  return `${bloque ? `\n${bloque}\n` : ""}${bloqueCriterioEscritor(input.angle.criterio)}`
}

// ------------------------------------------------------------------ revision

/**
 * Lo que el revisor necesita para esta pieza: las reglas de la marca de hoy y
 * el material que vio el agente, que es contra lo que se comprueban las cifras.
 */
export async function contextoDeRevision(accountId: string, input: LinkedinJobInput): Promise<ContextoRevision> {
  const [perfil, editorial, ejemplos] = await Promise.all([
    perfilDe(accountId),
    identidadEditorial(accountId),
    // Sin ejemplos no hay de donde copiar: si no se pueden leer, se revisa igual.
    ejemplosDe(accountId).catch(() => []),
  ])
  const ctas = ctasUsables(editorial.ctas)
  return {
    reglas: reglasDe(perfil),
    material: materialDe(input.raw_news),
    ejemplos: ejemplos.filter((e) => e.activo).map((e) => ({ nombre: e.nombre, texto: e.texto })),
    textoCtas: ctas.map((c) => `${c.name}. ${c.description ?? ""}`).join("\n"),
  }
}

const sumarUso = (a: UsoClaude, b: UsoClaude): UsoClaude => ({
  entrada: a.entrada + b.entrada,
  salida: a.salida + b.salida,
  deCache: (a.deCache ?? 0) + (b.deCache ?? 0),
})

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

type Revisado<V> = { version: V; hallazgos: Hallazgo[]; arreglos: Arreglo[]; correcciones: Correccion[]; claude?: EstadoClaude }
type Escritor<V> = (
  pedido: Hallazgo[],
  version: V
) => Promise<{ version: V; hallazgos: Hallazgo[]; arreglos: Arreglo[]; uso: UsoClaude; claude?: EstadoClaude } | null>

/**
 * Lo que encuentra el revisor de codigo mas lo que encuentra el de Claude en
 * la misma version. Sin revisor con Claude (apagado), solo lo del codigo.
 */
export async function conRevisorClaude(
  accountId: string,
  red: Red,
  input: LinkedinJobInput,
  revisada: { version: unknown; hallazgos: Hallazgo[] }
): Promise<{ hallazgos: Hallazgo[]; claude?: EstadoClaude; uso: UsoClaude | null }> {
  const r = await revisarConClaude({ accountId, red, version: revisada.version, input })
  if (!r) return { hallazgos: revisada.hallazgos, uso: null }
  return { hallazgos: [...revisada.hallazgos, ...r.hallazgos], claude: r.estado, uso: r.uso }
}

/** Una version que el revisor con Claude no pudo leer no se sabe si mejoro: al corregir, no se queda. */
const sinRevisar = (claude?: EstadoClaude) => claude?.estado === "fallo"

const masUso = (a: UsoClaude, b: UsoClaude | null) => (b ? sumarUso(a, b) : a)

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
    actual = { version: r.version, hallazgos: r.hallazgos, arreglos: r.arreglos, correcciones: r.correcciones, claude: r.claude }
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
}): Promise<Revisado<V> & { uso: UsoClaude | null }> {
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
    claude: final.claude,
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
   - LOGRO: true solo si la noticia es un logro, un reconocimiento o un record del pais o del sector de la marca, algo que se celebra. En cualquier otro caso false, y siempre false en noticias de perdidas, crisis o riesgos.

REGLAS
- Escribe en el idioma indicado en las variables.
- No inventes datos que no esten en el input. Si falta contexto, trabaja con lo que hay.
- NO INVENTES ALCANCE. Nada de "miles de", "cientos de", "la mayoria de", "nadie", "todos" ni "cualquier empresa" si el contenido no lo dice. Lo que el hecho revela se dice del hecho, no de un universo que nadie conto. Si la tesis generaliza mas alla de lo que trae la noticia, es una hipotesis y se dice como hipotesis ("es probable que", "puede que"), nunca como dato.
- La noticia ya paso el filtro de relevancia: siempre produce el mejor angulo posible, no descartes.
- TRABAJAS SOBRE EL HECHO, NO SOBRE SU FIABILIDAD. El contenido que recibes es lo que paso. Nunca es tu tema si el titular es "comprobable", si la fuente es fiable o si el dato esta "confirmado": eso ya lo decidio quien te paso esta noticia. Da el hecho por bueno y cuenta lo que revela. Prohibido cualquier angulo o tesis del tipo "un titular dijo que X pero no se puede comprobar", "la noticia afirma sin pruebas", "habria que verificar": eso no es un angulo, es desconfianza, y aqui el hecho ya esta dado.`

export const ANGULO_CONTRATO = `RESPONDE SOLO con este JSON, sin texto alrededor:
{"angle":"<2-3 frases>","thesis":"<1 frase refutable>","playbook_format":"<uno de los formatos>","pilar":"<codigo P o null>","pilar_secundario":"<codigo P o null>","audiencia":"<codigo A o null>","vertical":"<codigo V o null>","objetivo":"<alcance|comunidad|autoridad|conversion>","cta":"<codigo C o null>","logro":<true|false>}`

/** `system` es el prompt ya armado: oficio, marca y contrato (ver agents/prompts.ts). */
export async function generarAngulo(
  accountId: string,
  input: AngleJobInput,
  model: string,
  system: Sistema
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

  const r = await llamarClaude({ paso: "angulo", accountId, model, system, prompt, maxTokens: 1000 })
  if (!r.ok) throw new Error(r.error)
  let bruto = parsearJSONDeClaude(r.texto)
  let uso = r.uso

  // El alcance sin respaldo ("miles de integraciones", "nadie lo sabe") no se
  // queda en el angulo: el escritor lo hereda como dato. La instruccion del
  // oficio sola no bastaba, asi que si aparece, vuelve una vez con el pedido.
  const material = materialDe(n)
  const alcance = alcanceDelAngulo(bruto, material)
  if (alcance.length > 0) {
    const otra = await llamarClaude({ paso: "angulo", accountId, model, system, prompt: promptDeCorreccion(prompt, bruto, alcance), maxTokens: 1000 })
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
  system: Sistema,
  prompt: string,
  ctx: ContextoRevision,
  longitud: string
): Promise<{ version: PostEscrito; hallazgos: Hallazgo[]; arreglos: Arreglo[]; uso: UsoClaude }> {
  const r = await llamarClaude({ paso: "linkedin", accountId, model, system, prompt, maxTokens: 1800 })
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
  system: Sistema
): Promise<{ respuesta: unknown; uso: UsoClaude }> {
  const decidido = await conCriterio(accountId, input)
  input = decidido.input
  const prompt = promptLinkedin(input)
  const ctx = await contextoDeRevision(accountId, input)
  const escrita = await escribirLinkedin(accountId, model, system, prompt, ctx, input.variables.longitud)
  const rc = await conRevisorClaude(accountId, "linkedin", input, escrita)
  const primera = { ...escrita, hallazgos: rc.hallazgos, claude: rc.claude, uso: masUso(masUso(escrita.uso, rc.uso), decidido.uso) }
  if (primera.hallazgos.length === 0) {
    return {
      respuesta: respuestaLinkedin(primera.version, armarRevision(primera.hallazgos, primera.arreglos, [], primera.claude)),
      uso: primera.uso,
    }
  }
  const final = await corregirPost(accountId, input, model, system, { ...primera, correcciones: [] }, "automatica", ctx)
  return { respuesta: final.respuesta, uso: masUso(primera.uso, final.uso) }
}

/** Una vuelta de correccion sobre un post ya escrito. La usa tambien el boton de la ficha. */
export async function corregirPost(
  accountId: string,
  input: LinkedinJobInput,
  model: string,
  system: Sistema,
  anterior: Revisado<PostEscrito>,
  origen: Correccion["origen"],
  ctx?: ContextoRevision
): Promise<{ respuesta: ReturnType<typeof respuestaLinkedin>; uso: UsoClaude | null }> {
  const contexto = ctx ?? (await contextoDeRevision(accountId, input))
  const prompt = promptLinkedin(input)
  const r = await corregirEnVueltas(anterior, origen, async (pedido, version) => {
    const nueva = await escribirLinkedin(
      accountId,
      model,
      system,
      promptDeCorreccion(prompt, { parrafos: version.post.split("\n\n") }, pedido),
      contexto,
      input.variables.longitud
    )
    const rc = await conRevisorClaude(accountId, "linkedin", input, nueva)
    if (sinRevisar(rc.claude)) return null
    return { ...nueva, hallazgos: rc.hallazgos, claude: rc.claude, uso: masUso(nueva.uso, rc.uso) }
  })
  return {
    respuesta: respuestaLinkedin(r.version, armarRevision(r.hallazgos, r.arreglos, r.correcciones, r.claude)),
    uso: r.uso,
  }
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

/**
 * Las piezas del oficio de Instagram que no van siempre: entran solo con la
 * pieza que las necesita (ver agents/armador.ts). El nucleo de arriba es lo
 * unico que se edita en la ficha del agente; estas viven aqui y llegan solas.
 *
 * Hay un cierre por cada tipo de CTA: la prueba de cobertura falla si se
 * añade un tipo y nadie le escribe el suyo.
 */
export const PIEZAS_INSTAGRAM: PiezaDeOficio[] = [
  {
    id: "logro",
    nombre: "Logros del país o del sector de la marca",
    cuando: { ...SIEMPRE, senales: ["logro"] },
    texto: `El ángulo marcó esta noticia como un logro, un reconocimiento o un récord del país de la marca o de su sector. El hook ABRE con una palabra de celebración y luego el hecho con su cifra: "¡Histórico! [el país o la empresa] entró al top 20 mundial de...". Si al leer el contenido ves que no es un logro real, no celebres: en una noticia de pérdidas o de crisis es de mal gusto y resta credibilidad.`,
  },
  {
    id: "poco_material",
    nombre: "La noticia trae poco material",
    cuando: { ...SIEMPRE, senales: ["poco_material"] },
    texto: `El contenido de esta noticia es corto. Haz el carrusel con el mínimo de láminas que pide el formato de respuesta y apoya cada una en una frase del contenido. No completes con contexto general, cifras ni consecuencias que el contenido no diga: si algo importante todavía no se sabe, dilo así ("todavía no se sabe cuánto costará"). Un carrusel corto y cierto vale más que uno largo y rellenado.`,
  },
  {
    id: "cierre:seguir",
    nombre: "El cierre pide seguir la cuenta",
    cuando: { ...SIEMPRE, cta_tipos: ["seguir"] },
    texto: `El título dice la acción con el nombre o la cuenta de la marca ("Sigue a @cuenta"). El cuerpo da una razón concreta y ligada al tema de este carrusel: qué va a encontrar quien sigue la cuenta la próxima vez que pase algo así. Nada de "para más contenido" ni "no te pierdas nada". El caption termina con la misma invitación a seguir.`,
  },
  {
    id: "cierre:comentar",
    nombre: "El cierre pide un comentario",
    cuando: { ...SIEMPRE, cta_tipos: ["comentar"] },
    texto: `El cierre hace una pregunta que se responde en una línea, desde la experiencia de quien lee ("¿Ya mediste cuánto te cuesta cada tarea?"). Sale de la tesis de este carrusel, no de una plantilla. Prohibido "¿qué opinas?", "déjanos tu opinión" o cualquier pregunta que serviría igual para otra pieza. El caption termina con la misma pregunta.`,
  },
  {
    id: "cierre:palabra",
    nombre: "El cierre pide comentar una palabra",
    cuando: { ...SIEMPRE, cta_tipos: ["palabra"] },
    texto: `El cierre pide comentar una sola palabra, en mayúsculas, a cambio de algo que la marca envía. La palabra y lo que se recibe salen del CTA de la clasificación: no inventes otra palabra ni otro recurso. El título lleva la palabra ("Comenta PROCESO"); el cuerpo dice qué recibe quien la comenta y cómo le llega, sin prometer plazos ni nada que el CTA no diga. El caption repite la misma palabra en mayúsculas y la misma promesa.`,
  },
  {
    id: "cierre:dm",
    nombre: "El cierre pide escribir por mensaje directo",
    cuando: { ...SIEMPRE, cta_tipos: ["dm"] },
    texto: `El cierre pide escribirle a la marca por mensaje directo. Di qué escribir o sobre qué, y qué obtiene quien escribe, conectado con el problema de este carrusel. Una sola acción, sin urgencia inventada. El caption termina pidiendo lo mismo.`,
  },
  {
    id: "cierre:comercial",
    nombre: "El cierre es comercial",
    cuando: { ...SIEMPRE, cta_tipos: ["comercial"] },
    texto: `El cierre presenta lo que la marca ofrece para el problema que contó el carrusel, tal como lo describe el CTA. Las láminas de antes no venden: el carrusel informa y el cierre es el único sitio donde aparece la oferta. Una sola acción concreta (escribir, agendar, visitar), sin descuentos, plazos ni garantías que el CTA no traiga. El caption termina pidiendo la misma acción.`,
  },
]

/** Con CTA elegido, el carrusel no se escribe sin el cierre de su tipo. */
export const exigirInstagram: Exigencia = (entraron, s) =>
  s?.cta_tipo && !entraron.some((p) => p.id === `cierre:${s.cta_tipo}`)
    ? `falta el cierre para el CTA de tipo «${s.cta_tipo}»`
    : null

/**
 * Lo que se sabe de la pieza antes de escribirla, para elegir que entra en su
 * prompt. Un trabajo de antes de la clasificacion no trae nada y recibe solo
 * lo que va siempre.
 */
export function situacionDe(input: LinkedinJobInput): Situacion {
  const c = input.angle.clasificacion
  const tipo = c?.cta?.tipo
  return {
    pilar: c?.pilar?.id ?? null,
    objetivo: c?.objetivo ?? null,
    cta_tipo: tipo && (TIPOS_CTA as readonly string[]).includes(tipo) ? (tipo as TipoCta) : null,
    formato: input.angle.playbook_format ?? null,
    logro: c?.logro === true,
    poco_material: conPocoMaterial(estadoDelMaterial(input.raw_news.full_content ?? input.raw_news.snippet)),
  }
}

const rango = (min: number, max: number) => (min === max ? `${min}` : `${min} a ${max}`)

/**
 * Con el plan de cada lamina, el guion pide mas salida: en la prueba fueron
 * 1.650 tokens. Las figuras del kit suman sus datos.
 */
const MAX_TOKENS_INSTAGRAM = 8000

/**
 * El formato del carrusel con los numeros de la marca: cuantas laminas, cuantos
 * hashtags y si van emojis. Son los mismos con los que el revisor comprueba la
 * pieza, asi que lo que se pide y lo que se mide no se pueden desfasar.
 */
export function contratoInstagram(
  perfil: Pick<PerfilMarca, "laminas_min" | "laminas_max" | "hashtags_min" | "hashtags_max" | "emojis_instagram">,
  /** La plantilla dibuja listas numeradas: se ofrecen las laminas de pasos. */
  listas = false,
  /** Los tipos de lamina del kit de diseño activo de la marca, si tiene. */
  kit: TipoDelKit[] = [],
  /** Las figuras que sabe dibujar ese kit (barras, tabla, niveles...). */
  figuras: TipoFigura[] = []
): string {
  const conFiguras = kit.length > 0 && figuras.length > 0 && kit.some((t) => t.figura)
  const base = contratoInstagramBase(perfil, listas || kit.some((t) => t.items), kit.length > 0, conFiguras)
  if (!kit.length) return base
  return [base, bloqueKit(kit), conFiguras ? bloqueFiguras(figuras) : ""].filter(Boolean).join("\n\n")
}

/**
 * Las figuras del kit: que puede construir dentro de una lamina y con que
 * datos. La regla de las cifras es la misma que la del resto del guion: nada
 * que no salga del contenido, y lo ilustrativo dice que lo es.
 */
function bloqueFiguras(figuras: TipoFigura[]): string {
  const lineas = figuras
    .map((f) => {
      const l = LIMITES_FIGURA[f]
      return `- ${f}: ${DESCRIPCION_FIGURA[f]} De ${l.min} a ${l.max} elementos, cada texto hasta ${l.texto} caracteres${l.nota ? ` (nota hasta ${l.nota})` : ""}.\n  ${FORMA_FIGURA[f]}`
    })
    .join("\n")
  return `FIGURAS
Las láminas de este kit muestran lo que dicen con una figura construida con datos: unas barras, una tabla, una escalera de niveles, una encuesta, una caja de comentario. Una lámina de un tipo que "admite figura" puede llevar "figura" con una de estas:
${lineas}
- Pon figura en cada lámina cuyo contenido ya tiene esa forma: cifras que se comparan, pasos en orden, opciones, un antes y un después, herramientas que se nombran, frases que dijo alguien, un comando o un comentario. En un carrusel de este kit lo normal es que la mayoría de las láminas del medio lleven una; la portada y el cierre no.
- La figura enseña lo que afirma la lámina, no otra cosa. Con figura, el título dice la idea y el cuerpo va en una frase corta: el detalle va en la figura.
- Una figura no resume quitando reservas. Cada elemento conserva su atribución y su condición ("según Reuters", "cerca de", "en un caso", "sin confirmar"): si una celda o un paso no se puede decir corto sin perder la reserva, esa parte no va en la figura, va en el texto. Un flujo que muestra lo que pasó en un caso lo dice en su título o en el pie. Una cifra lleva al lado qué mide y contra qué se compara.
- Respeta los límites de cada figura: tiene el sitio justo para ellos. Si no cabe, menos elementos, no más largos.
- En un checklist, "no" se dibuja como lo que no está o no vale (en muchos kits, tachado): escribe cada punto en positivo ("Booleanos robustos", con "no") y nunca en negativo ("Nadie tiene booleanos"), que tachado se lee al revés.
- Cada cifra de una figura sale del contenido o del texto de las láminas, tal cual. Nunca inventes una cifra, un porcentaje ni un resultado para tener figura: hay figuras sin números (niveles, flujo, pastillas, checklist, citas, interfaz).
- Si la figura es un ejemplo para explicar (una cuenta ilustrativa, un caso inventado), lleva "hipotetico": true y la lámina lo dice. Una encuesta sin datos no lleva porcentajes.
- En una cita, el texto es literal de la fuente; si está traducido, el pie lo dice.
- En la lámina de criterio la figura puede ordenar los pasos (niveles, checklist, flujo), pero cada punto conserva lo concreto.`
}

/**
 * Lo que el redactor sabe del kit: que tipos de lamina hay y cuanto texto cabe
 * en cada uno. El tipo decide como se dibuja la lamina, no lo que dice: la
 * funcion de cada lamina (y el criterio) siguen mandando.
 */
function bloqueKit(kit: TipoDelKit[]): string {
  const medida = (t: TipoDelKit) =>
    [
      t.titulo ? `título hasta ${t.titulo} caracteres` : "",
      t.cuerpo ? `cuerpo hasta ${t.cuerpo}` : "",
      t.items ? `de ${t.items.min} a ${t.items.max} puntos en "items", cada uno hasta ${t.items.largo}` : "",
    ]
      .filter(Boolean)
      .join("; ")
  const lineas = kit
    .map((t) => {
      const nombre = t.tipo === "cierre" ? `cierre${t.cta.length ? ` (CTA ${t.cta.join(", ")})` : ""}` : t.tipo
      return `- ${nombre}${t.figura ? " (admite figura)" : ""}: ${t.cuando}${medida(t) ? ` Cabe: ${medida(t)}.` : ""}`
    })
    .join("\n")
  return `EL KIT DE DISEÑO DE LA MARCA
Cada lámina se dibuja con una plantilla del kit de la marca. En cada elemento de slides pon "tipo_lamina" con el tipo que mejor enseña lo que dice esa lámina (la 1 es siempre "portada"), y escribe dentro de sus medidas:
${lineas}
- El tipo sale de lo que la lámina ya es: un dato con su cifra, unos pasos, dos lados que se comparan, lo que dijo alguien, la postura de la marca. Primero decides la función y lo que afirma la lámina; después el tipo que mejor lo enseña. Nunca cambies lo que dice para que encaje en un tipo.
- En un "dato", la cifra va escrita tal cual en el título o al principio del cuerpo. Un "dato" es para una lámina que ya gira en torno a una cifra del material: nunca busques una cifra, ni cambies la idea de una lámina por otra que traiga número, para tener un "dato". Un carrusel sin láminas de dato está bien.
- No hace falta usar todos los tipos: usa los que pida el contenido, aunque se repita "idea".
- La lámina de criterio no se adelgaza para caber: cada punto conserva lo concreto (qué revisar, dónde, quién decide), que es lo que lo hace de la marca. Si no cabe en los puntos, usa menos puntos y no menos detalle.
- Las medidas son de la plantilla: un texto que se pasa no cabe y la lámina sale en la plantilla simple. Cuéntalas como cuentas los 65 caracteres del título; si no cabe, dilo más corto sin perder el dato ni el matiz.
- El cierre va en "cierre" y se dibuja con la plantilla de su CTA: su título y su cuerpo también tienen las medidas de arriba.`
}

function contratoInstagramBase(
  perfil: Pick<PerfilMarca, "laminas_min" | "laminas_max" | "hashtags_min" | "hashtags_max" | "emojis_instagram">,
  listas: boolean,
  conKit: boolean,
  conFiguras = false
): string {
  const laminas = rango(perfil.laminas_min, perfil.laminas_max)
  const sinHashtags = perfil.hashtags_max === 0
  const hashtags = sinHashtags ? "" : `"<${rango(perfil.hashtags_min, perfil.hashtags_max)} en minúscula sin espacios>"`
  return `RESPONDE SOLO con este JSON, sin texto alrededor:
{"slide_count":<${laminas}>,"caption":"<2 a 4 frases con la tesis y el cta, oraciones completas>","hashtags":[${hashtags}],"fotos":["<5 a 8 búsquedas en inglés>"],"elemento":"<una búsqueda en español de la cosa concreta>","antetitulo":"<2 a 4 palabras en español que sitúan la pieza>","slides":[{"n":1,"type":"photo_hook",${conKit ? '"tipo_lamina":"portada",' : ""}"funcion":"<función narrativa>","aporta":"<qué hace necesaria la siguiente>","fuente":"<de qué parte del contenido sale, o criterio de la marca>","hook":"<máx 95 caracteres>"},{"n":2,"type":"text",${conKit ? '"tipo_lamina":"<tipo del kit>",' : ""}"funcion":"<...>","aporta":"<...>","fuente":"<...>","title":"<máx 65 caracteres>","body":"<máx 2 frases>"${conFiguras ? ',"figura":<una figura de las de abajo, u omítela>' : ""}}],"cierre":{"title":"<máx 40 caracteres: la acción del CTA>","body":"<máx 140 caracteres: la razón para hacerlo>"}}

El array slides va en orden y tiene ${perfil.laminas_min === perfil.laminas_max ? "exactamente" : "de"} ${laminas} elementos, tantos como sostenga el contenido: el primero photo_hook, los demás text.
PLANEA CADA LÁMINA ANTES DE ESCRIBIRLA. Cada elemento de slides lleva primero tres campos: "funcion" (tensión, hecho, mecanismo, criterio, síntesis...), "aporta" (qué deja abierto o qué hace necesaria la siguiente) y "fuente" (de qué parte del contenido sale lo que afirma, o "criterio de la marca" si es opinión de la marca). Escríbelos primero y después el texto, de modo que el texto cumpla esa función y no afirme nada que su fuente no diga. Estos tres campos no se publican.
${sinHashtags ? "La marca no usa hashtags: \"hashtags\" va vacío." : `Hashtags: ${rango(perfil.hashtags_min, perfil.hashtags_max)}, específicos y buscables.`}
${perfil.emojis_instagram ? "Emojis: solo si ayudan a leer, nunca de adorno." : "Emojis: ninguno, en ningún campo."}
${listas ? `Una lámina "text" puede ir como lista: en lugar de "body" lleva "items", de 3 a 5 pasos o puntos (cada uno una oración de hasta 90 caracteres), y si hace falta "lead", una etiqueta corta encima del título (hasta 30 caracteres). Se dibuja como lista numerada. Úsala solo cuando el contenido de esa lámina es de verdad una serie de pasos o de puntos, nunca para partir un párrafo.
` : ""}"antetitulo" va encima del titular de la portada y dice de qué va la pieza antes de leerla: el tema y, si ayuda, el formato o el protagonista, como "IA + seguridad", "Noticia · Anthropic" o "Guía · Automatización". En español, sin fecha y sin repetir el titular.
El caption termina pidiendo la misma acción que el cierre, con sus mismas palabras clave.
El cierre no va en slides: va en "cierre" y siempre lo escribes tú, para esta pieza: nunca va vacío ni es null. Pide el CTA de la clasificación o, si no viene, el CTA de la marca que mejor encaje con la pieza. Si la marca no tiene ningún CTA, invita a seguir su cuenta: el título con el nombre o la cuenta de la marca y el cuerpo con una razón ligada a lo que enseñó este carrusel, nunca "para más contenido" ni "no te pierdas nada".`
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
  system: Sistema
): Promise<{ respuesta: unknown; uso: UsoClaude }> {
  const decidido = await conCriterio(accountId, input)
  input = decidido.input
  const prompt = promptInstagram(input)
  const r = await llamarClaude({ paso: "instagram", accountId, model, system, prompt, maxTokens: MAX_TOKENS_INSTAGRAM })
  if (!r.ok) throw new Error(r.error)

  const ctx = await contextoDeRevision(accountId, input)
  const escrita = guionRevisado(parsearJSONDeClaude(r.texto), input, ctx)
  const rc = await conRevisorClaude(accountId, "instagram", input, escrita)
  const primera = { ...escrita, hallazgos: rc.hallazgos, claude: rc.claude }
  const uso = masUso(masUso(r.uso, rc.uso), decidido.uso)
  if (primera.hallazgos.length === 0) {
    return { respuesta: conRevision(primera.version, armarRevision(primera.hallazgos, primera.arreglos, [], primera.claude)), uso }
  }
  const final = await corregirCarrusel(accountId, input, model, system, { ...primera, correcciones: [] }, "automatica", ctx)
  return { respuesta: final.respuesta, uso: masUso(uso, final.uso) }
}

/** Una vuelta de correccion sobre un guion ya escrito. La usa tambien el boton de la ficha. */
export async function corregirCarrusel(
  accountId: string,
  input: LinkedinJobInput,
  model: string,
  system: Sistema,
  anterior: Revisado<unknown>,
  origen: Correccion["origen"],
  ctx?: ContextoRevision
): Promise<{ respuesta: unknown; uso: UsoClaude | null }> {
  const contexto = ctx ?? (await contextoDeRevision(accountId, input))
  const prompt = promptInstagram(input)
  const r = await corregirEnVueltas(anterior, origen, async (pedido, version) => {
    const respuesta = await llamarClaude({ paso: "instagram-correccion",
      accountId,
      model,
      system,
      prompt: promptDeCorreccion(prompt, guionParaCorregir(version), pedido),
      maxTokens: MAX_TOKENS_INSTAGRAM,
    })
    if (!respuesta.ok) throw new Error(respuesta.error)
    const nueva = guionRevisado(parsearJSONDeClaude(respuesta.texto), input, contexto)
    if (!dibujable(nueva.version)) return null
    const rc = await conRevisorClaude(accountId, "instagram", input, nueva)
    if (sinRevisar(rc.claude)) return null
    return { ...nueva, hallazgos: rc.hallazgos, claude: rc.claude, uso: masUso(respuesta.uso, rc.uso) }
  })
  return { respuesta: conRevision(r.version, armarRevision(r.hallazgos, r.arreglos, r.correcciones, r.claude)), uso: r.uso }
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
