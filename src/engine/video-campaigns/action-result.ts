export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string }

// Solo estos mensajes, redactados para la persona, pueden cruzar al navegador.
export class CampaignActionError extends Error {}

export async function actionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, value: await run() } }
  catch (error) {
    // Next usa excepciones con digest para redirecciones/control del framework.
    if (error && typeof error === "object" && "digest" in error) throw error
    if (error instanceof CampaignActionError) return { ok: false, error: error.message }
    console.error("[vc2] Falló una acción de campaña:", error instanceof Error ? error.message : "error desconocido")
    return { ok: false, error: "No se pudo completar la operación. Vuelve a intentarlo; si persiste, revisaremos el registro del servidor." }
  }
}

export function actionValue<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
