import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"
import { supabaseAdmin } from "../supabase-admin"
import { dayIn, hourIn } from "../schedule"
import { familiaDeFormato, type TipoEstilo } from "@/lib/plantillas-catalogo"
import { corregirTextos } from "./ortografia"
import { dibujarConCanva, type LaminaPieza } from "./canva"
import type { Grafico, Recurso } from "./compositor"

/**
 * Normaliza el recurso del estilo Fotografico; null si no sirve. Solo los que
 * informan: lista, cifra y datos. Una "etiqueta" o un "paso" no son recursos:
 * son el antetitulo de la lamina (ver antetituloDe).
 */
function recursoDe(v: unknown): Recurso | null {
  if (!v || typeof v !== "object") return null
  const r = v as Record<string, unknown>
  const tipo = String(r.tipo)
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined)
  const items = Array.isArray(r.items) ? r.items.map(str).filter((x): x is string => Boolean(x)) : []
  if (tipo === "cifra" && str(r.valor)) return { tipo, valor: str(r.valor), texto: str(r.texto) }
  if (tipo === "lista" && items.length) return { tipo, items: items.slice(0, 4) }
  if (tipo === "datos" && items.length) return { tipo, items: items.slice(0, 3) }
  return null
}

/** El antetitulo de una lamina, o el que se deduce de un recurso viejo de etiqueta o paso. */
function antetituloDe(s: Record<string, unknown>): string | undefined {
  if (typeof s.antetitulo === "string" && s.antetitulo.trim()) return s.antetitulo.trim()
  const r = (s.recurso ?? {}) as Record<string, unknown>
  if (r.tipo === "etiqueta" && typeof r.texto === "string") return r.texto.trim()
  if (r.tipo === "paso" && r.valor !== undefined) return `Paso ${String(r.valor).padStart(2, "0")}`
  return undefined
}
import { estiloDe, type EstiloCompleto } from "./plantillas"
import { INSTRUCCIONES_ESTILO } from "./prompts"
import { studioConfig } from "./settings"
import { todas } from "../paginar"

/**
 * El agente de contenido: convierte cartuchos en piezas.
 *
 * Un cartucho es una idea que dejo el agente de ideas. Este agente la toma, la
 * desarrolla en una pieza para el canal y el formato de una receta, y la guarda
 * en `studio_pieces`. Si la receta usa Canva y tiene una plantilla lista, ademas
 * dibuja la pieza copiando esa plantilla (ver canva.ts); si no, la deja como
 * texto listo.
 *
 * Dos cosas lo hacen seguro de correr en paralelo:
 * - Los cartuchos se reclaman con `reclamar_cartuchos`, que hace el UPDATE con
 *   FOR UPDATE SKIP LOCKED: dos pasadas no pueden llevarse el mismo.
 * - Cada receta tiene un presupuesto por dia (per_day) y un candado por hora
 *   (last_run_at), asi que ni produce de mas ni repite la tanda de una hora.
 */

export type Receta = {
  id: string
  account_id: string
  pillar_id: string
  name: string
  channel: string
  format: string
  generator: string
  template_id: string | null
  per_day: number
  run_at: number[]
  enabled: boolean
  last_run_at: string | null
}

type CartuchoFila = {
  id: string
  pillar_id: string
  topic_id: string | null
  subtopic_id: string | null
  intent_id: string | null
  narrative_id: string | null
  idea: string
  notes: string | null
}

/** El contexto de capas que se le da al agente, resuelto a nombres y descripciones. */
type Contexto = {
  pilar: string | null
  tema: string | null
  subtema: string | null
  intencion: { name: string; description: string | null } | null
  narrativa: { name: string; description: string | null } | null
  cta: { name: string; description: string | null } | null
}

type PiezaPayload = {
  familia: "laminas" | "imagen" | "texto"
  estilo: TipoEstilo | null
  caption: string
  hashtags: string[]
  fotos: string[]
  elemento: string
  slides: LaminaPieza[]
  title: string
  body: string
  parrafos: string[]
}

