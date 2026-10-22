import { supabaseAdmin } from "../supabase-admin"
import { faltaTabla } from "./imagenes"
import {
  BUCKET_KITS,
  CSS_SIN_PAGINACION,
  cssDeFuentes,
  FORMATOS,
  paginaDeLamina,
  parseArchivo,
  parseFoto,
  parseHuecos,
  parseKit,
  parsePlantilla,
  parseSistema,
  rellenarPlantilla,
  revisarCss,
  revisarPlantilla,
  type ArchivoKit,
  type DatosLamina,
  type EstadoPlantilla,
  type Fondo,
  type Kit,
  type Plantilla,
  type TipoArchivo,
} from "./kit-modelo"

export * from "./kit-modelo"

/**
 * Los kits de diseño de cada marca.
 *
 * El kit es el sistema visual de la marca y sus plantillas, como datos: las
 * tablas brand_kits, brand_kit_archivos y brand_kit_plantillas, y los archivos
 * (fuentes, logos, referencias) en el bucket privado marca-kits. Lo llena el
 * importador; los carruseles de la marca se dibujan con su kit activo.
 *
 * Todo lo que lee tolera que la migracion no este aplicada: sin las tablas no
 * hay kit y el carrusel sigue con la plantilla de antes.
 */

export async function kitsDisponibles(): Promise<boolean> {
  const { error } = await supabaseAdmin().from("brand_kits").select("id", { head: true, count: "exact" }).limit(1)
  return !faltaTabla(error)
}

/** Un kit con sus archivos y sus plantillas. */
export type KitCargado = { kit: Kit; archivos: ArchivoKit[]; plantillas: Plantilla[] }

/**
 * Un kit de la cuenta, entero. Con `soloAprobadas`, solo las plantillas que la
 * persona aprobo (lo que usan los carruseles).
 */
export async function cargarKit(
  accountId: string,
  kitId: string,
  { soloAprobadas = false } = {}
): Promise<KitCargado | null> {
  const supabase = supabaseAdmin()
  const { data: fila, error } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", kitId)
    .maybeSingle()
  if (error) {
    if (faltaTabla(error)) return null
    throw new Error(error.message)
  }
  if (!fila) return null
  let consulta = supabase.from("brand_kit_plantillas").select("*").eq("kit_id", kitId)
  if (soloAprobadas) consulta = consulta.eq("estado", "aprobada")
  const [archivos, plantillas] = await Promise.all([
    supabase.from("brand_kit_archivos").select("*").eq("kit_id", kitId),
    consulta.order("tipo").order("orden"),
  ])
  if (archivos.error) throw new Error(archivos.error.message)
  if (plantillas.error) throw new Error(plantillas.error.message)
  return {
    kit: parseKit(fila as Record<string, unknown>),
    archivos: (archivos.data ?? []).map((a) => parseArchivo(a as Record<string, unknown>)),
    plantillas: (plantillas.data ?? []).map((p) => parsePlantilla(p as Record<string, unknown>)),
  }
}

/** El kit activo de la cuenta, con sus plantillas aprobadas, o null si no tiene. */
export async function kitActivo(accountId: string): Promise<KitCargado | null> {
  const { data, error } = await supabaseAdmin()
    .from("brand_kits")
    .select("id")
    .eq("account_id", accountId)
    .eq("estado", "activo")
    .maybeSingle()
  if (error || !data) return null
  return cargarKit(accountId, String(data.id), { soloAprobadas: true })
}

// ------------------------------------------------------------ dibujo

/** Los archivos del kit como data URI, por papel. Uno por instancia y version del kit. */
const enMemoria = new Map<string, Promise<Record<string, string>>>()

export function archivosComoDatos(kc: KitCargado): Promise<Record<string, string>> {
  const clave = `${kc.kit.id}:${kc.kit.updated_at}:${kc.archivos.length}`
  let datos = enMemoria.get(clave)
  if (!datos) {
    datos = (async () => {
      const salida: Record<string, string> = {}
      // Las referencias son para comparar, no se dibujan.
      const usables = kc.archivos.filter((a) => a.tipo !== "referencia")
      await Promise.all(
        usables.map(async (a) => {
          const { data, error } = await supabaseAdmin().storage.from(BUCKET_KITS).download(a.ruta)
          if (error || !data) throw new Error(`No se pudo leer ${a.papel} del kit: ${error?.message ?? "vacio"}`)
          salida[a.papel] = `data:${a.mime};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`
        })
      )
      return salida
    })()
    datos.catch(() => enMemoria.delete(clave))
    enMemoria.set(clave, datos)
  }
  return datos
}

/** La pagina HTML de una lamina, lista para render/navegador.ts. */
export async function armarLamina(
  kc: KitCargado,
  plantilla: Plantilla,
  datos: DatosLamina,
  { sinPaginacion = false } = {}
): Promise<string> {
  const archivos = await archivosComoDatos(kc)
  const cuerpo = rellenarPlantilla(plantilla.html, datos, archivos, kc.kit.parciales)
  return paginaDeLamina(
    kc.kit.css,
    cssDeFuentes(kc.archivos, archivos),
    cuerpo,
    plantilla.formato,
    sinPaginacion ? CSS_SIN_PAGINACION : ""
  )
}

