import { supabaseAdmin } from "./supabase-admin"
import type { Plan } from "./accounts"

/**
 * Las empresas (cuentas) y sus miembros.
 *
 * Todo gira alrededor de la empresa, no del usuario: una empresa tiene uno o
 * varios miembros, y un usuario puede ser miembro de varias empresas. Cada
 * miembro es owner (gestiona la empresa: plan, miembros, conexiones) o member
 * (trabaja en ella). Los datos y las conexiones de una empresa no se ven desde
 * otra.
 */

export type Rol = "owner" | "member"
export type Miembro = { userId: string; email: string; rol: Rol; desde: string }

export async function miembrosDe(accountId: string): Promise<Miembro[]> {
  const supabase = supabaseAdmin()
  const { data, error } = await supabase.from("account_members").select("user_id, role, created_at").eq("account_id", accountId).order("created_at")
  if (error) throw new Error(`No se pudieron leer los miembros: ${error.message}`)
  const filas = (data ?? []) as { user_id: string; role: Rol; created_at: string }[]
  return Promise.all(
    filas.map(async (f) => {
      const { data: u } = await supabase.auth.admin.getUserById(f.user_id)
      return { userId: f.user_id, email: u.user?.email ?? "(usuario borrado)", rol: f.role, desde: f.created_at }
    })
  )
}

/** Un usuario por su correo, o null si no existe. */
async function usuarioPorCorreo(email: string): Promise<{ id: string } | null> {
  const supabase = supabaseAdmin()
  const buscado = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`No se pudieron leer los usuarios: ${error.message}`)
    const u = data.users.find((x) => x.email?.toLowerCase() === buscado)
    if (u) return { id: u.id }
    if (data.users.length < 1000) return null
  }
  return null
}

/**
 * Añade un miembro a una empresa por su correo. Si el usuario no existe se
 * crea con la contraseña dada (y ya confirmado, para que pueda entrar). Si ya
 * existe, se le da acceso a esta empresa y conserva su contraseña.
 */
export async function agregarMiembro(
  accountId: string,
  email: string,
  rol: Rol,
  password?: string
): Promise<{ ok: true; creado: boolean } | { ok: false; error: string }> {
  const correo = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { ok: false, error: "Ese correo no es válido." }
  const supabase = supabaseAdmin()
  let usuario = await usuarioPorCorreo(correo)
  let creado = false
  if (!usuario) {
    if (!password || password.length < 8) {
      return { ok: false, error: "Ese correo no tiene cuenta todavía: ponle una contraseña de al menos 8 caracteres para crearla." }
    }
    const { data, error } = await supabase.auth.admin.createUser({ email: correo, password, email_confirm: true })
    if (error || !data.user) return { ok: false, error: `No se pudo crear el usuario: ${error?.message ?? "sin respuesta"}` }
    usuario = { id: data.user.id }
    creado = true
  }
  const { error } = await supabase
    .from("account_members")
    .upsert({ account_id: accountId, user_id: usuario.id, role: rol }, { onConflict: "account_id,user_id" })
  if (error) return { ok: false, error: error.message }
  return { ok: true, creado }
}

/** Cuantos owners tiene una empresa: nunca se puede quedar sin ninguno. */
async function owners(accountId: string): Promise<number> {
  const { count } = await supabaseAdmin().from("account_members").select("user_id", { count: "exact", head: true }).eq("account_id", accountId).eq("role", "owner")
  return count ?? 0
}

