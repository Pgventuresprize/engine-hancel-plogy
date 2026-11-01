import { modeloDe } from "../agents/modelos"
import { promptPara } from "../agents/prompts"
import { llamarClaude } from "../claude/messages"
import type { Revision } from "../content/revisor"
import { bloqueMarca } from "../marca/bloque"
import { textoDeCarrusel } from "../marca/ejemplos"
import { datosParaPrompt } from "../marca/prompt"
import { parseInstagramResponse } from "../render/carousel"
import { supabaseAdmin } from "../supabase-admin"
import { escribirMensaje, type AgenteChat, type Mensaje } from "./mensajes"

/**
 * Conversar con los agentes en el chat.
 *
 * Responde el agente al que se le habla: el que se nombra con @, el unico que
 * se eligio al empezar, el ultimo que hablo de su pieza o, si no, el
 * coordinador. Cada uno con su oficio y la marca (la parte fija de su prompt,
 * la misma que en el pipeline) mas un contrato de chat y lo que tiene delante:
 * las piezas de la conversacion y lo hablado.
 *
 * Aun no cambia piezas: eso llega con el panel de la pieza (fase 3). Hasta
 * entonces propone el cambio con el texto exacto y lo dice en claro.
 */

/** El coordinador conversa y reparte: rapido y bueno escribiendo. */
const MODELO_COORDINADOR = "claude-sonnet-5-5"
/** Nombrar y resumir es poco texto: barato. */
const MODELO_CORTO = "claude-haiku-4-5-20251001"
/** A partir de cuantos mensajes lo viejo se resume en vez de mandarse entero. */
const MENSAJES_ENTEROS = 20
/** Los ultimos que siempre van enteros cuando hay resumen. */
const MENSAJES_RECIENTES = 12

const NOMBRE: Record<AgenteChat, string> = {
  coordinador: "Coordinador",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  revisor: "Revisor",
}

const MENCION = /@(coordinador|instagram|linkedin|revisor)\b/i

/** Quien contesta el ultimo mensaje de la persona. */
export function quienResponde(mensajes: Pick<Mensaje, "rol" | "agente" | "contenido" | "agentes_pedidos" | "noticia">[]): AgenteChat {
  const ultimo = [...mensajes].reverse().find((m) => m.rol === "usuario")
  const mencion = ultimo?.contenido.match(MENCION)?.[1]?.toLowerCase()
  if (mencion) return mencion as AgenteChat
  // Al empezar sin noticia y con un solo agente elegido, habla ese.
  const primero = mensajes[0]
  if (primero?.rol === "usuario" && !primero.noticia && primero.agentes_pedidos?.length === 1) return primero.agentes_pedidos[0]
  // Si no, el ultimo agente que hablo (el de la pieza que se esta mirando).
  const ultimoAgente = [...mensajes].reverse().find((m) => m.rol === "agente" && m.agente && m.agente !== "coordinador")
  return ultimoAgente?.agente ?? "coordinador"
}

type Pieza = {
  id: string
  network: string
  status: string
  payload: Record<string, unknown>
  revision: Revision | null
  job_instagram_id: string | null
  content_angle_id: string
  created_at: string
}

/** Lo que dice una pieza, en texto: las laminas del carrusel o el post. */
async function textoDePieza(p: Pieza): Promise<string> {
  if (p.network === "instagram" && p.job_instagram_id) {
    const { data } = await supabaseAdmin().from("jobs_instagram").select("respuesta").eq("id", p.job_instagram_id).maybeSingle()
    const respuesta = (data as { respuesta?: unknown } | null)?.respuesta
    try {
      const { slides, caption, hashtags } = parseInstagramResponse(respuesta)
      const cierre = ((respuesta ?? {}) as { cierre?: { title?: string; body?: string } | null }).cierre ?? null
      return textoDeCarrusel({
        laminas: slides.map((s) =>
          s.type === "photo_hook"
            ? { hook: s.hook }
            : { tipo: s.items?.length ? "lista" : null, title: s.title, body: s.body, lead: s.lead, items: s.items }
        ),
        cierre,
        caption,
        hashtags,
      })
    } catch {
      return "(No se pudo leer el guion de este carrusel.)"
    }
  }
  const body = typeof p.payload.body === "string" ? p.payload.body.trim() : ""
  const hook = typeof p.payload.hook === "string" ? p.payload.hook.trim() : ""
  return [hook && !body.startsWith(hook) ? hook : "", body].filter(Boolean).join("\n\n") || "(Sin texto.)"
}

function textoDeRevision(r: Revision | null): string {
  if (!r?.hallazgos?.length) return "El revisor no encontró nada."
  return r.hallazgos.map((h) => `- [${h.nivel}] ${h.donde}: ${h.detalle}${h.pide ? ` → ${h.pide}` : ""}`).join("\n")
}

