import type { Herramienta, ResultadoHerramienta } from "../claude/messages"
import { investigarEnLaWeb } from "../content/composio"
import { fechaCorta } from "../calendario/reparto"
import { dominio, leerPaginaConMotivo } from "../redaccion/fuentes"
import type { ReferenciaFuente, ReferenciaPlan } from "./mensajes"
import { confirmarPlan, proponerPlan, type PedidoDeAgente } from "./posts-propios"
import { agentesApagados, despachar, empezarLote, type PedidoPieza, type RedChat } from "./trabajos"

/**
 * Lo que un agente puede hacer en el chat ademas de hablar.
 *
 * La busqueda es la misma del analisis (Composio): quien sale a internet es el
 * motor, y el agente recibe texto ya sintetizado con sus citas. Lo que traen
 * estas herramientas viene de paginas de cualquiera, asi que va marcado como
 * material y el contrato del chat le dice al agente que no lo obedezca.
 */

/** Las piezas que se pueden pedir en un mensaje. */
export const MAX_PIEZAS_POR_PEDIDO = 6

/** Por turno: un agente que busca sin parar gasta sin llegar a responder. */
const MAX_BUSQUEDAS = 5
const MAX_LECTURAS = 6
/** Lo que se le pasa de cada pagina: mas es pagar contexto de mas. */
const MAX_POR_PAGINA = 6_000
/** Las fuentes que se enseñan debajo del mensaje. */
const MAX_FUENTES_VISIBLES = 6

export const HERRAMIENTAS_CHAT: Herramienta[] = [
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
  {
    name: "crear_piezas",
    description: `Pone a trabajar al equipo en piezas nuevas sobre los temas que digas: cada una se investiga desde cero, le decide el ángulo su agente, se escribe, se diseña y la revisa el Revisor. No conserva el texto de ninguna pieza: nunca la uses para rehacer, mejorar o rediseñar una que ya existe. Úsala cuando la persona pida crear carruseles o posts y haya dicho de qué y cuántos. Si pidió ideas o que investigues y propongas, propón primero y espera a que confirme. Máximo ${MAX_PIEZAS_POR_PEDIDO} piezas por pedido. Una sola llamada con todas.`,
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        piezas: {
          type: "array",
          description: "Una entrada por pieza.",
          items: {
            type: "object",
            properties: {
              red: { type: "string", enum: ["instagram", "linkedin"], description: "instagram para un carrusel, linkedin para un post." },
              tema: { type: "string", description: "El tema de la pieza, corto y concreto: es su título en la conversación." },
              enfoque: { type: "string", description: "Lo que pidió la persona para esta pieza, con sus palabras: enfoque, público, lo que debe decir." },
              consulta: { type: "string", description: "Qué buscar en internet para esta pieza. Vacío si no se investiga." },
              investigar: { type: "boolean", description: "False solo si sale de lo que sabe la marca y no hay nada que buscar." },
            },
            required: ["red", "tema", "enfoque", "consulta", "investigar"],
            additionalProperties: false,
          },
        },
      },
      required: ["piezas"],
      additionalProperties: false,
    },
  },
]

/** Solo si hay posts subidos en la conversacion: sin ellos no tienen sobre que actuar. */
export const HERRAMIENTAS_POSTS: Herramienta[] = [
  {
    name: "proponer_programacion",
    description: `Arma la propuesta de cuándo sale cada post de POSTS ADJUNTOS y se la enseña a la persona como tabla. No programa ni aprueba nada: eso pasa al confirmar. Las fechas y horas las reparte el sistema en los horarios de la marca; tú solo das los posts que entran, cuáles caducan y las horas que la persona haya pedido. Incluye todos los posts, también los que dejas fuera. Para corregir una propuesta, vuelve a llamarla entera.`,
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Primer día del reparto, AAAA-MM-DD. Vacío: hoy." },
        hasta: { type: "string", description: "Último día del reparto, AAAA-MM-DD. Vacío: dos semanas." },
        posts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              post: { type: "string", description: "La etiqueta del post: A1, A2..." },
              incluir: { type: "boolean", description: "False si no debe salir: ya venció, está repetido o algo le falta." },
              motivo: { type: "string", description: "Por qué queda fuera, en una frase. Vacío si entra." },
              vence: { type: "string", description: "Último momento en que sirve, si habla de una fecha o evento: AAAA-MM-DD o AAAA-MM-DD HH:MM. Vacío si no caduca." },
              dia: { type: "string", description: "AAAA-MM-DD solo si la persona pidió un día para este post. Vacío si lo reparte el sistema." },
              hora: { type: "string", description: "HH:MM en 24 horas solo si la persona pidió una hora. Vacío si lo reparte el sistema." },
              caption: { type: "string", description: "Solo si dice SIN CAPTION o la persona pidió cambiarlo. Vacío en los demás: el del archivo va tal cual." },
              hashtags: { type: "array", items: { type: "string" }, description: "Los hashtags del caption que escribes. Vacío si no escribes caption." },
            },
            required: ["post", "incluir", "motivo", "vence", "dia", "hora", "caption", "hashtags"],
            additionalProperties: false,
          },
        },
      },
      required: ["desde", "hasta", "posts"],
      additionalProperties: false,
    },
  },
  {
    name: "confirmar_programacion",
    description: "Programa la última propuesta tal como se ve en la tabla: aprueba los posts y les pone su fecha. Úsala solo si el último mensaje de la persona confirma la propuesta sin pedir cambios. Si pide cambios, vuelve a proponer.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
]

