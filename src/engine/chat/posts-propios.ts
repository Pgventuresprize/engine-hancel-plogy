import { randomUUID } from "node:crypto"

import { redesActivas } from "../agents/redes"
import { aHora, armarPlan, claveHueco, horaLibre, parseHorarios, sumarDias, type Horarios, type PedidoPlan } from "../calendario/reparto"
import { BUCKET } from "../render/storage"
import { dayIn, getSettings, partsIn } from "../schedule"
import { instanteLocal } from "../studio/publicar"
import { supabaseAdmin } from "../supabase-admin"
import type { LaminaAMirar } from "./leer-post"
import { escribirMensaje, type Mensaje, type Referencia, type ReferenciaLote, type ReferenciaPlan } from "./mensajes"
import { captionDeTextos, huellaDeCaption, largoPublicado, material, MAX_CAPTION, MAX_HASHTAGS, MAX_LAMINAS, MAX_POSTS_POR_LOTE, tituloDeCarpeta } from "./posts-carpeta"

/**
 * Posts ya hechos que alguien sube al chat.
 *
 * Las imagenes van directo del navegador al bucket publico, porque Vercel corta
 * los cuerpos de mas de 4.5 MB. Al enviar el mensaje, cada post pasa a ser una
 * pieza normal, de carril chat y sin aprobar: asi el Estudio y el Calendario la
 * ven como cualquier otra y no sale sola. Solo se aprueba al confirmar la
 * propuesta, que es cuando la persona dijo que sale.
 *
 * La propuesta la calcula `armarPlan`, no el agente, y vive en el mensaje.
 */

const EXTENSIONES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_NOTAS = 1000
/** Sin fechas en el pedido, se reparte en las dos semanas siguientes. */
const DIAS_POR_DEFECTO = 14
/** Posts sin caption que el agente mira a la vez, y sus laminas: es lo que mas pesa. */
const MAX_POSTS_CON_FOTOS = 8
const LAMINAS_POR_POST = 3

/** Donde vive un post subido. La arma el servidor: nunca sale de lo que mande el navegador. */
const carpetaDe = (accountId: string, id: string) => `subidas/${accountId}/${id}`

async function exigirAdvance(accountId: string): Promise<void> {
  const { data } = await supabaseAdmin().from("accounts").select("plan").eq("id", accountId).maybeSingle()
  if ((data as { plan: string } | null)?.plan !== "advance") throw new Error("Programar posts es del plan advance.")
}

export type PostASubir = { nombre: string; imagenes: string[]; huella: string | null }
export type SubidaPreparada = { id: string; nombre: string; subidas: { ruta: string; url: string }[] }

/** Las huellas de lo que la marca ya tiene, para no subir dos veces el mismo post. */
async function captionsExistentes(accountId: string): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin()
    .from("content_pieces")
    .select("status, caption:payload->>caption")
    .eq("account_id", accountId)
    .eq("network", "instagram")
    .neq("status", "rejected")
    .limit(2000)
  if (error) throw new Error(error.message)
  const mapa = new Map<string, string>()
  for (const f of (data ?? []) as unknown as { status: string; caption: string | null }[]) {
    if (f.caption) mapa.set(huellaDeCaption(f.caption), f.status)
  }
  return mapa
}

