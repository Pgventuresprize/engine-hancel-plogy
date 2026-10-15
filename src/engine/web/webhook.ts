import crypto from "node:crypto"

import type { Redaccion } from "../redaccion/agente"
import { secretosDe } from "../secretos"
import { supabaseAdmin } from "../supabase-admin"

/**
 * El envio de noticias redactadas al portal de noticias de cada empresa.
 *
 * Funciona como un canal mas: la empresa conecta en Conexiones la URL de su
 * portal y el motor le genera un secreto. Cada noticia se envia con un POST
 * firmado (HMAC-SHA256 sobre `t.cuerpo`), segun el documento "Webhook de
 * noticias redactadas":
 *
 * - `noticia.publicada` la primera vez;
 * - `noticia.actualizada` si se vuelve a redactar una ya enviada: mismo
 *   `noticia.id` y `slug`, `version` siguiente, y el portal edita la que tiene;
 * - `noticia.retirada` si se descarta una ya enviada;
 * - `ping` desde el boton "Enviar prueba".
 *
 * Un envio que falla se reintenta con esperas crecientes durante 24 horas (8
 * intentos); un 4xx que no se arregla reintentando se queda en error. Cada
 * intento queda en `web_entregas`.
 */

export const VERSION_ESQUEMA = "1"
const MAX_INTENTOS = 8
/** Espera antes del intento n+1, en minutos. */
const ESPERAS_MIN = [1, 5, 30, 120, 360, 720, 1440]
const PERMANENTES = new Set([400, 401, 403, 404, 410, 422])
const TIMEOUT_MS = 15_000

export type TipoEvento = "noticia.publicada" | "noticia.actualizada" | "noticia.retirada" | "ping"

// ----------------------------------------------------------------- conexion

export type ConexionWeb = { url: string; secreto: string }

export async function conexionWeb(accountId: string): Promise<ConexionWeb | null> {
  const s = (await secretosDe(accountId)) as { web_webhook_url?: string | null; web_webhook_secret?: string | null }
  if (!s.web_webhook_url || !s.web_webhook_secret) return null
  return { url: s.web_webhook_url, secreto: s.web_webhook_secret }
}

export function nuevoSecreto(): string {
  return `whsec_${crypto.randomBytes(32).toString("hex")}`
}

// -------------------------------------------------------------------- envio

export function firmar(secreto: string, t: number, cuerpo: string): string {
  return crypto.createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex")
}

type Respuesta = { ok: boolean; status: number | null; cuerpo: string; error: string | null; ms: number; retryAfter: number | null }

async function enviar(conexion: ConexionWeb, tipo: TipoEvento, eventoId: string, intento: number, evento: unknown): Promise<Respuesta> {
  const cuerpo = JSON.stringify(evento)
  const t = Math.floor(Date.now() / 1000)
  const inicio = Date.now()
  try {
    const res = await fetch(conexion.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "Hancel-Webhooks/1.0",
        "X-Hancel-Event": tipo,
        "X-Hancel-Delivery": eventoId,
        "X-Hancel-Attempt": String(intento),
        "X-Hancel-Signature": `t=${t},v1=${firmar(conexion.secreto, t, cuerpo)}`,
      },
      body: cuerpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const texto = (await res.text()).slice(0, 2000)
    const ra = Number(res.headers.get("retry-after"))
    return { ok: res.ok, status: res.status, cuerpo: texto, error: res.ok ? null : `HTTP ${res.status}: ${texto.slice(0, 300)}`, ms: Date.now() - inicio, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null }
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "TimeoutError" ? "El portal no respondió en 15 segundos." : e.message) : String(e)
    return { ok: false, status: null, cuerpo: "", error: msg, ms: Date.now() - inicio, retryAfter: null }
  }
}

function idEvento(redaccionId: string, tipo: TipoEvento, version: number): string {
  return `evt_${crypto.createHash("sha1").update(`${redaccionId}:${tipo}:${version}`).digest("hex").slice(0, 20)}`
}

// -------------------------------------------------------------- la noticia

type Empresa = { id: string; slug: string; nombre: string }

