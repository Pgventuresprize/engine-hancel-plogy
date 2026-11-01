import "server-only"

import type { AgenteChat, Mensaje, NoticiaAdjunta } from "@/engine/chat/mensajes"
import type { TrabajoChat } from "@/engine/chat/trabajos"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { nombreDe } from "@/lib/chat-nombre"
import type { EstadoChat, FilaConversacion, Hilo, MensajeUI, TrabajoUI } from "@/lib/chat-tipos"

/**
 * Lo que lee la pantalla del chat. Todo acotado a la cuenta: las tablas tienen
 * RLS sin politicas y el filtro lo pone el codigo, como en el resto.
 */

type FilaDb = {
  id: string
  titulo: string
  guardada: boolean
  agentes: string[] | null
  created_at: string
  updated_at: string
  borrada_at: string | null
}

const CAMPOS_CONVERSACION = "id, titulo, guardada, agentes, created_at, updated_at, borrada_at"

function aFila(f: FilaDb, ocupado: AgenteChat | null): FilaConversacion {
  return {
    id: f.id,
    titulo: f.titulo,
    guardada: f.guardada,
    agentes: (f.agentes ?? []) as AgenteChat[],
    creada: f.created_at,
    actualizada: f.updated_at,
    ocupado,
    borrada: f.borrada_at,
  }
}

/** Las conversaciones de la marca y su papelera, con quien esta trabajando en cada una. */
export async function conversacionesDe(accountId: string): Promise<Pick<EstadoChat, "conversaciones" | "papelera">> {
  const supabase = supabaseAdmin()
  const [{ data, error }, { data: activos }] = await Promise.all([
    supabase
      .from("conversaciones")
      .select(CAMPOS_CONVERSACION)
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase
      .from("chat_trabajos")
      .select("conversacion_id, agente, estado, created_at")
      .eq("account_id", accountId)
      .in("estado", ["espera", "trabajando"])
      .order("created_at"),
  ])
  if (error) throw new Error(`No se pudieron leer las conversaciones: ${error.message}`)

  // El que trabaja manda sobre el que espera: es el que se ve en la tarjeta.
  const ocupado = new Map<string, AgenteChat>()
  const filas = (activos ?? []) as { conversacion_id: string; agente: AgenteChat; estado: string }[]
  for (const t of filas) if (t.estado === "trabajando" && !ocupado.has(t.conversacion_id)) ocupado.set(t.conversacion_id, t.agente)
  for (const t of filas) if (!ocupado.has(t.conversacion_id)) ocupado.set(t.conversacion_id, t.agente)

  const todas = (data ?? []) as FilaDb[]
  return {
    conversaciones: todas.filter((f) => !f.borrada_at).map((f) => aFila(f, ocupado.get(f.id) ?? null)),
    papelera: todas
      .filter((f) => f.borrada_at)
      .sort((a, b) => (b.borrada_at ?? "").localeCompare(a.borrada_at ?? ""))
      .map((f) => aFila(f, null)),
  }
}

