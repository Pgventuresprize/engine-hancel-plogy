import type { Herramienta, ResultadoHerramienta } from "../claude/messages"
import { investigarEnLaWeb } from "../content/composio"
import { dominio, leerPaginaConMotivo } from "../redaccion/fuentes"
import type { ReferenciaFuente } from "./mensajes"

/**
 * Lo que un agente puede hacer en el chat ademas de hablar.
 *
 * La busqueda es la misma del analisis (Composio): quien sale a internet es el
 * motor, y el agente recibe texto ya sintetizado con sus citas. Lo que traen
 * estas herramientas viene de paginas de cualquiera, asi que va marcado como
 * material y el contrato del chat le dice al agente que no lo obedezca.
 */

/** Por turno: un agente que busca sin parar gasta sin llegar a responder. */
const MAX_BUSQUEDAS = 5
const MAX_LECTURAS = 6
/** Lo que se le pasa de cada pagina: mas es pagar contexto de mas. */
const MAX_POR_PAGINA = 6_000
/** Las fuentes que se enseñan debajo del mensaje. */
const MAX_FUENTES_VISIBLES = 6

export const HERRAMIENTAS_INVESTIGAR: Herramienta[] = [
  {
    name: "buscar_web",
    description:
      "Busca en internet y devuelve un texto sintetizado con sus fuentes. Úsala cuando la persona pida investigar algo o cuando necesites datos actuales que no tienes delante. No la uses para lo que ya está en la conversación.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { consulta: { type: "string", description: "Qué buscar, concreto y con el contexto necesario." } },
      required: ["consulta"],
      additionalProperties: false,
    },
  },
  {
    name: "leer_pagina",
    description:
      "Lee el texto de una página. Solo sirve para enlaces que ya salieron en una búsqueda de este turno o que la persona escribió. Úsala cuando el resumen de la búsqueda se quede corto.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "El enlace completo, con https." } },
      required: ["url"],
      additionalProperties: false,
    },
  },
]

/** Lo que se lleva la cuenta durante una respuesta. */
export type Turno = {
  alHerramienta: (detalle: string) => void
  /** Los enlaces que se pueden leer: los de la persona y los que citaron las busquedas. */
  urls: Set<string>
  fuentes: Map<string, ReferenciaFuente>
  busquedas: number
  lecturas: number
}

const ENLACE = /https?:\/\/[^\s<>()"']+/g

export function nuevoTurno(mensajePersona: string, alHerramienta: (detalle: string) => void): Turno {
  const urls = new Set((mensajePersona.match(ENLACE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))
  return { alHerramienta, urls, fuentes: new Map(), busquedas: 0, lecturas: 0 }
}

/** Una direccion que se puede pedir desde el servidor: publica y por http. */
function esPublica(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" && u.protocol !== "http:") return false
    const h = u.hostname.toLowerCase()
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false
    // Una IP escrita a mano no es una pagina que alguien cite: asi se llega a la red interna.
    return !/^\[|^\d{1,3}(\.\d{1,3}){3}$/.test(h)
  } catch {
    return false
  }
}

function entradaDeTexto(entrada: unknown, campo: string): string {
  const v = (entrada as Record<string, unknown> | null)?.[campo]
  return typeof v === "string" ? v.trim() : ""
}

async function buscarWeb(turno: Turno, entrada: unknown): Promise<ResultadoHerramienta> {
  const consulta = entradaDeTexto(entrada, "consulta")
  if (!consulta) return { contenido: "Falta la consulta.", error: true }
  if (turno.busquedas >= MAX_BUSQUEDAS) {
    return { contenido: `Ya hiciste ${MAX_BUSQUEDAS} búsquedas en este turno. Responde con lo que tienes.`, error: true }
  }
  turno.busquedas++
  turno.alHerramienta(`Buscando: ${consulta.slice(0, 80)}`)

  const r = await investigarEnLaWeb(consulta)
  if (!r.ok) return { contenido: `La búsqueda no funcionó: ${r.motivo}. Díselo a la persona; no rellenes con lo que supones.`, error: true }

  for (const c of r.citas) {
    turno.urls.add(c.url)
    if (!turno.fuentes.has(c.url)) {
      turno.fuentes.set(c.url, { tipo: "fuente", url: c.url, titulo: c.titulo ?? dominio(c.url), medio: dominio(c.url) })
    }
  }
  const citas = r.citas.map((c, i) => `[${i + 1}] ${c.titulo ?? "Sin título"} (${c.url})`).join("\n")
  return { contenido: `<material_web>\n${r.texto}\n\nFuentes:\n${citas || "(sin fuentes)"}\n</material_web>` }
}

async function leerPagina(turno: Turno, entrada: unknown): Promise<ResultadoHerramienta> {
  const url = entradaDeTexto(entrada, "url")
  if (!turno.urls.has(url) || !esPublica(url)) {
    return { contenido: "Solo se pueden leer enlaces públicos que salieron en una búsqueda de este turno o que escribió la persona.", error: true }
  }
  if (turno.lecturas >= MAX_LECTURAS) {
    return { contenido: `Ya leíste ${MAX_LECTURAS} páginas en este turno. Responde con lo que tienes.`, error: true }
  }
  turno.lecturas++
  turno.alHerramienta(`Leyendo ${dominio(url)}`)

  const { pagina, motivo } = await leerPaginaConMotivo(url)
  if (!pagina?.texto) return { contenido: `No se pudo leer esa página${motivo ? `: ${motivo}` : ""}.`, error: true }
  if (!turno.fuentes.has(url)) {
    turno.fuentes.set(url, { tipo: "fuente", url, titulo: pagina.titulo ?? dominio(url), medio: pagina.medio || dominio(url) })
  }
  return { contenido: `<material_web>\n${pagina.texto.slice(0, MAX_POR_PAGINA)}\n</material_web>` }
}

/** Corre lo que pidio el agente. Lo que no conoce vuelve como error, no tumba la respuesta. */
export function ejecutorDe(turno: Turno): (nombre: string, entrada: unknown) => Promise<ResultadoHerramienta> {
  return async (nombre, entrada) => {
    if (nombre === "buscar_web") return buscarWeb(turno, entrada)
    if (nombre === "leer_pagina") return leerPagina(turno, entrada)
    return { contenido: `No existe la herramienta ${nombre}.`, error: true }
  }
}

/** Las fuentes que van debajo del mensaje. */
export function fuentesDe(turno: Turno): ReferenciaFuente[] {
  return [...turno.fuentes.values()].slice(0, MAX_FUENTES_VISIBLES)
}
