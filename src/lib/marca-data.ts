import "server-only"

import { getGenerationConfig } from "@/engine/content/jobs"
import { ctasUsables, identidadEditorial, type IdentidadEditorial } from "@/engine/marca/editorial"
import { perfilDe, type PerfilMarca } from "@/engine/marca/perfil"
import { estiloDesdeConfig, type Estilo } from "@/engine/render/theme"
import type { Variables } from "@/engine/content/types"
import { idDeCuentaActual } from "@/lib/accounts"

/** Todo lo que pinta Configuracion > Marca, de la cuenta abierta. */
export type DatosMarca = {
  perfil: PerfilMarca
  editorial: IdentidadEditorial
  variables: Variables
  estilo: Estilo
  /** La paleta guardada como punto de partida, o la de por defecto. */
  paleta: string
  completitud: Completitud
}

export type Pendiente = { campo: string; pestana: "identidad" | "voz" | "editorial" | "cta" | "visual" }
export type Completitud = { listos: number; total: number; faltan: Pendiente[] }

export async function datosDeMarca(): Promise<DatosMarca> {
  const accountId = await idDeCuentaActual()
  const [perfil, editorial, config] = await Promise.all([
    perfilDe(accountId),
    identidadEditorial(accountId),
    getGenerationConfig(accountId),
  ])
  const carousel = (config.carousel ?? {}) as Record<string, unknown>
  const estilo = estiloDesdeConfig(carousel)
  return {
    perfil,
    editorial,
    variables: config.variables,
    estilo,
    paleta: typeof carousel.paleta === "string" ? carousel.paleta : "negro",
    completitud: completitudDe(perfil, editorial, estilo),
  }
}

/**
 * Que tiene la marca y que le falta. No bloquea nada: lo vacio se llena con
 * valores generales. Sirve para ver de un vistazo que falta por decidir.
 */
export function completitudDe(perfil: PerfilMarca, editorial: IdentidadEditorial, estilo: Estilo): Completitud {
  const items: [boolean, Pendiente][] = [
    [!!perfil.nombre, { campo: "nombre", pestana: "identidad" }],
    [!!perfil.handle, { campo: "usuario", pestana: "identidad" }],
    [!!perfil.que_hace, { campo: "qué hace", pestana: "identidad" }],
    [!!perfil.mensaje_central, { campo: "mensaje central", pestana: "identidad" }],
    [!!perfil.pais, { campo: "país", pestana: "identidad" }],
    [!!perfil.voz_si, { campo: "cómo suena", pestana: "voz" }],
    [!!perfil.voz_no, { campo: "cómo no suena", pestana: "voz" }],
    [!!perfil.reglas, { campo: "reglas", pestana: "voz" }],
    [perfil.frases_prohibidas.length > 0, { campo: "frases prohibidas", pestana: "voz" }],
    [!!perfil.temas_vetados, { campo: "temas vetados", pestana: "voz" }],
    [editorial.pilares.length > 0, { campo: "pilares", pestana: "editorial" }],
    [editorial.audiencias.length > 0, { campo: "audiencias", pestana: "editorial" }],
    [editorial.verticales.length > 0, { campo: "verticales", pestana: "editorial" }],
    [ctasUsables(editorial.ctas).length > 0, { campo: "un CTA usable", pestana: "cta" }],
    [!!(estilo.logoClaro || estilo.logoOscuro), { campo: "logo", pestana: "visual" }],
    [estilo.colores !== null, { campo: "colores propios", pestana: "visual" }],
  ]
  return {
    listos: items.filter(([ok]) => ok).length,
    total: items.length,
    faltan: items.filter(([ok]) => !ok).map(([, p]) => p),
  }
}
