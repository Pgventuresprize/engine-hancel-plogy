import { promptArmado, type DatosParaPrompt } from "./armado"
import type { AgenteConMarca } from "./bloque"
import { identidadEditorial } from "./editorial"
import { perfilDe } from "./perfil"
import { skillsDe } from "./skills"

export * from "./bloque"
export * from "./armado"

/** Lo que la marca ha escrito, leido de una vez para armar uno o varios prompts. */
export async function datosParaPrompt(accountId: string): Promise<DatosParaPrompt> {
  const [perfil, editorial, skills] = await Promise.all([
    perfilDe(accountId),
    identidadEditorial(accountId),
    // Las skills son un extra: si no se pueden leer, el agente trabaja con su
    // oficio y su marca en vez de no trabajar. Queda en el log.
    skillsDe(accountId).catch((e) => {
      console.error("[marca] No se pudieron leer las skills:", e instanceof Error ? e.message : e)
      return []
    }),
  ])
  return { perfil, editorial, skills }
}

/**
 * El prompt completo de un agente para una cuenta: su oficio (el de fabrica o
 * el editado), el bloque de su marca, sus skills y el contrato.
 *
 * Se lee la marca en cada llamada y no se guarda en ningun sitio: lo que la
 * marca cambia en Configuracion > Marca vale desde la siguiente pieza.
 */
export async function promptConMarca(
  accountId: string,
  agente: AgenteConMarca,
  oficio: string,
  contrato: string
): Promise<string> {
  return promptArmado(await datosParaPrompt(accountId), agente, oficio, contrato)
}
