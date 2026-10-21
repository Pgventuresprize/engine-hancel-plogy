import { modelosClaude } from "../claude/modelos"
import { MODELOS_DISPONIBLES } from "@/lib/modelos-ia"
import { MODELO_REDACCION } from "../redaccion/agente"
import { MODELO_REVISOR } from "../content/revisor-claude"
import { ajustesDe } from "./settings"
import type { AgenteConPrompt } from "./prompts"

/**
 * El modelo con el que corre cada agente.
 *
 * El modelo se elegia en un bloque aparte, "modelo por paso", que obligaba a
 * saltar de pantalla para cambiar algo que pertenece al agente. Ahora vive con
 * el, pero el valor por defecto sigue siendo el global de siempre: una cuenta
 * que no haya elegido nada corre como corria.
 */
export async function modeloDe(accountId: string, agent: AgenteConPrompt): Promise<string> {
  const ajustes = await ajustesDe(accountId, agent)
  const elegido = ajustes.model?.trim()

  // Un modelo que ya no esta en la lista —retirado, o un id mal escrito a
  // mano— se ignora en vez de reventar la pasada con un 404 de la API.
  if (elegido && MODELOS_DISPONIBLES.some((m) => m.id === elegido)) return elegido

  // La redaccion no tiene modelo global de cuenta: nace con el suyo.
  if (agent === "redaccion") return MODELO_REDACCION
  // El revisor tampoco: nace con Opus, que es quien mejor lee.
  if (agent === "revisor") return MODELO_REVISOR
  return (await modelosClaude(accountId))[agent]
}
