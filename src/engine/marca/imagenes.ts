import { llamarClaude, parsearJSONDeClaude } from "../claude/messages"
import { supabaseAdmin } from "../supabase-admin"
import { perfilDe } from "./perfil"
import {
  BUCKET_IMAGENES,
  DIAS_SIN_REPETIR_POR_DEFECTO,
  esHuella,
  LADO_MINI,
  miniDe,
  MAX_BYTES_IMAGEN,
  orientacionDe,
  parseEtiquetas,
  parseImagen,
  parseRecorte,
  textoDeBusqueda,
  tonoDe,
  type Etiquetas,
  type FotoDeBiblioteca,
  type Imagen,
  type Recorte,
  type UsoDeImagen,
  type UsoImagen,
} from "./imagenes-modelo"

export * from "./imagenes-modelo"

/**
 * La biblioteca de imagenes de la marca.
 *
 * Las imagenes viven en el bucket privado `marca-imagenes`, ya comprimidas por
 * el navegador; la tabla `brand_imagenes` guarda solo su ficha y
 * `brand_imagenes_usos` en que pieza salio cada una. El carrusel elige de aqui
 * antes de ir a Pexels, sin repetir lo usado en los ultimos dias de la marca.
 *
 * Todo lo que lee tolera que la migracion no este aplicada: sin las tablas, el
 * carrusel sigue con Pexels y la pantalla avisa de que falta activarla.
 */

/** Quien mira las fotos: al etiquetarlas y al elegir. Lo visual pesa en la pieza. */
export const MODELO_IMAGENES = "claude-opus-5-5"

/** Cuanto dura un enlace firmado de la galeria o de lo que mira Claude. */
const SEGUNDOS_URL = 60 * 60
/** Cuantas miran a la vez al etiquetar. */
const A_LA_VEZ = 4
/** Cuantas candidatas ve Claude para elegir las de un carrusel. */
const CANDIDATAS_PARA_ELEGIR = 12
/** Una imagen que lleva mas que esto en 'procesando' se dio por perdida. */
const MINUTOS_PROCESANDO = 10

/** La tabla todavia no existe: la migracion no se ha aplicado. */
export function faltaTabla(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    /does not exist|could not find the table/i.test(error.message ?? "")
  )
}

export async function bibliotecaDisponible(): Promise<boolean> {
  const { error } = await supabaseAdmin().from("brand_imagenes").select("id", { head: true, count: "exact" }).limit(1)
  return !faltaTabla(error)
}

// ------------------------------------------------------------------ ajustes

export async function diasSinRepetir(accountId: string): Promise<number> {
  const { data } = await supabaseAdmin().from("brand_profile").select("*").eq("account_id", accountId).maybeSingle()
  const dias = Number((data as Record<string, unknown> | null)?.dias_sin_repetir_imagen)
  return Number.isFinite(dias) && dias >= 0 ? dias : DIAS_SIN_REPETIR_POR_DEFECTO
}

export async function guardarDiasSinRepetir(accountId: string, dias: number): Promise<void> {
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) throw new Error("Los días sin repetir van de 0 a 365.")
  // Upsert con solo esta columna: si el perfil ya existe no toca nada mas.
  const { error } = await supabaseAdmin()
    .from("brand_profile")
    .upsert({ account_id: accountId, dias_sin_repetir_imagen: dias }, { onConflict: "account_id" })
  if (error) throw new Error(faltaTabla(error) ? "Falta aplicar la migración de la biblioteca." : error.message)
}

// ------------------------------------------------------------------- lectura

/** Si la cuenta tiene alguna foto lista para usar. Sin tablas, no. */
export async function hayFotosEnBiblioteca(accountId: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin()
    .from("brand_imagenes")
    .select("id", { head: true, count: "exact" })
    .eq("account_id", accountId)
    .eq("activa", true)
    .eq("etiquetado", "hecho")
  return !error && (count ?? 0) > 0
}

export type ResumenBiblioteca = {
  total: number
  activas: number
  pendientes: number
  fallidas: number
  bytes: number
  diasSinRepetir: number
}

export async function resumenBiblioteca(accountId: string): Promise<ResumenBiblioteca> {
  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from("brand_imagenes")
    .select("activa, etiquetado, bytes")
    .eq("account_id", accountId)
  if (error) throw new Error(error.message)
  const filas = (data ?? []) as { activa: boolean; etiquetado: string; bytes: number }[]
  return {
    total: filas.length,
    activas: filas.filter((f) => f.activa).length,
    pendientes: filas.filter((f) => f.etiquetado === "pendiente" || f.etiquetado === "procesando").length,
    fallidas: filas.filter((f) => f.etiquetado === "fallido").length,
    // Cada imagen guarda tambien su miniatura, que pesa una decima parte.
    bytes: filas.reduce((n, f) => n + (f.bytes || 0), 0),
    diasSinRepetir: await diasSinRepetir(accountId),
  }
}

