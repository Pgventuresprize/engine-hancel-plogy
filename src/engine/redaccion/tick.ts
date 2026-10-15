import { modeloDe } from "../agents/modelos"
import { promptDe } from "../agents/prompts"
import { ajustesDe, marcarCorrida } from "../agents/settings"
import { leToca } from "../agents/turno"
import { modelosClaude } from "../claude/modelos"
import { DIAS_DE_FRESCURA, diasDeAntiguedad, esVieja } from "../content/frescura"
import { elegirPorHecho } from "../content/repetidas"
import { getSettings } from "../schedule"
import { supabaseAdmin } from "../supabase-admin"
import { fuentesParaElAgente, redactarNoticia } from "./agente"
import { fechaAbsoluta, investigarNoticia } from "./fuentes"
import { imagenDeNoticia } from "./imagen"
import { nichoDeNoticia } from "./nicho"

/**
 * El pipeline de redaccion: de una noticia analizada a una noticia redactada.
 *
 * Las etapas de noticias (traidas y analizadas) son las mismas del pipeline de
 * redes: la misma extraccion y el mismo analisis, sin repetir nada. Lo que
 * cambia es el liston: este pipeline tiene su propio umbral de score.
 *
 * En contenido hay un solo agente, el de redaccion: decide como contar la
 * noticia y la escribe citando las fuentes. Antes de llamarlo, un proceso sin
 * IA deja la noticia investigada (fuentes con su contenido) y busca su imagen.
 *
 * Cada noticia tiene a lo sumo una redaccion (`news_redacciones`), que pasa
 * por pendiente -> redactando -> redactada | material_insuficiente | error.
 */

const MAX_INTENTOS = 3
/** Una redaccion que se quedo "redactando" mas de esto murio a medias. */
const ATASCADA_MS = 15 * 60_000
const DIAS_DE_HECHOS_CUBIERTOS = 7
const MAX_SELECCION_POR_PASADA = 5

export type ResumenRedaccion = {
  seleccionadas: number
  redactadas: number
  sinMaterial: number
  /** Apartadas por viejas antes de escribirlas. */
  viejas: number
  fallidas: number
  errores: string[]
}

type Noticia = {
  id: string
  title: string
  link: string
  snippet: string | null
  source: string | null
  tema: string
  niche: string
  date_serper: string | null
  image_url: string | null
  relevance_score: number | null
  created_at: string
}

