/**
 * Postgres puede devolver "2026-08-23 03:40:45.144499+00" (espacio, offset
 * corto), que `new Date()` no parsea de forma fiable. Lo normalizamos a ISO.
 */
function toDate(value: string | null): Date | null {
  if (!value) return null
  const iso = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Zona en la que el dashboard muestra las fechas.
 *
 * Es solo presentacion: en la base todo sigue guardado en UTC, que es lo que
 * devuelve Postgres y con lo que trabaja el motor.
 *
 * Antes se pintaba en UTC y habia que restar cinco horas a mano para cuadrar
 * una corrida con el horario de `/engine/schedule`, que se configura en hora
 * local. Ahora la interfaz habla de un solo huso.
 */
export const DISPLAY_TIMEZONE = "America/Bogota"

/**
 * Zona y locale fijos a proposito, en vez de los del navegador: el servidor y
 * el cliente deben producir la misma cadena o React reporta un error de
 * hidratacion.
 */
const dateTime = new Intl.DateTimeFormat("es-ES", {
  timeZone: DISPLAY_TIMEZONE,
  dateStyle: "medium",
  timeStyle: "short",
})

export function formatDateTime(value: string | null): string {
  const date = toDate(value)
  return date ? dateTime.format(date) : "—"
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value)
}

/** Etiquetas legibles para los valores de `status` que usa el pipeline. */
export const STATUS_LABELS: Record<string, string> = {
  pending_analysis: "Pendiente de analisis",
  analyzing: "Analizando",
  analyzed: "Analizada",
  pending: "Pendiente",
  success: "Completado",
  failed: "Fallido",
  running: "En ejecucion",
  completed: "Completado",
}

export function statusLabel(value: string | null): string {
  if (!value) return "—"
  return STATUS_LABELS[value] ?? value
}

/** Tokens en corto: 850, 12,4 mil, 1,2 M. */
export function formatTokens(value: number): string {
  return new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}
