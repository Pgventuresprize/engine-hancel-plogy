import type { Sistema, UsoClaude } from "../claude/messages"
import { conCriterio } from "../content/criterio"
import { armarRevision, frenosDe, pedidoDeCorreccion, type Correccion, type EstadoClaude, type Hallazgo, type Revision } from "../content/revisor"
import type { LinkedinJobInput } from "../content/types"
import { identidadEditorial } from "../marca/editorial"
import { perfilDe } from "../marca/perfil"
import { supabaseAdmin } from "../supabase-admin"
import { escribirRecurso, promptRecurso } from "./escritor"
import { avanzarFiguras, figurasDe, figurasTerminadas, nuevoEstadoFiguras, type EstadoFiguras } from "./figuras"
import type { FigurasGuardadas } from "./figuras-modelo"
import { armarRegistro, fuentesDelRecurso, type FuenteRecurso, type Registro } from "./investigacion"
import { limpiarPalabra, revisarRecurso, type ContextoRecurso, type Nota, type Recurso, type Veredicto } from "./modelo"
import { revisarRecursoConClaude } from "./revisor"

/**
 * El agente de recursos: escribe el reporte o la guia que promete el cierre de
 * una pieza, antes que la pieza.
 *
 * Va por etapas, una llamada grande por etapa, porque cada pasada del tick vive
 * 300 s y un reporte de Opus con su revision no cabe en una:
 *
 *   registro  → lee las fuentes a fondo y arma el registro de verificacion
 *   escribir  → la primera version (Opus) y su revision de codigo
 *   revisar   → el revisor con Claude; si queda algo y hay vueltas, a corregir
 *   corregir  → una version nueva con el pedido exacto, y otra vez a revisar
 *   figuras   → con el texto final, la portada, las figuras y la foto (figuras.ts),
 *               por pasos propios; si fallan, el recurso sale sin ellas
 *
 * Cada etapa deja en `pendiente` lo que lleva; la pasada siguiente sigue desde
 * ahi. Se queda siempre la version que menos frena.
 */

/** Lo que tarda la etapa mas larga (Opus escribiendo un reporte entero), con margen. */
export const DURACION_ETAPA_RECURSO = 240_000

/** Vueltas de correccion, como en las piezas: la segunda recoge lo que la primera dejo a medias. */
const MAX_VUELTAS = 2

/** Lo que el tick deja en `jobs_recurso.input`: la pieza de siempre y quien espera el recurso. */
export type InputRecurso = LinkedinJobInput & {
  /** Las piezas que se pidieron y esperan el recurso para escribirse. */
  esperan: { instagram: string[] | null; linkedin: boolean }
  /**
   * La palabra ya esta en una pieza escrita (al rehacer o corregir el recurso
   * desde la ficha): la nueva version no la puede cambiar.
   */
  palabra_fija?: string | null
}

type Etapa = "registro" | "escribir" | "revisar" | "corregir" | "figuras"

/** Lo que una etapa deja para la siguiente pasada. */
export type EnCurso = {
  etapa: Etapa
  fuentes?: FuenteRecurso[]
  pendientes?: { url: string; medio: string }[]
  imagen?: string | null
  registro?: Registro
  /** La version que se queda, con sus hallazgos (codigo y Claude). */
  version?: Recurso
  hallazgos?: Hallazgo[]
  claude?: EstadoClaude
  notas?: Nota[]
  veredicto?: Veredicto | null
  /** La correccion escrita que espera al revisor para ver si mejora. */
  candidata?: Recurso
  hallazgosCandidata?: Hallazgo[]
  correcciones: Correccion[]
  figuras?: EstadoFiguras
  /** Al rehacer solo las figuras desde la ficha: la revision del texto, que no cambia. */
  revisionFija?: RespuestaRecurso["revision"]
}

/** La fuente como queda guardada: sin el texto, que ya esta en news_sources. */
export type FuenteGuardada = Omit<FuenteRecurso, "contenido">

/** Lo que el agente deja en `jobs_recurso.respuesta` al terminar. */
export type RespuestaRecurso = {
  recurso: Recurso
  registro: Registro
  fuentes: FuenteGuardada[]
  pendientes: { url: string; medio: string }[]
  imagen: string | null
  revision: Revision & { notas: Nota[]; veredicto: Veredicto | null }
  figuras: FigurasGuardadas
}

export type ResultadoRecurso = { respuesta: RespuestaRecurso; uso: UsoClaude } | { aplazada: true; pendiente: EnCurso; uso: UsoClaude | null }

const sumar = (a: UsoClaude | null, b: UsoClaude | null): UsoClaude | null =>
  !a ? b : !b ? a : { entrada: a.entrada + b.entrada, salida: a.salida + b.salida, deCache: (a.deCache ?? 0) + (b.deCache ?? 0) }