/** Las direcciones firmadas para subir cada imagen. Lo repetido se queda fuera antes de gastar la subida. */
export async function prepararSubida(
  accountId: string,
  posts: PostASubir[]
): Promise<{ posts: SubidaPreparada[]; fuera: { nombre: string; motivo: string }[] }> {
  await exigirAdvance(accountId)
  if (posts.length > MAX_POSTS_POR_LOTE) throw new Error(`Son ${posts.length} posts y el máximo por vez es ${MAX_POSTS_POR_LOTE}.`)

  const existentes = await captionsExistentes(accountId)
  const storage = supabaseAdmin().storage.from(BUCKET)
  const salida: SubidaPreparada[] = []
  const fuera: { nombre: string; motivo: string }[] = []

  for (const post of posts) {
    const previo = post.huella ? existentes.get(post.huella) : undefined
    if (previo) {
      fuera.push({ nombre: post.nombre, motivo: previo === "published" ? "Ya se publicó." : "Ya está en Plogy Studio." })
      continue
    }
    if (!post.imagenes.length || post.imagenes.length > MAX_LAMINAS) {
      fuera.push({ nombre: post.nombre, motivo: `Tiene ${post.imagenes.length} láminas: van de 1 a ${MAX_LAMINAS}.` })
      continue
    }
    const id = randomUUID()
    const subidas = await Promise.all(
      post.imagenes.map(async (ruta, i) => {
        const ext = ruta.split(".").pop()?.toLowerCase() ?? ""
        if (!EXTENSIONES[ext]) throw new Error(`Ese archivo no es una imagen admitida: ${ruta}`)
        // El orden del nombre es el orden del carrusel.
        const { data, error } = await storage.createSignedUploadUrl(`${carpetaDe(accountId, id)}/${String(i + 1).padStart(2, "0")}.${ext}`)
        if (error || !data) throw new Error(error?.message ?? "No se pudo preparar la subida.")
        return { ruta, url: data.signedUrl }
      })
    )
    salida.push({ id, nombre: post.nombre, subidas })
  }
  return { posts: salida, fuera }
}

/** Las imagenes ya subidas de un post, en orden. Salen del bucket: el navegador no dicta direcciones. */
async function imagenesSubidas(accountId: string, id: string): Promise<string[]> {
  const storage = supabaseAdmin().storage.from(BUCKET)
  const carpeta = carpetaDe(accountId, id)
  const { data, error } = await storage.list(carpeta, { limit: 100, sortBy: { column: "name", order: "asc" } })
  if (error) throw new Error(error.message)
  const version = Date.now().toString(36)
  return (data ?? [])
    .filter((f) => /^\d+\.(png|jpe?g|webp)$/i.test(f.name))
    .map((f) => `${storage.getPublicUrl(`${carpeta}/${f.name}`).data.publicUrl}?v=${version}`)
}

/** Si el navegador se arrepiente antes de enviar: lo que aun no es pieza se borra. */
export async function descartarSubida(accountId: string, ids: string[]): Promise<void> {
  const validos = ids.filter((i) => UUID.test(i)).slice(0, MAX_POSTS_POR_LOTE)
  if (!validos.length) return
  const { data } = await supabaseAdmin().from("content_pieces").select("id").in("id", validos)
  const yaPiezas = new Set(((data ?? []) as { id: string }[]).map((f) => f.id))
  const storage = supabaseAdmin().storage.from(BUCKET)
  for (const id of validos.filter((i) => !yaPiezas.has(i))) {
    const carpeta = carpetaDe(accountId, id)
    const { data: archivos } = await storage.list(carpeta, { limit: 100 })
    const rutas = (archivos ?? []).map((f) => `${carpeta}/${f.name}`)
    if (rutas.length) await storage.remove(rutas)
  }
}

/** Lo que no es el caption pero ayuda a decidir: fechas sugeridas, de que va. */
function notasDe(textos: { nombre: string; contenido: string }[]): string {
  const brief = textos.find((t) => /brief|notas?|readme/i.test(t.nombre)) ?? textos[0]
  return (brief?.contenido ?? "").trim().slice(0, MAX_NOTAS)
}

export type PostASubirTexto = { id: string; nombre: string; textos: { nombre: string; contenido: string }[] }

