import { llamarClaude } from "../claude/messages"
import { supabaseAdmin } from "../supabase-admin"
import { ajustesVideo, promptGuion, type AjustesVideo } from "./ajustes"

/**
 * El agente de guiones de video.
 *
 * Toma una idea del banco de ideas (los cartuchos que deja el agente de ideas),
 * al azar o filtrada por pilar, intencion y narrativa segun la configuracion, y
 * la reclama: la idea queda usada, asi que las recetas de carruseles no la
 * toman tambien. Con la idea, su intencion y su narrativa escribe el guion por
 * escenas siguiendo el prompt de la cuenta (o el de serie).
 *
 * El guion se guarda ya separado: cada escena por su lado, para copiarla tal
 * cual en Flow, mas la narracion de corrido, la descripcion del post y los
 * supuestos que hay que revisar.
 */

export type Escena = { n: number; titulo: string; duracion: number | null; texto: string }

export type Guion = {
  escenas: Escena[]
  narracion: string
  descripcion: string
  supuestos: string[]
  /** La respuesta entera del modelo, por si algo no se pudo separar. */
  bruto: string
  modelo: string
}

type Cartucho = {
  id: string
  pillar_id: string
  topic_id: string | null
  subtopic_id: string | null
  intent_id: string | null
  narrative_id: string | null
  idea: string
  notes: string | null
}

export type Capas = {
  pilar: string | null
  tema: string | null
  subtema: string | null
  intencion: { name: string; description: string | null } | null
  narrativa: { name: string; description: string | null } | null
  nota: string | null
}

/**
 * Reclama una idea disponible que cumpla los filtros, al azar entre las que
 * cumplen. La reclama con un UPDATE condicionado a que siga disponible: si otra
 * pasada se la llevo antes, prueba con otra.
 */
export async function reclamarIdea(accountId: string, a: AjustesVideo): Promise<Cartucho | null> {
  const supabase = supabaseAdmin()
  let q = supabase
    .from("content_cartridges")
    .select("id")
    .eq("account_id", accountId)
    .eq("status", "available")
  if (a.pillarId) q = q.eq("pillar_id", a.pillarId)
  if (a.intentId) q = q.eq("intent_id", a.intentId)
  if (a.narrativeId) q = q.eq("narrative_id", a.narrativeId)
  const { data } = await q.limit(500)
  const ids = ((data ?? []) as { id: string }[]).map((c) => c.id)
  for (let intento = 0; intento < 5 && ids.length; intento++) {
    const [id] = ids.splice(Math.floor(Math.random() * ids.length), 1)
    const { data: tomado } = await supabase
      .from("content_cartridges")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "available")
      .select("id, pillar_id, topic_id, subtopic_id, intent_id, narrative_id, idea, notes")
      .maybeSingle()
    if (tomado) return tomado as Cartucho
  }
  return null
}

/** Los nombres y descripciones de las capas de una idea. */
async function capasDe(c: Cartucho): Promise<Capas> {
  const supabase = supabaseAdmin()
  const una = async (tabla: string, id: string | null, conDescripcion = false) => {
    if (!id) return null
    const { data } = await supabase.from(tabla).select(conDescripcion ? "name, description" : "name").eq("id", id).maybeSingle()
    return data as { name: string; description?: string | null } | null
  }
  const [pilar, tema, subtema, intencion, narrativa] = await Promise.all([
    una("content_pillars", c.pillar_id),
    una("content_topics", c.topic_id),
    una("content_subtopics", c.subtopic_id),
    una("content_intents", c.intent_id, true),
    una("content_narratives", c.narrative_id, true),
  ])
  return {
    pilar: pilar?.name ?? null,
    tema: tema?.name ?? null,
    subtema: subtema?.name ?? null,
    intencion: intencion ? { name: intencion.name, description: intencion.description ?? null } : null,
    narrativa: narrativa ? { name: narrativa.name, description: narrativa.description ?? null } : null,
    nota: c.notes,
  }
}

/**
 * Separa la respuesta del modelo en escenas, narracion, descripcion y
 * supuestos. El prompt pide cada escena en su propio bloque de codigo que
 * empieza por "SCENE:", la narracion de corrido, la descripcion en un bloque de
 * codigo y los supuestos al final.
 */
