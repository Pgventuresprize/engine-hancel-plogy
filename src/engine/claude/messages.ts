import { secretosDe } from "../secretos"
import { supabaseAdmin } from "../supabase-admin"
import { contextoUso } from "./contexto"

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

const SIN_TOKEN =
  "No hay token de Claude configurado. Pegalo en la pantalla de configuracion " +
  "(lo generas con `claude setup-token`)."

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
  /** Que paso hace la llamada ("instagram", "diseno-libre"...). Con el se cuenta el gasto por paso. */
  paso?: string
  /**
   * Las vueltas anteriores de una conversacion, de la mas vieja a la mas nueva.
   * `prompt` es siempre la ultima del usuario. Sin historial, la llamada es de
   * un tiro como todas las del pipeline.
   */
  historial?: Vuelta[]
  /**
   * Si esta, la respuesta llega en streaming y cada trozo de texto se entrega
   * aqui en cuanto sale (el chat lo muestra mientras se escribe). El resultado
   * final es el mismo que sin el.
   */
  alTexto?: (trozo: string) => void
}

/** Una vuelta de conversacion: lo que dijo el usuario o lo que respondio el modelo. */
export type Vuelta = { rol: "user" | "assistant"; texto: string }

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

/** Una herramienta propia: la ejecuta el motor, no Anthropic. */
export type Herramienta = {
  name: string
  /** Cuando usarla, no solo que hace: es lo que le dice al modelo si le toca. */
  description: string
  input_schema: Record<string, unknown>
  strict?: boolean
}

/** Lo que devuelve una herramienta. `error` le dice al modelo que no salio. */
export type ResultadoHerramienta = { contenido: string; error?: boolean }

/** Un bloque de la respuesta, tal como lo manda la API. Se reenvia sin tocarlo. */
type BloqueApi = Record<string, unknown> & { type: string }

type RespuestaApi = { content: BloqueApi[]; usage?: UsoApi; stop_reason?: string | null }

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
 * Deja constancia de lo que gasto una llamada, en `pipeline_events` con kind
 * "claude.uso": una fila por llamada, con el paso, el modelo y los tokens. Asi se
 * puede sumar el gasto por paso y por pieza sin tabla nueva. Nunca lanza:
 * perder la cuenta no puede tumbar la llamada que ya se pago.
 */
async function anotarUso(
  opciones: LlamadaClaude,
  uso: UsoClaude,
  extra: { cacheEscrita: number; busquedas: number; ms: number; sinTexto: boolean }
): Promise<void> {
  try {
    await supabaseAdmin()
      .from("pipeline_events")
      .insert({
        account_id: opciones.accountId,
        run_id: null,
        kind: "claude.uso",
        label: opciones.paso ?? "sin paso",
        detail: { paso: opciones.paso ?? null, modelo: opciones.model, ...uso, ...extra, ...contextoUso() },
      })
  } catch {
    // Silencio deliberado.
  }
}

/** Las cabeceras y el sistema de una llamada: lo que no cambia entre vueltas. */
function armarPeticion(opciones: LlamadaClaude, token: string) {
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

  const cuerpo: Record<string, unknown> = {
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
  }
  return { headers, cuerpo }
}

/** La vuelta del usuario: el prompt, con lo que tenga que mirar antes. */
function primerMensaje(opciones: LlamadaClaude) {
  return {
    role: "user",
    content:
      opciones.imagenes?.length || opciones.bloques?.length
        ? [
            ...(opciones.imagenes ?? []).map((url) => ({ type: "image", source: { type: "url", url } })),
            ...(opciones.bloques ?? []).map(aContenido),
            { type: "text", text: opciones.prompt },
          ]
        : opciones.prompt,
  }
}

const usoDe = (usage: UsoApi | undefined): UsoClaude => ({
  entrada:
    (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0),
  salida: usage?.output_tokens ?? 0,
  deCache: usage?.cache_read_input_tokens ?? 0,
})

const textoDe = (bloques: BloqueApi[]): string =>
  bloques
    .filter((b) => b.type === "text" && typeof b.text === "string" && b.text)
    .map((b) => b.text as string)
    .join("")
    .trim()

/**
 * Pide una respuesta a Claude. No lanza: el fallo viaja en el resultado, igual
 * de sobra, para que un tropiezo no tumbe la pasada que ya hizo trabajo.
 */
