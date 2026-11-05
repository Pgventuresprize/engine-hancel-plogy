import { supabaseAdmin } from "../supabase-admin"

/**
 * Los ajustes de toda la plataforma.
 *
 * Si el registro no se ha tocado desde el panel, o la tabla todavia no existe,
 * manda `REGISTRO_ABIERTO` como siempre: aplicar esta migracion no puede abrir un
 * registro que estaba cerrado.
 */
export async function registroAbiertoPlataforma(): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("platform_ajustes").select("registro_abierto").eq("id", true).maybeSingle()
  const elegido = error ? null : (data as { registro_abierto: boolean | null } | null)?.registro_abierto
  if (typeof elegido === "boolean") return elegido
  return (process.env.REGISTRO_ABIERTO ?? "si").trim().toLowerCase() !== "no"
}

export async function guardarRegistroAbierto(abierto: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseAdmin()
    .from("platform_ajustes")
    .upsert({ id: true, registro_abierto: abierto, updated_at: new Date().toISOString() }, { onConflict: "id" })
  return error ? { ok: false, error: error.message } : { ok: true }
}
