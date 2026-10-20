import { parseClasificacion } from "../marca/clasificacion"
import { guardarEjemplo, textoDeCarrusel, type CamposEjemplo } from "../marca/ejemplos"
import { parseInstagramResponse } from "../render/carousel"
import { supabaseAdmin } from "../supabase-admin"

/**
 * "Guardar como ejemplo": una pieza que salio bien pasa a ser ejemplo de la
 * marca, con su texto y su clasificacion. El porque lo escribe la persona: es
 * lo que el agente tiene que aprender de ella, y solo quien la eligio lo sabe.
 *
 * El carrusel sale del guion del buzon, que es el que tiene las laminas; el
 * post de LinkedIn, del texto de la pieza, que es el que se edita a mano.
 */
export async function guardarPiezaComoEjemplo(accountId: string, pieceId: string, porQue: string): Promise<string> {
  const supabase = supabaseAdmin()
  const { data: pieza, error } = await supabase
    .from("content_pieces")
    .select("id, network, payload, job_instagram_id, content_angle_id")
    .eq("id", pieceId)
    .eq("account_id", accountId)
    .single()
  if (error || !pieza) throw new Error("No se encontró la pieza.")
  const p = pieza as {
    network: string
    payload: Record<string, unknown>
    job_instagram_id: string | null
    content_angle_id: string | null
  }
  if (p.network !== "instagram" && p.network !== "linkedin") {
    throw new Error("Solo se guardan como ejemplo los carruseles de Instagram y los posts de LinkedIn.")
  }

  const { data: angulo } = p.content_angle_id
    ? await supabase.from("content_angles").select("angle, clasificacion").eq("id", p.content_angle_id).maybeSingle()
    : { data: null }
  const clasificacion = parseClasificacion((angulo as { clasificacion?: unknown } | null)?.clasificacion)

  let texto: string
  if (p.network === "instagram") {
    if (!p.job_instagram_id) throw new Error("Esta pieza no conserva el guion del que salió.")
    const { data: job } = await supabase.from("jobs_instagram").select("respuesta").eq("id", p.job_instagram_id).single()
    const respuesta = (job as { respuesta?: unknown } | null)?.respuesta
    const { slides, caption, hashtags } = parseInstagramResponse(respuesta)
    const cierre = ((respuesta ?? {}) as { cierre?: { title?: string; body?: string } | null }).cierre ?? null
    texto = textoDeCarrusel({
      laminas: slides.map((s) =>
        s.type === "photo_hook"
          ? { hook: s.hook }
          : { tipo: s.items?.length ? "lista" : null, title: s.title, body: s.body, lead: s.lead, items: s.items }
      ),
      cierre,
      caption,
      hashtags,
    })
  } else {
    texto = String(p.payload.body ?? "").trim()
  }
  if (!texto) throw new Error("La pieza no tiene texto que guardar.")

  const titulo = p.network === "instagram" ? texto.split("\n")[0].replace(/^Lámina 1 \(portada\):\s*/, "") : texto.split("\n")[0]
  const campos: CamposEjemplo = {
    red: p.network,
    nombre: titulo.slice(0, 120),
    texto,
    por_que: porQue,
    pilar_id: clasificacion?.pilar?.id ?? null,
    cta_tipo: (clasificacion?.cta?.tipo || null) as CamposEjemplo["cta_tipo"],
    objetivo: clasificacion?.objetivo ?? null,
    origen: "pieza de Hancel",
    activo: true,
  }
  return guardarEjemplo(accountId, null, campos)
}
