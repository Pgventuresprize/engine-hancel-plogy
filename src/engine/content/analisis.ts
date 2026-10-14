import { llamarClaude, parsearJSONDeClaude } from "../claude/messages"
import { modelosClaude } from "../claude/modelos"
import { supabaseAdmin } from "../supabase-admin"
import { buscarEnLaWeb } from "./composio"

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
 * el prompt—, no contra un dominio fijo: asi Agro se puntua como Agro y Hancel
 * como Hancel, con la misma vara.
 */

export const ANALISIS_SYSTEM = `Eres un analista editorial. Te dan una noticia y el material que otro sistema ya recolecto de la web sobre ese hecho. Tu trabajo es consolidar y calificar. NO investigas ni buscas: trabajas solo con lo que se te entrega.

PASO 1: CONSOLIDAR
Con el titular, el snippet y el material recolectado, escribe un texto limpio y estructurado con la informacion factual del hecho: solo hechos con su contexto, sin opiniones ni relleno, sin referencias tipo [1]. Maximo 8000 caracteres. Si el material es pobre, consolida lo que haya y no inventes nada.

PASO 2: CALIFICAR (1-10, promedio ponderado)
1. MATERIALIDAD (30%): el hecho cambia algo concreto (capacidad, posicion competitiva, regulacion, capital, personas). Alto si altera a 2+ actores.
2. NOVEDAD/TIMING (20%): es reciente o es la primera vez que se hace publico. Tema saturado puntua bajo.
3. POTENCIAL DE ANGULO (20%): hay un angulo que los medios generalistas ignoran, una tesis no obvia.
4. CONECTIVIDAD (15%): se conecta con otros hechos formando patron, convergencia o contradiccion.
5. FIT DE NICHO (15%): es genuinamente sobre el nicho que se indica. Fuera de nicho puntua 1-2.

VETO: TEMAS QUE ESTA CUENTA NO CUBRE NUNCA
Antes de calificar, decide si la noticia esta vetada. Si lo esta, devuelve "vetada": true y el motivo, y lo demas da igual.

ENTRA EN EL VETO:
- Corrupcion, desvio de recursos publicos, contratos irregulares, favorecimiento, trafico de influencias.
- Escandalos, senalamientos o polemicas sobre figuras publicas, politicos, funcionarios o dirigentes gremiales.
- Investigaciones, imputaciones, procesos judiciales, capturas, condenas, sanciones a personas.
- Peleas politicas, acusaciones cruzadas entre funcionarios, gremios o partidos.

NO ENTRA EN EL VETO, son noticias normales del sector:
- Una politica publica, un decreto, un arancel, un subsidio o una linea de credito, contados por lo que cambian para el productor.
- Cifras oficiales, informes de gremios, precios, clima, cosechas, exportaciones.
- Una critica tecnica a una medida, sin senalar a una persona.

LA PRUEBA: si el sujeto de la noticia es una persona senalada, esta vetada. Si el sujeto es un hecho del sector, no lo esta. "Finagro amplio la linea de credito rural" no esta vetada; "Finagro dio credito de pequeno productor al gerente de un gremio" si lo esta.

FILTRO DURO: si NO es un hecho verificable (opinion, prediccion sin gatillo, listicle generico), relevance_score = 1-2 sin importar lo demas.

content_fetch_status: "success" si el material recolectado era sustancioso, "partial" si apenas habia mas que el snippet, "failed" si no llego nada.

RESPONDE SOLO con este JSON, sin texto alrededor, sin saltos de linea y sin comillas dobles dentro de ninguna cadena (usa comillas simples y separa ideas con espacios dentro de full_content):
{"vetada":<true|false>,"motivo_veto":"<una frase, solo si vetada es true>","full_content":"<el texto consolidado, en un solo bloque sin saltos de linea>","content_fetch_status":"success|partial|failed","relevance_score":<entero 1-10>,"keywords_matched":["<4 a 6 keywords en minuscula>"],"analysis_notes":"<2-3 frases: primero el score global y por que; luego el angulo editorial mas prometedor si lo hay>"}`

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
  full_content: string | null
  content_fetch_status: string
  relevance_score: number
  keywords_matched: string[]
  analysis_notes: string
}

