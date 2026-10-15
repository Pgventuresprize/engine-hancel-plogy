import { llamarClaude, parsearJSONDeClaude } from "../claude/messages"
import { supabaseAdmin } from "../supabase-admin"

/**
 * El nicho de una noticia redactada: uno, y siempre uno de los de la cuenta
 * (las categorias de la taxonomia de extraccion). En el portal de noticias es
 * el tema bajo el que se publica.
 *
 * La extraccion ya le pone a cada noticia el nicho de la busqueda que la trajo,
 * pero eso dice por donde llego, no de que trata: la busqueda de "politica y
 * mercado" trae noticias de precios del arroz que son de cultivos. Por eso se
 * decide con lo que la noticia cuenta, y el de la busqueda queda de respaldo.
 */

export type Nicho = { slug: string; nombre: string }

const MODELO = "claude-sonnet-5-5"

export async function nichosDeCuenta(accountId: string): Promise<(Nicho & { descripcion: string | null })[]> {
  const { data } = await supabaseAdmin()
    .from("engine_categories")
    .select("slug, name, description")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .order("position")
  return ((data ?? []) as { slug: string; name: string; description: string | null }[]).map((c) => ({
    slug: c.slug,
    nombre: c.name,
    descripcion: c.description,
  }))
}

export async function nichoDeNoticia(
  accountId: string,
  noticia: { titular: string; entrada: string; nichoBusqueda: string | null }
): Promise<Nicho | null> {
  const nichos = await nichosDeCuenta(accountId)
  if (nichos.length === 0) return null
  const respaldo = nichos.find((n) => n.slug === noticia.nichoBusqueda) ?? null
  if (nichos.length === 1) return { slug: nichos[0].slug, nombre: nichos[0].nombre }

  const r = await llamarClaude({
    accountId,
    model: MODELO,
    system: `Clasificas una noticia en exactamente UNO de los nichos que se te dan: el que mejor describe de que trata la noticia (el producto, la actividad o el asunto principal), no por donde se encontro. Si dos aplican, elige el del asunto central del titular.

RESPONDE SOLO con este JSON: {"nicho":"<slug exacto de la lista>"}`,
    prompt: `NICHOS
${nichos.map((n) => `- ${n.slug}: ${n.nombre}${n.descripcion ? ` (${n.descripcion})` : ""}`).join("\n")}

NOTICIA
- titular: ${noticia.titular}
- entrada: ${noticia.entrada.slice(0, 1500)}
- nicho de la busqueda que la trajo (pista, no obligatorio): ${noticia.nichoBusqueda ?? "(ninguno)"}`,
    maxTokens: 60,
  })
  if (!r.ok) return respaldo ? { slug: respaldo.slug, nombre: respaldo.nombre } : null
  try {
    const slug = String((parsearJSONDeClaude(r.texto) as { nicho?: unknown }).nicho ?? "").trim()
    const elegido = nichos.find((n) => n.slug === slug) ?? respaldo
    return elegido ? { slug: elegido.slug, nombre: elegido.nombre } : null
  } catch {
    return respaldo ? { slug: respaldo.slug, nombre: respaldo.nombre } : null
  }
}
