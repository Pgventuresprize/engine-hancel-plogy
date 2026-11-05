import { tituloProvisional } from "@/lib/chat-titulo"

import { supabaseAdmin } from "../supabase-admin"
import { escribirMensaje, type AgenteChat, type NoticiaAdjunta, type Referencia, type Seleccion } from "./mensajes"
import { empezarTrabajos, reanudarConversacion, type RedChat } from "./trabajos"

/**
 * Lo que pasa cuando alguien le escribe al equipo desde el chat.
 *
 * El coordinador reparte: deja su linea en gris ("Se lo paso a Instagram y
 * despues a LinkedIn") y encola las piezas en orden con los trabajos del chat.
 * Las piezas las hacen los buzones de siempre; quien llama dispara la pasada
 * con las redes que devuelve, o el trabajo esperaria al cron.
 *
 * Lo que no es un pedido con noticia lo contesta un agente conversando
 * (conversar.ts), en streaming desde /api/chat/[id]/responder.
 */

export type Pedido = {
  accountId: string
  /** Quien escribe: se guarda en el mensaje y el nombre se resuelve al leerlo. */
  usuarioId: string
  texto: string
  noticia: NoticiaAdjunta | null
  /** Lo elegido en "¿Quien trabaja?". El coordinador va siempre. */
  agentes: ("instagram" | "linkedin" | "revisor")[]
  /** Los posts subidos con el mensaje. */
  referencias?: Referencia[]
}

const NOMBRE: Record<AgenteChat, string> = {
  coordinador: "Coordinador",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  revisor: "Revisor",
}

/** Las redes que ya tienen pieza de un angulo. */
async function redesConPieza(accountId: string, angleId: string): Promise<RedChat[]> {
  const { data } = await supabaseAdmin()
    .from("content_pieces")
    .select("network")
    .eq("account_id", accountId)
    .eq("content_angle_id", angleId)
    .in("network", ["instagram", "linkedin"])
  const redes = new Set(((data ?? []) as { network: RedChat }[]).map((f) => f.network))
  return (["instagram", "linkedin"] as const).filter((r) => redes.has(r))
}

/**
 * Una conversacion nueva desde la portada. Devuelve su id, las redes a
 * disparar y si toca que un agente responda conversando (sin noticia no hay
 * pieza que encolar: se habla).
 */
export async function crearConversacion(p: Pedido): Promise<{ conversacionId: string; disparar: RedChat[]; responder: boolean }> {
  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from("conversaciones")
    .insert({
      account_id: p.accountId,
      creada_por: p.usuarioId,
      titulo: tituloProvisional(p.texto, p.noticia, p.agentes),
      agentes: ["coordinador", ...p.agentes],
    })
    .select("id")
    .single()
  if (error) throw new Error(`No se pudo crear la conversación: ${error.message}`)
  const conversacionId = (data as { id: string }).id

  const mensaje = await escribirMensaje({
    accountId: p.accountId,
    conversacionId,
    rol: "usuario",
    autor: p.usuarioId,
    contenido: p.texto,
    noticia: p.noticia,
    agentesPedidos: p.agentes,
    referencias: p.referencias,
  })
  if (!p.noticia || !p.agentes.length) return { conversacionId, disparar: [], responder: true }
  const disparar = await repartir({ ...p, noticia: p.noticia }, conversacionId, mensaje.id)
  return { conversacionId, disparar, responder: false }
}

/** La linea del coordinador y los trabajos de un pedido con noticia y agentes. */
async function repartir(p: Pedido & { noticia: NoticiaAdjunta }, conversacionId: string, mensajeId: string): Promise<RedChat[]> {
  const ruta = (contenido: string) =>
    escribirMensaje({ accountId: p.accountId, conversacionId, rol: "ruta", agente: "coordinador", contenido })

  const conRevisor = p.agentes.includes("revisor")
  let redes = (["instagram", "linkedin"] as const).filter((r) => p.agentes.includes(r))

  if (!redes.length) {
    // Solo el revisor: mira las piezas que la noticia ya tiene.
    redes = await redesConPieza(p.accountId, p.noticia.angleId)
    if (!redes.length) {
      await ruta("Esa noticia todavía no tiene piezas. Elige **Instagram** o **LinkedIn** para armarlas y el revisor las mira al final.")
      return []
    }
    await ruta("Se lo paso al **Revisor**.")
  } else {
    const quien = redes.map((r) => `**${NOMBRE[r]}**`)
    const linea =
      redes.length === 2
        ? `Se lo paso a ${quien[0]} y después a ${quien[1]}.${conRevisor ? " El revisor mira las dos piezas al final." : ""}`
        : `Se lo paso a ${quien[0]}.${conRevisor ? " El revisor mira la pieza al final." : ""}`
    await ruta(linea)
  }

  const { disparar } = await empezarTrabajos({
    accountId: p.accountId,
    conversacionId,
    mensajeId,
    angleId: p.noticia.angleId,
    redes,
    conRevisor,
  })
  return disparar
}

const SIGUE = /\b(sigue|seguir|segu[ií]|contin[uú]a|continuar|reanuda|reanudar|retoma|retomar|dale)\b/i

/**
 * Un mensaje en una conversacion abierta. "Sigue" con algo detenido lo retoma;
 * lo demas lo contesta un agente conversando (`responder`).
 */
export async function seguirConversacion(p: {
  accountId: string
  conversacionId: string
  usuarioId: string
  texto: string
  /** Lo marcado en el panel de la pieza para este pedido. */
  selecciones?: Seleccion[]
  /** Los posts subidos con el mensaje. */
  referencias?: Referencia[]
}): Promise<{ disparar: RedChat[]; responder: boolean }> {
  const supabase = supabaseAdmin()
  const { data: conv } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("id", p.conversacionId)
    .eq("account_id", p.accountId)
    .is("borrada_at", null)
    .maybeSingle()
  if (!conv) throw new Error("Esa conversación no existe o está en la papelera.")

  await escribirMensaje({ accountId: p.accountId, conversacionId: p.conversacionId, rol: "usuario", autor: p.usuarioId, contenido: p.texto, selecciones: p.selecciones, referencias: p.referencias })

  const { count } = await supabase
    .from("chat_trabajos")
    .select("id", { count: "exact", head: true })
    .eq("conversacion_id", p.conversacionId)
    .eq("estado", "detenido")
  if (count && !p.selecciones?.length && SIGUE.test(p.texto) && p.texto.length < 80) {
    await escribirMensaje({ accountId: p.accountId, conversacionId: p.conversacionId, rol: "ruta", agente: "coordinador", contenido: "Retomo donde quedó." })
    return { ...(await reanudarConversacion(p.accountId, p.conversacionId)), responder: false }
  }
  return { disparar: [], responder: true }
}