/** Al enviar el mensaje: cada post subido pasa a ser una pieza, sin aprobar. */
export async function registrarPosts(
  accountId: string,
  posts: PostASubirTexto[]
): Promise<{ ids: string[]; fuera: { nombre: string; motivo: string }[] }> {
  await exigirAdvance(accountId)
  const supabase = supabaseAdmin()
  const ids: string[] = []
  const fuera: { nombre: string; motivo: string }[] = []

  // Un segundo envio del mismo lote encuentra sus piezas: no es un error.
  const { data: previas, error: errorPrevias } = await supabase
    .from("content_pieces")
    .select("id")
    .eq("account_id", accountId)
    .in("id", posts.map((p) => p.id).filter((i) => UUID.test(i)))
  if (errorPrevias) throw new Error(errorPrevias.message)
  const yaGuardadas = new Set(((previas ?? []) as { id: string }[]).map((f) => f.id))

  for (const post of posts.slice(0, MAX_POSTS_POR_LOTE)) {
    if (!UUID.test(post.id)) continue
    if (yaGuardadas.has(post.id)) {
      ids.push(post.id)
      continue
    }
    const images = await imagenesSubidas(accountId, post.id)
    if (!images.length) {
      fuera.push({ nombre: post.nombre, motivo: "Sus imágenes no llegaron." })
      continue
    }
    const titulo = tituloDeCarpeta(post.nombre)
    const texto = captionDeTextos(post.textos)
    const newsId = randomUUID()

    const noticia = await supabase.from("raw_news").insert({
      id: newsId,
      account_id: accountId,
      carril: "chat",
      status: "chat",
      niche: "general",
      tema: titulo,
      title: titulo,
      link: `about:blank#post-propio-${newsId}`,
      snippet: "Post subido al chat.",
      source: "Post propio",
    })
    if (noticia.error) throw new Error(`No se pudo guardar ${post.nombre}: ${noticia.error.message}`)

    const angulo = await supabase
      .from("content_angles")
      .insert({ account_id: accountId, raw_news_id: newsId, angle: titulo, thesis: "Post propio: no lo generó el Estudio.", status: "generated", carril: "chat", position: 0 })
      .select("id")
      .single()
    // Lo que quede a medias se borra: una noticia sin pieza no se ve ni se quita desde ningun lado.
    const deshacer = async () => {
      await supabase.from("raw_news").delete().eq("id", newsId)
    }
    if (angulo.error) {
      await deshacer()
      throw new Error(`No se pudo guardar ${post.nombre}: ${angulo.error.message}`)
    }

    const pieza = await supabase.from("content_pieces").insert({
      id: post.id,
      account_id: accountId,
      content_angle_id: (angulo.data as { id: string }).id,
      raw_news_id: newsId,
      network: "instagram",
      carril: "chat",
      status: "generated",
      generated_at: new Date().toISOString(),
      payload: {
        images,
        slideCount: images.length,
        caption: texto?.caption ?? "",
        hashtags: texto?.hashtags ?? [],
        postPropio: true,
        notasPost: notasDe(post.textos),
      },
    })
    if (pieza.error) {
      await deshacer()
      // Otro envio la guardo entre la comprobacion y este insert: ya esta.
      if (pieza.error.code !== "23505") throw new Error(`No se pudo guardar ${post.nombre}: ${pieza.error.message}`)
    }
    ids.push(post.id)
  }
  return { ids, fuera }
}

/** La referencia del mensaje, con lo que de verdad es de la cuenta y es un post subido. */
export async function loteDe(accountId: string, entrada: unknown): Promise<ReferenciaLote | null> {
  const e = entrada as { ids?: unknown; fuera?: unknown } | null
  if (!e || !Array.isArray(e.ids)) return null
  const ids = e.ids.filter((i): i is string => typeof i === "string" && UUID.test(i)).slice(0, MAX_POSTS_POR_LOTE)
  const fuera = (Array.isArray(e.fuera) ? e.fuera : [])
    .flatMap((f) => {
      const x = f as { nombre?: unknown; motivo?: unknown }
      return typeof x?.nombre === "string" && typeof x?.motivo === "string" ? [{ nombre: x.nombre.slice(0, 200), motivo: x.motivo.slice(0, 200) }] : []
    })
    .slice(0, MAX_POSTS_POR_LOTE * 3)
  if (!ids.length && !fuera.length) return null
  if (!ids.length) return { tipo: "lote", piezas: [], fuera }

  const { data, error } = await supabaseAdmin()
    .from("content_pieces")
    .select("id, propio:payload->postPropio")
    .eq("account_id", accountId)
    .in("id", ids)
  if (error) throw new Error(error.message)
  const validos = new Set(((data ?? []) as unknown as { id: string; propio: unknown }[]).filter((f) => f.propio === true).map((f) => f.id))
  return { tipo: "lote", piezas: ids.filter((i) => validos.has(i)), fuera }
}

