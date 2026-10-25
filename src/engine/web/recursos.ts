import { parseFigurasGuardadas, SIN_FIGURAS, type FigurasGuardadas } from "../recursos/figuras-modelo"
import type { Recurso } from "../recursos/modelo"
import { armarPagina, cuerpoConFiguras, nombreDeMarca, temaDeMarca, type FuentePagina, type TemaPagina } from "../recursos/pagina"
import type { FuenteGuardada } from "../recursos/agente"
import { supabaseAdmin } from "../supabase-admin"
import {
  conexionWeb,
  empresaDe,
  enviar,
  ESPERAS_MIN,
  idEvento,
  MAX_INTENTOS,
  medioLegible,
  PERMANENTES,
  slugDe,
  VERSION_ESQUEMA,
  type ConexionWeb,
  type TipoEvento,
} from "./webhook"

/**
 * El envio de los recursos (reportes y guias) al portal de la marca, por el
 * mismo webhook firmado que las noticias redactadas:
 *
 * - `recurso.publicado` la primera vez que una persona lo aprueba;
 * - `recurso.actualizado` si se aprueba otra version del mismo: mismo `id` y
 *   `slug`, `version` siguiente;
 * - `recurso.retirado` si se descarta uno ya enviado.
 *
 * Nada sale sin aprobacion: el kit lo pide y el DM promete lo que ahi se lee.
 * El portal responde `{"url": "..."}` con la direccion publica del recurso; con
 * ella sale el enlace del mensaje 2 del DM y la pieza ya se puede publicar.
 *
 * Lo que trae cada recurso, de mas hecho a mas crudo:
 * - `pagina_html`: la pagina entera, con el estilo de la marca, la portada, las
 *   figuras y la foto en su sitio. El portal puede publicarla tal cual.
 * - `cuerpo_html`: el mismo cuerpo con sus figuras, sin estilo ni cabecera.
 * - `secciones` (los bloques con su rotulo y sus fuentes), `portada` y
 *   `figuras` ({clave, url, alt, pie, ancho, alto, seccion, despues_de}), para
 *   el portal que lo pinte a su manera. Las imagenes son URL publicas.
 */

type FilaRecurso = {
  id: string
  account_id: string
  content_angle_id: string
  raw_news_id: string | null
  status: string
  tipo: string
  titular: string
  palabra: string
  payload: Recurso
  fuentes: { leidas?: FuenteGuardada[]; pendientes?: { url: string; medio: string }[]; imagen?: string | null } | null
  registro: { no_se_sabe?: string[] } | null
  word_count: number | null
  version: number
  figuras?: unknown
  created_at: string
  updated_at: string
  slug: string | null
  web_status: string | null
  web_version: number
  web_intentos: number
  web_publicada_at: string | null
}

// Todas: la columna de figuras puede no estar todavia (migracion 2026-10-25).
const COLUMNAS = "*"

// --------------------------------------------------------------- el html

/** Las fuentes citadas, como las pinta la pagina. */
function fuentesDePagina(fuentes: FuenteGuardada[]): FuentePagina[] {
  return fuentes.map((f) => ({ id: f.id, url: f.url, medio: medioLegible(f.medio, f.url), titulo: f.titulo, fecha: f.fecha, lectura: f.lectura }))
}

/** El cuerpo del recurso con sus figuras, sin estilo: para el portal que lo pinte a su manera. */
export function cuerpoHtml(r: Recurso, fuentes: FuenteGuardada[], figuras: FigurasGuardadas = SIN_FIGURAS): string {
  return cuerpoConFiguras(r, figuras, fuentesDePagina(fuentes))
}

/** La fila del recurso como pagina web completa, con el estilo de la marca (pagina.ts). */
export function paginaDeFila(fila: Pick<FilaRecurso, "payload" | "fuentes" | "figuras" | "version" | "updated_at" | "word_count">, tema: TemaPagina | null, marca: string, url?: string | null): string {
  const r = fila.payload
  const usadas = new Set(r.fuentes_usadas)
  const citadas = (fila.fuentes?.leidas ?? []).filter((f) => usadas.size === 0 || usadas.has(f.id))
  return armarPagina({
    recurso: r,
    figuras: parseFigurasGuardadas(fila.figuras),
    fuentes: fuentesDePagina(citadas),
    tema,
    marca,
    version: fila.version,
    fecha: fila.updated_at,
    palabras: fila.word_count ?? 0,
    url,
  })
}

