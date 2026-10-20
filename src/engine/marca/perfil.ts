import { supabaseAdmin } from "../supabase-admin"
import { parsePerfil, PERFIL_VACIO, validarPerfil, type PerfilMarca } from "./perfil-modelo"

export * from "./perfil-modelo"

/** El perfil de la cuenta, o el vacio si todavia no lo guardo nunca. */
export async function perfilDe(accountId: string): Promise<PerfilMarca> {
  const { data, error } = await supabaseAdmin()
    .from("brand_profile")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer el perfil de marca: ${error.message}`)
  return data ? parsePerfil(data) : { ...PERFIL_VACIO }
}

/**
 * Guarda los campos que lleguen, sin tocar los demas. La primera vez crea la
 * fila: es el unico momento en que nace el perfil.
 */
export async function guardarPerfil(accountId: string, cambios: Partial<PerfilMarca>): Promise<void> {
  const invalido = validarPerfil(cambios as Record<string, unknown>)
  if (invalido) throw new Error(invalido)

  // Se normaliza el perfil completo y se escriben solo las claves que vinieron.
  const limpio = parsePerfil({ ...(await perfilDe(accountId)), ...cambios })
  const fila: Record<string, unknown> = { account_id: accountId, updated_at: new Date().toISOString() }
  for (const clave of Object.keys(cambios) as (keyof PerfilMarca)[]) {
    if (clave in PERFIL_VACIO) fila[clave] = limpio[clave]
  }

  const { error } = await supabaseAdmin().from("brand_profile").upsert(fila, { onConflict: "account_id" })
  if (error) throw new Error(`No se pudo guardar el perfil de marca: ${error.message}`)
}