/** Una conversacion abierta: sus mensajes y las tarjetas de trabajo que siguen vivas. */
export async function hiloDe(accountId: string, conversacionId: string): Promise<Hilo | null> {
  const supabase = supabaseAdmin()
  const [{ data: conv }, { data: mensajes, error }, { data: trabajos }] = await Promise.all([
    supabase.from("conversaciones").select(CAMPOS_CONVERSACION).eq("id", conversacionId).eq("account_id", accountId).maybeSingle(),
    supabase
      .from("mensajes")
      .select("*")
      .eq("conversacion_id", conversacionId)
      .eq("account_id", accountId)
      .order("created_at")
      .limit(500),
    supabase.from("chat_trabajos").select("*").eq("conversacion_id", conversacionId).eq("account_id", accountId).order("created_at"),
  ])
  if (!conv || (conv as FilaDb).borrada_at) return null
  if (error) throw new Error(`No se pudieron leer los mensajes: ${error.message}`)

  const todos = (trabajos ?? []) as TrabajoChat[]
  const porId = new Map(todos.map((t) => [t.id, t]))
  const vivos: TrabajoUI[] = todos
    .filter((t) => t.estado === "espera" || t.estado === "trabajando" || t.estado === "detenido")
    .map((t) => {
      const antes = t.despues_de ? porId.get(t.despues_de) : undefined
      return {
        id: t.id,
        agente: t.agente,
        estado: t.estado as TrabajoUI["estado"],
        esperaA: t.estado === "espera" && antes && (antes.estado === "espera" || antes.estado === "trabajando") ? antes.agente : null,
        paso: t.paso,
        total: t.total,
        etiqueta: t.etiqueta ?? "",
        unidad: t.unidad ?? "Paso",
        creado: t.created_at,
      }
    })
  const ocupado = vivos.find((t) => t.estado === "trabajando")?.agente ?? vivos.find((t) => t.estado === "espera")?.agente ?? null

  // Las miniaturas: la portada de cada carrusel que el hilo enseña como tarjeta.
  const lista = (mensajes ?? []) as Mensaje[]
  const piezas = [...new Set(lista.flatMap((m) => (m.referencias ?? []).filter((r) => r.red === "instagram").map((r) => r.pieceId)))]
  const portada = new Map<string, string>()
  if (piezas.length) {
    const { data: filas } = await supabase.from("content_pieces").select("id, payload").eq("account_id", accountId).in("id", piezas)
    for (const f of (filas ?? []) as { id: string; payload: { images?: unknown } | null }[]) {
      const imagenes = f.payload?.images
      if (Array.isArray(imagenes) && typeof imagenes[0] === "string") portada.set(f.id, imagenes[0])
    }
  }

  // Quien escribio cada mensaje se guarda por id; el nombre se pone al leer.
  const autores = new Map<string, string>()
  await Promise.all(
    [...new Set(lista.filter((m) => m.rol === "usuario" && m.autor).map((m) => m.autor as string))].map(async (id) => {
      const { data } = await supabase.auth.admin.getUserById(id)
      if (data.user) autores.set(id, nombreDe(data.user))
    })
  )

  return {
    conversacion: aFila(conv as FilaDb, ocupado),
    mensajes: lista.map(
      (m): MensajeUI => ({
        id: m.id,
        rol: m.rol,
        agente: m.agente,
        autor: m.autor ? (autores.get(m.autor) ?? "Alguien del equipo") : null,
        contenido: m.contenido,
        noticia: m.noticia,
        referencias: (m.referencias ?? []).map((r) => ({ ...r, miniatura: portada.get(r.pieceId) ?? null })),
        creado: m.created_at,
      })
    ),
    trabajos: vivos,
  }
}

/**
 * Las noticias que se pueden adjuntar: las que ya tienen angulo decidido y
 * aun no tienen pieza, de mejor a peor puntaje.
 */
export async function noticiasConAngulo(accountId: string): Promise<NoticiaAdjunta[]> {
  const { data, error } = await supabaseAdmin()
    .from("content_angles")
    .select("id, raw_news_id, created_at, raw_news (id, title, source, relevance_score)")
    .eq("account_id", accountId)
    .eq("status", "angled")
    .order("created_at", { ascending: false })
    .limit(60)
  if (error) throw new Error(`No se pudieron leer las noticias con ángulo: ${error.message}`)

  type Fila = { id: string; raw_news_id: string; raw_news: { id: string; title: string | null; source: string | null; relevance_score: number | null } | null }
  // Una noticia puede tener mas de un angulo: se queda el mas reciente.
  const vistas = new Set<string>()
  const noticias: NoticiaAdjunta[] = []
  for (const f of (data ?? []) as unknown as Fila[]) {
    if (!f.raw_news || vistas.has(f.raw_news_id)) continue
    vistas.add(f.raw_news_id)
    noticias.push({
      angleId: f.id,
      newsId: f.raw_news_id,
      titulo: f.raw_news.title ?? "Noticia sin título",
      puntaje: f.raw_news.relevance_score === null ? null : Number(f.raw_news.relevance_score),
      fuente: f.raw_news.source,
    })
  }
  return noticias.sort((a, b) => (b.puntaje ?? -1) - (a.puntaje ?? -1)).slice(0, 12)
}

/** Lo que pide la pantalla cada vez: la lista, la papelera y, si hay una abierta, su hilo. */
export async function estadoChat(accountId: string, conversacionId: string | null): Promise<EstadoChat> {
  const [listas, hilo] = await Promise.all([
    conversacionesDe(accountId),
    conversacionId ? hiloDe(accountId, conversacionId) : Promise.resolve(null),
  ])
  return { ...listas, hilo }
}
