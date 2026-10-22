import { ANALISIS_CONTRATO, ANALISIS_OFICIO } from "../content/analisis"
import {
  ANGULO_CONTRATO,
  ANGULO_OFICIO,
  contratoInstagram,
  contratoLinkedin,
  exigirInstagram,
  INSTAGRAM_OFICIO,
  LINKEDIN_OFICIO,
  PIEZAS_INSTAGRAM,
} from "../content/agentes"
import type { Situacion } from "../marca/cuando"
import type { RedEjemplo } from "../marca/ejemplos-modelo"
import { datosParaPrompt, type DatosParaPrompt } from "../marca/prompt"
import { CRITERIO_CONTRATO, CRITERIO_OFICIO } from "../content/criterio"
import { REVISOR_CONTRATO, REVISOR_OFICIO } from "../content/revisor-claude"
import { REDACCION_CONTRATO, REDACCION_OFICIO } from "../redaccion/agente"
import { armarPorPiezas, textoDelPrompt, type Exigencia, type PiezaDeOficio, type PromptPorPiezas } from "./armador"
import { ajustesDe, type Agente } from "./settings"

/**
 * El prompt con el que trabaja cada agente.
 *
 * Se arma por capas, en este orden: el oficio (como se hace el trabajo), la
 * marca (quien escribe y para quien, ver marca/bloque.ts) y el contrato (el
 * JSON exacto que el motor sabe leer). Lo que una cuenta puede editar es el
 * oficio; la marca se edita en Marca y el contrato no se toca,
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
export const AGENTES_CON_PROMPT = ["analisis", "angulo", "instagram", "linkedin", "criterio", "revisor", "redaccion"] as const
export type AgenteConPrompt = (typeof AGENTES_CON_PROMPT)[number]

/**
 * El oficio de fabrica: lo que se ve y se edita en la ficha del agente. Es el
 * nucleo, lo que va siempre; las piezas que entran solo con algunas piezas
 * (logros, el cierre de cada tipo de CTA) van en PIEZAS_DE_OFICIO, viven en el
 * codigo y le llegan a todas las cuentas, tambien a las que editaron el nucleo.
 */
export const PROMPT_DE_FABRICA: Record<AgenteConPrompt, string> = {
  analisis: ANALISIS_OFICIO,
  angulo: ANGULO_OFICIO,
  instagram: INSTAGRAM_OFICIO,
  linkedin: LINKEDIN_OFICIO,
  criterio: CRITERIO_OFICIO,
  revisor: REVISOR_OFICIO,
  redaccion: REDACCION_OFICIO,
}

/**
 * El de Instagram y el de LinkedIn se arman con los numeros de la marca
 * (laminas, hashtags, emojis): son los mismos con los que el revisor comprueba
 * la pieza, y van aqui y no en el oficio para que un oficio editado no los deje
 * anclados a los de fabrica.
 */
export const CONTRATO: Record<AgenteConPrompt, string | ((datos: DatosParaPrompt) => string)> = {
  analisis: ANALISIS_CONTRATO,
  angulo: ANGULO_CONTRATO,
  instagram: ({ perfil, listas }) => contratoInstagram(perfil, listas === true),
  linkedin: ({ perfil }) => contratoLinkedin(perfil),
  criterio: CRITERIO_CONTRATO,
  revisor: REVISOR_CONTRATO,
  redaccion: REDACCION_CONTRATO,
}

export const PIEZAS_DE_OFICIO: Record<AgenteConPrompt, PiezaDeOficio[]> = {
  analisis: [],
  angulo: [],
  instagram: PIEZAS_INSTAGRAM,
  linkedin: [],
  criterio: [],
  revisor: [],
  redaccion: [],
}

const EXIGENCIAS: Partial<Record<AgenteConPrompt, Exigencia>> = { instagram: exigirInstagram }

/** Los agentes que leen ejemplos, y de que red. */
const RED_DE_EJEMPLOS: Partial<Record<AgenteConPrompt, RedEjemplo>> = { instagram: "instagram", linkedin: "linkedin" }

/**
 * Los agentes que escriben una pieza ya clasificada: los unicos para los que
 * la situacion cambia el prompt. Los demas reciben siempre lo mismo.
 */
export const AGENTES_POR_PIEZA = ["instagram", "linkedin"] as const satisfies readonly AgenteConPrompt[]

export function tienePrompt(agent: Agente): agent is AgenteConPrompt {
  return (AGENTES_CON_PROMPT as readonly string[]).includes(agent)
}

/** El oficio que se va a usar: el editado si lo hay, si no el de fabrica. */
export async function oficioDe(accountId: string, agent: AgenteConPrompt): Promise<string> {
  const ajustes = await ajustesDe(accountId, agent)
  const editado = ajustes.prompt?.trim()
  return editado && editado.length > 0 ? editado : PROMPT_DE_FABRICA[agent]
}

/** El armado puro, con los datos ya leidos: lo usan el motor, el simulador y la cobertura. */
export function armarPromptDe(
  agent: AgenteConPrompt,
  datos: DatosParaPrompt,
  oficioEditado: string | null,
  situacion: Situacion | null,
  semilla?: string,
  tope?: number
): PromptPorPiezas {
  const contrato = CONTRATO[agent]
  return armarPorPiezas({
    datos,
    agente: agent,
    oficio: oficioEditado || PROMPT_DE_FABRICA[agent],
    oficioEditado: Boolean(oficioEditado),
    piezasDeOficio: PIEZAS_DE_OFICIO[agent],
    contrato: typeof contrato === "string" ? contrato : contrato(datos),
    situacion,
    exigir: EXIGENCIAS[agent],
    redEjemplos: RED_DE_EJEMPLOS[agent],
    semilla,
    tope,
  })
}

/**
 * El prompt de una pieza: lo de siempre (oficio, marca, skills de siempre) mas
 * lo que entra por su situacion, y la receta de como se armo. Se lee la marca
 * en cada llamada: lo que cambia en Marca vale desde la
 * siguiente pieza.
 */
export async function promptPara(
  accountId: string,
  agent: AgenteConPrompt,
  situacion: Situacion | null,
  /** El id de la noticia: con el mismo, la pieza recibe siempre los mismos ejemplos. */
  semilla?: string
): Promise<PromptPorPiezas> {
  const [datos, ajustes] = await Promise.all([datosParaPrompt(accountId), ajustesDe(accountId, agent)])
  return armarPromptDe(agent, datos, ajustes.prompt?.trim() || null, situacion, semilla)
}

/** El prompt completo de un agente que no depende de la pieza: oficio, marca, skills y contrato. */
export async function promptDe(accountId: string, agent: AgenteConPrompt): Promise<string> {
  return textoDelPrompt(await promptPara(accountId, agent, null))
}
