import { llamarClaude, parsearJSONDeClaude, type Sistema } from "../claude/messages"
import { supabaseAdmin } from "../supabase-admin"
import { getSettings } from "../schedule"
import { guardarBusqueda, guardarFuenteNoticia, leerPaginaConMotivo } from "../redaccion/fuentes"
import { DIAS_DE_FRESCURA, diasDeAntiguedad, esVieja } from "./frescura"
import { investigarEnLaWeb, type Busqueda } from "./composio"
import { cifrasPerdidas } from "./revisor"
import { estadoDelMaterial, nombreMaterial } from "./material"

/**
 * El analisis: puntua la noticia con el material que le traen.
 *
 * El research ya NO lo hace el modelo. Antes se le daba la herramienta de
 * busqueda web y cada noticia arrastraba decenas de miles de tokens de
 * resultados al contexto; ahora es Composio quien sale a la web, y el agente
 * solo recibe ese texto ya masticado, lo consolida y lo califica. Mismo
 * criterio, una fraccion del gasto.
 *
 * El modelo no toca Supabase ni internet: solo transforma el texto que se le da.
 *
 * El fit de nicho se juzga contra el nicho propio de cada noticia —que viaja en
 * el prompt— y contra lo que la marca dice que cubre, no contra un dominio
 * fijo: cada cuenta se puntua con su vara.
 */

export const ANALISIS_OFICIO = `Eres un analista editorial. Te dan una noticia, el texto de su propia pagina, el material que otro sistema ya recolecto de la web sobre ese hecho y el texto de las paginas que esa busqueda cito. Tu trabajo es consolidar y calificar. NO investigas ni buscas: trabajas solo con lo que se te entrega.

PASO 1: CONSOLIDAR
Con el titular, el snippet, el articulo, el material recolectado y las fuentes citadas, escribe un texto limpio y estructurado con la informacion factual del hecho: solo hechos con su contexto, sin opiniones ni relleno, sin referencias tipo [1]. Conserva todas las cifras, nombres, fechas y declaraciones que traiga el material sobre ESTE hecho: este texto es lo unico con lo que escribiran los demas agentes, y lo que no pongas aqui no lo van a tener. No resumas: consolidar es juntar los hechos sin repetirlos, no quedarse con los principales. Di de que fuente sale cada dato que no venga del articulo ('segun Basis', 'segun eMarketer'). De las fuentes citadas, deja fuera lo que no trate de este hecho (otras noticias de la empresa, premios, lanzamientos anteriores). Maximo 10000 caracteres. Si el material es pobre, consolida lo que haya y no inventes nada.

PASO 2: CALIFICAR (1-10, promedio ponderado)
1. MATERIALIDAD (30%): el hecho cambia algo concreto (capacidad, posicion competitiva, regulacion, capital, personas). Alto si altera a 2+ actores.
2. NOVEDAD/TIMING (20%): es reciente o es la primera vez que se hace publico. Tema saturado puntua bajo.
3. POTENCIAL DE ANGULO (20%): hay un angulo que los medios generalistas ignoran, una tesis no obvia.
4. CONECTIVIDAD (15%): se conecta con otros hechos formando patron, convergencia o contradiccion.
5. FIT DE NICHO (15%): es genuinamente sobre el nicho que se indica y toca algo de lo que habla la marca (sus pilares, sus verticales o lo que le importa a su audiencia; ver el bloque de la marca). Fuera de nicho puntua 1-2.

VETO: TEMAS QUE ESTA CUENTA NO CUBRE NUNCA
Antes de calificar, decide si la noticia esta vetada. Si lo esta, devuelve "vetada": true y el motivo, y lo demas da igual.

ENTRA EN EL VETO:
- Los temas que la marca dice que no toca, si los indica en su bloque.
- Corrupcion, desvio de recursos publicos, contratos irregulares, favorecimiento, trafico de influencias.
- Escandalos, senalamientos o polemicas sobre figuras publicas, politicos, funcionarios o dirigentes.
- Investigaciones, imputaciones, procesos judiciales, capturas, condenas, sanciones a personas.
- Peleas politicas, acusaciones cruzadas entre funcionarios, gremios, empresas o partidos.

NO ENTRA EN EL VETO, son noticias normales del sector:
- Una politica publica, una ley, un decreto, un arancel, un subsidio o una linea de credito, contados por lo que cambian para el sector de la marca y para quien la lee.
- Cifras oficiales, informes, precios, resultados, lanzamientos.
- Una critica tecnica a una medida, sin senalar a una persona.

LA PRUEBA: si el sujeto de la noticia es una persona senalada, esta vetada. Si el sujeto es un hecho del sector, no lo esta. "El banco amplio su linea de credito para pequenas empresas" no esta vetada; "El banco dio un credito de pequena empresa al gerente de un gremio" si lo esta.

NOTICIA VIEJA: SCORE 1, SIEMPRE
Se te da la fecha de hoy y la fecha que reporta el buscador. Decide la fecha del hecho: cuando paso lo que cuenta ESTA noticia, con el titulo, el snippet y el material. Es vieja si:
- el hecho ocurrio hace mas de 5 dias, o la noticia es de un año anterior;
- o el material muestra que lo anunciado ya paso (un paro convocado para una fecha que ya paso, un evento ya celebrado, un plazo ya vencido).
Una noticia vieja lleva "vieja": true y relevance_score = 1, sin importar lo demas. Cuidado: el material de la web puede traer cobertura reciente de un tema viejo. Lo que cuenta es la fecha del hecho de esta noticia, no si el tema sigue vivo. Si no hay ninguna forma de saber la fecha, no la marques vieja por eso.

POLITICA: SCORE 1, SIEMPRE
Esta cuenta no cubre politica. Si el eje de la noticia es politico, lleva "politica": true y relevance_score = 1, sin importar lo demas:
- elecciones, campañas, candidatos, encuestas, partidos, coaliciones;
- el Congreso como pugna: quorum, votaciones, choques entre bancadas, debates de control;
- paros, marchas y movilizaciones convocadas para presionar decisiones politicas;
- declaraciones, alocuciones o peleas de politicos y funcionarios cuando lo noticioso es lo que dicen, no una medida concreta;
- gobierno contra oposicion, cortes contra gobierno, acusaciones al gobierno anterior.
NO es politica (se califica normal): una medida concreta ya adoptada o con fecha y monto (ley, decreto, resolucion, arancel, subsidio, linea de credito, precio, programa), contada por lo que cambia para el sector de la marca; cifras oficiales; informes de gremios o de empresas.
LA PRUEBA: si lo noticioso es una decision que ya cambia algo para el sector, es sector. Si lo noticioso es la disputa, la presion o el posicionamiento, es politica.

FILTRO DURO: si NO es un hecho verificable (opinion, prediccion sin gatillo, listicle generico), relevance_score = 1-2 sin importar lo demas.`