// ------------------------------------------------------------- el envio

/** Fija el slug del recurso la primera vez que sale; despues no cambia. */
async function asegurarSlug(fila: FilaRecurso): Promise<string> {
  if (fila.slug) return fila.slug
  const supabase = supabaseAdmin()
  const base = slugDe(fila.titular || "recurso")
  let slug = base
  for (let i = 2; i < 100; i++) {
    const { count } = await supabase
      .from("content_recursos")
      .select("id", { count: "exact", head: true })
      .eq("account_id", fila.account_id)
      .eq("slug", slug)
      .neq("id", fila.id)
    if (!count) break
    slug = `${base}-${i}`
  }
  await supabase.from("content_recursos").update({ slug }).eq("id", fila.id)
  fila.slug = slug
  return slug
}

async function recursoParaEnviar(fila: FilaRecurso, publicadoAt: string, tema: TemaPagina | null, marca: string) {
  const r = fila.payload
  const figuras = parseFigurasGuardadas(fila.figuras)
  const portada = figuras.lista.find((f) => f.tipo === "portada") ?? null
  const fuentes = fila.fuentes?.leidas ?? []
  const usadas = new Set(r.fuentes_usadas)
  const citadas = fuentes.filter((f) => usadas.size === 0 || usadas.has(f.id))
  const { data } = fila.raw_news_id
    ? await supabaseAdmin().from("raw_news").select("link, source").eq("id", fila.raw_news_id).maybeSingle()
    : { data: null }
  const noticia = data as { link: string | null; source: string | null } | null
  const imagen = fila.fuentes?.imagen ?? null
  const palabras = fila.word_count ?? 0
  return {
    id: fila.id,
    version: fila.version,
    slug: await asegurarSlug(fila),
    idioma: "es-CO",
    tipo: fila.tipo,
    titular: r.titular,
    resumen: r.resumen,
    palabra: fila.palabra,
    secciones: r.secciones,
    siguiente_paso: r.siguiente_paso,
    pagina_html: paginaDeFila(fila, tema, marca),
    cuerpo_html: cuerpoHtml(r, citadas, figuras),
    portada: portada ? { url: portada.url, alt: portada.alt, ancho: portada.ancho, alto: portada.alto } : null,
    figuras: [...figuras.lista.filter((f) => f.tipo !== "portada"), ...(figuras.foto ? [{ ...figuras.foto, clave: "foto", tipo: "foto" as const }] : [])].map((f) => ({
      clave: f.clave,
      tipo: f.tipo,
      url: f.url,
      alt: f.alt,
      pie: f.pie,
      ancho: f.ancho,
      alto: f.alto,
      seccion: f.seccion,
      despues_de: f.despues_de,
    })),
    fuentes: citadas.map((f) => ({ id: f.id, medio: medioLegible(f.medio, f.url), titulo: f.titulo || null, url: f.url, fecha: f.fecha || null, tipo: f.tipo, lectura: f.lectura })),
    no_se_sabe: fila.registro?.no_se_sabe ?? [],
    imagen: imagen ? { url: imagen, alt: r.titular, credito: { medio: noticia?.source ?? null, url_origen: noticia?.link ?? null } } : null,
    palabras,
    minutos_lectura: Math.max(1, Math.ceil(palabras / 200)),
    escrito_at: fila.created_at,
    publicado_at: publicadoAt,
    url_noticia: noticia?.link ?? null,
  }
}

export type ResumenWebRecursos = { conectado: boolean; enviados: number; fallidos: number; errores: string[] }

