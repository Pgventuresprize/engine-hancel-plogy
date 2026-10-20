import type { CamposEjemplo } from "./ejemplos-modelo"

/**
 * Importar ejemplos desde un archivo: lo que se comprueba sin IA.
 *
 * Claude separa el archivo en piezas y ordena cada una en el formato de los
 * ejemplos. El riesgo es que de paso "mejore" el texto: un ejemplo con frases
 * que la marca no escribio le enseña al agente algo que no es de la marca. Por
 * eso el codigo compara lo extraido con el archivo, palabra por palabra:
 *   - lo que no esta en el archivo (cambiado o agregado) se marca y hay que
 *     revisarlo antes de guardar;
 *   - lo largo del archivo que no aparece en el ejemplo se avisa, por si se
 *     quedo texto de la pieza fuera.
 *
 * Puro y sin base, para la interfaz, la accion y las pruebas.
 */

/** Lo mas largo que se lee de un archivo. El kit de Plogy, con doce piezas, son unos 30.000. */
export const TOPE_ARCHIVO = 200_000

/** Cuantos ejemplos salen de un archivo como mucho. */
export const MAX_EJEMPLOS_ARCHIVO = 20

/** Un ejemplo extraido, todavia sin guardar. */
export type PropuestaEjemplo = {
  /** Para la lista de la pantalla. */
  clave: string
  campos: CamposEjemplo
  /** Trozos del ejemplo que no estan en el archivo: Claude los cambio o los agrego. */
  ajenos: string[]
  /** Trozos largos del archivo que no aparecen en el ejemplo. */
  faltan: string[]
  /** El porque lo escribio Claude: el archivo no lo traia. */
  porQuePropuesto: boolean
  /** Lo que el revisor castiga y el agente copiaria. */
  vicios: string[]
  /** Otras cosas que mirar: sin pilar, nombre repetido... */
  avisos: string[]
  /** Ya hay un ejemplo con ese nombre o ese texto. */
  duplicado: boolean
}

export type ResultadoImportacion = { propuestas: PropuestaEjemplo[]; avisos: string[] }

/** Una propuesta que hay que mirar antes de guardar: texto cambiado o porque escrito por Claude. */
export const pideRevision = (p: PropuestaEjemplo) => p.ajenos.length > 0 || p.porQuePropuesto

type Palabra = { original: string; clave: string }

/** Las palabras de un texto, comparables: sin tildes, sin mayusculas y sin signos. */
export function palabrasDe(texto: string): Palabra[] {
  return texto
    .split(/\s+/)
    .map((original) => ({
      original,
      clave: original
        .normalize("NFD")
        .replace(/\p{Mn}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ""),
    }))
    // Fuera tambien el numero de una lista ("2.", "3)"): el ejemplo numera solo
    // sus elementos, y con el numero el archivo y el ejemplo no casan.
    .filter((p) => p.clave && !/^\d{1,2}[.)]$/.test(p.original))
}

/** Cuatro palabras seguidas: lo bastante largo para no coincidir por casualidad. */
const N = 4

function gramas(palabras: Palabra[]): Set<string> {
  const salida = new Set<string>()
  for (let i = 0; i + N <= palabras.length; i++) {
    salida.add(
      palabras
        .slice(i, i + N)
        .map((p) => p.clave)
        .join(" ")
    )
  }
  return salida
}

