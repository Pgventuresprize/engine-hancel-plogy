import { parseClasificacion } from "../marca/clasificacion"
import type { AnglePayload, PiecePayload } from "./types"

/**
 * Lectura de lo que devuelve el agente.
 *
 * Es la unica frontera del sistema cuyo contrato no controla el codigo: el
 * prompt vive en Claude y puede cambiar de forma sin avisar. La postura es ser
 * tolerante con la forma y explicito al fallar — se aceptan las variantes
 * plausibles y, si nada cuadra, se lanza diciendo que se esperaba. Quien llama
 * marca el job 'failed' con ese motivo y conserva siempre la `respuesta` cruda,
 * asi que nunca se pierde lo que dijo el agente.
 */

function asArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    for (const clave of ["angles", "angulos", "results", "data"]) {
      if (Array.isArray(obj[clave])) return obj[clave] as unknown[]
    }
  }
  return null
}

function texto(value: unknown): string | null {
  if (typeof value !== "string") return null
  const limpio = value.trim()
  return limpio.length > 0 ? limpio : null
}

/**
 * Cuantos angulos vengan lo decide el agente, no este codigo: se materializa
 * uno por cada elemento de la respuesta.
 */
export function parseAngleResponse(respuesta: unknown): AnglePayload[] {
  // Un objeto suelto con forma de angulo tambien vale: es un abanico de uno.
  const bruto =
    asArray(respuesta) ??
    (respuesta && typeof respuesta === "object" && "angle" in respuesta ? [respuesta] : null)

  if (!bruto || bruto.length === 0) {
    throw new Error(
      "El agente de angulo no devolvio ningun angulo. Se esperaba " +
        '{"angles":[{"angle":"...","thesis":"...","playbook_format":"..."}]}.'
    )
  }

  const angulos: AnglePayload[] = []
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const angle = texto(obj.angle) ?? texto(obj.angulo)
    if (!angle) continue
    angulos.push({
      angle,
      thesis: texto(obj.thesis) ?? texto(obj.tesis),
      playbook_format: texto(obj.playbook_format) ?? texto(obj.formato),
      // Ya traducida a filas de la marca por generarAngulo; aqui solo se lee.
      clasificacion: parseClasificacion(obj.clasificacion),
    })
  }

  if (angulos.length === 0) {
    throw new Error(
      'El agente de angulo devolvio elementos sin campo "angle" con texto. ' +
        'Se esperaba {"angles":[{"angle":"...","thesis":"...","playbook_format":"..."}]}.'
    )
  }

  return angulos
}

function hashtags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => texto(item))
    .filter((item): item is string => item !== null)
    .map((item) => (item.startsWith("#") ? item : `#${item}`))
}

/**
 * El post. `body` es lo unico imprescindible: sin texto no hay pieza.
 *
 * Se aceptan las dos formas que se han visto en la practica: `post` como objeto
 * con el cuerpo dentro, y `post` como el cuerpo directamente, con el resto de
 * campos colgando de la raiz.
 */
export function parseLinkedinResponse(respuesta: unknown): PiecePayload {
  const raiz = (respuesta ?? {}) as Record<string, unknown>
  const post = (
    raiz.post && typeof raiz.post === "object" ? raiz.post : raiz
  ) as Record<string, unknown>

  const body =
    texto(post.body) ??
    texto(post.cuerpo) ??
    texto(post.texto) ??
    texto(post.content) ??
    // `post` como string: el cuerpo entero, sin envoltorio.
    texto(raiz.post)

  if (!body) {
    throw new Error(
      "El agente de LinkedIn no devolvio el cuerpo del post. Se esperaba " +
        '{"post":{"hook":"...","body":"...","hashtags":["..."],"cta":"..."}} ' +
        'o {"hook":"...","post":"<el texto>"}.'
    )
  }

  // Algunas respuestas repiten el hook como primera linea del cuerpo. Pintar los
  // dos dejaria el post empezando dos veces igual, asi que se guarda solo una.
  const hookBruto = texto(post.hook) ?? texto(post.gancho) ?? texto(raiz.hook)
  const hook = hookBruto && body.startsWith(hookBruto) ? null : hookBruto

  return {
    hook,
    body,
    hashtags: hashtags(post.hashtags ?? raiz.hashtags),
    cta: texto(post.cta) ?? texto(raiz.cta),
    notas: texto(raiz.notas) ?? texto(raiz.notes),
  }
}
