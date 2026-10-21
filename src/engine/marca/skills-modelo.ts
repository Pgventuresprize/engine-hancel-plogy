import { AGENTES_CON_MARCA, type AgenteConMarca } from "./bloque"
import { esSiempre, parseCuando, type Cuando } from "./cuando"

/**
 * Las skills de marca: instrucciones propias de una marca para sus agentes.
 *
 * Una skill dice como hace esta marca una cosa concreta (sus captions, sus
 * CTA, su forma de contar una cifra) y a que agentes les sirve. Entra en el
 * prompt de esos agentes despues del bloque de marca y antes del contrato.
 *
 * `texto` es lo que entra al prompt y se paga en cada llamada; `original` es
 * el documento como llego, que se guarda para volver a el o compararlo.
 *
 * Aqui solo tipos, topes y limpieza, sin base, para que la interfaz pueda
 * importarlo. La lectura y el guardado estan en skills.ts.
 */

export const TOPES_SKILL = { nombre: 80, descripcion: 300, texto: 8000, original: 200_000 } as const

export const NOMBRE_AGENTE: Record<AgenteConMarca, string> = {
  analisis: "Análisis",
  angulo: "Ángulo",
  instagram: "Instagram / Facebook",
  linkedin: "LinkedIn",
  criterio: "Criterio",
  revisor: "Revisor",
  redaccion: "Redacción",
  ideas: "Ideas del Estudio",
  contenido: "Contenido del Estudio",
  guion: "Guion de video",
}

export type Skill = {
  id: string
  nombre: string
  descripcion: string
  texto: string
  original: string
  agentes: AgenteConMarca[]
  /** Con que piezas entra (ver cuando.ts). Vacio = siempre. */
  cuando: Cuando
  activo: boolean
  position: number
}

export type CamposSkill = Omit<Skill, "id" | "position">

const texto = (v: unknown, tope: number) => (typeof v === "string" ? v.trim().slice(0, tope) : "")

function agentes(v: unknown): AgenteConMarca[] {
  const lista = Array.isArray(v) ? v : []
  return AGENTES_CON_MARCA.filter((a) => lista.includes(a))
}

export function parseSkill(fila: Record<string, unknown>): Skill {
  return {
    id: String(fila.id),
    nombre: texto(fila.nombre, TOPES_SKILL.nombre),
    descripcion: texto(fila.descripcion, TOPES_SKILL.descripcion),
    texto: texto(fila.texto, TOPES_SKILL.texto),
    // El original no se recorta por delante ni por detras: es el documento.
    original: typeof fila.original === "string" ? fila.original.slice(0, TOPES_SKILL.original) : "",
    agentes: agentes(fila.agentes),
    cuando: parseCuando(fila.cuando),
    activo: fila.activo !== false,
    position: typeof fila.position === "number" ? fila.position : 0,
  }
}

/** Mensaje para el usuario, o null si todo vale. */
export function validarSkill(c: CamposSkill): string | null {
  if (!c.nombre.trim()) return "La skill necesita un nombre."
  if (c.nombre.trim().length > TOPES_SKILL.nombre) return `El nombre no puede pasar de ${TOPES_SKILL.nombre} caracteres.`
  if (c.descripcion.trim().length > TOPES_SKILL.descripcion) {
    return `La descripción no puede pasar de ${TOPES_SKILL.descripcion} caracteres.`
  }
  if (c.texto.trim().length > TOPES_SKILL.texto) {
    return `El texto que entra al prompt no puede pasar de ${TOPES_SKILL.texto} caracteres. Lo que sobre, déjalo en el original.`
  }
  if (c.original.length > TOPES_SKILL.original) return "El original es demasiado largo."
  if (c.agentes.some((a) => !(AGENTES_CON_MARCA as readonly string[]).includes(a))) return "Hay un agente que no existe."
  return null
}

/**
 * La capa de skills de un agente: las activas que lo incluyen y van siempre, en
 * su orden. Las que tienen condiciones solo entran por el armador por piezas,
 * que es el que conoce la clasificacion de la pieza; un agente sin ella (el
 * Estudio, los guiones) no las recibe.
 */
export function bloqueSkills(skills: Skill[], agente: AgenteConMarca): string {
  return bloqueDeSkills(skillsDeAgente(skills, agente).filter((s) => esSiempre(s.cuando)))
}

/** La capa de skills con estas skills, ya elegidas. Vacia si no hay ninguna. */
export function bloqueDeSkills(suyas: Skill[]): string {
  if (suyas.length === 0) return ""
  return [
    // La segunda frase es para las skills que vienen de un kit de trabajo con
    // archivos: piden entregar briefs, tablas o carpetas, y aqui solo se
    // entrega el JSON. Sin ella, el agente intenta cumplir las dos cosas.
    "# SKILLS DE LA MARCA\nCómo hace esta marca cosas concretas. Síguelas como parte de tu oficio; el formato de respuesta de abajo no cambia. Donde una skill pida entregar archivos, briefs o tablas, o leer otro archivo, entrega solo lo que pide el formato de respuesta y trabaja con lo que tienes aquí.",
    ...suyas.map((s) => `## ${s.nombre}\n${s.texto.trim()}`),
  ].join("\n\n")
}

export function skillsDeAgente(skills: Skill[], agente: AgenteConMarca): Skill[] {
  return [...skills]
    .filter((s) => s.activo && s.texto.trim() && s.agentes.includes(agente))
    .sort((a, b) => a.position - b.position)
}