/** Los tramos de `palabras` que no cubre ningun grama de `fuente`. */
function tramosSinCubrir(palabras: Palabra[], fuente: Set<string>, unido: string, minimo: number): string[] {
  if (palabras.length === 0) return []
  // Un texto corto ("Ejemplos", "Criterio de Plogy") no llega a un grama: se busca entero.
  if (palabras.length < N) {
    const frase = ` ${palabras.map((p) => p.clave).join(" ")} `
    return unido.includes(frase) || palabras.length < minimo ? [] : [palabras.map((p) => p.original).join(" ")]
  }
  const cubierta = new Array<boolean>(palabras.length).fill(false)
  for (let i = 0; i + N <= palabras.length; i++) {
    const g = palabras
      .slice(i, i + N)
      .map((p) => p.clave)
      .join(" ")
    if (fuente.has(g)) for (let j = i; j < i + N; j++) cubierta[j] = true
  }
  const tramos: string[] = []
  let desde = -1
  for (let i = 0; i <= palabras.length; i++) {
    if (i < palabras.length && !cubierta[i]) {
      if (desde < 0) desde = i
      continue
    }
    if (desde >= 0 && i - desde >= minimo) {
      tramos.push(
        palabras
          .slice(desde, i)
          .map((p) => p.original)
          .join(" ")
      )
    }
    desde = -1
  }
  return tramos
}

const recortar = (t: string, tope = 90) => (t.length > tope ? `${t.slice(0, tope - 1).trim()}…` : t)

/**
 * Lo que hay en los textos del ejemplo y no en el archivo. Basta una palabra:
 * cambiar "nadie" por "pocos" cambia lo que la pieza dice. Las tildes y los
 * signos no cuentan, para no marcar una coma.
 */
export function trozosAjenos(textos: string[], archivo: string): string[] {
  const fuente = palabrasDe(archivo)
  const g = gramas(fuente)
  const unido = ` ${fuente.map((p) => p.clave).join(" ")} `
  const salida = new Set<string>()
  for (const t of textos) for (const tramo of tramosSinCubrir(palabrasDe(t), g, unido, 1)) salida.add(recortar(tramo))
  return [...salida].slice(0, 6)
}

/**
 * Lo del archivo que no aparece en el ejemplo, de ocho palabras o mas: lo
 * corto suele ser un encabezado o una nota, y no vale la pena avisarlo.
 */
export function trozosQueFaltan(textos: string[], trozoDelArchivo: string): string[] {
  const extraido = palabrasDe(textos.join("\n"))
  const g = gramas(extraido)
  const unido = ` ${extraido.map((p) => p.clave).join(" ")} `
  return tramosSinCubrir(palabrasDe(trozoDelArchivo), g, unido, 8)
    .map((t) => recortar(t))
    .slice(0, 3)
}

/**
 * Donde empieza una pieza en el archivo, a partir de sus primeras palabras tal
 * como las copio Claude. Los espacios y las mayusculas no cuentan. -1 si no
 * aparece; se prueba tambien con las seis primeras, por si copio de mas.
 */
export function buscarInicio(archivo: string, inicio: string): number {
  const palabras = inicio.split(/\s+/).filter(Boolean)
  for (const cuantas of [palabras.length, 6]) {
    if (cuantas < 3 || cuantas > palabras.length) continue
    const patron = palabras
      .slice(0, cuantas)
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+")
    const m = new RegExp(patron, "i").exec(archivo)
    if (m) return m.index
  }
  return -1
}

/**
 * El archivo partido en un trozo por pieza, de donde empieza cada una a donde
 * empieza la siguiente. `null` para las que no se encontraron.
 */
export function partirArchivo(archivo: string, inicios: number[]): (string | null)[] {
  const ordenados = [...new Set(inicios.filter((i) => i >= 0))].sort((a, b) => a - b)
  return inicios.map((i) => {
    if (i < 0) return null
    const siguiente = ordenados.find((o) => o > i) ?? archivo.length
    return archivo.slice(i, siguiente)
  })
}

const comparable = (t: string) =>
  palabrasDe(t)
    .map((p) => p.clave)
    .join(" ")

/** Si ya hay un ejemplo con el mismo nombre o el mismo texto. */
export function esDuplicado(c: CamposEjemplo, existentes: { nombre: string; texto: string; red: string }[]): boolean {
  const nombre = comparable(c.nombre)
  const texto = comparable(c.texto)
  return existentes.some((e) => e.red === c.red && (comparable(e.nombre) === nombre || comparable(e.texto) === texto))
}
