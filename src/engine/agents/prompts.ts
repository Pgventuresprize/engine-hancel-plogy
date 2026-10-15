import { ANALISIS_SYSTEM } from "../content/analisis"
import { ANGULO_SYSTEM, INSTAGRAM_SYSTEM, LINKEDIN_SYSTEM } from "../content/agentes"
import { REDACCION_SYSTEM } from "../redaccion/agente"
import { ajustesDe, type Agente } from "./settings"

/**
 * El prompt con el que trabaja cada agente.
 *
 * El del codigo es el valor por defecto y sigue versionado en git, que es donde
 * se puede revisar por que dice lo que dice. La base solo guarda el prompt
 * cuando alguien lo cambia de verdad; mientras no se toque, la fila no existe y
 * las mejoras que vengan en un despliegue llegan solas.
 *
 * El precio es que un prompt editado se queda anclado: si luego se corrige el
 * del codigo, esa cuenta no lo recibe. Es lo correcto —lo escrito a mano manda
 * sobre lo de fabrica— pero conviene saberlo, y por eso la interfaz enseña
 * cuando el prompt esta editado y deja volver al de fabrica.
 */

/** Los agentes que hablan con Claude. Extraccion y publicacion no tienen prompt. */
export const AGENTES_CON_PROMPT = ["analisis", "angulo", "instagram", "linkedin", "redaccion"] as const
export type AgenteConPrompt = (typeof AGENTES_CON_PROMPT)[number]

export const PROMPT_DE_FABRICA: Record<AgenteConPrompt, string> = {
  analisis: ANALISIS_SYSTEM,
  angulo: ANGULO_SYSTEM,
  instagram: INSTAGRAM_SYSTEM,
  linkedin: LINKEDIN_SYSTEM,
  redaccion: REDACCION_SYSTEM,
}

export function tienePrompt(agent: Agente): agent is AgenteConPrompt {
  return (AGENTES_CON_PROMPT as readonly string[]).includes(agent)
}

/** El prompt que se va a usar: el editado si lo hay, si no el de fabrica. */
export async function promptDe(accountId: string, agent: AgenteConPrompt): Promise<string> {
  const ajustes = await ajustesDe(accountId, agent)
  const editado = ajustes.prompt?.trim()
  return editado && editado.length > 0 ? editado : PROMPT_DE_FABRICA[agent]
}
