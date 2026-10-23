import { armarPrompt, bloqueMarca, type AgenteConMarca, type DatosDeMarca } from "./bloque"
import type { Ejemplo } from "./ejemplos-modelo"
import type { TipoFigura } from "./figuras"
import type { TipoDelKit } from "./kit-modelo"
import { bloqueSkills, type Skill } from "./skills-modelo"

/**
 * Todo lo de la marca que entra en un prompt, y el prompt armado con ello.
 * Puro: lo usan el motor y la pantalla de "Ver prompt final" con los mismos
 * datos.
 */

export type DatosParaPrompt = DatosDeMarca & {
  skills: Skill[]
  /** Piezas de la marca que salieron bien. Las elige el armador por piezas. */
  ejemplos?: Ejemplo[]
  /**
   * La plantilla del carrusel dibuja listas numeradas (la de Plogy). Solo
   * entonces el formato de respuesta le ofrece al agente laminas de pasos: en
   * la clasica una lista no se veria.
   */
  listas?: boolean
  /**
   * Los tipos de lamina del kit de diseño activo, con lo que cabe en cada uno.
   * Sin kit, el carrusel se escribe como siempre.
   */
  kit?: TipoDelKit[]
  /** Las figuras que sabe dibujar ese kit (barras, tabla, niveles...). */
  figuras?: TipoFigura[]
}

export function promptArmado(
  datos: DatosParaPrompt,
  agente: AgenteConMarca,
  oficio: string,
  contrato: string
): string {
  return armarPrompt({
    oficio,
    marca: bloqueMarca(datos, agente),
    skills: bloqueSkills(datos.skills, agente),
    contrato,
  })
}