type FilaRedaccion = {
  id: string
  account_id: string
  raw_news_id: string
  status: string
  titular: string | null
  payload: Redaccion | null
  fuentes: { id: string; url: string; tipo: string; fecha: string | null; medio: string | null; titulo: string | null }[] | null
  imagen_url: string | null
  imagen_credito: { medio: string | null; autor: string | null; url_origen: string | null } | null
  imagen_ancho: number | null
  imagen_alto: number | null
  word_count: number | null
  redactada_at: string | null
  nicho_slug: string | null
  nicho_nombre: string | null
  version: number
  slug: string | null
  web_status: string | null
  web_version: number
  web_intentos: number
  web_publicada_at: string | null
}

const COLUMNAS =
  "id, account_id, raw_news_id, status, titular, payload, fuentes, imagen_url, imagen_credito, imagen_ancho, imagen_alto, word_count, redactada_at, nicho_slug, nicho_nombre, version, slug, web_status, web_version, web_intentos, web_publicada_at"

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function medioLegible(medio: string | null, url: string): string {
  const m = (medio ?? "").trim()
  if (m && !/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(m)) return m
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return m || url
  }
}

function slugDe(titular: string): string {
  const base = titular
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (base.length <= 80) return base || "noticia"
  return base.slice(0, 80).replace(/-[^-]*$/, "") || "noticia"
}

/** Fija el slug de la noticia la primera vez que sale; despues no cambia. */
async function asegurarSlug(fila: FilaRedaccion): Promise<string> {
  if (fila.slug) return fila.slug
  const supabase = supabaseAdmin()
  const base = slugDe(fila.titular ?? "noticia")
  let slug = base
  for (let i = 2; i < 100; i++) {
    const { count } = await supabase
      .from("news_redacciones")
      .select("id", { count: "exact", head: true })
      .eq("account_id", fila.account_id)
      .eq("slug", slug)
      .neq("id", fila.id)
    if (!count) break
    slug = `${base}-${i}`
  }
  await supabase.from("news_redacciones").update({ slug }).eq("id", fila.id)
  fila.slug = slug
  return slug
}

function resumenDe(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim()
  if (limpio.length <= 160) return limpio
  const corte = limpio.slice(0, 157)
  return `${corte.slice(0, corte.lastIndexOf(" ")).replace(/[,;:.]$/, "")}...`
}

async function noticiaParaEnviar(fila: FilaRedaccion, publicadaAt: string) {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("raw_news").select("link, keywords_matched").eq("id", fila.raw_news_id).maybeSingle()
  const news = (data ?? { link: null, keywords_matched: [] }) as { link: string | null; keywords_matched: string[] | null }
  const r = fila.payload as Redaccion
  const slug = await asegurarSlug(fila)
  const credito = fila.imagen_credito
  const usadas = new Set(r.fuentes_usadas)
  const fuentes = (fila.fuentes ?? [])
    .filter((f) => usadas.size === 0 || usadas.has(f.id))
    .map((f) => ({
      id: f.id,
      medio: medioLegible(f.medio, f.url),
      titulo: f.titulo,
      url: f.url,
      fecha: f.fecha && /\d{4}/.test(f.fecha) ? f.fecha : null,
      tipo: f.tipo,
      principal: f.id === r.fuente_principal,
    }))
  const html = [
    ...r.entrada.parrafos.map((p) => `<p>${escapar(p)}</p>`),
    ...r.secciones.flatMap((s) => [`<h2>${escapar(s.subtitulo)}</h2>`, ...s.parrafos.map((p) => `<p>${escapar(p)}</p>`)]),
  ].join("")
  const palabras = fila.word_count ?? r.word_count
  return {
    id: fila.raw_news_id,
    version: fila.version,
    slug,
    idioma: "es-CO",
    titular: r.titular,
    resumen: resumenDe(r.entrada.parrafos[0] ?? r.titular),
    nicho: fila.nicho_slug ? { slug: fila.nicho_slug, nombre: fila.nicho_nombre } : null,
    etiquetas: news.keywords_matched ?? [],
    entrada: r.entrada,
    secciones: r.secciones,
    cuerpo_html: html,
    imagen: fila.imagen_url
      ? {
          url: fila.imagen_url,
          ancho: fila.imagen_ancho,
          alto: fila.imagen_alto,
          alt: r.titular,
          credito: {
            texto: credito?.medio ? `Foto: ${credito.medio}${credito.autor ? ` / ${credito.autor}` : ""}` : null,
            medio: credito?.medio ?? null,
            autor: credito?.autor ?? null,
            url_origen: credito?.url_origen ?? null,
          },
        }
      : null,
    fuentes,
    palabras,
    minutos_lectura: Math.max(1, Math.ceil(palabras / 200)),
    redactada_at: fila.redactada_at,
    publicada_at: publicadaAt,
    url_original: news.link,
  }
}

