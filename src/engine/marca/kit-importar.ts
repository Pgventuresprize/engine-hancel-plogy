import { randomUUID } from "node:crypto"

import { llamarClaude, parsearJSONDeClaude, type Bloque, type LlamadaClaude } from "../claude/messages"
import { capturar, dibujarLaminas, laminasDePagina } from "../render/navegador"
import { supabaseAdmin } from "../supabase-admin"
import {
  armarLamina,
  archivosComoDatos,
  actualizarKit,
  actualizarPlantilla,
  cargarKit,
  crearKit,
  guardarPlantilla,
  subirArchivoKit,
  type KitCargado,
} from "./kit"
import {
  DESCRIPCION_FIGURA,
  figuraAHtml,
  figuraDeMuestra,
  figurasDelKit,
  FORMA_FIGURA,
  LIMITES_FIGURA,
  parseFigura,
  PREFIJO_FIGURA,
  TIPOS_FIGURA,
  type Figura,
  type TipoFigura,
} from "./figuras"
import { cssDeFuentesCargadas, fuentesDePagina, pedidosAGoogle, type Fuente } from "./kit-fuentes"
import { guardarPiezaDeEjemplo, hojaDePieza } from "./kit-piezas"
import {
  carpetaDe,
  extension,
  MAX_ARCHIVOS_IMPORTAR,
  MAX_BYTES_IMPORTAR,
  normalizarRuta,
  parseImportacion,
  type ArchivoImportado,
  type Importacion,
  type Referencia,
  type TareaFigura,
  type TareaPlantilla,
} from "./kit-importar-modelo"
import {
  BUCKET_KITS,
  cssDeFuentes,
  FORMATOS,
  HUECOS_COMUNES,
  paginaDeLamina,
  parseHuecos,
  revisarCss,
  revisarPlantilla,
  TIPOS_COMUNES,
  type DatosLamina,
  type Hueco,
  type Plantilla,
} from "./kit-modelo"

export * from "./kit-importar-modelo"

/**
 * El importador de kits.
 *
 * La persona sube su kit (ver components/marca/kit.tsx) y la pantalla va
 * llamando a `avanzarImportacion`, que hace un paso cada vez (o una tanda de
 * un paso largo) y guarda donde quedo en brand_kits.importacion. Asi ninguna
 * llamada pasa del limite de la funcion y, si se cierra la pantalla, se retoma.
 *
 *   leer         lo exacto, sin IA: colores del CSS.
 *   referencias  cada pieza HTML se dibuja y se separan sus laminas, con su
 *                HTML, su foto y sus fuentes; las imagenes de lamina sueltas
 *                tambien cuentan.
 *   catalogo     Claude ve todas las laminas y los documentos y dice que tipos
 *                de lamina tiene el kit, el sistema visual y que logo va en cada fondo.
 *   base         Claude escribe el CSS comun y el marco.
 *   figuras      por cada figura que usa el kit (barras, tabla, niveles...):
 *                su CSS, comparado con la figura del kit y probado al limite.
 *   plantillas   por cada tipo: escribir, comparar con su original (y corregir,
 *                hasta 3 rondas) y probar con textos al limite.
 *   cerrar       guarda lo que hace falta y borra la copia subida.
 *
 * Nada de esto conoce a ninguna marca: todo sale de lo que se subio.
 */

/** Quien estudia el kit y escribe las plantillas: lo visual pesa en la pieza. */
export const MODELO_IMPORTAR = "claude-opus-5-5"

/** Cuanto puede durar un paso antes de guardar y devolver el control. */
const PRESUPUESTO_MS = 200_000
/** Cuantas plantillas se trabajan a la vez en una llamada. */
const PLANTILLAS_A_LA_VEZ = 3
/** Rondas de correccion despues de comparar con el original. */
const MAX_RONDAS = 3
/** Intentos de escribir una plantilla que pase la revision. */
const MAX_INTENTOS_ESCRIBIR = 3
/** A partir de este parecido (0 a 10) la plantilla se da por buena. */
const PARECIDO_BUENO = 8
const MAX_REFERENCIAS = 300
const MAX_TIPOS = 18
/** Cuantas figuras se escriben a la vez en una llamada, y rondas para corregir cada una. */
const FIGURAS_A_LA_VEZ = 3
const MAX_RONDAS_FIGURA = 2
/** Cuantas piezas enteras del kit se guardan como ejemplo para el diseñador libre. */
const MAX_PIEZAS = 24
const SEGUNDOS_URL = 60 * 60

const FORMATOS_LAMINA = [
  { ancho: 1080, alto: 1350 },
  { ancho: 1080, alto: 1080 },
  { ancho: 1080, alto: 1920 },
  { ancho: 1200, alto: 628 },
  { ancho: 1200, alto: 627 },
]
const { ancho: ANCHO, alto: ALTO } = FORMATOS.carrusel_4x5

const carpetaTemporal = (accountId: string, kitId: string) => `${accountId}/${kitId}/importacion`

// ----------------------------------------------------------------- estado

/**
 * Reintenta lo que falla por la red (un corte, la base saturada): hasta 4
 * veces, esperando un poco mas cada vez. Una importacion hace cientos de
 * lecturas y escrituras y alguna siempre tropieza.
 */
async function conReintentos<T>(fn: () => Promise<T>): Promise<T> {
  let ultimo: unknown
  for (let intento = 0; intento < 4; intento++) {
    try {
      return await fn()
    } catch (error) {
      ultimo = error
      await new Promise((ok) => setTimeout(ok, 1500 * (intento + 1)))
    }
  }
  throw ultimo
}

async function leerImportacion(accountId: string, kitId: string): Promise<Importacion> {
  const { data, error } = await conReintentos(async () => {
    const r = await supabaseAdmin()
      .from("brand_kits")
      .select("importacion, estado")
      .eq("account_id", accountId)
      .eq("id", kitId)
      .maybeSingle()
    if (r.error && /fetch|network|connect|timeout/i.test(r.error.message)) throw new Error(r.error.message)
    return r
  })
  if (error) throw new Error(error.message)
  const imp = parseImportacion(data?.importacion)
  if (!data || !imp) throw new Error("No se encontró la importación.")
  return imp
}

async function guardarImportacion(kitId: string, imp: Importacion): Promise<void> {
  imp.log = imp.log.slice(-120)
  await conReintentos(async () => {
    const { error } = await supabaseAdmin()
      .from("brand_kits")
      .update({ importacion: imp, updated_at: new Date().toISOString() })
      .eq("id", kitId)
    if (error) throw new Error(error.message)
  })
}

/**
 * Toma el turno de la importacion: guarda `imp` con su ocupado_hasta solo si
 * nadie lo tiene tomado. La condicion va en el mismo update, asi que de dos
 * llamadas que leyeron a la vez la importacion libre, solo una lo consigue. Sin
 * esto, las dos avanzaban el mismo paso y una pisaba lo que guardo la otra (salian
 * plantillas repetidas).
 */
async function tomarTurno(kitId: string, imp: Importacion): Promise<boolean> {
  const ahora = new Date().toISOString()
  return conReintentos(async () => {
    const { data, error } = await supabaseAdmin()
      .from("brand_kits")
      .update({ importacion: imp, updated_at: ahora })
      .eq("id", kitId)
      .or(`importacion->>ocupado_hasta.is.null,importacion->>ocupado_hasta.lt.${ahora}`)
      .select("id")
    if (error) throw new Error(error.message)
    return (data ?? []).length > 0
  })
}

/** subirArchivoKit con reintentos por la red. */
const subirAlKit: typeof subirArchivoKit = (...args) => conReintentos(() => subirArchivoKit(...args))

const anotar = (imp: Importacion, texto: string) => imp.log.push({ cuando: new Date().toISOString(), texto })

function bajar(ruta: string): Promise<Buffer> {
  return conReintentos(async () => {
    const { data, error } = await supabaseAdmin().storage.from(BUCKET_KITS).download(ruta)
    if (error || !data) throw new Error(`No se pudo leer ${ruta}: ${error?.message ?? "vacío"}`)
    return Buffer.from(await data.arrayBuffer())
  })
}

function subir(ruta: string, contenido: Buffer, mime: string): Promise<void> {
  return conReintentos(async () => {
    const { error } = await supabaseAdmin()
      .storage.from(BUCKET_KITS)
      .upload(ruta, contenido, { contentType: mime, upsert: true })
    if (error) throw new Error(`No se pudo guardar ${ruta}: ${error.message}`)
  })
}

/** Llama a Claude y suma lo gastado a la importacion. Lanza si falla. */
async function claude(imp: Importacion, opciones: LlamadaClaude): Promise<string> {
  const r = await llamarClaude({ paso: "kit-importar", timeoutMs: 230_000, ...opciones })
  if (!r.ok) throw new Error(r.error)
  imp.tokens.entrada += r.uso.entrada
  imp.tokens.salida += r.uso.salida
  return r.texto
}

/** Como Promise.all, pero de `n` en `n`: el storage corta si se le piden cientos a la vez. */
async function enTandas<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const salida: R[] = []
  for (let i = 0; i < items.length; i += n)
    salida.push(...(await Promise.all(items.slice(i, i + n).map((it, k) => fn(it, i + k)))))
  return salida
}

const jpgDe = (b: Buffer): Bloque => ({ tipo: "imagen", mime: "image/jpeg", datos: b })
const comoDataUri = (b: Buffer, mime: string) => `data:${mime};base64,${b.toString("base64")}`

// ---------------------------------------------------------------- empezar

/** Crea el kit que se va a importar y deja la importacion esperando la subida. */
export async function empezarImportacion(accountId: string, nombre: string): Promise<string> {
  const kit = await crearKit(accountId, {
    nombre: nombre || "Kit importado",
    origen: "",
    sistema: {},
    css: "",
    parciales: {},
  })
  const imp: Importacion = {
    paso: "subir",
    archivos: [],
    referencias: [],
    tareas: [],
    sustituciones: [],
    avisos: [],
    log: [],
    tokens: { entrada: 0, salida: 0 },
    empezado: new Date().toISOString(),
  }
  anotar(imp, "Importación creada.")
  const { error } = await supabaseAdmin()
    .from("brand_kits")
    .update({ estado: "importando", importacion: imp })
    .eq("id", kit.id)
  if (error) throw new Error(error.message)
  return kit.id
}

export type SubidaKit = { ruta: string; storage: string; url: string }

/** Enlaces firmados para que el navegador suba la copia del kit directo al bucket. */
export async function prepararSubidaImportacion(
  accountId: string,
  kitId: string,
  lista: { ruta: string; mime: string; bytes: number }[]
): Promise<SubidaKit[]> {
  const imp = await leerImportacion(accountId, kitId)
  if (imp.paso !== "subir") throw new Error("Esta importación ya no está recibiendo archivos.")
  if (imp.archivos.length + lista.length > MAX_ARCHIVOS_IMPORTAR)
    throw new Error(`Un kit puede subir hasta ${MAX_ARCHIVOS_IMPORTAR} archivos.`)
  const total = imp.archivos.reduce((s, a) => s + a.bytes, 0) + lista.reduce((s, a) => s + a.bytes, 0)
  if (total > MAX_BYTES_IMPORTAR)
    throw new Error("El kit pasa de 80 MB después de comprimir. Quita carpetas que no sean del diseño.")
  const supabase = supabaseAdmin()
  // De a pocos: muchos enlaces a la vez agotan las conexiones de la base.
  const salida: SubidaKit[] = []
  for (let i = 0; i < lista.length; i += 4) {
    salida.push(
      ...(await Promise.all(
        lista.slice(i, i + 4).map(async (a) => {
          const ext = extension(a.ruta) || "bin"
          const storage = `${carpetaTemporal(accountId, kitId)}/${randomUUID()}.${ext === "jfif" ? "jpg" : ext}`
          const { data, error } = await supabase.storage.from(BUCKET_KITS).createSignedUploadUrl(storage)
          if (error || !data) throw new Error(error?.message ?? "No se pudo preparar la subida.")
          return { ruta: normalizarRuta(a.ruta), storage, url: data.signedUrl }
        })
      ))
    )
  }
  return salida
}

