import { supabaseAdmin } from "../supabase-admin"

/**
 * La identidad editorial de la marca: de que habla (pilares), para quien
 * (audiencias), en que terreno (verticales) y que pide al final (CTA).
 *
 * Son filas de la propia cuenta, y una cuenta nueva no tiene ninguna. Los
 * pilares y los CTA son las mismas tablas que usa el Estudio; audiencias y
 * verticales tienen su misma forma para editarse con el mismo componente.
 */

export type Capa = { id: string; name: string; description: string | null; position: number }
export type Pilar = Capa & { pregunta: string | null }

export const TIPOS_CTA = ["seguir", "comentar", "palabra", "dm", "comercial"] as const
export type TipoCta = (typeof TIPOS_CTA)[number]
export type Cta = Capa & { tipo: TipoCta; requiere_recurso: boolean; recurso_listo: boolean; activo: boolean }

export type IdentidadEditorial = {
  pilares: Pilar[]
  audiencias: Capa[]
  verticales: Capa[]
  ctas: Cta[]
}

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

export async function identidadEditorial(accountId: string): Promise<IdentidadEditorial> {
  const [pilares, audiencias, verticales, ctas] = await Promise.all([
    filas<Pilar>("content_pillars", `${BASE}, pregunta`, accountId),
    filas<Capa>("content_audiences", BASE, accountId),
    filas<Capa>("content_verticals", BASE, accountId),
    filas<Cta>("content_ctas", `${BASE}, tipo, requiere_recurso, recurso_listo, activo`, accountId),
  ])
  return { pilares, audiencias, verticales, ctas }
}

/**
 * Los CTA que un agente puede proponer hoy: activos y, si prometen un recurso,
 * con el recurso listo. Un "comenta PALABRA y te lo mandamos" sin nada que
 * mandar es una promesa que nadie va a cumplir.
 */
export function ctasUsables(ctas: Cta[]): Cta[] {
  return ctas.filter((c) => c.activo && (!c.requiere_recurso || c.recurso_listo))
}
