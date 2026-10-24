import type { RawNews } from "@/lib/types"

import { elegirDeBiblioteca, hayFotosEnBiblioteca, cargarFoto, type HuecoDeFoto } from "../marca/imagenes"
import { kitActivo, type KitCargado } from "../marca/kit"
import { piezasDelKit } from "../marca/kit-piezas"
import { supabaseAdmin } from "../supabase-admin"
import { parseInstagramResponse } from "./carousel"
import { terminosDeBusqueda } from "./keywords"
import {
  cambiosPedidos,
  contextoLibre,
  corregirDiseno,
  criticarDiseno,
  laminasConFoto,
  MAX_RONDAS_LIBRE,
  medirDiseno,
  primerDiseno,
  type FotoLibre,
  type GuionLibre,
} from "./kit-libre"
import { BancoDeFotos, descargarFotoPexels, pexelsConfigurado, type Foto } from "./pexels"
import { MAX_SLIDES } from "./render"
import type { Estilo } from "./theme"

/**
 * El diseño libre (kit-libre.ts) repartido entre pasadas del servidor.
 *
 * Cada llamada de diseño tarda de 2 a 4 minutos y una pasada tiene 300
 * segundos, asi que el carrusel avanza por pasos y guarda donde quedo en la
 * respuesta del trabajo (respuesta.diseno_libre), que nadie mas reescribe una
 * vez escrito el guion:
 *
 *   fotos      elige las fotos de la pieza (biblioteca, y Pexels donde falten)
 *   disenar    Opus escribe el HTML del carrusel entero
 *   revisar    se dibuja, se mide y lo mira el critico
 *   corregir   el diseñador corrige lo medido y lo que pidio el critico
 *   listo      el carrusel se dibuja de su fuente y se sube (kit-carrusel.ts)
 *   fallo      sale con las plantillas del kit, con el motivo en la ficha
 *
 * Cada pasada hace los pasos que le caben. Mientras trabaja, el trabajo queda
 * sin consumir pero ocupado (ocupado_hasta): si la pasada muere, la siguiente lo
 * retoma cuando vence, en vez de quedar tomado por nadie.
 */

export const PASOS_LIBRE = ["fotos", "disenar", "revisar", "corregir", "listo", "fallo"] as const
export type PasoLibre = (typeof PASOS_LIBRE)[number]

/** Lo que hace falta para volver a cargar una foto en otra pasada. */
export type FotoGuardada = {
  clave: string
  lamina: number
  descripcion: string
  origen: { tipo: "biblioteca"; imagenId: string; motivo: string } | { tipo: "pexels"; foto: Foto }
}

export type EstadoLibre = {
  paso: PasoLibre
  /** El kit con que se empezo (id y version): si cambia, el diseño se empieza de nuevo. */
  kit: string
  fotos: FotoGuardada[]
  fuente?: string
  /** La version con menos fallos medidos, por si la ultima correccion empeora. */
  mejor?: { fuente: string; graves: number }
  cambios?: [number, string[]][]
  rondas: number
  puntaje: number | null
  /** Fallos seguidos del paso actual (Claude no respondio, se acabo el tiempo). */
  intentos: number
  /** Pasadas que lo tomaron: un tope contra un diseño que nunca termina. */
  pasadas: number
  piezas: string[]
  avisos: string[]
  error?: string
  ocupado_hasta?: string
}

/** Cuanto puede tardar cada paso: se empieza solo si cabe en lo que queda de pasada. */
const DURACION: Record<Exclude<PasoLibre, "listo" | "fallo">, number> = {
  fotos: 45_000,
  disenar: 250_000,
  revisar: 60_000,
  corregir: 210_000,
}
const MAX_INTENTOS = 2
const MAX_PASADAS = 12

const terminal = (p: PasoLibre) => p === "listo" || p === "fallo"
export const claveKit = (kc: KitCargado) => `${kc.kit.id}:${kc.kit.version}`

