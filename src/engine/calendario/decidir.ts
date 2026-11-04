/**
 * Que hacer con una pieza programada que llego a su hora.
 *
 * Es una funcion pura para poder probarla sin base ni redes: es la decision mas
 * delicada del calendario y publicar no se deshace. La regla: ante la duda no
 * publica y lo enseña. Perder la hora de un post se arregla; un post doble o uno
 * que una persona freno, no.
 *
 * La misma comprobacion del freno vive en el reclamo atomico (`FRENO_PIEZA` en
 * publish-piece.ts). Esta decide que hacer; aquella es la que garantiza que una
 * lista leida hace un minuto no le gana a una persona.
 */

/** Lo que vencio hace mas de esto no sale solo: una caida no dispara posts a deshora. */
export const VENTANA_MS = 30 * 60_000

/** Tras un cambio de contenido: el texto se guarda antes de terminar de redibujar. */
export const ESPERA_EDICION_MS = 3 * 60_000

export const MAX_INTENTOS = 3

export type PiezaProgramada = {
  id: string
  network: string
  status: string
  carril: string | null
  revision: { frena?: boolean } | null
  programada_para: string
  programada_intentos: number
  programada_revisar: boolean
  contenido_cambiado_at: string | null
}

export type Decision =
  | { accion: "publicar" }
  /** Aun no toca, o se edito hace nada: la siguiente pasada la vuelve a mirar. */
  | { accion: "esperar" }
  | { accion: "frenada"; motivo: string }
  | { accion: "vencida"; motivo: string }
  | { accion: "agotada"; motivo: string }
  | { accion: "revisar"; motivo: string }

/** Solo sale si alguien la aprobo, o si es de la cola general y el revisor no la freno. */
export function sinFreno(p: Pick<PiezaProgramada, "status" | "carril" | "revision">): boolean {
  if (p.status === "approved") return true
  return (p.carril ?? "general") === "general" && (p.revision === null || p.revision.frena === false)
}

export function decidirProgramada(p: PiezaProgramada, now: Date): Decision {
  if (p.programada_revisar) {
    return { accion: "revisar", motivo: "Puede haber salido: míralo en la red antes de volver a publicarla." }
  }

  const hora = new Date(p.programada_para).getTime()
  if (hora > now.getTime()) return { accion: "esperar" }

  if (p.programada_intentos >= MAX_INTENTOS) {
    return { accion: "agotada", motivo: `No se pudo publicar tras ${MAX_INTENTOS} intentos.` }
  }
  if (now.getTime() - hora > VENTANA_MS) {
    return { accion: "vencida", motivo: "No salió a su hora: elige otra fecha o publícala a mano." }
  }
  if (!sinFreno(p)) {
    return {
      accion: "frenada",
      motivo:
        (p.carril ?? "general") === "general"
          ? "El revisor la frenó: apruébala para que salga."
          : "Viene del chat: necesita aprobación para salir.",
    }
  }
  if (p.contenido_cambiado_at && now.getTime() - new Date(p.contenido_cambiado_at).getTime() < ESPERA_EDICION_MS) {
    return { accion: "esperar" }
  }
  return { accion: "publicar" }
}
