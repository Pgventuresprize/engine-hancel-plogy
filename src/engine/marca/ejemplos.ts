import { supabaseAdmin } from "../supabase-admin"
import { parseEjemplo, validarEjemplo, type CamposEjemplo, type Ejemplo } from "./ejemplos-modelo"

export * from "./ejemplos-modelo"

/** Los ejemplos de una cuenta, en su orden. Una cuenta nueva no tiene ninguno. */
export async function ejemplosDe(accountId: string): Promise<Ejemplo[]> {
  const { data, error } = await supabaseAdmin()
    .from("brand_ejemplos")
    .select("*")
    .eq("account_id", accountId)
    .order("position")
    .order("created_at")
  if (error) throw new Error(`No se pudieron leer los ejemplos: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map(parseEjemplo)
}

/** Crea (sin id) o actualiza un ejemplo. Devuelve su id. */
export async function guardarEjemplo(accountId: string, id: string | null, campos: CamposEjemplo): Promise<string> {
  const invalido = validarEjemplo(campos)
  if (invalido) throw new Error(invalido)

  const supabase = supabaseAdmin()
  const fila = {
    red: campos.red,
    nombre: campos.nombre.trim(),
    texto: campos.texto.trim(),
    por_que: campos.por_que.trim(),
    pilar_id: campos.pilar_id || null,
    cta_tipo: campos.cta_tipo || null,
    objetivo: campos.objetivo || null,
    origen: campos.origen.trim(),
    activo: campos.activo,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { error } = await supabase.from("brand_ejemplos").update(fila).eq("id", id).eq("account_id", accountId)
    if (error) throw new Error(error.message)
    return id
  }

  // Lo nuevo va al final de la lista.
  const { data: ultimo } = await supabase
    .from("brand_ejemplos")
    .select("position")
    .eq("account_id", accountId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = ((ultimo as { position: number } | null)?.position ?? -1) + 1

  const { data, error } = await supabase
    .from("brand_ejemplos")
    .insert({ ...fila, account_id: accountId, position })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

export async function borrarEjemplo(accountId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("brand_ejemplos").delete().eq("id", id).eq("account_id", accountId)
  if (error) throw new Error(error.message)
}
