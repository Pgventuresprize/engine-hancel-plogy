import { supabaseAdmin } from "../supabase-admin"
import { dayIn, getSettings } from "../schedule"
import { publicarEnRed } from "../publish/meta"

export type RedBuffer = "instagram" | "facebook"

/**
 * El agente de publicacion del estudio.
 *
 * Cada dia arma un plan: un hueco cada `cadaMin` minutos desde `desde`, y en
 * cada hueco una receta. Las recetas de cada pilar se turnan (v1, v2, v3... y
 * otra vuelta), los pilares se intercalan (Agro, Cultivos, Agro...), y cada
 * receta aparece tantas veces como piezas genera al dia (`per_day`): lo que se
 * produce es lo que se publica.
 *
 * A cada hueco le toca la pieza mas reciente de su receta que no haya salido, y
 * se publica cuando llega su hora, con las conexiones de Facebook e Instagram
 * de la empresa (Composio). Un carrusel de Instagram sale tambien en Facebook
 * tal cual, con todas sus laminas; una receta propia de Facebook sale solo en
 * Facebook.
 *
 * Lo corre el tick de publicacion cada cinco minutos, que cae justo en las
 * horas de los huecos (:00, :15, :30, :45). Cada pasada publica un hueco como
 * mucho: si se acumularon varios (la receta iba tarde, el sistema estuvo
 * caido), salen de a uno, nunca varios en el mismo minuto.
 *
 * Es idempotente: `studio_publications` tiene un unico por hueco y red, asi que
 * dos pasadas no publican dos veces lo mismo.
 */

export type AjustesPublicacion = {
  activo: boolean
  /** "09:30", hora local de la cuenta. */
  desde: string
  cadaMin: number
  redes: RedBuffer[]
}

const POR_DEFECTO: AjustesPublicacion = { activo: false, desde: "09:30", cadaMin: 15, redes: ["instagram", "facebook"] }

export async function ajustesPublicacion(accountId: string): Promise<AjustesPublicacion> {
  const { data } = await supabaseAdmin()
    .from("studio_settings")
    .select("publicar_activo, publicar_desde, publicar_cada_min, publicar_redes")
    .eq("account_id", accountId)
    .maybeSingle()
  const d = data as { publicar_activo: boolean; publicar_desde: string; publicar_cada_min: number; publicar_redes: string[] } | null
  if (!d) return POR_DEFECTO
  return {
    activo: d.publicar_activo,
    desde: /^\d{1,2}:\d{2}$/.test(d.publicar_desde) ? d.publicar_desde : POR_DEFECTO.desde,
    cadaMin: Math.max(5, d.publicar_cada_min || POR_DEFECTO.cadaMin),
    redes: (d.publicar_redes ?? []).filter((r): r is RedBuffer => r === "instagram" || r === "facebook"),
  }
}

/** Minutos que la zona va por delante de UTC en ese instante (Bogota: -300). */
function desfase(timezone: string, fecha: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(fecha)
  const n = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0)
  return (Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute")) - fecha.getTime()) / 60_000
}

/** El instante de una hora local ("09:30") de un dia ("2026-10-03") en la zona. */
export function instanteLocal(dia: string, hora: string, timezone: string): Date {
  const [y, mo, d] = dia.split("-").map(Number)
  const [h, mi] = hora.split(":").map(Number)
  const comoUtc = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(comoUtc - desfase(timezone, new Date(comoUtc)) * 60_000)
}

type RecetaPlan = { id: string; name: string; pillar_id: string; per_day: number; channel: string; created_at: string }

export type Hueco = { slot: number; at: Date; receta: RecetaPlan }

/**
 * El plan de un dia: los huecos en orden, cada uno con su receta. Dentro de un
 * pilar las recetas se turnan por vueltas; entre pilares se intercalan uno a
 * uno, y el pilar que se quede sin recetas deja sitio a los demas.
 */