export const ANALISIS_CONTRATO = `RESPONDE SOLO con este JSON, sin texto alrededor, sin saltos de linea y sin comillas dobles dentro de ninguna cadena (usa comillas simples y separa ideas con espacios dentro de full_content):
{"vetada":<true|false>,"motivo_veto":"<una frase, solo si vetada es true>","fecha_hecho":"<YYYY-MM-DD o null si no se puede saber>","vieja":<true|false>,"vieja_por":"<fecha si es vieja por la fecha del hecho, ya_paso si lo anunciado ya paso, o null si no es vieja>","score_si_fresca":<entero 1-10: la nota que le darias si no fuera vieja; igual a relevance_score si no lo es>,"politica":<true|false>,"full_content":"<el texto consolidado, en un solo bloque sin saltos de linea>","relevance_score":<entero 1-10>,"keywords_matched":["<4 a 6 keywords en minuscula>"],"analysis_notes":"<2-3 frases: primero el score global y por que; luego el angulo editorial mas prometedor si lo hay>"}`

type ResultadoAnalisis = {
  /**
   * La noticia es de un tema que esta cuenta no cubre.
   *
   * No es una nota baja: una nota baja se puede empujar a mano desde el tablero
   * y esto no debe poder publicarse por ninguna via. Se marca aparte y no llega
   * nunca a la etapa de angulo.
   */
  vetada: boolean
  motivoVeto: string
  /** Cuando paso el hecho, segun el agente. */
  fechaHecho: string | null
  vieja: boolean
  /** Por que la marco vieja: la fecha la vuelve a contar el codigo; "ya_paso" no. */
  viejaPor: "fecha" | "ya_paso" | null
  /** La nota sin el castigo por vieja, para cuando el codigo la desmarca. */
  scoreSiFresca: number | null
  politica: boolean
  full_content: string | null
  relevance_score: number
  keywords_matched: string[]
  analysis_notes: string
}