function normaliza(bruto: unknown): ResultadoAnalisis {
  const o = (bruto ?? {}) as Record<string, unknown>
  const score = Number(o.relevance_score)
  return {
    vetada: o.vetada === true,
    motivoVeto: typeof o.motivo_veto === "string" ? o.motivo_veto.trim().slice(0, 300) : "",
    full_content:
      typeof o.full_content === "string" && o.full_content.trim()
        ? o.full_content.trim().slice(0, 8000)
        : null,
    content_fetch_status: ["success", "partial", "failed"].includes(String(o.content_fetch_status))
      ? String(o.content_fetch_status)
      : "partial",
    relevance_score: Number.isFinite(score) ? Math.min(10, Math.max(1, Math.round(score))) : 1,
    keywords_matched: Array.isArray(o.keywords_matched)
      ? o.keywords_matched.filter((k): k is string => typeof k === "string").slice(0, 8)
      : [],
    analysis_notes: typeof o.analysis_notes === "string" ? o.analysis_notes.trim() : "",
  }
}

type Pendiente = {
  id: string
  title: string
  link: string
  snippet: string | null
  source: string | null
  niche: string
  tema: string
}

/** Tope de material web por noticia: mas que esto es pagar contexto de mas. */
const MAX_MATERIAL = 12_000

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
    .select("id, title, link, snippet, source, niche, tema")
    .eq("account_id", accountId)
    .eq("status", "pending_analysis")

  if (soloIds && soloIds.length > 0) consulta = consulta.in("id", soloIds)

  const { data, error } = await consulta.order("created_at", { ascending: true }).limit(limite)

  if (error) throw new Error(`No se pudieron leer las pendientes: ${error.message}`)
  const pendientes = (data ?? []) as Pendiente[]
  if (pendientes.length === 0)
    return { analizadas: 0, fallidas: 0, errores: [], uso: { entrada: 0, salida: 0 } }

  const model = (await modelosClaude(accountId)).analisis
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
          // Composio sale a la web; el modelo no. Si no trae nada se analiza con
          // el snippet: una noticia sin material no es un fallo, es una noticia
          // con menos contexto, y el propio agente la marca 'failed'.
          const material = await buscarEnLaWeb(`${noticia.title} ${noticia.tema}`.trim())

          const prompt = `NOTICIA A CONSOLIDAR Y CALIFICAR
- titulo: ${noticia.title}
- fuente: ${noticia.source ?? "desconocida"}
- enlace: ${noticia.link}
- nicho al que pertenece (para el FIT): ${noticia.niche} / ${noticia.tema}
- snippet original: ${noticia.snippet ?? "(sin snippet)"}

MATERIAL RECOLECTADO DE LA WEB
${material ? material.slice(0, MAX_MATERIAL) : "(no se pudo recolectar material; trabaja con el titular y el snippet)"}`

          const r = await llamarClaude({
            accountId,
            model,
            system: ANALISIS_SYSTEM,
            prompt,
            maxTokens: 4000,
          })
          if (!r.ok) throw new Error(r.error)
          uso.entrada += r.uso.entrada
          uso.salida += r.uso.salida

          const res = normaliza(parsearJSONDeClaude(r.texto))
          const { error: errUpdate } = await supabase
            .from("raw_news")
            .update({
              full_content: res.full_content,
              content_fetched_at: new Date().toISOString(),
              content_fetch_status: res.content_fetch_status,
              relevance_score: res.relevance_score,
              keywords_matched: res.keywords_matched,
              analysis_notes: res.vetada
                ? `Vetada: ${res.motivoVeto || "tema que esta cuenta no cubre"}`
                : res.analysis_notes,
              // Vetada no es "analizada con mala nota": es un tema que no se
              // cubre. Con su propio estado no entra en la seleccion, no se
              // puede arrastrar y queda a la vista para poder revisarlo.
              status: res.vetada ? "vetada" : "analyzed",
              analyzed_at: new Date().toISOString(),
            })
            .eq("id", noticia.id)
            .eq("status", "pending_analysis")

          if (errUpdate) throw new Error(errUpdate.message)
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
