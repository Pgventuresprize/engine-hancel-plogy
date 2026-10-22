/**
 * La biblioteca de imagenes de la marca: tipos y reglas, sin base de datos.
 *
 * Aparte de imagenes.ts para que el navegador pueda importarlo: la pantalla de
 * subida comprime con estos mismos numeros que luego comprueba el servidor.
 */

export const BUCKET_IMAGENES = "marca-imagenes"

/** El lado largo de la imagen guardada. La lamina mide 1080x1350: sobra margen para recortar. */
export const LADO_IMAGEN = 1600
/** El lado largo de la miniatura de la galeria y de lo que mira el agente al elegir. */
export const LADO_MINI = 400
/** Calidad WebP de cada una. Por debajo de 0,85 se empieza a notar en degradados. */
export const CALIDAD_IMAGEN = 0.86
export const CALIDAD_MINI = 0.8
/** El tope del bucket. Una WebP de 1600 px suele quedar en 200-300 KB. */
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024

/** El plan gratuito de Supabase da 1 GB de storage, compartido con los carruseles. */
export const ESPACIO_PLAN_BYTES = 1024 * 1024 * 1024

/** Dias sin repetir una imagen si la marca no dice otra cosa. */
export const DIAS_SIN_REPETIR_POR_DEFECTO = 30

export const USOS_IMAGEN = ["portada", "fondo", "cierre"] as const
export type UsoImagen = (typeof USOS_IMAGEN)[number]
export const NOMBRE_USO: Record<UsoImagen, string> = {
  portada: "Portada",
  fondo: "Fondo de lámina",
  cierre: "Cierre",
}

export const ESPACIOS_TEXTO = ["arriba", "abajo", "centro", "ninguno"] as const
export type EspacioTexto = (typeof ESPACIOS_TEXTO)[number]

export type Orientacion = "vertical" | "apaisada" | "cuadrada"

/** La zona de la imagen que se usa, en fracciones de 0 a 1 de su ancho y su alto. */
export type Recorte = { x: number; y: number; w: number; h: number }

/** Proporciones del recortador. `null` es libre. */
export const PROPORCIONES_RECORTE = [
  { etiqueta: "Libre", valor: null },
  { etiqueta: "4:5 (lámina)", valor: 4 / 5 },
  { etiqueta: "1:1", valor: 1 },
  { etiqueta: "Apaisada 1,91:1", valor: 1.91 },
] as const

/** Por debajo de este ancho, una lamina de 1080 px se ve blanda. */
export const ANCHO_MINIMO_LAMINA = 1080

/** El lado mas corto que puede tener un recorte, en fraccion: menos es un sello, no una foto. */
const RECORTE_MINIMO = 0.05
export type EstadoEtiquetado = "pendiente" | "procesando" | "hecho" | "fallido"

export type Imagen = {
  id: string
  ruta: string
  ruta_mini: string
  ancho: number
  alto: number
  orientacion: Orientacion
  bytes: number
  huella: string
  nombre_original: string
  activa: boolean
  etiquetado: EstadoEtiquetado
  descripcion: string
  etiquetas: string[]
  usos_sugeridos: UsoImagen[]
  espacio_texto: EspacioTexto | null
  personas: boolean | null
  calidad: number | null
  recorte: Recorte | null
  ruta_mini_recorte: string | null
  created_at: string
}

/** Un uso de una imagen en una pieza. */
export type UsoDeImagen = {
  imagen_id: string
  piece_id: string | null
  red: string
  lamina: number
  motivo: string
  created_at: string
}

/** Lo que el carrusel guarda de cada foto de la biblioteca que uso. */
export type FotoDeBiblioteca = { lamina: number; imagenId: string; motivo: string }

/** Lo que pone Claude al mirar una imagen. */
export type Etiquetas = {
  descripcion: string
  etiquetas: string[]
  usos_sugeridos: UsoImagen[]
  espacio_texto: EspacioTexto | null
  personas: boolean | null
  calidad: number | null
}

export function orientacionDe(ancho: number, alto: number): Orientacion {
  const r = ancho / alto
  if (r > 1.1) return "apaisada"
  if (r < 0.9) return "vertical"
  return "cuadrada"
}

/** Las medidas que salen de encajar una imagen en `lado` por su lado largo, sin agrandarla. */
export function medidasEncajadas(ancho: number, alto: number, lado: number): { ancho: number; alto: number } {
  const escala = Math.min(1, lado / Math.max(ancho, alto))
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) }
}

const texto = (v: unknown, tope: number) => (typeof v === "string" ? v.trim().slice(0, tope) : "")

