import { estiloDesdeConfig } from "../render/theme"
import { supabaseAdmin } from "../supabase-admin"
import { promptArmado, type DatosParaPrompt } from "./armado"
import { ejemplosDe } from "./ejemplos"
import type { AgenteConMarca } from "./bloque"
import { identidadEditorial } from "./editorial"
import { perfilDe } from "./perfil"
import { skillsDe } from "./skills"

export * from "./bloque"
export * from "./armado"

/** Lo que la marca ha escrito, leido de una vez para armar uno o varios prompts. */
export async function datosParaPrompt(accountId: string): Promise<DatosParaPrompt> {
  const [perfil, editorial, skills, listas, ejemplos] = await Promise.all([
    perfilDe(accountId),
    identidadEditorial(accountId),
    // Las skills son un extra: si no se pueden leer, el agente trabaja con su
    // oficio y su marca en vez de no trabajar. Queda en el log.
    skillsDe(accountId).catch((e) => {
      console.error("[marca] No se pudieron leer las skills:", e instanceof Error ? e.message : e)
      return []
    }),
    plantillaConListas(accountId),
    // Como las skills: sin ejemplos el agente escribe igual, con sus reglas.
    ejemplosDe(accountId).catch((e) => {
      console.error("[marca] No se pudieron leer los ejemplos:", e instanceof Error ? e.message : e)
      return []
    }),
  ])
  return { perfil, editorial, skills, listas, ejemplos }
}

/** Si la plantilla del carrusel de la cuenta dibuja listas. Ante la duda, no. */
async function plantillaConListas(accountId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("generation_config").select("carousel").eq("account_id", accountId).maybeSingle()
  return estiloDesdeConfig((data as { carousel?: unknown } | null)?.carousel).plantilla === "plogy"
}

/**
 * El prompt completo de un agente para una cuenta: su oficio (el de fabrica o
 * el editado), el bloque de su marca, sus skills y el contrato.
 *
 * Se lee la marca en cada llamada y no se guarda en ningun sitio: lo que la
 * marca cambia en Marca vale desde la siguiente pieza.
 */
export async function promptConMarca(
  accountId: string,
  agente: AgenteConMarca,
  oficio: string,
  /** Fijo, o armado con los numeros de la marca (laminas, hashtags, emojis). */
  contrato: string | ((datos: DatosParaPrompt) => string)
): Promise<string> {
  const datos = await datosParaPrompt(accountId)
  return promptArmado(datos, agente, oficio, typeof contrato === "string" ? contrato : contrato(datos))
}