/** Normaliza un grafico de data-viz; null si no trae datos usables. */
function graficoDe(v: unknown): Grafico | null {
  if (!v || typeof v !== "object") return null
  const g = v as Record<string, unknown>
  const tipo = ["barras", "columnas", "ranking", "cifras"].includes(String(g.tipo)) ? (g.tipo as Grafico["tipo"]) : "barras"
  const items = (Array.isArray(g.items) ? g.items : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.etiqueta === "string" && (typeof x.valor === "number" || typeof x.valor === "string"))
    .map((x) => ({
      etiqueta: String(x.etiqueta).trim(),
      valor: x.valor as number | string,
      variacion: ["sube", "baja", "estable"].includes(String(x.variacion)) ? (x.variacion as "sube" | "baja" | "estable") : undefined,
      nota: typeof x.nota === "string" ? x.nota.trim() : undefined,
      icono: typeof x.icono === "string" && x.icono.trim() ? x.icono.trim() : undefined,
    }))
  if (items.length === 0) return null
  // Barras, columnas y ranking comparan numeros: si algun valor es texto ("1
  // etapa del recorrido"), el grafico no mide nada y se descarta. Las cifras
  // si admiten un valor con su unidad ("15 cm").
  const esNumero = (v: number | string) =>
    typeof v === "number" || /^[▲▼+\-]?\s*(US\$|\$)?\s*[\d.,]+\s*(%|[a-zA-Z$/]{0,6})?$/.test(v.trim())
  if (tipo !== "cifras" && !items.every((i) => esNumero(i.valor))) return null
  return {
    tipo,
    unidad: typeof g.unidad === "string" ? g.unidad.trim() : "",
    items,
    destacado: typeof g.destacado === "number" ? g.destacado : undefined,
  }
}