export function planDelDia(recetas: RecetaPlan[], pilares: string[], ajustes: AjustesPublicacion, dia: string, timezone: string): Hueco[] {
  const colas = pilares
    .map((pilar) => {
      // En el orden en que se crearon (v1, v2, v3...), no por nombre.
      const suyas = recetas.filter((r) => r.pillar_id === pilar).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name))
      const cola: RecetaPlan[] = []
      const vueltas = Math.max(0, ...suyas.map((r) => r.per_day))
      for (let v = 0; v < vueltas; v++) for (const r of suyas) if (r.per_day > v) cola.push(r)
      return cola
    })
    .filter((c) => c.length)
  const orden: RecetaPlan[] = []
  for (let i = 0; colas.some((c) => i < c.length); i++) for (const c of colas) if (i < c.length) orden.push(c[i])
  const inicio = instanteLocal(dia, ajustes.desde, timezone).getTime()
  return orden.map((receta, slot) => ({ slot, at: new Date(inicio + slot * ajustes.cadaMin * 60_000), receta }))
}

type Fila = {
  id: string
  piece_id: string
  slot: number
  red: RedBuffer
  status: "programando" | "publicada" | "error"
  due_at: string | null
  intentos: number
  updated_at: string
}

export type ResumenPublicacion = {
  activo: boolean
  dia?: string
  huecos?: number
  publicadas?: number
  esperando?: number
  errores?: string[]
}

export const MAX_INTENTOS = 3

