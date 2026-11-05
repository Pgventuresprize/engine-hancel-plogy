/**
 * Leer una carpeta de posts ya hechos: que archivos son que.
 *
 * Puro y sin `server-only`: el navegador agrupa antes de subir nada y el servidor
 * lee los textos. No depende del formato de ninguna marca: cada carpeta con
 * imagenes es un post y, dentro, se prefieren las que parecen el resultado final.
 * Lo que no se entienda lo resuelve el agente o se le pregunta a la persona.
 */

export const MAX_POSTS_POR_LOTE = 30
/** Lo que admite Instagram en un carrusel. Publicar recortaria el resto sin avisar. */
export const MAX_LAMINAS = 10
/** Lo que admite Instagram por imagen. */
export const MAX_BYTES_IMAGEN = 8 * 1024 * 1024
export const MAX_CAPTION = 2200
export const MAX_HASHTAGS = 30
/** Lo que se lee de cada archivo de texto: un caption no llega ni de lejos. */
export const MAX_TEXTO = 40_000

/** Instagram rechaza lo que se sale de 4:5 a 1.91:1. */
export const proporcionValida = (ancho: number, alto: number) => ancho / alto >= 0.79 && ancho / alto <= 1.92

export type ArchivoDeCarpeta = { ruta: string; tamano: number }

export type PostDetectado = {
  nombre: string
  /** Rutas, en el orden del carrusel. */
  imagenes: string[]
  textos: string[]
  /** Por que no se puede subir. Null si se puede. */
  problema: string | null
}

const IMAGEN = /\.(jpe?g|png|webp)$/i
const TEXTO = /\.(md|txt)$/i
/** Donde suele estar lo terminado. */
const FINALES = /^(exports?|finale?s?|salida|outputs?|slides?|l[aá]minas?|carrusel(es)?|publicar|listos?)$/i
/** Lo que se usa para hacer el post, no el post. */
const MATERIAL = /^(assets?|fuentes?|originale?s?|raw|referencias?|recursos?|sources?|material(es)?|fotos?|im[aá]gene?s?|img)$/i

const orden = new Intl.Collator("es", { numeric: true, sensitivity: "base" })

type Nodo = { nombre: string; ruta: string; archivos: ArchivoDeCarpeta[]; hijos: Map<string, Nodo> }

const nodo = (nombre: string, ruta: string): Nodo => ({ nombre, ruta, archivos: [], hijos: new Map() })

function arbol(archivos: ArchivoDeCarpeta[]): Nodo {
  const raiz = nodo("", "")
  for (const a of archivos) {
    const partes = a.ruta.replace(/\\/g, "/").split("/").filter(Boolean)
    // Lo oculto y lo marcado con _ es de trabajo: `_hoja.jpg`, `.DS_Store`, `node_modules`.
    if (partes.some((p) => p.startsWith(".") || p.startsWith("_") || p === "node_modules")) continue
    let actual = raiz
    for (const parte of partes.slice(0, -1)) {
      if (!actual.hijos.has(parte)) actual.hijos.set(parte, nodo(parte, `${actual.ruta}${parte}/`))
      actual = actual.hijos.get(parte) as Nodo
    }
    actual.archivos.push({ ruta: partes.join("/"), tamano: a.tamano })
  }
  // Una sola carpeta arriba es la que se eligio, no un post suelto dentro de otra cosa.
  let cima = raiz
  while (cima.archivos.length === 0 && cima.hijos.size === 1) cima = [...cima.hijos.values()][0]
  return cima
}

const imagenesDe = (n: Nodo) => n.archivos.filter((a) => IMAGEN.test(a.ruta))
const hijos = (n: Nodo) => [...n.hijos.values()].sort((a, b) => orden.compare(a.nombre, b.nombre))

function conImagenes(n: Nodo): boolean {
  return imagenesDe(n).length > 0 || hijos(n).some(conImagenes)
}

/** Es un post si tiene imagenes propias o solo carpetas de apoyo con ellas. */
function esPost(n: Nodo): boolean {
  if (imagenesDe(n).length > 0) return true
  const conAlgo = hijos(n).filter(conImagenes)
  return conAlgo.length > 0 && conAlgo.every((h) => FINALES.test(h.nombre) || MATERIAL.test(h.nombre))
}

function aPost(n: Nodo, nombre: string): PostDetectado {
  const finales = hijos(n).find((h) => FINALES.test(h.nombre) && imagenesDe(h).length > 0)
  const material = hijos(n).filter((h) => imagenesDe(h).length > 0).sort((a, b) => imagenesDe(b).length - imagenesDe(a).length)[0]
  const fuente = finales ?? (imagenesDe(n).length ? n : material)
  const elegidas = imagenesDe(fuente).sort((a, b) => orden.compare(a.ruta, b.ruta))
  const pesada = elegidas.find((a) => a.tamano > MAX_BYTES_IMAGEN)

  return {
    nombre,
    imagenes: elegidas.map((a) => a.ruta),
    textos: n.archivos.filter((a) => TEXTO.test(a.ruta)).map((a) => a.ruta).sort(orden.compare),
    problema:
      elegidas.length > MAX_LAMINAS
        ? `Tiene ${elegidas.length} láminas y Instagram admite ${MAX_LAMINAS}.`
        : pesada
          ? `Una imagen pesa más de ${MAX_BYTES_IMAGEN / 1024 / 1024} MB, el máximo de Instagram.`
          : null,
  }
}

