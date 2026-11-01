import { tituloProvisional } from "@/lib/chat-titulo"

import { supabaseAdmin } from "../supabase-admin"
import { escribirMensaje, type AgenteChat, type NoticiaAdjunta } from "./mensajes"
import { empezarTrabajos, reanudarConversacion, type RedChat } from "./trabajos"

/**
 * Lo que pasa cuando alguien le escribe al equipo desde el chat.
 *
 * El coordinador reparte: deja su linea en gris ("Se lo paso a Instagram y
 * despues a LinkedIn") y encola las piezas en orden con los trabajos del chat.
 * Las piezas las hacen los buzones de siempre; quien llama dispara la pasada
 * con las redes que devuelve, o el trabajo esperaria al cron.
 *
 * Conversar con los agentes (responder, cambiar una pieza) es la fase 1E: hasta
 * entonces el coordinador lo dice en claro en vez de fingir que lo hizo.
 */

export type Pedido = {
  accountId: string
  /** Quien escribe: se guarda en el mensaje y el nombre se resuelve al leerlo. */
  usuarioId: string
  texto: string
  noticia: NoticiaAdjunta | null
  /** Lo elegido en "¿Quien trabaja?". El coordinador va siempre. */
  agentes: ("instagram" | "linkedin" | "revisor")[]
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

/** Una conversacion nueva desde la portada. Devuelve su id y las redes a disparar. */
export async function crearConversacion(p: Pedido): Promise<{ conversacionId: string; disparar: RedChat[] }> {
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
  })
  const disparar = await repartir(p, conversacionId, mensaje.id)
  return { conversacionId, disparar }
}

/** La linea del coordinador y los trabajos de un pedido con noticia. */
async function repartir(p: Pedido, conversacionId: string, mensajeId: string): Promise<RedChat[]> {
  const ruta = (contenido: string) =>
    escribirMensaje({ accountId: p.accountId, conversacionId, rol: "ruta", agente: "coordinador", contenido })

  if (!p.noticia) {
    await ruta(
      "Para armar una pieza, adjunta una noticia con ángulo decidido con **Adjuntar noticia**. " +
        "Conversar conmigo sin noticia llega en el siguiente paso."
    )
    return []
  }

  const conRevisor = p.agentes.includes("revisor")
  let redes = (["instagram", "linkedin"] as const).filter((r) => p.agentes.includes(r))

  if (!redes.length && !conRevisor) {
    await ruta("Entendido. Lo dejo anotado para el equipo.")
    return []
  }

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

/** Un mensaje en una conversacion abierta. Devuelve las redes a disparar. */
export async function seguirConversacion(p: {
  accountId: string
  conversacionId: string
  usuarioId: string
  texto: string
}): Promise<{ disparar: RedChat[] }> {
  const supabase = supabaseAdmin()
  const { data: conv } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("id", p.conversacionId)
    .eq("account_id", p.accountId)
    .is("borrada_at", null)
    .maybeSingle()
  if (!conv) throw new Error("Esa conversación no existe o está en la papelera.")

  await escribirMensaje({ accountId: p.accountId, conversacionId: p.conversacionId, rol: "usuario", autor: p.usuarioId, contenido: p.texto })
  const ruta = (contenido: string) =>
    escribirMensaje({ accountId: p.accountId, conversacionId: p.conversacionId, rol: "ruta", agente: "coordinador", contenido })

  const { count } = await supabase
    .from("chat_trabajos")
    .select("id", { count: "exact", head: true })
    .eq("conversacion_id", p.conversacionId)
    .eq("estado", "detenido")
  const detenidos = count ?? 0

  if (detenidos && SIGUE.test(p.texto)) {
    await ruta("Retomo donde quedó.")
    return reanudarConversacion(p.accountId, p.conversacionId)
  }
  await ruta(
    detenidos
      ? "Anotado. Lo que detuviste sigue detenido: escribe **sigue** cuando quieras retomarlo. Responder y aplicar cambios desde aquí llega en el siguiente paso."
      : "Anotado. Responder y aplicar cambios desde aquí llega en el siguiente paso. Para otra pieza, empieza una conversación nueva y adjunta la noticia."
  )
  return { disparar: [] }
}
