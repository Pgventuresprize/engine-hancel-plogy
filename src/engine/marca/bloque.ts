import { ctasUsables, type Capa, type IdentidadEditorial } from "./editorial-modelo"
import { NOMBRE_IDIOMA, nombrePais, type PerfilMarca } from "./perfil-modelo"

/**
 * El bloque de marca que se mete en el prompt de cada agente.
 *
 * El prompt de un agente se arma por capas: el oficio (como se hace el
 * trabajo, igual para todas las marcas), la marca (esto), las skills de la
 * marca (skills-modelo.ts) y al final el contrato (el formato exacto de la
 * respuesta, que nada pisa). Los ejemplos se meteran antes del contrato.
 *
 * Cada agente lee solo lo que le sirve: al de analisis no le hace falta la voz
 * ni el CTA, y al redactor de noticias no le conviene la voz de marca, que es
 * opinion, cuando lo que escribe es una noticia sin opinion.
 *
 * Todo es puro y sin base, para poder probarlo y para pintar el prompt final
 * en pantalla con los mismos datos que usa el motor.
 */

export const AGENTES_CON_MARCA = [
  "analisis",
  "angulo",
  "instagram",
  "linkedin",
  "criterio",
  "revisor",
  "redaccion",
  "ideas",
  "contenido",
  "guion",
] as const
export type AgenteConMarca = (typeof AGENTES_CON_MARCA)[number]

type Seccion = "identidad" | "audiencias" | "temas" | "voz" | "reglas" | "cta" | "vetos"

const ESCRIBEN_PARA_PUBLICAR: Seccion[] = ["identidad", "audiencias", "temas", "voz", "reglas", "cta", "vetos"]

export const QUE_LEE: Record<AgenteConMarca, Seccion[]> = {
  analisis: ["identidad", "audiencias", "temas", "vetos"],
  angulo: ["identidad", "audiencias", "temas", "vetos"],
  instagram: ESCRIBEN_PARA_PUBLICAR,
  linkedin: ESCRIBEN_PARA_PUBLICAR,
  // Decide lo que la marca haria: tiene que saber quien es, para quien escribe y que ofrece.
  criterio: ESCRIBEN_PARA_PUBLICAR,
  // Juzga lo que escriben los de arriba: tiene que saber lo mismo que ellos.
  revisor: ESCRIBEN_PARA_PUBLICAR,
  redaccion: ["identidad", "audiencias", "reglas", "vetos"],
  ideas: ["identidad", "audiencias", "temas", "vetos"],
  contenido: ESCRIBEN_PARA_PUBLICAR,
  guion: ESCRIBEN_PARA_PUBLICAR,
}

export type DatosDeMarca = { perfil: PerfilMarca; editorial: IdentidadEditorial }

/**
 * Cuantas filas de cada lista entran. Las listas no tienen tope en la base, y
 * cada fila de mas se paga en cada llamada de cada agente.
 */
const MAX_FILAS = 12
const MAX_DESCRIPCION = 300

/**
 * Por encima de esto el prompt final se avisa en pantalla: cada llamada lo paga
 * entero. Era 40.000; con las skills completas del kit y el sistema narrativo,
 * el de Instagram de Plogy ronda los 60.000, y la prueba de la pieza 004 mostro
 * que ese texto completo es lo que sube la calidad.
 */
export const TOPE_PROMPT = 100_000

const corta = (t: string | null | undefined) => {
  const limpio = (t ?? "").trim().replace(/\s+/g, " ")
  return limpio.length > MAX_DESCRIPCION ? `${limpio.slice(0, MAX_DESCRIPCION - 1)}…` : limpio
}

const filas = <T extends Capa>(lista: T[], extra?: (c: T) => string | null) =>
  lista.slice(0, MAX_FILAS).map((c) => {
    const descripcion = corta(c.description)
    const mas = extra?.(c)
    return `- ${c.name}${descripcion ? `: ${descripcion}` : ""}${mas ? ` ${mas}` : ""}`
  })

function seccion(titulo: string, lineas: string[]): string | null {
  const llenas = lineas.filter((l) => l.trim().length > 0)
  return llenas.length > 0 ? `${titulo}\n${llenas.join("\n")}` : null
}

const NOMBRE_TIPO_CTA: Record<string, string> = {
  seguir: "seguir la cuenta",
  comentar: "comentar",
  palabra: "comentar una palabra",
  dm: "escribir por mensaje directo",
  comercial: "comercial",
}