/** Las piezas de la conversacion, con su texto y su revision, para el contexto. */
async function piezasDeConversacion(accountId: string, conversacionId: string): Promise<{ red: string; texto: string }[]> {
  const supabase = supabaseAdmin()
  const { data: enlaces } = await supabase.from("conversacion_piezas").select("piece_id").eq("conversacion_id", conversacionId)
  const ids = ((enlaces ?? []) as { piece_id: string }[]).map((e) => e.piece_id)
  if (!ids.length) return []
  const { data } = await supabase
    .from("content_pieces")
    .select("id, network, status, payload, revision, job_instagram_id, content_angle_id, created_at")
    .eq("account_id", accountId)
    .in("id", ids)
    .order("created_at")
  const piezas = (data ?? []) as Pieza[]
  const angulos = new Map<string, string>()
  const { data: filas } = await supabase
    .from("content_angles")
    .select("id, angle, raw_news (title)")
    .in("id", [...new Set(piezas.map((p) => p.content_angle_id))])
  for (const f of (filas ?? []) as unknown as { id: string; angle: string; raw_news: { title: string | null } | null }[]) {
    angulos.set(f.id, `Noticia: ${f.raw_news?.title ?? "sin título"}\nÁngulo: ${f.angle}`)
  }
  return Promise.all(
    piezas.map(async (p) => ({
      red: p.network,
      texto: [
        `## ${p.network === "instagram" ? "Carrusel de Instagram" : "Post de LinkedIn"} (${p.status === "approved" ? "aprobado" : p.status === "published" ? "publicado" : "borrador"})`,
        angulos.get(p.content_angle_id) ?? "",
        await textoDePieza(p),
        `Lo que encontró el revisor:\n${textoDeRevision(p.revision)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    }))
  )
}

/** Para el revisor sin piezas en la conversacion: los ultimos borradores frenados de la marca. */
async function frenadosDeLaMarca(accountId: string): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("content_pieces")
    .select("id, network, status, payload, revision, job_instagram_id, content_angle_id, created_at")
    .eq("account_id", accountId)
    .eq("status", "generated")
    .order("created_at", { ascending: false })
    .limit(20)
  const frenados = ((data ?? []) as Pieza[]).filter((p) => p.revision?.frena).slice(0, 5)
  if (!frenados.length) return "No hay borradores frenados ahora mismo."
  const partes = await Promise.all(
    frenados.map(async (p) => `## ${p.network === "instagram" ? "Carrusel" : "Post de LinkedIn"} del ${p.created_at.slice(0, 10)}\n${(await textoDePieza(p)).slice(0, 5000)}\n\nLo frenó:\n${textoDeRevision(p.revision)}`)
  )
  return `# BORRADORES FRENADOS DE LA MARCA\n\n${partes.join("\n\n")}`
}

/** Las noticias con angulo listas para pieza: el coordinador las propone. */
async function noticiasListas(accountId: string): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("content_angles")
    .select("angle, raw_news (title, relevance_score)")
    .eq("account_id", accountId)
    .eq("status", "angled")
    .order("created_at", { ascending: false })
    .limit(8)
  const filas = (data ?? []) as unknown as { angle: string; raw_news: { title: string | null; relevance_score: number | null } | null }[]
  if (!filas.length) return "Ahora no hay noticias con ángulo decidido esperando pieza."
  return filas.map((f) => `- ${f.raw_news?.title ?? "sin título"} (${f.raw_news?.relevance_score ?? "–"}/10). Ángulo: ${f.angle}`).join("\n")
}

const OFICIO_COORDINADOR = `Eres el coordinador del equipo de agentes de contenido de la marca en Hancel. El equipo: Instagram (arma carruseles), LinkedIn (escribe posts) y el Revisor (revisa cada pieza antes de publicarla y frena lo que no cumple). Tú hablas con la persona, entiendes qué necesita y la orientas; no escribes piezas tú.`

function contratoDeChat(agente: AgenteChat, persona: string): string {
  return `# ESTÁS EN EL CHAT DE HANCEL

Hablas con ${persona}, del equipo de la marca, en una conversación donde también están el Coordinador, Instagram, LinkedIn y el Revisor. Tú eres ${NOMBRE[agente]}.

- Responde en español, en prosa breve: de dos a seis frases, o una lista corta si de verdad ayuda. Sin JSON, sin encabezados, sin firmar y sin empezar con tu nombre.
- Habla como colega: directo, concreto, sin relleno ni halagos.
- Cuando hables de una pieza, di dónde (lámina, párrafo) y el texto exacto.
- Todavía no puedes cambiar piezas desde el chat. Si te piden un cambio, propónlo con el texto exacto como quedaría y aclara que por ahora se aplica a mano en el Estudio. Nunca digas que ya lo cambiaste.
- Para crear una pieza nueva, la persona empieza una conversación nueva, adjunta una noticia con ángulo decidido y elige quién trabaja. Si te piden una pieza, explícalo así.
- Si te hablan de algo que es de otro agente, dilo y sugiere escribirle con @Instagram, @LinkedIn, @Revisor o @Coordinador.
- No inventes datos de la noticia ni de la marca: si algo no está en lo que tienes delante, dilo.`
}

/** Lo hablado, como transcripcion: con resumen de lo viejo si la conversacion es larga. */
async function transcripcion(
  accountId: string,
  conversacionId: string,
  mensajes: Mensaje[],
  persona: string
): Promise<string> {
  const quien = (m: Mensaje) => (m.rol === "usuario" ? persona : NOMBRE[m.agente ?? "coordinador"])
  const linea = (m: Mensaje) =>
    `[${quien(m)}] ${m.contenido}${m.noticia ? `\n(Noticia adjunta: ${m.noticia.titulo})` : ""}${
      m.referencias?.length ? `\n(Tarjeta: ${m.referencias.map((r) => `${r.titulo}, ${r.meta}`).join("; ")})` : ""
    }`

  if (mensajes.length <= MENSAJES_ENTEROS) return mensajes.map(linea).join("\n\n")

  const recientes = mensajes.slice(-MENSAJES_RECIENTES)
  const corte = recientes[0].created_at
  const supabase = supabaseAdmin()
  const { data: conv } = await supabase.from("conversaciones").select("resumen, resumen_hasta").eq("id", conversacionId).maybeSingle()
  let resumen = (conv as { resumen: string | null; resumen_hasta: string | null } | null)?.resumen ?? ""
  const hasta = (conv as { resumen_hasta: string | null } | null)?.resumen_hasta ?? null

  // Lo que quedo entre el resumen guardado y los recientes se suma al resumen.
  const pendientes = mensajes.filter((m) => m.created_at < corte && (!hasta || m.created_at > hasta))
  if (pendientes.length) {
    const r = await llamarClaude({
      paso: "chat-resumen",
      accountId,
      model: MODELO_CORTO,
      system:
        "Resumes conversaciones de trabajo de un equipo de contenido. Conserva decisiones, pedidos, cambios propuestos o aplicados, piezas y lo que quedó pendiente. Sin adornos, en español, en viñetas cortas. Máximo 250 palabras.",
      prompt: `${resumen ? `Resumen hasta ahora:\n${resumen}\n\n` : ""}Mensajes nuevos que hay que sumar:\n\n${pendientes.map(linea).join("\n\n")}\n\nDevuelve solo el resumen actualizado.`,
      maxTokens: 700,
    })
    if (r.ok) {
      resumen = r.texto.trim()
      await supabase
        .from("conversaciones")
        .update({ resumen, resumen_hasta: pendientes[pendientes.length - 1].created_at })
        .eq("id", conversacionId)
        .eq("account_id", accountId)
    }
  }
  return `${resumen ? `(Resumen de lo hablado antes)\n${resumen}\n\n(Lo último)\n` : ""}${recientes.map(linea).join("\n\n")}`
}

/**
 * La respuesta al ultimo mensaje de la persona, en streaming por `alTexto`.
 * Guarda el mensaje del agente al terminar (o uno que dice por que no pudo).
 */
export async function responder(o: {
  accountId: string
  conversacionId: string
  persona: string
  alAgente: (agente: AgenteChat) => void
  alTexto: (trozo: string) => void
}): Promise<{ agente: AgenteChat; mensaje: Mensaje }> {
  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from("mensajes")
    .select("*")
    .eq("conversacion_id", o.conversacionId)
    .eq("account_id", o.accountId)
    .order("created_at")
    .limit(400)
  if (error) throw new Error(`No se pudieron leer los mensajes: ${error.message}`)
  const mensajes = (data ?? []) as Mensaje[]
  const ultimo = [...mensajes].reverse().find((m) => m.rol === "usuario")
  if (!ultimo) throw new Error("No hay mensaje al que responder.")

  const agente = quienResponde(mensajes)
  o.alAgente(agente)

  const anteriores = mensajes.filter((m) => m.id !== ultimo.id)
  const [piezas, charla] = await Promise.all([
    piezasDeConversacion(o.accountId, o.conversacionId),
    transcripcion(o.accountId, o.conversacionId, anteriores, o.persona),
  ])

  // Lo que el agente tiene delante.
  const propias = agente === "instagram" || agente === "linkedin" ? piezas.filter((p) => p.red === agente) : piezas
  const contexto: string[] = []
  if (propias.length) contexto.push(`# LAS PIEZAS DE ESTA CONVERSACIÓN\n\n${propias.map((p) => p.texto).join("\n\n")}`)
  else if (agente === "revisor") contexto.push(await frenadosDeLaMarca(o.accountId))
  if (agente === "coordinador") contexto.push(`# NOTICIAS CON ÁNGULO DECIDIDO, LISTAS PARA PIEZA\n\n${await noticiasListas(o.accountId)}`)

  let fijo: string
  let modelo: string
  if (agente === "coordinador") {
    const datos = await datosParaPrompt(o.accountId)
    fijo = `${OFICIO_COORDINADOR}\n\n${bloqueMarca(datos, "contenido")}`
    modelo = MODELO_COORDINADOR
  } else {
    const [prompt, m] = await Promise.all([promptPara(o.accountId, agente, null), modeloDe(o.accountId, agente)])
    fijo = prompt.fijo
    modelo = m
  }

  const prompt = [
    ...contexto,
    charla ? `# LO HABLADO HASTA AHORA\n\n${charla}` : "",
    `# EL MENSAJE AL QUE RESPONDES\n\n[${o.persona}] ${ultimo.contenido}${ultimo.noticia ? `\n(Noticia adjunta: ${ultimo.noticia.titulo})` : ""}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  const r = await llamarClaude({
    paso: `chat-${agente}`,
    accountId: o.accountId,
    model: modelo,
    system: { fijo, resto: contratoDeChat(agente, o.persona) },
    prompt,
    maxTokens: 1500,
    // Opus no deja apagar el razonamiento: sin esto, una respuesta corta tarda minutos.
    ...(modelo.includes("opus") ? { esfuerzo: "low" as const } : {}),
    alTexto: o.alTexto,
  })

  const mensaje = await escribirMensaje({
    accountId: o.accountId,
    conversacionId: o.conversacionId,
    rol: "agente",
    agente,
    contenido: r.ok ? r.texto.trim() || "…" : `No pude responder: ${r.error}`,
    uso: r.ok ? { modelo, ...r.uso } : { error: r.error },
  })
  return { agente, mensaje }
}

/**
 * El nombre automatico: tras la primera respuesta y otra vez al llegar al
 * sexto mensaje, mientras nadie lo haya puesto a mano.
 */
export async function nombrarSiToca(accountId: string, conversacionId: string, persona: string): Promise<void> {
  const supabase = supabaseAdmin()
  const [{ data: conv }, { data: mensajes }] = await Promise.all([
    supabase.from("conversaciones").select("titulo_auto").eq("id", conversacionId).eq("account_id", accountId).maybeSingle(),
    supabase.from("mensajes").select("rol, agente, contenido, uso, created_at").eq("conversacion_id", conversacionId).order("created_at").limit(12),
  ])
  if (!(conv as { titulo_auto: boolean } | null)?.titulo_auto) return
  const lista = (mensajes ?? []) as (Pick<Mensaje, "rol" | "agente" | "contenido" | "created_at"> & { uso: unknown })[]
  // Las respuestas conversadas son las que guardan su uso; las de los trabajos no.
  const conversadas = lista.filter((m) => m.rol === "agente" && m.uso)
  const primera = conversadas.length === 1 && lista[lista.length - 1] === conversadas[0]
  const sexta = lista.length === 6 || lista.length === 7
  if (!primera && !sexta) return

  const texto = lista
    .slice(0, 8)
    .map((m) => `[${m.rol === "usuario" ? persona : NOMBRE[m.agente ?? "coordinador"]}] ${m.contenido.slice(0, 600)}`)
    .join("\n")
  const r = await llamarClaude({
    paso: "chat-titulo",
    accountId,
    model: MODELO_CORTO,
    system:
      "Pones nombre a conversaciones de un equipo de contenido, como el título de un chat en una lista. No participas en la conversación ni la contestas: solo la nombras.",
    prompt: `<conversacion>\n${texto}\n</conversacion>\n\nEscribe el nombre de esta conversación: de 3 a 6 palabras, en español, sin comillas, sin markdown, sin punto final, con mayúscula solo al inicio y en nombres propios. Nombra el tema concreto (la noticia, la pieza, el cambio), no la acción genérica. Responde solo con el nombre.`,
    maxTokens: 40,
  })
  if (!r.ok) return
  const titulo = (r.texto.trim().split("\n")[0] ?? "")
    .replace(/["“”«»*_#`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "")
  // Un nombre largo es una respuesta, no un nombre: mejor quedarse con el provisional.
  if (!titulo || titulo.split(" ").length > 9 || titulo.length > 70) return
  await supabase
    .from("conversaciones")
    .update({ titulo })
    .eq("id", conversacionId)
    .eq("account_id", accountId)
    .eq("titulo_auto", true)
}
