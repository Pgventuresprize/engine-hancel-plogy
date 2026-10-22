"use server"

import { revalidatePath } from "next/cache"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"

/**
 * CRUD de las capas del bloque 1.
 *
 * Todas escriben con la service role y acotan a la cuenta abierta: el id del
 * padre o de la fila llega del cliente, y sin el filtro por cuenta cualquiera
 * con sesion podria tocar las capas de otra pasando un id a mano.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refresh() {
  revalidatePath("/capas")
  // Pilares, audiencias, verticales y CTA se editan tambien desde Marca.
  revalidatePath("/marca")
}

const TABLAS = [
  "content_pillars",
  "content_topics",
  "content_subtopics",
  "content_intents",
  "content_narratives",
  "content_ctas",
  "content_audiences",
  "content_verticals",
] as const
type Tabla = (typeof TABLAS)[number]

const TIPOS_CTA = ["seguir", "comentar", "palabra", "dm", "comercial"] as const

/** Lo que una fila tiene ademas de nombre y descripcion, segun su tabla. */
export type CamposExtra = {
  /** Solo pilares. */
  pregunta?: string | null
  /** Solo CTA. */
  tipo?: (typeof TIPOS_CTA)[number]
  requiere_recurso?: boolean
  recurso_listo?: boolean
  activo?: boolean
}

/** Valida y limpia los campos propios de la tabla; descarta los que no le tocan. */
function extrasDe(tabla: Tabla, campos: CamposExtra): Record<string, unknown> | string {
  const fila: Record<string, unknown> = {}
  if (tabla === "content_pillars" && campos.pregunta !== undefined) {
    const p = typeof campos.pregunta === "string" ? campos.pregunta.trim().slice(0, 160) : ""
    fila.pregunta = p || null
  }
  if (tabla === "content_ctas") {
    if (campos.tipo !== undefined) {
      if (!TIPOS_CTA.includes(campos.tipo)) return "Ese tipo de CTA no existe."
      fila.tipo = campos.tipo
    }
    for (const clave of ["requiere_recurso", "recurso_listo", "activo"] as const) {
      if (typeof campos[clave] === "boolean") fila[clave] = campos[clave]
    }
  }
  return fila
}

/**
 * Crea o actualiza una fila de una capa.
 *
 * `id` vacio crea; con id, actualiza esa fila de la cuenta. `extra` lleva la
 * relacion con el padre (pillar_id para un tema, topic_id para un subtema) solo
 * al crear: mover una fila de padre no es una edicion, es otra cosa.
 */
export async function guardarFila(
  tabla: Tabla,
  campos: { id?: string; name: string; description?: string | null } & CamposExtra,
  extra?: Record<string, string>
): Promise<ActionResult> {
  if (!TABLAS.includes(tabla)) return { ok: false, error: "Capa desconocida." }

  const name = campos.name.trim()
  if (!name) return { ok: false, error: "El nombre no puede quedar vacio." }

  const description =
    typeof campos.description === "string" && campos.description.trim().length > 0
      ? campos.description.trim()
      : null

  const propios = extrasDe(tabla, campos)
  if (typeof propios === "string") return { ok: false, error: propios }

  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()

    if (campos.id) {
      const { error } = await supabase
        .from(tabla)
        .update({ name, description, ...propios, updated_at: new Date().toISOString() })
        .eq("id", campos.id)
        .eq("account_id", accountId)
      if (error) throw new Error(error.message)
    } else {
      // Al final de la lista: sin esto todas nacian en 0 y el orden era el azar
      // de la base. Se cuenta sobre la tabla entera de la cuenta, asi que entre
      // hermanos el orden de creacion se respeta aunque haya huecos.
      const { data: ultima } = await supabase
        .from(tabla)
        .select("position")
        .eq("account_id", accountId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle()
      const position = ((ultima as { position: number } | null)?.position ?? -1) + 1
      const { error } = await supabase
        .from(tabla)
        .insert({ account_id: accountId, name, description, position, ...propios, ...(extra ?? {}) })
      if (error) throw new Error(error.message)
    }

    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar.")
  }
}

/** Borra una fila de una capa. El borrado en cascada se lleva sus hijos. */
export async function borrarFila(tabla: Tabla, id: string): Promise<ActionResult> {
  if (!TABLAS.includes(tabla)) return { ok: false, error: "Capa desconocida." }
  if (!id) return { ok: false, error: "Falta el id." }

  try {
    const { error } = await supabaseAdmin()
      .from(tabla)
      .delete()
      .eq("id", id)
      .eq("account_id", await idDeCuentaActual())
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar.")
  }
}

/** Las capas que se reordenan desde la interfaz: listas planas, sin padre. */
const REORDENABLES = ["content_pillars", "content_ctas", "content_audiences", "content_verticals"] as const

/**
 * Sube o baja una fila un puesto. El orden importa: el primer pilar es el
 * principal y el primer CTA el que se prefiere.
 *
 * Se reescribe el orden de toda la lista (0, 1, 2…) en vez de intercambiar dos
 * posiciones: las filas viejas nacieron todas en 0, y cambiar un 0 por otro 0
 * no movia nada.
 */
export async function moverFila(
  tabla: (typeof REORDENABLES)[number],
  id: string,
  direccion: "arriba" | "abajo"
): Promise<ActionResult> {
  if (!REORDENABLES.includes(tabla)) return { ok: false, error: "Esa capa no se reordena." }

  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from(tabla)
      .select("id")
      .eq("account_id", accountId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
    if (error) throw new Error(error.message)

    const ids = ((data ?? []) as { id: string }[]).map((f) => f.id)
    const i = ids.indexOf(id)
    const j = direccion === "arriba" ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ids.length) return { ok: true }
    ;[ids[i], ids[j]] = [ids[j], ids[i]]

    const resultados = await Promise.all(
      ids.map((filaId, position) =>
        supabase.from(tabla).update({ position }).eq("id", filaId).eq("account_id", accountId)
      )
    )
    const fallo = resultados.find((r) => r.error)
    if (fallo?.error) throw new Error(fallo.error.message)

    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo reordenar.")
  }
}

/**
 * Enciende o apaga la narrativa que una intencion desbloquea.
 *
 * Es una relacion, no una fila: elegir una intencion deja disponibles solo las
 * narrativas marcadas aqui. Se comprueba que las dos partes son de la cuenta
 * antes de enlazarlas, para no cruzar capas de cuentas distintas.
 */
export async function alternarNarrativa(
  intentId: string,
  narrativeId: string,
  activar: boolean
): Promise<ActionResult> {
  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()

    if (activar) {
      const { count } = await supabase
        .from("content_narratives")
        .select("id", { count: "exact", head: true })
        .eq("id", narrativeId)
        .eq("account_id", accountId)
      if (!count) return { ok: false, error: "Esa narrativa no es de esta cuenta." }

      const { error } = await supabase
        .from("content_intent_narratives")
        .upsert(
          { account_id: accountId, intent_id: intentId, narrative_id: narrativeId },
          { onConflict: "intent_id,narrative_id" }
        )
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase
        .from("content_intent_narratives")
        .delete()
        .eq("account_id", accountId)
        .eq("intent_id", intentId)
        .eq("narrative_id", narrativeId)
      if (error) throw new Error(error.message)
    }

    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar la relacion.")
  }
}
