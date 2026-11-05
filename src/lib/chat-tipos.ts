import type { AgenteChat, NoticiaAdjunta, ReferenciaFuente, ReferenciaPieza, RolMensaje, Seleccion } from "@/engine/chat/mensajes"
import type { PiezaVista, VersionVista } from "@/engine/chat/piezas"
import type { EstadoTrabajo } from "@/engine/chat/trabajos"

/**
 * Lo que viaja entre el servidor y la pantalla del chat (chat.html). Solo
 * datos planos: la pantalla los pinta y agrupa, el servidor los lee y escribe.
 */

export type { AgenteChat, NoticiaAdjunta, PiezaVista, ReferenciaFuente, VersionVista }

/** Algo marcado en la pieza del panel: va con el siguiente mensaje. */
export type Marca = Seleccion

/** Los agentes que se eligen en "¿Quién trabaja?". El coordinador va siempre. */
export type AgenteElegible = "instagram" | "linkedin" | "revisor"

export type FilaConversacion = {
  id: string
  titulo: string
  guardada: boolean
  agentes: AgenteChat[]
  creada: string
  actualizada: string
  /** El agente que esta trabajando ahora: el punto que late en la lista. */
  ocupado: AgenteChat | null
  /** Solo en la papelera: cuando se borro. */
  borrada: string | null
}

export type ReferenciaUI = ReferenciaPieza & {
  /** La portada del carrusel, para la miniatura de la tarjeta. */
  miniatura: string | null
}

/** Los posts subidos con un mensaje. */
export type LoteUI = { posts: number; miniaturas: string[]; fuera: { nombre: string; motivo: string }[] }

/** La propuesta de cuando sale cada post. Solo la ultima de la conversacion se puede confirmar. */
export type PlanUI = {
  estado: "propuesto" | "programado"
  vigente: boolean
  filas: { pieceId: string; titulo: string; dia: string; hora: string; captionEscrito: boolean; miniatura: string | null }[]
  fuera: { pieceId: string; titulo: string; motivo: string }[]
}

export type MensajeUI = {
  id: string
  rol: RolMensaje
  agente: AgenteChat | null
  autor: string | null
  contenido: string
  noticia: NoticiaAdjunta | null
  referencias: ReferenciaUI[]
  /** De donde salio lo que dice el mensaje, si investigo. */
  fuentes: ReferenciaFuente[]
  /** Lo que marco en la pieza para este pedido: "L1 · Titulo". */
  marcas: string[]
  lote: LoteUI | null
  plan: PlanUI | null
  creado: string
}

/** Una tarjeta de trabajo: lo que un agente esta haciendo, espera o dejo detenido. */
export type TrabajoUI = {
  id: string
  /** De que va, cuando un pedido tiene varias piezas. */
  titulo: string | null
  agente: "instagram" | "linkedin" | "revisor"
  estado: Extract<EstadoTrabajo, "espera" | "trabajando" | "detenido">
  /** A quien espera, si esta en espera: "LinkedIn espera a que Instagram termine". */
  esperaA: "instagram" | "linkedin" | "revisor" | null
  paso: number
  total: number
  etiqueta: string
  unidad: string
  creado: string
}

export type Hilo = {
  conversacion: FilaConversacion
  mensajes: MensajeUI[]
  trabajos: TrabajoUI[]
}

export type EstadoChat = {
  conversaciones: FilaConversacion[]
  papelera: FilaConversacion[]
  hilo: Hilo | null
}

/** Dias que una conversacion pasa en la papelera antes de borrarse sola. */
export const DIAS_PAPELERA = 15
