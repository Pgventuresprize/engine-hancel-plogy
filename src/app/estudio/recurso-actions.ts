"use server"

import { revalidatePath } from "next/cache"

import { buildLinkedinInput, getGenerationConfig } from "@/engine/content/jobs"
import { runContentTick } from "@/engine/content/tick"
import type { Correccion, Hallazgo } from "@/engine/content/revisor"
import type { ContentAngle } from "@/engine/content/types"
import type { EnCurso, FuenteGuardada, RespuestaRecurso } from "@/engine/recursos/agente"
import type { Registro } from "@/engine/recursos/investigacion"
import { etapaLegible, parseFigurasGuardadas, type FigurasGuardadas } from "@/engine/recursos/figuras-modelo"
import { mensajeConEnlace, type Dm, type Recurso } from "@/engine/recursos/modelo"
import { nombreDeMarca, temaDeMarca } from "@/engine/recursos/pagina"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { conexionWeb } from "@/engine/web/webhook"
import { paginaDeFila, procesarWebRecursos } from "@/engine/web/recursos"
import { idDeCuentaActual } from "@/lib/accounts"
import type { RawNews } from "@/lib/types"

/**
 * Las acciones de la pestaña Recurso de la ficha: leerlo, aprobarlo (y con eso
 * enviarlo al portal), retirarlo, rehacerlo y mandarlo a corregir.
 *
 * Rehacer y corregir no corren aqui: un recurso son varias llamadas a Opus y
 * no caben en una accion. Se encolan como un trabajo mas del agente de
 * recursos y la pasada que se lanza al final hace la primera etapa; las demas
 * llegan con las pasadas siguientes.
 */

type Resultado = { ok: true; warning?: string } | { ok: false; error: string }

export type RecursoDeLaFicha = {
  id: string
  status: "listo" | "aprobado" | "descartado"
  tipo: "reporte" | "guia"
  palabra: string
  version: number
  wordCount: number | null
  payload: Recurso
  dm: Dm | null
  /** El mensaje 2 ya con su enlace y su seguimiento, si el recurso tiene URL. */
  mensaje2: string | null
  registro: Registro | null
  revision: RespuestaRecurso["revision"] | null
  fuentes: FuenteGuardada[]
  pendientes: { url: string; medio: string }[]
  figuras: FigurasGuardadas
  web: { status: string | null; url: string | null; error: string | null; publicadaAt: string | null }
  aprobadoAt: string | null
  creado: string
  actualizado: string
}

export type EstadoRecursoFicha = {
  recurso: RecursoDeLaFicha | null
  /** Un trabajo del agente abierto: la etapa en que va, o "en cola". */
  enCurso: { etapa: string; desde: string } | null
  /** El ultimo trabajo fallido, si es lo ultimo que paso. */
  error: string | null
  portalConectado: boolean
}

