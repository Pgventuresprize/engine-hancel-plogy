"use server"

import { revalidatePath } from "next/cache"

import { parseVariables, validateVariables } from "@/engine/content/variables"
import { guardarPerfil, type PerfilMarca } from "@/engine/marca/perfil"
import { kitActivo } from "@/engine/marca/kit"
import { piezasDelKit } from "@/engine/marca/kit-piezas"
import { esHex, esModoDiseno, estiloDesdeConfig, FUENTES, PALETAS, type ModoDiseno } from "@/engine/render/theme"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"

/**
 * Lo que se guarda desde Marca. Cada pestana tiene su accion y
 * escribe solo lo suyo: ninguna reenvia lo de otra.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refresh() {
  revalidatePath("/marca")
}

/** Funde un cambio en un jsonb de generation_config sin pisar el resto. */
async function fundirEnConfig(
  accountId: string,
  columna: "variables" | "carousel",
  cambios: Record<string, unknown>,
  /** Claves viejas que se retiran al escribir. */
  quitar: string[] = []
): Promise<void> {
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("generation_config").select(columna).eq("account_id", accountId).maybeSingle()
  const actual = { ...(((data as Record<string, unknown> | null)?.[columna] ?? {}) as Record<string, unknown>) }
  for (const clave of quitar) delete actual[clave]
  const { error } = await supabase
    .from("generation_config")
    .upsert(
      { account_id: accountId, [columna]: { ...actual, ...cambios }, updated_at: new Date().toISOString() },
      { onConflict: "account_id" }
    )
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------- identidad

export async function guardarIdentidad(
  campos: Pick<PerfilMarca, "nombre" | "handle" | "que_hace" | "mensaje_central" | "idioma" | "pais">
): Promise<ActionResult> {
  try {
    const accountId = await idDeCuentaActual()
    await guardarPerfil(accountId, campos)
    // El idioma de los agentes de noticias todavia sale de las variables: se
    // mantienen iguales para que la marca no tenga dos idiomas distintos.
    await fundirEnConfig(accountId, "variables", { idioma: campos.idioma })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la identidad.")
  }
}

// ---------------------------------------------------------------------- voz

export type CamposVoz = Pick<
  PerfilMarca,
  | "voz_si"
  | "voz_no"
  | "reglas"
  | "frases_prohibidas"
  | "temas_vetados"
  | "hashtags_min"
  | "hashtags_max"
  | "laminas_min"
  | "laminas_max"
  | "emojis_instagram"
  | "emojis_linkedin"
> & {
  tono: string
  longitud: string
}

export async function guardarVoz(campos: CamposVoz): Promise<ActionResult> {
  const invalido = validateVariables({ tono: campos.tono, longitud: campos.longitud })
  if (invalido) return { ok: false, error: invalido }

  try {
    const accountId = await idDeCuentaActual()
    const { tono, longitud, ...perfil } = campos
    await guardarPerfil(accountId, perfil)
    const limpias = parseVariables({ tono, longitud })
    await fundirEnConfig(accountId, "variables", { tono: limpias.tono, longitud: limpias.longitud })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar la voz.")
  }
}

// ------------------------------------------------------------ modo de diseño

export type ModoDisenoDeCuenta = {
  modo: ModoDiseno
  /** Sin kit activo todo sale con las plantillas de siempre, sea cual sea el modo. */
  hayKit: boolean
  /** El modo con inteligencia diseña mirando las piezas de ejemplo del kit. */
  piezas: number
}

export async function leerModoDiseno(): Promise<{ ok: true; valor: ModoDisenoDeCuenta } | { ok: false; error: string }> {
  try {
    const accountId = await idDeCuentaActual()
    const [{ data }, kc] = await Promise.all([
      supabaseAdmin().from("generation_config").select("carousel").eq("account_id", accountId).maybeSingle(),
      kitActivo(accountId).catch(() => null),
    ])
    const modo = estiloDesdeConfig((data as { carousel?: unknown } | null)?.carousel).diseno
    return { ok: true, valor: { modo, hayKit: Boolean(kc), piezas: kc ? piezasDelKit(kc).length : 0 } }
  } catch (error) {
    return { ok: false, error: (error instanceof Error ? error.message : String(error)) || "No se pudo leer cómo se dibujan las piezas." }
  }
}

export async function guardarModoDiseno(modo: ModoDiseno): Promise<ActionResult> {
  if (!esModoDiseno(modo)) return { ok: false, error: "Ese modo de diseño no existe." }
  try {
    await fundirEnConfig(await idDeCuentaActual(), "carousel", { diseno: modo })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar cómo se dibujan las piezas.")
  }
}

// ------------------------------------------------------------------- visual

export type CamposVisual = {
  paleta: string
  colores: {
    tinta: string
    papel: string
    superficie: string
    acento: string
    acentoTexto: string
    degradado: string[]
  }
  fondo: "claro" | "oscuro"
  fuenteTitulos: string
  fuenteTexto: string
  marca: string
  mostrarPaginacion: boolean
  usarFotos: boolean
  fotosLiterales: boolean
  cierre: { estilo: "marca" | "perfil"; titulo: string; texto: string }
}

export async function guardarVisual(campos: CamposVisual): Promise<ActionResult> {
  if (!(campos.paleta in PALETAS)) return { ok: false, error: "Esa paleta no existe." }
  if (!(campos.fuenteTitulos in FUENTES) || !(campos.fuenteTexto in FUENTES)) {
    return { ok: false, error: "Esa tipografía no existe." }
  }
  if (campos.fondo !== "claro" && campos.fondo !== "oscuro") return { ok: false, error: "El fondo es claro u oscuro." }

  const { degradado, ...base } = campos.colores
  for (const [nombre, valor] of Object.entries(base)) {
    if (!esHex(valor)) return { ok: false, error: `El color "${nombre}" tiene que ser un código como #FF5B00.` }
  }
  if (degradado.length > 5 || !degradado.every(esHex)) {
    return { ok: false, error: "El degradado admite hasta 5 colores, cada uno como #FF5B00." }
  }

  try {
    const accountId = await idDeCuentaActual()
    await fundirEnConfig(accountId, "carousel", {
      paleta: campos.paleta,
      colores: { ...base, degradado },
      fondo: campos.fondo,
      fuenteTitulos: campos.fuenteTitulos,
      fuenteTexto: campos.fuenteTexto,
      // La de siempre, para lo que todavia lee una sola fuente.
      fuente: campos.fuenteTitulos,
      marca: campos.marca.trim().slice(0, 40),
      mostrarPaginacion: campos.mostrarPaginacion,
      usarFotos: campos.usarFotos,
      fotosLiterales: campos.fotosLiterales,
      // Solo como se ve: el texto del cierre lo escribe el agente en cada pieza.
      cierre: { estilo: campos.cierre.estilo === "perfil" ? "perfil" : "marca" },
      // `logo` a secas es de cuando solo habia uno: arrastrarlo haria resucitar
      // una version ya quitada.
    }, ["logo"])
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el aspecto.")
  }
}
