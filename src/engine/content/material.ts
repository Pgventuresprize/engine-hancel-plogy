/**
 * Cuanto material trae una noticia para escribir sobre ella.
 *
 * Lo decide el motor por el largo del texto consolidado, no el agente de
 * analisis a ojo. Con poco texto los agentes que escriben no tienen de donde
 * sacar cinco laminas y las llenan inventando: un resumen semanal de 449
 * caracteres acabo en un carrusel con cifras y conclusiones que la noticia no
 * decia.
 *
 * Sin base de datos: lo importan tambien los componentes del tablero.
 */

/**
 * Por debajo de esto la noticia tiene poco material. Son unas 250 palabras:
 * menos de lo que ocupa el texto de un carrusel, y escribir mas de lo que se
 * leyo es justo inventar.
 */
export const MIN_MATERIAL = 1500

/** Los mismos valores que ya guardaba `raw_news.content_fetch_status`. */
export type EstadoMaterial = "success" | "partial" | "failed"

export function estadoDelMaterial(texto: string | null): EstadoMaterial {
  const largo = texto?.trim().length ?? 0
  if (largo === 0) return "failed"
  return largo >= MIN_MATERIAL ? "success" : "partial"
}

/** Solo si se analizo y se quedo corta; sin analizar no se sabe. */
export function conPocoMaterial(estado: string | null): boolean {
  return estado === "partial" || estado === "failed"
}

const NOMBRE: Record<EstadoMaterial, string> = {
  success: "Con material",
  partial: "Poco material",
  failed: "Sin material",
}

export function nombreMaterial(estado: string | null): string | null {
  return estado && estado in NOMBRE ? NOMBRE[estado as EstadoMaterial] : estado
}
