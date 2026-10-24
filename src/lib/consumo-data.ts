import "server-only"

import { getSettings } from "@/engine/schedule"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"

/**
 * El consumo de Claude de la cuenta, sumado desde `pipeline_events` ("claude.uso":
 * una fila por llamada, ver engine/claude/messages.ts).
 *
 * Tokens = entrada + salida. La entrada incluye lo leido de cache, que se cobra
 * a una decima parte; se muestra aparte para que se vea cuanto se reaprovecha.
 */

/** Cuantos dias mira la pagina. */
export const DIAS_DE_CONSUMO = 30

export type Grupo = "analisis" | "guion" | "diseno" | "otros"
export const GRUPOS: { clave: Grupo; etiqueta: string }[] = [
  { clave: "analisis", etiqueta: "Análisis" },
  { clave: "guion", etiqueta: "Guion" },
  { clave: "diseno", etiqueta: "Diseño" },
  { clave: "otros", etiqueta: "Otros" },
]

const PASOS: Record<string, { etiqueta: string; grupo: Grupo }> = {
  analisis: { etiqueta: "Análisis de noticias", grupo: "analisis" },
  repetidas: { etiqueta: "Hechos repetidos", grupo: "analisis" },
  angulo: { etiqueta: "Ángulo", grupo: "guion" },
  criterio: { etiqueta: "Criterio", grupo: "guion" },
  instagram: { etiqueta: "Guion de carrusel", grupo: "guion" },
  "instagram-correccion": { etiqueta: "Corrección de carrusel", grupo: "guion" },
  linkedin: { etiqueta: "Post de LinkedIn", grupo: "guion" },
  revisor: { etiqueta: "Revisor", grupo: "guion" },
  "diseno-libre": { etiqueta: "Diseño libre", grupo: "diseno" },
  "diseno-critico": { etiqueta: "Crítico de diseño", grupo: "diseno" },
  maquetador: { etiqueta: "Maquetador", grupo: "diseno" },
  "fotos-etiquetas": { etiqueta: "Etiquetar fotos", grupo: "otros" },
  "fotos-asignar": { etiqueta: "Elegir fotos", grupo: "diseno" },
  "kit-importar": { etiqueta: "Importar kit", grupo: "otros" },
  "importar-ejemplos": { etiqueta: "Importar ejemplos", grupo: "otros" },
  redaccion: { etiqueta: "Redacción", grupo: "otros" },
  "redaccion-nicho": { etiqueta: "Nicho de redacción", grupo: "otros" },
  estudio: { etiqueta: "Estudio", grupo: "otros" },
  "estudio-ortografia": { etiqueta: "Ortografía del estudio", grupo: "otros" },
  "estudio-ubicar": { etiqueta: "Ubicar en el estudio", grupo: "otros" },
  ideas: { etiqueta: "Ideas", grupo: "otros" },
  "video-guion": { etiqueta: "Guion de video", grupo: "otros" },
  "probar-conexion": { etiqueta: "Probar conexión", grupo: "otros" },
}

const pasoDe = (paso: string | null) => PASOS[paso ?? ""] ?? { etiqueta: paso ?? "Sin paso", grupo: "otros" as Grupo }

export type ConsumoDia = { dia: string } & Record<Grupo, number>

export type ConsumoPaso = {
  paso: string
  etiqueta: string
  grupo: Grupo
  modelo: string
  llamadas: number
  entrada: number
  cache: number
  salida: number
  segundos: number
}

export type ConsumoPieza = {
  id: string
  titulo: string
  red: string
  fecha: string
  /** Analisis y angulo: los comparte con las demas piezas de su noticia. */
  compartido: number
  /** Guion, revisor, criterio y diseño de esta pieza. */
  propio: number
  llamadas: number
  porGrupo: Record<Grupo, number>
}

export type Consumo = {
  dias: ConsumoDia[]
  pasos: ConsumoPaso[]
  piezas: ConsumoPieza[]
  hoy: number
  semana: number
  mes: number
  llamadasMes: number
  /** Promedio de un carrusel entero, contando lo compartido. Null sin carruseles con registro. */
  porCarrusel: number | null
}

type Detalle = {
  paso?: string | null
  modelo?: string
  entrada?: number
  salida?: number
  deCache?: number
  ms?: number
  noticia?: string
  red?: string
}

const vacio = (): Record<Grupo, number> => ({ analisis: 0, guion: 0, diseno: 0, otros: 0 })