/** Pide a Claude la pieza y la normaliza a una forma estable. */
async function redactar(
  accountId: string,
  cartucho: CartuchoFila,
  ctx: Contexto,
  formatId: string,
  system: string,
  model: string,
  estilo: EstiloCompleto | null
): Promise<{ payload: PiezaPayload; uso: UsoClaude }> {
  const familia = familiaDeFormato(formatId)
  const conEstilo = estilo !== null && familia !== "texto"
  const bloqueEstilo =
    estilo && conEstilo ? `\n\nESTILO GRÁFICO: ${estilo.name}\n${estilo.descripcion}\n\n${INSTRUCCIONES_ESTILO[estilo.tipo]}` : ""

  // Las etiquetas van acentuadas: el modelo imita como estan escritas las
  // instrucciones, y unas etiquetas sin tildes tambien se contagian.
  const prompt = `IDEA
- idea: ${cartucho.idea}
- nota: ${cartucho.notes ?? "(sin nota)"}

CAPAS
- tema: ${ctx.tema ?? "(sin tema)"}${ctx.subtema ? ` | subtema: ${ctx.subtema}` : ""}
- intención: ${ctx.intencion?.name ?? "(sin intención)"}${ctx.intencion?.description ? ` (${ctx.intencion.description})` : ""}
- narrativa: ${ctx.narrativa?.name ?? "(sin narrativa)"}${ctx.narrativa?.description ? ` (${ctx.narrativa.description})` : ""}
- cta: ${ctx.cta?.name ?? "(sin cta)"}${ctx.cta?.description ? ` (${ctx.cta.description})` : ""}

FORMATO
- familia: ${familia}
- formato: ${formatId}${bloqueEstilo}
${familia === "laminas" ? `
El cierre va aparte, en "cierre" ({"title","body"}), y es la invitación concreta al CTA de arriba. Es obligatorio.
` : `
El caption termina con el CTA de arriba.
`}
Recuerda: todo lo que escribas lleva sus tildes y sus eñes, aunque la idea de arriba venga sin ellas.`

  // Data-viz necesita datos reales: el agente los busca en la web en la misma
  // llamada y los cita. Los demas estilos no buscan nada.
  const buscar = Boolean(estilo && conEstilo && (estilo.tipo === "dataviz" || estilo.tipo === "infodatos"))
  const r = await llamarClaude({ accountId, model, system, prompt, maxTokens: buscar ? 6000 : 4000, buscarWeb: buscar, maxBusquedas: 5 })
  if (!r.ok) throw new Error(r.error)

  const bruto = parsearJSONDeClaude(r.texto) as Record<string, unknown>
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : []
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

  const slides: LaminaPieza[] = Array.isArray(bruto.slides)
    ? (bruto.slides as Record<string, unknown>[]).map((s, i) => ({
        n: typeof s.n === "number" ? s.n : i + 1,
        type: str(s.type) || (i === 0 ? "portada" : "text"),
        hook: str(s.hook) || undefined,
        title: str(s.title) || undefined,
        body: str(s.body) || undefined,
        foto: str(s.foto) || undefined,
        visual: str(s.visual) || undefined,
        icono: str(s.icono) || undefined,
        esquema: s.esquema === "pasos" ? ("pasos" as const) : s.esquema === "partes" ? ("partes" as const) : undefined,
        etiquetas: arr(s.etiquetas).slice(0, 4),
        grafico: graficoDe(s.grafico),
        recurso: recursoDe(s.recurso),
        antetitulo: antetituloDe(s),
        fuente: str(s.fuente) || undefined,
        periodo: str(s.periodo) || undefined,
      }))
    : []

  // El cierre con el CTA va aparte y es obligatorio: dejarlo como "la ultima
  // lamina" hacia que el agente a veces cerrara con una lamina de contenido (con
  // imagen y etiquetas) y la pieza saliera sin CTA. Si aun asi no lo escribe, se
  // arma con el ejemplo del propio CTA.
  if (familia === "laminas" && slides.length) {
    const c = (bruto.cierre ?? {}) as Record<string, unknown>
    const ejemplo = /Ejemplo:\s*["“](.+?)["”]/.exec(ctx.cta?.description ?? "")?.[1]
    // Con un prompt propio el agente puede seguir dejando el cierre como
    // ultima lamina: si ademas trae "cierre", sobra; si no, es el cierre.
    const ultima = slides[slides.length - 1]
    if (slides.length > 1 && /cierre|cta|cta_close|close/i.test(ultima.type)) {
      if (str(c.title)) slides.pop()
      else ultima.type = "cierre"
    }
    if (slides[slides.length - 1].type !== "cierre") slides.push({
      n: slides.length + 1,
      type: "cierre",
      title: str(c.title) || ejemplo || "Guarda esta pieza para tenerla a mano",
      body: str(c.body) || undefined,
      etiquetas: [],
      grafico: null,
      recurso: null,
    })
  }

  const payload: PiezaPayload = {
    familia,
    estilo: estilo && conEstilo ? estilo.tipo : null,
    caption: str(bruto.caption),
    hashtags: arr(bruto.hashtags),
    fotos: slides.map((s) => s.foto).filter((f): f is string => Boolean(f)),
    elemento: str(bruto.elemento),
    slides,
    title: str(bruto.title) || slides[0]?.title || slides[0]?.hook || "",
    body: str(bruto.body) || slides[0]?.body || "",
    parrafos: arr(bruto.parrafos),
  }

  // Todo lo que se publica pasa por el corrector, en una sola llamada. Las
  // busquedas de foto y las escenas van en ingles, y los hashtags sin tildes,
  // asi que esas no.
  type Hueco = { leer: () => string; poner: (t: string) => void }
  const huecos: Hueco[] = [
    { leer: () => payload.caption, poner: (t) => (payload.caption = t) },
    { leer: () => payload.title, poner: (t) => (payload.title = t) },
    { leer: () => payload.body, poner: (t) => (payload.body = t) },
    ...payload.parrafos.map((_, i) => ({ leer: () => payload.parrafos[i], poner: (t: string) => (payload.parrafos[i] = t) })),
    ...payload.slides.flatMap((s) => [
      ...(["hook", "title", "body"] as const)
        .filter((k) => s[k])
        .map((k) => ({ leer: () => s[k] ?? "", poner: (t: string) => (s[k] = t) })),
      ...(s.etiquetas ?? []).map((_, i) => ({ leer: () => s.etiquetas![i], poner: (t: string) => (s.etiquetas![i] = t) })),
      ...(s.grafico?.items ?? []).flatMap((it) => [
        { leer: () => it.etiqueta, poner: (t: string) => (it.etiqueta = t) },
        ...(it.nota ? [{ leer: () => it.nota ?? "", poner: (t: string) => (it.nota = t) }] : []),
      ]),
      ...(s.antetitulo ? [{ leer: () => s.antetitulo ?? "", poner: (t: string) => (s.antetitulo = t) }] : []),
      ...(s.recurso?.texto ? [{ leer: () => s.recurso!.texto ?? "", poner: (t: string) => (s.recurso!.texto = t) }] : []),
      ...(s.recurso?.items ?? []).map((_, i) => ({ leer: () => s.recurso!.items![i], poner: (t: string) => (s.recurso!.items![i] = t) })),
    ]),
  ]
  const corregidos = await corregirTextos(accountId, huecos.map((h) => h.leer()))
  huecos.forEach((h, i) => h.poner(corregidos[i]))

  return { payload, uso: r.uso }
}

