import { pedirPiezaDeAngulo } from "../content/pedir"
import type { Revision } from "../content/revisor"
import { parseEstadoLibre, type PasoLibre } from "../render/kit-libre-pasos"
import { supabaseAdmin } from "../supabase-admin"
import { escribirMensaje, type Referencia } from "./mensajes"

/**
 * Los trabajos del chat: lo que se ve como tarjeta de trabajo mientras un
 * agente crea o revisa una pieza (tabla chat_trabajos).
 *
 * El chat no hace las piezas: las pide a los buzones de siempre
 * (content/pedir.ts) y sigue su avance mirando el buzon, el diseño y la pieza.
 * Los agentes van en orden —"LinkedIn espera a que Instagram termine"— y el
 * revisor dice su dictamen al final, leyendo la revision que ya tiene cada
 * pieza: no gasta otra llamada a Claude.
 *
 * `actualizarTrabajos` lo llaman el tick y la consulta de estado del chat. Es
 * idempotente: cada paso de estado es un compare-and-set, y solo quien lo gana
 * escribe el mensaje, asi que dos llamadas a la vez no lo duplican.
 */

export type RedChat = "instagram" | "linkedin"
export type EstadoTrabajo = "espera" | "trabajando" | "listo" | "detenido" | "fallo"
type Buzon = "jobs_angle" | "jobs_recurso" | "jobs_linkedin" | "jobs_instagram"

export type TrabajoChat = {
  id: string
  account_id: string
  conversacion_id: string
  mensaje_id: string | null
  agente: RedChat | "revisor"
  tipo: "crear" | "editar" | "revisar"
  estado: EstadoTrabajo
  despues_de: string | null
  buzon: Buzon | null
  job_id: string | null
  angle_id: string | null
  piece_id: string | null
  paso: number
  total: number
  etiqueta: string | null
  unidad: string | null
  error: string | null
  created_at: string
  updated_at: string
}

/** Lo que dice la tarjeta de trabajo. */
export type Avance = { paso: number; total: number; etiqueta: string; unidad: string }

const ACTIVOS: EstadoTrabajo[] = ["espera", "trabajando"]

/**
 * Pide las piezas de un angulo, en orden, y deja sus tarjetas. El primero
 * empieza ya; los demas esperan al anterior. Devuelve las redes que se
 * encolaron, para que quien llama dispare una pasada a mano: sin ella el
 * trabajo esperaria al cron de cinco minutos, o para siempre con el agente en
 * manual.
 */
export async function empezarTrabajos(opciones: {
  accountId: string
  conversacionId: string
  mensajeId: string
  angleId: string
  redes: RedChat[]
  conRevisor: boolean
}): Promise<{ trabajos: TrabajoChat[]; disparar: RedChat[] }> {
  const supabase = supabaseAdmin()
  const trabajos: TrabajoChat[] = []
  let anterior: string | null = null
  const orden: (RedChat | "revisor")[] = [...opciones.redes, ...(opciones.conRevisor ? ["revisor" as const] : [])]

  for (const agente of orden) {
    const { data, error }: { data: TrabajoChat | null; error: { message: string } | null } = await supabase
      .from("chat_trabajos")
      .insert({
        account_id: opciones.accountId,
        conversacion_id: opciones.conversacionId,
        mensaje_id: opciones.mensajeId,
        agente,
        tipo: agente === "revisor" ? "revisar" : "crear",
        estado: "espera",
        despues_de: anterior,
        angle_id: opciones.angleId,
        ...avanceInicial(agente),
      })
      .select("*")
      .single()
    if (error) throw new Error(`No se pudo crear el trabajo: ${error.message}`)
    trabajos.push(data as TrabajoChat)
    anterior = (data as TrabajoChat).id
  }

  const disparar: RedChat[] = []
  const primero = trabajos[0]
  if (primero && primero.agente !== "revisor") {
    trabajos[0] = await arrancar(primero)
    if (trabajos[0].estado === "trabajando") disparar.push(primero.agente)
  }
  return { trabajos, disparar }
}

