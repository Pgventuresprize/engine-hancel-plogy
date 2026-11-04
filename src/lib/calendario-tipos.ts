import type { Horarios } from "@/engine/calendario/reparto"

/** Lo que viaja del servidor a la pantalla del calendario. Sin `server-only`: lo usa el cliente. */

export type RedCalendario = "instagram" | "linkedin"

export const NOMBRE_RED: Record<RedCalendario, string> = { instagram: "Instagram", linkedin: "LinkedIn" }

export type EstadoPost =
  | "bandeja"
  | "programada"
  | "publicando"
  | "publicada"
  /** Paso su hora sin salir: fallo, freno o caducidad. El motivo va en `error`. */
  | "fallida"
  /** No se sabe si salio: lo decide una persona mirando la red. */
  | "revisar"

export type PostCalendario = {
  id: string
  red: RedCalendario
  titulo: string
  texto: string
  imagenes: string[]
  estado: EstadoPost
  /** Sin aprobar no saldria: la freno el revisor, viene del chat o se edito tras aprobarla. */
  frenada: boolean
  aprobada: boolean
  deChat: boolean
  /** Lo que encontro el revisor, para decidir sin abrir el Estudio. */
  hallazgo: string | null
  /** Dia y hora locales: cuando sale, o cuando salio. Null en la bandeja. */
  dia: string | null
  hora: string | null
  error: string | null
  /** Promete un recurso que aun no esta en la web: no saldria a su hora. */
  recursoPendiente: boolean
  /** La misma noticia en la otra red. */
  hermana: { id: string; red: RedCalendario; dia: string | null; hora: string | null; frenada: boolean } | null
}

export type VistaCalendario = "semana" | "mes"

export type Ahora = { dia: string; hora: string }

export type DatosCalendario = {
  ahora: Ahora
  zona: string
  vista: VistaCalendario
  /** El lunes de la semana visible, o el dia 1 del mes visible. */
  fecha: string
  posts: PostCalendario[]
  /** Cuantas piezas sin programar hay de verdad, aunque se pinte un trozo. */
  enBandeja: number
  /** El interruptor general. Apagado se organiza todo y no sale nada. */
  publicarActivo: boolean
  redesConectadas: RedCalendario[]
  horarios: Horarios
  /** Los huecos ya tomados de aqui en adelante, tambien fuera de las fechas visibles. */
  ocupados: string[]
}

export type Colocacion = { id: string; dia: string; hora: string }

export type ResultadoCalendario =
  | { ok: true; colocadas: Colocacion[]; warning?: string }
  | { ok: false; error: string }