export type FiltrosGaleria = {
  busqueda?: string
  uso?: UsoImagen | null
  orientacion?: Imagen["orientacion"] | null
  estado?: "activas" | "apagadas" | "pendientes" | "nunca_usadas" | null
}

export type ImagenDeGaleria = Imagen & { urlMini: string | null; usos: number; ultimoUso: string | null }

export const POR_PAGINA = 60

export async function galeria(
  accountId: string,
  filtros: FiltrosGaleria,
  pagina = 0
): Promise<{ imagenes: ImagenDeGaleria[]; hayMas: boolean }> {
  const supabase = supabaseAdmin()
  let q = supabase.from("brand_imagenes").select("*").eq("account_id", accountId)

  const busqueda = palabrasDe(filtros.busqueda ?? "")
  if (busqueda.length) q = q.textSearch("busqueda", busqueda.join(" "), { type: "websearch", config: "simple" })
  if (filtros.uso) q = q.contains("usos_sugeridos", [filtros.uso])
  if (filtros.orientacion) q = q.eq("orientacion", filtros.orientacion)
  if (filtros.estado === "activas") q = q.eq("activa", true)
  if (filtros.estado === "apagadas") q = q.eq("activa", false)
  if (filtros.estado === "pendientes") q = q.in("etiquetado", ["pendiente", "procesando", "fallido"])

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA)
  if (error) throw new Error(error.message)

  let imagenes = ((data ?? []) as Record<string, unknown>[]).map(parseImagen)
  const hayMas = imagenes.length > POR_PAGINA
  imagenes = imagenes.slice(0, POR_PAGINA)

  const conteos = await conteoDeUsos(accountId, imagenes.map((i) => i.id))
  if (filtros.estado === "nunca_usadas") imagenes = imagenes.filter((i) => !conteos.has(i.id))
  const urls = await urlsFirmadas(imagenes.map(miniDe))

  return {
    imagenes: imagenes.map((i) => ({
      ...i,
      urlMini: urls.get(miniDe(i)) ?? null,
      usos: conteos.get(i.id)?.n ?? 0,
      ultimoUso: conteos.get(i.id)?.ultimo ?? null,
    })),
    hayMas,
  }
}

/** Usos vigentes por imagen, sin contar las piezas descartadas. */
async function conteoDeUsos(accountId: string, ids: string[]): Promise<Map<string, { n: number; ultimo: string }>> {
  const conteos = new Map<string, { n: number; ultimo: string }>()
  if (ids.length === 0) return conteos
  const { data } = await supabaseAdmin()
    .from("brand_imagenes_usos")
    .select("imagen_id, created_at, content_pieces(status)")
    .eq("account_id", accountId)
    .eq("vigente", true)
    .in("imagen_id", ids)
  for (const u of (data ?? []) as unknown as { imagen_id: string; created_at: string; content_pieces: { status: string } | null }[]) {
    if (u.content_pieces?.status === "rejected") continue
    const previo = conteos.get(u.imagen_id)
    conteos.set(u.imagen_id, {
      n: (previo?.n ?? 0) + 1,
      ultimo: previo && previo.ultimo > u.created_at ? previo.ultimo : u.created_at,
    })
  }
  return conteos
}

export async function usosDeImagen(accountId: string, imagenId: string): Promise<(UsoDeImagen & { estadoPieza: string | null })[]> {
  const { data, error } = await supabaseAdmin()
    .from("brand_imagenes_usos")
    .select("imagen_id, piece_id, red, lamina, motivo, created_at, content_pieces(status)")
    .eq("account_id", accountId)
    .eq("imagen_id", imagenId)
    .eq("vigente", true)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as (UsoDeImagen & { content_pieces: { status: string } | null })[]).map(
    ({ content_pieces, ...u }) => ({ ...u, estadoPieza: content_pieces?.status ?? null })
  )
}

export async function urlsFirmadas(rutas: string[], segundos = SEGUNDOS_URL): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  const unicas = [...new Set(rutas.filter(Boolean))]
  if (unicas.length === 0) return urls
  const { data } = await supabaseAdmin().storage.from(BUCKET_IMAGENES).createSignedUrls(unicas, segundos)
  for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl)
  return urls
}

export async function imagenDe(accountId: string, id: string): Promise<Imagen | null> {
  const { data } = await supabaseAdmin().from("brand_imagenes").select("*").eq("id", id).eq("account_id", accountId).maybeSingle()
  return data ? parseImagen(data as Record<string, unknown>) : null
}

// ------------------------------------------------------------------- subida

/** De las huellas que trae el navegador, las que ya estan en la biblioteca. */
export async function huellasExistentes(accountId: string, huellas: string[]): Promise<string[]> {
  const validas = huellas.filter(esHuella)
  if (validas.length === 0) return []
  const { data, error } = await supabaseAdmin()
    .from("brand_imagenes")
    .select("huella")
    .eq("account_id", accountId)
    .in("huella", validas)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { huella: string }[]).map((d) => d.huella)
}

export type SubidaPreparada = {
  id: string
  ruta: string
  rutaMini: string
  urlSubida: string
  urlSubidaMini: string
}

