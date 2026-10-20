import { supabaseAdmin } from "../supabase-admin"
import type { Capa, Cta, IdentidadEditorial, Pilar } from "./editorial-modelo"

export * from "./editorial-modelo"

async function filas<T>(tabla: string, columnas: string, accountId: string): Promise<T[]> {
  const { data, error } = await supabaseAdmin()
    .from(tabla)
    .select(columnas)
    .eq("account_id", accountId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`)
  return (data ?? []) as T[]
}

const BASE = "id, name, description, position"

/** Pilares, audiencias, verticales y CTA de la cuenta, en su orden. */
export async function identidadEditorial(accountId: string): Promise<IdentidadEditorial> {
  const [pilares, audiencias, verticales, ctas] = await Promise.all([
    filas<Pilar>("content_pillars", `${BASE}, pregunta`, accountId),
    filas<Capa>("content_audiences", BASE, accountId),
    filas<Capa>("content_verticals", BASE, accountId),
    filas<Cta>("content_ctas", `${BASE}, tipo, requiere_recurso, recurso_listo, activo`, accountId),
  ])
  return { pilares, audiencias, verticales, ctas }
}
