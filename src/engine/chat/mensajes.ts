import { supabaseAdmin } from "../supabase-admin"

/**
 * Los mensajes del chat con los agentes (tabla mensajes, migracion
 * 2026-10-31-chat). Escribir un mensaje tambien toca su conversacion: la sube
 * en la lista (updated_at) y suma al agente que habla a los que participaron.
 */

/** Los agentes que hablan en el chat. Los colores y nombres viven en la interfaz. */
export type AgenteChat = "coordinador" | "instagram" | "linkedin" | "revisor"

export type RolMensaje = "usuario" | "agente" | "ruta"

/** La noticia adjunta a un mensaje: lo que enseña su ficha en el chat. */
export type NoticiaAdjunta = { angleId: string; newsId: string; titulo: string; puntaje: number | null; fuente: string | null }

/** Un componente marcado en la pieza (ver MARCAS.md, "La pieza al lado del chat"). */
export type Seleccion = {
  pieceId: string
  red?: "instagram" | "linkedin"
  /** La lamina (1 es la portada); en un post, el parrafo. */
  lamina: number
  /** La direccion estable si la hay: data-campo, data-hueco o "parrafo". Null: la lamina entera. */
  campo: string | null
  /** En un hueco de lista, el elemento (1 es el primero). */
  item?: number | null
  /** El HTML recortado del elemento, para que el agente sepa que es. */
  html: string
  /** El texto que se ve en lo marcado. */
  texto?: string
  /** Lo que ve la persona: "L1 · Titular". */
  etiqueta: string
}

/** Lo que un mensaje enseña como tarjeta: una pieza lista, en una version. */
export type ReferenciaPieza = {
  tipo: "pieza"
  pieceId: string
  red: "instagram" | "linkedin"
  titulo: string
  meta: string
  version: number | null
}

/** Una pagina de donde salio lo que dice el mensaje. */
export type ReferenciaFuente = { tipo: "fuente"; url: string; titulo: string; medio: string }

/** Posts ya hechos que la persona subio con este mensaje. */
export type ReferenciaLote = { tipo: "lote"; piezas: string[]; fuera: { nombre: string; motivo: string }[] }

/**
 * La propuesta de cuando sale cada post. Vive en el mensaje porque es lo que la
 * persona vio: confirmar programa exactamente esto, no algo recalculado.
 */
export type ReferenciaPlan = {
  tipo: "plan"
  estado: "propuesto" | "programado"
  filas: {
    pieceId: string
    titulo: string
    dia: string
    hora: string
    captionEscrito: boolean
    /** La version propuesta: si la pieza cambia, confirmar no la aprueba. */
    cambiado?: string | null
    /** El que escribio el agente, para leerlo antes de confirmar. */
    caption?: string
  }[]
  fuera: { pieceId: string; titulo: string; motivo: string }[]
}

export type Referencia = ReferenciaPieza | ReferenciaFuente | ReferenciaLote | ReferenciaPlan

export type Mensaje = {
  id: string
  conversacion_id: string
  rol: RolMensaje
  agente: AgenteChat | null
  autor: string | null
  contenido: string
  noticia: NoticiaAdjunta | null
  agentes_pedidos: AgenteChat[] | null
  selecciones: Seleccion[]
  referencias: Referencia[]
  created_at: string
}

export type NuevoMensaje = {
  accountId: string
  conversacionId: string
  rol: RolMensaje
  agente?: AgenteChat | null
  autor?: string | null
  contenido: string
  noticia?: NoticiaAdjunta | null
  agentesPedidos?: AgenteChat[] | null
  selecciones?: Seleccion[]
  referencias?: Referencia[]
  uso?: unknown
}

export async function escribirMensaje(m: NuevoMensaje): Promise<Mensaje> {
  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from("mensajes")
    .insert({
      conversacion_id: m.conversacionId,
      account_id: m.accountId,
      rol: m.rol,
      agente: m.agente ?? null,
      autor: m.autor ?? null,
      contenido: m.contenido,
      noticia: m.noticia ?? null,
      agentes_pedidos: m.agentesPedidos ?? null,
      selecciones: m.selecciones ?? [],
      referencias: m.referencias ?? [],
      uso: m.uso ?? null,
    })
    .select("*")
    .single()
  if (error) throw new Error(`No se pudo guardar el mensaje: ${error.message}`)

  const { data: conv } = await supabase
    .from("conversaciones")
    .select("agentes")
    .eq("id", m.conversacionId)
    .eq("account_id", m.accountId)
    .maybeSingle()
  const agentes = ((conv as { agentes: string[] } | null)?.agentes ?? []) as string[]
  await supabase
    .from("conversaciones")
    .update({
      updated_at: new Date().toISOString(),
      ...(m.agente && !agentes.includes(m.agente) ? { agentes: [...agentes, m.agente] } : {}),
    })
    .eq("id", m.conversacionId)
    .eq("account_id", m.accountId)

  return data as Mensaje
}