export function parseEstadoLibre(v: unknown): EstadoLibre | null {
  if (!v || typeof v !== "object") return null
  const o = v as Partial<EstadoLibre>
  if (!PASOS_LIBRE.includes(o.paso as PasoLibre) || typeof o.kit !== "string") return null
  return {
    paso: o.paso as PasoLibre,
    kit: o.kit,
    fotos: Array.isArray(o.fotos) ? o.fotos : [],
    fuente: typeof o.fuente === "string" ? o.fuente : undefined,
    mejor: o.mejor,
    cambios: Array.isArray(o.cambios) ? o.cambios : undefined,
    rondas: Number(o.rondas) || 0,
    puntaje: typeof o.puntaje === "number" ? o.puntaje : null,
    intentos: Number(o.intentos) || 0,
    pasadas: Number(o.pasadas) || 0,
    piezas: Array.isArray(o.piezas) ? o.piezas : [],
    avisos: Array.isArray(o.avisos) ? o.avisos : [],
    error: typeof o.error === "string" ? o.error : undefined,
    ocupado_hasta: typeof o.ocupado_hasta === "string" ? o.ocupado_hasta : undefined,
  }
}

/** El guion como lo lee el diseñador, con el tope de laminas de Instagram. */
export function guionLibreDe(guion: ReturnType<typeof parseInstagramResponse>): GuionLibre {
  return {
    slides: guion.slides.slice(0, MAX_SLIDES - (guion.cierre ? 1 : 0)),
    antetitulo: guion.antetitulo,
    cierre: guion.cierre,
  }
}

/** Las fotos guardadas, otra vez como data URI. Las que ya no se pueden cargar se quedan fuera. */
export async function cargarFotosLibre(accountId: string, fotos: FotoGuardada[]): Promise<FotoLibre[]> {
  const cargadas = await Promise.all(
    fotos.map(async (f): Promise<FotoLibre | null> => {
      let datos: string | null = null
      if (f.origen.tipo === "pexels") datos = await descargarFotoPexels(f.origen.foto)
      else {
        const { data } = await supabaseAdmin()
          .from("brand_imagenes")
          .select("ruta, recorte")
          .eq("account_id", accountId)
          .eq("id", f.origen.imagenId)
          .maybeSingle()
        if (data) datos = await cargarFoto(String(data.ruta), (data.recorte as Parameters<typeof cargarFoto>[1]) ?? null)
      }
      return datos ? { clave: f.clave, lamina: f.lamina, datos, descripcion: f.descripcion } : null
    })
  )
  return cargadas.filter((f): f is FotoLibre => Boolean(f))
}

/** Lo que dice una lamina del guion, para elegir su foto. */
function textoDeLamina(g: GuionLibre, n: number): string {
  const s = g.slides[n - 1]
  if (!s) return `${g.cierre?.titulo ?? ""}. ${g.cierre?.texto ?? ""}`
  return s.type === "photo_hook" ? (s.hook ?? "") : [s.title, s.body].filter(Boolean).join(". ")
}

/** Elige las fotos de la pieza: la biblioteca primero; la portada y el cierre, si faltan, de Pexels. */
async function elegirFotos(opciones: {
  accountId: string
  kc: KitCargado
  guion: GuionLibre
  terminos: string[]
  evitar: string[]
  usarFotos: boolean
}): Promise<{ fotos: FotoGuardada[]; avisos: string[] }> {
  const { accountId, kc, guion, terminos, evitar, usarFotos } = opciones
  if (!usarFotos) return { fotos: [], avisos: [] }
  const total = guion.slides.length + (guion.cierre ? 1 : 0)
  const laminas = laminasConFoto(guion, kc.kit.sistema.fotos_por_carrusel ?? 2)
  const huecos: HuecoDeFoto[] = laminas.map((n) => ({
    indice: n - 1,
    uso: n === 1 ? "portada" : guion.cierre && n === total ? "cierre" : "inserto",
    texto: textoDeLamina(guion, n),
  }))
  const deBiblioteca = (await hayFotosEnBiblioteca(accountId))
    ? await elegirDeBiblioteca({ accountId, huecos, terminos: [guion.antetitulo, ...terminos].filter(Boolean), evitar })
    : new Map()
  const fotos: FotoGuardada[] = []
  const banco = new BancoDeFotos(terminos)
  for (const n of laminas) {
    const elegida = deBiblioteca.get(n - 1)
    const clave = `foto${fotos.length + 1}`
    if (elegida) {
      fotos.push({ clave, lamina: n, descripcion: elegida.motivo, origen: { tipo: "biblioteca", imagenId: elegida.imagenId, motivo: elegida.motivo } })
      continue
    }
    // Sin foto de la marca, solo la portada y el cierre la buscan fuera: una del
    // medio puede quedar tipografica.
    const fuera = n === 1 || n === total
    if (!fuera || !pexelsConfigurado()) continue
    const foto = await banco.siguiente()
    if (foto) fotos.push({ clave, lamina: n, descripcion: foto.alt || terminos[0] || "", origen: { tipo: "pexels", foto } })
  }
  return { fotos, avisos: [] }
}

