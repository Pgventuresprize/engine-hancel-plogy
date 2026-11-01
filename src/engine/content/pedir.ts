import type { RawNews } from "@/lib/types"

import { supabaseAdmin } from "../supabase-admin"
import { enqueueInstagramJob, enqueueLinkedinJob, getGenerationConfig, type Encolado } from "./jobs"
import type { ContentAngle, Variables } from "./types"

/**
 * Pide la pieza de una red para un angulo ya decidido.
 *
 * Es lo que hace "Generar" en la ficha del tablero y lo que hace el chat cuando
 * se le pide un carrusel o un post de una noticia: encola el buzon de la red (o
 * el del recurso, si su CTA lo promete y aun no esta escrito) y deja el angulo a
 * la espera. No corre la pasada: eso lo decide quien llama.
 *
 * Facebook sale del buzon de Instagram con Facebook como unico destino; si ya
 * hay un carrusel del que sacarlo, quien llama lo resuelve antes sin encolar.
 */
export async function pedirPiezaDeAngulo(
  accountId: string,
  angleId: string,
  red: "linkedin" | "instagram" | "facebook",
  override?: Partial<Variables> | null
): Promise<Encolado> {
  const supabase = supabaseAdmin()
  // El id llega del cliente: filtrar por cuenta es lo que impide pedir piezas
  // con el angulo de otra.
  const { data, error } = await supabase
    .from("content_angles")
    .select("*")
    .eq("id", angleId)
    .eq("account_id", accountId)
    .single()
  if (error || !data) throw new Error(`No se encontro el angulo${error ? `: ${error.message}` : ""}.`)
  const angle = data as ContentAngle

  const { data: noticia, error: errorNoticia } = await supabase
    .from("raw_news")
    .select("*")
    .eq("id", angle.raw_news_id)
    .eq("account_id", accountId)
    .single()
  if (errorNoticia || !noticia) throw new Error(`No se encontro la noticia${errorNoticia ? `: ${errorNoticia.message}` : ""}.`)
  const news = noticia as RawNews

  const config = await getGenerationConfig(accountId)

  // El mismo angulo alimenta todas las redes: esa es la razon de que el angulo
  // se decida una sola vez y por separado.
  const encolado =
    red === "facebook"
      ? await enqueueInstagramJob(angle, news, config.variables, override, ["facebook"])
      : red === "instagram"
        ? await enqueueInstagramJob(angle, news, config.variables, override)
        : await enqueueLinkedinJob(angle, news, config.variables, override)

  // Solo se marca a la espera si no habia nada generado aun; si ya hay una pieza
  // de la otra red, el angulo se queda en 'generated' y no retrocede.
  if (angle.status === "angled") {
    await supabase
      .from("content_angles")
      .update({ status: "pending_generation" })
      .eq("id", angleId)
      .eq("account_id", accountId)
  }

  return encolado
}