export async function cambiarRol(accountId: string, userId: string, rol: Rol): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("account_members").select("role").eq("account_id", accountId).eq("user_id", userId).maybeSingle()
  const actual = (data as { role: Rol } | null)?.role
  if (!actual) return { ok: false, error: "Ese usuario no es miembro de la empresa." }
  if (actual === "owner" && rol !== "owner" && (await owners(accountId)) <= 1) {
    return { ok: false, error: "La empresa tiene que quedar con al menos un owner." }
  }
  const { error } = await supabase.from("account_members").update({ role: rol }).eq("account_id", accountId).eq("user_id", userId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Quita el acceso a la empresa (el usuario sigue existiendo para sus otras empresas). */
export async function quitarMiembro(accountId: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("account_members").select("role").eq("account_id", accountId).eq("user_id", userId).maybeSingle()
  const rol = (data as { role: Rol } | null)?.role
  if (!rol) return { ok: true }
  if (rol === "owner" && (await owners(accountId)) <= 1) return { ok: false, error: "No se puede quitar al único owner de la empresa." }
  const { error } = await supabase.from("account_members").delete().eq("account_id", accountId).eq("user_id", userId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

function slugDe(nombre: string) {
  return (
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "empresa"
  )
}

/**
 * Crea una empresa con su plan; quien la crea queda como owner. Empieza sin
 * conexiones (cada empresa conecta las suyas) y con los modelos por defecto.
 */
export async function crearEmpresa(
  nombre: string,
  plan: Plan,
  creadorId: string
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const limpio = nombre.trim()
  if (limpio.length < 2) return { ok: false, error: "Ponle un nombre a la empresa." }
  if (plan !== "basic" && plan !== "advance") return { ok: false, error: "Plan desconocido." }
  const supabase = supabaseAdmin()
  const base = slugDe(limpio)
  let slug = base
  for (let i = 2; i < 50; i++) {
    const { count } = await supabase.from("accounts").select("id", { count: "exact", head: true }).eq("slug", slug)
    if (!count) break
    slug = `${base}-${i}`
  }
  const { data, error } = await supabase.from("accounts").insert({ name: limpio, slug, plan }).select("id").single()
  if (error || !data) return { ok: false, error: `No se pudo crear la empresa: ${error?.message ?? "sin respuesta"}` }
  const id = (data as { id: string }).id
  const [m, s] = await Promise.all([
    supabase.from("account_members").insert({ account_id: id, user_id: creadorId, role: "owner" }),
    supabase.from("account_secrets").insert({ account_id: id }),
  ])
  if (m.error) return { ok: false, error: `Se creó la empresa pero no el acceso: ${m.error.message}` }
  if (s.error) return { ok: false, error: `Se creó la empresa pero no su espacio de conexiones: ${s.error.message}` }
  try {
    await asegurarConfiguracion(id)
  } catch (e) {
    return { ok: false, error: `Se creó la empresa pero no su configuración: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, slug }
}

/** Las redes con horario propio en `publish_schedule`. */
const REDES_CON_HORARIO = ["linkedin", "instagram", "facebook"] as const

/**
 * Las filas de configuracion que toda empresa necesita, con los valores por
 * defecto de la base.
 *
 * Sin ellas, las pantallas que solo actualizan (marca, aspecto, zona horaria)
 * afectaban cero filas y decian "Guardado" sin guardar nada. Es idempotente:
 * lo que ya existe no se toca, asi que se puede llamar de nuevo sin miedo.
 */
export async function asegurarConfiguracion(accountId: string): Promise<void> {
  const supabase = supabaseAdmin()
  const opciones = { ignoreDuplicates: true } as const
  const resultados = await Promise.all([
    supabase.from("generation_config").upsert({ account_id: accountId }, { onConflict: "account_id", ...opciones }),
    supabase.from("engine_settings").upsert({ account_id: accountId }, { onConflict: "account_id", ...opciones }),
    supabase
      .from("publish_schedule")
      .upsert(
        REDES_CON_HORARIO.map((network) => ({ account_id: accountId, network })),
        { onConflict: "account_id,network", ...opciones }
      ),
  ])
  const fallo = resultados.find((r) => r.error)
  if (fallo?.error) throw new Error(fallo.error.message)
}

export async function actualizarEmpresa(accountId: string, campos: { name?: string; plan?: Plan }): Promise<{ ok: true } | { ok: false; error: string }> {
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (campos.name !== undefined) {
    if (campos.name.trim().length < 2) return { ok: false, error: "Ponle un nombre a la empresa." }
    cambios.name = campos.name.trim()
  }
  if (campos.plan !== undefined) {
    if (campos.plan !== "basic" && campos.plan !== "advance") return { ok: false, error: "Plan desconocido." }
    cambios.plan = campos.plan
  }
  const { error } = await supabaseAdmin().from("accounts").update(cambios).eq("id", accountId)
  return error ? { ok: false, error: error.message } : { ok: true }
}