/**
 * Avanza el diseño libre de una pieza los pasos que caben hasta `hasta` (hora
 * en ms). Nunca lanza: un fallo se anota en el estado (y a los MAX_INTENTOS, o
 * si no pasa las comprobaciones, el diseño queda en "fallo").
 */
export async function avanzarDisenoLibre(opciones: {
  accountId: string
  kc: KitCargado
  guion: GuionLibre
  estado: EstadoLibre | null
  terminos: string[]
  evitar: string[]
  usarFotos: boolean
  hasta: number
}): Promise<EstadoLibre> {
  const { accountId, kc, guion, hasta } = opciones
  const estado: EstadoLibre =
    opciones.estado && opciones.estado.kit === claveKit(kc)
      ? { ...opciones.estado }
      : { paso: "fotos", kit: claveKit(kc), fotos: [], rondas: 0, puntaje: null, intentos: 0, pasadas: 0, piezas: [], avisos: [] }
  let ctx: Awaited<ReturnType<typeof contextoLibre>> | null = null
  const contexto = async () => {
    if (!ctx)
      ctx = await contextoLibre({
        accountId,
        kc,
        guion,
        fotos: await cargarFotosLibre(accountId, estado.fotos),
        // Si un diseño ya se paso de tiempo, el siguiente piensa menos.
        esfuerzo: estado.intentos ? "low" : "medium",
      })
    return ctx
  }
  const fallar = (motivo: string) => {
    estado.paso = "fallo"
    estado.error = motivo.slice(0, 1000)
  }

  while (!terminal(estado.paso) && Date.now() + DURACION[estado.paso as keyof typeof DURACION] < hasta) {
    const paso = estado.paso
    try {
      if (paso === "fotos") {
        const r = await elegirFotos({ ...opciones })
        estado.fotos = r.fotos
        estado.paso = "disenar"
      } else if (paso === "disenar") {
        const c = await contexto()
        estado.fuente = await primerDiseno(c, hasta - Date.now() - 10_000)
        estado.piezas = c.elegidas.map((p) => p.origen)
        estado.paso = "revisar"
      } else if (paso === "revisar") {
        const c = await contexto()
        const medida = await medirDiseno(c, estado.fuente ?? "")
        if (!estado.mejor || medida.graves <= estado.mejor.graves) estado.mejor = { fuente: estado.fuente ?? "", graves: medida.graves }
        // El critico solo mira un carrusel que ya cumple lo medible, y solo si
        // queda una ronda para hacerle caso.
        const critica = !medida.graves && estado.rondas < MAX_RONDAS_LIBRE ? await criticarDiseno(c, medida.dibujadas) : null
        if (critica) estado.puntaje = critica.puntaje
        const cambios = cambiosPedidos(medida, critica)
        if (estado.rondas >= MAX_RONDAS_LIBRE || !cambios.size) {
          if (estado.mejor.graves === 0) {
            estado.fuente = estado.mejor.fuente
            estado.paso = "listo"
          } else {
            const detalle = [...medida.fallos.entries()].map(([n, qs]) => `${n ? `lámina ${n}` : "documento"}: ${qs.join("; ")}`)
            fallar(`no pasó las comprobaciones: ${detalle.join(" | ")}`)
          }
        } else {
          estado.cambios = [...cambios.entries()]
          estado.paso = "corregir"
        }
      } else if (paso === "corregir") {
        const c = await contexto()
        const medida = await medirDiseno(c, estado.fuente ?? "")
        estado.fuente = await corregirDiseno(c, estado.fuente ?? "", new Map(estado.cambios ?? []), medida.dibujadas, hasta - Date.now() - 10_000)
        estado.rondas += 1
        estado.cambios = undefined
        estado.paso = "revisar"
      }
      estado.intentos = 0
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error)
      estado.intentos += 1
      estado.avisos = [...estado.avisos, `${paso}: ${motivo}`].slice(-8)
      if (estado.intentos >= MAX_INTENTOS) fallar(`${paso}: ${motivo}`)
      break
    }
  }
  return estado
}

