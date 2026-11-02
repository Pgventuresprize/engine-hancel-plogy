import type { AgenteChat, NoticiaAdjunta, Referencia, RolMensaje } from "@/engine/chat/mensajes"
import type { PiezaVista, VersionVista } from "@/engine/chat/piezas"
import type { EstadoTrabajo } from "@/engine/chat/trabajos"

/**
 * Lo que viaja entre el servidor y la pantalla del chat (chat.html). Solo
 * datos planos: la pantalla los pinta y agrupa, el servidor los lee y escribe.
 */

export type { AgenteChat, NoticiaAdjunta, PiezaVista, VersionVista }

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

export type ReferenciaUI = Referencia & {
  /** La portada del carrusel, para la miniatura de la tarjeta. */
  miniatura: string | null
}

export type MensajeUI = {
  id: string
  rol: RolMensaje
  agente: AgenteChat | null
  autor: string | null
  contenido: string
  noticia: NoticiaAdjunta | null
  referencias: ReferenciaUI[]
  creado: string
}

/** Una tarjeta de trabajo: lo que un agente esta haciendo, espera o dejo detenido. */
export type TrabajoUI = {
  id: string
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