/** Anota lo ya subido. Con `terminado`, la importacion arranca. */
export async function registrarSubidaImportacion(
  accountId: string,
  kitId: string,
  archivos: ArchivoImportado[],
  terminado: boolean
): Promise<Importacion> {
  const imp = await leerImportacion(accountId, kitId)
  if (imp.paso !== "subir") throw new Error("Esta importación ya no está recibiendo archivos.")
  const prefijo = `${carpetaTemporal(accountId, kitId)}/`
  for (const a of archivos) {
    if (!a.storage.startsWith(prefijo)) throw new Error("Ruta de subida no válida.")
    const ruta = normalizarRuta(a.ruta)
    imp.archivos = imp.archivos.filter((x) => x.ruta !== ruta)
    imp.archivos.push({ ...a, ruta })
  }
  if (terminado) {
    if (!imp.archivos.some((a) => a.clase === "html" || a.clase === "lamina"))
      throw new Error("El kit no trae piezas en HTML ni láminas exportadas: no hay de dónde sacar las plantillas.")
    imp.paso = "leer"
    anotar(imp, `Subidos ${imp.archivos.length} archivos.`)
  }
  await guardarImportacion(kitId, imp)
  return imp
}

// ----------------------------------------------------------------- avanzar

/**
 * Hace el siguiente paso de la importacion y devuelve en que quedo. Si otra
 * pestana esta trabajando en ella, no hace nada.
 */
export async function avanzarImportacion(accountId: string, kitId: string): Promise<Importacion> {
  const imp = await leerImportacion(accountId, kitId)
  if (imp.paso === "listo" || imp.paso === "fallo" || imp.paso === "subir") return imp
  if (imp.ocupado_hasta && new Date(imp.ocupado_hasta).getTime() > Date.now()) return imp

  imp.ocupado_hasta = new Date(Date.now() + 295_000).toISOString()
  if (!(await tomarTurno(kitId, imp))) return leerImportacion(accountId, kitId)
  const inicio = Date.now()
  try {
    if (imp.paso === "leer") await pasoLeer(accountId, kitId, imp)
    else if (imp.paso === "referencias") await pasoReferencias(accountId, kitId, imp, inicio)
    else if (imp.paso === "catalogo") await pasoCatalogo(accountId, kitId, imp)
    else if (imp.paso === "base") await pasoBase(accountId, kitId, imp)
    else if (imp.paso === "figuras") await pasoFiguras(accountId, kitId, imp)
    else if (imp.paso === "plantillas") await pasoPlantillas(accountId, kitId, imp)
    else if (imp.paso === "cerrar") await pasoCerrar(accountId, kitId, imp)
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    anotar(imp, `Falló ${imp.paso}: ${mensaje}`)
    imp.paso = "fallo"
    imp.error = mensaje
  }
  imp.ocupado_hasta = undefined
  await guardarImportacion(kitId, imp)
  return imp
}

/** Vuelve a intentar desde el paso que fallo. */
export async function reintentarImportacion(
  accountId: string,
  kitId: string,
  paso: Importacion["paso"]
): Promise<void> {
  const imp = await leerImportacion(accountId, kitId)
  if (imp.paso !== "fallo") return
  imp.paso = paso
  imp.error = undefined
  anotar(imp, `Se reintenta desde ${paso}.`)
  await guardarImportacion(kitId, imp)
}

// -------------------------------------------------------------------- leer

async function pasoLeer(accountId: string, kitId: string, imp: Importacion): Promise<void> {
  const textos = imp.archivos.filter((a) => a.clase === "css" || a.clase === "html")
  const veces = new Map<string, number>()
  for (const a of textos) {
    const texto = (await bajar(a.storage)).toString("utf8")
    for (const m of texto.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([\d\s.,%]+\)/gi)) {
      const c = m[0].toLowerCase().replace(/\s+/g, "")
      veces.set(c, (veces.get(c) ?? 0) + 1)
    }
  }
  imp.colores = [...veces.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([valor, n]) => ({ valor, veces: n }))
  const porClase = new Map<string, number>()
  for (const a of imp.archivos) porClase.set(a.clase, (porClase.get(a.clase) ?? 0) + 1)
  anotar(imp, `Leídos ${textos.length} HTML y CSS. ${[...porClase].map(([c, n]) => `${n} ${c}`).join(", ")}.`)
  imp.paso = "referencias"
}

// ------------------------------------------------------------- referencias

/**
 * Una pagina del kit lista para dibujar sin red: su CSS enlazado dentro, sus
 * imagenes y fuentes como data URI, y lo de Google Fonts ya bajado.
 */
async function paginaSinRed(
  imp: Importacion,
  html: ArchivoImportado
): Promise<{ pagina: string; fuentes: Fuente[]; sustituciones: Importacion["sustituciones"]; faltan: string[] }> {
  const porRuta = new Map(imp.archivos.map((a) => [a.ruta, a]))
  const cache = new Map<string, Buffer | null>()
  const leerRuta = async (ruta: string): Promise<Buffer | null> => {
    if (cache.has(ruta)) return cache.get(ruta) ?? null
    const a = porRuta.get(ruta)
    const datos = a ? await bajar(a.storage).catch(() => null) : null
    cache.set(ruta, datos)
    return datos
  }
  const carpeta = carpetaDe(html.ruta)

  // Las rutas relativas de un texto, a data URI (desde la carpeta de ese texto).
  const enLinea = async (texto: string, desde: string): Promise<string> => {
    const re = /((?:src|href)\s*=\s*["'])([^"'#?]+)([^"']*["'])|url\(\s*(["']?)([^"')#?]+)([^"')]*)\4\s*\)/gi
    const cambios = new Map<string, string>()
    for (const m of texto.matchAll(re)) {
      const ruta = (m[2] ?? m[5] ?? "").trim()
      if (!ruta || /^(https?:|data:|\/\/|mailto:|#|javascript:)/i.test(ruta)) continue
      const completa = normalizarRuta(`${desde}/${decodeURIComponent(ruta)}`)
      const a = porRuta.get(completa)
      if (!a || cambios.has(ruta)) continue
      const datos = await leerRuta(completa)
      if (datos) cambios.set(ruta, comoDataUri(datos, a.mime))
    }
    return texto.replace(re, (todo, a1, ruta1, z1, comilla, ruta2, z2) => {
      const ruta = ((ruta1 ?? ruta2) as string | undefined)?.trim() ?? ""
      const nuevo = cambios.get(ruta)
      if (!nuevo) return todo
      return ruta1 !== undefined ? `${a1}${nuevo}${z1}` : `url("${nuevo}${z2 ?? ""}")`
    })
  }

  let texto = (await leerRuta(html.ruta))?.toString("utf8") ?? ""
  // Lo que pide a Google Fonts se lee antes de quitar sus enlaces.
  const pedidos = pedidosAGoogle(texto)
  // El CSS enlazado, dentro.
  const enlaces = [...texto.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
  let cssEnlazado = ""
  for (const enlace of enlaces) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(enlace)?.[1] ?? ""
    if (/rel\s*=\s*["']?stylesheet/i.test(enlace) && href && !/^https?:|^\/\//.test(href)) {
      const ruta = normalizarRuta(`${carpeta}/${href}`)
      const css = (await leerRuta(ruta))?.toString("utf8") ?? ""
      const cssEnLinea = await enLinea(css, carpetaDe(ruta))
      cssEnlazado += cssEnLinea
      texto = texto.replace(enlace, `<style>${cssEnLinea}</style>`)
    } else if (/fonts\.googleapis|fonts\.gstatic|preconnect|dns-prefetch/i.test(enlace)) {
      texto = texto.replace(enlace, "")
    }
  }
  pedidos.push(...pedidosAGoogle(cssEnlazado))
  texto = texto.replace(/@import\s+url\([^)]*fonts\.googleapis[^)]*\)\s*;?/gi, "")
  texto = await enLinea(texto, carpeta)

  const conGoogle =
    texto +
    cssEnlazado +
    pedidos
      .map((p) => `https://fonts.googleapis.com/css2?family=${p.familia.replace(/ /g, "+")}:wght@${p.pesos.join(";")}`)
      .join(" ")
  const { fuentes, sustituciones, faltan } = await fuentesDePagina(conGoogle, async (url) =>
    url.startsWith("data:") ? null : leerRuta(normalizarRuta(`${carpeta}/${url}`))
  )
  const fuentesCss = `<style>${cssDeFuentesCargadas(fuentes)}</style>`
  const pagina = /<head[^>]*>/i.test(texto)
    ? texto.replace(/<head[^>]*>/i, (h) => `${h}<meta charset="utf-8">${fuentesCss}`)
    : `<!doctype html><html><head><meta charset="utf-8">${fuentesCss}</head><body>${texto}</body></html>`
  return { pagina, fuentes, sustituciones, faltan }
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30) || "fuente"

/** Guarda en el kit las fuentes de una pagina que dio laminas (una vez cada una). */
async function guardarFuentes(accountId: string, kitId: string, imp: Importacion, fuentes: Fuente[]): Promise<void> {
  imp.fuentes ??= []
  for (const f of fuentes) {
    const previa = imp.fuentes.find((x) => x.familia === f.familia && x.peso === f.peso && x.estilo === f.estilo)
    const alias = [...new Set([...(previa?.alias ?? []), ...f.alias])]
    if (previa && alias.length === previa.alias.length) continue
    const papel = previa?.papel ?? `fuente_${slug(f.familia)}_${f.peso}${f.estilo === "italic" ? "_i" : ""}`
    await subirAlKit(accountId, kitId, {
      papel,
      tipo: "fuente",
      contenido: f.datos,
      mime: f.mime,
      nombre_original: `${f.familia} ${f.peso}`,
      meta: { familia: f.familia, peso: f.peso, estilo: f.estilo, alias, origen: f.origen },
    })
    if (previa) previa.alias = alias
    else imp.fuentes.push({ familia: f.familia, peso: f.peso, estilo: f.estilo, papel, alias })
  }
}

/** 0 si la ruta parece una pieza publicada (un carrusel), 1 si una pagina de apoyo. */
const noEsPieza = (ruta: string) => (/carrusel|carousel|slides?|lamina|post|pieza/i.test(ruta) ? 0 : 1)

async function pasoReferencias(accountId: string, kitId: string, imp: Importacion, inicio: number): Promise<void> {
  const sharp = (await import("sharp")).default
  imp.paginas_hechas ??= []
  const temporal = carpetaTemporal(accountId, kitId)
  // Las piezas publicadas primero: si el kit pasa del tope de laminas, que
  // sobren las paginas de apoyo (briefs, reportes), no los carruseles.
  const pendientes = imp.archivos
    .filter((a) => a.clase === "html" && !imp.paginas_hechas!.includes(a.ruta))
    .sort((a, b) => noEsPieza(a.ruta) - noEsPieza(b.ruta))

  for (const html of pendientes) {
    if (Date.now() - inicio > PRESUPUESTO_MS) return
    if (imp.referencias.length >= MAX_REFERENCIAS) break
    imp.paginas_hechas.push(html.ruta)
    try {
      const { pagina, fuentes, sustituciones, faltan } = await paginaSinRed(imp, html)
      const { laminas, css } = await laminasDePagina(pagina, FORMATOS_LAMINA, 40)
      if (!laminas.length) continue
      const rutaCss = `${temporal}/paginas/${randomUUID()}.css`
      await subir(rutaCss, Buffer.from(css.slice(0, 400_000)), "text/css")
      for (const [i, l] of laminas.entries()) {
        if (imp.referencias.length >= MAX_REFERENCIAS) break
        const n = imp.referencias.length + 1
        const imagen = `${temporal}/refs/${n}.jpg`
        await subir(imagen, l.jpg, "image/jpeg")
        const rutaHtml = `${temporal}/refs/${n}.html`
        await subir(rutaHtml, Buffer.from(l.html.slice(0, 200_000)), "text/html")
        let foto: string | undefined
        if (l.foto) {
          const datos = Buffer.from(l.foto.slice(l.foto.indexOf(",") + 1), "base64")
          const jpg = await sharp(datos)
            .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 86 })
            .toBuffer()
            .catch(() => null)
          if (jpg) {
            foto = `${temporal}/refs/${n}-foto.jpg`
            await subir(foto, jpg, "image/jpeg")
          }
        }
        imp.referencias.push({
          n,
          imagen,
          origen: `${html.ruta}#${i + 1}`,
          ancho: l.ancho,
          alto: l.alto,
          html: rutaHtml,
          foto,
          css: rutaCss,
          indice: i + 1,
          total: laminas.length,
        })
      }
      await guardarFuentes(accountId, kitId, imp, fuentes)
      for (const s of sustituciones)
        if (!imp.sustituciones.some((x) => x.pedida === s.pedida)) imp.sustituciones.push(s)
      for (const f of faltan) {
        const aviso = `La fuente ${f} no viene en el kit ni está en Google Fonts: se dibuja con otra.`
        if (!imp.avisos.includes(aviso)) imp.avisos.push(aviso)
      }
      anotar(imp, `${html.ruta}: ${laminas.length} láminas.`)
    } catch (error) {
      anotar(imp, `${html.ruta}: no se pudo dibujar (${error instanceof Error ? error.message : String(error)}).`)
    }
  }

  // Las laminas que vienen como imagen (de piezas sin HTML).
  for (const a of imp.archivos.filter((x) => x.clase === "lamina")) {
    if (imp.referencias.length >= MAX_REFERENCIAS) break
    if (imp.referencias.some((r) => r.imagen === a.storage)) continue
    imp.referencias.push({
      n: imp.referencias.length + 1,
      imagen: a.storage,
      origen: a.ruta,
      ancho: a.ancho ?? 0,
      alto: a.alto ?? 0,
    })
  }
  if (!imp.referencias.length) throw new Error("No se encontró ninguna lámina en el kit.")
  anotar(imp, `${imp.referencias.length} láminas de referencia.`)
  imp.paso = "catalogo"
}