/**
 * Lo mas largo que se guarda del texto consolidado: lo mismo que el escritor
 * lee de una noticia (MAX_CONTENIDO en jobs.ts). Al analisis se le piden 10.000
 * para que quede margen.
 */
const MAX_CONSOLIDADO = 12_000

/** Corta en el ultimo final de frase que cabe: un dato a medias es peor que ninguno. */
function hastaFrase(texto: string, tope: number): string {
  if (texto.length <= tope) return texto
  const cortado = texto.slice(0, tope)
  const fin = Math.max(cortado.lastIndexOf(". "), cortado.lastIndexOf(".\n"))
  return fin > tope * 0.8 ? cortado.slice(0, fin + 1) : cortado
}

function normaliza(bruto: unknown): ResultadoAnalisis {
  const o = (bruto ?? {}) as Record<string, unknown>
  const score = Number(o.relevance_score)
  const siFresca = Number(o.score_si_fresca)
  return {
    vetada: o.vetada === true,
    motivoVeto: typeof o.motivo_veto === "string" ? o.motivo_veto.trim().slice(0, 300) : "",
    fechaHecho: typeof o.fecha_hecho === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.fecha_hecho) ? o.fecha_hecho : null,
    vieja: o.vieja === true,
    viejaPor: o.vieja_por === "fecha" || o.vieja_por === "ya_paso" ? o.vieja_por : null,
    scoreSiFresca: Number.isFinite(siFresca) ? Math.min(10, Math.max(1, Math.round(siFresca))) : null,
    politica: o.politica === true,
    full_content:
      typeof o.full_content === "string" && o.full_content.trim()
        ? hastaFrase(o.full_content.trim(), MAX_CONSOLIDADO)
        : null,
    relevance_score: Number.isFinite(score) ? Math.min(10, Math.max(1, Math.round(score))) : 1,
    keywords_matched: Array.isArray(o.keywords_matched)
      ? o.keywords_matched.filter((k): k is string => typeof k === "string").slice(0, 8)
      : [],
    analysis_notes: typeof o.analysis_notes === "string" ? o.analysis_notes.trim() : "",
  }
}

export type Pendiente = {
  id: string
  title: string
  link: string
  snippet: string | null
  source: string | null
  niche: string
  tema: string
  date_serper: string | null
  created_at: string
  image_url: string | null
}

/**
 * Topes de material por noticia: mas que esto es pagar contexto de mas.
 *
 * El articulo entra entero (el lector ya lo deja en 9.000): es el hecho mismo.
 * Repartir a medias con la busqueda le cortaba el final, y con el se iban
 * datos que la busqueda no traia. La busqueda es contexto y se queda con su
 * parte, o con todo el espacio si no hay articulo.
 */
const MAX_ARTICULO = 9_000
const MAX_WEB = 6_000
const MAX_WEB_SIN_ARTICULO = 12_000

/**
 * Las fuentes citadas que se leen por noticia, y cuanto de cada una. La
 * busqueda devuelve un resumen corto (en la prueba de la noticia de Basis,
 * 596 caracteres) y las citas; el texto de verdad esta en las paginas citadas.
 */
const MAX_CITADAS = 3
const MAX_POR_CITADA = 4_000

type Citada = { url: string; medio: string; texto: string }

const palabrasClave = (t: string) =>
  new Set(
    t
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4)
  )

/**
 * Lee las paginas que cito la busqueda, primero las que mas se parecen al
 * titular: el comunicado original suele estar entre ellas, y es la fuente mas
 * completa del hecho. Se piden algunas de mas porque hay medios que bloquean.
 */