// ------------------------------------------------------------------ pasada

/**
 * Lo que hace la pasada con un carrusel de Instagram antes de dibujarlo. Si la
 * marca tiene kit activo con piezas de ejemplo, el carrusel va con diseño
 * libre: aqui avanza su diseño. Devuelve true si todavia no se puede dibujar;
 * el trabajo queda entonces libre para la siguiente pasada. Si devuelve false,
 * `job.respuesta` lleva el diseño (listo o fallido) y el carrusel se dibuja ya.
 */
export async function disenoLibrePendiente(
  job: { id: string; account_id: string; respuesta: unknown },
  news: RawNews | null,
  estilo: Estilo,
  nichos: string[],
  /** Hasta cuando puede trabajar esta pasada (hora en ms). */
  hasta: number
): Promise<boolean> {
  const kc = await kitActivo(job.account_id).catch(() => null)
  if (!kc || !piezasDelKit(kc).length) return false
  const respuesta = { ...((job.respuesta ?? {}) as Record<string, unknown>) }
  let previo = parseEstadoLibre(respuesta.diseno_libre)
  if (previo && previo.kit !== claveKit(kc)) previo = null
  if (previo && terminal(previo.paso)) return false

  const escrito = parseInstagramResponse(respuesta)
  const guion = guionLibreDe(escrito)
  // Las busquedas de foto las decide quien escribe; si no las dio, las de la noticia.
  const terminos = escrito.fotos.length ? escrito.fotos : terminosDeBusqueda(news, nichos, estilo.fotosLiterales)
  const supabase = supabaseAdmin()
  const guardar = async (estado: EstadoLibre, consumido: boolean) => {
    respuesta.diseno_libre = estado
    const { error } = await supabase
      .from("jobs_instagram")
      .update({ respuesta, consumed_at: consumido ? new Date().toISOString() : null })
      .eq("id", job.id)
    if (error) throw new Error(`No se pudo guardar el diseño: ${error.message}`)
  }

  // Ocupado y sin consumir mientras trabaja: si la pasada muere, la siguiente lo
  // retoma cuando vence la marca.
  const base: EstadoLibre = previo ?? {
    paso: "fotos",
    kit: claveKit(kc),
    fotos: [],
    rondas: 0,
    puntaje: null,
    intentos: 0,
    pasadas: 0,
    piezas: [],
    avisos: [],
  }
  base.pasadas += 1
  if (base.pasadas > MAX_PASADAS) {
    await guardar({ ...base, paso: "fallo", error: "El diseño libre no terminó en las pasadas que tiene.", ocupado_hasta: undefined }, true)
    job.respuesta = respuesta
    return false
  }
  await guardar({ ...base, ocupado_hasta: new Date(hasta + 30_000).toISOString() }, false)

  const estado = await avanzarDisenoLibre({
    accountId: job.account_id,
    kc,
    guion,
    estado: base,
    terminos,
    evitar: [],
    usarFotos: estilo.usarFotos,
    hasta,
  })
  estado.ocupado_hasta = undefined
  // Listo (o fallido) y con tiempo para dibujar: se queda en esta pasada.
  const dibujarYa = terminal(estado.paso) && hasta - Date.now() > 60_000
  await guardar(estado, dibujarYa)
  job.respuesta = respuesta
  return !dibujarYa
}
