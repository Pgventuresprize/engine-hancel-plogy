import { llamarClaude, parsearJSONDeClaude } from "../claude/messages"

/**
 * Ubica en una imagen generada las partes que nombran las etiquetas.
 *
 * El generador no dice donde dibujo cada cosa, y unas etiquetas puestas a
 * alturas fijas no senalan nada. Claude mira la imagen y devuelve, por cada
 * etiqueta, el punto de la parte que nombra (en fracciones del ancho y el alto).
 * Una etiqueta cuya parte no se ve queda sin punto: mejor sin flecha que con
 * una que senala otra cosa.
 */

const MODELO = "claude-sonnet-5"

const SYSTEM = `Miras una imagen y ubicas en ella las partes que se te nombran. Para cada parte devuelves el punto que mejor la señala: el centro visible de esa parte, no el centro de la imagen. Las coordenadas son fracciones: x de 0 (borde izquierdo) a 1 (borde derecho), y de 0 (borde de arriba) a 1 (borde de abajo). Si una parte no aparece o no se distingue, devuelves null para ella. No adivines.

RESPONDE SOLO con este JSON: {"puntos":[{"x":<0-1>,"y":<0-1>} o null, ...]} con un elemento por parte, en el mismo orden.`

export type Punto = { x: number; y: number }

export async function ubicarPartes(accountId: string, imagen: string, partes: string[], contexto: string): Promise<(Punto | null)[]> {
  if (partes.length === 0) return []
  const r = await llamarClaude({ paso: "estudio-ubicar",
    accountId,
    model: MODELO,
    system: SYSTEM,
    prompt: `La imagen muestra: ${contexto}\n\nPARTES\n${partes.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
    imagenes: [imagen],
    maxTokens: 400,
  })
  if (!r.ok) return partes.map(() => null)
  try {
    const { puntos } = parsearJSONDeClaude(r.texto) as { puntos?: unknown[] }
    return partes.map((_, i) => {
      const p = puntos?.[i] as { x?: unknown; y?: unknown } | null | undefined
      const x = Number(p?.x)
      const y = Number(p?.y)
      if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return null
      return { x: Math.min(0.97, Math.max(0.03, x)), y: Math.min(0.97, Math.max(0.03, y)) }
    })
  } catch {
    return partes.map(() => null)
  }
}
