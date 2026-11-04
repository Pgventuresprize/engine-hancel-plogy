import "server-only"

import { redesActivas } from "@/engine/agents/redes"
import { MAX_INTENTOS, sinFreno, VENTANA_MS } from "@/engine/calendario/decidir"
import { claveHueco, inicioDeMes, lunesDe, parseHorarios, sumarDias } from "@/engine/calendario/reparto"
import { REDES_CALENDARIO } from "@/engine/publish/programadas"
import { dayIn, getSettings, partsIn } from "@/engine/schedule"
import { instanteLocal } from "@/engine/studio/publicar"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"
import type { Ahora, DatosCalendario, EstadoPost, PostCalendario, RedCalendario, VistaCalendario } from "@/lib/calendario-tipos"

/**
 * La bandeja y lo que cae en las fechas visibles.
 *
 * Trae del payload solo lo que se pinta: el guion entero de un carrusel pesa
 * bastante mas que lo que necesita esta pantalla.
 */

/** Tope de la bandeja: el conteo se calcula aparte y dice cuantas hay de verdad. */
const MAX_BANDEJA = 200

const CAMPOS =
  "id, raw_news_id, network, status, carril, approved_at, published_at, publish_error, programada_para, programada_intentos, programada_revisar, job_instagram_id, job_linkedin_id, revision, imagenes:payload->images, caption:payload->>caption, hashtags:payload->hashtags, hook:payload->>hook, cuerpo:payload->>body"

type Fila = {
  id: string
  raw_news_id: string | null
  network: RedCalendario
  status: string
  carril: string | null
  approved_at: string | null
  published_at: string | null
  publish_error: string | null
  programada_para: string | null
  programada_intentos: number
  programada_revisar: boolean
  job_instagram_id: string | null
  job_linkedin_id: string | null
  revision: { frena?: boolean; hallazgos?: { detalle?: string }[] } | null
  imagenes: string[] | null
  caption: string | null
  hashtags: string[] | null
  hook: string | null
  cuerpo: string | null
}

type Hermana = Pick<Fila, "id" | "raw_news_id" | "network" | "status" | "carril" | "programada_para"> & { frena: boolean | null }

/** La primera frase, que es lo que se reconoce de un vistazo en una tarjeta pequeña. */
function primeraFrase(texto: string | null): string {
  const limpio = String(texto ?? "").trim().split(/\n/)[0].trim()
  const frase = (limpio.match(/^(.{20,}?[.:?!])(\s|$)/)?.[1] ?? limpio).replace(/[.:]$/, "")
  return frase.length > 92 ? `${frase.slice(0, 90).trimEnd()}…` : frase
}

