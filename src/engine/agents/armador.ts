import type { DatosParaPrompt } from "../marca/armado"
import { bloqueMarca, TOPE_PROMPT, type AgenteConMarca } from "../marca/bloque"
import { describirSituacion, esSiempre, porQueNoEntra, type Cuando, type Situacion } from "../marca/cuando"
import { bloqueDeSkills, skillsDeAgente, type Skill } from "../marca/skills-modelo"

/**
 * El prompt de una pieza, armado por piezas.
 *
 * Cada pieza del prompt dice cuando entra (ver marca/cuando.ts). El armador mira
 * la situacion de la pieza que se va a escribir y decide que entra, sin IA: con
 * la misma clasificacion sale siempre el mismo prompt.
 *
 * El orden es fijo y tiene un porque:
 *   1. Lo que no cambia entre piezas: el oficio, la marca y las skills que van
 *      siempre. Va primero y aparte (`fijo`) para que Claude lo reaproveche
 *      entre llamadas seguidas en vez de leerlo de nuevo.
 *   2. Lo que entro por condicion: piezas del oficio de fabrica y skills de la
 *      marca, bajo "PARA ESTA PIEZA".
 *   3. El formato de respuesta, siempre al final, que nada lo pisa.
 *
 * Y queda la receta: que entro, que no y por que.
 *
 * Puro y sin base: lo usan el motor, el simulador y la prueba de cobertura con
 * los mismos datos.
 */

export type CapaPrompt = "oficio" | "marca" | "skill" | "formato"

/** Una pieza opcional del oficio de fabrica: vive en el codigo y entra por condicion. */
export type PiezaDeOficio = {
  id: string
  nombre: string
  texto: string
  cuando: Cuando
}

export type Receta = {
  version: 1
  agente: AgenteConMarca
  /** En una linea: "pilar Conocimiento · CTA Palabra clave". */
  situacion: string
  /** La cuenta escribio su propio oficio en la ficha del agente. */
  oficioEditado: boolean
  entro: { capa: CapaPrompt; nombre: string; porCondicion: boolean }[]
  fuera: { capa: CapaPrompt; nombre: string; porque: string }[]
  caracteres: number
  /** Cuanto de eso es la parte fija, la que se reaprovecha entre llamadas. */
  fijo: number
}

export type PromptPorPiezas = { fijo: string; resto: string; receta: Receta }

/** El prompt entero, para enseñarlo o para quien no lo parte. */
export const textoDelPrompt = (p: Pick<PromptPorPiezas, "fijo" | "resto">) =>
  [p.fijo, p.resto].filter((t) => t.trim()).join("\n\n")

/**
 * Lo que un agente no puede dejar de llevar segun su situacion. Devuelve el
 * motivo si falta algo; el prompt entonces no se arma y el trabajo falla con
 * ese motivo, en vez de escribir una pieza con el prompt a medias.
 */
export type Exigencia = (entraron: PiezaDeOficio[], s: Situacion | null) => string | null

export type OpcionesArmado = {
  datos: DatosParaPrompt
  agente: AgenteConMarca
  /** El nucleo del oficio: el de fabrica o el que escribio la cuenta. */
  oficio: string
  oficioEditado: boolean
  piezasDeOficio: PiezaDeOficio[]
  contrato: string
  situacion: Situacion | null
  exigir?: Exigencia
  /** Para la prueba de cobertura; en el motor vale TOPE_PROMPT. */
  tope?: number
}

const CABECERA_POR_PIEZA = (situacion: string) => `# PARA ESTA PIEZA
Esto entra por cómo se clasificó esta pieza (${situacion}). Completa lo de arriba; si algo choca con la marca o con sus skills, mandan la marca y sus skills.`

const unir = (partes: string[]) =>
  partes
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n\n")

