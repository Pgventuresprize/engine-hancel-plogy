import { supabaseAdmin } from "../supabase-admin"

/**
 * La clave de Claude de la plataforma: la que usa una cuenta nueva mientras no
 * tenga la suya.
 *
 * Una cuenta recien creada no tiene token, y sin Claude no hay onboarding ni
 * primer post. Esta clave lo resuelve con dos limites que no se negocian: solo
 * modelos baratos (lo impone messages.ts en el unico punto por donde pasan todas
 * las llamadas) y un tope de gasto por cuenta. Solo la usan las cuentas marcadas
 * con `clave_plataforma`; una cuenta vieja sin token sigue sin poder llamar.
 *
 * Reparto: lo que se hace una vez por marca (conversacion, brief y plantillas) va
 * en Sonnet, porque de ahi sale todo lo demas. Lo que se repite en cada post va en
 * Haiku. Medido el 2026-11-05: unos 0,70 dolares por marca en Sonnet contra 0,03 en
 * Haiku, y el brief y las plantillas se notan; en el post la diferencia pesa menos.
 *
 * Aparte, conviene poner un limite de gasto a la clave en la consola de
 * Anthropic: es la unica barrera que no depende de este codigo.
 */

/** Precios por millon de tokens de los modelos que puede usar esta clave. */
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  "claude-sonnet-5-5": { entrada: 2, salida: 10 },
  "claude-haiku-5-5": { entrada: 0.1, salida: 0.5 },
}
const PRECIO_DESCONOCIDO = PRECIOS["claude-sonnet-5-5"]

const TOPE_POR_DEFECTO_USD = 5
/** Cuanto se confia en una suma de gasto antes de volver a la base. */
const VIGENCIA_GASTO_MS = 20_000

export const clavePlataforma = () => process.env.CLAUDE_PLATAFORMA_KEY?.replace(/\s+/g, "") || null

export const esClavePlataforma = (token: string) => token === clavePlataforma()

const principal = () => process.env.CLAUDE_PLATAFORMA_MODELO?.trim() || "claude-haiku-5-5"
const rapido = () => process.env.CLAUDE_PLATAFORMA_MODELO_RAPIDO?.trim() || "claude-haiku-5-5"
const deMarca = () => process.env.CLAUDE_PLATAFORMA_MODELO_MARCA?.trim() || "claude-sonnet-5-5"

/** El modelo barato que le toca a una llamada. Los pasos del onboarding pesan mas. */
export function modeloPlataforma(pedido: string, paso?: string | null): string {
  if (/haiku/.test(pedido)) return rapido()
  return paso?.startsWith("onboarding-") ? deMarca() : principal()
}

function tope(): number {
  const n = Number(process.env.CLAUDE_PLATAFORMA_TOPE_USD)
  return Number.isFinite(n) && n > 0 ? n : TOPE_POR_DEFECTO_USD
}

type Uso = { modelo?: string; paso?: string | null; entrada?: number; salida?: number; deCache?: number }

/** Lo que cuesta una llamada anotada. Lo leido de cache vale una decima parte. */
export function costoDe(u: Uso): number {
  const p = PRECIOS[modeloPlataforma(u.modelo ?? "", u.paso)] ?? PRECIO_DESCONOCIDO
  return ((u.entrada ?? 0) * p.entrada + (u.deCache ?? 0) * p.entrada * 0.1 + (u.salida ?? 0) * p.salida) / 1_000_000
}

const memoria = new Map<string, { usd: number; hasta: number }>()

/** Lo que ha gastado la cuenta, sumado de `pipeline_events`. */
export async function gastoDe(accountId: string): Promise<number> {
  const previo = memoria.get(accountId)
  if (previo && previo.hasta > Date.now()) return previo.usd
  const { data, error } = await supabaseAdmin()
    .from("pipeline_events")
    .select("detail")
    .eq("account_id", accountId)
    .eq("kind", "claude.uso")
    .limit(5000)
  // Sin poder sumar no se gasta a ciegas: el fallo cuenta como tope alcanzado.
  if (error) return Number.POSITIVE_INFINITY
  const usd = ((data ?? []) as { detail: Uso | null }[]).reduce((n, f) => n + costoDe(f.detail ?? {}), 0)
  memoria.set(accountId, { usd, hasta: Date.now() + VIGENCIA_GASTO_MS })
  return usd
}

async function habilitada(accountId: string): Promise<boolean> {
  if (!clavePlataforma()) return false
  const { data } = await supabaseAdmin().from("accounts").select("clave_plataforma").eq("id", accountId).maybeSingle()
  return (data as { clave_plataforma?: boolean } | null)?.clave_plataforma === true
}

export async function puedeUsarPlataforma(accountId: string): Promise<boolean> {
  return (await habilitada(accountId)) && (await gastoDe(accountId)) < tope()
}

/** La cuenta tenia saldo de la plataforma y se le acabo. */
export async function sinSaldo(accountId: string): Promise<boolean> {
  return (await habilitada(accountId)) && (await gastoDe(accountId)) >= tope()
}