async function empresaDe(accountId: string): Promise<Empresa> {
  const { data } = await supabaseAdmin().from("accounts").select("id, slug, name").eq("id", accountId).single()
  const a = data as { id: string; slug: string; name: string }
  return { id: a.id, slug: a.slug, nombre: a.name }
}

// ---------------------------------------------------------------- la pasada

export type ResumenWeb = { conectado: boolean; enviadas: number; fallidas: number; errores: string[] }

/**
 * Envia lo que toca: marca en automatico las redactadas nuevas y despues
 * envia las pendientes y los reintentos que ya llegaron a su hora.
 */
export async function procesarWeb(accountId: string, limite = 6): Promise<ResumenWeb> {
  const resumen: ResumenWeb = { conectado: false, enviadas: 0, fallidas: 0, errores: [] }
  const conexion = await conexionWeb(accountId)
  if (!conexion) return resumen
  resumen.conectado = true
  const supabase = supabaseAdmin()
  const ahora = new Date()

  // En automatico sale toda redactada nueva. "Nueva" es redactada desde que se
  // encendio el automatico: encenderlo no vacia de golpe el historico.
  const { data: cfg } = await supabase.from("generation_config").select("web_envio_auto, web_auto_desde").eq("account_id", accountId).maybeSingle()
  const c = cfg as { web_envio_auto: boolean; web_auto_desde: string } | null
  if (c?.web_envio_auto !== false) {
    await supabase
      .from("news_redacciones")
      .update({ web_status: "pendiente", web_intentos: 0, web_error: null })
      .eq("account_id", accountId)
      .eq("status", "redactada")
      .is("web_status", null)
      .gte("redactada_at", c?.web_auto_desde ?? ahora.toISOString())
  }

  // Un envio que se quedo a medias (el proceso murio) vuelve a la cola.
  await supabase
    .from("news_redacciones")
    .update({ web_status: "pendiente" })
    .eq("account_id", accountId)
    .eq("web_status", "enviando")
    .lt("updated_at", new Date(ahora.getTime() - 10 * 60_000).toISOString())

  const { data } = await supabase
    .from("news_redacciones")
    .select(COLUMNAS)
    .eq("account_id", accountId)
    .or(`web_status.eq.pendiente,and(web_status.eq.error,web_intentos.lt.${MAX_INTENTOS},web_proximo_at.lte.${ahora.toISOString()})`)
    .order("redactada_at", { ascending: true })
    .limit(limite)
  const filas = (data ?? []) as FilaRedaccion[]
  if (filas.length === 0) return resumen
  const empresa = await empresaDe(accountId)

  for (const fila of filas) {
    // Que tipo de evento es depende de como esta la redaccion ahora.
    let tipo: TipoEvento
    if (fila.status === "descartada") {
      if (fila.web_version === 0) {
        await supabase.from("news_redacciones").update({ web_status: null }).eq("id", fila.id)
        continue
      }
      tipo = "noticia.retirada"
    } else if (fila.status === "redactada" && fila.payload) {
      tipo = fila.web_version === 0 ? "noticia.publicada" : "noticia.actualizada"
    } else {
      // Se esta volviendo a redactar: sale cuando termine.
      continue
    }

    const { data: mia } = await supabase
      .from("news_redacciones")
      .update({ web_status: "enviando", updated_at: new Date().toISOString() })
      .eq("id", fila.id)
      .eq("web_status", fila.web_status as string)
      .select("id")
      .maybeSingle()
    if (!mia) continue

    const eventoId = idEvento(fila.id, tipo, fila.version)
    const intento = fila.web_status === "error" ? fila.web_intentos + 1 : 1
    const publicadaAt = fila.web_publicada_at ?? new Date().toISOString()
    const evento = {
      evento: { id: eventoId, tipo, creado_at: new Date().toISOString(), version_esquema: VERSION_ESQUEMA },
      empresa,
      noticia:
        tipo === "noticia.retirada"
          ? { id: fila.raw_news_id, version: fila.version, slug: fila.slug, motivo: "Retirada desde el estudio." }
          : await noticiaParaEnviar(fila, publicadaAt),
    }

    const r = await enviar(conexion, tipo, eventoId, intento, evento)
    await supabase.from("web_entregas").insert({
      account_id: accountId,
      redaccion_id: fila.id,
      evento_id: eventoId,
      tipo,
      intento,
      status_code: r.status,
      respuesta: r.cuerpo.slice(0, 2000),
      error: r.error,
      ms: r.ms,
    })

    if (r.ok) {
      let url: string | null = null
      let idExterno: string | null = null
      try {
        const j = JSON.parse(r.cuerpo) as { url?: unknown; id_externo?: unknown }
        if (typeof j.url === "string" && /^https?:\/\//.test(j.url)) url = j.url
        if (j.id_externo !== undefined && j.id_externo !== null) idExterno = String(j.id_externo)
      } catch {
        // La respuesta puede venir vacia: el 2xx basta.
      }
      await supabase
        .from("news_redacciones")
        .update({
          web_status: tipo === "noticia.retirada" ? "retirada" : "enviada",
          web_version: fila.version,
          web_evento_id: eventoId,
          web_url: url ?? undefined,
          web_id_externo: idExterno ?? undefined,
          web_publicada_at: publicadaAt,
          web_enviada_at: new Date().toISOString(),
          web_error: null,
          web_intentos: 0,
          web_proximo_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fila.id)
      resumen.enviadas++
    } else {
      const permanente = r.status !== null && PERMANENTES.has(r.status)
      const agotado = permanente || intento >= MAX_INTENTOS
      const esperaMin = r.retryAfter ? Math.ceil(r.retryAfter / 60) : ESPERAS_MIN[Math.min(intento - 1, ESPERAS_MIN.length - 1)]
      await supabase
        .from("news_redacciones")
        .update({
          web_status: "error",
          web_evento_id: eventoId,
          web_error: `${permanente ? "Rechazada por el portal" : agotado ? "Sin respuesta tras 8 intentos" : `Intento ${intento} fallido`}: ${r.error ?? ""}`.slice(0, 500),
          web_intentos: agotado ? MAX_INTENTOS : intento,
          web_proximo_at: agotado ? null : new Date(Date.now() + esperaMin * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", fila.id)
      resumen.fallidas++
      resumen.errores.push(`${fila.titular?.slice(0, 60)}: ${r.error}`)
    }
  }
  return resumen
}

/** El `ping` del boton "Enviar prueba": verifica que el portal recibe y valida la firma. */
export async function enviarPrueba(accountId: string): Promise<{ ok: boolean; status: number | null; detalle: string }> {
  const conexion = await conexionWeb(accountId)
  if (!conexion) return { ok: false, status: null, detalle: "Primero guarda la URL del portal." }
  const eventoId = `evt_ping_${crypto.randomBytes(6).toString("hex")}`
  const r = await enviar(conexion, "ping", eventoId, 1, {
    evento: { id: eventoId, tipo: "ping", creado_at: new Date().toISOString(), version_esquema: VERSION_ESQUEMA },
    empresa: await empresaDe(accountId),
  })
  await supabaseAdmin().from("web_entregas").insert({
    account_id: accountId,
    evento_id: eventoId,
    tipo: "ping",
    status_code: r.status,
    respuesta: r.cuerpo.slice(0, 2000),
    error: r.error,
    ms: r.ms,
  })
  return { ok: r.ok, status: r.status, detalle: r.ok ? `El portal respondió ${r.status} en ${r.ms} ms.` : (r.error ?? "Sin respuesta.") }
}

/** Pide que una redaccion salga (o se actualice, o se retire) en la proxima pasada. */
export async function marcarParaWeb(redaccionId: string): Promise<void> {
  await supabaseAdmin()
    .from("news_redacciones")
    .update({ web_status: "pendiente", web_intentos: 0, web_error: null, web_proximo_at: null })
    .eq("id", redaccionId)
}