export function armarPorPiezas(o: OpcionesArmado): PromptPorPiezas {
  const pilares = new Map(o.datos.editorial.pilares.map((p) => [p.id, p.name]))
  const nombrePilar = (id: string) => pilares.get(id) ?? "(un pilar que ya no existe)"
  const situacion = describirSituacion(o.situacion, nombrePilar)

  const entro: Receta["entro"] = []
  const fuera: Receta["fuera"] = []

  // Las piezas del oficio: entra la que cumple su condicion.
  const oficioQueEntra: PiezaDeOficio[] = []
  for (const p of o.piezasDeOficio) {
    const porque = porQueNoEntra(p.cuando, o.situacion, nombrePilar)
    if (porque) fuera.push({ capa: "oficio", nombre: p.nombre, porque })
    else oficioQueEntra.push(p)
  }

  const faltante = o.exigir?.(oficioQueEntra, o.situacion)
  if (faltante) throw new Error(`El prompt de ${o.agente} está incompleto: ${faltante}.`)

  // Las skills: las de siempre van en la parte fija; las de condicion, abajo.
  const suyas = skillsDeAgente(o.datos.skills, o.agente)
  const siempre = suyas.filter((s) => esSiempre(s.cuando))
  let porCondicion: Skill[] = []
  for (const s of suyas.filter((x) => !esSiempre(x.cuando))) {
    const porque = porQueNoEntra(s.cuando, o.situacion, nombrePilar)
    if (porque) fuera.push({ capa: "skill", nombre: s.nombre, porque })
    else porCondicion.push(s)
  }

  const marca = bloqueMarca(o.datos, o.agente)
  const fijo = unir([o.oficio, marca, bloqueDeSkills(siempre)])

  const armarResto = (skills: Skill[]) => {
    const piezas = [
      ...oficioQueEntra.map((p) => `## ${p.nombre}\n${p.texto.trim()}`),
      ...skills.map((s) => `## ${s.nombre}\n${s.texto.trim()}`),
    ]
    return unir([piezas.length > 0 ? unir([CABECERA_POR_PIEZA(situacion), ...piezas]) : "", o.contrato])
  }

  // Si no cabe, salen primero las ultimas skills de condicion. Lo obligatorio
  // (oficio, marca, formato) y las skills de siempre no salen nunca: si eso
  // solo ya no cabe, el aviso de tamaño lo enseña en la ficha del agente.
  const tope = o.tope ?? TOPE_PROMPT
  let resto = armarResto(porCondicion)
  while (porCondicion.length > 0 && fijo.length + 2 + resto.length > tope) {
    const sale = porCondicion[porCondicion.length - 1]
    fuera.push({ capa: "skill", nombre: sale.nombre, porque: "no cabía en el prompt" })
    porCondicion = porCondicion.slice(0, -1)
    resto = armarResto(porCondicion)
  }

  entro.push({ capa: "oficio", nombre: o.oficioEditado ? "Oficio (editado)" : "Oficio", porCondicion: false })
  entro.push({ capa: "marca", nombre: "Marca", porCondicion: false })
  for (const s of siempre) entro.push({ capa: "skill", nombre: s.nombre, porCondicion: false })
  for (const p of oficioQueEntra) entro.push({ capa: "oficio", nombre: p.nombre, porCondicion: true })
  for (const s of porCondicion) entro.push({ capa: "skill", nombre: s.nombre, porCondicion: true })
  entro.push({ capa: "formato", nombre: "Formato de respuesta", porCondicion: false })

  return {
    fijo,
    resto,
    receta: {
      version: 1,
      agente: o.agente,
      situacion,
      oficioEditado: o.oficioEditado,
      entro,
      fuera,
      caracteres: textoDelPrompt({ fijo, resto }).length,
      fijo: fijo.length,
    },
  }
}

/** Lee una receta guardada. Null si no tiene forma: un trabajo de antes del armador. */
export function parseReceta(v: unknown): Receta | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (r.version !== 1 || !Array.isArray(r.entro) || !Array.isArray(r.fuera)) return null
  return r as unknown as Receta
}
