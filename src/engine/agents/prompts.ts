import { ANALISIS_CONTRATO, ANALISIS_OFICIO } from "../content/analisis"
import {
  ANGULO_CONTRATO,
  ANGULO_OFICIO,
  INSTAGRAM_CONTRATO,
  INSTAGRAM_OFICIO,
  LINKEDIN_CONTRATO,
  LINKEDIN_OFICIO,
} from "../content/agentes"
import { promptConMarca } from "../marca/prompt"
import { REDACCION_CONTRATO, REDACCION_OFICIO } from "../redaccion/agente"
import { ajustesDe, type Agente } from "./settings"

/**
 * El prompt con el que trabaja cada agente.
 *
 * Se arma por capas, en este orden: el oficio (como se hace el trabajo), la
 * marca (quien escribe y para quien, ver marca/bloque.ts) y el contrato (el
 * JSON exacto que el motor sabe leer). Lo que una cuenta puede editar es el
 * oficio; la marca se edita en Configuracion > Marca y el contrato no se toca,
 * porque si cambia, la pieza no se puede guardar.
 *
 * El oficio del codigo es el valor por defecto y sigue versionado en git, que
 * es donde se puede revisar por que dice lo que dice. La base solo lo guarda
 * cuando alguien lo cambia de verdad; mientras no se toque, la fila no existe y
 * las mejoras que vengan en un despliegue llegan solas.
 *
 * El precio es que un oficio editado se queda anclado: si luego se corrige el
 * del codigo, esa cuenta no lo recibe. Es lo correcto —lo escrito a mano manda
 * sobre lo de fabrica— pero conviene saberlo, y por eso la interfaz enseña
 * cuando esta editado y deja volver al de fabrica.
 */

/** Los agentes que hablan con Claude. Extraccion y publicacion no tienen prompt. */
export const AGENTES_CON_PROMPT = ["analisis", "angulo", "instagram", "linkedin", "redaccion"] as const
export type AgenteConPrompt = (typeof AGENTES_CON_PROMPT)[number]

/** El oficio de fabrica: lo que se ve y se edita en la ficha del agente. */
export const PROMPT_DE_FABRICA: Record<AgenteConPrompt, string> = {
  analisis: ANALISIS_OFICIO,
  angulo: ANGULO_OFICIO,
  instagram: INSTAGRAM_OFICIO,
  linkedin: LINKEDIN_OFICIO,
  redaccion: REDACCION_OFICIO,
}

export const CONTRATO: Record<AgenteConPrompt, string> = {
  analisis: ANALISIS_CONTRATO,
  angulo: ANGULO_CONTRATO,
  instagram: INSTAGRAM_CONTRATO,
  linkedin: LINKEDIN_CONTRATO,
  redaccion: REDACCION_CONTRATO,
}

export function tienePrompt(agent: Agente): agent is AgenteConPrompt {
  return (AGENTES_CON_PROMPT as readonly string[]).includes(agent)
}

/** El oficio que se va a usar: el editado si lo hay, si no el de fabrica. */
export async function oficioDe(accountId: string, agent: AgenteConPrompt): Promise<string> {
  const ajustes = await ajustesDe(accountId, agent)
  const editado = ajustes.prompt?.trim()
  return editado && editado.length > 0 ? editado : PROMPT_DE_FABRICA[agent]
}

/** El prompt completo que recibe el agente: oficio, marca y contrato. */
export async function promptDe(accountId: string, agent: AgenteConPrompt): Promise<string> {
  return promptConMarca(accountId, agent, await oficioDe(accountId, agent), CONTRATO[agent])
}