/** Las analizadas que pasan el umbral de redaccion y aun no tienen redaccion. */
export async function seleccionarParaRedaccion(accountId: string, disparo: "auto" | "manual" = "auto"): Promise<{ seleccionadas: number; errores: string[] }> {
  const supabase = supabaseAdmin()
  const { data: config } = await supabase
    .from("generation_config")
    .select("redaccion_score_threshold, redaccion_threshold_updated_at")
    .eq("account_id", accountId)
    .maybeSingle()
  const c = config as { redaccion_score_threshold: number | null; redaccion_threshold_updated_at: string } | null
  if (!c || c.redaccion_score_threshold === null) return { seleccionadas: 0, errores: [] }

  const suyo = await ajustesDe(accountId, "redaccion")
  const { timezone } = await getSettings(accountId)
  const turno = leToca(suyo, timezone, new Date(), disparo)
  if (!turno.corre) return { seleccionadas: 0, errores: [] }
  if (suyo.mode === "programado") await marcarCorrida(accountId, "redaccion")

  const { data: candidatas } = await supabase
    .from("raw_news")
    .select("id, title, relevance_score, created_at, duplicate_of_news_id")
    .eq("account_id", accountId)
    .eq("status", "analyzed")
    .gte("relevance_score", c.redaccion_score_threshold)
    // Como en redes: el umbral rige para lo que entro despues de fijarlo.
    .gte("created_at", c.redaccion_threshold_updated_at)
    .order("relevance_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60)
  const lista = (candidatas ?? []) as (Noticia & { duplicate_of_news_id: string | null })[]
  if (lista.length === 0) return { seleccionadas: 0, errores: [] }

  const { data: ya } = await supabase.from("news_redacciones").select("raw_news_id").in("raw_news_id", lista.map((n) => n.id))
  const tienen = new Set(((ya ?? []) as { raw_news_id: string }[]).map((r) => r.raw_news_id))
  const aspirantes = lista.filter((n) => !tienen.has(n.id) && !n.duplicate_of_news_id).slice(0, MAX_SELECCION_POR_PASADA)
  if (aspirantes.length === 0) return { seleccionadas: 0, errores: [] }

  // El mismo hecho contado por dos medios se redacta una vez. Se compara con
  // lo ya redactado en la ultima semana.
  const desde = new Date(Date.now() - DIAS_DE_HECHOS_CUBIERTOS * 86_400_000).toISOString()
  const { data: cubiertas } = await supabase
    .from("news_redacciones")
    .select("raw_news_id, raw_news!inner(title)")
    .eq("account_id", accountId)
    .neq("status", "descartada")
    .gte("created_at", desde)
    .limit(120)
  const yaCubiertas = ((cubiertas ?? []) as unknown as { raw_news_id: string; raw_news: { title: string } }[]).map((x) => ({ id: x.raw_news_id, title: x.raw_news.title }))

  const errores: string[] = []
  let elegidas = aspirantes.map((a) => a.id)
  const repetidas = new Map<string, string>()
  try {
    const v = await elegirPorHecho(
      accountId,
      aspirantes.map((n) => ({ id: n.id, title: n.title, score: n.relevance_score, created_at: n.created_at })),
      yaCubiertas,
      (await modelosClaude(accountId)).angulo
    )
    elegidas = v.elegidas.map((e) => e.id)
    for (const [r, d] of v.repetidas) repetidas.set(r, d)
  } catch (e) {
    errores.push(`repetidas: ${e instanceof Error ? e.message : String(e)}`)
  }

  const filas = [
    ...elegidas.map((id) => ({ account_id: accountId, raw_news_id: id, status: "pendiente" })),
    // La repetida queda anotada en este pipeline sin tocar la noticia: en el de
    // redes puede seguir su camino.
    ...[...repetidas].map(([id, duena]) => ({
      account_id: accountId,
      raw_news_id: id,
      status: "descartada",
      error: `Repite el hecho de otra noticia ya redactada (${duena.slice(0, 8)}).`,
    })),
  ]
  if (filas.length) await supabase.from("news_redacciones").upsert(filas, { onConflict: "raw_news_id", ignoreDuplicates: true })
  return { seleccionadas: elegidas.length, errores }
}

/** Pide la redaccion de una noticia a mano (arrastrarla o el boton de la ficha). */
export async function pedirRedaccion(accountId: string, newsId: string): Promise<void> {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("news_redacciones").select("id, status").eq("raw_news_id", newsId).maybeSingle()
  const fila = data as { id: string; status: string } | null
  if (!fila) {
    await supabase.from("news_redacciones").insert({ account_id: accountId, raw_news_id: newsId, status: "pendiente", promovida_a_mano: true })
    return
  }
  if (fila.status === "redactando") return
  await supabase
    .from("news_redacciones")
    .update({ status: "pendiente", intentos: 0, error: null, promovida_a_mano: true, updated_at: new Date().toISOString() })
    .eq("id", fila.id)
}

/** Redacta una noticia: investiga, busca la imagen y llama al agente. */
async function redactarUna(
  accountId: string,
  filaId: string,
  newsId: string,
  intentos: number
): Promise<"redactada" | "material_insuficiente" | "vieja" | "error"> {
  const supabase = supabaseAdmin()
  // Una noticia vieja no se redacta nunca, la haya pedido quien la haya pedido.
  const apartarPorVieja = async (motivo: string) => {
    await supabase
      .from("news_redacciones")
      .update({ status: "descartada", error: `Noticia vieja: ${motivo}`, updated_at: new Date().toISOString() })
      .eq("id", filaId)
    return "vieja" as const
  }
  try {
    const { data } = await supabase
      .from("raw_news")
      .select("id, title, link, snippet, source, tema, niche, date_serper, image_url, relevance_score, created_at, status")
      .eq("id", newsId)
      .single()
    const news = data as Noticia & { status: string }
    if (news.status === "discarded_date" || esVieja(news.date_serper)) {
      return await apartarPorVieja(`el buscador la fecha "${news.date_serper ?? "sin fecha"}".`)
    }
    const { fuentes, imagenArticulo } = await investigarNoticia(accountId, news)
    const original = fuentes.find((f) => f.origen === "noticia")
    // La fecha que declara el propio articulo manda: el buscador a veces la
    // da relativa o no la da.
    const diasArticulo = original?.fecha && /\d{4}/.test(original.fecha) ? diasDeAntiguedad(original.fecha) : null
    if (diasArticulo !== null && diasArticulo > DIAS_DE_FRESCURA) {
      return await apartarPorVieja(`el artículo original es del ${original!.fecha!.slice(0, 10)}.`)
    }
    const fecha = fechaAbsoluta(original?.fecha ?? news.date_serper, news.created_at)
    if (original && fecha && original.fecha !== fecha) original.fecha = fecha
    const entrada = fuentesParaElAgente(fuentes)
    const [model, system, imagen] = await Promise.all([
      modeloDe(accountId, "redaccion"),
      promptDe(accountId, "redaccion"),
      imagenDeNoticia(accountId, news.id, [imagenArticulo, news.image_url, ...fuentes.map((f) => f.imagen)]),
    ])
    const { redaccion } = await redactarNoticia(
      accountId,
      { noticia: { title: news.title, snippet: news.snippet, link: news.link, source: news.source, fecha }, fuentes: entrada },
      model,
      system
    )
    const estado = redaccion.status === "ok" ? "redactada" : "material_insuficiente"
    // El nicho (el tema en el portal): por lo que cuenta la noticia, siempre
    // uno de los de la cuenta.
    const nicho =
      estado === "redactada"
        ? await nichoDeNoticia(accountId, { titular: redaccion.titular, entrada: redaccion.entrada.parrafos.join(" "), nichoBusqueda: news.niche })
        : null
    await supabase
      .from("news_redacciones")
      .update({
        status: estado,
        titular: redaccion.titular || null,
        payload: redaccion,
        fuentes: entrada.map(({ contenido, ...resto }) => ({ ...resto, caracteres: contenido.length })),
        imagen_url: imagen,
        word_count: redaccion.word_count,
        model,
        error: estado === "material_insuficiente" ? `Falta: ${redaccion.faltantes.join("; ") || "material verificable"}` : null,
        redactada_at: new Date().toISOString(),
        nicho_slug: nicho?.slug ?? null,
        nicho_nombre: nicho?.nombre ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", filaId)
    return estado
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    await supabase
      .from("news_redacciones")
      .update({ status: "error", error: mensaje.slice(0, 500), intentos: intentos + 1, updated_at: new Date().toISOString() })
      .eq("id", filaId)
    return "error"
  }
}

/**
 * Una pasada de redaccion para una cuenta: selecciona por umbral (si al agente
 * le toca) y redacta hasta `limite` noticias en cola, `paralelo` a la vez.
 */
export async function tickRedaccion(
  accountId: string,
  opciones: { limite?: number; paralelo?: number; disparo?: "auto" | "manual"; hastaMs?: number } = {}
): Promise<ResumenRedaccion> {
  const supabase = supabaseAdmin()
  const limite = opciones.limite ?? 3
  const paralelo = opciones.paralelo ?? 3
  const resumen: ResumenRedaccion = { seleccionadas: 0, redactadas: 0, sinMaterial: 0, viejas: 0, fallidas: 0, errores: [] }

  await supabase
    .from("news_redacciones")
    .update({ status: "error", error: "Se interrumpió al redactar." })
    .eq("account_id", accountId)
    .eq("status", "redactando")
    .lt("updated_at", new Date(Date.now() - ATASCADA_MS).toISOString())

  const sel = await seleccionarParaRedaccion(accountId, opciones.disparo ?? "auto")
  resumen.seleccionadas = sel.seleccionadas
  resumen.errores.push(...sel.errores)

  // Las pedidas a mano corren aunque el agente este en manual; las de la
  // seleccion automatica solo llegan aqui si al agente le tocaba.
  const suyo = await ajustesDe(accountId, "redaccion")
  if (!suyo.enabled) return resumen

  const { data } = await supabase
    .from("news_redacciones")
    .select("id, raw_news_id, intentos, status")
    .eq("account_id", accountId)
    .or(`status.eq.pendiente,and(status.eq.error,intentos.lt.${MAX_INTENTOS})`)
    .order("promovida_a_mano", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limite)
  const cola = (data ?? []) as { id: string; raw_news_id: string; intentos: number; status: string }[]

  for (let i = 0; i < cola.length; i += paralelo) {
    if (opciones.hastaMs && Date.now() > opciones.hastaMs) break
    await Promise.all(
      cola.slice(i, i + paralelo).map(async (fila) => {
        // Reclamo: solo una pasada se queda cada redaccion.
        const { data: mia } = await supabase
          .from("news_redacciones")
          .update({ status: "redactando", updated_at: new Date().toISOString() })
          .eq("id", fila.id)
          .eq("status", fila.status)
          .select("id")
          .maybeSingle()
        if (!mia) return
        const r = await redactarUna(accountId, fila.id, fila.raw_news_id, fila.intentos)
        if (r === "redactada") resumen.redactadas++
        else if (r === "material_insuficiente") resumen.sinMaterial++
        else if (r === "vieja") resumen.viejas++
        else resumen.fallidas++
      })
    )
  }
  return resumen
}