// ------------------------------------------------------------ lo que ve el agente

type PiezaLote = {
  id: string
  status: string
  published_at: string | null
  programada_para: string | null
  payload: { images?: string[]; caption?: string; hashtags?: string[]; notasPost?: string; captionEscrito?: boolean; postPropio?: boolean }
  titulo: string
}

async function piezasDeLotes(accountId: string, ids: string[]): Promise<PiezaLote[]> {
  if (!ids.length) return []
  const { data, error } = await supabaseAdmin()
    .from("content_pieces")
    .select("id, status, published_at, programada_para, payload, raw_news (title)")
    .eq("account_id", accountId)
    .in("id", ids)
  if (error) throw new Error(error.message)
  const porId = new Map(
    ((data ?? []) as unknown as (Omit<PiezaLote, "titulo"> & { raw_news: { title: string | null } | null })[]).map((f) => [
      f.id,
      { ...f, titulo: f.raw_news?.title ?? "Sin título" },
    ])
  )
  return ids.flatMap((i) => {
    const p = porId.get(i)
    return p ? [p] : []
  })
}

const idsDeLotes = (mensajes: Pick<Mensaje, "referencias">[]) => [
  ...new Set(mensajes.flatMap((m) => (m.referencias ?? []).flatMap((r) => (r.tipo === "lote" ? r.piezas : [])))),
]

const DIA_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

function textoHorarios(h: Horarios): string {
  const ig = h.instagram ?? {}
  const dias = Object.keys(ig).sort()
  return dias.length ? dias.map((d) => `${DIA_SEMANA[Number(d)]}: ${(ig[d] ?? []).join(", ")}`).join("; ") : "sin definir"
}

async function horariosDe(accountId: string): Promise<{ horarios: Horarios; activo: boolean }> {
  const { data } = await supabaseAdmin().from("calendario_ajustes").select("horarios, publicar_activo").eq("account_id", accountId).maybeSingle()
  const fila = data as { horarios: unknown; publicar_activo: boolean } | null
  return { horarios: parseHorarios(fila?.horarios), activo: Boolean(fila?.publicar_activo) }
}

