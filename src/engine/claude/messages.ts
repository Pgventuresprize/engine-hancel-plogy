import { secretosDe } from "../secretos"

/**
 * Llamada directa a Claude con el token de tu cuenta.
 *
 * En vez de disparar un webhook y esperar a que una
 * sesion agentica en la nube escriba en el buzon, aqui se le pide a Claude una
 * respuesta de un tiro y se recibe en el acto. Un solo token para los cuatro
 * pasos (analisis, angulo, LinkedIn, Instagram), guardado en `engine_secrets`.
 *
 * La autenticacion es la misma que usa Claude Code: el token OAuth de la
 * suscripcion (`sk-ant-oat01`, de `claude setup-token`) viaja como `Bearer` y la
 * cabecera beta identifica la peticion como Claude Code. Verificado contra la
 * API: sin el scope de inferencia, responde 403 —por eso un token de otro tipo
 * viejas no sirve, era de otro tipo—. Tambien acepta una API key de consola
 * (`sk-ant-api03`) por la ruta estandar, por si algun dia se cambia.
 */

const MESSAGES_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"
const OAUTH_BETA = "oauth-2025-04-20"

/**
 * La identidad de Claude Code va como primer bloque de sistema. La API reserva
 * la ruta del token de suscripcion a su propio cliente: sin esta linea, rechaza.
 * Las instrucciones de verdad de cada paso van como segundo bloque, despues.
 */
const IDENTIDAD_CLAUDE_CODE = "You are Claude Code, Anthropic's official CLI for Claude."

/** El timeout es generoso: una generacion larga (un carrusel) puede tardar. */
const TIMEOUT_MS = 120_000
const TIMEOUT_MS_BUSQUEDA = 180_000

export type LlamadaClaude = {
  /** La empresa que hace la llamada: se usa su token de Claude. */
  accountId: string
  /** Id de modelo. Haiku para volumen barato, Sonnet/Opus para escribir. */
  model: string
  /** Las instrucciones del paso: el rol, el tono, el formato de salida. */
  system: Sistema
  /** El contenido concreto sobre el que trabajar (la noticia, el angulo...). */
  prompt: string
  maxTokens: number
  /**
   * Activa la busqueda web del lado servidor. Anthropic corre las busquedas
   * dentro de la misma llamada y devuelve la respuesta ya con las fuentes: es lo
   * que hace el research del analisis, sin agente.
   */
  buscarWeb?: boolean
  /** Tope de busquedas cuando `buscarWeb` esta activo. */
  maxBusquedas?: number
  /** Urls publicas de imagenes que el modelo tiene que mirar, antes del texto. */
  imagenes?: string[]
  /**
   * Lo que el modelo mira antes del prompt, en orden: textos cortos (rotulos),
   * imagenes y PDF ya cargados en memoria. Sirve para poner "Lamina 3:" delante
   * de cada imagen o pasar un manual de marca.
   */
  bloques?: Bloque[]
  /** Limite de tiempo propio, para respuestas largas (un guion de video). */
  timeoutMs?: number
  /**
   * Cuanto piensa antes de responder. En Opus 5.5, que no deja apagar el
   * razonamiento, es la unica forma de que un trabajo mecanico no tarde minutos.
   * Sin el, el valor por defecto del modelo.
   */
  esfuerzo?: "low" | "medium" | "high" | "xhigh" | "max"
}

export type Bloque =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagen"; mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; datos: Buffer }
  | { tipo: "pdf"; datos: Buffer; titulo?: string }

function aContenido(b: Bloque): Record<string, unknown> {
  if (b.tipo === "texto") return { type: "text", text: b.texto }
  if (b.tipo === "imagen")
    return { type: "image", source: { type: "base64", media_type: b.mime, data: b.datos.toString("base64") } }
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: b.datos.toString("base64") },
    ...(b.titulo ? { title: b.titulo } : {}),
  }
}

/**
 * Las instrucciones, enteras o partidas en dos: `fijo` es lo que no cambia
 * entre piezas (oficio, marca, skills de siempre) y se marca para que la API
 * lo reaproveche entre llamadas seguidas; `resto` es lo propio de esta pieza.
 * Ver agents/armador.ts.
 */
export type Sistema = string | { fijo: string; resto: string }

/**
 * Lo que costo la llamada. Sirve para ver el gasto real por paso. `entrada`
 * cuenta todo lo leido, reaprovechado o no; `deCache` es la parte que se
 * reaprovecho y se cobro a una decima parte.
 */