function construir(s: Seccion, { perfil, editorial }: DatosDeMarca): string | null {
  switch (s) {
    case "identidad": {
      const pais = nombrePais(perfil.pais)
      const nombre = perfil.nombre
        ? `- Nombre: ${perfil.nombre}${perfil.handle ? ` (@${perfil.handle})` : ""}`
        : perfil.handle
          ? `- Cuenta: @${perfil.handle}`
          : ""
      return seccion("QUIÉN ES", [
        nombre,
        perfil.que_hace ? `- Qué hace: ${perfil.que_hace}` : "",
        perfil.mensaje_central ? `- Mensaje central: ${perfil.mensaje_central}` : "",
        `- Idioma: ${NOMBRE_IDIOMA[perfil.idioma]}${pais ? `. País: ${pais}` : ". No escribe para un país concreto"}`,
      ])
    }
    case "audiencias":
      return seccion("PARA QUIÉN ESCRIBE", filas(editorial.audiencias))
    case "temas": {
      const pilares = filas(editorial.pilares, (p) => {
        const pregunta = p.pregunta?.trim()
        return pregunta ? `(pregunta guía: ${pregunta})` : null
      })
      const verticales = filas(editorial.verticales)
      return seccion("DE QUÉ HABLA", [
        pilares.length ? "Pilares, del que más pesa al que menos:" : "",
        ...pilares,
        verticales.length ? "Verticales:" : "",
        ...verticales,
      ])
    }
    case "voz":
      return seccion("CÓMO SUENA", [
        perfil.voz_si ? `- Suena así: ${perfil.voz_si}` : "",
        perfil.voz_no ? `- No suena así: ${perfil.voz_no}` : "",
      ])
    case "reglas":
      return seccion("REGLAS DE LA MARCA", [
        perfil.reglas,
        perfil.frases_prohibidas.length
          ? `Frases que nunca se escriben: ${perfil.frases_prohibidas.map((f) => `"${f}"`).join(", ")}.`
          : "",
      ])
    case "cta": {
      const usables = ctasUsables(editorial.ctas).slice(0, MAX_FILAS)
      return seccion(
        "CTA QUE LA MARCA USA (el cierre pide uno de estos, el que mejor encaje con la pieza)",
        usables.map((c) => {
          const descripcion = corta(c.description)
          return `- ${c.name} (${NOMBRE_TIPO_CTA[c.tipo] ?? c.tipo})${descripcion ? `: ${descripcion}` : ""}`
        })
      )
    }
    case "vetos":
      return seccion("TEMAS QUE LA MARCA NO TOCA", [perfil.temas_vetados])
  }
}

/**
 * El bloque de marca de un agente. Si la marca aun no ha escrito nada de lo
 * que lee ese agente, sale una nota corta en vez de nada: sin ella el agente
 * rellenaria el hueco suponiendo un sector o un pais.
 */
export function bloqueMarca(datos: DatosDeMarca, agente: AgenteConMarca): string {
  // El idioma siempre tiene valor, asi que la identidad nunca sale vacia: se
  // cuenta como configurada solo si hay algo mas que el idioma.
  const p = datos.perfil
  const identidadPropia = Boolean(p.nombre || p.handle || p.que_hace || p.mensaje_central || p.pais)

  const partes = QUE_LEE[agente]
    .filter((s) => s !== "identidad" || identidadPropia)
    .map((s) => construir(s, datos))
    .filter((t): t is string => t !== null)

  const cabecera = "# LA MARCA"
  if (partes.length === 0) {
    return `${cabecera}
La marca todavía no ha configurado su perfil. Escribe con criterio general, en ${NOMBRE_IDIOMA[p.idioma]}, sin suponer un sector, un país ni un público concreto.`
  }

  const identidad = identidadPropia ? [] : [construir("identidad", datos)!]
  return [
    `${cabecera}
Lo escribió la propia marca. Cuando choque con un ejemplo o una costumbre de las instrucciones de arriba, manda esto.`,
    ...identidad,
    ...partes,
  ].join("\n\n")
}

/**
 * Las capas en su orden: oficio, marca, skills de la marca y contrato. El
 * contrato va siempre al final: es lo que el motor sabe leer, y si una regla de
 * marca, una skill o un prompt editado lo contradijera, la pieza no se podria
 * guardar.
 */
export function armarPrompt(capas: { oficio: string; marca: string; skills?: string; contrato: string }): string {
  return [capas.oficio, capas.marca, capas.skills ?? "", capas.contrato]
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n\n")
}