/** La seccion del prompt con los posts subidos, y las etiquetas con que el agente los nombra. */
export async function postsParaElAgente(
  accountId: string,
  mensajes: Pick<Mensaje, "referencias">[]
): Promise<{ texto: string; etiquetas: Map<string, string>; imagenes: LaminaAMirar[] } | null> {
  const lotes = mensajes.flatMap((m) => (m.referencias ?? []).filter((r): r is ReferenciaLote => r.tipo === "lote"))
  if (!lotes.length) return null
  const piezas = await piezasDeLotes(accountId, idsDeLotes(mensajes))
  const [{ timezone }, { horarios, activo }, redes] = await Promise.all([getSettings(accountId), horariosDe(accountId), redesActivas(accountId)])

  const etiquetas = new Map<string, string>()
  const imagenes: LaminaAMirar[] = []
  let conFotos = 0
  const fichas = piezas.map((p, i) => {
    const etiqueta = `A${i + 1}`
    etiquetas.set(etiqueta, p.id)
    const caption = p.payload.caption?.trim()
    const estado =
      p.status === "published" ? "ya publicado" : p.status === "rejected" ? "rechazado" : p.programada_para ? `programado: ${new Date(p.programada_para).toLocaleString("es", { timeZone: timezone })}` : "sin programar"
    if (!caption && p.status !== "published" && conFotos < MAX_POSTS_CON_FOTOS) {
      conFotos++
      imagenes.push(...(p.payload.images ?? []).slice(0, LAMINAS_POR_POST).map((url, n) => ({ url, rotulo: `${etiqueta}, lámina ${n + 1}:`, post: etiqueta })))
    }
    return [
      `## ${etiqueta}: ${material(p.titulo)} (${p.payload.images?.length ?? 0} láminas, ${estado})`,
      caption ? `<caption_del_archivo>\n${material(caption)}\n${material((p.payload.hashtags ?? []).join(" "))}\n</caption_del_archivo>` : "SIN CAPTION",
      p.payload.notasPost ? `<notas_del_archivo>\n${material(p.payload.notasPost)}\n</notas_del_archivo>` : "",
    ]
      .filter(Boolean)
      .join("\n")
  })
  const fuera = lotes.flatMap((l) => l.fuera)
  return {
    etiquetas,
    imagenes,
    texto: [
      `# POSTS ADJUNTOS\n\nHoy es ${new Intl.DateTimeFormat("es", { timeZone: timezone, dateStyle: "full", timeStyle: "short" }).format(new Date())} (${timezone}). Horarios de Instagram: ${textoHorarios(horarios)}. Publicación programada: ${activo ? "encendida" : "APAGADA, lo programado no sale hasta que la enciendan en Calendario > Horarios"}. Instagram ${redes.includes("instagram") ? "conectado" : "SIN CONECTAR"}.`,
      ...fichas,
      fuera.length ? `## No se pudieron subir\n${fuera.map((f) => `- ${material(f.nombre)}: ${f.motivo}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  }
}

// ------------------------------------------------------------------ la propuesta

/** Los huecos ya tomados de aqui en adelante, sin contar lo que se esta moviendo. */
async function huecosTomados(accountId: string, zona: string, excluir: Set<string>): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin()
    .from("content_pieces")
    .select("id, network, programada_para")
    .eq("account_id", accountId)
    .neq("status", "rejected")
    .is("published_at", null)
    .gte("programada_para", new Date().toISOString())
  if (error) throw new Error(error.message)
  const huecos = new Set<string>()
  for (const f of (data ?? []) as { id: string; network: string; programada_para: string }[]) {
    if (excluir.has(f.id)) continue
    const fecha = new Date(f.programada_para)
    const { hour, minute } = partsIn(zona, fecha)
    huecos.add(claveHueco(f.network, dayIn(zona, fecha), aHora(hour * 60 + minute)))
  }
  return huecos
}

const ahoraEn = (zona: string) => {
  const now = new Date()
  const { hour, minute } = partsIn(zona, now)
  return { dia: dayIn(zona, now), hora: aHora(hour * 60 + minute) }
}

export type PedidoDeAgente = {
  post: string
  incluir: boolean
  motivo: string
  vence: string
  dia: string
  hora: string
  caption: string
  hashtags: string[]
}