async function leerCitadas(busqueda: Busqueda, noticia: { title: string; link: string }): Promise<Citada[]> {
  if (!busqueda.ok) return []
  const titular = palabrasClave(noticia.title)
  const parecido = (titulo: string | null) => [...palabrasClave(titulo ?? "")].filter((w) => titular.has(w)).length
  const candidatas = busqueda.citas
    .filter((c) => c.url !== noticia.link)
    .map((c, i) => ({ c, puntos: parecido(c.titulo), i }))
    .sort((a, b) => b.puntos - a.puntos || a.i - b.i)
    .slice(0, MAX_CITADAS + 4)
  const leidas = await Promise.all(candidatas.map(({ c }) => leerPaginaConMotivo(c.url).then((r) => ({ c, r }))))

  // Un comunicado de prensa sale copiado en varios medios: en la prueba, las
  // tres primeras eran el mismo texto. Una copia no suma nada, asi que se salta
  // la que repite la mayor parte de lo ya elegido y entra otra fuente.
  const elegidas: Citada[] = []
  const vistos = new Set<string>()
  for (const { c, r } of leidas) {
    const texto = r.pagina?.texto ?? ""
    if (texto.length < 500) continue
    const suyos = gramasDe(texto)
    const repetidos = [...suyos].filter((g) => vistos.has(g)).length
    if (suyos.size > 0 && repetidos / suyos.size > 0.4) continue
    suyos.forEach((g) => vistos.add(g))
    elegidas.push({
      url: c.url,
      medio: r.pagina?.medio || new URL(c.url).hostname.replace(/^www\./, ""),
      texto: texto.slice(0, MAX_POR_CITADA),
    })
    if (elegidas.length === MAX_CITADAS) break
  }
  return elegidas
}

/** Grupos de ocho palabras seguidas: lo bastante largos para que coincidir sea copiar. */
function gramasDe(texto: string): Set<string> {
  const palabras = texto.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const salida = new Set<string>()
  for (let i = 0; i + 8 <= palabras.length; i++) salida.add(palabras.slice(i, i + 8).join(" "))
  return salida
}

/** El material, en el orden en que lo lee el agente: primero el propio articulo. */
function bloqueMaterial(articulo: string | null, web: string | null, citadas: Citada[]): string {
  const cupoWeb = articulo ? MAX_WEB : MAX_WEB_SIN_ARTICULO
  return `ARTICULO DE LA NOTICIA (el texto de su propia pagina)
${articulo ? articulo.slice(0, MAX_ARTICULO) : "(no se pudo leer la pagina de la noticia)"}

MATERIAL RECOLECTADO DE LA WEB
${web ? web.slice(0, cupoWeb) : "(no se pudo recolectar material de la web)"}

FUENTES CITADAS POR LA BUSQUEDA (el texto de sus paginas)
${citadas.length ? citadas.map((c) => `--- ${c.medio} (${c.url})\n${c.texto}`).join("\n\n") : "(no se pudo leer ninguna)"}${articulo || web || citadas.length ? "" : "\n\nNo hay mas que el titular y el snippet: consolida solo eso."}`
}

/**
 * De donde salio el material, para la ficha. Es lo que dice por que una
 * noticia tiene poco: sin esto, una clave caducada pasaba por "noticia pobre".
 */
function notaDeMaterial(
  articulo: string | null,
  motivoArticulo: string | null,
  busqueda: Busqueda,
  citadas: Citada[],
  consolidado: string | null,
  perdidas: string[]
): string {
  const n = (t: string) => t.length.toLocaleString("es-CO")
  const estado = estadoDelMaterial(consolidado)
  const partes = [
    articulo ? `artículo leído (${n(articulo)} car.)` : `no se pudo leer la página de la noticia${motivoArticulo ? `: ${motivoArticulo}` : ""}`,
    busqueda.ok ? `búsqueda web con ${busqueda.citas.length} fuentes` : `sin búsqueda web: ${busqueda.motivo}`,
    ...(busqueda.ok
      ? [
          citadas.length
            ? `${citadas.length === 1 ? "1 fuente citada leída" : `${citadas.length} fuentes citadas leídas`} (${n(citadas.map((c) => c.texto).join(""))} car.: ${citadas.map((c) => c.medio).join(", ")})`
            : "no se pudo leer ninguna fuente citada",
        ]
      : []),
  ]
  const fuera = perdidas.length ? ` La consolidación dejó fuera estas cifras: ${perdidas.slice(0, 8).join(", ")}.` : ""
  return `${nombreMaterial(estado)} (${consolidado ? n(consolidado) : 0} car.). ${partes.join("; ")}.${fuera}`
}

/**
 * Analiza una noticia y devuelve lo que hay que escribir en `raw_news`, sin
 * escribirlo: el bucle de abajo lo guarda, y una prueba puede mirarlo sin tocar
 * la base. Lee el articulo, busca en la web y lee las fuentes citadas.
 */