/** La que menos frena y, a igualdad, la que menos avisa. */
function esMejor(nueva: Hallazgo[], anterior: Hallazgo[]): boolean {
  const fn = frenosDe(nueva).length
  const fa = frenosDe(anterior).length
  return fn < fa || (fn === fa && nueva.length <= anterior.length)
}

/** Las palabras que otras piezas tienen ocupadas ahora mismo. */
export async function palabrasOcupadas(accountId: string, salvoAngulo?: string): Promise<string[]> {
  let q = supabaseAdmin()
    .from("content_recursos")
    .select("palabra, content_angle_id, palabra_hasta")
    .eq("account_id", accountId)
    .neq("status", "descartado")
  if (salvoAngulo) q = q.neq("content_angle_id", salvoAngulo)
  const { data } = await q
  const ahora = Date.now()
  return [
    ...new Set(
      ((data ?? []) as { palabra: string; palabra_hasta: string | null }[])
        .filter((r) => !r.palabra_hasta || new Date(r.palabra_hasta).getTime() > ahora)
        .map((r) => limpiarPalabra(r.palabra))
        .filter(Boolean)
    ),
  ]
}

/** Contra que se revisa por codigo: las fuentes, el registro y las reglas de la marca. */
async function contextoDe(accountId: string, input: InputRecurso, fuentes: FuenteRecurso[], registro: Registro): Promise<ContextoRecurso> {
  const [perfil, ocupadas] = await Promise.all([perfilDe(accountId), palabrasOcupadas(accountId, input.angle.id)])
  return {
    material: [
      input.raw_news.title,
      input.raw_news.snippet,
      input.raw_news.full_content,
      ...fuentes.map((f) => f.contenido),
      ...registro.datos.map((d) => d.dato),
    ]
      .filter(Boolean)
      .join("\n"),
    fuentes: fuentes.map((f) => f.id),
    frasesProhibidas: perfil.frases_prohibidas,
    palabrasOcupadas: ocupadas,
  }
}

/** El CTA del angulo, con su descripcion: es lo que el recurso tiene que cumplir. */
async function ctaDe(accountId: string, input: InputRecurso) {
  const id = input.angle.clasificacion?.cta?.id
  if (!id) return null
  const cta = (await identidadEditorial(accountId)).ctas.find((c) => c.id === id)
  return cta ? { nombre: cta.name, descripcion: cta.description } : { nombre: input.angle.clasificacion!.cta!.nombre, descripcion: null }
}

/**
 * Una pasada del agente: hace las etapas que le caben y devuelve el recurso
 * terminado o lo que lleva. Sin `hasta` (el boton de la ficha), las hace todas.
 */
