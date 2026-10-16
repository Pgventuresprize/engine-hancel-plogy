"use server"

import { ventanaValida } from "@/engine/config"
import { revalidatePath } from "next/cache"

import { idDeCuentaActual } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"

/**
 * Acciones de servidor para editar la configuracion del motor.
 *
 * Todas escriben con el cliente service-role, que solo existe en el servidor:
 * el navegador manda la intencion, nunca la credencial.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refresh() {
  revalidatePath("/engine/config")
}



function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim()
}

// --------------------------------------------------------------- categorias

export async function createCategory(form: FormData): Promise<ActionResult> {
  const name = text(form, "name")
  const slug = text(form, "slug")

  if (!name) return { ok: false, error: "El nombre es obligatorio." }
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
    return {
      ok: false,
      error: "El slug solo admite letras, numeros, guion y guion bajo (se guarda en raw_news.niche).",
    }
  }

  try {
    const supabase = supabaseAdmin()
    const accountId = await idDeCuentaActual()
    const { count } = await supabase
      .from("engine_categories")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)

    const { error } = await supabase.from("engine_categories").insert({
      account_id: accountId,
      name,
      slug,
      description: text(form, "description") || null,
      color: text(form, "color") || "#8b8b8b",
      position: count ?? 0,
    })

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo crear la categoria.")
  }
}

export async function updateCategory(form: FormData): Promise<ActionResult> {
  const id = text(form, "id")
  const name = text(form, "name")
  if (!id) return { ok: false, error: "Falta el id de la categoria." }
  if (!name) return { ok: false, error: "El nombre es obligatorio." }

  try {
    const { error } = await supabaseAdmin()
      .from("engine_categories")
      .update({
        name,
        description: text(form, "description") || null,
        color: text(form, "color") || "#8b8b8b",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo actualizar la categoria.")
  }
}

export async function toggleCategory(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("engine_categories")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar el estado.")
  }
}

/** Borra la categoria y, en cascada, sus segmentos. Las noticias no se tocan. */
export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin().from("engine_categories").delete().eq("id", id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar la categoria.")
  }
}

// ---------------------------------------------------------------- segmentos

export async function createSegment(form: FormData): Promise<ActionResult> {
  const categoryId = text(form, "category_id")
  const label = text(form, "label")
  const query = text(form, "query")

  if (!categoryId) return { ok: false, error: "Falta la categoria." }
  if (!label) return { ok: false, error: "El nombre del segmento es obligatorio." }
  if (!query) return { ok: false, error: "La keyword de busqueda es obligatoria." }

  try {
    const supabase = supabaseAdmin()
    const { count } = await supabase
      .from("engine_segments")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId)

    const { error } = await supabase.from("engine_segments").insert({
      category_id: categoryId,
      label,
      query,
      hl: text(form, "hl") || "en",
      gl: text(form, "gl") || "us",
      num: Number(text(form, "num")) || 15,
      freshness: ventanaValida(text(form, "freshness")),
      position: count ?? 0,
    })

    if (error) {
      throw new Error(
        error.code === "23505"
          ? "Ya existe un segmento con ese nombre en esta categoria."
          : error.message
      )
    }
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo crear el segmento.")
  }
}

export async function updateSegment(form: FormData): Promise<ActionResult> {
  const id = text(form, "id")
  const label = text(form, "label")
  const query = text(form, "query")

  if (!id) return { ok: false, error: "Falta el id del segmento." }
  if (!label) return { ok: false, error: "El nombre del segmento es obligatorio." }
  if (!query) return { ok: false, error: "La keyword de busqueda es obligatoria." }

  try {
    const { error } = await supabaseAdmin()
      .from("engine_segments")
      .update({
        label,
        query,
        hl: text(form, "hl") || "en",
        gl: text(form, "gl") || "us",
        num: Number(text(form, "num")) || 15,
        freshness: ventanaValida(text(form, "freshness")),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo actualizar el segmento.")
  }
}

export async function toggleSegment(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("engine_segments")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar el estado.")
  }
}

export async function deleteSegment(id: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin().from("engine_segments").delete().eq("id", id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar el segmento.")
  }
}