/** El contexto de capas de un cartucho, resuelto en una sola consulta por lote. */
async function contextoDe(accountId: string, cartuchos: CartuchoFila[]): Promise<Map<string, Contexto>> {
  const supabase = supabaseAdmin()
  const [pilares, temas, subtemas, intenciones, narrativas, ctas] = await Promise.all([
    supabase.from("content_pillars").select("id, name").eq("account_id", accountId),
    supabase.from("content_topics").select("id, name").eq("account_id", accountId),
    todas((d, h) => supabase.from("content_subtopics").select("id, name").eq("account_id", accountId).order("id").range(d, h)).then((data) => ({ data, error: null })),
    supabase.from("content_intents").select("id, name, description").eq("account_id", accountId),
    supabase.from("content_narratives").select("id, name, description").eq("account_id", accountId),
    supabase.from("content_ctas").select("id, name, description, position").eq("account_id", accountId).order("position"),
  ])

  const mapa = <T,>(data: unknown) =>
    new Map(((data ?? []) as (T & { id: string })[]).map((r) => [r.id, r]))
  const nPilar = mapa<{ name: string }>(pilares.data)
  const nTema = mapa<{ name: string }>(temas.data)
  const nSub = mapa<{ name: string }>(subtemas.data)
  const nInt = mapa<{ name: string; description: string | null }>(intenciones.data)
  const nNarr = mapa<{ name: string; description: string | null }>(narrativas.data)

  // El cartucho no guarda un CTA concreto. Va el de menor posicion en Capas, y
  // si hay empate (o ninguno tiene orden) se reparte entre los empatados segun
  // el cartucho: siempre el mismo para la misma idea, distinto entre ideas.
  const lasCtas = (ctas.data ?? []) as { name: string; description: string | null; position: number }[]
  const primeras = lasCtas.filter((c) => c.position === lasCtas[0]?.position)
  const ctaDe = (id: string) => {
    if (!primeras.length) return null
    let h = 0
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    const c = primeras[h % primeras.length]
    return { name: c.name, description: c.description }
  }

  const out = new Map<string, Contexto>()
  for (const c of cartuchos) {
    out.set(c.id, {
      pilar: nPilar.get(c.pillar_id)?.name ?? null,
      tema: c.topic_id ? (nTema.get(c.topic_id)?.name ?? null) : null,
      subtema: c.subtopic_id ? (nSub.get(c.subtopic_id)?.name ?? null) : null,
      intencion: c.intent_id ? (nInt.get(c.intent_id) ?? null) : null,
      narrativa: c.narrative_id ? (nNarr.get(c.narrative_id) ?? null) : null,
      cta: ctaDe(c.id),
    })
  }
  return out
}

export type ResultadoPieza = { ok: boolean; pieceId?: string; error?: string }