// ---------------------------------------------------------------- catalogo

/** Hojas de contacto numeradas: muchas laminas en pocas imagenes para Claude. */
async function hojasDeContacto(
  items: { etiqueta: string; jpg: Buffer; fondo?: string }[],
  { columnas = 5, filas = 4, ancho = 290 } = {}
): Promise<Buffer[]> {
  const sharp = (await import("sharp")).default
  const alto = Math.round(ancho * 1.25)
  const porHoja = columnas * filas
  const hojas: Buffer[] = []
  for (let i = 0; i < items.length; i += porHoja) {
    const tanda = items.slice(i, i + porHoja)
    const celdas = await Promise.all(
      tanda.map(async (it) => {
        const mini = await sharp(it.jpg)
          .resize({ width: ancho, height: alto, fit: "inside" })
          .jpeg({ quality: 80 })
          .toBuffer()
        return `<div class="c" style="background:${it.fondo ?? "#3a3a3a"}"><img src="${comoDataUri(mini, "image/jpeg")}"><b>${it.etiqueta}</b></div>`
      })
    )
    const anchoHoja = columnas * (ancho + 12) + 12
    const altoHoja = Math.ceil(tanda.length / columnas) * (alto + 12) + 12
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}body{background:#111;width:${anchoHoja}px;height:${altoHoja}px;padding:6px;display:flex;flex-wrap:wrap;font-family:sans-serif}
.c{position:relative;width:${ancho}px;height:${alto}px;margin:6px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.c img{max-width:100%;max-height:100%}
.c b{position:absolute;top:6px;left:6px;background:#ffe600;color:#000;font-size:22px;padding:2px 8px;border-radius:4px}
</style></head><body>${celdas.join("")}</body></html>`
    hojas.push(await capturar(html, anchoHoja, altoHoja))
  }
  return hojas
}

const PRIORIDAD_DOC =
  /brand|marca|visual|dise|design|estilo|style|cta|brief|readme|agents|skill|regla|rule|guia|guide|token|metodolog/i

/** Los documentos del kit en texto, los mas importantes primero, hasta un tope. */
async function documentosDelKit(imp: Importacion, tope: number): Promise<string> {
  const docs = imp.archivos
    .filter((a) => a.clase === "texto")
    .sort((a, b) => Number(PRIORIDAD_DOC.test(b.ruta)) - Number(PRIORIDAD_DOC.test(a.ruta)) || a.bytes - b.bytes)
  let salida = ""
  for (const d of docs) {
    if (salida.length >= tope) break
    const texto = (await bajar(d.storage)).toString("utf8").slice(0, 12_000)
    salida += `\n\n===== ${d.ruta} =====\n${texto}`
  }
  return salida.slice(0, tope)
}

const OFICIO = `Eres quien convierte el kit de diseño de una marca en plantillas para un sistema que dibuja carruseles de Instagram. No inventas estilo: lo sacas del kit, con su paleta, sus fuentes, su composición, sus márgenes y su forma de tratar las fotos. Lo que dices del kit tiene que poder verse en sus láminas. Respondes solo con JSON válido, sin texto alrededor.`

async function pasoCatalogo(accountId: string, kitId: string, imp: Importacion): Promise<void> {
  const refs = imp.referencias
  const items = await enTandas(refs, 8, async (r) => ({ etiqueta: String(r.n), jpg: await bajar(r.imagen) }))
  const hojas = await hojasDeContacto(items)

  // Los logos, sobre gris para ver los blancos.
  const sharp = (await import("sharp")).default
  const logos = imp.archivos.filter((a) => a.clase === "logo").slice(0, 40)
  const logosJpg = (
    await enTandas(logos, 8, async (a, i) => {
      const datos = await bajar(a.storage).catch(() => null)
      if (!datos) return null
      const jpg = await sharp(datos, { density: 200 })
        .resize({ width: 600, height: 600, fit: "inside" })
        .flatten({ background: "#8a8a8a" })
        .jpeg({ quality: 85 })
        .toBuffer()
        .catch(() => null)
      return jpg ? { etiqueta: `L${i + 1}`, jpg, fondo: "#8a8a8a" } : null
    })
  ).flatMap((x) => (x ? [x] : []))
  const hojasLogos = logosJpg.length ? await hojasDeContacto(logosJpg, { columnas: 6, filas: 4, ancho: 220 }) : []

  const pdfs = imp.archivos.filter((a) => a.clase === "pdf" && a.bytes <= 15 * 1024 * 1024).slice(0, 2)
  const bloques: Bloque[] = [
    ...hojas.flatMap((h, i): Bloque[] => [
      { tipo: "texto", texto: `Hoja de láminas ${i + 1} de ${hojas.length}:` },
      jpgDe(h),
    ]),
    ...hojasLogos.flatMap((h, i): Bloque[] => [
      { tipo: "texto", texto: `Logos del kit (hoja ${i + 1}), sobre gris:` },
      jpgDe(h),
    ]),
    ...(await Promise.all(
      pdfs.map(async (p): Promise<Bloque> => ({ tipo: "pdf", datos: await bajar(p.storage), titulo: p.ruta }))
    )),
  ]

  const listaRefs = refs
    .map((r) => `${r.n}: ${r.origen} (${r.ancho}x${r.alto})${r.html ? " [con HTML]" : " [solo imagen]"}`)
    .join("\n")
  const listaLogos = logos.map((a, i) => `L${i + 1}: ${a.ruta}`).join("\n")
  const prompt = `Este es el kit de diseño de una marca. Arriba van todas sus láminas numeradas (hojas de contacto), sus logos (L1, L2...) y sus documentos.

Las láminas y de qué archivo sale cada una:
${listaRefs}

Logos:
${listaLogos || "(ninguno)"}

Colores que más usa su CSS (valor y veces): ${(imp.colores ?? []).map((c) => `${c.valor} ${c.veces}`).join(", ") || "(sin CSS)"}
Fuentes que usan sus piezas: ${(imp.fuentes ?? []).map((f) => `${f.familia} ${f.peso}${f.alias.length ? ` (en lugar de ${f.alias.join(", ")})` : ""}`).join(", ") || "(ninguna detectada)"}

Documentos del kit:
${await documentosDelKit(imp, 50_000)}

Tu trabajo:
1. El sistema visual: los colores con el papel que cumplen (fondo claro, fondo oscuro, acento, texto, texto suave...), la familia de títulos y la de texto (como se llaman en las fuentes de arriba), qué logo va sobre fondo claro, sobre oscuro, sobre el color de acento, y cuál es el símbolo suelto si existe; el ritmo de fondos típico de un carrusel; la letra mínima en px (de 1080 de ancho): si los documentos del kit la dicen, esa; si no, la más pequeña que se lee en sus láminas y las reglas visuales que el kit deja claras (en sus láminas o en sus documentos).
2. Los tipos de lámina distintos que tiene el kit. Solo láminas de 1080x1350. Para cada composición que se repita o que el kit use con intención (portada, idea, dato, lista, comparación, cita, tesis, criterio, cierre... o una propia), elige las mejores referencias (los números), la mejor primero. Entre dos láminas iguales, prefiere la que tiene HTML: de ella sale el código exacto y su foto. Si un tipo tiene variantes claramente distintas (portada con foto y portada tipográfica; cierres distintos según la acción), cada variante es un tipo aparte con su clave. Tiene que haber al menos una portada y un cierre. Máximo ${MAX_TIPOS}.
   No te quedes solo con la versión tipográfica de cada tipo: si el kit enseña láminas del medio con una figura (abajo) o con una foto dentro (una banda de foto arriba, una foto en una tarjeta), esas composiciones son tipos o variantes con su clave, y sus referencias son láminas que las tienen. Una lámina cuya protagonista es una figura es del tipo "figura" (con variantes por fondo si el kit las usa).
3. Las figuras: lo que el kit construye con datos dentro de una lámina. Las que el sistema sabe armar: ${TIPOS_FIGURA.map((t) => `${t} (${DESCRIPCION_FIGURA[t]})`).join("; ")}.
   Para cada una que el kit use (aunque sea con otro aspecto: una escalera de tarjetas es "niveles", una caja de comentario con su botón es "interfaz"), di en qué láminas aparece (la más clara primero) y cómo la dibuja el kit en una línea. Solo las que se ven en sus láminas.
4. Las fotos: cuántas láminas de un carrusel típico del kit llevan foto (contando portada y cierre), de media, en "fotos_por_carrusel".

Tipos que ya entiende el sistema (usa estos nombres si encajan): ${Object.entries(TIPOS_COMUNES)
    .map(([k, v]) => `${k} (${v})`)
    .join("; ")}.
Para los cierres, cta_tipos dice qué acciones sirve: seguir, comentar, palabra, dm, comercial (vacío si cualquiera).

Responde con este JSON:
{
  "resumen": "<dos líneas: qué estética tiene el kit>",
  "sistema": {
    "colores": [{"nombre": "<como lo llama el kit>", "valor": "#rrggbb", "papel": "<para qué se usa>"}],
    "fuentes": [{"papel": "titulos", "familia": "<familia>"}, {"papel": "texto", "familia": "<familia>"}],
    "logos": {"claro": "L<n>", "oscuro": "L<n>", "acento": "L<n>", "simbolo": "L<n>"},
    "ritmo": ["claro" | "oscuro" | "acento" | "foto", ...],
    "reglas": {"letra_minima": <px>, "notas": ["<regla concreta del kit>", ...]},
    "fotos_por_carrusel": <número>
  },
  "tipos": [
    {"clave": "<slug único, a-z0-9_>", "tipo": "<tipo>", "nombre": "<nombre corto>", "cuando_usar": "<una línea para quien escribe>", "cta_tipos": [], "referencias": [<n>, ...]}
  ],
  "figuras": [
    {"tipo": "<una de las figuras de arriba>", "referencias": [<n>, ...], "como": "<cómo la dibuja el kit>"}
  ]
}
Si un logo no existe, déjalo fuera.`

  const respuesta = await claude(imp, {
    accountId,
    model: MODELO_IMPORTAR,
    system: OFICIO,
    prompt,
    bloques,
    // Piensa con todas las hojas delante y lo que piensa sale del mismo presupuesto.
    maxTokens: 16000,
  })
  const datos = parsearJSONDeClaude(respuesta) as {
    resumen?: string
    sistema?: Record<string, unknown>
    tipos?: {
      clave?: string
      tipo?: string
      nombre?: string
      cuando_usar?: string
      cta_tipos?: string[]
      referencias?: number[]
    }[]
    figuras?: { tipo?: string; referencias?: number[]; como?: string }[]
  }

  // Los logos elegidos pasan al kit con su papel.
  const sistema = { ...(datos.sistema ?? {}) } as Record<string, unknown>
  const elegidos = (sistema.logos ?? {}) as Record<string, string>
  const logosKit: Record<string, string> = {}
  for (const [fondo, etiqueta] of Object.entries(elegidos)) {
    const i = Number(String(etiqueta).replace(/\D/g, "")) - 1
    const a = logos[i]
    if (!a || !["claro", "oscuro", "acento", "simbolo"].includes(fondo)) continue
    const papel = fondo === "simbolo" ? "simbolo" : `logo_${fondo}`
    await subirAlKit(accountId, kitId, {
      papel,
      tipo: "logo",
      contenido: await bajar(a.storage),
      mime: a.mime,
      nombre_original: a.ruta,
    })
    logosKit[fondo] = papel
  }
  sistema.logos = logosKit
  await actualizarKit(accountId, kitId, { sistema })

  const validas = new Set(refs.filter((r) => Math.abs(r.ancho / Math.max(1, r.alto) - 0.8) < 0.02).map((r) => r.n))
  const claves = new Set<string>()
  imp.tareas = (datos.tipos ?? [])
    .map((t): TareaPlantilla | null => {
      const clave = slug(t.clave ?? t.tipo ?? "").slice(0, 40)
      const tipo = slug(t.tipo ?? "").slice(0, 40)
      const referencias = (t.referencias ?? [])
        .map(Number)
        .filter((n) => validas.has(n))
        .slice(0, 6)
      if (!clave || !tipo || tipo.length < 2 || claves.has(clave) || !referencias.length) return null
      claves.add(clave)
      return {
        clave,
        tipo,
        nombre: String(t.nombre ?? tipo).slice(0, 120),
        cuando_usar: String(t.cuando_usar ?? TIPOS_COMUNES[tipo] ?? "").slice(0, 400),
        cta_tipos: Array.isArray(t.cta_tipos) ? t.cta_tipos.map(String).slice(0, 5) : [],
        referencias,
        etapa: "escribir",
        ronda: 0,
      }
    })
    .filter((t): t is TareaPlantilla => Boolean(t))
    .slice(0, MAX_TIPOS)
  if (!imp.tareas.some((t) => t.tipo === "portada") || !imp.tareas.some((t) => t.tipo === "cierre"))
    imp.avisos.push(
      "Claude no encontró una portada o un cierre claros en el kit: revisa las plantillas antes de activarlo."
    )
  if (!imp.tareas.length) throw new Error("Claude no encontró tipos de lámina de 1080x1350 en el kit.")
  imp.figuras = (datos.figuras ?? []).flatMap((f): TareaFigura[] => {
    const tipo = TIPOS_FIGURA.find((t) => t === f.tipo)
    const referencias = (f.referencias ?? []).map(Number).filter((n) => validas.has(n)).slice(0, 4)
    if (!tipo || !referencias.length) return []
    return [{ tipo, referencias, como: String(f.como ?? "").slice(0, 300), etapa: "escribir", ronda: 0 }]
  })
  // Una figura por tipo: si Claude repite una, vale la primera.
  imp.figuras = imp.figuras.filter((f, i) => imp.figuras!.findIndex((g) => g.tipo === f.tipo) === i)
  imp.resumen = String(datos.resumen ?? "").slice(0, 600)
  anotar(
    imp,
    `Catálogo: ${imp.tareas.map((t) => t.clave).join(", ")}. Figuras: ${imp.figuras.map((f) => f.tipo).join(", ") || "ninguna"}.`
  )
  imp.paso = "base"
}

// -------------------------------------------------------------------- base

const LENGUAJE = `Lenguaje de las plantillas:
- {{t:nombre}}: texto de la pieza (se escapa; *así* sale como <span class="resalte">, **así** en <b>).
- {{#items}}...{{.}}...{{i}}...{{/items}}: se repite por cada elemento de una lista; {{.}} es el texto y {{i}} su número (1, 2, 3).
- {{?nombre}}...{{/nombre}}: solo aparece si el hueco tiene algo (o, con {{?foto}}, si la lámina tiene foto).
- {{a:papel}}: un archivo del kit como data URI (logos: los papeles que se te dan). {{a:foto}} es la foto de la lámina.
- {{p:nombre}}: un trozo común del kit (por ejemplo el marco).
- {{s:n}} {{s:total}}: número de lámina y total; {{s:n2}} {{s:total2}} con dos cifras (01). {{s:puntos}}: un <i></i> por lámina, la actual con class="on".
Reglas:
- La lámina es un elemento con data-lamina y data-seguro="x1,y1,x2,y2" (su área segura, en px de un lienzo de ${ANCHO}x${ALTO}).
- Cada texto que viene de la pieza va en un elemento con data-hueco="nombre". Los adornos y elementos fijos con los que un texto no puede chocar (logo, contador, puntos, formas, tarjetas) llevan data-zona="nombre".
- Lo que numera la lámina (contador, puntos, "desliza") lleva además data-paginacion: la portada suelta de Facebook lo oculta.
- Los fondos sobre los que va el texto (foto a sangre, velos, degradados) no llevan data-zona: el texto va encima a propósito.
- Títulos y cifras grandes llevan data-encoger="max:min" (px): si no caben, la letra baja hasta min. Los textos de lectura llevan data-min con la letra mínima.
- Nada de scripts, eventos, enlaces ni archivos de fuera: solo lo que da el kit. Ni <link>, ni @import, ni url(http...).
- Usa los nombres de familia de las fuentes del kit tal cual.`

async function pasoBase(accountId: string, kitId: string, imp: Importacion): Promise<void> {
  const kc = await cargarKit(accountId, kitId)
  if (!kc) throw new Error("No se encontró el kit.")
  // Las referencias principales de cada tipo, hasta 6, con el HTML de las primeras.
  const principales = [...new Set(imp.tareas.map((t) => t.referencias[0]))].slice(0, 6)
  const refs = principales.map((n) => imp.referencias.find((r) => r.n === n)).filter((r): r is Referencia => Boolean(r))
  const bloques: Bloque[] = []
  for (const r of refs) {
    bloques.push({ tipo: "texto", texto: `Lámina ${r.n} (${r.origen}):` }, jpgDe(await bajar(r.imagen)))
    if (r.html)
      bloques.push({
        tipo: "texto",
        texto: `HTML de la lámina ${r.n}:\n${(await bajar(r.html)).toString("utf8").slice(0, 8000)}`,
      })
  }
  const cssPagina = refs.find((r) => r.css)?.css
  const css = cssPagina ? (await bajar(cssPagina)).toString("utf8").slice(0, 30_000) : ""

  const prompt = `Escribe la base común de las plantillas de este kit: el CSS que comparten todas las láminas y los trozos que se repiten (el marco: logo, contador, puntos o lo que el kit repita en todas). Cada plantilla añadirá después su propio <style> con lo específico.

Sistema visual: ${JSON.stringify(kc.kit.sistema)}
Archivos del kit que puedes usar con {{a:papel}}: ${
    kc.archivos
      .filter((a) => a.tipo === "logo" || a.tipo === "imagen")
      .map((a) => a.papel)
      .join(", ") || "(ninguno)"
  }
Fuentes disponibles (familia y peso): ${(imp.fuentes ?? []).map((f) => `${f.familia} ${f.peso}${f.estilo === "italic" ? " itálica" : ""}`).join(", ")}

${LENGUAJE}

CSS original de una pieza del kit (las url de archivos están como "(archivo)"):
${css || "(el kit no trae CSS: sácalo de las imágenes)"}

Responde con este JSON:
{
  "css": "<CSS común: variables del kit, base de la lámina (tamaño ${ANCHO}x${ALTO}, márgenes), clases que usan varias láminas, .resalte, el marco>",
  "parciales": {"<nombre>": "<HTML del trozo, con huecos {{a:...}} {{s:...}}>"},
  "notas": "<una línea: qué decidiste>"
}
Si el marco cambia según el fondo (logo de color en claro, blanco en oscuro), haz un trozo por fondo (marco_claro, marco_oscuro...).`

  let ultimoError = ""
  for (let intento = 0; intento < 2; intento++) {
    const respuesta = await claude(imp, {
      accountId,
      model: MODELO_IMPORTAR,
      system: OFICIO,
      prompt: ultimoError
        ? `${prompt}\n\nTu respuesta anterior no pasó la revisión: ${ultimoError}\nCorrígelo.`
        : prompt,
      bloques,
      maxTokens: 8000,
    })
    const datos = parsearJSONDeClaude(respuesta) as { css?: string; parciales?: Record<string, string> }
    const parciales: Record<string, string> = {}
    for (const [k, v] of Object.entries(datos.parciales ?? {}))
      if (/^[a-z0-9_]{2,40}$/.test(k) && typeof v === "string") parciales[k] = v
    const errores = [revisarCss(datos.css ?? ""), ...Object.values(parciales).map(revisarCss)].flat()
    if (!datos.css || errores.length) {
      ultimoError = errores.join(" ") || "Falta el CSS."
      continue
    }
    await actualizarKit(accountId, kitId, { css: datos.css, parciales })
    anotar(imp, `Base escrita: ${Object.keys(parciales).join(", ") || "sin trozos comunes"}.`)
    imp.paso = "figuras"
    return
  }
  throw new Error(`La base no pasó la revisión: ${ultimoError}`)
}

// ----------------------------------------------------------------- figuras

/** La estructura que arma el motor para cada figura (ver figuraAHtml), para quien escribe su CSS. */
const ESTRUCTURA_FIGURA = `.fig.fig-<tipo>[data-fondo="claro|oscuro|acento|foto"][data-modo]  la figura; --n es cuántos elementos tiene
  .fig-rotulo                      "Ejemplo hipotético", solo si lo es
  .fig-titulo                      el encabezado (qué miden las barras, la pregunta de una encuesta, la cuenta o el título de una ventana)
  .fig-items > .fig-item           cada elemento; --i es su número (1, 2...) y --v su valor de 0 a 1 si mide algo
      .es-resaltado                el que la figura destaca (el nivel actual, la barra que importa, la opción elegida)
      .es-si / .es-no              en un checklist
      .es-cabecera / .es-fila      en una tabla (la cabecera también es un .fig-item)
      .fig-num                     su número (niveles, flujo, opciones)
      .fig-texto .fig-nota         el texto y una línea de apoyo
      .fig-cifra                   la cifra tal cual se lee ($3,98, 62.000, 29 %)
      .fig-autor                   quién lo dijo (citas)
      .fig-marca                   la marca de sí o no (checklist): vacía, la dibujas tú
      .fig-barra > .fig-relleno    la barra (barras, opciones con porcentaje): el relleno mide var(--v)
      .fig-cuadros > i.fig-cuadro  los cuadros (cuadricula): uno por unidad de la escala, hasta 100
      .fig-celda                   cada celda de una fila de tabla
  .fig-flecha                      entre los pasos de un flujo: vacía, la dibujas tú
  .fig-accion > .fig-boton         el botón de una interfaz
  .fig-pie                         una nota pequeña debajo`

/** Recorta una lamina a la caja de su figura (con un margen), en JPEG para comparar. */
async function recorte(imagen: Buffer, caja: [number, number, number, number]): Promise<Buffer> {
  const sharp = (await import("sharp")).default
  const m = 24
  const left = Math.max(0, caja[0] - m)
  const top = Math.max(0, caja[1] - m)
  const width = Math.min(ANCHO, caja[2] + m) - left
  const height = Math.min(ALTO, caja[3] + m) - top
  return sharp(imagen).resize(ANCHO, ALTO, { fit: "fill" }).extract({ left, top, width, height }).jpeg({ quality: 88 }).toBuffer()
}

/**
 * El color de fondo de la lamina alrededor de una caja: el que mas se repite en
 * cuatro puntos justo por fuera de sus esquinas.
 */
async function fondoAlrededor(imagen: Buffer, caja: [number, number, number, number]): Promise<string> {
  const sharp = (await import("sharp")).default
  const { data, info } = await sharp(imagen).resize(ANCHO, ALTO, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const punto = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(info.width - 1, Math.round(x)))
    const cy = Math.max(0, Math.min(info.height - 1, Math.round(y)))
    const i = (cy * info.width + cx) * 3
    return [data[i], data[i + 1], data[i + 2]]
  }
  const [x1, y1, x2, y2] = caja
  const colores = [punto(x1 - 14, y1 - 14), punto(x2 + 14, y1 - 14), punto(x1 - 14, y2 + 14), punto(x2 + 14, y2 + 14)]
  const clave = (c: number[]) => c.map((v) => Math.round(v / 12)).join(",")
  const veces = new Map<string, number>()
  for (const c of colores) veces.set(clave(c), (veces.get(clave(c)) ?? 0) + 1)
  const elegido = colores.sort((a, b) => (veces.get(clave(b)) ?? 0) - (veces.get(clave(a)) ?? 0))[0]
  return `#${elegido.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

/** Una figura sola, con su CSS, en la caja y sobre el fondo de su referencia. */
async function dibujarFigura(
  kc: KitCargado,
  css: string,
  figura: Figura,
  caja: [number, number, number, number],
  color: string,
  fondo: string
) {
  const archivos = await archivosComoDatos(kc)
  const [x1, y1, x2, y2] = caja
  const cuerpo = `<div data-lamina data-seguro="0,0,${ANCHO},${ALTO}" style="position:relative;width:${ANCHO}px;height:${ALTO}px;background:${color}"><div data-hueco="figura" data-min="${kc.kit.sistema.reglas.letra_minima}" style="position:absolute;left:${x1}px;top:${y1}px;width:${x2 - x1}px;height:${y2 - y1}px">${figuraAHtml(figura, fondo)}</div></div>`
  const pagina = paginaDeLamina(`${kc.kit.css}\n${css}`, cssDeFuentes(kc.archivos, archivos), cuerpo, "carrusel_4x5")
  const [dibujada] = await dibujarLaminas([pagina], { ancho: ANCHO, alto: ALTO })
  return dibujada
}

const cajaValida = (v: unknown): [number, number, number, number] | null => {
  if (!Array.isArray(v) || v.length !== 4) return null
  const [x1, y1, x2, y2] = v.map((n) => Math.round(Number(n)))
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null
  const caja: [number, number, number, number] = [
    Math.max(0, x1),
    Math.max(0, y1),
    Math.min(ANCHO, x2),
    Math.min(ALTO, y2),
  ]
  return caja[2] - caja[0] >= 120 && caja[3] - caja[1] >= 60 ? caja : null
}

const reglasCssFigura = (kc: KitCargado, t: TareaFigura, imp: Importacion) => `Reglas:
- Todo tu CSS va bajo .fig-${t.tipo} (por ejemplo ".fig-${t.tipo} .fig-item{...}"): no toca nada más de la lámina.
- La figura no hereda colores ni fuentes de la lámina: ponlos tú, con los del kit, y da variantes con .fig-${t.tipo}[data-fondo="oscuro"], [data-fondo="acento"] y [data-fondo="foto"] según cómo trata el kit cada fondo (lo de sin variante es para fondo claro).
- Ocupa todo el ancho de su caja y el alto que pida su contenido: nada de alturas fijas, ni posiciones absolutas que salgan de la figura, ni overflow escondido. El número de elementos cambia de una pieza a otra (de ${LIMITES_FIGURA[t.tipo].min} a ${LIMITES_FIGURA[t.tipo].max}): usa flex o grid, y --n, --i y --v si te sirven (por ejemplo width: calc(var(--v) * 100%)).
- Lo que el kit no enseña (un .fig-num, por ejemplo) va con display:none. .fig-rotulo dice "Ejemplo hipotético": dale el aspecto de las etiquetas del kit. .fig-pie es una nota pequeña.
- Ninguna letra por debajo de ${kc.kit.sistema.reglas.letra_minima} px.
- Nada de url(), @import ni @font-face. Fuentes cargadas (familia y peso): ${(imp.fuentes ?? []).map((f) => `${f.familia} ${f.peso}${f.estilo === "italic" ? " itálica" : ""}`).join(", ") || "(las del CSS común)"}.`

async function pasoFiguras(accountId: string, kitId: string, imp: Importacion): Promise<void> {
  const tareas = imp.figuras ?? []
  const pendientes = tareas.filter((t) => t.etapa !== "hecha" && t.etapa !== "fallo").slice(0, FIGURAS_A_LA_VEZ)
  if (pendientes.length) {
    const kc = await cargarKit(accountId, kitId)
    if (!kc) throw new Error("No se encontró el kit.")
    await Promise.all(
      pendientes.map(async (t) => {
        try {
          if (t.etapa === "escribir") await escribirFigura(accountId, imp, kc, t)
          else if (t.etapa === "comprobar") await comprobarFigura(accountId, kitId, imp, kc, t)
          else if (t.etapa === "estres") await estresFigura(accountId, kitId, imp, kc, t)
        } catch (error) {
          t.error = error instanceof Error ? error.message : String(error)
          anotar(imp, `Figura ${t.tipo}: ${t.error}`)
          t.ronda += 1
          if (t.ronda > MAX_RONDAS_FIGURA + MAX_INTENTOS_ESCRIBIR) t.etapa = "fallo"
        }
      })
    )
    if (tareas.some((t) => t.etapa !== "hecha" && t.etapa !== "fallo")) return
  }
  // Todas listas: su CSS pasa de una vez a los trozos comunes del kit (dos
  // figuras escribiendo a la vez se pisarian).
  const hechas = tareas.filter((t) => t.etapa === "hecha" && t.css)
  if (hechas.length) {
    const kc = await cargarKit(accountId, kitId)
    if (!kc) throw new Error("No se encontró el kit.")
    const parciales = { ...kc.kit.parciales }
    for (const t of hechas) parciales[PREFIJO_FIGURA + t.tipo] = t.css as string
    await actualizarKit(accountId, kitId, { parciales })
  }
  anotar(imp, `Figuras: ${hechas.map((t) => t.tipo).join(", ") || "ninguna"}.`)
  imp.paso = "plantillas"
}

async function escribirFigura(accountId: string, imp: Importacion, kc: KitCargado, t: TareaFigura) {
  const refs = t.referencias
    .slice(0, 3)
    .map((n) => refDe(imp, n))
    .filter((r): r is Referencia => Boolean(r))
  const bloques: Bloque[] = []
  for (const r of refs) {
    bloques.push({ tipo: "texto", texto: `Lámina ${r.n}:` }, jpgDe(await bajar(r.imagen)))
    if (r.html)
      bloques.push({
        tipo: "texto",
        texto: `Su HTML original:\n${(await bajar(r.html)).toString("utf8").slice(0, 8000)}`,
      })
  }
  const prompt = `Escribe el CSS de la figura "${t.tipo}" de este kit: ${DESCRIPCION_FIGURA[t.tipo]}
Cómo la dibuja el kit: ${t.como || "(míralo en las láminas)"}
Arriba van láminas del kit donde aparece.

El motor arma la figura siempre con esta estructura; los datos cambian en cada pieza y tú solo pones el estilo, para que se vea como en el kit:
${ESTRUCTURA_FIGURA}

Lo que arma con unos datos de prueba:
${figuraAHtml(figuraDeMuestra(t.tipo), "claro")}

${reglasCssFigura(kc, t, imp)}

CSS común del kit (ya está cargado en la lámina):
${kc.kit.css}

Sistema visual: ${JSON.stringify(kc.kit.sistema)}
${t.errores?.length ? `\nTu intento anterior no pasó la revisión. Corrige esto: ${t.errores.join(" ")}` : ""}

Responde con este JSON:
{"referencia": <número de la lámina de arriba donde mejor se ve>, "caja": [x1, y1, x2, y2] (dónde está la figura en esa lámina, en px de un lienzo de ${ANCHO}x${ALTO}), "fondo": "claro" | "oscuro" | "acento" | "foto", "datos": <la figura de esa lámina, con esta forma: ${FORMA_FIGURA[t.tipo]}>, "css": "<el CSS de la figura>"}`

  const respuesta = await claude(imp, {
    accountId,
    model: MODELO_IMPORTAR,
    system: OFICIO,
    prompt,
    bloques,
    maxTokens: 12000,
  })
  const datos = parsearJSONDeClaude(respuesta) as {
    referencia?: number
    caja?: unknown
    fondo?: string
    datos?: unknown
    css?: string
  }
  const css = String(datos.css ?? "")
  const caja = cajaValida(datos.caja)
  const errores = [
    ...revisarCss(css),
    ...(css.includes(`.fig-${t.tipo}`) ? [] : [`El CSS no va bajo .fig-${t.tipo}.`]),
    ...(caja ? [] : ["La caja no es válida: [x1, y1, x2, y2] dentro de la lámina, de al menos 120x60."]),
  ]
  if (errores.length) {
    t.errores = errores
    t.ronda += 1
    if (t.ronda >= MAX_INTENTOS_ESCRIBIR) {
      t.etapa = "fallo"
      t.error = `No pasó la revisión: ${errores.join(" ")}`
    }
    return
  }
  t.css = css
  t.ref = t.referencias.includes(Number(datos.referencia)) ? Number(datos.referencia) : t.referencias[0]
  t.caja = caja as [number, number, number, number]
  t.fondo = ["claro", "oscuro", "acento", "foto"].includes(String(datos.fondo)) ? String(datos.fondo) : "claro"
  t.datos = parseFigura(datos.datos, [t.tipo]) ?? figuraDeMuestra(t.tipo)
  t.errores = undefined
  t.ronda = 0
  t.etapa = "comprobar"
  anotar(imp, `Figura ${t.tipo}: CSS escrito.`)
}

async function comprobarFigura(accountId: string, kitId: string, imp: Importacion, kc: KitCargado, t: TareaFigura) {
  const r = t.ref ? refDe(imp, t.ref) : undefined
  if (!r || !t.css || !t.caja || !t.datos) throw new Error("Falta la referencia o el CSS de la figura.")
  const original = await bajar(r.imagen)
  const color = await fondoAlrededor(original, t.caja)
  const dibujada = await dibujarFigura(kc, t.css, t.datos, t.caja, color, t.fondo ?? "claro")
  const [antes, ahora] = await Promise.all([recorte(original, t.caja), recorte(dibujada.png, t.caja)])

  const prompt = `La primera imagen es la figura "${t.tipo}" tal como está en una lámina del kit. La segunda es la misma figura, con los mismos datos, dibujada con el CSS que se escribió para ella.
Problemas que midió el navegador: ${JSON.stringify(dibujada.problemas)}

CSS actual de la figura:
${t.css}

Estructura que arma el motor (no cambia):
${ESTRUCTURA_FIGURA}

Compara con ojo de diseñador: formas, proporciones, colores, tipografía, aire entre elementos, cómo se marca lo resaltado. Puntúa de 0 a 10 lo que se parece (10: no se distinguen). Si es menos de ${PARECIDO_BUENO}, corrige el CSS con las mismas reglas:
${reglasCssFigura(kc, t, imp)}

Responde con este JSON:
{"parecido": <0-10>, "diferencias": ["<lo que se ve distinto, concreto>"], "css": "<el CSS corregido, o null si no hace falta>"}`
  const respuesta = await claude(imp, {
    accountId,
    model: MODELO_IMPORTAR,
    system: OFICIO,
    prompt,
    bloques: [
      { tipo: "texto", texto: "En el kit:" },
      jpgDe(antes),
      { tipo: "texto", texto: "Dibujada con el CSS:" },
      jpgDe(ahora),
    ],
    maxTokens: 12000,
  })
  const datos = parsearJSONDeClaude(respuesta) as { parecido?: number; diferencias?: string[]; css?: string | null }
  t.parecido = Math.max(0, Math.min(10, Number(datos.parecido) || 0))
  t.diferencias = Array.isArray(datos.diferencias) ? datos.diferencias.map(String).slice(0, 8) : []
  const nuevo = typeof datos.css === "string" ? datos.css : ""
  if (
    t.parecido < PARECIDO_BUENO &&
    t.ronda < MAX_RONDAS_FIGURA &&
    nuevo.includes(`.fig-${t.tipo}`) &&
    !revisarCss(nuevo).length
  ) {
    t.css = nuevo
    t.ronda += 1
    anotar(imp, `Figura ${t.tipo}: parecido ${t.parecido}/10, corregida (ronda ${t.ronda}).`)
    return
  }
  // La figura del kit y la dibujada quedan en el kit para revisarlas.
  await subirAlKit(accountId, kitId, {
    papel: `ref_figura_${t.tipo}`,
    tipo: "referencia",
    contenido: antes,
    mime: "image/jpeg",
    nombre_original: r.origen,
    meta: { n: r.n, caja: t.caja, figura: t.tipo },
  })
  await guardarPrueba(accountId, kitId, `prueba_figura_${t.tipo}`, ahora)
  anotar(imp, `Figura ${t.tipo}: parecido ${t.parecido}/10 tras ${t.ronda} correcciones.`)
  t.ronda = 0
  t.etapa = "estres"
}

async function estresFigura(accountId: string, kitId: string, imp: Importacion, kc: KitCargado, t: TareaFigura) {
  const r = t.ref ? refDe(imp, t.ref) : undefined
  if (!r || !t.css || !t.caja) throw new Error("Falta la referencia o el CSS de la figura.")
  const color = await fondoAlrededor(await bajar(r.imagen), t.caja)
  const largo = await dibujarFigura(kc, t.css, figuraDeMuestra(t.tipo, "largo"), t.caja, color, t.fondo ?? "claro")
  const corto = await dibujarFigura(kc, t.css, figuraDeMuestra(t.tipo, "corto"), t.caja, color, t.fondo ?? "claro")
  // La de fondo oscuro, si la referencia es clara (y al reves): que sus variantes existan.
  const otroFondo = t.fondo === "oscuro" ? "claro" : "oscuro"
  const otroColor = kc.kit.sistema.colores.find((c) => c.papel.toLowerCase().includes(otroFondo === "oscuro" ? "oscur" : "clar"))?.valor
  const contraste = otroColor
    ? await dibujarFigura(kc, t.css, t.datos ?? figuraDeMuestra(t.tipo), t.caja, otroColor, otroFondo)
    : null
  await guardarPrueba(accountId, kitId, `prueba_figura_${t.tipo}_largo`, await recorte(largo.png, t.caja))
  if (contraste) await guardarPrueba(accountId, kitId, `prueba_figura_${t.tipo}_${otroFondo}`, await recorte(contraste.png, t.caja))
  t.problemas = [
    ...largo.problemas.map((p) => `al límite: ${p.detalle}`),
    ...corto.problemas.map((p) => `con lo mínimo: ${p.detalle}`),
  ]
  const zoom = largo.encogidos.figura
  anotar(
    imp,
    `Figura ${t.tipo}: probada al límite${zoom ? ` (se achica al ${zoom} %)` : ""}${t.problemas.length ? `, ${t.problemas.length} problemas` : ""}.`
  )
  t.etapa = "hecha"
}

/** Lo que sabe quien escribe una plantilla de las figuras del kit. Vacio si el kit no tiene. */
function bloqueFigurasPlantilla(kc: KitCargado): string {
  const figuras = figurasDelKit(kc.kit.parciales)
  if (!figuras.length) return ""
  return `Figuras del kit: ${figuras.join(", ")}. Las arma el motor con los datos de cada pieza; su CSS ya está escrito y cargado en todas las láminas.
- Si la referencia tiene una figura (unas barras, una tabla, unos pasos, una encuesta, una caja de comentario...), no la copies ni la dibujes: declara un hueco {"nombre": "figura", "tipo": "figura", "obligatorio": <true si la lámina no se sostiene sin ella>, "descripcion": "<qué figura va bien ahí>"} y pon {{f:figura}} solo dentro de un elemento con data-hueco="figura" y data-min="<letra mínima>". Ese elemento es la caja de la figura: dale el sitio que ocupa en la referencia, con ancho y alto definidos (por ejemplo flex:1 y min-height:0 en una columna, o posición absoluta), sin overflow:hidden. Si la figura no cabe, el motor la achica entera.
- En esa caja puede caer cualquier figura del kit, no solo la de la referencia.
- En texto_referencia, "figura" lleva los datos de la figura de la referencia, con la forma de su tipo:
${figuras.map((f) => `  ${f}: ${FORMA_FIGURA[f]}`).join("\n")}`
}

// --------------------------------------------------------------- plantillas

async function pasoPlantillas(accountId: string, kitId: string, imp: Importacion): Promise<void> {
  const pendientes = imp.tareas.filter((t) => t.etapa !== "hecha" && t.etapa !== "fallo").slice(0, PLANTILLAS_A_LA_VEZ)
  if (!pendientes.length) {
    imp.paso = "cerrar"
    return
  }
  const kc = await cargarKit(accountId, kitId)
  if (!kc) throw new Error("No se encontró el kit.")
  await Promise.all(
    pendientes.map(async (t) => {
      try {
        if (t.etapa === "escribir") await escribir(accountId, kitId, imp, kc, t)
        else if (t.etapa === "comprobar") await comprobar(accountId, kitId, imp, t)
        else if (t.etapa === "estres") await estres(accountId, kitId, imp, t)
      } catch (error) {
        t.error = error instanceof Error ? error.message : String(error)
        anotar(imp, `${t.clave}: ${t.error}`)
        // Un tropiezo de red o de Claude se reintenta en la siguiente vuelta; tres seguidos la dan por perdida.
        t.ronda += 1
        if (t.ronda > MAX_RONDAS + MAX_INTENTOS_ESCRIBIR) t.etapa = "fallo"
      }
    })
  )
  if (imp.tareas.every((t) => t.etapa === "hecha" || t.etapa === "fallo")) imp.paso = "cerrar"
}

type Escrita = {
  nombre?: string
  cuando_usar?: string
  fondo?: string
  foto?: Record<string, unknown>
  huecos?: unknown
  html?: string
  texto_referencia?: { textos?: Record<string, string>; listas?: Record<string, string[]>; figura?: unknown }
}

const refDe = (imp: Importacion, n: number) => imp.referencias.find((r) => r.n === n)

async function escribir(accountId: string, kitId: string, imp: Importacion, kc: KitCargado, t: TareaPlantilla) {
  const refs = t.referencias
    .slice(0, 3)
    .map((n) => refDe(imp, n))
    .filter((r): r is Referencia => Boolean(r))
  const bloques: Bloque[] = []
  for (const [i, r] of refs.entries()) {
    bloques.push({
      tipo: "texto",
      texto: i === 0 ? `Referencia principal (lámina ${r.n}):` : `Otra lámina del mismo tipo (${r.n}):`,
    })
    bloques.push(jpgDe(await bajar(r.imagen)))
    if (r.html)
      bloques.push({
        tipo: "texto",
        texto: `Su HTML original:\n${(await bajar(r.html)).toString("utf8").slice(0, 10_000)}`,
      })
  }
  const css = refs[0]?.css ? (await bajar(refs[0].css)).toString("utf8").slice(0, 25_000) : ""
  const papeles = kc.archivos.filter((a) => a.tipo === "logo" || a.tipo === "imagen").map((a) => a.papel)

  const prompt = `Escribe la plantilla del tipo "${t.tipo}" (${t.nombre}) de este kit, para que dibuje láminas iguales a la referencia principal con el texto de otras piezas.
Cuándo se usa: ${t.cuando_usar}
${t.cta_tipos.length ? `Es un cierre para estas acciones: ${t.cta_tipos.join(", ")}.` : ""}

CSS común del kit (ya está cargado en todas las láminas, no lo repitas):
${kc.kit.css}

Trozos comunes que puedes usar con {{p:nombre}}:
${
  Object.entries(kc.kit.parciales)
    .filter(([k]) => !k.startsWith(PREFIJO_FIGURA))
    .map(([k, v]) => `--- ${k} ---\n${v}`)
    .join("\n") || "(ninguno)"
}
${bloqueFigurasPlantilla(kc)}

Archivos del kit para {{a:papel}}: ${papeles.join(", ") || "(ninguno)"}, y {{a:foto}} para la foto de la lámina.
Sistema visual: ${JSON.stringify(kc.kit.sistema)}

${LENGUAJE}

Huecos con nombre común (úsalos si encajan; puedes crear otros con su descripción): ${Object.entries(HUECOS_COMUNES)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ")}
- Cada hueco: {"nombre","tipo":"texto"|"lista"|"numero"|"figura","max":<caracteres que caben sin romper el diseño: el sitio que tiene el hueco en la lámina, no lo que mide el texto de la referencia>,"min_items","max_items" (solo listas),"obligatorio":bool,"resaltado":bool (si el kit resalta palabras en ese texto),"descripcion"}.
- Si en la referencia cada punto de una lista lleva un título corto y una explicación debajo, el hueco de la lista acepta los dos: el punto llega como "**Título.** explicación" y la plantilla lo enseña así (la negrita sale como <b>). Su max cuenta los dos.
- Lo que en la referencia es contenido de la pieza va en huecos; lo que se repite igual en todas las láminas del tipo (rótulos fijos de la marca, adornos) va fijo en la plantilla.
- La foto: si la lámina lleva foto, usa {{a:foto}}; si es opcional, envuélvela en {{?foto}}...{{/foto}}. Di qué foto acepta: usa (no, opcional, obligatoria), uso (portada, fondo, cierre, o inserto si la foto va dentro de la lámina, en una banda o una tarjeta, y no detrás del texto), tono (oscura, clara, cualquiera: según cómo la trata el kit, por ejemplo una mezcla screen sobre negro pide foto oscura), espacio (dónde tiene que quedar aire para el texto), orientacion.

CSS original de la pieza de la referencia (las url de archivos están como "(archivo)"):
${css || "(sin CSS: sácalo de la imagen)"}
${t.errores?.length ? `\nTu intento anterior no pasó la revisión. Corrige esto: ${t.errores.join(" ")}` : ""}

Responde con este JSON:
{
  "nombre": "<nombre corto>",
  "cuando_usar": "<una línea para quien escribe>",
  "fondo": "claro" | "oscuro" | "acento" | "foto",
  "foto": {"usa": "...", "uso": "...", "tono": "...", "espacio": "...", "orientacion": "..."},
  "huecos": [...],
  "html": "<style>lo propio de esta lámina</style><section ... data-lamina data-seguro=\\"...\\">...</section>",
  "texto_referencia": {"textos": {"<hueco>": "<el texto exacto de la referencia principal, con *resaltes* donde el kit resalta>"}, "listas": {"<hueco>": ["..."]}${figurasDelKit(kc.kit.parciales).length ? ', "figura": <la figura de la referencia principal en el JSON de su forma, o null>' : ""}}
}`

  const respuesta = await claude(imp, {
    accountId,
    model: MODELO_IMPORTAR,
    system: OFICIO,
    prompt,
    bloques,
    maxTokens: 9000,
  })
  const datos = parsearJSONDeClaude(respuesta) as Escrita
  const huecos = parseHuecos(datos.huecos)
  const html = String(datos.html ?? "")
  const errores = revisarPlantilla(html, huecos, {
    papeles: kc.archivos.map((a) => a.papel),
    parciales: Object.keys(kc.kit.parciales),
  })
  if (errores.length) {
    t.errores = errores
    t.ronda += 1
    if (t.ronda >= MAX_INTENTOS_ESCRIBIR) {
      t.etapa = "fallo"
      t.error = `No pasó la revisión: ${errores.join(" ")}`
    }
    return
  }

  // Su referencia (y su foto) se quedan en el kit para compararla al revisarla.
  const principal = refs[0]
  const referencia = await subirAlKit(accountId, kitId, {
    papel: `ref_${t.clave}`.slice(0, 60),
    tipo: "referencia",
    contenido: await bajar(principal.imagen),
    mime: "image/jpeg",
    nombre_original: principal.origen,
    meta: { n: principal.n, origen: principal.origen },
  })
  let fotoPapel: string | null = null
  if (principal.foto) {
    fotoPapel = `foto_ref_${t.clave}`.slice(0, 60)
    await subirAlKit(accountId, kitId, {
      papel: fotoPapel,
      tipo: "imagen",
      contenido: await bajar(principal.foto),
      mime: "image/jpeg",
      nombre_original: `${principal.origen} (foto)`,
      descripcion: "La foto de la referencia, para comprobar la plantilla.",
    })
  }
  const fondo = (["claro", "oscuro", "acento", "foto"] as const).find((f) => f === datos.fondo) ?? "claro"
  const prueba = {
    texto_referencia: datos.texto_referencia ?? {},
    foto_referencia: fotoPapel,
    referencia: { n: principal.n, indice: principal.indice ?? 1, total: principal.total ?? 7 },
    referencia_html: principal.html ? (await bajar(principal.html)).toString("utf8").slice(0, 20_000) : null,
  }
  // Si un intento anterior ya la guardo (y algo fallo despues, o su estado se
  // perdio), se reescribe esa: la tarea es la del mismo tipo y el mismo orden.
  if (!t.plantilla_id) {
    const { data: previa } = await supabaseAdmin()
      .from("brand_kit_plantillas")
      .select("id")
      .eq("kit_id", kitId)
      .eq("tipo", t.tipo)
      .eq("orden", imp.tareas.indexOf(t))
      .limit(1)
      .maybeSingle()
    if (previa) t.plantilla_id = String(previa.id)
  }
  if (t.plantilla_id) {
    await actualizarPlantilla(accountId, t.plantilla_id, { html, huecos, foto: datos.foto ?? {}, prueba })
    t.errores = undefined
    t.ronda = 0
    t.etapa = "comprobar"
    anotar(imp, `${t.clave}: plantilla reescrita.`)
    return
  }
  const plantilla = await guardarPlantilla(accountId, kitId, {
    tipo: t.tipo,
    nombre: datos.nombre || t.nombre,
    cuando_usar: datos.cuando_usar || t.cuando_usar,
    html,
    huecos,
    foto: datos.foto ?? {},
    fondo,
    cta_tipos: t.cta_tipos,
    referencia_archivo_id: referencia.id,
    orden: imp.tareas.indexOf(t),
    prueba,
  })
  t.plantilla_id = plantilla.id
  t.errores = undefined
  t.ronda = 0
  t.etapa = "comprobar"
  anotar(imp, `${t.clave}: plantilla escrita.`)
}

/** Lo necesario para dibujar una plantilla y compararla: el kit, ella, su referencia y su foto. */
async function contextoDe(accountId: string, kitId: string, plantillaId: string) {
  const kc = await cargarKit(accountId, kitId)
  if (!kc) throw new Error("No se encontró el kit.")
  const plantilla = kc.plantillas.find((p) => p.id === plantillaId)
  if (!plantilla) throw new Error("No se encontró la plantilla.")
  const archivoRef = kc.archivos.find((a) => a.id === plantilla.referencia_archivo_id)
  const referencia = archivoRef ? await bajar(archivoRef.ruta) : null
  const prueba = plantilla.prueba as {
    texto_referencia?: { textos?: Record<string, string>; listas?: Record<string, string[]>; figura?: unknown }
    foto_referencia?: string | null
    referencia?: { indice?: number; total?: number }
  }
  const archivoFoto = prueba.foto_referencia ? kc.archivos.find((a) => a.papel === prueba.foto_referencia) : null
  let foto: string | null = archivoFoto ? comoDataUri(await bajar(archivoFoto.ruta), archivoFoto.mime) : null
  if (!foto && plantilla.foto.usa !== "no") foto = await fotoNeutra()
  return { kc, plantilla, referencia, foto, prueba }
}

/** Una foto gris con algo de forma, para plantillas que piden foto y su referencia no la trae. */
async function fotoNeutra(): Promise<string> {
  const sharp = (await import("sharp")).default
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b5b5b"/><stop offset="1" stop-color="#1e1e1e"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><circle cx="700" cy="500" r="260" fill="#8a8a8a"/></svg>`
  return comoDataUri(await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer(), "image/jpeg")
}

const datosDeReferencia = (
  prueba: {
    texto_referencia?: { textos?: Record<string, string>; listas?: Record<string, string[]>; figura?: unknown }
    referencia?: { indice?: number; total?: number }
  },
  foto: string | null
): DatosLamina => ({
  textos: prueba.texto_referencia?.textos ?? {},
  listas: prueba.texto_referencia?.listas ?? {},
  n: prueba.referencia?.indice ?? 1,
  total: prueba.referencia?.total ?? 7,
  foto,
  figura: parseFigura(prueba.texto_referencia?.figura),
})

/** Diferencia media por pixel (0 a 255) entre dos imagenes, a media resolucion. */
async function diferencia(a: Buffer, b: Buffer): Promise<number> {
  const sharp = (await import("sharp")).default
  const [x, y] = await Promise.all(
    [a, b].map((img) => sharp(img).resize(540, 675, { fit: "fill" }).removeAlpha().raw().toBuffer())
  )
  let s = 0
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i])
  return Math.round((s / x.length) * 100) / 100
}

async function guardarPrueba(accountId: string, kitId: string, papel: string, png: Buffer): Promise<void> {
  const sharp = (await import("sharp")).default
  await subirAlKit(accountId, kitId, {
    papel: papel.slice(0, 60),
    tipo: "prueba",
    contenido: await sharp(png).jpeg({ quality: 82 }).toBuffer(),
    mime: "image/jpeg",
  })
}

async function comprobar(accountId: string, kitId: string, imp: Importacion, t: TareaPlantilla) {
  if (!t.plantilla_id) throw new Error("La plantilla no se guardó.")
  const { kc, plantilla, referencia, foto, prueba } = await contextoDe(accountId, kitId, t.plantilla_id)
  const [dibujada] = await dibujarLaminas([await armarLamina(kc, plantilla, datosDeReferencia(prueba, foto))], {
    ancho: ANCHO,
    alto: ALTO,
  })
  t.diferencia = referencia ? await diferencia(dibujada.png, referencia) : undefined

  const prompt = `La primera imagen es la lámina original del kit. La segunda es la misma lámina dibujada con la plantilla que se escribió para ella, con el mismo texto${foto ? " y la misma foto" : ""}.
Diferencia media por píxel: ${t.diferencia ?? "sin referencia"} de 255.
Problemas que midió el navegador: ${JSON.stringify(dibujada.problemas)}

Plantilla actual:
${plantilla.html}

CSS común del kit:
${kc.kit.css}

Compara con ojo de diseñador: composición, márgenes, tamaños y pesos de letra, colores, tratamiento de la foto, adornos. Puntúa de 0 a 10 lo que se parece (10: no se distinguen). Si es menos de ${PARECIDO_BUENO}, corrige el HTML de la plantilla (mismas reglas y mismos huecos; no toques el CSS común ni el de las figuras: si hay una figura, la arma el motor y tú solo mueves su caja).
${LENGUAJE}

Responde con este JSON:
{"parecido": <0-10>, "diferencias": ["<lo que se ve distinto, concreto>"], "html": "<plantilla corregida, o null si no hace falta>"}`

  const respuesta = await claude(imp, {
    accountId,
    model: MODELO_IMPORTAR,
    system: OFICIO,
    prompt,
    bloques: [
      { tipo: "texto", texto: "Original del kit:" },
      ...(referencia ? [jpgDe(referencia)] : []),
      { tipo: "texto", texto: "Dibujada con la plantilla:" },
      { tipo: "imagen", mime: "image/png", datos: dibujada.png },
    ],
    maxTokens: 9000,
  })
  const datos = parsearJSONDeClaude(respuesta) as { parecido?: number; diferencias?: string[]; html?: string | null }
  t.parecido = Math.max(0, Math.min(10, Number(datos.parecido) || 0))
  t.diferencias = Array.isArray(datos.diferencias) ? datos.diferencias.map(String).slice(0, 8) : []

  const corregir =
    t.parecido < PARECIDO_BUENO && t.ronda < MAX_RONDAS && typeof datos.html === "string" && datos.html.trim()
  if (corregir) {
    try {
      await actualizarPlantilla(accountId, plantilla.id, { html: datos.html as string })
      t.ronda += 1
      anotar(imp, `${t.clave}: parecido ${t.parecido}/10, corregida (ronda ${t.ronda}).`)
      return
    } catch (error) {
      anotar(
        imp,
        `${t.clave}: la corrección no pasó la revisión (${error instanceof Error ? error.message : String(error)}).`
      )
    }
  }
  await guardarPrueba(accountId, kitId, `prueba_${t.clave}_ref`, dibujada.png)
  await actualizarPlantilla(accountId, plantilla.id, {
    prueba: {
      ...plantilla.prueba,
      parecido: t.parecido,
      diferencia: t.diferencia,
      diferencias: t.diferencias,
      rondas: t.ronda,
    },
  })
  anotar(imp, `${t.clave}: parecido ${t.parecido}/10 tras ${t.ronda} correcciones.`)
  t.etapa = "estres"
}

/** Un texto de la longitud pedida, a partir de uno de ejemplo (repitiendo sus palabras). */
function alargar(base: string, largo: number): string {
  const palabras = (base.replace(/\*/g, "").trim() || "Texto de prueba para medir el espacio").split(/\s+/)
  let s = ""
  for (let i = 0; s.length < largo; i++) s += (s ? " " : "") + palabras[i % palabras.length]
  return s.slice(0, largo).replace(/\s+\S*$/, "") || s.slice(0, largo)
}

function textosDePrueba(
  huecos: Hueco[],
  ref: DatosLamina,
  modo: "largo" | "corto",
  figurasKit: TipoFigura[] = []
): Pick<DatosLamina, "textos" | "listas" | "figura"> {
  const textos: Record<string, string> = {}
  const listas: Record<string, string[]> = {}
  let figura: Figura | null = null
  for (const h of huecos) {
    if (h.tipo === "figura") {
      // La figura de la referencia, al limite o con lo minimo.
      const tipo = ref.figura?.tipo ?? figurasKit[0]
      if (tipo && (modo === "largo" || h.obligatorio)) figura = figuraDeMuestra(tipo, modo)
      continue
    }
    if (h.tipo === "lista") {
      const base = ref.listas[h.nombre] ?? []
      const n = modo === "largo" ? (h.max_items ?? 5) : (h.min_items ?? 2)
      listas[h.nombre] = Array.from({ length: n }, (_, i) => {
        const punto = base[i % Math.max(1, base.length)] ?? ""
        if (modo === "corto") return base[i]?.replace(/\*/g, "").split(/\s+/).slice(0, 2).join(" ") || "Punto"
        // Con la misma forma que la referencia: si sus puntos llevan una parte
        // en **negrita** (que el kit suele poner en su propia linea), el de
        // prueba tambien, o la prueba mide menos lineas de las que salen.
        const negrita = /\*\*([^*]+)\*\*/.exec(punto)
        if (!negrita) return alargar(punto, h.max)
        const antes = punto.slice(0, negrita.index).replace(/\*/g, "").trim()
        const despues = punto.slice(negrita.index + negrita[0].length).replace(/\*/g, "").trim()
        const titulo = alargar(negrita[1], Math.min(h.max, Math.round(negrita[1].length * 1.3)))
        const resto = Math.max(0, h.max - titulo.length - antes.length - 2)
        return [antes, `**${titulo}**`, alargar(despues || negrita[1], resto)].filter(Boolean).join(" ")
      })
      continue
    }
    const base = ref.textos[h.nombre] ?? h.descripcion
    if (modo === "corto") {
      if (!h.obligatorio) continue
      textos[h.nombre] = base
        .replace(/\*/g, "")
        .split(/\s+/)
        .slice(0, h.tipo === "numero" ? 1 : 2)
        .join(" ")
    } else if (h.tipo === "numero") {
      const limpio = base.replace(/\*/g, "") || "100"
      textos[h.nombre] = (limpio + "0".repeat(h.max)).slice(0, h.max)
    } else {
      const largo = alargar(base, h.max)
      const palabras = largo.split(" ")
      textos[h.nombre] =
        h.resaltado && palabras.length > 3
          ? `${palabras.slice(0, -2).join(" ")} *${palabras.slice(-2).join(" ")}*`
          : largo
    }
  }
  return { textos, listas, figura }
}

async function estres(accountId: string, kitId: string, imp: Importacion, t: TareaPlantilla) {
  if (!t.plantilla_id) throw new Error("La plantilla no se guardó.")
  const { kc, plantilla, foto, prueba } = await contextoDe(accountId, kitId, t.plantilla_id)
  const ref = datosDeReferencia(prueba, foto)
  const figurasKit = figurasDelKit(kc.kit.parciales)
  let huecos = plantilla.huecos
  // El maximo con que se escribio cada hueco: ninguno baja de un 60 % de el.
  // Lo que no cabe ni asi es un choque de la plantilla y queda en la prueba.
  const original: Record<string, number> = {
    ...Object.fromEntries(huecos.map((h) => [h.nombre, h.max])),
    ...((plantilla.prueba.max_original as Record<string, number> | undefined) ?? {}),
  }
  const ajustes: string[] = []
  let largo = await dibujarLaminas(
    [await armarLamina(kc, plantilla, { ...ref, ...textosDePrueba(huecos, ref, "largo", figurasKit) })],
    { ancho: ANCHO, alto: ALTO }
  )
  // Si con el maximo algo no cabe, se baja el maximo de ese hueco y se vuelve a medir.
  for (let vuelta = 0; vuelta < 5 && largo[0].problemas.length; vuelta++) {
    // En un choque cuentan los dos huecos; si uno es una lista, se acorta la
    // lista, que es la que empuja a lo de abajo.
    const nombres = new Set(huecos.map((h) => h.nombre))
    const culpables = new Set(
      largo[0].problemas.flatMap((p) => {
        const otro = /^con (\S+)/.exec(p.detalle)?.[1]
        return otro && nombres.has(otro) ? [p.hueco, otro] : [p.hueco]
      })
    )
    const soloListas = huecos.some((h) => h.tipo === "lista" && culpables.has(h.nombre))
    let cambio = false
    huecos = huecos.map((h) => {
      if (!culpables.has(h.nombre) || h.tipo === "figura" || (soloListas && h.tipo !== "lista")) return h
      if (h.tipo === "lista" && (h.max_items ?? 0) > (h.min_items ?? 1) && vuelta % 2 === 1) {
        cambio = true
        ajustes.push(`${h.nombre}: ${h.max_items} → ${(h.max_items ?? 2) - 1} puntos`)
        return { ...h, max_items: (h.max_items ?? 2) - 1 }
      }
      const max = Math.max(4, Math.ceil((original[h.nombre] ?? h.max) * 0.6), Math.floor(h.max * 0.85))
      if (max >= h.max) return h
      cambio = true
      ajustes.push(`${h.nombre}: ${h.max} → ${max} caracteres`)
      return { ...h, max }
    })
    if (!cambio) break
    largo = await dibujarLaminas(
      [await armarLamina(kc, { ...plantilla, huecos }, { ...ref, ...textosDePrueba(huecos, ref, "largo", figurasKit) })],
      { ancho: ANCHO, alto: ALTO }
    )
  }
  const corto = await dibujarLaminas(
    [await armarLamina(kc, { ...plantilla, huecos }, { ...ref, ...textosDePrueba(huecos, ref, "corto", figurasKit) })],
    { ancho: ANCHO, alto: ALTO }
  )
  await guardarPrueba(accountId, kitId, `prueba_${t.clave}_largo`, largo[0].png)
  await guardarPrueba(accountId, kitId, `prueba_${t.clave}_corto`, corto[0].png)
  await actualizarPlantilla(accountId, plantilla.id, {
    huecos,
    prueba: {
      ...plantilla.prueba,
      max_original: original,
      ajustes,
      problemas_largo: largo[0].problemas,
      problemas_corto: corto[0].problemas,
      encogidos_largo: largo[0].encogidos,
    },
  })
  anotar(imp, `${t.clave}: probada con textos al límite${ajustes.length ? ` (${ajustes.length} ajustes)` : ""}.`)
  t.etapa = "hecha"
}

/**
 * Vuelve a probar una plantilla con textos al limite, sin Claude: ajusta sus
 * maximos a lo que de verdad cabe y guarda las pruebas nuevas. Para cuando
 * cambia como se prueba, o el CSS de las figuras.
 */
export async function reprobarPlantilla(accountId: string, plantillaId: string): Promise<Plantilla> {
  const { data } = await supabaseAdmin()
    .from("brand_kit_plantillas")
    .select("kit_id")
    .eq("account_id", accountId)
    .eq("id", plantillaId)
    .single()
  if (!data) throw new Error("No se encontró la plantilla.")
  const kitId = String(data.kit_id)
  const kc = await cargarKit(accountId, kitId)
  const plantilla = kc?.plantillas.find((p) => p.id === plantillaId)
  if (!kc || !plantilla) throw new Error("No se encontró la plantilla.")
  const clave =
    kc.archivos.find((a) => a.id === plantilla.referencia_archivo_id)?.papel.replace(/^ref_/, "") ??
    `${plantilla.tipo}_${plantillaId.slice(0, 6)}`
  const imp: Importacion = parseImportacion({ paso: "listo" })!
  await estres(accountId, kitId, imp, {
    clave,
    tipo: plantilla.tipo,
    nombre: plantilla.nombre,
    cuando_usar: plantilla.cuando_usar,
    cta_tipos: plantilla.cta_tipos,
    referencias: [],
    plantilla_id: plantillaId,
    etapa: "estres",
    ronda: 0,
  })
  return (await cargarKit(accountId, kitId))?.plantillas.find((p) => p.id === plantillaId) ?? plantilla
}

// ------------------------------------------------------------------ cerrar

/** Borra la copia subida para importar (solo la carpeta importacion/ de este kit). */
async function borrarTemporal(accountId: string, kitId: string): Promise<number> {
  const raiz = carpetaTemporal(accountId, kitId)
  const storage = supabaseAdmin().storage.from(BUCKET_KITS)
  let borrados = 0
  for (const carpeta of [raiz, `${raiz}/refs`, `${raiz}/paginas`]) {
    for (;;) {
      const { data, error } = await storage.list(carpeta, { limit: 100 })
      if (error) throw new Error(error.message)
      const archivos = (data ?? []).filter((f) => f.id).map((f) => `${carpeta}/${f.name}`)
      if (!archivos.length) break
      const { error: e } = await storage.remove(archivos)
      if (e) throw new Error(e.message)
      borrados += archivos.length
    }
  }
  return borrados
}

/**
 * Las piezas del kit, enteras (su HTML y una hoja con sus laminas), para que el
 * diseñador libre aprenda de ellas: las paginas que dieron al menos 4 laminas
 * de 1080x1350, las publicadas primero. Lo que falle se anota y sigue.
 */
async function guardarPiezas(accountId: string, kitId: string, imp: Importacion): Promise<number> {
  const porPagina = new Map<string, Referencia[]>()
  for (const r of imp.referencias) {
    if (!r.html || Math.abs(r.ancho / Math.max(1, r.alto) - 0.8) > 0.02) continue
    const ruta = r.origen.split("#")[0]
    porPagina.set(ruta, [...(porPagina.get(ruta) ?? []), r])
  }
  const candidatas = [...porPagina]
    .filter(([, refs]) => refs.length >= 4)
    .sort((a, b) => noEsPieza(a[0]) - noEsPieza(b[0]) || b[1].length - a[1].length)
    .slice(0, MAX_PIEZAS)
  let n = 0
  for (const [ruta, refs] of candidatas) {
    const archivo = imp.archivos.find((a) => a.ruta === ruta)
    if (!archivo?.storage) continue
    try {
      const html = (await bajar(archivo.storage)).toString("utf8")
      const laminas = await enTandas(refs, 8, (r) => bajar(r.imagen))
      await guardarPiezaDeEjemplo(accountId, kitId, n + 1, {
        titulo: /<title[^>]*>([^<]+)/i.exec(html)?.[1]?.trim() || ruta,
        origen: ruta,
        html,
        hoja: await hojaDePieza(laminas),
        laminas: refs.length,
      })
      n++
    } catch (error) {
      anotar(imp, `${ruta}: no se guardó como pieza de ejemplo (${error instanceof Error ? error.message : String(error)}).`)
    }
  }
  return n
}

async function pasoCerrar(accountId: string, kitId: string, imp: Importacion): Promise<void> {
  const hechas = imp.tareas.filter((t) => t.etapa === "hecha").length
  if (!hechas) throw new Error("Ninguna plantilla salió bien. Revisa el registro y reintenta.")
  const piezas = await guardarPiezas(accountId, kitId, imp)
  anotar(imp, `${piezas} piezas de ejemplo guardadas para el diseñador.`)
  const borrados = await borrarTemporal(accountId, kitId)
  const origen = [
    `Importado el ${new Date().toISOString().slice(0, 10)} desde ${imp.archivos.length} archivos (${imp.referencias.length} láminas de referencia).`,
    imp.resumen ?? "",
    imp.sustituciones.length
      ? `Fuentes reemplazadas: ${imp.sustituciones.map((s) => `${s.pedida} → ${s.usada}`).join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ")
  await actualizarKit(accountId, kitId, { estado: "revision" })
  await supabaseAdmin()
    .from("brand_kits")
    .update({ origen: origen.slice(0, 2000) })
    .eq("id", kitId)
  // Las rutas de la copia ya no existen: se olvidan para no apuntar a nada.
  imp.archivos = imp.archivos.map((a) => ({ ...a, storage: "" }))
  imp.referencias = imp.referencias.map((r) => ({ ...r, imagen: "", html: undefined, foto: undefined, css: undefined }))
  imp.paso = "listo"
  imp.terminado = new Date().toISOString()
  anotar(imp, `Listo: ${hechas} de ${imp.tareas.length} plantillas para revisar. Copia borrada (${borrados} archivos).`)
}

// ------------------------------------------------------------------ revisar

/** Las imagenes de un kit para la pantalla de revision, como URL firmadas por papel. */
export async function imagenesDeRevision(kc: KitCargado): Promise<Record<string, string>> {
  const visibles = kc.archivos.filter((a) => a.tipo === "referencia" || a.tipo === "prueba")
  if (!visibles.length) return {}
  const { data } = await supabaseAdmin()
    .storage.from(BUCKET_KITS)
    .createSignedUrls(
      visibles.map((a) => a.ruta),
      SEGUNDOS_URL
    )
  const porRuta = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
  const salida: Record<string, string> = {}
  for (const a of visibles) {
    const url = porRuta.get(a.ruta)
    if (url) salida[a.papel] = `${url}&v=${encodeURIComponent(a.id)}`
  }
  return salida
}

/**
 * Rehace una plantilla con lo que pidio la persona: Claude ve el original, como
 * sale ahora y la nota, y la corrige. Despues se vuelve a probar con textos al
 * limite. Queda pendiente de aprobar.
 */
export async function rehacerPlantilla(accountId: string, plantillaId: string, nota: string): Promise<Plantilla> {
  const { data } = await supabaseAdmin()
    .from("brand_kit_plantillas")
    .select("kit_id")
    .eq("account_id", accountId)
    .eq("id", plantillaId)
    .single()
  if (!data) throw new Error("No se encontró la plantilla.")
  const kitId = String(data.kit_id)
  const { kc, plantilla, referencia, foto, prueba } = await contextoDe(accountId, kitId, plantillaId)
  const [ahora] = await dibujarLaminas([await armarLamina(kc, plantilla, datosDeReferencia(prueba, foto))], {
    ancho: ANCHO,
    alto: ALTO,
  })
  const imp: Importacion = parseImportacion({ paso: "listo" })!
  const prompt = `La persona revisó esta plantilla y pide: "${nota.slice(0, 1000)}".
La primera imagen es el original del kit; la segunda, cómo sale ahora la plantilla.

Plantilla actual:
${plantilla.html}

Huecos: ${JSON.stringify(plantilla.huecos)}

CSS común del kit:
${kc.kit.css}

${LENGUAJE}

Aplica lo que pide sin romper lo que ya se parece al original. Responde con este JSON:
{"html": "<plantilla corregida>", "huecos": <los huecos, cambiados solo si hace falta>, "que_cambio": "<una línea>"}`
  const respuesta = await claude(imp, {
    accountId,
    model: MODELO_IMPORTAR,
    system: OFICIO,
    prompt,
    bloques: [
      { tipo: "texto", texto: "Original del kit:" },
      ...(referencia ? [jpgDe(referencia)] : []),
      { tipo: "texto", texto: "Como sale ahora:" },
      { tipo: "imagen", mime: "image/png", datos: ahora.png },
    ],
    maxTokens: 9000,
  })
  const datos = parsearJSONDeClaude(respuesta) as { html?: string; huecos?: unknown; que_cambio?: string }
  const nueva = await actualizarPlantilla(accountId, plantillaId, {
    html: String(datos.html ?? plantilla.html),
    ...(datos.huecos ? { huecos: datos.huecos } : {}),
    estado: "pendiente",
  })
  const tarea: TareaPlantilla = {
    clave: plantilla.tipo + "_" + plantillaId.slice(0, 6),
    tipo: plantilla.tipo,
    nombre: plantilla.nombre,
    cuando_usar: plantilla.cuando_usar,
    cta_tipos: plantilla.cta_tipos,
    referencias: [],
    plantilla_id: plantillaId,
    etapa: "estres",
    ronda: 0,
  }
  // La prueba con el texto de la referencia y con textos al limite, otra vez.
  const papelBase =
    kc.archivos.find((a) => a.id === plantilla.referencia_archivo_id)?.papel.replace(/^ref_/, "") ?? tarea.clave
  tarea.clave = papelBase
  const [dibujada] = await dibujarLaminas([await armarLamina(kc, nueva, datosDeReferencia(prueba, foto))], {
    ancho: ANCHO,
    alto: ALTO,
  })
  await guardarPrueba(accountId, kitId, `prueba_${papelBase}_ref`, dibujada.png)
  await estres(accountId, kitId, imp, tarea)
  const final = (await cargarKit(accountId, kitId))?.plantillas.find((p) => p.id === plantillaId) ?? nueva
  await actualizarPlantilla(accountId, plantillaId, {
    prueba: {
      ...final.prueba,
      diferencia: referencia ? await diferencia(dibujada.png, referencia) : undefined,
      ultima_nota: nota.slice(0, 500),
      que_cambio: String(datos.que_cambio ?? "").slice(0, 300),
    },
  })
  return final
}
