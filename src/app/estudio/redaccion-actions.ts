"use server"

import { revalidatePath } from "next/cache"

import { analizarPendientes } from "@/engine/content/analisis"
import type { Redaccion } from "@/engine/redaccion/agente"
import { pedirRedaccion } from "@/engine/redaccion/tick"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { cuentaActual } from "@/lib/accounts"
import { despertarRedaccion } from "@/lib/redaccion-despertar"

/**
 * Las acciones del tablero de redaccion. Analizar es la misma accion del
 * pipeline de redes (el analisis es uno solo); redactar y descartar son de
 * este pipeline y no tocan la noticia en el otro.
 */

export type Resultado = { ok: true; aviso?: string } | { ok: false; error: string }

function refrescar() {
  revalidatePath("/")
}

async function noticiaDeLaCuenta(newsId: string) {
  const cuenta = await cuentaActual()
  const { data } = await supabaseAdmin()
    .from("raw_news")
    .select("id, status")
    .eq("id", newsId)
    .eq("account_id", cuenta.id)
    .maybeSingle()
  return { cuenta, noticia: data as { id: string; status: string } | null }
}

export async function moverEnRedaccion(newsId: string, destino: "analizada" | "redaccion" | "descartado"): Promise<Resultado> {
  try {
    const { cuenta, noticia } = await noticiaDeLaCuenta(newsId)
    if (!noticia) return { ok: false, error: "Esa noticia no es de esta empresa." }

    if (destino === "analizada") {
      if (noticia.status !== "pending_analysis") return { ok: false, error: "Esta noticia ya pasó por el análisis." }
      const { analizadas, errores } = await analizarPendientes(cuenta.id, 1, [newsId])
      refrescar()
      return analizadas ? { ok: true } : { ok: false, error: errores[0] ?? "El análisis no devolvió nada." }
    }

    if (destino === "redaccion") {
      if (noticia.status === "vetada") return { ok: false, error: "Es un tema vetado: no se redacta." }
      if (noticia.status === "pending_analysis") return { ok: false, error: "Primero hay que analizarla." }
      await pedirRedaccion(cuenta.id, newsId)
      await despertarRedaccion(cuenta.slug)
      refrescar()
      return { ok: true, aviso: "En redacción: el agente la escribe en uno o dos minutos." }
    }

    await supabaseAdmin()
      .from("news_redacciones")
      .upsert(
        { account_id: cuenta.id, raw_news_id: newsId, status: "descartada", error: "Descartada a mano.", updated_at: new Date().toISOString() },
        { onConflict: "raw_news_id" }
      )
    refrescar()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export type FuenteVista = {
  id: string
  medio: string | null
  titulo: string | null
  url: string
  fecha: string | null
  tipo: string
  origen: string
  leida: boolean
}

export type RedaccionCompleta = {
  status: string
  redaccion: Redaccion | null
  /** Las fuentes tal como las vio el agente: f1, f2... con su url. */
  citadas: { id: string; medio: string; titulo: string; url: string; fecha: string; tipo: string }[]
  /** Todas las fuentes investigadas de la noticia. */
  investigadas: FuenteVista[]
  imagen: string | null
  error: string | null
  model: string | null
  redactadaAt: string | null
}

/** La redaccion entera, para la ficha: no viaja con el tablero porque pesa. */
export async function redaccionCompleta(newsId: string): Promise<{ ok: true; datos: RedaccionCompleta } | { ok: false; error: string }> {
  try {
    const { cuenta, noticia } = await noticiaDeLaCuenta(newsId)
    if (!noticia) return { ok: false, error: "Esa noticia no es de esta empresa." }
    const supabase = supabaseAdmin()
    const [{ data: r }, { data: f }] = await Promise.all([
      supabase
        .from("news_redacciones")
        .select("status, payload, fuentes, imagen_url, error, model, redactada_at")
        .eq("raw_news_id", newsId)
        .eq("account_id", cuenta.id)
        .maybeSingle(),
      supabase.from("news_sources").select("id, medio, titulo, url, fecha, tipo, origen, contenido").eq("raw_news_id", newsId).order("created_at"),
    ])
    const fila = r as {
      status: string
      payload: Redaccion | null
      fuentes: RedaccionCompleta["citadas"] | null
      imagen_url: string | null
      error: string | null
      model: string | null
      redactada_at: string | null
    } | null
    return {
      ok: true,
      datos: {
        status: fila?.status ?? "sin_redaccion",
        redaccion: fila?.payload ?? null,
        citadas: fila?.fuentes ?? [],
        investigadas: ((f ?? []) as (FuenteVista & { contenido: string | null })[]).map(({ contenido, ...resto }) => ({ ...resto, leida: Boolean(contenido) })),
        imagen: fila?.imagen_url ?? null,
        error: fila?.error ?? null,
        model: fila?.model ?? null,
        redactadaAt: fila?.redactada_at ?? null,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
