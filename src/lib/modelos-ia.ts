/**
 * Constantes de los modelos de IA, sin dependencias de servidor.
 *
 * Viven aparte para que las pueda importar tanto el motor (que lee/escribe en
 * Supabase) como el componente de cliente del selector, sin arrastrar la
 * service role al bundle del navegador.
 */

export type PasoIA = "analisis" | "angulo" | "linkedin" | "instagram"

export const PASOS_IA: { paso: PasoIA; nombre: string }[] = [
  { paso: "analisis", nombre: "Analisis" },
  { paso: "angulo", nombre: "Angulo" },
  { paso: "linkedin", nombre: "LinkedIn" },
  { paso: "instagram", nombre: "Instagram" },
]

export const MODELOS_DISPONIBLES: { id: string; nombre: string }[] = [
  { id: "claude-haiku-4-5-20251001", nombre: "Haiku 4.5 (rapido, barato)" },
  { id: "claude-sonnet-5", nombre: "Sonnet 5 (equilibrado)" },
  { id: "claude-opus-5", nombre: "Opus 5 (maxima calidad)" },
  { id: "claude-haiku-5-5", nombre: "Haiku 5.5 (rapido, barato)" },
  { id: "claude-sonnet-5-5", nombre: "Sonnet 5.5 (equilibrado)" },
  { id: "claude-opus-5-5", nombre: "Opus 5.5 (maxima calidad)" },
]

export type ModelosPorPaso = Record<PasoIA, string>