/** Envia los recursos que toca: los recien aprobados, los retirados y los reintentos. */
export async function procesarWebRecursos(
  accountId: string,
  limite = 6,
  /** Otra conexion que la de la cuenta: para probar el envio contra un receptor de prueba. */
  conexionDePrueba?: ConexionWeb
): Promise<ResumenWebRecursos> {
  const resumen: ResumenWebRecursos = { conectado: false, enviados: 0, fallidos: 0, errores: [] }
  const conexion = conexionDePrueba ?? (await conexionWeb(accountId))
  if (!conexion) return resumen
  resumen.conectado = true
  const supabase = supabaseAdmin()
  const ahora = new Date()

  // Un envio que se quedo a medias (el proceso murio) vuelve a la cola.
  await supabase
    .from("content_recursos")
    .update({ web_status: "pendiente" })
    .eq("account_id", accountId)
    .eq("web_status", "enviando")
    .lt("updated_at", new Date(ahora.getTime() - 10 * 60_000).toISOString())

  const { data } = await supabase
    .from("content_recursos")
    .select(COLUMNAS)
    .eq("account_id", accountId)
    .or(`web_status.eq.pendiente,and(web_status.eq.error,web_intentos.lt.${MAX_INTENTOS},web_proximo_at.lte.${ahora.toISOString()})`)
    .order("updated_at", { ascending: true })
    .limit(limite)
  const filas = (data ?? []) as FilaRecurso[]
  if (filas.length === 0) return resumen
  const empresa = await empresaDe(accountId)
  const [tema, marca] = await Promise.all([temaDeMarca(accountId), nombreDeMarca(accountId)])

  for (const fila of filas) {
    let tipo: TipoEvento
    if (fila.status === "descartado") {
      if (fila.web_version === 0) {
        await supabase.from("content_recursos").update({ web_status: null }).eq("id", fila.id)
        continue
      }
      tipo = "recurso.retirado"
    } else if (fila.status === "aprobado") {
      tipo = fila.web_version === 0 ? "recurso.publicado" : "recurso.actualizado"
    } else {
      // Una version sin aprobar no sale: espera a que alguien la apruebe.
      continue
    }

    const { data: mia } = await supabase
      .from("content_recursos")
      .update({ web_status: "enviando", updated_at: new Date().toISOString() })
      .eq("id", fila.id)
      .eq("web_status", fila.web_status as string)
      .select("id")
      .maybeSingle()
    if (!mia) continue

    const eventoId = idEvento(fila.id, tipo, fila.version)
    const intento = fila.web_status === "error" ? fila.web_intentos + 1 : 1
    const publicadoAt = fila.web_publicada_at ?? new Date().toISOString()
    const evento = {
      evento: { id: eventoId, tipo, creado_at: new Date().toISOString(), version_esquema: VERSION_ESQUEMA },
      empresa,
      recurso:
        tipo === "recurso.retirado"
          ? { id: fila.id, version: fila.version, slug: fila.slug, motivo: "Retirado desde el estudio." }
          : await recursoParaEnviar(fila, publicadoAt, tema, marca),
    }

    const r = await enviar(conexion, tipo, eventoId, intento, evento)
    await supabase.from("web_entregas").insert({
      account_id: accountId,
      recurso_id: fila.id,
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
      try {
        const j = JSON.parse(r.cuerpo) as { url?: unknown }
        if (typeof j.url === "string" && /^https?:\/\//.test(j.url)) url = j.url
      } catch {
        // La respuesta puede venir vacia: el 2xx basta, pero sin URL el DM no tiene enlace.
      }
      await supabase
        .from("content_recursos")
        .update({
          web_status: tipo === "recurso.retirado" ? "retirada" : "enviada",
          web_version: fila.version,
          web_evento_id: eventoId,
          web_url: tipo === "recurso.retirado" ? null : (url ?? undefined),
          web_publicada_at: publicadoAt,
          web_error: url || tipo === "recurso.retirado" ? null : "El portal recibió el recurso pero no devolvió su URL: el DM no tiene enlace.",
          web_intentos: 0,
          web_proximo_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fila.id)
      resumen.enviados++
    } else {
      const permanente = r.status !== null && PERMANENTES.has(r.status)
      const agotado = permanente || intento >= MAX_INTENTOS
      const esperaMin = r.retryAfter ? Math.ceil(r.retryAfter / 60) : ESPERAS_MIN[Math.min(intento - 1, ESPERAS_MIN.length - 1)]
      await supabase
        .from("content_recursos")
        .update({
          web_status: "error",
          web_evento_id: eventoId,
          web_error: `${permanente ? "Rechazado por el portal" : agotado ? "Sin respuesta tras 8 intentos" : `Intento ${intento} fallido`}: ${r.error ?? ""}`.slice(0, 500),
          web_intentos: agotado ? MAX_INTENTOS : intento,
          web_proximo_at: agotado ? null : new Date(Date.now() + esperaMin * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", fila.id)
      resumen.fallidos++
      resumen.errores.push(`${fila.titular.slice(0, 60)}: ${r.error}`)
    }
  }
  return resumen
}