const textoDelPost = (f: Fila) =>
  [f.network === "linkedin" ? [f.hook, f.cuerpo].filter(Boolean).join("\n\n") : f.caption, (f.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n")

/** El dia y la hora de un instante en la zona de la cuenta. */
export function enZona(iso: string, zona: string): Ahora {
  const fecha = new Date(iso)
  const { hour, minute } = partsIn(zona, fecha)
  return { dia: dayIn(zona, fecha), hora: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` }
}

export function estadoDe(
  f: Pick<Fila, "status" | "programada_para" | "programada_intentos" | "programada_revisar" | "publish_error">,
  now: Date
): EstadoPost {
  if (f.status === "published") return "publicada"
  if (f.status === "publishing") return "publicando"
  if (f.programada_revisar) return "revisar"
  if (!f.programada_para) return "bandeja"
  const hora = new Date(f.programada_para).getTime()
  if (hora > now.getTime()) return "programada"
  return f.publish_error || f.programada_intentos >= MAX_INTENTOS || now.getTime() - hora > VENTANA_MS ? "fallida" : "programada"
}

/** Las piezas que prometen un recurso que aun no esta en la web, de una sola vez. */
async function conRecursoPendiente(filas: Fila[]): Promise<Set<string>> {
  const supabase = supabaseAdmin()
  const leer = async (tabla: string, ids: string[]) => {
    if (ids.length === 0) return new Map<string, string>()
    const { data } = await supabase.from(tabla).select("id, recurso:input->recurso->>id").in("id", ids)
    return new Map(((data ?? []) as unknown as { id: string; recurso: string | null }[]).flatMap((j) => (j.recurso ? [[j.id, j.recurso] as const] : [])))
  }
  const ig = await leer("jobs_instagram", filas.flatMap((f) => (f.job_instagram_id ? [f.job_instagram_id] : [])))
  const li = await leer("jobs_linkedin", filas.flatMap((f) => (!f.job_instagram_id && f.job_linkedin_id ? [f.job_linkedin_id] : [])))
  const recursoDe = (f: Fila) => (f.job_instagram_id ? ig.get(f.job_instagram_id) : f.job_linkedin_id ? li.get(f.job_linkedin_id) : undefined)

  const ids = [...new Set(filas.flatMap((f) => recursoDe(f) ?? []))]
  if (ids.length === 0) return new Set()
  const { data } = await supabase.from("content_recursos").select("id, web_url").in("id", ids)
  const listos = new Set(((data ?? []) as { id: string; web_url: string | null }[]).filter((r) => r.web_url).map((r) => r.id))
  return new Set(filas.filter((f) => recursoDe(f) && !listos.has(recursoDe(f) as string)).map((f) => f.id))
}

export async function getCalendario(pedido: { vista: VistaCalendario; fecha: string | null }): Promise<DatosCalendario> {
  const accountId = await idDeCuentaActual()
  const supabase = supabaseAdmin()
  const { timezone } = await getSettings(accountId)
  const now = new Date()

  const local = (iso: string) => enZona(iso, timezone)
  const ahora: Ahora = local(now.toISOString())

  const base = pedido.fecha && /^\d{4}-\d{2}-\d{2}$/.test(pedido.fecha) ? pedido.fecha : ahora.dia
  const fecha = pedido.vista === "mes" ? inicioDeMes(base) : lunesDe(base)
  // El mes se pinta en semanas completas: hasta seis, contando los dias de los vecinos.
  const primerDia = pedido.vista === "mes" ? lunesDe(fecha) : fecha
  const desde = instanteLocal(primerDia, "00:00", timezone).toISOString()
  const hasta = instanteLocal(sumarDias(primerDia, pedido.vista === "mes" ? 42 : 7), "00:00", timezone).toISOString()

  const piezas = () => supabase.from("content_pieces").select(CAMPOS).eq("account_id", accountId).in("network", [...REDES_CALENDARIO])

  const [bandeja, conteo, enFechas, enRevisar, hermanas, ajustes, futuras, conectadas] = await Promise.all([
    piezas().in("status", ["generated", "approved"]).is("published_at", null).is("programada_para", null).order("created_at", { ascending: false }).limit(MAX_BANDEJA),
    supabase
      .from("content_pieces")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .in("network", [...REDES_CALENDARIO])
      .in("status", ["generated", "approved"])
      .is("published_at", null)
      .is("programada_para", null),
    piezas()
      .neq("status", "rejected")
      .or(`and(programada_para.gte.${desde},programada_para.lt.${hasta}),and(published_at.gte.${desde},published_at.lt.${hasta})`),
    // Lo pendiente de decidir se ve siempre, aunque quede fuera de la semana visible.
    piezas().eq("programada_revisar", true).neq("status", "rejected"),
    supabase
      .from("content_pieces")
      .select("id, raw_news_id, network, status, carril, programada_para, frena:revision->frena")
      .eq("account_id", accountId)
      .in("network", [...REDES_CALENDARIO])
      .neq("status", "rejected")
      .not("raw_news_id", "is", null)
      .limit(2000),
    supabase.from("calendario_ajustes").select("publicar_activo, horarios").eq("account_id", accountId).maybeSingle(),
    // Repartir mira semanas que no estan en pantalla.
    supabase
      .from("content_pieces")
      .select("network, programada_para")
      .eq("account_id", accountId)
      .in("network", [...REDES_CALENDARIO])
      .neq("status", "rejected")
      .is("published_at", null)
      .gt("programada_para", now.toISOString())
      .limit(2000),
    redesActivas(accountId),
  ])

  for (const r of [bandeja, conteo, enFechas, enRevisar, hermanas, ajustes, futuras]) {
    if (r.error) throw new Error(`No se pudo cargar el calendario: ${r.error.message}`)
  }

  const porId = new Map<string, Fila>()
  for (const f of [...(bandeja.data ?? []), ...(enFechas.data ?? []), ...(enRevisar.data ?? [])] as unknown as Fila[]) porId.set(f.id, f)
  const filas = [...porId.values()]

  const porNoticia = new Map<string, Hermana[]>()
  for (const h of (hermanas.data ?? []) as unknown as Hermana[]) {
    const lista = porNoticia.get(h.raw_news_id as string) ?? []
    lista.push(h)
    porNoticia.set(h.raw_news_id as string, lista)
  }

  const pendientes = await conRecursoPendiente(filas.filter((f) => f.programada_para && f.status !== "published"))

  const posts: PostCalendario[] = filas.map((f) => {
    const estado = estadoDe(f, now)
    const cuando = f.status === "published" ? f.published_at : (f.programada_para ?? f.published_at)
    const lugar = estado === "bandeja" || !cuando ? null : local(cuando)
    const otra = (porNoticia.get(f.raw_news_id ?? "") ?? []).find((h) => h.network !== f.network)
    const lugarOtra = otra?.programada_para ? local(otra.programada_para) : null
    return {
      id: f.id,
      red: f.network,
      titulo: primeraFrase(f.network === "linkedin" ? f.hook || f.cuerpo : f.caption) || "Sin título",
      texto: textoDelPost(f),
      imagenes: f.imagenes ?? [],
      estado,
      frenada: estado !== "publicada" && !sinFreno({ status: f.status, carril: f.carril, revision: f.revision }),
      aprobada: f.status === "approved",
      deChat: f.carril === "chat",
      hallazgo: f.revision?.hallazgos?.[0]?.detalle ?? null,
      dia: lugar?.dia ?? null,
      hora: lugar?.hora ?? null,
      error: f.publish_error,
      recursoPendiente: pendientes.has(f.id),
      hermana: otra
        ? {
            id: otra.id,
            red: otra.network,
            dia: lugarOtra?.dia ?? null,
            hora: lugarOtra?.hora ?? null,
            frenada: !sinFreno({ status: otra.status, carril: otra.carril, revision: otra.frena === null ? null : { frena: otra.frena } }),
          }
        : null,
    }
  })

  return {
    ahora,
    zona: timezone,
    vista: pedido.vista,
    fecha,
    posts,
    enBandeja: conteo.count ?? 0,
    publicarActivo: (ajustes.data as { publicar_activo: boolean } | null)?.publicar_activo === true,
    redesConectadas: conectadas.filter((r): r is RedCalendario => r === "instagram" || r === "linkedin"),
    horarios: parseHorarios((ajustes.data as { horarios: unknown } | null)?.horarios),
    ocupados: ((futuras.data ?? []) as { network: string; programada_para: string }[]).map((f) => {
      const { dia, hora } = local(f.programada_para)
      return claveHueco(f.network, dia, hora)
    }),
  }
}