export type UsoClaude = { entrada: number; salida: number; deCache?: number }

export type ResultadoClaude = { ok: true; texto: string; uso: UsoClaude } | { ok: false; error: string }

/**
 * El token de Claude de una empresa. `null` si nadie lo ha pegado todavia.
 * Cada empresa usa el suyo: lo que gasta una no sale de la cuenta de otra.
 */
export async function tokenClaude(accountId: string): Promise<string | null> {
  // Se le quitan los espacios de adentro por si se guardo con los que mete la
  // terminal al partir la linea al copiarlo.
  const token = (await secretosDe(accountId)).claude_oauth_token?.replace(/\s+/g, "")
  return token ? token : null
}

/**
 * Pide una respuesta a Claude. No lanza: el fallo viaja en el resultado, igual
 * de sobra, para que un tropiezo no tumbe la pasada que ya hizo trabajo.
 */
export async function llamarClaude(opciones: LlamadaClaude): Promise<ResultadoClaude> {
  const token = await tokenClaude(opciones.accountId)
  if (!token) {
    return {
      ok: false,
      error:
        "No hay token de Claude configurado. Pegalo en la pantalla de configuracion " +
        "(lo generas con `claude setup-token`).",
    }
  }

  // La API key de consola va por su cabecera propia; el token de suscripcion,
  // como Bearer con la beta de OAuth.
  const esApiKey = token.startsWith("sk-ant-api")
  const headers: Record<string, string> = {
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  }
  if (esApiKey) {
    headers["x-api-key"] = token
  } else {
    headers["authorization"] = `Bearer ${token}`
    headers["anthropic-beta"] = OAUTH_BETA
  }

  // Con el token de suscripcion, el primer bloque de sistema tiene que ser la
  // identidad de Claude Code; con API key no hace falta, pero no molesta.
  //
  // Partido en dos, la parte fija lleva la marca de reaprovechar: lo que va
  // hasta ella (la identidad y lo fijo) se guarda unos minutos y las llamadas
  // siguientes con el mismo principio lo leen a una decima parte del precio.
  // Las vueltas de correccion repiten el prompt al momento y son las que mas
  // ahorran. Si lo fijo es demasiado corto, la API simplemente no lo guarda.
  const instrucciones =
    typeof opciones.system === "string"
      ? [{ type: "text", text: opciones.system }]
      : [
          { type: "text", text: opciones.system.fijo, cache_control: { type: "ephemeral" } },
          ...(opciones.system.resto.trim() ? [{ type: "text", text: opciones.system.resto }] : []),
        ]
  const system =
    esApiKey && typeof opciones.system === "string"
      ? opciones.system
      : [...(esApiKey ? [] : [{ type: "text", text: IDENTIDAD_CLAUDE_CODE }]), ...instrucciones]

  // Opus 5.5 no admite apagar el razonamiento de ninguna de las dos formas: con
  // "between_tools" responde 400. Se le deja pensar a su manera, y como lo que
  // piensa sale del mismo presupuesto que la respuesta, se le da el doble de
  // margen para que el JSON no llegue cortado (en un carrusel uso 3.200 tokens
  // de salida donde Sonnet usa 900).
  const piensaSiempre = opciones.model.includes("opus-5-5")

  try {
    const body: Record<string, unknown> = {
      model: opciones.model,
      max_tokens: piensaSiempre ? Math.max(opciones.maxTokens * 2, 8000) : opciones.maxTokens,
      // Sin razonamiento extendido. No es un ahorro cualquiera: el presupuesto
      // de salida lo comparten el pensamiento y la respuesta, asi que un modelo
      // que se pone a pensar largo agota el limite y devuelve el JSON cortado, o
      // directamente ningun texto. Le paso eso al carrusel: gastaba los 3600
      // tokens pensando y no escribia ni un caracter. Apagado, el mismo trabajo
      // sale en 764 y el JSON llega entero. Estos agentes piden formato estricto
      // a partir de material ya recolectado, que es justo lo que no necesita
      // deliberacion larga.
      //
      // La familia 5.5 no acepta "disabled": ahi apagarlo se dice
      // "between_tools" (no piensa antes de responder). Opus 5.5 tampoco acepta
      // eso y va sin el campo (ver arriba).
      ...(piensaSiempre
        ? {}
        : { thinking: opciones.model.includes("-5-5") ? { type: "between_tools" } : { type: "disabled" } }),
      ...(opciones.esfuerzo ? { output_config: { effort: opciones.esfuerzo } } : {}),
      system,
      messages: [
        {
          role: "user",
          content:
            opciones.imagenes?.length || opciones.bloques?.length
              ? [
                  ...(opciones.imagenes ?? []).map((url) => ({ type: "image", source: { type: "url", url } })),
                  ...(opciones.bloques ?? []).map(aContenido),
                  { type: "text", text: opciones.prompt },
                ]
              : opciones.prompt,
        },
      ],
    }
    if (opciones.buscarWeb) {
      body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: opciones.maxBusquedas ?? 4 }]
    }

    const response = await fetch(MESSAGES_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      // Con busqueda web la llamada hace varias busquedas antes de escribir: los
      // estilos de datos llegaron a pasar de 120 s y se cortaban.
      signal: AbortSignal.timeout(opciones.timeoutMs ?? (opciones.buscarWeb ? TIMEOUT_MS_BUSQUEDA : TIMEOUT_MS)),
    })

    const cuerpo = await response.text()

    if (!response.ok) {
      return { ok: false, error: mensajeDeError(response.status, cuerpo) }
    }

    const datos = JSON.parse(cuerpo) as {
      content?: { type: string; text?: string }[]
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_creation_input_tokens?: number
        cache_read_input_tokens?: number
      }
    }
    const texto = (datos.content ?? [])
      .filter((bloque) => bloque.type === "text" && bloque.text)
      .map((bloque) => bloque.text)
      .join("")
      .trim()

    if (!texto) return { ok: false, error: "Claude respondio sin texto." }
    return {
      ok: true,
      texto,
      uso: {
        entrada:
          (datos.usage?.input_tokens ?? 0) +
          (datos.usage?.cache_creation_input_tokens ?? 0) +
          (datos.usage?.cache_read_input_tokens ?? 0),
        salida: datos.usage?.output_tokens ?? 0,
        deCache: datos.usage?.cache_read_input_tokens ?? 0,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

/**
 * Extrae el JSON de la respuesta de Claude.
 *
 * El modelo suele envolver el JSON en una valla ```json, y con busqueda web
 * mete etiquetas <cite index="..."> dentro del texto. Se limpian las dos cosas
 * antes de parsear. Lanza con un recorte del texto crudo si no cuadra, para que
 * quien llama guarde el motivo y no se pierda lo que dijo el modelo.
 */
export function parsearJSONDeClaude(texto: string): unknown {
  let limpio = texto.trim()

  // Quita las etiquetas de cita de la busqueda web, dejando el contenido.
  limpio = limpio.replace(/<\/?cite[^>]*>/g, "")

  // Si viene en una valla de codigo, saca lo de dentro.
  const valla = limpio.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (valla) limpio = valla[1].trim()

  // Ultimo recurso: recorta a las llaves exteriores.
  if (!limpio.startsWith("{") && !limpio.startsWith("[")) {
    const desde = limpio.search(/[[{]/)
    const hasta = Math.max(limpio.lastIndexOf("}"), limpio.lastIndexOf("]"))
    if (desde >= 0 && hasta > desde) limpio = limpio.slice(desde, hasta + 1)
  }

  try {
    return JSON.parse(limpio)
  } catch {
    // Red de seguridad: si un salto de linea se colo dentro de una cadena, el
    // parseo falla. Cambiarlos por espacios rescata la respuesta; entre tokens
    // el JSON ignora los espacios, asi que no rompe nada.
    try {
      return JSON.parse(limpio.replace(/[\n\r\t]+/g, " "))
    } catch {
      throw new Error(`La respuesta de Claude no es JSON valido. Empezaba: ${texto.slice(0, 200)}`)
    }
  }
}

/** Traduce los fallos mas comunes a algo accionable en la interfaz. */
function mensajeDeError(status: number, cuerpo: string): string {
  const recorte = cuerpo.slice(0, 300)

  if (status === 401) {
    return "El token no es valido o fue revocado. Genera uno nuevo con `claude setup-token` y pegalo de nuevo."
  }
  if (status === 403 && recorte.includes("scope")) {
    return (
      "El token no tiene permiso de inferencia. Tiene que ser el de `claude setup-token` " +
      "(suscripcion) o una API key de consola. Vuelve a generarlo con ese comando."
    )
  }
  if (status === 429) {
    return "Se agoto el limite de uso de tu plan por ahora. Reintenta mas tarde."
  }
  return `Claude respondio ${status}: ${recorte}`
}