/** Lo que dice la tarjeta antes de empezar. */
function avanceInicial(agente: RedChat | "revisor"): Avance {
  if (agente === "revisor") return { paso: 0, total: 1, etiqueta: "Revisando las piezas", unidad: "Paso" }
  return agente === "instagram"
    ? { paso: 0, total: 4, etiqueta: "Armando el carrusel", unidad: "Paso" }
    : { paso: 0, total: 3, etiqueta: "Escribiendo el post", unidad: "Paso" }
}

/** Encola la pieza de un trabajo en espera y lo pasa a trabajando (o a listo, si ya existia). */
async function arrancar(t: TrabajoChat): Promise<TrabajoChat> {
  if (t.agente === "revisor" || !t.angle_id) return t
  const supabase = supabaseAdmin()
  // Una noticia tiene una pieza por red: si ya existe, pedir otra no haria nada
  // (el indice unico la frena al guardarla). Se enseña la que hay.
  const existente = await piezaDe(t.account_id, t.angle_id, t.agente)
  if (existente) return marcarListo(t, existente)

  try {
    const encolado = await pedirPiezaDeAngulo(t.account_id, t.angle_id, t.agente)
    const { data } = await supabase
      .from("chat_trabajos")
      .update({ estado: "trabajando", buzon: encolado.buzon, job_id: encolado.id, paso: 1, updated_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("estado", "espera")
      .select("*")
      .maybeSingle()
    return (data as TrabajoChat | null) ?? t
  } catch (e) {
    return fallar(t, e instanceof Error ? e.message : String(e))
  }
}

/** La pieza de una red de un angulo, si ya existe. */
async function piezaDe(accountId: string, angleId: string, red: RedChat): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("content_pieces")
    .select("id")
    .eq("account_id", accountId)
    .eq("content_angle_id", angleId)
    .eq("network", red)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

type FilaBuzon = {
  id: string
  status: "pending" | "processing" | "done" | "failed"
  error: string | null
  respuesta: Record<string, unknown> | null
  consumed_at: string | null
  cancelado_at: string | null
  created_at: string
}

/**
 * El trabajo de la cola que hace hoy la pieza. Si la pieza prometia un recurso,
 * primero fue el recurso y despues se encolo la pieza con otro id: por eso se
 * busca por angulo y no solo por el id guardado.
 */
async function buzonDe(t: TrabajoChat): Promise<{ tabla: Buzon; fila: FilaBuzon } | null> {
  if (t.agente === "revisor" || !t.angle_id) return null
  const supabase = supabaseAdmin()
  const tabla: Buzon = t.agente === "instagram" ? "jobs_instagram" : "jobs_linkedin"
  const campos = "id, status, error, respuesta, consumed_at, cancelado_at, created_at"
  const { data: dePieza } = await supabase
    .from(tabla)
    .select(campos)
    .eq("content_angle_id", t.angle_id)
    .gte("created_at", new Date(new Date(t.created_at).getTime() - 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (dePieza) return { tabla, fila: dePieza as FilaBuzon }
  if (t.buzon === "jobs_recurso" && t.job_id) {
    const { data: recurso } = await supabase.from("jobs_recurso").select(campos).eq("id", t.job_id).maybeSingle()
    if (recurso) return { tabla: "jobs_recurso", fila: recurso as FilaBuzon }
  }
  return null
}

const ETIQUETA_LIBRE: Partial<Record<PasoLibre, string>> = {
  fotos: "Eligiendo las fotos",
  disenar: "Diseñando las láminas",
  revisar: "Revisando el diseño",
  corregir: "Corrigiendo el diseño",
  listo: "Dibujando las láminas",
}

/** Donde va el trabajo de una pieza, mirando su buzon. `null`: no se sabe aun. */
export function avanceDeBuzon(agente: RedChat, tabla: Buzon, fila: FilaBuzon): Avance {
  const ig = agente === "instagram"
  const total = ig ? 4 : 3
  if (tabla === "jobs_recurso") return { paso: 1, total, etiqueta: "Escribiendo el recurso que promete el cierre", unidad: "Paso" }
  if (fila.status === "pending") return { paso: 1, total, etiqueta: "En cola", unidad: "Paso" }
  if (fila.status === "processing") return { paso: 2, total, etiqueta: ig ? "Escribiendo el guion" : "Escribiendo el post", unidad: "Paso" }
  // Escrito: el post ya solo espera a guardarse; el carrusel, a diseñarse y dibujarse.
  if (!ig) return { paso: 2, total, etiqueta: "Guardando el post", unidad: "Paso" }
  const libre = parseEstadoLibre(fila.respuesta?.diseno_libre)
  return { paso: 3, total, etiqueta: (libre && ETIQUETA_LIBRE[libre.paso]) || "Dibujando las láminas", unidad: "Paso" }
}

/**
 * Pone al dia los trabajos activos: el avance de los que trabajan, el mensaje
 * de los que terminan y el arranque de los que esperaban. Devuelve las redes
 * recien encoladas, para disparar una pasada.
 */
export async function actualizarTrabajos(filtro: { accountId?: string; conversacionId?: string } = {}): Promise<{ disparar: RedChat[] }> {
  const supabase = supabaseAdmin()
  let q = supabase.from("chat_trabajos").select("*").in("estado", ACTIVOS).order("created_at")
  if (filtro.accountId) q = q.eq("account_id", filtro.accountId)
  if (filtro.conversacionId) q = q.eq("conversacion_id", filtro.conversacionId)
  const { data, error } = await q
  if (error) throw new Error(`No se pudieron leer los trabajos del chat: ${error.message}`)
  const disparar: RedChat[] = []

  for (const t of (data ?? []) as TrabajoChat[]) {
    try {
      if (t.estado === "trabajando") await seguir(t)
      else await soltarSiToca(t, disparar)
    } catch (e) {
      console.error("[chat] No se pudo actualizar el trabajo", t.id, e instanceof Error ? e.message : e)
    }
  }
  return { disparar }
}

async function seguir(t: TrabajoChat): Promise<void> {
  if (t.agente === "revisor" || !t.angle_id) return
  const pieza = await piezaDe(t.account_id, t.angle_id, t.agente)
  if (pieza) {
    await marcarListo(t, pieza)
    return
  }
  const b = await buzonDe(t)
  if (!b) return
  if (b.fila.cancelado_at) return
  if (b.fila.status === "failed") {
    await fallar(t, b.fila.error ?? "El agente no pudo terminar.")
    return
  }
  // Escrito, consumido y sin pieza un buen rato despues: no se pudo guardar.
  if (b.tabla !== "jobs_recurso" && b.fila.consumed_at && Date.now() - new Date(b.fila.consumed_at).getTime() > 10 * 60_000) {
    await fallar(t, "El agente terminó pero la pieza no se pudo guardar. Mira el tablero.")
    return
  }
  const a = avanceDeBuzon(t.agente, b.tabla, b.fila)
  if (a.paso !== t.paso || a.etiqueta !== t.etiqueta) {
    await supabaseAdmin()
      .from("chat_trabajos")
      .update({ ...a, updated_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("estado", "trabajando")
  }
}

/** Arranca un trabajo en espera si el que va antes ya termino. */
async function soltarSiToca(t: TrabajoChat, disparar: RedChat[]): Promise<void> {
  if (t.despues_de) {
    const { data } = await supabaseAdmin().from("chat_trabajos").select("estado").eq("id", t.despues_de).maybeSingle()
    const antes = (data as { estado: EstadoTrabajo } | null)?.estado
    // Sin el anterior (se borro) se sigue; con el anterior activo o detenido, se espera.
    if (antes && antes !== "listo" && antes !== "fallo") return
  }
  if (t.agente === "revisor") {
    await dictaminar(t)
    return
  }
  const arrancado = await arrancar(t)
  if (arrancado.estado === "trabajando") disparar.push(t.agente)
}

/** Pasa el trabajo a listo y, si gana el cambio, escribe el mensaje con la tarjeta. */
async function marcarListo(t: TrabajoChat, pieceId: string): Promise<TrabajoChat> {
  const supabase = supabaseAdmin()
  const total = t.total || avanceInicial(t.agente).total
  const { data } = await supabase
    .from("chat_trabajos")
    .update({ estado: "listo", piece_id: pieceId, paso: total, etiqueta: "Listo", updated_at: new Date().toISOString() })
    .eq("id", t.id)
    .in("estado", ACTIVOS)
    .select("*")
    .maybeSingle()
  if (!data) return t
  if (t.agente !== "revisor") {
    const { texto, referencia } = await anuncioDePieza(t.account_id, pieceId, t.agente)
    await escribirMensaje({
      accountId: t.account_id,
      conversacionId: t.conversacion_id,
      rol: "agente",
      agente: t.agente,
      contenido: texto,
      referencias: [referencia],
    })
    await supabase
      .from("conversacion_piezas")
      .upsert({ conversacion_id: t.conversacion_id, piece_id: pieceId }, { onConflict: "conversacion_id,piece_id", ignoreDuplicates: true })
    await supabase.from("content_pieces").update({ conversacion_id: t.conversacion_id }).eq("id", pieceId).is("conversacion_id", null)
  }
  return data as TrabajoChat
}

async function fallar(t: TrabajoChat, motivo: string): Promise<TrabajoChat> {
  const { data } = await supabaseAdmin()
    .from("chat_trabajos")
    .update({ estado: "fallo", error: motivo.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", t.id)
    .in("estado", ACTIVOS)
    .select("*")
    .maybeSingle()
  if (!data) return t
  if (t.agente !== "revisor") {
    await escribirMensaje({
      accountId: t.account_id,
      conversacionId: t.conversacion_id,
      rol: "agente",
      agente: t.agente,
      contenido: `No pude ${t.agente === "instagram" ? "armar el carrusel" : "escribir el post"}: ${motivo}`,
    })
  }
  return data as TrabajoChat
}

/** Lo que dice el agente al terminar, con la tarjeta de su pieza. */
async function anuncioDePieza(accountId: string, pieceId: string, red: RedChat): Promise<{ texto: string; referencia: Referencia }> {
  const supabase = supabaseAdmin()
  const [{ data: pieza }, { data: ultima }] = await Promise.all([
    supabase.from("content_pieces").select("payload").eq("id", pieceId).eq("account_id", accountId).maybeSingle(),
    supabase.from("pieza_versiones").select("n").eq("piece_id", pieceId).order("n", { ascending: false }).limit(1).maybeSingle(),
  ])
  const payload = ((pieza as { payload: Record<string, unknown> } | null)?.payload ?? {}) as Record<string, unknown>
  const version = (ultima as { n: number } | null)?.n ?? null
  if (red === "instagram") {
    const laminas = Array.isArray(payload.images) ? payload.images.length : 0
    return {
      texto: `Listo el carrusel: ${laminas} láminas.`,
      referencia: { tipo: "pieza", pieceId, red, titulo: "Carrusel · Instagram", meta: `${laminas} láminas · 4:5${version ? ` · v${version}` : ""}`, version },
    }
  }
  const parrafos = typeof payload.body === "string" ? payload.body.split(/\n\s*\n/).filter((p) => p.trim()).length : 0
  return {
    texto: `Listo el post: ${parrafos} ${parrafos === 1 ? "párrafo" : "párrafos"}.`,
    referencia: { tipo: "pieza", pieceId, red, titulo: "Post · LinkedIn", meta: `Borrador${version ? ` · v${version}` : ""}`, version },
  }
}

/**
 * El dictamen del revisor sobre las piezas del mismo pedido. Sale de la
 * revision que cada pieza ya trae al nacer: frenos y avisos con su motivo.
 */
async function dictaminar(t: TrabajoChat): Promise<void> {
  const supabase = supabaseAdmin()
  const { data: hermanos } = await supabase
    .from("chat_trabajos")
    .select("agente, piece_id")
    .eq("mensaje_id", t.mensaje_id ?? "")
    .neq("agente", "revisor")
    .not("piece_id", "is", null)
  const piezas = (hermanos ?? []) as { agente: RedChat; piece_id: string }[]

  const { data: claim } = await supabase
    .from("chat_trabajos")
    .update({ estado: "listo", paso: 1, etiqueta: "Listo", updated_at: new Date().toISOString() })
    .eq("id", t.id)
    .eq("estado", "espera")
    .select("id")
    .maybeSingle()
  if (!claim) return

  if (piezas.length === 0) {
    await escribirMensaje({ accountId: t.account_id, conversacionId: t.conversacion_id, rol: "agente", agente: "revisor", contenido: "No hay piezas que revisar: no salió ninguna." })
    return
  }

  const { data: filas } = await supabase.from("content_pieces").select("id, revision").in("id", piezas.map((p) => p.piece_id))
  const revisionDe = new Map(((filas ?? []) as { id: string; revision: Revision | null }[]).map((f) => [f.id, f.revision]))
  const nombre = (red: RedChat) => (red === "instagram" ? "el carrusel" : "el post")
  const frenos: string[] = []
  let avisos = 0
  for (const p of piezas) {
    const r = revisionDe.get(p.piece_id)
    for (const h of r?.hallazgos ?? []) {
      if (h.nivel === "frena") frenos.push(`${nombre(p.agente)}, ${h.donde}: ${h.detalle}`)
      else avisos++
    }
  }
  const cuales = piezas.length === 1 ? "la pieza" : `las ${piezas.length === 2 ? "dos" : piezas.length} piezas`
  const texto = frenos.length
    ? `Revisé ${cuales}. Frené esto:\n${frenos.slice(0, 4).map((f) => `- ${f}`).join("\n")}${frenos.length > 4 ? `\n- y ${frenos.length - 4} más` : ""}`
    : `Revisé ${cuales}. No frené nada.${avisos ? ` Dejé ${avisos === 1 ? "un aviso" : `${avisos} avisos`} en la ficha.` : ""}`
  await escribirMensaje({ accountId: t.account_id, conversacionId: t.conversacion_id, rol: "agente", agente: "revisor", contenido: texto })
}

/**
 * Detiene lo que esta haciendo una conversacion. El trabajo de la cola se marca
 * consumido y cancelado: la cola ya salta lo consumido en todos sus pasos, y si
 * el agente estaba a mitad, lo que entregue se descarta.
 */
export async function detenerConversacion(accountId: string, conversacionId: string): Promise<number> {
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from("chat_trabajos")
    .update({ estado: "detenido", updated_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("conversacion_id", conversacionId)
    .in("estado", ACTIVOS)
    .select("*")
  const detenidos = (data ?? []) as TrabajoChat[]
  const ahora = new Date().toISOString()
  for (const t of detenidos) {
    const b = await buzonDe(t)
    if (!b || b.fila.consumed_at) continue
    await supabase.from(b.tabla).update({ consumed_at: ahora, cancelado_at: ahora }).eq("id", b.fila.id).is("consumed_at", null)
  }
  return detenidos.length
}

/**
 * "Que siga": devuelve a la cola lo que se detuvo en el ultimo pedido. El primer
 * trabajo vuelve a trabajar con su buzon reabierto; los demas, a esperar.
 */
export async function reanudarConversacion(accountId: string, conversacionId: string): Promise<{ disparar: RedChat[] }> {
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from("chat_trabajos")
    .select("*")
    .eq("account_id", accountId)
    .eq("conversacion_id", conversacionId)
    .eq("estado", "detenido")
    .order("created_at")
  const detenidos = (data ?? []) as TrabajoChat[]
  const disparar: RedChat[] = []
  for (const t of detenidos) {
    const b = await buzonDe(t)
    if (b?.fila.cancelado_at) {
      // A medio procesar quedo 'processing' sin nadie: vuelve a 'pending'.
      await supabase
        .from(b.tabla)
        .update({ consumed_at: null, cancelado_at: null, ...(b.fila.status === "processing" ? { status: "pending", processed_at: null } : {}) })
        .eq("id", b.fila.id)
    }
    const trabajaba = Boolean(b) && t.agente !== "revisor"
    await supabase
      .from("chat_trabajos")
      .update({ estado: trabajaba ? "trabajando" : "espera", updated_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("estado", "detenido")
    if (trabajaba && t.agente !== "revisor") disparar.push(t.agente)
  }
  // Los que esperaban y no tenian buzon arrancan en la siguiente actualizacion.
  const siguiente = await actualizarTrabajos({ accountId, conversacionId })
  return { disparar: [...new Set([...disparar, ...siguiente.disparar])] }
}