export async function consumoDeLaCuenta(): Promise<Consumo> {
  const accountId = await idDeCuentaActual()
  const supabase = supabaseAdmin()
  const { timezone } = await getSettings(accountId)
  const diaDe = (fecha: Date) => fecha.toLocaleDateString("en-CA", { timeZone: timezone })

  const desde = new Date(Date.now() - DIAS_DE_CONSUMO * 86_400_000)
  const filas: { at: string; detail: Detalle | null }[] = []
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await supabase
      .from("pipeline_events")
      .select("at, detail")
      .eq("account_id", accountId)
      .eq("kind", "claude.uso")
      .gte("at", desde.toISOString())
      .order("at", { ascending: true })
      .range(pagina * 1000, pagina * 1000 + 999)
    if (error) throw new Error(`No se pudo leer el consumo: ${error.message}`)
    filas.push(...((data ?? []) as typeof filas))
    if ((data ?? []).length < 1000) break
  }

  // Los ultimos 30 dias, hoy incluido, aunque alguno no tenga llamadas.
  const dias = new Map<string, ConsumoDia>()
  for (let i = DIAS_DE_CONSUMO - 1; i >= 0; i--) {
    const dia = diaDe(new Date(Date.now() - i * 86_400_000))
    dias.set(dia, { dia, ...vacio() })
  }

  const pasos = new Map<string, ConsumoPaso>()
  const porNoticia = new Map<string, { red: string; grupo: Grupo; tokens: number }[]>()
  const hoy = diaDe(new Date())
  const haceSemana = Date.now() - 7 * 86_400_000
  let tokHoy = 0
  let tokSemana = 0
  let tokMes = 0

  for (const fila of filas) {
    const d = fila.detail ?? {}
    const tokens = (d.entrada ?? 0) + (d.salida ?? 0)
    const { etiqueta, grupo } = pasoDe(d.paso ?? null)
    const dia = diaDe(new Date(fila.at))
    const delDia = dias.get(dia)
    if (delDia) delDia[grupo] += tokens

    tokMes += tokens
    if (dia === hoy) tokHoy += tokens
    if (new Date(fila.at).getTime() >= haceSemana) tokSemana += tokens

    const modelo = String(d.modelo ?? "").replace(/^claude-/, "")
    const clave = `${d.paso ?? ""}|${modelo}`
    const p = pasos.get(clave) ?? { paso: d.paso ?? "", etiqueta, grupo, modelo, llamadas: 0, entrada: 0, cache: 0, salida: 0, segundos: 0 }
    p.llamadas++
    p.entrada += d.entrada ?? 0
    p.cache += d.deCache ?? 0
    p.salida += d.salida ?? 0
    p.segundos += (d.ms ?? 0) / 1000
    pasos.set(clave, p)

    if (d.noticia) {
      const lista = porNoticia.get(d.noticia) ?? []
      lista.push({ red: d.red ?? "", grupo, tokens })
      porNoticia.set(d.noticia, lista)
    }
  }

  const piezas = await piezasConConsumo(accountId, desde, porNoticia)
  const carruseles = piezas.filter((p) => p.red === "instagram")

  return {
    dias: [...dias.values()],
    pasos: [...pasos.values()].sort((a, b) => b.entrada + b.salida - (a.entrada + a.salida)),
    piezas,
    hoy: tokHoy,
    semana: tokSemana,
    mes: tokMes,
    llamadasMes: filas.length,
    porCarrusel: carruseles.length
      ? carruseles.reduce((n, p) => n + p.compartido + p.propio, 0) / carruseles.length
      : null,
  }
}

/**
 * Las piezas del periodo con lo que costaron. Solo Instagram y LinkedIn: la de
 * Facebook sale del mismo guion que el carrusel y contarla seria contar dos
 * veces. Las piezas anteriores al registro por noticia no tienen datos y no salen.
 */
async function piezasConConsumo(
  accountId: string,
  desde: Date,
  porNoticia: Map<string, { red: string; grupo: Grupo; tokens: number }[]>
): Promise<ConsumoPieza[]> {
  const supabase = supabaseAdmin()
  const { data: filas } = await supabase
    .from("content_pieces")
    .select("id, network, raw_news_id, created_at")
    .eq("account_id", accountId)
    .in("network", ["instagram", "linkedin"])
    .gte("created_at", desde.toISOString())
    .order("created_at", { ascending: false })
    .limit(200)
  const piezas = (filas ?? []) as { id: string; network: string; raw_news_id: string | null; created_at: string }[]
  const conDatos = piezas.filter((p) => p.raw_news_id && porNoticia.has(p.raw_news_id))
  if (conDatos.length === 0) return []

  const { data: noticias } = await supabase
    .from("raw_news")
    .select("id, title")
    .in("id", [...new Set(conDatos.map((p) => p.raw_news_id!))])
  const titulos = new Map(((noticias ?? []) as { id: string; title: string }[]).map((n) => [n.id, n.title]))

  return conDatos.map((p) => {
    const porGrupo = vacio()
    let compartido = 0
    let propio = 0
    let llamadas = 0
    for (const uso of porNoticia.get(p.raw_news_id!) ?? []) {
      if (uso.red && uso.red !== p.network) continue
      if (uso.red) propio += uso.tokens
      else compartido += uso.tokens
      porGrupo[uso.grupo] += uso.tokens
      llamadas++
    }
    return {
      id: p.id,
      titulo: titulos.get(p.raw_news_id!) ?? "Sin título",
      red: p.network,
      fecha: p.created_at,
      compartido,
      propio,
      llamadas,
      porGrupo,
    }
  })
}