/** Genera una pieza a partir de un cartucho ya reclamado. */
async function generarPieza(
  receta: Receta,
  cartucho: CartuchoFila,
  ctx: Contexto,
  system: string,
  model: string
): Promise<ResultadoPieza> {
  const supabase = supabaseAdmin()
  const familia = familiaDeFormato(receta.format)
  // El estilo grafico de la receta. Vale para cualquier formato; los de solo
  // texto no lo usan.
  const estilo =
    receta.template_id && familia !== "texto" ? await estiloDe(receta.template_id, receta.account_id) : null
  const dibujar = receta.generator === "canva" && familia !== "texto" && estilo !== null

  const base = {
    account_id: receta.account_id,
    recipe_id: receta.id,
    cartridge_id: cartucho.id,
    pillar_id: cartucho.pillar_id,
    channel: receta.channel,
    format: receta.format,
  }

  // La ficha de la pieza: con que capas se hizo. Se guarda tal cual en el
  // momento de generar, para que el estudio la muestre aunque despues se
  // renombre o se borre alguna capa.
  const capas = {
    pilar: ctx.pilar,
    tema: ctx.tema,
    subtema: ctx.subtema,
    intencion: ctx.intencion?.name ?? null,
    narrativa: ctx.narrativa?.name ?? null,
    cta: ctx.cta?.name ?? null,
    canal: receta.channel,
    formato: receta.format,
    estilo: estilo ? estilo.name : null,
    receta: receta.name,
    generador: receta.generator,
  }

  let payload: PiezaPayload
  try {
    const r = await redactar(receta.account_id, cartucho, ctx, receta.format, system, model, estilo)
    payload = r.payload
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    // La idea no tiene la culpa de un corte de red o de un JSON roto: el
    // cartucho vuelve a la despensa para que otra pasada lo intente. El fallo
    // queda anotado como pieza failed, que no cuenta para el cupo del dia.
    await supabase
      .from("content_cartridges")
      .update({ status: "available", used_at: null })
      .eq("id", cartucho.id)
    const { data } = await supabase
      .from("studio_pieces")
      .insert({ ...base, status: "failed", error: msg.slice(0, 500), payload: { capas } })
      .select("id")
      .maybeSingle()
    return { ok: false, pieceId: (data as { id: string } | null)?.id, error: msg }
  }

  // Una receta de Canva sin plantilla lista no se cae: la pieza sale como
  // texto y queda dicho por que no lleva imagenes.
  const aviso =
    receta.generator === "canva" && familia !== "texto" && !estilo
      ? "La receta no tiene estilo gráfico: la pieza quedó solo como texto."
      : null

  const { data: fila, error: errIns } = await supabase
    .from("studio_pieces")
    .insert({
      ...base,
      status: dibujar ? "generating" : "generated",
      payload: { ...payload, capas, ...(aviso ? { aviso } : {}) },
    })
    .select("id")
    .maybeSingle()

  if (errIns) return { ok: false, error: errIns.message }
  const pieceId = (fila as { id: string } | null)?.id
  if (!pieceId) return { ok: false, error: "No se pudo crear la pieza." }

  if (!dibujar || !estilo) return { ok: true, pieceId }

  const dibujo = await dibujarConCanva({
    estilo,
    pieza: payload,
    formatId: receta.format,
    titulo: cartucho.idea,
    accountId: receta.account_id,
    pieceId,
    // Si las busquedas del agente no dan fotos, el tema de la idea.
    terminosRespaldo: [ctx.subtema, ctx.tema].filter((t): t is string => Boolean(t)),
  })

  await supabase
    .from("studio_pieces")
    .update(
      dibujo.ok
        ? {
            status: "generated",
            canva_design_id: dibujo.designId,
            payload: {
              ...payload,
              capas,
              imagenes: dibujo.imagenes,
              canva_edit_url: dibujo.editUrl,
              plantilla_id: estilo.id,
              recursos: dibujo.recursos,
              ...(dibujo.avisos.length ? { avisos: dibujo.avisos } : {}),
            },
          }
        : { status: "failed", error: dibujo.error.slice(0, 500), canva_design_id: dibujo.designId ?? null }
    )
    .eq("id", pieceId)

  // Si el dibujo falla, la idea vuelve a la despensa, igual que cuando falla la
  // redaccion: la pieza queda anotada como fallida y otra pasada la rehace.
  if (!dibujo.ok) {
    await supabase.from("content_cartridges").update({ status: "available", used_at: null }).eq("id", cartucho.id)
  }

  return dibujo.ok ? { ok: true, pieceId } : { ok: false, pieceId, error: dibujo.error }
}

/** Reclama hasta `limite` cartuchos disponibles de un pilar, sin colisiones. */
async function reclamar(accountId: string, pillarId: string, limite: number): Promise<CartuchoFila[]> {
  if (limite <= 0) return []
  const { data, error } = await supabaseAdmin().rpc("reclamar_cartuchos", {
    p_account: accountId,
    p_pillar: pillarId,
    p_limite: limite,
  })
  if (error) throw new Error(`No se pudieron reclamar cartuchos: ${error.message}`)
  return (data ?? []) as CartuchoFila[]
}

/** Cuantas piezas produjo hoy una receta, en la zona de la cuenta. */
async function producidasHoy(recipeId: string, timezone: string, now: Date): Promise<number> {
  const desde = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabaseAdmin()
    .from("studio_pieces")
    .select("created_at")
    .eq("recipe_id", recipeId)
    .neq("status", "failed")
    .gte("created_at", desde)
  const hoy = dayIn(timezone, now)
  return ((data ?? []) as { created_at: string }[]).filter(
    (p) => dayIn(timezone, new Date(p.created_at)) === hoy
  ).length
}