function recorrer(n: Nodo, salida: PostDetectado[]): void {
  for (const h of hijos(n)) {
    if (!conImagenes(h)) continue
    if (esPost(h)) salida.push(aPost(h, h.nombre))
    else recorrer(h, salida)
  }
}

/**
 * Una carpeta con varias subcarpetas son varios posts; una carpeta que solo trae
 * sus exports y sus assets, o unas fotos sueltas, es un post.
 */
export function agruparEnPosts(archivos: ArchivoDeCarpeta[]): PostDetectado[] {
  const cima = arbol(archivos)
  if (!conImagenes(cima)) return []
  if (esPost(cima) && !hijos(cima).some((h) => conImagenes(h) && !FINALES.test(h.nombre) && !MATERIAL.test(h.nombre))) {
    return [aPost(cima, cima.nombre || "Post")]
  }
  const salida: PostDetectado[] = []
  if (imagenesDe(cima).length) salida.push({ ...aPost({ ...cima, hijos: new Map() }, cima.nombre || "Post") })
  recorrer(cima, salida)
  return salida
}

/** "047-tu-estilo-en-un-parrafo" → "Tu estilo en un parrafo". */
export function tituloDeCarpeta(nombre: string): string {
  const limpio = nombre.replace(/\.[a-z0-9]+$/i, "").replace(/^[\d\s._-]+/, "").replace(/[-_]+/g, " ").trim()
  const texto = limpio || nombre
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}`.slice(0, 120)
}

const SOLO_HASHTAGS = /^(#[^\s#]+\s*)+$/

/** La ultima linea, si es de hashtags, va aparte: Instagram las quiere al final del texto. */
function separarHashtags(texto: string): { caption: string; hashtags: string[] } {
  const lineas = texto.trim().split("\n")
  const ultima = (lineas[lineas.length - 1] ?? "").trim()
  if (lineas.length > 1 && SOLO_HASHTAGS.test(ultima)) {
    return { caption: lineas.slice(0, -1).join("\n").trim(), hashtags: ultima.split(/\s+/) }
  }
  return { caption: texto.trim(), hashtags: [] }
}

/**
 * El texto de la publicacion, tal cual viene en el archivo. Busca una seccion que
 * se llame caption, mejor si dice Instagram; sin secciones, un texto corto es el
 * caption entero. Null si no se sabe: lo resuelve el agente, no una suposicion.
 */
export function extraerCaption(texto: string): { caption: string; hashtags: string[] } | null {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n")
  const titulos = lineas.flatMap((l, i) => (/^#{1,6}\s/.test(l) ? [{ i, texto: l }] : []))

  if (!titulos.length) {
    const entero = lineas.join("\n").trim()
    return entero && entero.length <= MAX_CAPTION ? separarHashtags(entero) : null
  }

  const captions = titulos.filter((t) => /caption|copy\b|texto de la publicaci/i.test(t.texto))
  const elegido = captions.find((t) => /instagram|\big\b/i.test(t.texto)) ?? captions[0]
  if (!elegido) return null
  const siguiente = titulos.find((t) => t.i > elegido.i)
  const seccion = lineas.slice(elegido.i + 1, siguiente?.i).join("\n").trim()
  return seccion ? separarHashtags(seccion) : null
}

/** Textos de otro canal o de trabajo: un texto suyo corto no es el caption de Instagram. */
const NO_CAPTION = /linkedin|facebook|\bdm\b|mensaje|correo|email|newsletter|notas?|brief|readme|calendario|antes de publicar/i

/**
 * El caption del primer archivo que lo tenga, empezando por el que se llama asi.
 * Mejor ninguno que el de otra red: sin caption, el agente lo escribe y queda marcado.
 */
export function captionDeTextos(textos: { nombre: string; contenido: string }[]): { caption: string; hashtags: string[] } | null {
  const puntaje = (n: string) => (/caption/i.test(n) ? 2 : /texto|copy/i.test(n) ? 1 : 0)
  const candidatos = [...textos].sort((a, b) => puntaje(b.nombre) - puntaje(a.nombre))
  for (const t of candidatos) {
    // Un archivo con secciones dice cual es la de Instagram; uno sin ellas se juzga por su nombre.
    const conSecciones = /^#{1,6}\s/m.test(t.contenido)
    if (!conSecciones && NO_CAPTION.test(t.nombre) && !/caption/i.test(t.nombre)) continue
    const c = extraerCaption(t.contenido)
    if (c) return c
  }
  return null
}

const SIN_TILDES = /[\u0300-\u036f]/g
/** Lo que convierte una confirmacion en otro pedido: pone peros, fechas o cambios. */
const NO_CONFIRMA = /\d|\b(no|pero|aunque|cambia\w*|pasa\w*|mueve\w*|quita\w*|saca\w*|mejor|antes|despues|lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana|hoy)\b/
const CONFIRMA = /\b(si|dale|confirmo|confirmado|confirmalo|confirmalos|programa\w*|agenda\w*|hagale|hazlo|listo|ok|okay|de una|perfecto|sale|va)\b/

/**
 * Si el mensaje confirma la propuesta y no pide nada mas. La decide el codigo, no el
 * agente: el texto de un archivo no puede escribir el mensaje de la persona.
 */
export function esConfirmacion(texto: string): boolean {
  const t = texto.normalize("NFD").replace(SIN_TILDES, "").toLowerCase().trim()
  return t.length > 0 && t.length <= 40 && !NO_CONFIRMA.test(t) && CONFIRMA.test(t)
}

/** Para saber si un post ya esta: espacios y mayusculas no lo hacen distinto. */
export const huellaDeCaption = (caption: string) => caption.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120)
