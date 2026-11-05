"use server"

import { revalidatePath } from "next/cache"

import { idDeCuentaAdvance } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { muestraDeEstilo } from "@/engine/studio/plantillas"
import { esTipo, normalizarEstilo, TIPOS, type EstiloPlantilla } from "@/lib/plantillas-catalogo"

/**
 * Los estilos graficos: editar, duplicar, borrar y ver una muestra en Canva.
 *
 * Guardar solo guarda valores. La muestra es la que habla con Canva (y con el
 * generador de imagenes): compone una portada y una lamina con contenido de
 * ejemplo, para ver el estilo antes de usarlo. Tarda unos 20 segundos.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refrescar() {
  revalidatePath("/capas")
  revalidatePath("/recetas")
}

/** El estilo tiene que ser de la cuenta abierta: el id llega del cliente. */
async function tipoDe(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("content_templates")
    .select("tipo")
    .eq("id", id)
    .eq("account_id", await idDeCuentaAdvance())
    .maybeSingle()
  return (data as { tipo: string | null } | null)?.tipo ?? null
}

export async function guardarEstilo(campos: {
  id: string
  name: string
  descripcion: string
  estilo: EstiloPlantilla
}): Promise<ActionResult> {
  const name = campos.name.trim()
  if (!name) return { ok: false, error: "El estilo necesita un nombre." }
  try {
    const tipo = await tipoDe(campos.id)
    if (!esTipo(tipo)) return { ok: false, error: "Ese estilo no es de esta cuenta." }
    const { error } = await supabaseAdmin()
      .from("content_templates")
      .update({
        name,
        // Vacia vuelve a la descripcion de serie del tipo.
        descripcion: campos.descripcion.trim() || TIPOS[tipo].descripcion,
        estilo: normalizarEstilo(campos.estilo, tipo),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campos.id)
    if (error) throw new Error(error.message)
    refrescar()
    return { ok: true, id: campos.id }
  } catch (error) {
    return fail(error, "No se pudo guardar el estilo.")
  }
}

/** Una variante nueva de un estilo, partiendo de los valores de serie de su tipo. */
export async function crearEstilo(tipo: string): Promise<ActionResult> {
  if (!esTipo(tipo)) return { ok: false, error: "Tipo de estilo desconocido." }
  try {
    const { data, error } = await supabaseAdmin()
      .from("content_templates")
      .insert({
        account_id: await idDeCuentaAdvance(),
        tipo,
        name: `${TIPOS[tipo].nombre} (variante)`,
        descripcion: TIPOS[tipo].descripcion,
        estilo: TIPOS[tipo].estilo,
        status: "lista",
      })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    refrescar()
    return { ok: true, id: (data as { id: string }).id }
  } catch (error) {
    return fail(error, "No se pudo crear el estilo.")
  }
}

/** Compone una muestra del estilo en Canva. */
export async function generarMuestra(id: string): Promise<ActionResult> {
  try {
    if (!esTipo(await tipoDe(id))) return { ok: false, error: "Ese estilo no es de esta cuenta." }
    const r = await muestraDeEstilo(id, await idDeCuentaAdvance())
    refrescar()
    return r.ok ? { ok: true, id } : r
  } catch (error) {
    return fail(error, "No se pudo generar la muestra.")
  }
}

/**
 * Borra un estilo. Si una receta lo usaba se queda sin estilo, y sus piezas
 * salen como texto hasta que se le asigne otro.
 */
export async function borrarEstilo(id: string): Promise<ActionResult> {
  try {
    const { error } = await supabaseAdmin()
      .from("content_templates")
      .delete()
      .eq("id", id)
      .eq("account_id", await idDeCuentaAdvance())
    if (error) throw new Error(error.message)
    refrescar()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo borrar el estilo.")
  }
}
