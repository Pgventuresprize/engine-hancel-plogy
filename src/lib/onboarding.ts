import { onboardingActivo } from "@/engine/empresas"
import { supabaseAdmin } from "@/engine/supabase-admin"

/**
 * Si esta cuenta tiene que pasar por /empezar.
 *
 * Solo quien gestiona la marca: alguien invitado entra al Studio normal. Si no se
 * puede leer (por ejemplo, antes de correr la migracion) se deja pasar: esta
 * puerta nunca puede dejar a nadie fuera de su cuenta.
 */
export async function debeHacerOnboarding(cuenta: { id: string; rol: string }): Promise<boolean> {
  if (!onboardingActivo() || cuenta.rol !== "owner") return false
  const { data, error } = await supabaseAdmin().from("accounts").select("onboarding").eq("id", cuenta.id).maybeSingle()
  if (error) return false
  const estado = (data as { onboarding?: string } | null)?.onboarding
  return estado === "pendiente" || estado === "en_curso"
}
