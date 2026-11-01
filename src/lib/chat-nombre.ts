import type { User } from "@supabase/supabase-js"

/** El nombre que se ve en el chat: el del perfil si lo hay, si no el del correo. */
export function nombreDe(usuario: Pick<User, "email" | "user_metadata">): string {
  const meta = (usuario.user_metadata ?? {}) as Record<string, unknown>
  const nombre = [meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim().length > 0)
  if (nombre) return nombre.trim()
  const local = (usuario.email ?? "").split("@")[0] ?? ""
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "Tú"
}