export type ResultadoReceta = {
  recipeId: string
  name: string
  generadas: number
  errores: number
  motivo?: string
}

/**
 * Corre las recetas de una cuenta que toquen ahora.
 *
 * `force` salta el candado de hora y el horario, para el boton de "generar
 * ahora". `presupuesto` limita cuantas piezas se hacen en esta pasada, que es lo
 * que evita que un tick se pase del tiempo de la funcion.
 */
export async function correrRecetas(opciones: {
  accountId: string
  timezone: string
  now?: Date
  force?: boolean
  recipeId?: string
  presupuesto: number
}): Promise<ResultadoReceta[]> {
  const { accountId, timezone, force = false, recipeId, presupuesto } = opciones
  const now = opciones.now ?? new Date()
  const supabase = supabaseAdmin()
  const hora = hourIn(timezone, now)

  let q = supabase.from("content_recipes").select("*").eq("account_id", accountId).eq("enabled", true)
  if (recipeId) q = q.eq("id", recipeId)
  const { data, error } = await q
  if (error) throw new Error(`No se pudieron leer las recetas: ${error.message}`)

  const cfg = await studioConfig(accountId)
  const recetas = (data ?? []) as Receta[]
  const salida: ResultadoReceta[] = []
  let restante = presupuesto

  for (const receta of recetas) {
    if (restante <= 0) break

    if (!force) {
      if (!receta.run_at.includes(hora)) {
        salida.push({ recipeId: receta.id, name: receta.name, generadas: 0, errores: 0, motivo: "no es su hora" })
        continue
      }
      // Candado por hora: si ya corrio esta hora de hoy, no repite.
      if (receta.last_run_at) {
        const ultima = new Date(receta.last_run_at)
        if (dayIn(timezone, ultima) === dayIn(timezone, now) && hourIn(timezone, ultima) === hora) {
          salida.push({ recipeId: receta.id, name: receta.name, generadas: 0, errores: 0, motivo: "ya corrio esta hora" })
          continue
        }
      }
    }

    const hechasHoy = await producidasHoy(receta.id, timezone, now)
    const pendientesHoy = Math.max(0, receta.per_day - hechasHoy)
    // Reparte per_day entre las horas del dia. A mano ("Generar ahora") hace lo
    // que falte del dia, y al menos una: quien pulsa el boton quiere ver una
    // pieza, aunque el cupo automatico ya este cubierto.
    const porTanda = force
      ? Math.max(1, pendientesHoy)
      : Math.min(pendientesHoy, Math.ceil(receta.per_day / Math.max(1, receta.run_at.length)))
    const cuantas = Math.min(porTanda, restante)

    if (cuantas <= 0) {
      if (!force) await supabase.from("content_recipes").update({ last_run_at: now.toISOString() }).eq("id", receta.id)
      salida.push({ recipeId: receta.id, name: receta.name, generadas: 0, errores: 0, motivo: "cupo del dia cubierto" })
      continue
    }

    const cartuchos = await reclamar(accountId, receta.pillar_id, cuantas)
    if (cartuchos.length === 0) {
      if (!force) await supabase.from("content_recipes").update({ last_run_at: now.toISOString() }).eq("id", receta.id)
      salida.push({ recipeId: receta.id, name: receta.name, generadas: 0, errores: 0, motivo: "sin cartuchos disponibles" })
      continue
    }

    const ctxs = await contextoDe(accountId, cartuchos)
    let generadas = 0
    let errores = 0
    for (const c of cartuchos) {
      const r = await generarPieza(receta, c, ctxs.get(c.id)!, cfg.promptContenido, cfg.modelContenido)
      if (r.ok) generadas++
      else errores++
      restante--
      if (restante <= 0) break
    }

    // El candado de la hora solo se cierra si la tanda salio entera. Si el
    // presupuesto de la pasada la corto, la siguiente pasada de esta misma hora
    // hace lo que falta; producidasHoy impide que se pase del cupo del dia.
    if (!force && cuantas >= porTanda) {
      await supabase.from("content_recipes").update({ last_run_at: now.toISOString() }).eq("id", receta.id)
    }
    salida.push({ recipeId: receta.id, name: receta.name, generadas, errores })
  }

  return salida
}