export async function analizarUna(
  accountId: string,
  noticia: Pendiente,
  ctx: { model: string; system: Sistema; hoy: string }
): Promise<{ cambios: Record<string, unknown>; busqueda: Busqueda; uso: { entrada: number; salida: number } }> {
  const { model, system, hoy } = ctx
  // Composio sale a la web y, a la vez, se lee la pagina de la propia
  // noticia; el modelo no sale a ningun sitio. El articulo es la red de
  // la busqueda: si Composio cae, el agente tiene al menos lo que la
  // noticia dice. Sin ninguno de los dos se analiza con el snippet: no
  // es un fallo, es una noticia con poco material, y queda marcada.
  const [busqueda, lectura] = await Promise.all([
    investigarEnLaWeb(`${noticia.title} ${noticia.tema}`.trim()),
    leerPaginaConMotivo(noticia.link),
  ])
  const articulo = lectura.pagina?.texto ?? null
  // Las paginas que cito la busqueda: ahi esta el material de verdad,
  // sobre todo cuando el medio de la noticia bloquea la lectura.
  const citadas = await leerCitadas(busqueda, noticia)

  const prompt = `NOTICIA A CONSOLIDAR Y CALIFICAR
- titulo: ${noticia.title}
- fuente: ${noticia.source ?? "desconocida"}
- enlace: ${noticia.link}
- nicho al que pertenece (para el FIT): ${noticia.niche} / ${noticia.tema}
- snippet original: ${noticia.snippet ?? "(sin snippet)"}
- fecha que reporta el buscador: ${noticia.date_serper ?? "(sin fecha)"} (traida el ${new Date(noticia.created_at).toISOString().slice(0, 10)})
- hoy es: ${hoy}

${bloqueMaterial(articulo, busqueda.ok ? busqueda.texto : null, citadas)}`

  const r = await llamarClaude({
    accountId,
    model,
    system,
    prompt,
    // 10.000 caracteres consolidados son unos 3.500 tokens, mas el resto del JSON.
    maxTokens: 8000,
  })
  if (!r.ok) throw new Error(r.error)

  const res = normaliza(parsearJSONDeClaude(r.texto))
  // Lo que el analisis tenia delante y no paso al texto consolidado: el
  // escritor no lo vera. Se mira contra el articulo y la busqueda, que
  // son el hecho; las fuentes citadas traen cifras de otros temas.
  const perdidas = cifrasPerdidas(
    [noticia.title, articulo ?? "", busqueda.ok ? busqueda.texto : ""].join("\n"),
    res.full_content ?? ""
  )
  // Vieja por la fecha del hecho: si el agente la dio, la cuenta la hace el
  // codigo y no el agente. En la prueba del 2026-10-22 descarto una noticia de
  // hace 3 dias "por pasar el corte de 5" y su propia nota lo contaba bien. Lo
  // que el codigo no puede saber (un evento ya celebrado, una fecha sin dar) se
  // le sigue creyendo al agente.
  const diasHecho = res.fechaHecho ? diasDeAntiguedad(res.fechaHecho) : null
  const viejaPorFecha = diasHecho !== null ? diasHecho > DIAS_DE_FRESCURA : res.vieja && res.viejaPor !== "ya_paso"
  const vieja = viejaPorFecha || (res.vieja && res.viejaPor === "ya_paso")
  // Desmarcada por el codigo: la nota del agente venia castigada a 1.
  if (res.vieja && !vieja && res.scoreSiFresca !== null) res.relevance_score = res.scoreSiFresca
  // Vieja o politica: score 1, diga lo que diga el resto del analisis.
  if (vieja || res.politica) res.relevance_score = 1
  const motivo = vieja
    ? `Vieja${res.fechaHecho ? ` (hecho del ${res.fechaHecho})` : ""}: `
    : res.politica
      ? "Politica: "
      : ""
  const cambios = {
    full_content: res.full_content,
    content_fetched_at: new Date().toISOString(),
    // Por el largo de lo consolidado, no por lo que opine el agente:
    // es lo que decide si la noticia puede pasar sola a contenido.
    content_fetch_status: estadoDelMaterial(res.full_content),
    relevance_score: res.relevance_score,
    keywords_matched: res.keywords_matched,
    analysis_notes: res.vetada
      ? `Vetada: ${res.motivoVeto || "tema que esta cuenta no cubre"}`
      : `${motivo}${res.analysis_notes} ${notaDeMaterial(articulo, lectura.motivo, busqueda, citadas, res.full_content, perdidas)}`,
    // Vetada no es "analizada con mala nota": es un tema que no se
    // cubre. Con su propio estado no entra en la seleccion, no se
    // puede arrastrar y queda a la vista para poder revisarlo.
    status: res.vetada ? "vetada" : vieja ? "discarded_date" : "analyzed",
    analyzed_at: new Date().toISOString(),
  }
  return { cambios, busqueda, uso: r.uso }
}