/** Arma la propuesta y guarda lo que el agente escribio. No programa ni aprueba nada. */
export async function proponerPlan(o: {
  accountId: string
  etiquetas: Map<string, string>
  desde: string
  hasta: string
  pedidos: PedidoDeAgente[]
  /** La persona pidio tocar un caption: si no, el del archivo no se cambia. */
  puedeCambiarCaption: boolean
}): Promise<{ ok: true; plan: ReferenciaPlan } | { ok: false; error: string }> {
  await exigirAdvance(o.accountId)
  const supabase = supabaseAdmin()
  const desconocidos = o.pedidos.filter((p) => !o.etiquetas.has(p.post)).map((p) => p.post)
  if (desconocidos.length) return { ok: false, error: `No existen estos posts: ${desconocidos.join(", ")}.` }

  const ids = o.pedidos.map((p) => o.etiquetas.get(p.post) as string)
  const piezas = await piezasDeLotes(o.accountId, ids)
  const porId = new Map(piezas.map((p) => [p.id, p]))
  const { timezone } = await getSettings(o.accountId)
  const { horarios } = await horariosDe(o.accountId)
  const ahora = ahoraEn(timezone)

  const fueraPropuesta: ReferenciaPlan["fuera"] = []
  const validos: { pedido: PedidoDeAgente; pieza: PiezaLote }[] = []
  const escritos = new Set<string>()

  for (const pedido of o.pedidos) {
    const pieza = porId.get(o.etiquetas.get(pedido.post) as string)
    if (!pieza) continue
    const base = { pieceId: pieza.id, titulo: pieza.titulo }
    if (pieza.status === "published" || pieza.status === "publishing") {
      fueraPropuesta.push({ ...base, motivo: "Ya se publicó." })
      continue
    }
    if (pieza.status === "rejected") {
      fueraPropuesta.push({ ...base, motivo: "Está rechazado." })
      continue
    }
    if (!pedido.incluir) {
      fueraPropuesta.push({ ...base, motivo: pedido.motivo.trim().slice(0, 200) || "Lo dejó fuera el agente." })
      continue
    }

    const caption = pedido.caption.trim()
    const tieneCaption = Boolean(pieza.payload.caption?.trim()) && !pieza.payload.captionEscrito
    if (caption && (!tieneCaption || o.puedeCambiarCaption)) {
      const hashtags = pedido.hashtags.map((h) => h.trim()).filter((h) => h.startsWith("#")).slice(0, MAX_HASHTAGS)
      if (largoPublicado(caption, hashtags) > MAX_CAPTION) return { ok: false, error: `El caption de ${pedido.post}, con sus hashtags, pasa de ${MAX_CAPTION} caracteres.` }
      const { error } = await supabase
        .from("content_pieces")
        .update({ payload: { ...pieza.payload, caption, hashtags, captionEscrito: true } })
        .eq("id", pieza.id)
        .eq("account_id", o.accountId)
        .is("published_at", null)
      if (error) return { ok: false, error: error.message }
      pieza.payload = { ...pieza.payload, caption, hashtags, captionEscrito: true }
    }
    if (!pieza.payload.caption?.trim()) {
      fueraPropuesta.push({ ...base, motivo: "No tiene caption." })
      continue
    }
    if (largoPublicado(pieza.payload.caption ?? "", pieza.payload.hashtags ?? []) > MAX_CAPTION) {
      fueraPropuesta.push({ ...base, motivo: `Su caption, con los hashtags, pasa de ${MAX_CAPTION} caracteres, el máximo de Instagram.` })
      continue
    }
    if ((pieza.payload.hashtags ?? []).length > MAX_HASHTAGS) {
      fueraPropuesta.push({ ...base, motivo: `Tiene más de ${MAX_HASHTAGS} hashtags, el máximo de Instagram.` })
      continue
    }
    if (pieza.payload.captionEscrito) escritos.add(pieza.id)
    validos.push({ pedido, pieza })
  }

  const sinHora = validos.filter((v) => !v.pedido.dia && !v.pedido.hora)
  if (sinHora.length && !Object.keys(horarios.instagram ?? {}).length) {
    return {
      ok: false,
      error: "No hay horarios de Instagram definidos, así que no se pueden repartir. Pídele a la persona una hora para cada post, o que defina sus horarios en Calendario > Horarios. No inventes horas.",
    }
  }

  const desde = /^\d{4}-\d{2}-\d{2}$/.test(o.desde) && o.desde >= ahora.dia ? o.desde : ahora.dia
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(o.hasta) && o.hasta >= desde ? o.hasta : sumarDias(desde, DIAS_POR_DEFECTO)
  const pedidos: PedidoPlan[] = validos.map(({ pedido, pieza }) => ({ id: pieza.id, red: "instagram", vence: pedido.vence.trim(), dia: pedido.dia.trim(), hora: pedido.hora.trim() }))
  const armado = armarPlan({ pedidos, desde, hasta, horarios, ocupadas: await huecosTomados(o.accountId, timezone, new Set(ids)), ahora })

  const titulo = (id: string) => porId.get(id)?.titulo ?? "Sin título"
  // Se lee despues de guardar los captions: es la version que se esta proponiendo.
  const versiones = await versionesDe(o.accountId, armado.filas.map((f) => f.id))
  return {
    ok: true,
    plan: {
      tipo: "plan",
      estado: "propuesto",
      filas: armado.filas.map((f) => ({
        pieceId: f.id,
        titulo: titulo(f.id),
        dia: f.dia,
        hora: f.hora,
        captionEscrito: escritos.has(f.id),
        cambiado: versiones.get(f.id) ?? null,
        ...(escritos.has(f.id) ? { caption: porId.get(f.id)?.payload.caption ?? "" } : {}),
      })),
      fuera: [...fueraPropuesta, ...armado.fuera.map((f) => ({ pieceId: f.id, titulo: titulo(f.id), motivo: f.motivo }))],
    },
  }
}