export async function generarRecurso(
  accountId: string,
  input: InputRecurso,
  model: string,
  system: Sistema,
  plazo: { hasta?: number; pendiente?: unknown } = {}
): Promise<ResultadoRecurso> {
  const cabe = () => !plazo.hasta || Date.now() + DURACION_ETAPA_RECURSO <= plazo.hasta
  let e: EnCurso = (plazo.pendiente as EnCurso | null) ?? { etapa: "registro", correcciones: [] }
  let uso: UsoClaude | null = null

  // El criterio lo decide su agente una sola vez y queda en el angulo: el
  // recurso, el post y el carrusel firman la misma lectura.
  const decidido = await conCriterio(accountId, input)
  input = { ...input, angle: decidido.input.angle }
  uso = sumar(uso, decidido.uso)

  const aplazar = (): ResultadoRecurso => ({ aplazada: true, pendiente: e, uso })
  // Con el texto final, siguen las figuras (que miden su propio tiempo por paso).
  const aFiguras = (x: EnCurso): EnCurso => ({ ...x, etapa: "figuras", figuras: nuevoEstadoFiguras(accountId, input.angle.id) })

  while (true) {
    if (e.etapa === "figuras") {
      const r = await avanzarFiguras({
        material: {
          accountId,
          recurso: e.version!,
          registro: e.registro!,
          fuentes: (e.fuentes ?? []).map((f) => ({ id: f.id, medio: f.medio, titulo: f.titulo, fecha: f.fecha })),
        },
        estado: e.figuras ?? nuevoEstadoFiguras(accountId, input.angle.id),
        hasta: plazo.hasta,
      })
      uso = sumar(uso, r.uso)
      e = { ...e, figuras: r.estado }
      return figurasTerminadas(r.estado) ? terminar(e, uso) : aplazar()
    }

    if (!cabe()) return aplazar()

    if (e.etapa === "registro") {
      const { fuentes, pendientes, imagen } = await fuentesDelRecurso(accountId, input.raw_news.id)
      if (fuentes.length === 0) throw new Error("La noticia no tiene fuentes que se dejen leer: no hay de dónde escribir el recurso.")
      const r = await armarRegistro(accountId, { title: input.raw_news.title, idioma: input.variables.idioma }, fuentes)
      uso = sumar(uso, r.uso)
      e = { ...e, etapa: "escribir", fuentes, pendientes, imagen, registro: r.registro }
      continue
    }

    // Una correccion pedida desde la ficha llega sin el texto de las fuentes
    // (no se guarda con el recurso): se vuelven a leer.
    if (!e.fuentes) {
      const leidas = await fuentesDelRecurso(accountId, input.raw_news.id)
      e = { ...e, fuentes: leidas.fuentes, pendientes: leidas.pendientes, imagen: leidas.imagen }
    }
    const fuentes = e.fuentes ?? []
    const registro = e.registro!
    const ctx = await contextoDe(accountId, input, fuentes, registro)
    const base = promptRecurso({
      input,
      registro,
      fuentes,
      pendientes: e.pendientes ?? [],
      cta: await ctaDe(accountId, input),
      palabrasOcupadas: ctx.palabrasOcupadas,
      palabraFija: input.palabra_fija ?? null,
    })
    const conPalabra = (r: Recurso): Recurso => (input.palabra_fija ? { ...r, palabra: input.palabra_fija } : r)

    if (e.etapa === "escribir") {
      const r = await escribirRecurso({ accountId, model, system, prompt: base, paso: "recurso", hasta: plazo.hasta })
      uso = sumar(uso, r.uso)
      if (r.recurso.status === "material_insuficiente") {
        throw new Error(`Las fuentes no dan para un recurso: ${r.recurso.faltantes.join("; ") || "sin detalle"}.`)
      }
      const version = conPalabra(r.recurso)
      e = { ...e, etapa: "revisar", version, hallazgos: revisarRecurso(version, ctx) }
      continue
    }

    if (e.etapa === "revisar") {
      // Lo que se revisa es la candidata si la hay (una correccion), o la primera version.
      const aRevisar = e.candidata ?? e.version!
      const deCodigo = e.candidata ? (e.hallazgosCandidata ?? []) : (e.hallazgos ?? [])
      const rc = await revisarRecursoConClaude({ accountId, recurso: aRevisar, input, registro, fuentes, hasta: plazo.hasta })
      uso = sumar(uso, rc?.uso ?? null)
      const hallazgos = [...deCodigo, ...(rc?.hallazgos ?? [])]
      const revisada = { claude: rc?.estado, notas: rc?.notas ?? [], veredicto: rc?.veredicto ?? null }

      if (e.candidata) {
        // Una correccion que el revisor no pudo leer no se sabe si mejoro: no se queda.
        const gana = rc?.estado.estado !== "fallo" && esMejor(hallazgos, e.hallazgos ?? [])
        const correccion: Correccion = {
          fecha: new Date().toISOString(),
          origen: "automatica",
          pedido: e.hallazgos ?? [],
          frenosDespues: frenosDe(gana ? hallazgos : (e.hallazgos ?? [])).length,
        }
        e = {
          ...e,
          ...(gana ? { version: aRevisar, hallazgos, ...revisada } : {}),
          candidata: undefined,
          hallazgosCandidata: undefined,
          correcciones: [...e.correcciones, correccion],
        }
        if (!gana) {
          e = aFiguras(e)
          continue
        }
      } else {
        e = { ...e, hallazgos, ...revisada }
      }
      if ((e.hallazgos ?? []).length === 0 || e.correcciones.length >= MAX_VUELTAS) {
        e = aFiguras(e)
        continue
      }
      e = { ...e, etapa: "corregir" }
      continue
    }

    // corregir: una version nueva con el pedido exacto, que despues se revisa.
    const prompt = `${base}

TU VERSIÓN ANTERIOR
${JSON.stringify(e.version)}

${pedidoDeCorreccion(e.hallazgos ?? [])}`
    const r = await escribirRecurso({ accountId, model, system, prompt, paso: "recurso-correccion", hasta: plazo.hasta })
    uso = sumar(uso, r.uso)
    if (r.recurso.status !== "ok") {
      e = aFiguras(e)
      continue
    }
    const candidata = conPalabra(r.recurso)
    e = { ...e, etapa: "revisar", candidata, hallazgosCandidata: revisarRecurso(candidata, ctx) }
  }
}

function terminar(e: EnCurso, uso: UsoClaude | null): ResultadoRecurso {
  const revision = armarRevision(e.hallazgos ?? [], [], e.correcciones, e.claude)
  return {
    respuesta: {
      recurso: e.version!,
      registro: e.registro!,
      fuentes: (e.fuentes ?? []).map(({ contenido: _contenido, ...f }) => {
        void _contenido
        return f
      }),
      pendientes: e.pendientes ?? [],
      imagen: e.imagen ?? null,
      revision: e.revisionFija ?? { ...revision, notas: e.notas ?? [], veredicto: e.veredicto ?? null },
      figuras: figurasDe(e.figuras),
    },
    uso: uso ?? { entrada: 0, salida: 0 },
  }
}
