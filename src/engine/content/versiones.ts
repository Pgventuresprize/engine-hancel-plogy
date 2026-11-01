import { supabaseAdmin } from "../supabase-admin"

/**
 * Las versiones de una pieza (tabla pieza_versiones, migracion 2026-10-31-chat).
 *
 * Cada vez que una pieza cambia —nace, se corrige, se regenera, se edita a mano
 * o se cambia desde el chat— se guarda una copia de lo que tiene: el guion del
 * buzon (con su diseño, si lo hay) y lo que se publica. Desde el chat se puede
 * ver una version vieja y restaurarla como nueva.
 *
 * Guardar una version nunca tumba lo que la provoco: la pieza ya cambio, y
 * perder la copia es menos grave que perder el cambio.
 */

/** Cuantas versiones se guardan por pieza. Las mas viejas se borran. */
export const VERSIONES_POR_PIEZA = 30

export type Version = {
  id: string
  piece_id: string
  n: number
  autor_agente: string | null
  autor_usuario: string | null
  motivo: string | null
  guion: unknown
  payload: Record<string, unknown>
  mensaje_id: string | null
  created_at: string
}

export type NuevaVersion = {
  accountId: string
  pieceId: string
  motivo: string
  /** La clave del agente que la hizo (instagram, linkedin, revisor...). */
  autorAgente?: string
  /** La persona que la hizo, si fue a mano. */
  autorUsuario?: string | null
  /** El mensaje del chat del que salio, si salio de ahi. */
  mensajeId?: string | null
}

/** Guarda la pieza tal como esta ahora. Devuelve su numero, o null si no se pudo. */
export async function guardarVersion(v: NuevaVersion): Promise<number | null> {
  try {
    const supabase = supabaseAdmin()
    const { data: pieza } = await supabase
      .from("content_pieces")
      .select("payload, network, job_instagram_id, job_linkedin_id")
      .eq("id", v.pieceId)
      .eq("account_id", v.accountId)
      .maybeSingle()
    if (!pieza) return null
    const p = pieza as { payload: Record<string, unknown>; network: string; job_instagram_id: string | null; job_linkedin_id: string | null }

    const tabla = p.network === "linkedin" ? "jobs_linkedin" : "jobs_instagram"
    const jobId = p.network === "linkedin" ? p.job_linkedin_id : p.job_instagram_id
    const { data: job } = jobId ? await supabase.from(tabla).select("respuesta").eq("id", jobId).maybeSingle() : { data: null }

    // Dos cambios casi a la vez pueden pedir el mismo numero: el indice unico
    // frena al segundo, que lo intenta otra vez con el siguiente.
    for (let intento = 0; intento < 3; intento++) {
      const { data: ultima } = await supabase
        .from("pieza_versiones")
        .select("n")
        .eq("piece_id", v.pieceId)
        .order("n", { ascending: false })
        .limit(1)
        .maybeSingle()
      const n = ((ultima as { n: number } | null)?.n ?? 0) + 1

      const { error } = await supabase.from("pieza_versiones").insert({
        account_id: v.accountId,
        piece_id: v.pieceId,
        n,
        autor_agente: v.autorAgente ?? null,
        autor_usuario: v.autorUsuario ?? null,
        motivo: v.motivo,
        guion: (job as { respuesta: unknown } | null)?.respuesta ?? null,
        payload: p.payload,
        mensaje_id: v.mensajeId ?? null,
      })
      if (error?.code === "23505") continue
      if (error) throw new Error(error.message)

      if (n > VERSIONES_POR_PIEZA) {
        await supabase.from("pieza_versiones").delete().eq("piece_id", v.pieceId).lte("n", n - VERSIONES_POR_PIEZA)
      }
      return n
    }
    return null
  } catch (e) {
    console.error("[versiones] No se pudo guardar la version:", e instanceof Error ? e.message : e)
    return null
  }
}

/** Las versiones de una pieza, de la mas nueva a la mas vieja, sin el contenido. */
export async function versionesDe(accountId: string, pieceId: string): Promise<Omit<Version, "guion" | "payload">[]> {
  const { data, error } = await supabaseAdmin()
    .from("pieza_versiones")
    .select("id, piece_id, n, autor_agente, autor_usuario, motivo, mensaje_id, created_at")
    .eq("account_id", accountId)
    .eq("piece_id", pieceId)
    .order("n", { ascending: false })
  if (error) throw new Error(`No se pudieron leer las versiones: ${error.message}`)
  return (data ?? []) as Omit<Version, "guion" | "payload">[]
}

/** Una version con su contenido. */
export async function versionDe(accountId: string, pieceId: string, n: number): Promise<Version | null> {
  const { data } = await supabaseAdmin()
    .from("pieza_versiones")
    .select("*")
    .eq("account_id", accountId)
    .eq("piece_id", pieceId)
    .eq("n", n)
    .maybeSingle()
  return (data as Version | null) ?? null
}