/**
 * Analiza hasta `limite` noticias pendientes de una cuenta.
 *
 * En tandas pequenas y con concurrencia moderada: el tick pasa cada cinco
 * minutos, asi que no hace falta vaciar la cola de una. Una noticia que falla se
 * queda pendiente y se reintenta; la caducidad de 36h saca las que se atasquen.
 *
 * `soloIds` acota la tanda a unas noticias concretas, para cuando alguien pide
 * una en particular desde el tablero en vez de esperar al turno de la cola. El
 * filtro de pendientes sigue en pie: pedir una ya analizada no la reanaliza.
 */
export async function analizarPendientes(
  accountId: string,
  limite = 6,
  soloIds?: string[]
): Promise<{ analizadas: number; fallidas: number; errores: string[]; uso: { entrada: number; salida: number } }> {
  const supabase = supabaseAdmin()

  let consulta = supabase
    .from("raw_news")
    .select("id, title, link, snippet, source, niche, tema, date_serper, image_url, created_at")
    .eq("account_id", accountId)
    .eq("status", "pending_analysis")

  if (soloIds && soloIds.length > 0) consulta = consulta.in("id", soloIds)

  const { data, error } = await consulta.order("created_at", { ascending: true }).limit(limite)

  if (error) throw new Error(`No se pudieron leer las pendientes: ${error.message}`)
  const pendientes = (data ?? []) as Pendiente[]
  if (pendientes.length === 0)
    return { analizadas: 0, fallidas: 0, errores: [], uso: { entrada: 0, salida: 0 } }

  // Como los demas agentes: el modelo de su ficha si lo eligieron, si no el de
  // la cuenta. Dinamico por la misma razon que prompts.ts, abajo.
  const { modeloDe } = await import("../agents/modelos")
  const model = await modeloDe(accountId, "analisis")
  // El prompt armado de la cuenta: su oficio (editado o de fabrica), su marca
  // y el contrato. La importacion es dinamica porque prompts.ts importa de
  // este archivo.
  const { promptDe } = await import("../agents/prompts")
  const system = await promptDe(accountId, "analisis")
  const { timezone } = await getSettings(accountId)
  const hoy = new Date().toLocaleDateString("es-CO", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" })
  let analizadas = 0
  let fallidas = 0
  const errores: string[] = []
  const uso = { entrada: 0, salida: 0 }

  // Tres a la vez: recorta el tiempo de pared sin amontonar peticiones.
  const TANDA = 3
  for (let i = 0; i < pendientes.length; i += TANDA) {
    const grupo = pendientes.slice(i, i + TANDA)
    await Promise.all(
      grupo.map(async (noticia) => {
        try {
          // Una noticia vieja no se analiza: se aparta como en la extraccion.
          // Llega aqui si se trajo antes de que se entendiera su fecha.
          if (esVieja(noticia.date_serper, new Date())) {
            await supabase
              .from("raw_news")
              .update({ status: "discarded_date", analysis_notes: `Vieja: el buscador la fecha "${noticia.date_serper}".` })
              .eq("id", noticia.id)
              .eq("status", "pending_analysis")
            return
          }

          const a = await analizarUna(accountId, noticia, { model, system, hoy })
          uso.entrada += a.uso.entrada
          uso.salida += a.uso.salida
          const { error: errUpdate } = await supabase
            .from("raw_news")
            .update(a.cambios)
            .eq("id", noticia.id)
            .eq("status", "pending_analysis")

          if (errUpdate) throw new Error(errUpdate.message)

          // Las fuentes de la busqueda se guardan: la redaccion cita cada dato
          // con su fuente, y antes se tiraban y solo quedaba el texto. Que esto
          // falle no invalida el analisis.
          try {
            await guardarFuenteNoticia(accountId, noticia)
            if (a.busqueda.ok) await guardarBusqueda(accountId, noticia.id, a.busqueda)
          } catch {
            // La redaccion vuelve a buscar si no encuentra fuentes guardadas.
          }
          analizadas++
        } catch (e) {
          fallidas++
          errores.push(`[${noticia.id.slice(0, 8)}] ${e instanceof Error ? e.message : String(e)}`)
        }
      })
    )
  }

  return { analizadas, fallidas, errores, uso }
}