export function separarGuion(texto: string, modelo: string): Guion {
  const bloques = [...texto.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1].trim())
  const escenas: Escena[] = bloques
    .filter((b) => /^SCENE:/m.test(b))
    .map((b, i) => ({
      n: i + 1,
      titulo: /^SCENE:\s*(.+)$/m.exec(b)?.[1]?.trim() ?? `Escena ${i + 1}`,
      duracion: Number(/^DURATION:\s*(\d+)/m.exec(b)?.[1]) || null,
      texto: b,
    }))
  const otros = bloques.filter((b) => !/^SCENE:/m.test(b) && !/^ATTACH IN FLOW/m.test(b))
  const descripcion = otros[otros.length - 1] ?? ""

  // Lo que va despues de un titulo ("Narración completa", "Supuestos") hasta el
  // siguiente titulo o bloque de codigo.
  const seccion = (nombre: RegExp) => {
    const sinBloques = texto.replace(/```[\s\S]*?```/g, "\n§\n")
    const m = nombre.exec(sinBloques)
    if (!m) return ""
    const resto = sinBloques.slice(m.index + m[0].length)
    const fin = resto.search(/\n\s*(?:#{1,6}\s|\d+\.\s+\*\*|\*\*[A-ZÁÉÍÓÚ][^*]{2,40}:?\*\*|§)/)
    return (fin >= 0 ? resto.slice(0, fin) : resto).replace(/^[:\s*]+/, "").trim()
  }
  const narracion = seccion(/narraci[oó]n completa[:*\s]*/i)
  const supuestos = seccion(/supuestos[:*\s]*/i)
    .split("\n")
    .map((l) => l.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3)

  return { escenas, narracion, descripcion, supuestos, bruto: texto, modelo }
}

function entradaDelGuion(item: { idea: string }, capas: Capas, a: AjustesVideo) {
  const linea = (n: { name: string; description: string | null } | null) =>
    n ? `${n.name}${n.description ? `: ${n.description}` : ""}` : "(sin definir)"
  return [
    `- **Idea:** ${item.idea}`,
    capas.nota ? `- **Nota de la idea:** ${capas.nota}` : "",
    `- **Tema:** ${capas.tema ?? "(sin tema)"}${capas.subtema ? ` (enfocado a ${capas.subtema})` : ""}`,
    `- **Intención:** ${linea(capas.intencion)}`,
    `- **Narración:** ${linea(capas.narrativa)}`,
    `- **Personaje:** ${a.personajeTag} / ${a.personajeNombre}`,
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Escribe (o reescribe) el guion de un video. Deja el video en Escenas, o en
 * Ideas con el error si fallo; cada intento cuenta.
 */
export async function escribirGuion(videoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = supabaseAdmin()
  const { data: item } = await supabase.from("video_items").select("id, account_id, idea, capas, intentos").eq("id", videoId).maybeSingle()
  const v = item as { id: string; account_id: string; idea: string; capas: Capas | null; intentos: number } | null
  if (!v) return { ok: false, error: "No existe ese video." }
  const a = await ajustesVideo(v.account_id)
  await supabase.from("video_items").update({ intentos: v.intentos + 1, error: null, updated_at: new Date().toISOString() }).eq("id", v.id)

  const capas: Capas = v.capas ?? { pilar: null, tema: null, subtema: null, intencion: null, narrativa: null, nota: null }
  // Un guion de siete escenas detalladas es una respuesta larga: hasta cuatro
  // minutos y tokens de sobra.
  const r = await llamarClaude({
    model: a.model,
    system: promptGuion(a),
    prompt: entradaDelGuion(v, capas, a),
    maxTokens: 12000,
    timeoutMs: 240_000,
  })
  if (!r.ok) {
    await supabase.from("video_items").update({ error: r.error.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", v.id)
    return { ok: false, error: r.error }
  }
  const guion = separarGuion(r.texto, a.model)
  if (guion.escenas.length === 0) {
    const error = "El modelo no devolvió escenas con el formato esperado (bloques que empiezan por SCENE:)."
    await supabase.from("video_items").update({ error, guion, updated_at: new Date().toISOString() }).eq("id", v.id)
    return { ok: false, error }
  }
  await supabase
    .from("video_items")
    .update({ status: "escenas", guion, error: null, updated_at: new Date().toISOString() })
    .eq("id", v.id)
  return { ok: true }
}

/**
 * Crea un video: reclama una idea segun la configuracion y escribe su guion.
 * `publicarAt` es el hueco de publicacion (modo automatico); a mano va sin hora.
 */
export async function crearVideo(
  accountId: string,
  opciones: { publicarAt?: Date } = {}
): Promise<{ ok: true; videoId: string; guion: boolean; error?: string } | { ok: false; error: string }> {
  const supabase = supabaseAdmin()
  const a = await ajustesVideo(accountId)
  const cartucho = await reclamarIdea(accountId, a)
  if (!cartucho) return { ok: false, error: "No hay ideas disponibles con los filtros de Video studio." }

  const capas = await capasDe(cartucho)
  const { data: nuevo, error } = await supabase
    .from("video_items")
    .insert({
      account_id: accountId,
      cartridge_id: cartucho.id,
      pillar_id: cartucho.pillar_id,
      status: "idea",
      idea: cartucho.idea,
      capas,
      publicar_at: opciones.publicarAt?.toISOString() ?? null,
    })
    .select("id")
    .maybeSingle()
  if (error || !nuevo) {
    // Otra pasada ya creo el video de ese hueco: la idea vuelve al banco.
    await supabase.from("content_cartridges").update({ status: "available", used_at: null }).eq("id", cartucho.id)
    return { ok: false, error: error?.message ?? "No se pudo crear el video." }
  }
  const videoId = (nuevo as { id: string }).id
  const g = await escribirGuion(videoId)
  return g.ok ? { ok: true, videoId, guion: true } : { ok: true, videoId, guion: false, error: g.error }
}
