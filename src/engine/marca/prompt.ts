import { armarPrompt, bloqueMarca, type AgenteConMarca, type DatosDeMarca } from "./bloque"
import { identidadEditorial } from "./editorial"
import { perfilDe } from "./perfil"

export * from "./bloque"

/** Lo que la marca ha escrito, leido de una vez para armar uno o varios prompts. */
export async function datosParaPrompt(accountId: string): Promise<DatosDeMarca> {
  const [perfil, editorial] = await Promise.all([perfilDe(accountId), identidadEditorial(accountId)])
  return { perfil, editorial }
}

/**
 * El prompt completo de un agente para una cuenta: su oficio (el de fabrica o
 * el editado), el bloque de su marca y el contrato.
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
  const datos = await datosParaPrompt(accountId)
  return armarPrompt({ oficio, marca: bloqueMarca(datos, agente), contrato })
}