export async function leerRecurso(angleId: string): Promise<{ ok: true; estado: EstadoRecursoFicha } | { ok: false; error: string }> {
  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()
    const [{ data: fila }, { data: jobs }, conexion] = await Promise.all([
      supabase.from("content_recursos").select("*").eq("content_angle_id", angleId).eq("account_id", accountId).maybeSingle(),
      supabase
        .from("jobs_recurso")
        .select("status, respuesta, error, created_at, consumed_at")
        .eq("content_angle_id", angleId)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(1),
      conexionWeb(accountId),
    ])
    const ultimo = ((jobs ?? []) as { status: string; respuesta: { pendiente?: EnCurso } | null; error: string | null; created_at: string; consumed_at: string | null }[])[0]
    const abierto = ultimo && !ultimo.consumed_at && ultimo.status !== "failed" ? ultimo : null
    const f = fila as Record<string, unknown> | null

    let recurso: RecursoDeLaFicha | null = null
    if (f) {
      const payload = f.payload as Recurso
      const dm = (f.dm as Dm | null) ?? payload.dm ?? null
      const fuentes = (f.fuentes ?? {}) as { leidas?: FuenteGuardada[]; pendientes?: { url: string; medio: string }[] }
      const webUrl = (f.web_url as string | null) ?? null
      recurso = {
        id: String(f.id),
        status: f.status as RecursoDeLaFicha["status"],
        tipo: f.tipo as RecursoDeLaFicha["tipo"],
        palabra: String(f.palabra),
        version: Number(f.version),
        wordCount: (f.word_count as number | null) ?? null,
        payload,
        dm,
        mensaje2: dm && webUrl ? mensajeConEnlace(dm, webUrl, angleId, String(f.palabra)) : null,
        registro: (f.registro as Registro | null) ?? null,
        revision: (f.revision as RespuestaRecurso["revision"] | null) ?? null,
        fuentes: fuentes.leidas ?? [],
        pendientes: fuentes.pendientes ?? [],
        figuras: parseFigurasGuardadas(f.figuras),
        web: {
          status: (f.web_status as string | null) ?? null,
          url: webUrl,
          error: (f.web_error as string | null) ?? null,
          publicadaAt: (f.web_publicada_at as string | null) ?? null,
        },
        aprobadoAt: (f.aprobado_at as string | null) ?? null,
        creado: String(f.created_at),
        actualizado: String(f.updated_at),
      }
    }

    return {
      ok: true,
      estado: {
        recurso,
        enCurso: abierto ? { etapa: etapaLegible(abierto.respuesta?.pendiente, abierto.status), desde: abierto.created_at } : null,
        error: ultimo?.status === "failed" ? (ultimo.error ?? "El agente falló sin decir por qué.") : null,
        portalConectado: conexion !== null,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el recurso." }
  }
}

async function suyo(recursoId: string) {
  const { data } = await supabaseAdmin()
    .from("content_recursos")
    .select("id, account_id, content_angle_id, status, web_version")
    .eq("id", recursoId)
    .eq("account_id", await idDeCuentaActual())
    .maybeSingle()
  if (!data) throw new Error("Ese recurso no existe.")
  return data as { id: string; account_id: string; content_angle_id: string; status: string; web_version: number }
}

/** Aprobarlo es decir "esto sale": se marca para la web y se intenta enviar ya. */
export async function aprobarRecurso(recursoId: string): Promise<Resultado> {
  try {
    const r = await suyo(recursoId)
    const conectado = (await conexionWeb(r.account_id)) !== null
    await supabaseAdmin()
      .from("content_recursos")
      .update({
        status: "aprobado",
        aprobado_at: new Date().toISOString(),
        ...(conectado ? { web_status: "pendiente", web_intentos: 0, web_error: null, web_proximo_at: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id)
    revalidatePath("/")
    revalidatePath("/recursos")
    if (!conectado) {
      return { ok: true, warning: "Aprobado, pero la marca no tiene portal conectado: conéctalo en Configuración > Conexiones para que salga a la web y el DM tenga enlace." }
    }
    const web = await procesarWebRecursos(r.account_id)
    if (web.errores.length) return { ok: true, warning: `Aprobado. El portal no lo recibió todavía: ${web.errores[0]} Se reintenta solo.` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo aprobar el recurso." }
  }
}

/** Lo descarta y, si ya estaba en la web, pide al portal que lo retire. */
export async function retirarRecurso(recursoId: string): Promise<Resultado> {
  try {
    const r = await suyo(recursoId)
    await supabaseAdmin()
      .from("content_recursos")
      .update({
        status: "descartado",
        ...(r.web_version > 0 ? { web_status: "pendiente", web_intentos: 0, web_error: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id)
    if (r.web_version > 0) await procesarWebRecursos(r.account_id)
    revalidatePath("/")
    revalidatePath("/recursos")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo retirar el recurso." }
  }
}

/**
 * Rehace el recurso del angulo desde las fuentes, o lo manda a corregir con lo
 * que encontro el revisor (o con lo que pide la persona). Si ya hay una pieza
 * escrita, la palabra se mantiene: el carrusel ya la pide.
 */
export async function rehacerRecurso(angleId: string, modo: "rehacer" | "corregir", pedido = ""): Promise<Resultado> {
  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()
    const [{ data: angulo }, { data: fila }, { data: abierto }, { count: piezas }] = await Promise.all([
      supabase.from("content_angles").select("*").eq("id", angleId).eq("account_id", accountId).maybeSingle(),
      supabase.from("content_recursos").select("palabra, payload, registro, revision").eq("content_angle_id", angleId).maybeSingle(),
      supabase.from("jobs_recurso").select("id").eq("content_angle_id", angleId).is("consumed_at", null).maybeSingle(),
      supabase.from("content_pieces").select("id", { count: "exact", head: true }).eq("content_angle_id", angleId),
    ])
    if (!angulo) return { ok: false, error: "Ese ángulo no existe." }
    if (abierto) return { ok: false, error: "El agente ya está trabajando en este recurso." }
    const angle = angulo as ContentAngle
    const previo = fila as { palabra: string; payload: Recurso; registro: Registro | null; revision: RespuestaRecurso["revision"] | null } | null
    if (modo === "corregir" && (!previo?.registro || !previo.payload)) return { ok: false, error: "No hay recurso que corregir: rehazlo." }

    const { data: noticia } = await supabase.from("raw_news").select("*").eq("id", angle.raw_news_id).single()
    const config = await getGenerationConfig(accountId)
    const input = {
      ...buildLinkedinInput(angle, noticia as RawNews, config.variables),
      esperan: { instagram: null, linkedin: false },
      palabra_fija: (piezas ?? 0) > 0 && previo ? previo.palabra : null,
    }

    let respuesta: { pendiente: EnCurso } | null = null
    if (modo === "corregir" && previo?.registro) {
      const deLaPersona: Hallazgo[] = pedido.trim()
        ? [{ regla: "falta_contexto", nivel: "frena", donde: "recurso", detalle: `Lo pide quien lo revisó: ${pedido.trim()}`, pide: pedido.trim() }]
        : []
      const hallazgos = [...deLaPersona, ...(previo.revision?.hallazgos ?? [])]
      if (hallazgos.length === 0) return { ok: false, error: "El revisor no encontró nada: escribe qué quieres que cambie." }
      respuesta = {
        pendiente: {
          etapa: "corregir",
          registro: previo.registro,
          version: previo.payload,
          hallazgos,
          notas: previo.revision?.notas ?? [],
          veredicto: previo.revision?.veredicto ?? null,
          claude: previo.revision?.claude,
          // La correccion pedida a mano es una vuelta mas, aunque ya se hayan dado dos solas.
          correcciones: [] as Correccion[],
        },
      }
    }

    const { error } = await supabase.from("jobs_recurso").insert({
      account_id: accountId,
      content_angle_id: angleId,
      input,
      ...(respuesta ? { respuesta } : {}),
    })
    if (error) throw new Error(error.message)

    await runContentTick({ trigger: "manual", forzar: ["recursos"], presupuesto: 1 })
    revalidatePath("/")
    revalidatePath("/recursos")
    return { ok: true, warning: "El agente lo está escribiendo por etapas: tarda unos minutos. Vuelve a abrir la pestaña para ver cómo va." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo encolar el recurso." }
  }
}

/** La pagina web del recurso tal como sale al portal: con el estilo, la portada y las figuras. */
export async function paginaDelRecurso(recursoId: string): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  try {
    const accountId = await idDeCuentaActual()
    const { data } = await supabaseAdmin().from("content_recursos").select("*").eq("id", recursoId).eq("account_id", accountId).maybeSingle()
    if (!data) return { ok: false, error: "Ese recurso no existe." }
    const [tema, marca] = await Promise.all([temaDeMarca(accountId), nombreDeMarca(accountId)])
    const fila = data as Parameters<typeof paginaDeFila>[0] & { web_url: string | null }
    return { ok: true, html: paginaDeFila(fila, tema, marca, fila.web_url) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo armar la página." }
  }
}

/**
 * Rehace solo la portada, las figuras y la foto, con el mismo texto. Sale una
 * version nueva que hay que volver a aprobar: lo que se aprueba es el recurso
 * entero, imagenes incluidas.
 */
export async function rehacerFiguras(angleId: string): Promise<Resultado> {
  try {
    const accountId = await idDeCuentaActual()
    const supabase = supabaseAdmin()
    const [{ data: angulo }, { data: fila }, { data: abierto }] = await Promise.all([
      supabase.from("content_angles").select("*").eq("id", angleId).eq("account_id", accountId).maybeSingle(),
      supabase.from("content_recursos").select("palabra, payload, registro, revision, fuentes").eq("content_angle_id", angleId).maybeSingle(),
      supabase.from("jobs_recurso").select("id").eq("content_angle_id", angleId).is("consumed_at", null).maybeSingle(),
    ])
    if (!angulo) return { ok: false, error: "Ese ángulo no existe." }
    if (abierto) return { ok: false, error: "El agente ya está trabajando en este recurso." }
    const previo = fila as {
      palabra: string
      payload: Recurso
      registro: Registro | null
      revision: RespuestaRecurso["revision"] | null
      fuentes: { leidas?: FuenteGuardada[]; pendientes?: { url: string; medio: string }[]; imagen?: string | null } | null
    } | null
    if (!previo?.registro || !previo.payload || !previo.revision) return { ok: false, error: "No hay recurso al que hacerle figuras: rehazlo entero." }
    const angle = angulo as ContentAngle
    const { data: noticia } = await supabase.from("raw_news").select("*").eq("id", angle.raw_news_id).single()
    const config = await getGenerationConfig(accountId)
    const pendiente: EnCurso = {
      etapa: "figuras",
      registro: previo.registro,
      version: previo.payload,
      // Las fuentes guardadas no traen su texto: las figuras no lo necesitan.
      fuentes: (previo.fuentes?.leidas ?? []).map((f) => ({ ...f, contenido: "" })),
      pendientes: previo.fuentes?.pendientes ?? [],
      imagen: previo.fuentes?.imagen ?? null,
      revisionFija: previo.revision,
      correcciones: [],
    }
    const { error } = await supabase.from("jobs_recurso").insert({
      account_id: accountId,
      content_angle_id: angleId,
      input: { ...buildLinkedinInput(angle, noticia as RawNews, config.variables), esperan: { instagram: null, linkedin: false }, palabra_fija: previo.palabra },
      respuesta: { pendiente },
    })
    if (error) throw new Error(error.message)
    await runContentTick({ trigger: "manual", forzar: ["recursos"], presupuesto: 1 })
    revalidatePath("/")
    revalidatePath("/recursos")
    return { ok: true, warning: "El agente está diseñando las figuras por pasos: tarda unos minutos. Vuelve a abrir la pestaña para ver cómo va." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo encolar las figuras." }
  }
}