/** Etiquetas limpias: minuscula, sin repetidas, cortas, hasta 24. */
export function limpiarEtiquetas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return []
  const vistas = new Set<string>()
  for (const e of lista) {
    const t = texto(e, 40).toLocaleLowerCase("es").replace(/\s+/g, " ")
    if (t.length >= 2) vistas.add(t)
  }
  return [...vistas].slice(0, 24)
}

/** De lo que devuelve Claude (o escribe la persona) a etiquetas validas. */
export function parseEtiquetas(bruto: unknown): Etiquetas {
  const o = (bruto ?? {}) as Record<string, unknown>
  const usos = Array.isArray(o.usos_sugeridos)
    ? o.usos_sugeridos.filter((u): u is UsoImagen => USOS_IMAGEN.includes(u as UsoImagen))
    : []
  const calidad = Number(o.calidad)
  return {
    descripcion: texto(o.descripcion, 600),
    etiquetas: limpiarEtiquetas(o.etiquetas),
    usos_sugeridos: [...new Set(usos)],
    espacio_texto: ESPACIOS_TEXTO.includes(o.espacio_texto as EspacioTexto) ? (o.espacio_texto as EspacioTexto) : null,
    personas: typeof o.personas === "boolean" ? o.personas : null,
    calidad: Number.isFinite(calidad) ? Math.min(5, Math.max(1, Math.round(calidad))) : null,
  }
}

/** Lo que se busca: descripcion y etiquetas juntas. Va a la columna generada `busqueda`. */
export function textoDeBusqueda(e: Pick<Etiquetas, "descripcion" | "etiquetas">): string {
  return [e.descripcion, ...e.etiquetas].join(" ").toLocaleLowerCase("es").slice(0, 2000)
}

export function parseImagen(fila: Record<string, unknown>): Imagen {
  const e = parseEtiquetas(fila)
  return {
    id: String(fila.id),
    ruta: String(fila.ruta ?? ""),
    ruta_mini: String(fila.ruta_mini ?? ""),
    ancho: Number(fila.ancho) || 0,
    alto: Number(fila.alto) || 0,
    orientacion: (["vertical", "apaisada", "cuadrada"] as const).includes(fila.orientacion as Orientacion)
      ? (fila.orientacion as Orientacion)
      : "cuadrada",
    bytes: Number(fila.bytes) || 0,
    huella: String(fila.huella ?? ""),
    nombre_original: String(fila.nombre_original ?? ""),
    activa: fila.activa !== false,
    etiquetado: (["pendiente", "procesando", "hecho", "fallido"] as const).includes(fila.etiquetado as EstadoEtiquetado)
      ? (fila.etiquetado as EstadoEtiquetado)
      : "pendiente",
    ...e,
    recorte: parseRecorte(fila.recorte),
    ruta_mini_recorte: typeof fila.ruta_mini_recorte === "string" && fila.ruta_mini_recorte ? fila.ruta_mini_recorte : null,
    created_at: String(fila.created_at ?? ""),
  }
}

/** Un recorte valido, redondeado y dentro de la imagen, o null. */
export function parseRecorte(bruto: unknown): Recorte | null {
  if (!bruto || typeof bruto !== "object") return null
  const o = bruto as Record<string, unknown>
  const n = (v: unknown) => Math.round(Math.min(1, Math.max(0, Number(v))) * 10_000) / 10_000
  if (![o.x, o.y, o.w, o.h].every((v) => Number.isFinite(Number(v)))) return null
  const x = n(o.x)
  const y = n(o.y)
  const w = n(Math.min(n(o.w), 1 - x))
  const h = n(Math.min(n(o.h), 1 - y))
  if (w < RECORTE_MINIMO || h < RECORTE_MINIMO) return null
  // Un recorte que es la imagen entera no es un recorte.
  if (x === 0 && y === 0 && w >= 0.999 && h >= 0.999) return null
  return { x, y, w, h }
}

/** Las medidas en pixeles de lo que se usa de la imagen: el recorte, o la imagen entera. */
export function medidasUtiles(img: Pick<Imagen, "ancho" | "alto" | "recorte">): { ancho: number; alto: number } {
  if (!img.recorte) return { ancho: img.ancho, alto: img.alto }
  return { ancho: Math.round(img.ancho * img.recorte.w), alto: Math.round(img.alto * img.recorte.h) }
}

/** La miniatura que se ensena: la recortada si la hay. */
export const miniDe = (img: Pick<Imagen, "ruta_mini" | "ruta_mini_recorte">) => img.ruta_mini_recorte ?? img.ruta_mini

/** Una huella SHA-256 en hexadecimal. */
export const esHuella = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v)

export function formatoBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2).replace(".", ",")} GB`
}