/** Cuando cambio por ultima vez el contenido de cada pieza. */
async function versionesDe(accountId: string, ids: string[]): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map()
  const { data, error } = await supabaseAdmin().from("content_pieces").select("id, contenido_cambiado_at").eq("account_id", accountId).in("id", ids)
  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as { id: string; contenido_cambiado_at: string | null }[]).map((f) => [f.id, f.contenido_cambiado_at]))
}

type FilaMensaje = { id: string; referencias: Referencia[] | null }

async function ultimoPlan(accountId: string, conversacionId: string): Promise<{ mensaje: FilaMensaje; plan: ReferenciaPlan } | null> {
  const { data, error } = await supabaseAdmin()
    .from("mensajes")
    .select("id, referencias")
    .eq("account_id", accountId)
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  for (const mensaje of (data ?? []) as FilaMensaje[]) {
    const plan = (mensaje.referencias ?? []).find((r): r is ReferenciaPlan => r.tipo === "plan")
    if (plan) return { mensaje, plan }
  }
  return null
}

export type ResultadoPlan = { ok: true; programadas: number; fuera: string[]; activo: boolean; resumen: string } | { ok: false; error: string }

/**
 * Confirmar: aqui se aprueba y se pone fecha, y solo la ultima propuesta vale. Se
 * vuelve a mirar todo porque entre proponer y confirmar pudo pasar tiempo.
 */
