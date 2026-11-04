import { decidirProgramada, VENTANA_MS, type PiezaProgramada } from "../calendario/decidir"
import type { ContentLog } from "../content/log"
import { supabaseAdmin } from "../supabase-admin"
import { publishPiece } from "./publish-piece"

/**
 * Publica lo del calendario que llego a su hora.
 *
 * Lo corre su propio tick cada cinco minutos. Una pieza programada es una orden
 * explicita de una persona, asi que sale aunque el agente de publicacion este en
 * manual; ese modo gobierna solo las tandas automaticas, que no tocan lo que
 * tiene fecha.
 *
 * Una pieza por red en cada pasada: varias a la misma hora salen de a una, cinco
 * minutos entre ellas. Solo si el interruptor de la cuenta esta encendido; apagado
 * dice que publicaria (`tocaria`) sin escribir nada, y eso es el simulacro.
 */

export const REDES_CALENDARIO = ["linkedin", "instagram"] as const

/** Lo que tarda en morir una pasada (300 s) y un margen: despues no hay nadie publicando. */
const COLGADA_MS = 6 * 60_000

/** LinkedIn tarda segundos; un carrusel de Instagram, minutos. */
const TIEMPO_PARA_EMPEZAR_MS: Record<(typeof REDES_CALENDARIO)[number], number> = {
  linkedin: 200_000,
  instagram: 60_000,
}

export type ResumenProgramadas = {
  activo: boolean
  tocaria: { id: string; network: string; programada_para: string }[]
  publicadas: number
  fallidas: number
  colgadas: number
  errores: string[]
}

type Fila = PiezaProgramada & { publish_error: string | null }

/** Encendido solo con la fila y el interruptor en true: sin dato, no publica. */
async function publicacionActiva(accountId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("calendario_ajustes").select("publicar_activo").eq("account_id", accountId).maybeSingle()
  if (error) throw new Error(`No se pudo leer el interruptor del calendario: ${error.message}`)
  return (data as { publicar_activo: boolean } | null)?.publicar_activo === true
}

/**
 * Las que se quedaron en 'publishing' con la pasada ya muerta. No se sabe si
 * salieron: el proceso pudo morir antes o despues de publicar, asi que no se
 * reintentan. Van a Revisar con su estado de antes.
 */
async function barrerColgadas(accountId: string, now: Date): Promise<number> {
  const limite = new Date(now.getTime() - COLGADA_MS).toISOString()
  const soltar = (status: "approved" | "generated") =>
    supabaseAdmin()
      .from("content_pieces")
      .update({
        status,
        published_at: null,
        programada_revisar: true,
        publish_error: "Se interrumpió mientras publicaba: puede haber salido, míralo en la red.",
      })
      .eq("account_id", accountId)
      .eq("status", "publishing")
      .not("programada_para", "is", null)
      .lt("published_at", limite)

  const [aprobadas, sinAprobar] = await Promise.all([
    soltar("approved").not("approved_at", "is", null).select("id"),
    soltar("generated").is("approved_at", null).select("id"),
  ])
  if (aprobadas.error) throw new Error(aprobadas.error.message)
  if (sinAprobar.error) throw new Error(sinAprobar.error.message)
  return (aprobadas.data?.length ?? 0) + (sinAprobar.data?.length ?? 0)
}

/** Las de la ventana: lo que aun puede salir hoy a su hora. */
async function vencidasEnVentana(accountId: string, now: Date): Promise<Fila[]> {
  const { data, error } = await supabaseAdmin()
    .from("content_pieces")
    .select("id, network, status, carril, revision, programada_para, programada_intentos, programada_revisar, contenido_cambiado_at, publish_error")
    .eq("account_id", accountId)
    .in("network", [...REDES_CALENDARIO])
    .in("status", ["generated", "approved"])
    .is("published_at", null)
    .eq("programada_revisar", false)
    .lte("programada_para", now.toISOString())
    .gte("programada_para", new Date(now.getTime() - VENTANA_MS).toISOString())
    .order("programada_para")
    .limit(100)

  if (error) throw new Error(`No se pudieron leer las programadas: ${error.message}`)
  return (data ?? []) as Fila[]
}