const EXTENSION: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }

/**
 * Enlaces de subida firmados, uno para la imagen y otro para su miniatura.
 *
 * El navegador sube directo al storage: los archivos no pasan por el servidor,
 * que en Vercel no acepta cuerpos de mas de unos pocos MB. La ficha no se crea
 * hasta que el navegador confirma que subio las dos.
 */
export async function prepararSubidas(accountId: string, tipos: string[]): Promise<SubidaPreparada[]> {
  if (tipos.length > 20) throw new Error("Se suben de 20 en 20.")
  const storage = supabaseAdmin().storage.from(BUCKET_IMAGENES)
  const salida: SubidaPreparada[] = []
  for (const tipo of tipos) {
    const ext = EXTENSION[tipo]
    if (!ext) throw new Error(`Tipo de imagen no admitido: ${tipo}`)
    const id = crypto.randomUUID()
    const ruta = `${accountId}/${id}.${ext}`
    const rutaMini = `${accountId}/${id}-mini.${ext}`
    const [a, b] = await Promise.all([storage.createSignedUploadUrl(ruta), storage.createSignedUploadUrl(rutaMini)])
    if (a.error || !a.data) throw new Error(a.error?.message ?? "No se pudo preparar la subida.")
    if (b.error || !b.data) throw new Error(b.error?.message ?? "No se pudo preparar la subida.")
    salida.push({ id, ruta, rutaMini, urlSubida: a.data.signedUrl, urlSubidaMini: b.data.signedUrl })
  }
  return salida
}

export type ImagenSubida = {
  id: string
  ruta: string
  rutaMini: string
  ancho: number
  alto: number
  bytes: number
  huella: string
  nombreOriginal: string
}

/** Crea las fichas de lo ya subido. Las repetidas (misma huella) se saltan. */
export async function registrarImagenes(accountId: string, lista: ImagenSubida[]): Promise<number> {
  const prefijo = `${accountId}/`
  const filas = lista
    .filter(
      (i) =>
        i.ruta.startsWith(prefijo) &&
        i.rutaMini.startsWith(prefijo) &&
        i.ruta.includes(i.id) &&
        esHuella(i.huella) &&
        i.ancho > 0 &&
        i.alto > 0 &&
        i.bytes > 0 &&
        i.bytes <= MAX_BYTES_IMAGEN
    )
    .map((i) => ({
      id: i.id,
      account_id: accountId,
      ruta: i.ruta,
      ruta_mini: i.rutaMini,
      ancho: Math.round(i.ancho),
      alto: Math.round(i.alto),
      orientacion: orientacionDe(i.ancho, i.alto),
      bytes: Math.round(i.bytes),
      huella: i.huella,
      nombre_original: i.nombreOriginal.slice(0, 255),
    }))
  if (filas.length === 0) return 0
  const { data, error } = await supabaseAdmin()
    .from("brand_imagenes")
    .upsert(filas, { onConflict: "account_id,huella", ignoreDuplicates: true })
    .select("id")
  if (error) throw new Error(faltaTabla(error) ? "Falta aplicar la migración de la biblioteca." : error.message)
  return (data ?? []).length
}

export type CambiosImagen = Partial<{
  activa: boolean
  descripcion: string
  etiquetas: string[]
  usos_sugeridos: UsoImagen[]
}>