export async function confirmarPlan(accountId: string, conversacionId: string, mensajeId: string | null): Promise<ResultadoPlan> {
  await exigirAdvance(accountId)
  const ultimo = await ultimoPlan(accountId, conversacionId)
  if (!ultimo) return { ok: false, error: "No hay ninguna propuesta en esta conversación." }
  if (mensajeId && ultimo.mensaje.id !== mensajeId) return { ok: false, error: "Esa propuesta ya no vale: hay una más nueva." }
  if (ultimo.plan.estado !== "propuesto") return { ok: false, error: "Esa propuesta ya se programó." }

  const supabase = supabaseAdmin()
  const { timezone } = await getSettings(accountId)
  const { activo } = await horariosDe(accountId)
  const ids = ultimo.plan.filas.map((f) => f.pieceId)
  const ocupadas = await huecosTomados(accountId, timezone, new Set(ids))
  const versiones = await versionesDe(accountId, ids)
  const now = new Date()
  const hechas: ReferenciaPlan["filas"] = []
  const fuera = [...ultimo.plan.fuera]

  for (const fila of ultimo.plan.filas) {
    // Lo que se edito despues de proponer no es lo que la persona esta confirmando.
    if (fila.cambiado !== undefined && (versiones.get(fila.pieceId) ?? null) !== fila.cambiado) {
      fuera.push({ pieceId: fila.pieceId, titulo: fila.titulo, motivo: "Cambió después de la propuesta: revísalo y vuelve a proponerlo." })
      continue
    }
    const hora = horaLibre(fila.dia, fila.hora, "instagram", ocupadas)
    if (!hora || instanteLocal(fila.dia, hora, timezone).getTime() <= now.getTime()) {
      fuera.push({ pieceId: fila.pieceId, titulo: fila.titulo, motivo: "Su hora ya pasó: hay que volver a proponerla." })
      continue
    }
    const { data, error } = await supabase
      .from("content_pieces")
      .update({
        status: "approved",
        approved_at: now.toISOString(),
        programada_para: instanteLocal(fila.dia, hora, timezone).toISOString(),
        programada_intentos: 0,
        publish_error: null,
      })
      .eq("id", fila.pieceId)
      .eq("account_id", accountId)
      .in("status", ["generated", "approved"])
      .is("published_at", null)
      .eq("programada_revisar", false)
      .select("id")
    if (error) throw new Error(error.message)
    if (!data?.length) {
      fuera.push({ pieceId: fila.pieceId, titulo: fila.titulo, motivo: "Ya no se puede mover: se publicó o espera revisión." })
      continue
    }
    ocupadas.add(claveHueco("instagram", fila.dia, hora))
    hechas.push({ ...fila, hora })
  }

  // Si un post ya programado quedo fuera, es que se pidio sacarlo: la tabla dice que
  // no sale, y su fecha vieja lo publicaria igual. Tambien pierde la aprobacion:
  // aprobado y sin fecha, lo tomaria la tanda automatica.
  const sacados = fuera.map((f) => f.pieceId).filter((id) => !hechas.some((h) => h.pieceId === id))
  if (sacados.length) {
    const { error: errorSacar } = await supabase
      .from("content_pieces")
      .update({ status: "generated", approved_at: null, programada_para: null, programada_intentos: 0, publish_error: null })
      .eq("account_id", accountId)
      .in("id", sacados)
      .in("status", ["generated", "approved"])
      .is("published_at", null)
      .eq("programada_revisar", false)
    if (errorSacar) throw new Error(errorSacar.message)
  }

  const plan: ReferenciaPlan = { ...ultimo.plan, estado: "programado", filas: hechas, fuera }
  const { error } = await supabase
    .from("mensajes")
    .update({ referencias: (ultimo.mensaje.referencias ?? []).map((r) => (r.tipo === "plan" ? plan : r)) })
    .eq("id", ultimo.mensaje.id)
    .eq("account_id", accountId)
  if (error) throw new Error(error.message)

  const nuevos = fuera.length - ultimo.plan.fuera.length
  const resumen = `${hechas.length === 1 ? "Quedó 1 post programado" : `Quedaron ${hechas.length} posts programados`}.${nuevos ? ` ${nuevos} no se pudieron programar: míralos en la tabla.` : ""}${activo ? "" : " La publicación programada está apagada: no saldrán hasta encenderla en Calendario > Horarios."}`
  return { ok: true, programadas: hechas.length, fuera: fuera.map((f) => f.titulo), activo, resumen }
}

/** Confirmar con el boton: deja la respuesta en el hilo, como si la diera el coordinador. */
export async function confirmarDesdeBoton(accountId: string, conversacionId: string, mensajeId: string): Promise<ResultadoPlan> {
  const r = await confirmarPlan(accountId, conversacionId, mensajeId)
  if (r.ok) await escribirMensaje({ accountId, conversacionId, rol: "agente", agente: "coordinador", contenido: r.resumen })
  return r
}