export const medidasDe = (plantilla: Plantilla) => FORMATOS[plantilla.formato]

// --------------------------------------------------------------- escritura
// La usan el importador y la pantalla de revision. Nada de esto borra un kit:
// una version nueva deja la anterior como estaba.

export type KitNuevo = {
  nombre: string
  origen: string
  sistema: unknown
  css: string
  parciales: Record<string, string>
}

/** Crea un kit en borrador, como la version siguiente de la cuenta. */
export async function crearKit(accountId: string, nuevo: KitNuevo): Promise<Kit> {
  const errores = [revisarCss(nuevo.css), ...Object.values(nuevo.parciales).map(revisarCss)].flat()
  if (errores.length) throw new Error(errores.join(" "))
  const supabase = supabaseAdmin()
  const { data: ultima } = await supabase
    .from("brand_kits")
    .select("version")
    .eq("account_id", accountId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await supabase
    .from("brand_kits")
    .insert({
      account_id: accountId,
      version: (Number(ultima?.version) || 0) + 1,
      estado: "borrador",
      nombre: nuevo.nombre.slice(0, 120),
      origen: nuevo.origen.slice(0, 2000),
      sistema: parseSistema(nuevo.sistema),
      css: nuevo.css,
      parciales: nuevo.parciales,
    })
    .select("*")
    .single()
  if (error) throw new Error(faltaTabla(error) ? "Falta aplicar la migración de los kits." : error.message)
  return parseKit(data as Record<string, unknown>)
}

export type ArchivoNuevo = {
  papel: string
  tipo: TipoArchivo
  contenido: Buffer
  mime: string
  nombre_original?: string
  meta?: Record<string, unknown>
  descripcion?: string
}

const EXTENSION: Record<string, string> = {
  "font/ttf": "ttf",
  "font/otf": "otf",
  "font/woff": "woff",
  "font/woff2": "woff2",
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

/** Sube un archivo al kit (o lo reemplaza si ya habia uno con ese papel). */
export async function subirArchivoKit(accountId: string, kitId: string, a: ArchivoNuevo): Promise<ArchivoKit> {
  if (!/^[a-z0-9_]{2,60}$/.test(a.papel)) throw new Error(`Papel de archivo no valido: ${a.papel}`)
  const ext = EXTENSION[a.mime]
  if (!ext) throw new Error(`Tipo de archivo no permitido: ${a.mime}`)
  if (a.mime === "image/svg+xml" && /<\s*script|\son[a-z]+\s*=|javascript:/i.test(a.contenido.toString("utf8")))
    throw new Error(`El SVG ${a.papel} trae codigo: no se sube.`)
  const ruta = `${accountId}/${kitId}/${a.papel}.${ext}`
  const supabase = supabaseAdmin()
  const subida = await supabase.storage
    .from(BUCKET_KITS)
    .upload(ruta, a.contenido, { contentType: a.mime, upsert: true })
  if (subida.error) throw new Error(subida.error.message)
  const { data, error } = await supabase
    .from("brand_kit_archivos")
    .upsert(
      {
        account_id: accountId,
        kit_id: kitId,
        papel: a.papel,
        tipo: a.tipo,
        ruta,
        mime: a.mime,
        bytes: a.contenido.length,
        nombre_original: (a.nombre_original ?? "").slice(0, 255),
        meta: a.meta ?? {},
        descripcion: (a.descripcion ?? "").slice(0, 300),
      },
      { onConflict: "kit_id,papel" }
    )
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  await supabase.from("brand_kits").update({ updated_at: new Date().toISOString() }).eq("id", kitId)
  return parseArchivo(data as Record<string, unknown>)
}

export type PlantillaNueva = {
  tipo: string
  nombre: string
  cuando_usar: string
  html: string
  huecos: unknown
  foto: unknown
  fondo: Fondo
  cta_tipos?: string[]
  referencia_archivo_id?: string | null
  orden?: number
  prueba?: Record<string, unknown>
}

/** Guarda una plantilla en el kit, despues de revisar que sea segura y coherente. */
export async function guardarPlantilla(accountId: string, kitId: string, p: PlantillaNueva): Promise<Plantilla> {
  const kc = await cargarKit(accountId, kitId)
  if (!kc) throw new Error("No se encontró el kit.")
  const huecos = parseHuecos(p.huecos)
  const errores = revisarPlantilla(p.html, huecos, {
    papeles: kc.archivos.map((a) => a.papel),
    parciales: Object.keys(kc.kit.parciales),
  })
  if (errores.length) throw new Error(errores.join(" "))
  const { data, error } = await supabaseAdmin()
    .from("brand_kit_plantillas")
    .insert({
      account_id: accountId,
      kit_id: kitId,
      tipo: p.tipo,
      nombre: p.nombre.slice(0, 120),
      cuando_usar: p.cuando_usar.slice(0, 400),
      html: p.html,
      huecos,
      foto: parseFoto(p.foto),
      fondo: p.fondo,
      cta_tipos: p.cta_tipos ?? [],
      referencia_archivo_id: p.referencia_archivo_id ?? null,
      orden: p.orden ?? 0,
      prueba: p.prueba ?? {},
    })
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return parsePlantilla(data as Record<string, unknown>)
}

/** Cambia el HTML, los huecos o la prueba de una plantilla, revisando que siga siendo segura. */
export async function actualizarPlantilla(
  accountId: string,
  plantillaId: string,
  cambios: {
    html?: string
    huecos?: unknown
    foto?: unknown
    prueba?: Record<string, unknown>
    estado?: EstadoPlantilla
  }
): Promise<Plantilla> {
  const supabase = supabaseAdmin()
  const { data: fila, error: errorFila } = await supabase
    .from("brand_kit_plantillas")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", plantillaId)
    .single()
  if (errorFila || !fila) throw new Error("No se encontró la plantilla.")
  const actual = parsePlantilla(fila as Record<string, unknown>)
  const html = cambios.html ?? actual.html
  const huecos = cambios.huecos !== undefined ? parseHuecos(cambios.huecos) : actual.huecos
  if (cambios.html !== undefined || cambios.huecos !== undefined) {
    const kc = await cargarKit(accountId, actual.kit_id)
    if (!kc) throw new Error("No se encontró el kit.")
    const errores = revisarPlantilla(html, huecos, {
      papeles: kc.archivos.map((a) => a.papel),
      parciales: Object.keys(kc.kit.parciales),
    })
    if (errores.length) throw new Error(errores.join(" "))
  }
  const { data, error } = await supabase
    .from("brand_kit_plantillas")
    .update({
      html,
      huecos,
      ...(cambios.foto !== undefined ? { foto: parseFoto(cambios.foto) } : {}),
      ...(cambios.prueba ? { prueba: cambios.prueba } : {}),
      ...(cambios.estado ? { estado: cambios.estado } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", plantillaId)
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return parsePlantilla(data as Record<string, unknown>)
}

/** Cambia el sistema, el CSS comun o los trozos comunes de un kit, revisando el CSS. */
export async function actualizarKit(
  accountId: string,
  kitId: string,
  cambios: {
    sistema?: unknown
    css?: string
    parciales?: Record<string, string>
    estado?: Kit["estado"]
    nombre?: string
  }
): Promise<void> {
  const errores = [
    ...(cambios.css !== undefined ? revisarCss(cambios.css) : []),
    ...Object.values(cambios.parciales ?? {}).flatMap(revisarCss),
  ]
  if (errores.length) throw new Error(errores.join(" "))
  const { error } = await supabaseAdmin()
    .from("brand_kits")
    .update({
      ...(cambios.sistema !== undefined ? { sistema: parseSistema(cambios.sistema) } : {}),
      ...(cambios.css !== undefined ? { css: cambios.css } : {}),
      ...(cambios.parciales ? { parciales: cambios.parciales } : {}),
      ...(cambios.estado ? { estado: cambios.estado } : {}),
      ...(cambios.nombre ? { nombre: cambios.nombre.slice(0, 120) } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", accountId)
    .eq("id", kitId)
  if (error) throw new Error(error.message)
}

/** Cambia el estado de una plantilla (aprobar o pedir que se rehaga) y guarda su prueba. */
export async function revisarPlantillaDelKit(
  accountId: string,
  plantillaId: string,
  cambios: { estado?: EstadoPlantilla; notas?: string; prueba?: Record<string, unknown> }
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("brand_kit_plantillas")
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("id", plantillaId)
  if (error) throw new Error(error.message)
}

/**
 * Activa un kit: el anterior activo pasa a archivado. Hace falta al menos una
 * portada y un cierre aprobados, o el carrusel no tendria con que empezar y
 * terminar.
 */
export async function activarKit(accountId: string, kitId: string): Promise<void> {
  const kc = await cargarKit(accountId, kitId, { soloAprobadas: true })
  if (!kc) throw new Error("No se encontró el kit.")
  const tipos = new Set(kc.plantillas.map((p) => p.tipo))
  if (!tipos.has("portada") || !tipos.has("cierre"))
    throw new Error("Para activarlo hace falta al menos una portada y un cierre aprobados.")
  const supabase = supabaseAdmin()
  const ahora = new Date().toISOString()
  const archivar = await supabase
    .from("brand_kits")
    .update({ estado: "archivado", updated_at: ahora })
    .eq("account_id", accountId)
    .eq("estado", "activo")
    .neq("id", kitId)
  if (archivar.error) throw new Error(archivar.error.message)
  const { error } = await supabase
    .from("brand_kits")
    .update({ estado: "activo", activado_at: ahora, updated_at: ahora })
    .eq("account_id", accountId)
    .eq("id", kitId)
  if (error) throw new Error(error.message)
}
