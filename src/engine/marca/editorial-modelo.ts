/**
 * La identidad editorial de la marca: de que habla (pilares), para quien
 * (audiencias), en que terreno (verticales) y que pide al final (CTA).
 *
 * Son filas de la propia cuenta, y una cuenta nueva no tiene ninguna. Los
 * pilares y los CTA son las mismas tablas que usa el Estudio; audiencias y
 * verticales tienen su misma forma para editarse con el mismo componente.
 *
 * Aqui solo van los tipos y las reglas, sin acceso a la base, para que la
 * interfaz pueda importarlos. La lectura esta en editorial.ts.
 */

export type Capa = { id: string; name: string; description: string | null; position: number }
export type Pilar = Capa & { pregunta: string | null }

export const TIPOS_CTA = ["seguir", "comentar", "palabra", "dm", "comercial"] as const
export type TipoCta = (typeof TIPOS_CTA)[number]
export type Cta = Capa & { tipo: TipoCta; requiere_recurso: boolean; recurso_listo: boolean; activo: boolean }

export type IdentidadEditorial = {
  pilares: Pilar[]
  audiencias: Capa[]
  verticales: Capa[]
  ctas: Cta[]
}

/**
 * Los CTA que un agente puede proponer hoy: activos y, si prometen un recurso,
 * con el recurso listo. Un "comenta PALABRA y te lo mandamos" sin nada que
 * mandar es una promesa que nadie va a cumplir.
 */
export function ctasUsables(ctas: Cta[]): Cta[] {
  return ctas.filter((c) => c.activo && (!c.requiere_recurso || c.recurso_listo))
}