/** El texto del post: el caption y los hashtags, cada uno con su #. */
function textoDelPost(payload: { caption?: string; hashtags?: string[] }) {
  const tags = (payload.hashtags ?? [])
    .map((h) => h.trim().replace(/^#+/, "").replace(/\s+/g, ""))
    .filter(Boolean)
    .map((h) => `#${h}`)
    .join(" ")
  return [payload.caption?.trim(), tags].filter((p) => p && p.length > 0).join("\n\n")
}

export async function publicarPendientes(accountId: string, now = new Date()): Promise<ResumenPublicacion> {
  const ajustes = await ajustesPublicacion(accountId)
  if (!ajustes.activo || ajustes.redes.length === 0) return { activo: false }

  const supabase = supabaseAdmin()
  const { timezone } = await getSettings(accountId)
  const dia = dayIn(timezone, now)
  const errores: string[] = []

  // Un reclamo que se quedo a medias (el proceso murio publicando) se reintenta.
  await supabase
    .from("studio_publications")
    .update({ status: "error", error: "Se interrumpió al publicar." })
    .eq("account_id", accountId)
    .eq("status", "programando")
    .lt("updated_at", new Date(now.getTime() - 10 * 60_000).toISOString())

  const [recetasR, pilaresR, filasR, usadasR] = await Promise.all([
    supabase.from("content_recipes").select("id, name, pillar_id, per_day, channel, created_at").eq("account_id", accountId).eq("enabled", true),
    supabase.from("content_pillars").select("id").eq("account_id", accountId).order("position").order("name"),
    supabase.from("studio_publications").select("id, piece_id, slot, red, status, due_at, intentos, updated_at").eq("account_id", accountId).eq("dia", dia),
    // Una pieza cuyo hueco fallo del todo (sin mas intentos) queda libre para
    // otro hueco: no se pierde porque la red no estuviera conectada.
    supabase.from("studio_publications").select("piece_id").eq("account_id", accountId).or(`status.neq.error,intentos.lt.${MAX_INTENTOS}`),
  ])
  const plan = planDelDia(
    (recetasR.data ?? []) as RecetaPlan[],
    ((pilaresR.data ?? []) as { id: string }[]).map((p) => p.id),
    ajustes,
    dia,
    timezone
  )
  const filas = (filasR.data ?? []) as Fila[]
  const usadas = new Set(((usadasR.data ?? []) as { piece_id: string }[]).map((u) => u.piece_id))

  let publicadas = 0
  let esperando = 0
  for (const hueco of plan) {
    // Lo que aun no llega a su hora espera.
    if (hueco.at.getTime() > now.getTime()) break
    const suyas = filas.filter((f) => f.slot === hueco.slot)
    // Un carrusel de Instagram sale tambien en Facebook; una receta de
    // Facebook, solo en Facebook.
    const redes = hueco.receta.channel === "facebook" ? ajustes.redes.filter((r) => r === "facebook") : ajustes.redes
    const pendientes = redes.filter((red) => {
      const f = suyas.find((x) => x.red === red)
      return !f || (f.status === "error" && f.intentos < MAX_INTENTOS)
    })
    if (pendientes.length === 0) continue

    // La pieza del hueco: la que ya tenga asignada, o la mas reciente de su
    // receta que no haya salido.
    let piezaId: string | null = suyas[0]?.piece_id ?? null
    if (!piezaId) {
      const { data: candidatas } = await supabase
        .from("studio_pieces")
        .select("id")
        .eq("recipe_id", hueco.receta.id)
        .eq("status", "generated")
        .is("published_at", null)
        .order("created_at", { ascending: false })
        .limit(20)
      piezaId = ((candidatas ?? []) as { id: string }[]).find((c) => !usadas.has(c.id))?.id ?? null
    }
    if (!piezaId) {
      // Su receta aun no tiene pieza: el hueco espera y se publica en cuanto la
      // haya. Los siguientes no se adelantan por eso.
      esperando++
      continue
    }
    const { data: pieza } = await supabase.from("studio_pieces").select("payload").eq("id", piezaId).maybeSingle()
    const payload = ((pieza as { payload?: Record<string, unknown> } | null)?.payload ?? {}) as {
      caption?: string
      hashtags?: string[]
      imagenes?: string[]
    }
    const imagenes = payload.imagenes ?? []
    if (imagenes.length === 0) {
      errores.push(`Hueco ${hueco.slot + 1} (${hueco.receta.name}): la pieza no tiene imágenes.`)
      usadas.add(piezaId)
      continue
    }

    for (const red of pendientes) {
      // Reclamo: insertar el hueco (unico por dia, hueco y red) o retomar uno
      // con error. Si otra pasada se adelanto, no se toca.
      const previa = suyas.find((x) => x.red === red)
      let filaId: string | null = null
      if (!previa) {
        const { data: nueva } = await supabase
          .from("studio_publications")
          .insert({ account_id: accountId, piece_id: piezaId, recipe_id: hueco.receta.id, dia, slot: hueco.slot, red, status: "programando", due_at: now.toISOString(), intentos: 1 })
          .select("id")
          .maybeSingle()
        filaId = (nueva as { id: string } | null)?.id ?? null
      } else {
        const { data: retomada } = await supabase
          .from("studio_publications")
          .update({ status: "programando", intentos: previa.intentos + 1, due_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("id", previa.id)
          .eq("status", "error")
          .select("id")
          .maybeSingle()
        filaId = (retomada as { id: string } | null)?.id ?? null
      }
      if (!filaId) continue

      const r = await publicarEnRed(accountId, red, { texto: textoDelPost(payload), imagenes })
      await supabase
        .from("studio_publications")
        .update(
          r.ok
            ? { status: "publicada", buffer_post_id: r.postId, error: null, updated_at: new Date().toISOString() }
            : { status: "error", error: r.error.slice(0, 500), updated_at: new Date().toISOString() }
        )
        .eq("id", filaId)
      if (r.ok) publicadas++
      else errores.push(`Hueco ${hueco.slot + 1} (${hueco.receta.name}, ${red}): ${r.error}`)
    }
    if (publicadas) {
      await supabase.from("studio_pieces").update({ status: "published", published_at: now.toISOString() }).eq("id", piezaId).neq("status", "published")
    }
    // Un hueco por pasada: si habia varios atrasados, el siguiente sale en la
    // proxima (cinco minutos), no en el mismo minuto.
    break
  }

  return { activo: true, dia, huecos: plan.length, publicadas, esperando, errores }
}
