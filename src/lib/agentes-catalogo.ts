/**
 * Que es cada agente y que se le puede tocar.
 *
 * Vive en `lib` y sin service role a proposito: la pagina de agentes y sus
 * controles de cliente leen de aqui, y duplicar la lista en los dos lados es
 * como se acaba ofreciendo en la interfaz una opcion que el servidor rechaza.
 *
 * El orden del array es el del pipeline, y es el orden en que se pintan: la
 * barra lateral cuenta la historia del recorrido de una noticia.
 */

export type ClaveAgente =
  | "extraccion"
  | "analisis"
  | "angulo"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "criterio"
  | "revisor"
  | "publicacion"
  | "redaccion"

export type Conexion = {
  nombre: string
  /** Donde se conecta, para poder ir a arreglarlo sin buscarlo. */
  href: string
}

export type FichaAgente = {
  clave: ClaveAgente
  nombre: string
  /** Una linea: que hace y con que se queda. */
  resumen: string
  /** Los agentes sin prompt no hablan con Claude: son proceso, no redaccion. */
  usaIA: boolean
  /**
   * Sin paso anterior no hay insumo que esperar, asi que "automatico" no
   * significaria nada: la extraccion solo puede ir a mano o por reloj. Vacio:
   * no corre por su cuenta, sino dentro de otro agente (el revisor).
   */
  modos: ("manual" | "programado" | "automatico")[]
  /** Tiene un horario por canal en vez de uno solo. */
  porCanal?: boolean
  /**
   * Comparte fila con otro agente: se ve pero no se edita. Facebook es el unico
   * caso, y existe para que se entienda que sale del guion de Instagram sin
   * gastar una segunda generacion.
   */
  espejoDe?: ClaveAgente
  conexiones: Conexion[]
  /** La etapa del tablero desde la que se dispara a mano. */
  etapa: string | null
}

const CLAUDE: Conexion = { nombre: "Claude", href: "/configuracion/conexiones" }
const CANAL = (nombre: string): Conexion => ({ nombre, href: "/configuracion/conexiones" })

export const AGENTES: FichaAgente[] = [
  {
    clave: "extraccion",
    nombre: "Extraccion",
    resumen: "Sale a buscar noticias de los temas de la taxonomia y las deja en cola.",
    usaIA: false,
    modos: ["manual", "programado"],
    conexiones: [{ nombre: "Serper", href: "/configuracion/conexiones" }],
    etapa: "Traidas",
  },
  {
    clave: "analisis",
    nombre: "Analisis",
    resumen: "Lee cada noticia traida, la consolida y le pone una nota del 0 al 10.",
    usaIA: true,
    modos: ["manual", "programado", "automatico"],
    conexiones: [CLAUDE],
    etapa: "Analizadas",
  },
  {
    clave: "angulo",
    nombre: "Angulo",
    resumen: "Decide la lectura no obvia de las noticias que pasan el umbral.",
    usaIA: true,
    modos: ["manual", "programado", "automatico"],
    conexiones: [CLAUDE],
    etapa: "Angulo",
  },
  {
    clave: "instagram",
    nombre: "Instagram",
    resumen: "Escribe el guion del carrusel, lamina a lamina, desde el angulo.",
    usaIA: true,
    modos: ["manual", "programado", "automatico"],
    conexiones: [CLAUDE, CANAL("Instagram")],
    etapa: "Post",
  },
  {
    clave: "facebook",
    nombre: "Facebook",
    resumen:
      "No escribe: arma su pieza con el guion que ya hizo Instagram, sin gastar una segunda generacion.",
    usaIA: true,
    modos: ["manual", "programado", "automatico"],
    espejoDe: "instagram",
    conexiones: [CLAUDE, CANAL("Instagram"), CANAL("Facebook")],
    etapa: "Post",
  },
  {
    clave: "linkedin",
    nombre: "LinkedIn",
    resumen: "Escribe el post largo desde el angulo, con su propio criterio de forma.",
    usaIA: true,
    modos: ["manual", "programado", "automatico"],
    conexiones: [CLAUDE, CANAL("LinkedIn")],
    etapa: "Post",
  },
  {
    clave: "criterio",
    nombre: "Criterio",
    resumen:
      "Antes de escribir, anota todo lo que la noticia ya recomienda y decide lo que la marca haría o miraría primero, que no esté ahí. El post y el carrusel del mismo ángulo usan ese criterio, y se ve en la ficha.",
    usaIA: true,
    modos: [],
    conexiones: [CLAUDE],
    etapa: null,
  },
  {
    clave: "revisor",
    nombre: "Revisor",
    resumen:
      "Lee cada carrusel y cada post junto a su noticia y dice qué falla: datos sin respaldo, matices perdidos, opiniones que suenan a dato y un criterio de marca copiado de la fuente o que serviría para cualquiera. Lo que frena vuelve solo al agente para corregir.",
    usaIA: true,
    modos: [],
    conexiones: [CLAUDE],
    etapa: null,
  },
  {
    clave: "publicacion",
    nombre: "Publicacion",
    resumen: "Saca las piezas aprobadas a cada red, con su propio horario por canal.",
    usaIA: false,
    modos: ["manual", "programado", "automatico"],
    porCanal: true,
    conexiones: [],
    etapa: "Publicado",
  },
  {
    clave: "redaccion",
    nombre: "Redaccion",
    resumen:
      "Pipeline de redaccion: decide como contar la noticia y la redacta completa, citando las fuentes investigadas. Usa las mismas noticias traidas y analizadas que el de redes, con su propio umbral.",
    usaIA: true,
    modos: ["manual", "programado", "automatico"],
    conexiones: [CLAUDE],
    etapa: "Redactadas (pipeline de redaccion)",
  },
]

export function fichaDe(clave: string): FichaAgente | null {
  return AGENTES.find((a) => a.clave === clave) ?? null
}

/** Como se explica cada modo donde se elige. Evita tener que adivinarlo. */
export const EXPLICACION_MODO: Record<string, string> = {
  manual: "No corre solo. Lo disparas tu desde el estudio.",
  programado: "Corre a las horas que marques. Entre medias el trabajo se acumula en cola.",
  automatico: "Corre en cuanto el paso anterior le entrega trabajo.",
}