/** Lo que se lleva la cuenta durante una respuesta. */
export type Turno = {
  accountId: string
  conversacionId: string
  /** El mensaje al que se responde: un pedido crea sus piezas una sola vez. */
  mensajeId: string
  /** Cuantas piezas se pusieron en marcha en este turno. */
  creadas: number
  alHerramienta: (detalle: string) => void
  /** Los enlaces que se pueden leer: los de la persona y los que citaron las busquedas. */
  urls: Set<string>
  fuentes: Map<string, ReferenciaFuente>
  busquedas: number
  lecturas: number
  /** Los posts subidos en la conversacion: etiqueta del prompt a id de pieza. */
  posts: Map<string, string>
  /** La propuesta de este turno, si la hubo: va como tabla en el mensaje. */
  plan: ReferenciaPlan | null
}

const ENLACE = /https?:\/\/[^\s<>()"']+/g

export function nuevoTurno(
  o: { accountId: string; conversacionId: string; mensajeId: string; texto: string; posts?: Map<string, string> },
  alHerramienta: (detalle: string) => void
): Turno {
  const urls = new Set((o.texto.match(ENLACE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))
  return { accountId: o.accountId, conversacionId: o.conversacionId, mensajeId: o.mensajeId, creadas: 0, alHerramienta, urls, fuentes: new Map(), busquedas: 0, lecturas: 0, posts: o.posts ?? new Map(), plan: null }
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

/** La entrada ya revisada: strict cubre la forma, no lo que el codigo necesita. */
function piezasDe(entrada: unknown): PedidoPieza[] | null {
  const lista = (entrada as { piezas?: unknown } | null)?.piezas
  if (!Array.isArray(lista)) return null
  const piezas: PedidoPieza[] = []
  for (const p of lista as Record<string, unknown>[]) {
    const red = p?.red
    const tema = typeof p?.tema === "string" ? p.tema.trim() : ""
    const enfoque = typeof p?.enfoque === "string" ? p.enfoque.trim() : ""
    const consulta = typeof p?.consulta === "string" ? p.consulta.trim() : ""
    if ((red !== "instagram" && red !== "linkedin") || !tema) return null
    const investigar = p?.investigar !== false
    if (investigar && !consulta) return null
    piezas.push({ red: red as RedChat, tema: tema.slice(0, 160), enfoque: (enfoque || tema).slice(0, 2000), consulta: consulta.slice(0, 300), investigar })
  }
  return piezas
}

async function crearPiezas(turno: Turno, entrada: unknown): Promise<ResultadoHerramienta> {
  if (turno.creadas) return { contenido: "Este pedido ya tiene sus piezas en marcha. No vuelvas a crearlas.", error: true }
  const piezas = piezasDe(entrada)
  if (!piezas?.length) return { contenido: "Cada pieza necesita red, tema y, si se investiga, consulta. No se creó nada.", error: true }
  if (piezas.length > MAX_PIEZAS_POR_PEDIDO) {
    return {
      contenido: `Son ${piezas.length} piezas y el máximo por pedido es ${MAX_PIEZAS_POR_PEDIDO}. No se creó ninguna: díselo a la persona y pregúntale cuáles quiere primero.`,
      error: true,
    }
  }
  const apagados = await agentesApagados(turno.accountId, piezas.map((p) => p.red))
  if (apagados.length) {
    return { contenido: `No se creó nada: ${apagados.join(" y ")} ${apagados.length === 1 ? "está apagado" : "están apagados"} en los ajustes de la marca. Díselo a la persona.`, error: true }
  }
  turno.alHerramienta(`Poniendo a trabajar ${piezas.length === 1 ? "al equipo" : `${piezas.length} piezas`}`)
  await empezarLote({ accountId: turno.accountId, conversacionId: turno.conversacionId, mensajeId: turno.mensajeId, piezas })
  turno.creadas = piezas.length
  await despachar(turno.accountId)
  return { contenido: `Listo: ${piezas.length} ${piezas.length === 1 ? "pieza en marcha" : "piezas en marcha"}. Se ven como tarjetas en la conversación y avisan al terminar; el Revisor dictamina al final.` }
}

function pedidosDe(entrada: unknown): PedidoDeAgente[] | null {
  const lista = (entrada as { posts?: unknown } | null)?.posts
  if (!Array.isArray(lista)) return null
  const texto = (v: unknown) => (typeof v === "string" ? v : "")
  return (lista as Record<string, unknown>[]).map((p) => ({
    post: texto(p?.post).trim().toUpperCase(),
    incluir: p?.incluir !== false,
    motivo: texto(p?.motivo),
    vence: texto(p?.vence),
    dia: texto(p?.dia),
    hora: texto(p?.hora),
    caption: texto(p?.caption),
    hashtags: Array.isArray(p?.hashtags) ? (p.hashtags as unknown[]).filter((h): h is string => typeof h === "string") : [],
  }))
}

async function proponer(turno: Turno, entrada: unknown): Promise<ResultadoHerramienta> {
  if (!turno.posts.size) return { contenido: "En esta conversación no hay posts subidos.", error: true }
  const pedidos = pedidosDe(entrada)
  if (!pedidos?.length) return { contenido: "Faltan los posts. No se propuso nada.", error: true }
  turno.alHerramienta("Organizando los posts")
  const e = entrada as { desde?: unknown; hasta?: unknown }
  const r = await proponerPlan({
    accountId: turno.accountId,
    etiquetas: turno.posts,
    desde: typeof e.desde === "string" ? e.desde : "",
    hasta: typeof e.hasta === "string" ? e.hasta : "",
    pedidos,
  })
  if (!r.ok) return { contenido: r.error, error: true }
  turno.plan = r.plan
  const filas = r.plan.filas.map((f) => `- ${f.titulo}: ${fechaCorta(f.dia)}, ${f.hora}${f.captionEscrito ? " (caption tuyo)" : ""}`)
  const fuera = r.plan.fuera.map((f) => `- ${f.titulo}: ${f.motivo}`)
  return {
    contenido: [
      "Propuesta lista. Estas son las fechas reales: el sistema pudo mover una hora para que caiga cada cinco minutos o no choque, así que si mencionas una, que sea esta y no la que pidió la persona.",
      filas.join("\n") || "No entra ningún post.",
      fuera.length ? `Fuera:\n${fuera.join("\n")}` : "",
      "La persona ya la ve como tabla: no la repitas. Di en una o dos frases qué conviene mirar y pide que confirme. Todavía no hay nada programado.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  }
}

async function confirmar(turno: Turno): Promise<ResultadoHerramienta> {
  turno.alHerramienta("Programando los posts")
  const r = await confirmarPlan(turno.accountId, turno.conversacionId, null)
  return r.ok ? { contenido: r.resumen } : { contenido: r.error, error: true }
}

/** Corre lo que pidio el agente. Lo que no conoce vuelve como error, no tumba la respuesta. */
export function ejecutorDe(turno: Turno): (nombre: string, entrada: unknown) => Promise<ResultadoHerramienta> {
  return async (nombre, entrada) => {
    if (nombre === "buscar_web") return buscarWeb(turno, entrada)
    if (nombre === "leer_pagina") return leerPagina(turno, entrada)
    if (nombre === "crear_piezas") return crearPiezas(turno, entrada)
    if (nombre === "proponer_programacion") return proponer(turno, entrada)
    if (nombre === "confirmar_programacion") return confirmar(turno)
    return { contenido: `No existe la herramienta ${nombre}.`, error: true }
  }
}

/** Las fuentes que van debajo del mensaje. */
export function fuentesDe(turno: Turno): ReferenciaFuente[] {
  return [...turno.fuentes.values()].slice(0, MAX_FUENTES_VISIBLES)
}
