import { supabaseAdmin } from "./supabase-admin"

/**
 * Las cuentas del motor.
 *
 * Una cuenta es una empresa: un espacio de trabajo completo e independiente
 * de los demas, con sus miembros, su taxonomia, sus noticias, su contenido y
 * sus conexiones (Claude, Serper, LinkedIn, Canva, Facebook, Instagram; ver
 * `secretos.ts`). Lo unico de la plataforma son las credenciales de las
 * herramientas que no son de nadie en particular: la organizacion de
 * Composio, Pexels y la app de LinkedIn.
 *
 * Cada empresa tiene un plan:
 * - basic: las noticias y sus agentes.
 * - advance: todo lo anterior mas el estudio (capas, ideas, recetas,
 *   carruseles, publicacion) y Video studio.
 *
 * Este modulo es el lado del motor: corre sin usuario delante, tanto desde los
 * endpoints que dispara Postgres como desde `npm run ingest`. Por eso no importa
 * "server-only" —ese paquete lanza fuera de Next— y por eso usa la service role.
 * El lado con sesion vive en `src/lib/accounts.ts`.
 */

export type Plan = "basic" | "advance"

export type Cuenta = {
  id: string
  name: string
  slug: string
  plan: Plan
}

const CAMPOS = "id, name, slug, plan"

/** Si el plan de la empresa incluye el estudio, la publicacion y los videos. */
export const esAdvance = (c: Pick<Cuenta, "plan">) => c.plan === "advance"

/** Todas las cuentas, en orden de creacion. Es sobre lo que itera el motor. */
export async function todasLasCuentas(): Promise<Cuenta[]> {
  const { data, error } = await supabaseAdmin()
    .from("accounts")
    .select(CAMPOS)
    .order("created_at")

  if (error) throw new Error(`No se pudieron leer las cuentas: ${error.message}`)
  return (data ?? []) as Cuenta[]
}

export async function cuentaPorId(accountId: string): Promise<Cuenta | null> {
  const { data } = await supabaseAdmin()
    .from("accounts")
    .select(CAMPOS)
    .eq("id", accountId)
    .maybeSingle()

  return (data as Cuenta) ?? null
}

export async function cuentaPorSlug(slug: string): Promise<Cuenta | null> {
  const { data } = await supabaseAdmin()
    .from("accounts")
    .select(CAMPOS)
    .eq("slug", slug)
    .maybeSingle()

  return (data as Cuenta) ?? null
}