/** Deja el motivo a la vista, salvo que la pieza haya cambiado de hora mientras tanto. */
async function anotar(p: Fila, motivo: string) {
  if (p.publish_error === motivo) return
  await supabaseAdmin()
    .from("content_pieces")
    .update({ publish_error: motivo.slice(0, 1000) })
    .eq("id", p.id)
    .eq("programada_para", p.programada_para)
    .is("published_at", null)
}

/** Lo que paso la ventana sin salir queda en rojo una sola vez, para recolocarlo. */
async function marcarVencidas(accountId: string, now: Date) {
  const { error } = await supabaseAdmin()
    .from("content_pieces")
    .update({ publish_error: "No salió a su hora: elige otra fecha o publícala a mano." })
    .eq("account_id", accountId)
    .in("network", [...REDES_CALENDARIO])
    .in("status", ["generated", "approved"])
    .is("published_at", null)
    .is("publish_error", null)
    .eq("programada_revisar", false)
    .lt("programada_para", new Date(now.getTime() - VENTANA_MS).toISOString())
  if (error) throw new Error(`No se pudieron marcar las vencidas: ${error.message}`)
}

export async function publicarProgramadas(
  accountId: string,
  opciones: { now?: Date; inicio?: number; log?: ContentLog } = {}
): Promise<ResumenProgramadas> {
  const now = opciones.now ?? new Date()
  const inicio = opciones.inicio ?? Date.now()

  // Va aunque este apagado: no publica nada y deja a la vista lo que quedo a medias.
  const colgadas = await barrerColgadas(accountId, now)
  const activo = await publicacionActiva(accountId)
  const filas = await vencidasEnVentana(accountId, now)
  const decididas = filas.map((p) => ({ p, decision: decidirProgramada(p, now) }))
  const listas = decididas.filter((d) => d.decision.accion === "publicar").map((d) => d.p)

  const resumen: ResumenProgramadas = {
    activo,
    tocaria: listas.map((p) => ({ id: p.id, network: p.network, programada_para: p.programada_para })),
    publicadas: 0,
    fallidas: 0,
    colgadas,
    errores: [],
  }
  if (!activo) return resumen

  await marcarVencidas(accountId, now)
  for (const { p, decision } of decididas) {
    if (decision.accion === "frenada" || decision.accion === "agotada" || decision.accion === "vencida") {
      await anotar(p, decision.motivo)
    }
  }

  for (const red of REDES_CALENDARIO) {
    const pieza = listas.find((p) => p.network === red)
    if (!pieza) continue
    // Mejor dejarla para la proxima que empezar algo que el limite de la funcion
    // cortaria a la mitad: un corte en pleno publicar acaba en Revisar.
    if (Date.now() - inicio > TIEMPO_PARA_EMPEZAR_MS[red]) continue

    const resultado = await publishPiece(pieza.id, {
      guarda: {
        programadaPara: pieza.programada_para,
        intentos: pieza.programada_intentos,
        contenidoCambiadoAt: pieza.contenido_cambiado_at,
      },
    })

    if (resultado.ok) {
      resumen.publicadas++
      opciones.log?.emit("content.piece.published", `Pieza programada publicada en ${red}`, {
        accountId,
        pieceId: pieza.id,
        urn: resultado.urn,
        programadaPara: pieza.programada_para,
      })
      continue
    }
    // Alguien la movio, la freno o la edito justo ahora: gano la persona, no es un fallo.
    if (resultado.codigo === "reclamo_perdido") continue
    // No llego a reclamarse, asi que publishPiece no escribio nada. Se reintenta
    // mientras dure la ventana: si el recurso sale a tiempo, la pieza tambien.
    if (resultado.codigo === "recurso") await anotar(pieza, resultado.error)

    resumen.fallidas++
    resumen.errores.push(resultado.error)
    opciones.log?.emit("content.publish.failed", "No se pudo publicar una pieza programada", {
      accountId,
      pieceId: pieza.id,
      error: resultado.error,
      codigo: resultado.codigo ?? null,
    })
  }

  return resumen
}
