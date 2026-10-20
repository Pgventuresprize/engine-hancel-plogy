import { ctasUsables, type IdentidadEditorial } from "./editorial-modelo"

/**
 * La clasificacion de una pieza: de que pilar es, para que audiencia, en que
 * vertical, que busca y que CTA pide.
 *
 * La decide el agente de angulo, que es el que entiende la noticia, y viaja a
 * los agentes que escriben. Siempre sale de las listas de la marca: el agente
 * recibe cada fila con un codigo corto (P1, A2…) y devuelve codigos, que aqui
 * se traducen a la fila real. Un codigo que no existe se queda en null; asi no
 * hay pilares inventados ni nombres que casi coinciden.
 *
 * Se guarda una foto de los nombres, no solo los ids: la ficha de una pieza
 * tiene que seguir diciendo de que pilar era aunque el pilar se renombre o se
 * borre despues.
 *
 * Puro y sin base, para la interfaz y para probarlo.
 */

export const OBJETIVOS = ["alcance", "comunidad", "autoridad", "conversion"] as const
export type Objetivo = (typeof OBJETIVOS)[number]

export const NOMBRE_OBJETIVO: Record<Objetivo, string> = {
  alcance: "Alcance",
  comunidad: "Comunidad",
  autoridad: "Autoridad",
  conversion: "Conversión",
}

const QUE_BUSCA: Record<Objetivo, string> = {
  alcance: "que llegue a gente nueva: se comparte, se reenvía",
  comunidad: "conversación con quien ya sigue: comentarios, respuestas",
  autoridad: "que la marca quede como referencia: se guarda, se cita",
  conversion: "que quien lee dé un paso hacia la marca: escribir, pedir, comprar",
}

export type Ref = { id: string; nombre: string }

export type Clasificacion = {
  pilar: Ref | null
  pilar_secundario: Ref | null
  audiencia: Ref | null
  vertical: Ref | null
  objetivo: Objetivo | null
  cta: (Ref & { tipo: string }) | null
  /**
   * La noticia es un logro del pais o del sector de la marca. Decide si entra la
   * pieza de "logros" del oficio. Ausente en las clasificaciones de antes.
   */
  logro?: boolean
}

const PREFIJO = { pilares: "P", audiencias: "A", verticales: "V", ctas: "C" } as const

type Fila = { id: string; name: string; description: string | null }

function codigos<T extends Fila>(lista: T[], prefijo: string): Map<string, T> {
  return new Map(lista.map((f, i) => [`${prefijo}${i + 1}`, f]))
}

/** Las listas con sus codigos, tal como se le dan al agente y se leen de vuelta. */
export function listasConCodigo(editorial: IdentidadEditorial) {
  return {
    pilares: codigos(editorial.pilares, PREFIJO.pilares),
    audiencias: codigos(editorial.audiencias, PREFIJO.audiencias),
    verticales: codigos(editorial.verticales, PREFIJO.verticales),
    ctas: codigos(ctasUsables(editorial.ctas), PREFIJO.ctas),
  }
}

const linea = (codigo: string, f: Fila, extra = "") => {
  const d = (f.description ?? "").trim().replace(/\s+/g, " ").slice(0, 160)
  return `- ${codigo}: ${f.name}${extra}${d ? `. ${d}` : ""}`
}

/** El bloque que va en el mensaje del agente de angulo. */
export function bloqueParaClasificar(editorial: IdentidadEditorial): string {
  const l = listasConCodigo(editorial)
  const seccion = (titulo: string, mapa: Map<string, Fila>, extra?: (f: Fila) => string) =>
    mapa.size === 0
      ? `${titulo}\n(la marca no tiene; devuelve null)`
      : `${titulo}\n${[...mapa].map(([c, f]) => linea(c, f, extra?.(f))).join("\n")}`

  return [
    "LISTAS PARA CLASIFICAR (devuelve solo estos códigos)",
    seccion("Pilares:", l.pilares),
    seccion("Audiencias:", l.audiencias),
    seccion("Verticales:", l.verticales),
    seccion("CTA:", l.ctas, (f) => ` (${(f as Fila & { tipo?: string }).tipo ?? ""})`),
    `Objetivos:\n${OBJETIVOS.map((o) => `- ${o}: ${QUE_BUSCA[o]}`).join("\n")}`,
  ].join("\n\n")
}