export async function actualizarImagen(accountId: string, id: string, cambios: CambiosImagen): Promise<void> {
  const actual = await imagenDe(accountId, id)
  if (!actual) throw new Error("No se encontró la imagen.")
  const e = parseEtiquetas({
    ...actual,
    ...(cambios.descripcion !== undefined ? { descripcion: cambios.descripcion } : {}),
    ...(cambios.etiquetas !== undefined ? { etiquetas: cambios.etiquetas } : {}),
    ...(cambios.usos_sugeridos !== undefined ? { usos_sugeridos: cambios.usos_sugeridos } : {}),
  })
  const { error } = await supabaseAdmin()
    .from("brand_imagenes")
    .update({
      ...(cambios.activa !== undefined ? { activa: cambios.activa } : {}),
      descripcion: e.descripcion,
      etiquetas: e.etiquetas,
      usos_sugeridos: e.usos_sugeridos,
      texto_busqueda: textoDeBusqueda(e),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("account_id", accountId)
  if (error) throw new Error(error.message)
}

/** Vuelve a dejar una imagen pendiente, para que Claude la mire otra vez. */
export async function reetiquetar(accountId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("brand_imagenes")
    .update({ etiquetado: "pendiente", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", accountId)
  if (error) throw new Error(error.message)
}

// --------------------------------------------------------------- etiquetado

const SISTEMA_ETIQUETAR = `Eres el editor de fotografia de una marca. Miras una imagen de su biblioteca y la describes para que otro agente pueda elegirla despues como foto de un carrusel de Instagram o LinkedIn (laminas de 1080x1350, con texto encima).

RESPONDE SOLO con este JSON, sin texto alrededor:
{"descripcion":"<1 o 2 frases en español: que se ve, el ambiente y para que tipo de tema sirve>","etiquetas":["<10 a 18 etiquetas en minuscula: objetos, lugar, actividad, tema, color dominante, ambiente; cada una en español Y su equivalente en ingles, por ejemplo 'oficina' y 'office'>"],"usos_sugeridos":["<de: portada, fondo, cierre>"],"espacio_texto":"<arriba, abajo, centro o ninguno>","personas":<true|false>,"calidad":<1 a 5>}

- usos_sugeridos: "portada" si tiene fuerza para frenar el scroll y deja sitio para un titular grande; "fondo" si sirve detras de un texto sin competir con el; "cierre" si funciona detras de una tarjeta de vidrio con la llamada final (tranquila, sin un sujeto que quede tapado). Puede tener varios o ninguno.
- espacio_texto: donde queda una zona tranquila para el texto sin tapar lo importante.
- calidad: 5 es una foto editorial nitida y bien compuesta; 1 es borrosa, pixelada, con marcas de agua o con texto encima que no se puede tapar. Una captura de pantalla o un grafico con texto no pasa de 2 como fondo.
- No inventes lo que no se ve: si no reconoces una marca o un lugar, no lo nombres.`

/** Lo que Claude ve en una imagen, o null si no respondio con algo valido. No escribe nada. */
export async function etiquetasDeImagen(
  accountId: string,
  url: string,
  nombre: string,
  marca: string
): Promise<Etiquetas | null> {
  const r = await llamarClaude({
    accountId,
    model: MODELO_IMAGENES,
    system: SISTEMA_ETIQUETAR,
    prompt: `Marca: ${marca}\nArchivo: ${nombre || "(sin nombre)"}\n\nDescribe la imagen.`,
    imagenes: [url],
    maxTokens: 1500,
  })
  if (!r.ok) return null
  try {
    const e = parseEtiquetas(parsearJSONDeClaude(r.texto))
    return e.etiquetas.length > 0 ? e : null
  } catch {
    return null
  }
}

/**
 * Lo clara que es una imagen, de 0 a 100: la media de su luminancia (Rec. 709).
 * Se mide sobre la miniatura, que es la zona que se usa si tiene recorte.
 */
export async function luminosidadDe(bytes: Buffer): Promise<number | null> {
  try {
    const sharp = (await import("sharp")).default
    const { channels } = await sharp(bytes).flatten({ background: "#ffffff" }).removeAlpha().stats()
    if (channels.length < 3) return Math.round((channels[0].mean / 255) * 100)
    const [r, g, b] = channels.map((c) => c.mean / 255)
    return Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * 100)
  } catch {
    return null
  }
}

async function luminosidadDeMini(imagen: Imagen): Promise<number | null> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET_IMAGENES).download(miniDe(imagen))
  if (error || !data) return null
  return luminosidadDe(Buffer.from(await data.arrayBuffer()))
}

async function etiquetarUna(accountId: string, imagen: Imagen, marca: string): Promise<boolean> {
  const supabase = supabaseAdmin()
  const url = (await urlsFirmadas([imagen.ruta], 15 * 60)).get(imagen.ruta)
  const [e, luminosidad] = await Promise.all([
    url ? etiquetasDeImagen(accountId, url, imagen.nombre_original, marca) : null,
    luminosidadDeMini(imagen),
  ])
  if (!e) {
    await supabase
      .from("brand_imagenes")
      .update({ etiquetado: "fallido", updated_at: new Date().toISOString() })
      .eq("id", imagen.id)
    return false
  }
  await supabase
    .from("brand_imagenes")
    .update({
      ...e,
      ...(luminosidad !== null ? { luminosidad } : {}),
      texto_busqueda: textoDeBusqueda(e),
      etiquetado: "hecho",
      etiquetado_con: MODELO_IMAGENES,
      updated_at: new Date().toISOString(),
    })
    .eq("id", imagen.id)
  return true
}

/**
 * Etiqueta las pendientes de una cuenta, de cuatro en cuatro.
 *
 * Las reclama primero pasandolas a 'procesando', para que la pasada del tick y
 * la que se lanza al subir no paguen dos veces la misma imagen. Las que llevan
 * demasiado en 'procesando' se dan por perdidas y vuelven a la cola.
 */
export async function etiquetarPendientes(accountId: string, limite = 20): Promise<{ hechas: number; fallidas: number }> {
  const supabase = supabaseAdmin()
  const antes = new Date(Date.now() - MINUTOS_PROCESANDO * 60_000).toISOString()
  const { error: errorReclamo } = await supabase
    .from("brand_imagenes")
    .update({ etiquetado: "pendiente" })
    .eq("account_id", accountId)
    .eq("etiquetado", "procesando")
    .lt("updated_at", antes)
  if (faltaTabla(errorReclamo)) return { hechas: 0, fallidas: 0 }

  const { data } = await supabase
    .from("brand_imagenes")
    .select("id")
    .eq("account_id", accountId)
    .eq("etiquetado", "pendiente")
    .order("created_at")
    .limit(limite)
  const ids = ((data ?? []) as { id: string }[]).map((d) => d.id)
  if (ids.length === 0) return { hechas: 0, fallidas: 0 }

  const { data: reclamadas } = await supabase
    .from("brand_imagenes")
    .update({ etiquetado: "procesando", updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("etiquetado", "pendiente")
    .select("*")
  const cola = ((reclamadas ?? []) as Record<string, unknown>[]).map(parseImagen)

  const perfil = await perfilDe(accountId)
  const marca = [perfil.nombre, perfil.que_hace].filter(Boolean).join(": ") || "(sin descripcion)"
  let hechas = 0
  let fallidas = 0
  for (let i = 0; i < cola.length; i += A_LA_VEZ) {
    const tanda = await Promise.all(cola.slice(i, i + A_LA_VEZ).map((img) => etiquetarUna(accountId, img, marca)))
    hechas += tanda.filter(Boolean).length
    fallidas += tanda.filter((ok) => !ok).length
  }
  return { hechas, fallidas }
}

// ----------------------------------------------------------------- eleccion

/** Una lamina del carrusel que necesita foto. */
export type HuecoDeFoto = {
  /** 0 es la portada. */
  indice: number
  uso: UsoImagen
  /** El titular y el cuerpo de la lamina, para que la foto vaya con lo que dice. */
  texto: string
  /** Lo que pide la plantilla del kit: una foto oscura o clara, y donde queda el texto. */
  tono?: "oscura" | "clara" | "cualquiera"
  espacio?: "arriba" | "abajo" | "centro" | "cualquiera"
}

/** Si la foto va con el tono que pide el hueco. Sin luminosidad no se sabe, y no descarta. */
function vaConTono(h: HuecoDeFoto, c: Pick<Imagen, "luminosidad">): boolean {
  const tono = tonoDe(c.luminosidad)
  if (!h.tono || h.tono === "cualquiera" || tono === null) return true
  return tono === h.tono
}

/**
 * Las candidatas sin luminosidad la calculan ahora, de su miniatura, y la
 * guardan: es un dato de la imagen, no de la pieza. Nunca lanza.
 */
async function completarLuminosidad(pool: Candidata[]): Promise<void> {
  const faltan = pool.filter((c) => c.luminosidad === null)
  await Promise.all(
    faltan.map(async (c) => {
      const l = await luminosidadDeMini(c).catch(() => null)
      if (l === null) return
      c.luminosidad = l
      await supabaseAdmin().from("brand_imagenes").update({ luminosidad: l }).eq("id", c.id)
    })
  )
}

export type FotoElegida = { foto: string; imagenId: string; motivo: string }

const VACIAS = new Set(["the", "and", "with", "for", "from", "los", "las", "del", "con", "por", "para", "una", "uno", "que", "sus"])

function palabrasDe(texto: string): string[] {
  return [
    ...new Set(
      texto
        .toLocaleLowerCase("es")
        .normalize("NFC")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((p) => p.length >= 3 && !VACIAS.has(p))
    ),
  ].slice(0, 30)
}

/** Imagenes usadas en piezas vivas de la cuenta en los ultimos `dias`. */
async function usadasHace(accountId: string, dias: number): Promise<Set<string>> {
  if (dias <= 0) return new Set()
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  const { data } = await supabaseAdmin()
    .from("brand_imagenes_usos")
    .select("imagen_id, content_pieces(status)")
    .eq("account_id", accountId)
    .eq("vigente", true)
    .gte("created_at", desde)
  const usadas = new Set<string>()
  for (const u of (data ?? []) as unknown as { imagen_id: string; content_pieces: { status: string } | null }[]) {
    if (u.content_pieces?.status !== "rejected") usadas.add(u.imagen_id)
  }
  return usadas
}

/** Cuantas veces se ha usado cada imagen, en total: entre parecidas va la menos vista. */
async function vecesUsada(accountId: string, ids: string[]): Promise<Map<string, number>> {
  const veces = new Map<string, number>()
  if (ids.length === 0) return veces
  const { data } = await supabaseAdmin()
    .from("brand_imagenes_usos")
    .select("imagen_id")
    .eq("account_id", accountId)
    .eq("vigente", true)
    .in("imagen_id", ids)
  for (const u of (data ?? []) as { imagen_id: string }[]) veces.set(u.imagen_id, (veces.get(u.imagen_id) ?? 0) + 1)
  return veces
}

export type Candidata = Imagen & { puntos: number }

async function candidatas(accountId: string, palabras: string[], evitar: Set<string>): Promise<Candidata[]> {
  const supabase = supabaseAdmin()
  const base = () =>
    supabase
      .from("brand_imagenes")
      .select("*")
      .eq("account_id", accountId)
      .eq("activa", true)
      .eq("etiquetado", "hecho")

  const encontradas: Imagen[] = []
  if (palabras.length) {
    const { data, error } = await base()
      .textSearch("busqueda", palabras.join(" or "), { type: "websearch", config: "simple" })
      .limit(150)
    if (faltaTabla(error)) return []
    encontradas.push(...((data ?? []) as Record<string, unknown>[]).map(parseImagen))
  }
  // Con pocas coincidencias se completa con las mejores de la biblioteca: el
  // agente que elige puede ver que una foto sin la palabra exacta sirve igual.
  if (encontradas.length < CANDIDATAS_PARA_ELEGIR * 2) {
    const { data, error } = await base().order("calidad", { ascending: false, nullsFirst: false }).limit(80)
    if (faltaTabla(error)) return []
    const vistas = new Set(encontradas.map((i) => i.id))
    for (const i of ((data ?? []) as Record<string, unknown>[]).map(parseImagen)) if (!vistas.has(i.id)) encontradas.push(i)
  }

  const libres = encontradas.filter((i) => !evitar.has(i.id))
  const veces = await vecesUsada(accountId, libres.map((i) => i.id))
  return libres
    .map((i) => {
      const suyo = new Set(palabrasDe(textoDeBusqueda(i)))
      const coincide = palabras.filter((p) => suyo.has(p)).length
      // La lamina es vertical: una apaisada recortada pierde los lados.
      const forma = i.orientacion === "apaisada" ? -1.5 : 0 // ya es la del recorte, si lo hay
      const puntos = coincide * 2 + (i.calidad ?? 3) + forma - Math.min(3, (veces.get(i.id) ?? 0) * 0.5)
      return { ...i, puntos }
    })
    .sort((a, b) => b.puntos - a.puntos)
}

const SISTEMA_ELEGIR = `Eres el editor de fotografia de la marca. Eliges la foto de fondo de cada lamina de un carrusel entre las candidatas de la biblioteca de la marca.

- La foto tiene que ir con lo que dice esa lamina, o al menos con el tema de la pieza, sin contradecirlo ni distraer.
- La portada pide la foto con mas fuerza y espacio para un titular grande. El cierre lleva una tarjeta de vidrio encima: pide una foto tranquila.
- Una persona reconocible no va de fondo si el texto habla de otra persona: parece que fuera ella.
- Cada candidata se usa como mucho una vez.
- Si ninguna candidata sirve para una lamina, deja esa lamina con "imagen": null. Mejor sin foto de la marca que con una que no pega: se buscara otra fuera.

RESPONDE SOLO con este JSON, sin texto alrededor:
{"asignaciones":[{"lamina":<numero de lamina>,"imagen":<numero de candidata o null>,"motivo":"<una frase: por que esta foto va con esta lamina>"}]}`

/**
 * Elige de la biblioteca la foto de cada hueco del carrusel.
 *
 * El codigo filtra (activas, etiquetadas, sin usar en los ultimos dias de la
 * marca, sin repetir en la pieza) y ordena; Claude mira las mejores y decide.
 * Lo que no encuentre sitio en la biblioteca vuelve vacio y el carrusel lo
 * busca en Pexels. Nunca lanza: un fallo aqui deja el carrusel como antes.
 */
export async function elegirDeBiblioteca(opciones: {
  accountId: string
  huecos: HuecoDeFoto[]
  /** Las busquedas de foto del escritor y el tema de la pieza. */
  terminos: string[]
  /** Imagenes que esta pieza no debe repetir (las que tenia antes de redibujarla). */
  evitar?: string[]
}): Promise<Map<number, FotoElegida>> {
  const elegidas = new Map<number, FotoElegida>()
  const { accountId, huecos } = opciones
  if (huecos.length === 0) return elegidas
  try {
    const dias = await diasSinRepetir(accountId)
    const evitar = new Set([...(await usadasHace(accountId, dias)), ...(opciones.evitar ?? [])])
    const palabras = palabrasDe([...opciones.terminos, ...huecos.map((h) => h.texto)].join(" "))
    const pool = (await candidatas(accountId, palabras, evitar)).slice(0, CANDIDATAS_PARA_ELEGIR)
    if (pool.length === 0) return elegidas
    if (huecos.some((h) => h.tono && h.tono !== "cualquiera")) await completarLuminosidad(pool)

    const urls = await urlsFirmadas(pool.map(miniDe), 15 * 60)
    const vistas = pool.filter((c) => urls.has(miniDe(c)))
    if (vistas.length === 0) return elegidas

    const asignadas = await asignarConClaude(accountId, huecos, vistas, urls, opciones.terminos)
      ?? asignarPorPuntos(huecos, vistas)

    for (const [indice, a] of asignadas) {
      const foto = await cargarFoto(a.imagen.ruta, a.imagen.recorte)
      if (foto) elegidas.set(indice, { foto, imagenId: a.imagen.id, motivo: a.motivo })
    }
  } catch (error) {
    console.warn("[biblioteca] no se pudo elegir de la biblioteca:", error instanceof Error ? error.message : error)
  }
  return elegidas
}

export type Asignacion = { imagen: Candidata; motivo: string }

export async function asignarConClaude(
  accountId: string,
  huecos: HuecoDeFoto[],
  pool: Candidata[],
  urls: Map<string, string>,
  terminos: string[]
): Promise<Map<number, Asignacion> | null> {
  // Lo que pide la plantilla del kit va con la lamina: el diseño se rompe con
  // una foto clara debajo de un texto blanco.
  const pide = (h: HuecoDeFoto) =>
    [
      h.tono && h.tono !== "cualquiera" ? `pide foto ${h.tono}` : "",
      h.espacio && h.espacio !== "cualquiera" ? `el texto va ${h.espacio === "centro" ? "al centro" : h.espacio}` : "",
    ]
      .filter(Boolean)
      .join(", ")
  const laminas = huecos
    .map((h) => {
      const p = pide(h)
      return `- Lamina ${h.indice + 1} (${h.uso}${p ? `; ${p}` : ""}): ${h.texto.replace(/\s+/g, " ").slice(0, 300)}`
    })
    .join("\n")
  const fichas = pool
    .map((c, i) => {
      const tono = tonoDe(c.luminosidad)
      return `- Candidata ${i + 1}: ${c.descripcion || "(sin descripcion)"} | sirve para: ${c.usos_sugeridos.join(", ") || "sin indicar"} | espacio para texto: ${c.espacio_texto ?? "?"} | ${c.orientacion}${c.personas ? " | con personas" : ""}${tono ? ` | ${tono} (luminosidad ${c.luminosidad}/100)` : ""}`
    })
    .join("\n")
  const r = await llamarClaude({
    accountId,
    model: MODELO_IMAGENES,
    system: SISTEMA_ELEGIR,
    prompt: `Las imagenes van en orden: la primera es la candidata 1, la segunda la 2, y asi.\n\nTEMA DE LA PIEZA: ${terminos.join(", ")}\n\nLAMINAS QUE NECESITAN FOTO:\n${laminas}\n\nCANDIDATAS:\n${fichas}`,
    imagenes: pool.map((c) => urls.get(miniDe(c))!),
    maxTokens: 1500,
  })
  if (!r.ok) return null
  try {
    const bruto = parsearJSONDeClaude(r.texto) as { asignaciones?: { lamina?: unknown; imagen?: unknown; motivo?: unknown }[] }
    const salida = new Map<number, Asignacion>()
    const usadas = new Set<number>()
    for (const a of bruto.asignaciones ?? []) {
      const indice = Number(a.lamina) - 1
      const n = Number(a.imagen) - 1
      if (!huecos.some((h) => h.indice === indice) || salida.has(indice)) continue
      if (a.imagen === null || !Number.isInteger(n) || n < 0 || n >= pool.length || usadas.has(n)) continue
      // El tono no se negocia: una foto clara bajo un texto blanco no se lee.
      if (!vaConTono(huecos.find((h) => h.indice === indice)!, pool[n])) continue
      usadas.add(n)
      salida.set(indice, { imagen: pool[n], motivo: typeof a.motivo === "string" ? a.motivo.slice(0, 300) : "" })
    }
    return salida
  } catch {
    return null
  }
}

/** Si Claude no responde: la mejor puntuada que encaje con el uso de cada hueco. */
function asignarPorPuntos(huecos: HuecoDeFoto[], pool: Candidata[]): Map<number, Asignacion> {
  const salida = new Map<number, Asignacion>()
  const libres = [...pool]
  for (const h of huecos) {
    const i = libres.findIndex(
      (c) => (c.usos_sugeridos.length === 0 || c.usos_sugeridos.includes(h.uso)) && vaConTono(h, c)
    )
    if (i < 0) continue
    const [c] = libres.splice(i, 1)
    salida.set(h.indice, { imagen: c, motivo: "Elegida por coincidencia de etiquetas." })
  }
  return salida
}

/** Baja la imagen del bucket y la deja en JPEG como data URI: Satori no dibuja WebP. */
export async function cargarFoto(ruta: string, recorte: Recorte | null = null): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin().storage.from(BUCKET_IMAGENES).download(ruta)
    if (error || !data) return null
    const sharp = (await import("sharp")).default
    const original = Buffer.from(await data.arrayBuffer())
    const jpg = await (recorte ? await recortada(original, recorte) : sharp(original))
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpg.toString("base64")}`
  } catch {
    return null
  }
}

// --------------------------------------------------------------------- usos

/**
 * Anota que fotos de la biblioteca lleva una pieza.
 *
 * Los usos anteriores de la misma pieza (de antes de redibujarla) no se borran:
 * quedan con vigente = false y dejan de contar. Nunca lanza: perder el registro
 * de un uso no merece tumbar una pieza ya generada.
 */
export async function registrarUsos(accountId: string, pieceId: string, red: string, fotos: FotoDeBiblioteca[] | undefined): Promise<void> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase
      .from("brand_imagenes_usos")
      .update({ vigente: false })
      .eq("account_id", accountId)
      .eq("piece_id", pieceId)
      .eq("vigente", true)
    if (faltaTabla(error)) return
    if (!fotos?.length) return
    await supabase.from("brand_imagenes_usos").insert(
      fotos.map((f) => ({
        account_id: accountId,
        imagen_id: f.imagenId,
        piece_id: pieceId,
        red,
        lamina: f.lamina,
        motivo: f.motivo.slice(0, 300),
      }))
    )
  } catch (error) {
    console.warn("[biblioteca] no se pudieron anotar los usos:", error instanceof Error ? error.message : error)
  }
}

/** Las imagenes de la biblioteca que lleva ahora una pieza: al redibujarla, no se repiten. */
export async function imagenesDePieza(accountId: string, pieceId: string): Promise<string[]> {
  const { data } = await supabaseAdmin()
    .from("brand_imagenes_usos")
    .select("imagen_id")
    .eq("account_id", accountId)
    .eq("piece_id", pieceId)
    .eq("vigente", true)
  return ((data ?? []) as { imagen_id: string }[]).map((d) => d.imagen_id)
}


// ------------------------------------------------------- recorte y limpieza

/** La imagen recortada, lista para seguir encadenando operaciones de sharp. */
async function recortada(original: Buffer, recorte: Recorte) {
  const sharp = (await import("sharp")).default
  const { width = 0, height = 0 } = await sharp(original).metadata()
  const left = Math.min(width - 1, Math.round(recorte.x * width))
  const top = Math.min(height - 1, Math.round(recorte.y * height))
  return sharp(original).extract({
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.round(recorte.w * width))),
    height: Math.max(1, Math.min(height - top, Math.round(recorte.h * height))),
  })
}

/**
 * Guarda el recorte de una imagen, o lo quita con `null`.
 *
 * No toca la imagen completa: guarda la zona y dibuja una miniatura nueva de
 * esa zona, que es la que ven la galeria y quien elige. Cada recorte lleva su
 * propia miniatura con nombre nuevo, para que ningun navegador ni CDN siga
 * ensenando la anterior.
 */
export async function recortarImagen(accountId: string, id: string, bruto: Recorte | null): Promise<void> {
  const imagen = await imagenDe(accountId, id)
  if (!imagen) throw new Error("No se encontró la imagen.")
  const recorte = bruto ? parseRecorte(bruto) : null
  if (bruto && !recorte) throw new Error("Ese recorte es demasiado pequeño.")
  const supabase = supabaseAdmin()
  const storage = supabase.storage.from(BUCKET_IMAGENES)

  let rutaMini: string | null = null
  let orientacion = orientacionDe(imagen.ancho, imagen.alto)
  if (recorte) {
    const { data, error } = await storage.download(imagen.ruta)
    if (error || !data) throw new Error("No se pudo leer la imagen.")
    const mini = await (await recortada(Buffer.from(await data.arrayBuffer()), recorte))
      .resize({ width: LADO_MINI, height: LADO_MINI, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    rutaMini = `${accountId}/${id}-mini-recorte-${Date.now().toString(36)}.webp`
    const subida = await storage.upload(rutaMini, mini, { contentType: "image/webp", upsert: false })
    if (subida.error) throw new Error(subida.error.message)
    orientacion = orientacionDe(imagen.ancho * recorte.w, imagen.alto * recorte.h)
  }

  const { error } = await supabase
    .from("brand_imagenes")
    // La luminosidad era la de la zona anterior: se vuelve a calcular al elegir.
    .update({ recorte, ruta_mini_recorte: rutaMini, orientacion, luminosidad: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", accountId)
  if (error) throw new Error(error.message)
  // La miniatura del recorte anterior ya no la usa nadie.
  if (imagen.ruta_mini_recorte) await storage.remove([imagen.ruta_mini_recorte])
}

/** Descarta (apaga) o vuelve a activar varias a la vez. Apagada, ningun carrusel la elige. */
export async function activarImagenes(accountId: string, ids: string[], activa: boolean): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabaseAdmin()
    .from("brand_imagenes")
    .update({ activa, updated_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .in("id", ids)
  if (error) throw new Error(error.message)
}

/**
 * Elimina imagenes para siempre: la ficha, su historial y sus archivos.
 *
 * Solo desde la pantalla, con confirmacion de la persona. Las piezas que ya la
 * usaron no cambian: sus laminas estan dibujadas y guardadas en otro bucket.
 * Primero la ficha y despues los archivos: si falla el storage quedan archivos
 * sueltos que no se ven, nunca una ficha que apunta a nada.
 */
export async function eliminarImagenes(accountId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  if (ids.length > 200) throw new Error("Se eliminan de 200 en 200.")
  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from("brand_imagenes")
    .delete()
    .eq("account_id", accountId)
    .in("id", ids)
    .select("ruta, ruta_mini, ruta_mini_recorte")
  if (error) throw new Error(error.message)
  const filas = (data ?? []) as { ruta: string; ruta_mini: string; ruta_mini_recorte: string | null }[]
  const rutas = filas.flatMap((f) => [f.ruta, f.ruta_mini, f.ruta_mini_recorte]).filter((r): r is string => Boolean(r))
  if (rutas.length) await supabase.storage.from(BUCKET_IMAGENES).remove(rutas)
  return filas.length
}
