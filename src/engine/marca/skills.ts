import { supabaseAdmin } from "../supabase-admin"
import { parseCuando } from "./cuando"
import { parseSkill, validarSkill, type CamposSkill, type Skill } from "./skills-modelo"

export * from "./skills-modelo"

/** Las skills de una cuenta, en su orden. Una cuenta nueva no tiene ninguna. */
export async function skillsDe(accountId: string): Promise<Skill[]> {
  const { data, error } = await supabaseAdmin()
    .from("brand_skills")
    .select("*")
    .eq("account_id", accountId)
    .order("position")
    .order("created_at")
  if (error) throw new Error(`No se pudieron leer las skills: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map(parseSkill)
}

/** Crea (sin id) o actualiza una skill. Devuelve su id. */
export async function guardarSkill(accountId: string, id: string | null, campos: CamposSkill): Promise<string> {
  const invalido = validarSkill(campos)
  if (invalido) throw new Error(invalido)

  const supabase = supabaseAdmin()
  const fila = {
    nombre: campos.nombre.trim(),
    descripcion: campos.descripcion.trim(),
    texto: campos.texto.trim(),
    original: campos.original,
    agentes: campos.agentes,
    cuando: parseCuando(campos.cuando),
    activo: campos.activo,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { error } = await supabase.from("brand_skills").update(fila).eq("id", id).eq("account_id", accountId)
    if (error) throw new Error(error.message)
    return id
  }

  // Lo nuevo va al final de la lista.
  const { data: ultima } = await supabase
    .from("brand_skills")
    .select("position")
    .eq("account_id", accountId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = ((ultima as { position: number } | null)?.position ?? -1) + 1

  const { data, error } = await supabase
    .from("brand_skills")
    .insert({ ...fila, account_id: accountId, position })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

export async function borrarSkill(accountId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("brand_skills").delete().eq("id", id).eq("account_id", accountId)
  if (error) throw new Error(error.message)
}

/** Sube o baja una skill y reescribe el orden de todas, de 0 en adelante. */
export async function moverSkill(accountId: string, id: string, direccion: "arriba" | "abajo"): Promise<void> {
  const lista = await skillsDe(accountId)
  const i = lista.findIndex((s) => s.id === id)
  const j = direccion === "arriba" ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= lista.length) return
  ;[lista[i], lista[j]] = [lista[j], lista[i]]
  const supabase = supabaseAdmin()
  const resultados = await Promise.all(
    lista.map((s, position) =>
      s.position === position
        ? null
        : supabase.from("brand_skills").update({ position }).eq("id", s.id).eq("account_id", accountId)
    )
  )
  const fallo = resultados.find((r) => r?.error)
  if (fallo?.error) throw new Error(fallo.error.message)
}