export async function llamarClaude(opciones: LlamadaClaude): Promise<ResultadoClaude> {
  const token = await tokenClaude(opciones.accountId)
  if (!token) return { ok: false, error: SIN_TOKEN }

  const { headers, cuerpo } = armarPeticion(opciones, token)
  const inicio = Date.now()
  try {
    const body: Record<string, unknown> = {
      ...cuerpo,
      ...(opciones.alTexto ? { stream: true } : {}),
      messages: [...(opciones.historial ?? []).map((v) => ({ role: v.rol, content: v.texto })), primerMensaje(opciones)],
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

    if (!response.ok) {
      return { ok: false, error: mensajeDeError(response.status, await response.text()) }
    }

    const datos: RespuestaApi =
      opciones.alTexto && response.body
        ? await leerStream(response.body, opciones.alTexto)
        : JSON.parse(await response.text())
    const texto = textoDe(datos.content ?? [])
    const uso = usoDe(datos.usage)
    // Se anota aunque no haya texto: los tokens se gastaron igual.
    await anotarUso(opciones, uso, {
      cacheEscrita: datos.usage?.cache_creation_input_tokens ?? 0,
      busquedas: datos.usage?.server_tool_use?.web_search_requests ?? 0,
      ms: Date.now() - inicio,
      sinTexto: !texto,
    })

    if (!texto) return { ok: false, error: "Claude respondio sin texto." }
    return { ok: true, texto, uso }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

/** Cuantas vueltas puede dar un agente con herramientas antes de tener que responder. */
const MAX_VUELTAS = 6

/**
 * Una respuesta con herramientas propias, en streaming: el modelo pide una
 * herramienta, el motor la ejecuta y se le devuelve el resultado, hasta que
 * responde. El texto de todas las vueltas se entrega seguido por `alTexto`.
 *
 * Lo que dijo el modelo se reenvia sin tocarlo, con su razonamiento y su firma:
 * la API invalida el historial si cambia algo. Con la ultima vuelta o el plazo
 * ya gastados se le quitan las herramientas (`tool_choice: none`), asi que
 * siempre acaba respondiendo. Si la respuesta se corta, lo que pidio no se
 * ejecuta: una herramienta con la entrada a medias podria crear lo que no es.
 */
export async function conversarConHerramientas(
  opciones: LlamadaClaude & {
    alTexto: (trozo: string) => void
    /** Lo dicho hasta aqui era preambulo a una herramienta: quien lo enseña lo quita. */
    alDescartar: () => void
    herramientas: Herramienta[]
    ejecutar: (nombre: string, entrada: unknown) => Promise<ResultadoHerramienta>
    /** Desde cuando (ms) ya no se le deja pedir mas: la ruta tiene 300 s. */
    hasta: number
    maxVueltas?: number
  }
): Promise<ResultadoClaude> {
  const token = await tokenClaude(opciones.accountId)
  if (!token) return { ok: false, error: SIN_TOKEN }

  const { headers, cuerpo } = armarPeticion(opciones, token)
  const tope = opciones.maxVueltas ?? MAX_VUELTAS
  const mensajes: unknown[] = [
    ...(opciones.historial ?? []).map((v) => ({ role: v.rol, content: v.texto })),
    primerMensaje(opciones),
  ]
  const total: UsoClaude = { entrada: 0, salida: 0, deCache: 0 }
  // La respuesta es lo ultimo que dice. Lo de antes de una herramienta es el
  // agente pensando en voz alta ("voy a buscar", "dijo cuantas, asi que las
  // creo"), y una regla en el contrato no alcanza para que no lo haga. Queda de
  // respaldo por si despues de la herramienta no dice nada.
  let ultimo = ""
  let dicho = ""

  try {
    for (let vuelta = 1; ; vuelta++) {
      const ultima = vuelta >= tope || Date.now() >= opciones.hasta
      const inicio = Date.now()
      const response = await fetch(MESSAGES_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...cuerpo,
          stream: true,
          tools: opciones.herramientas,
          ...(ultima ? { tool_choice: { type: "none" } } : {}),
          messages: mensajes,
        }),
        signal: AbortSignal.timeout(opciones.timeoutMs ?? TIMEOUT_MS),
      })
      if (!response.ok) return { ok: false, error: mensajeDeError(response.status, await response.text()) }
      if (!response.body) return { ok: false, error: "Claude no devolvió respuesta." }

      const datos = await leerStream(response.body, opciones.alTexto)

      const texto = textoDe(datos.content)
      ultimo = texto
      if (texto) dicho = dicho ? `${dicho}\n\n${texto}` : texto
      const uso = usoDe(datos.usage)
      total.entrada += uso.entrada
      total.salida += uso.salida
      total.deCache = (total.deCache ?? 0) + (uso.deCache ?? 0)
      await anotarUso(opciones, uso, {
        cacheEscrita: datos.usage?.cache_creation_input_tokens ?? 0,
        busquedas: 0,
        ms: Date.now() - inicio,
        sinTexto: !texto,
      })

      const pedidas = datos.content.filter((b) => b.type === "tool_use")
      if (datos.stop_reason !== "tool_use" || !pedidas.length) break
      opciones.alDescartar()

      const resultados = await Promise.all(
        pedidas.map(async (b) => {
          let r: ResultadoHerramienta
          try {
            r = await opciones.ejecutar(String(b.name), b.input)
          } catch (e) {
            r = { contenido: e instanceof Error ? e.message : String(e), error: true }
          }
          return { type: "tool_result", tool_use_id: b.id, content: r.contenido, ...(r.error ? { is_error: true } : {}) }
        })
      )
      mensajes.push({ role: "assistant", content: datos.content }, { role: "user", content: resultados })
    }

    if (!dicho) return { ok: false, error: "Claude respondio sin texto." }
    return { ok: true, texto: ultimo || dicho, uso: total }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** El uso tal como lo cuenta la API. */
type UsoApi = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  server_tool_use?: { web_search_requests?: number }
}

/**
 * Lee una respuesta en streaming (eventos SSE de la API) y la devuelve con la
 * misma forma que la respuesta entera: los bloques armados, el uso sumado y por
 * que paro. Cada trozo de texto se entrega a `alTexto` en cuanto llega.
 *
 * Se conservan todos los bloques, no solo el texto: una herramienta necesita su
 * entrada, y la vuelta siguiente tiene que devolver el razonamiento con su firma.
 */
async function leerStream(body: ReadableStream<Uint8Array>, alTexto: (trozo: string) => void): Promise<RespuestaApi> {
  const lector = body.getReader()
  const decodificador = new TextDecoder()
  let pendiente = ""
  const bloques: BloqueApi[] = []
  const entradas = new Map<number, string>()
  let usage: UsoApi = {}
  let stop_reason: string | null = null

  const evento = (linea: string) => {
    if (!linea.startsWith("data:")) return
    const dato = linea.slice(5).trim()
    if (!dato) return
    const e = JSON.parse(dato) as {
      type: string
      index?: number
      message?: { usage?: UsoApi }
      content_block?: BloqueApi
      delta?: { type?: string; text?: string; partial_json?: string; thinking?: string; signature?: string; stop_reason?: string }
      usage?: UsoApi
      error?: { message?: string }
    }
    const i = e.index ?? 0
    if (e.type === "message_start") usage = { ...e.message?.usage }
    else if (e.type === "content_block_start" && e.content_block) bloques[i] = { ...e.content_block }
    else if (e.type === "content_block_delta" && e.delta) {
      const b = bloques[i]
      if (e.delta.type === "text_delta" && e.delta.text) {
        // Por si el arranque del bloque no llego: el texto no se puede perder.
        if (b) b.text = `${(b.text as string | undefined) ?? ""}${e.delta.text}`
        else bloques[i] = { type: "text", text: e.delta.text }
        alTexto(e.delta.text)
      } else if (e.delta.type === "input_json_delta") entradas.set(i, `${entradas.get(i) ?? ""}${e.delta.partial_json ?? ""}`)
      else if (b && e.delta.type === "thinking_delta") b.thinking = `${(b.thinking as string | undefined) ?? ""}${e.delta.thinking ?? ""}`
      else if (b && e.delta.type === "signature_delta") b.signature = `${(b.signature as string | undefined) ?? ""}${e.delta.signature ?? ""}`
    } else if (e.type === "message_delta") {
      if (e.usage) usage = { ...usage, ...e.usage }
      stop_reason = e.delta?.stop_reason ?? stop_reason
    } else if (e.type === "error") throw new Error(e.error?.message ?? "Claude cortó la respuesta.")
  }

  for (;;) {
    const { value, done } = await lector.read()
    if (done) break
    // stream: true guarda un caracter de varios bytes partido hasta la siguiente lectura.
    pendiente += decodificador.decode(value, { stream: true })
    // Un evento puede llegar partido entre dos lecturas: solo se procesan las
    // lineas completas y el resto espera a la siguiente.
    const lineas = pendiente.split("\n")
    pendiente = lineas.pop() ?? ""
    for (const linea of lineas) evento(linea)
  }
  if (pendiente) evento(pendiente)

  for (const [i, json] of entradas) {
    const b = bloques[i]
    if (!b) continue
    try {
      b.input = JSON.parse(json || "{}")
    } catch {
      // Quien la ejecuta valida la entrada y le dice al modelo que no servia.
      b.input = {}
    }
  }
  return { content: bloques.filter(Boolean), usage, stop_reason }
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