/** Traduce los codigos que devolvio el agente a filas de la marca. */
export function resolverClasificacion(bruto: unknown, editorial: IdentidadEditorial): Clasificacion {
  const o = (bruto ?? {}) as Record<string, unknown>
  const l = listasConCodigo(editorial)
  const buscar = <T extends Fila>(mapa: Map<string, T>, valor: unknown): T | null => {
    const codigo = typeof valor === "string" ? valor.trim().toUpperCase() : ""
    return mapa.get(codigo) ?? null
  }
  const ref = (f: Fila | null): Ref | null => (f ? { id: f.id, nombre: f.name } : null)

  const pilar = buscar(l.pilares, o.pilar)
  const secundario = buscar(l.pilares, o.pilar_secundario)
  const cta = buscar(l.ctas, o.cta)
  const objetivo = typeof o.objetivo === "string" ? o.objetivo.trim().toLowerCase() : ""

  return {
    pilar: ref(pilar),
    // El secundario no puede ser el mismo pilar: eso es no tener secundario.
    pilar_secundario: secundario && secundario.id !== pilar?.id ? ref(secundario) : null,
    audiencia: ref(buscar(l.audiencias, o.audiencia)),
    vertical: ref(buscar(l.verticales, o.vertical)),
    objetivo: (OBJETIVOS as readonly string[]).includes(objetivo) ? (objetivo as Objetivo) : null,
    cta: cta ? { id: cta.id, nombre: cta.name, tipo: cta.tipo } : null,
    logro: o.logro === true || o.logro === "true",
  }
}

/** Lee una clasificacion guardada. Lo que no tenga forma se queda en null. */
export function parseClasificacion(valor: unknown): Clasificacion | null {
  if (!valor || typeof valor !== "object") return null
  const o = valor as Record<string, unknown>
  const ref = (v: unknown): Ref | null => {
    const r = (v ?? null) as Record<string, unknown> | null
    return r && typeof r.id === "string" && typeof r.nombre === "string" ? { id: r.id, nombre: r.nombre } : null
  }
  const cta = ref(o.cta)
  const tipo = (o.cta as Record<string, unknown> | null)?.tipo
  const objetivo = typeof o.objetivo === "string" && (OBJETIVOS as readonly string[]).includes(o.objetivo) ? (o.objetivo as Objetivo) : null
  return {
    pilar: ref(o.pilar),
    pilar_secundario: ref(o.pilar_secundario),
    audiencia: ref(o.audiencia),
    vertical: ref(o.vertical),
    objetivo,
    cta: cta ? { ...cta, tipo: typeof tipo === "string" ? tipo : "" } : null,
    logro: o.logro === true,
  }
}

/**
 * La clasificacion contada para los agentes que escriben. Los detalles de cada
 * pilar o CTA ya estan en el bloque de marca; aqui va lo que se eligio.
 */
export function bloqueClasificacion(c: Clasificacion | null | undefined): string | null {
  if (!c) return null
  const lineas = [
    c.pilar ? `- pilar: ${c.pilar.nombre}${c.pilar_secundario ? ` (y de fondo: ${c.pilar_secundario.nombre})` : ""}` : "",
    c.audiencia ? `- audiencia: ${c.audiencia.nombre}` : "",
    c.vertical ? `- vertical: ${c.vertical.nombre}` : "",
    c.objetivo ? `- objetivo: ${c.objetivo} (${QUE_BUSCA[c.objetivo]})` : "",
    c.cta ? `- cta: ${c.cta.nombre}. El cierre y el caption piden este CTA, dicho con las palabras de la pieza.` : "",
    c.logro ? "- es un logro del país o del sector de la marca" : "",
  ].filter(Boolean)
  return lineas.length > 0 ? `CLASIFICACIÓN (la decidió el agente de ángulo)\n${lineas.join("\n")}` : null
}
