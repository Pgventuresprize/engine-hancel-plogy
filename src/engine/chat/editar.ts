import { guardarVersion, versionesDe } from "../content/versiones"
import { cifrasInventadas, parseFigura, type Figura, type ItemFigura } from "../marca/figuras"
import { elegirDeBiblioteca, hayFotosEnBiblioteca, registrarUsos } from "../marca/imagenes"
import { kitActivo, type KitCargado } from "../marca/kit"
import type { Hueco, Plantilla } from "../marca/kit-modelo"
import { generarCarrusel, nichosConocidos, noticiaDelAngulo, parseInstagramResponse, type CarouselPayload } from "../render/carousel"
import type { MaquetaGuardada } from "../render/kit-carrusel"
import { claveKit } from "../render/kit-libre-pasos"
import { dibujarDesdeFuente } from "../render/redibujar"
import { estiloDesdeConfig } from "../render/theme"
import { supabaseAdmin } from "../supabase-admin"
import type { Seleccion } from "./mensajes"

/**
 * Cambiar una pieza desde el chat (MARCAS.md, "La pieza al lado del chat").
 *
 * El agente de la red ve la pieza tal como se puede cambiar y responde con su
 * prosa y un bloque ```cambios con lo que cambia. Aqui se lee ese bloque, se
 * aplica, se vuelve a dibujar el carrusel y se guarda la version nueva.
 *
 * Hay tres maneras, segun la pieza:
 *   - "huecos": un carrusel con su maqueta guardada. Cada lamina es una
 *     plantilla del kit y su texto va en huecos con nombre (data-hueco): se
 *     cambia el hueco y se redibuja con las mismas plantillas y fotos.
 *   - "guion": un carrusel de antes de que se guardara la maqueta, o de diseño
 *     libre. Se cambia el guion y se vuelve a maquetar (pueden cambiar
 *     plantillas o fotos; desde ahi ya tiene maqueta).
 *   - "post": un post de LinkedIn, por parrafos.
 */

export type ModoEdicion = "huecos" | "guion" | "post"

type HuecoEditable = Pick<Hueco, "nombre" | "tipo" | "max" | "min_items" | "max_items" | "descripcion"> & { valor: string | string[] }

export type Editable =
  | {
      modo: "huecos"
      pieceId: string
      laminas: { n: number; tipo: string; huecos: HuecoEditable[]; foto: "tiene" | "puede" | "no"; figura: Figura | null }[]
      caption: string
      hashtags: string[]
    }
  | {
      modo: "guion"
      pieceId: string
      laminas: {
        n: number
        portada: boolean
        hook?: string | null
        title?: string | null
        lead?: string | null
        body?: string | null
        items?: string[] | null
        figura?: Figura | null
      }[]
      cierre: { title?: string; body?: string } | null
      caption: string
      hashtags: string[]
      /** Por que no se puede cambiar por huecos. */
      porque: string
    }
  | { modo: "post"; pieceId: string; parrafos: string[]; hashtags: string[] }

/** Lo que cambia de una figura: el encabezado y, en orden, cada elemento. */
export type CambioFigura = {
  titulo?: string
  items?: Partial<Pick<ItemFigura, "texto" | "nota" | "cifra" | "valor" | "celdas">>[]
}

/** Lo que el agente devuelve en el bloque ```cambios. */
export type Cambios = {
  motivo?: string
  laminas?: {
    n: number
    textos?: Record<string, string>
    listas?: Record<string, string[]>
    foto?: "otra"
    figura?: CambioFigura
    hook?: string
    title?: string
    lead?: string
    body?: string
    items?: string[]
  }[]
  cierre?: { title?: string; body?: string }
  caption?: string
  hashtags?: string[]
  /** LinkedIn: el texto nuevo de cada parrafo, por numero ("" lo quita). */
  parrafos?: Record<string, string>
}

export type Aplicado = { version: number | null; tocadas: number[]; avisos: string[]; motivo: string }

type Fila = {
  id: string
  network: string
  payload: Record<string, unknown>
  published_at: string | null
  content_angle_id: string
  job_instagram_id: string | null
  job_linkedin_id: string | null
}

async function filaDe(accountId: string, pieceId: string): Promise<Fila> {
  const { data } = await supabaseAdmin()
    .from("content_pieces")
    .select("id, network, payload, published_at, content_angle_id, job_instagram_id, job_linkedin_id")
    .eq("id", pieceId)
    .eq("account_id", accountId)
    .maybeSingle()
  if (!data) throw new Error("No se encontró la pieza.")
  return data as Fila
}

const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])

/** Los parrafos de un post, igual que los enseña el panel. */
export function parrafosDe(payload: Record<string, unknown>): string[] {
  const body = typeof payload.body === "string" ? payload.body : ""
  const hook = typeof payload.hook === "string" ? payload.hook.trim() : ""
  return [hook && !body.startsWith(hook) ? hook : null, ...body.split(/\n\s*\n/)]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
}

/** Si la maqueta guardada sirve con el kit de ahora: si no, solo se puede por guion. */
function maquetaUsable(payload: Record<string, unknown>, kc: KitCargado | null): MaquetaGuardada | null {
  const m = payload.maqueta as MaquetaGuardada | undefined
  if (!m || !kc || payload.modoDiseno === "inteligencia") return null
  if (m.kit !== claveKit(kc)) return null
  return m.laminas.every((l) => kc.plantillas.some((p) => p.id === l.plantilla)) ? m : null
}

/** Como se puede marcar una pieza en el panel: por hueco, por lamina entera o por parrafo. */
export async function modoDeEdicion(accountId: string, pieceId: string): Promise<ModoEdicion> {
  const f = await filaDe(accountId, pieceId)
  if (f.network === "linkedin") return "post"
  return maquetaUsable(f.payload, await kitActivo(accountId)) ? "huecos" : "guion"
}

/** Por que un carrusel sin maqueta usable se cambia por guion, en palabras de la persona. */
function porqueGuion(payload: Record<string, unknown>, kc: KitCargado | null): string {
  if (payload.modoDiseno === "inteligencia")
    return "Es de diseño con inteligencia: al cambiar el texto se vuelve a maquetar con las plantillas del kit."
  if (!payload.maqueta) return "Es de antes de que Plogy Studio guardara cómo se maquetó: al cambiar el texto se vuelve a maquetar y puede cambiar alguna plantilla o foto."
  if (!kc) return "La marca no tiene un kit activo."
  return "Se hizo con otra versión del kit: al cambiar el texto se vuelve a maquetar con el de ahora."
}

/** Lo que el agente tiene delante para cambiar la pieza. */
export async function editableDe(accountId: string, pieceId: string): Promise<Editable> {
  const f = await filaDe(accountId, pieceId)
  if (f.network === "linkedin") return { modo: "post", pieceId, parrafos: parrafosDe(f.payload), hashtags: textos(f.payload.hashtags) }
  if (f.network !== "instagram") throw new Error("En el chat se cambian los carruseles de Instagram y los posts de LinkedIn.")

  const kc = await kitActivo(accountId)
  const caption = typeof f.payload.caption === "string" ? f.payload.caption : ""
  const hashtags = textos(f.payload.hashtags)
  const maqueta = maquetaUsable(f.payload, kc)
  if (maqueta && kc) {
    return {
      modo: "huecos",
      pieceId,
      caption,
      hashtags,
      laminas: maqueta.laminas.map((l, i) => {
        const p = kc.plantillas.find((x) => x.id === l.plantilla) as Plantilla
        return {
          n: i + 1,
          tipo: p.tipo,
          foto: p.foto.usa === "no" ? "no" : l.foto ? "tiene" : "puede",
          figura: l.figura ?? null,
          huecos: p.huecos
            .filter((h) => h.tipo === "texto" || h.tipo === "lista" || h.tipo === "numero")
            .map((h) => ({
              nombre: h.nombre,
              tipo: h.tipo,
              max: h.max,
              min_items: h.min_items,
              max_items: h.max_items,
              descripcion: h.descripcion,
              valor: h.tipo === "lista" ? (l.listas[h.nombre] ?? []) : (l.textos[h.nombre] ?? ""),
            })),
        }
      }),
    }
  }

  const respuesta = await respuestaDe("jobs_instagram", f.job_instagram_id)
  const guion = parseInstagramResponse(respuesta)
  const cierre = ((respuesta ?? {}) as { cierre?: { title?: string; body?: string } | null }).cierre ?? null
  return {
    modo: "guion",
    pieceId,
    caption,
    hashtags,
    porque: porqueGuion(f.payload, kc),
    cierre: cierre && (cierre.title || cierre.body) ? { title: cierre.title, body: cierre.body } : null,
    laminas: guion.slides.map((s, i) =>
      s.type === "photo_hook"
        ? { n: i + 1, portada: true, hook: s.hook }
        : { n: i + 1, portada: false, title: s.title, lead: s.lead, body: s.body, items: s.items, figura: s.figura ?? null }
    ),
  }
}

async function respuestaDe(tabla: "jobs_instagram" | "jobs_linkedin", jobId: string | null): Promise<Record<string, unknown>> {
  if (!jobId) throw new Error("Esta pieza no conserva el guion del que salió.")
  const { data } = await supabaseAdmin().from(tabla).select("respuesta").eq("id", jobId).maybeSingle()
  const r = (data as { respuesta: unknown } | null)?.respuesta
  if (!r || typeof r !== "object") throw new Error("No se encontró el guion de la pieza.")
  return r as Record<string, unknown>
}

const comillas = (t: string) => JSON.stringify(t)

/** La figura como la lee el agente: lo que se puede cambiar de ella. */
function lineaDeFigura(f: Figura): string {
  const items = f.items.map((it) => ({
    texto: it.texto,
    ...(it.nota ? { nota: it.nota } : {}),
    ...(it.cifra ? { cifra: it.cifra } : {}),
    ...(it.valor !== undefined ? { valor: it.valor } : {}),
    ...(it.celdas ? { celdas: it.celdas } : {}),
  }))
  return `- figura (${f.tipo}, la dibuja el sistema; se cambia con "figura"): ${JSON.stringify({ ...(f.titulo ? { titulo: f.titulo } : {}), items })}`
}

/** La pieza como la lee el agente: cada cosa que puede cambiar, con su texto de ahora. */
export function textoEditable(e: Editable): string {
  if (e.modo === "post") {
    return [
      "Post de LinkedIn, por párrafos:",
      ...e.parrafos.map((p, i) => `[${i + 1}] ${p}`),
      `Hashtags: ${e.hashtags.join(" ") || "(ninguno)"}`,
    ].join("\n\n")
  }
  const pie = [`Texto de la publicación (caption): ${comillas(e.caption)}`, `Hashtags: ${e.hashtags.join(" ") || "(ninguno)"}`]
  if (e.modo === "huecos") {
    return [
      "Carrusel de Instagram. Cada lámina es una plantilla del kit de la marca y su texto va en huecos con nombre: para cambiar un texto, cambias su hueco.",
      ...e.laminas.map((l) =>
        [
          `## Lámina ${l.n} (${l.tipo})`,
          ...l.huecos.map((h) =>
            h.tipo === "lista"
              ? `- ${h.nombre} (lista${h.min_items || h.max_items ? ` de ${h.min_items ?? 1} a ${h.max_items ?? "varios"} elementos` : ""}, máx. ${h.max} caracteres cada uno${h.descripcion ? `; ${h.descripcion}` : ""}): ${JSON.stringify(h.valor)}`
              : `- ${h.nombre} (texto, máx. ${h.max} caracteres${h.descripcion ? `; ${h.descripcion}` : ""}): ${comillas(String(h.valor))}`
          ),
          l.figura ? lineaDeFigura(l.figura) : "",
          l.foto === "tiene" ? "- foto: tiene una de la biblioteca (se puede pedir otra)" : l.foto === "puede" ? "- foto: ahora sin foto (se puede pedir una)" : "",
        ]
          .filter(Boolean)
          .join("\n")
      ),
      ...pie,
    ].join("\n\n")
  }
  return [
    `Carrusel de Instagram, por guion. ${e.porque}`,
    ...e.laminas.map((l) =>
      l.portada
        ? `## Lámina ${l.n} (portada)\n- hook: ${comillas(l.hook ?? "")}`
        : [
            `## Lámina ${l.n}`,
            l.lead ? `- lead: ${comillas(l.lead)}` : "",
            `- title: ${comillas(l.title ?? "")}`,
            l.body ? `- body: ${comillas(l.body)}` : "",
            l.items?.length ? `- items: ${JSON.stringify(l.items)}` : "",
            l.figura ? lineaDeFigura(l.figura) : "",
          ]
            .filter(Boolean)
            .join("\n")
    ),
    e.cierre
      ? `## Lámina ${e.laminas.length + 1} (cierre: se cambia con "cierre")\n- title: ${comillas(e.cierre.title ?? "")}\n- body: ${comillas(e.cierre.body ?? "")}`
      : "",
    ...pie,
  ]
    .filter(Boolean)
    .join("\n\n")
}

const REGLA_FIGURA = `- "figura" cambia la figura de esa lámina: {"titulo": "…", "items": [{"texto": "…", "cifra": "…"}, …]}. En "items" van todos sus elementos, en orden, con lo que cambia de cada uno (texto, nota, cifra, valor o celdas); sin "items" quedan como están. Una cifra que no esté en la noticia ni en el carrusel no entra: no inventes datos.`

/** Como se escribe el bloque de cambios para cada manera de cambiar. */
export function contratoDeCambios(modo: ModoEdicion): string {
  const ejemplo =
    modo === "huecos"
      ? `{"motivo": "Acortó el titular de la portada", "laminas": [{"n": 1, "textos": {"titulo": "…"}}, {"n": 6, "listas": {"puntos": ["…", "…", "…"]}}, {"n": 4, "figura": {"titulo": "…"}}, {"n": 8, "foto": "otra"}]}`
      : modo === "guion"
        ? `{"motivo": "Acortó el titular de la portada", "laminas": [{"n": 1, "hook": "…"}, {"n": 3, "title": "…", "body": "…"}], "cierre": {"title": "…"}}`
        : `{"motivo": "Reescribió el gancho", "parrafos": {"1": "…", "4": ""}}`
  const reglas =
    modo === "huecos"
      ? [
          `- En "textos" va cada hueco de texto que cambia, con su texto nuevo completo; en "listas", cada lista que cambia, completa. Solo los huecos que tiene esa lámina, con sus nombres exactos.`,
          `- Respeta el máximo de caracteres de cada hueco: si no cabe, no se lee.`,
          `- "foto": "otra" cambia la foto de esa lámina por otra de la biblioteca de la marca.`,
          `- Donde el texto admite *resaltado*, se marca con asteriscos, como ya viene.`,
          REGLA_FIGURA,
        ]
      : modo === "guion"
        ? [
            `- En cada lámina, solo los campos que cambian (hook en la portada; lead, title, body o items en las demás), con su texto nuevo completo. El cierre va aparte, en "cierre".`,
            REGLA_FIGURA,
            `- Al aplicarlo, el carrusel se vuelve a maquetar: avísalo en una frase si puede cambiar el aspecto.`,
          ]
        : [
            `- En "parrafos", el número de cada párrafo que cambia y su texto nuevo completo. "" lo quita. Para añadir uno, ponlo junto a otro separado por una línea en blanco.`,
          ]
  return `# CÓMO CAMBIAS LA PIEZA

Si la persona pide un cambio en la pieza, hazlo tú. Primero dile en una o dos frases qué cambiaste, con el texto nuevo. Al final, sin nada después, añade el bloque con el cambio:

\`\`\`cambios
${ejemplo}
\`\`\`

- "motivo": lo que cambió, de 3 a 8 palabras, como se lee en el historial de versiones.
${reglas.join("\n")}
- "caption" (texto nuevo completo) y "hashtags" (lista) solo si cambian.
- Cambia solo lo que se pide. Si marcó partes de la pieza, solo esas: lo demás queda igual.
- Si el pedido no se entiende o no se puede hacer, pregunta o explica por qué, y no pongas el bloque.
- Nunca digas que cambiaste algo si no pones el bloque: sin bloque, la pieza no cambia.`
}

/** Separa la prosa del bloque ```cambios. */
export function leerCambios(texto: string): { prosa: string; cambios: Cambios | null; error: string | null } {
  const m = texto.match(/```cambios\s*([\s\S]*?)(```|$)/)
  const prosa = texto.replace(/```[\s\S]*$/, "").trim()
  if (!m) return { prosa, cambios: null, error: null }
  try {
    const c = JSON.parse(m[1].trim()) as Cambios
    if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("no es un objeto")
    return { prosa, cambios: c, error: null }
  } catch (e) {
    return { prosa, cambios: null, error: `el bloque de cambios no se pudo leer (${e instanceof Error ? e.message : String(e)})` }
  }
}

/** Lo marcado, como lo lee el agente. */
export function textoDeSelecciones(selecciones: Seleccion[]): string {
  return selecciones
    .map((s, i) => {
      const donde =
        s.campo === "parrafo"
          ? `párrafo ${s.lamina}`
          : `lámina ${s.lamina}${s.campo ? `, "${s.campo}"${s.item ? `, elemento ${s.item}` : ""}` : " entera"}`
      const dice = s.texto?.trim() ? `: ${comillas(s.texto.trim().slice(0, 300))}` : ""
      return `${i + 1}. ${s.etiqueta} (${donde})${dice}`
    })
    .join("\n")
}

const limpio = (t: unknown) => (typeof t === "string" ? t.trim() : null)
const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : null)

/**
 * Aplica los cambios y guarda la version nueva. Lanza con un motivo claro si no
 * se puede; si el carrusel no se puede volver a dibujar, la pieza queda como estaba.
 */
export async function aplicarCambios(o: { accountId: string; pieceId: string; cambios: Cambios; agente: string }): Promise<Aplicado> {
  const f = await filaDe(o.accountId, o.pieceId)
  if (f.published_at) throw new Error("La pieza ya está publicada: lo publicado no se toca.")
  const motivo = (limpio(o.cambios.motivo) || "Cambio pedido en el chat").slice(0, 120)
  // Una pieza de antes de las versiones guarda primero como estaba: si no, no habria a donde volver.
  if (!(await versionesDe(o.accountId, o.pieceId)).length) {
    await guardarVersion({ accountId: o.accountId, pieceId: o.pieceId, motivo: "Como estaba antes de cambiarla en el chat" })
  }

  let r: Omit<Aplicado, "version" | "motivo">
  if (f.network === "linkedin") r = await aplicarPost(f, o.cambios)
  else if (f.network === "instagram") {
    const kc = await kitActivo(o.accountId)
    const maqueta = maquetaUsable(f.payload, kc)
    r = maqueta && kc ? await aplicarHuecos(o.accountId, f, kc, maqueta, o.cambios) : await aplicarGuion(o.accountId, f, o.cambios)
  } else throw new Error("En el chat se cambian los carruseles de Instagram y los posts de LinkedIn.")

  const version = await guardarVersion({ accountId: o.accountId, pieceId: o.pieceId, motivo, autorAgente: o.agente })
  return { ...r, version, motivo }
}

/** Caption y hashtags: van en la pieza y en el guion, para que regenerar no los pierda. */
function pie(cambios: Cambios, payload: Record<string, unknown>) {
  const caption = limpio(cambios.caption)
  const hashtags = lista(cambios.hashtags)?.map((h) => (h.startsWith("#") ? h : `#${h}`)) ?? null
  return {
    cambio: Boolean(caption !== null && caption !== payload.caption) || Boolean(hashtags),
    caption: caption ?? (payload.caption as string | undefined),
    hashtags: hashtags ?? (payload.hashtags as string[] | undefined),
  }
}

async function aplicarPost(f: Fila, cambios: Cambios): Promise<Omit<Aplicado, "version" | "motivo">> {
  const supabase = supabaseAdmin()
  const parrafos = parrafosDe(f.payload)
  const tocadas: number[] = []
  const avisos: string[] = []
  for (const [k, v] of Object.entries(cambios.parrafos ?? {})) {
    const n = Number(k)
    if (!Number.isInteger(n) || n < 1 || n > parrafos.length) {
      avisos.push(`El párrafo ${k} no existe: lo dejé fuera.`)
      continue
    }
    parrafos[n - 1] = typeof v === "string" ? v.trim() : parrafos[n - 1]
    tocadas.push(n)
  }
  const p = pie(cambios, f.payload)
  if (!tocadas.length && !p.cambio) throw new Error("El cambio no tocaba nada del post.")
  const body = parrafos.filter(Boolean).join("\n\n")
  if (!body) throw new Error("El post quedaría vacío.")

  const respuesta = await respuestaDe("jobs_linkedin", f.job_linkedin_id).catch(() => null)
  if (respuesta && f.job_linkedin_id) {
    await supabase.from("jobs_linkedin").update({ respuesta: { ...respuesta, post: body } }).eq("id", f.job_linkedin_id)
  }
  const { error } = await supabase
    .from("content_pieces")
    .update({ payload: { ...f.payload, body, hook: null, ...(p.hashtags ? { hashtags: p.hashtags } : {}) } })
    .eq("id", f.id)
  if (error) throw new Error(error.message)
  return { tocadas, avisos }
}

/** Donde puede salir una cifra: la noticia y el texto del carrusel, como al crear la figura. */
async function fuenteDeCifras(angleId: string, textoCarrusel: string): Promise<string> {
  const news = await noticiaDelAngulo(angleId)
  return [news?.title, news?.snippet, news?.full_content, news?.analysis_notes, textoCarrusel].filter(Boolean).join(" ")
}

/**
 * La figura con lo que cambia. Una cifra nueva tiene que estar en la noticia o
 * en el texto del carrusel, igual que al crearla: si no, queda como estaba.
 */
function figuraCambiada(vieja: Figura, c: CambioFigura, fuente: string): { figura: Figura } | { aviso: string } {
  const items = Array.isArray(c.items)
    ? c.items.slice(0, 12).map((x, i) => {
        const it: Partial<ItemFigura> = { ...(vieja.items[i] ?? { texto: "" }) }
        const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>
        if (typeof o.texto === "string" && o.texto.trim()) it.texto = o.texto.trim()
        if (typeof o.nota === "string") it.nota = o.nota.trim() || undefined
        if (typeof o.cifra === "string" && o.cifra.trim() && o.cifra.trim() !== it.cifra) {
          it.cifra = o.cifra.trim()
          // Con otra cifra, el valor sale de ella (la barra mide lo que dice).
          delete it.valor
        }
        if (typeof o.valor === "number" && Number.isFinite(o.valor)) it.valor = o.valor
        if (Array.isArray(o.celdas)) it.celdas = o.celdas.map((v) => String(v ?? "").trim())
        return it
      })
    : vieja.items
  const titulo = typeof c.titulo === "string" ? c.titulo.trim() || undefined : vieja.titulo
  const figura = parseFigura({ ...vieja, titulo, items })
  if (!figura || !figura.items.length) return { aviso: "quedaba sin elementos" }
  const inventadas = figura.hipotetico ? [] : cifrasInventadas(figura, fuente)
  if (inventadas.length) return { aviso: `traía cifras que no están en la noticia ni en el carrusel (${inventadas.join(", ")})` }
  return { figura }
}

/** Los problemas graves del dibujo nuevo en las laminas que se tocaron. */
function apretadas(payload: CarouselPayload, tocadas: number[]): string[] {
  const graves = new Set(["se_sale", "choca", "desborda", "letra_pequena"])
  const malas = [...new Set((payload.problemasDibujo ?? []).filter((p) => graves.has(p.tipo) && tocadas.includes(p.lamina)).map((p) => p.lamina))]
  return malas.length
    ? [`${malas.length === 1 ? `La lámina ${malas[0]} quedó apretada` : `Las láminas ${malas.join(", ")} quedaron apretadas`}: el texto no cabe bien. Puedo acortarlo si quieres.`]
    : []
}

async function aplicarHuecos(
  accountId: string,
  f: Fila,
  kc: KitCargado,
  maqueta: MaquetaGuardada,
  cambios: Cambios
): Promise<Omit<Aplicado, "version" | "motivo">> {
  const supabase = supabaseAdmin()
  const laminas = maqueta.laminas.map((l) => ({ ...l, textos: { ...l.textos }, listas: { ...l.listas } }))
  const tocadas = new Set<number>()
  const avisos: string[] = []
  const nuevasFotos: { n: number; imagenId: string; motivo: string }[] = []
  let fuente: string | null = null

  for (const c of cambios.laminas ?? []) {
    const n = Number(c?.n)
    const l = laminas[n - 1]
    if (!l) {
      avisos.push(`La lámina ${c?.n} no existe: la dejé fuera.`)
      continue
    }
    const p = kc.plantillas.find((x) => x.id === l.plantilla) as Plantilla
    const hueco = (nombre: string) => p.huecos.find((h) => h.nombre === nombre)
    for (const [nombre, valor] of Object.entries(c.textos ?? {})) {
      const h = hueco(nombre)
      if (!h || h.tipo === "lista" || h.tipo === "figura") {
        avisos.push(`La lámina ${n} no tiene un hueco de texto "${nombre}": lo dejé fuera.`)
        continue
      }
      const t = String(valor ?? "").trim()
      if (!t && h.obligatorio) {
        avisos.push(`El hueco "${nombre}" de la lámina ${n} no puede quedar vacío: lo dejé como estaba.`)
        continue
      }
      if (t) l.textos[nombre] = t
      else delete l.textos[nombre]
      tocadas.add(n)
    }
    for (const [nombre, valor] of Object.entries(c.listas ?? {})) {
      const h = hueco(nombre)
      const items = lista(valor)
      if (!h || h.tipo !== "lista" || !items) {
        avisos.push(`La lámina ${n} no tiene una lista "${nombre}": la dejé fuera.`)
        continue
      }
      l.listas[nombre] = h.max_items ? items.slice(0, h.max_items) : items
      tocadas.add(n)
    }
    if (c.figura && typeof c.figura === "object") {
      if (!l.figura) avisos.push(`La lámina ${n} no tiene figura: la dejé fuera.`)
      else {
        fuente ??= await fuenteDeCifras(
          f.content_angle_id,
          laminas.flatMap((x) => [...Object.values(x.textos), ...Object.values(x.listas).flat()]).join(" ")
        )
        const r = figuraCambiada(l.figura, c.figura, fuente)
        if ("aviso" in r) avisos.push(`La figura de la lámina ${n} ${r.aviso}: la dejé como estaba.`)
        else {
          l.figura = r.figura
          tocadas.add(n)
        }
      }
    }
    if (c.foto === "otra") {
      if (p.foto.usa === "no") {
        avisos.push(`La plantilla de la lámina ${n} no lleva foto.`)
        continue
      }
      const evitar = laminas.flatMap((x) => (x.foto?.tipo === "biblioteca" ? [x.foto.imagenId] : []))
      const textoLamina = [...Object.values(l.textos), ...Object.values(l.listas).flat()].join(". ")
      const elegida =
        (await hayFotosEnBiblioteca(accountId))
          ? (
              await elegirDeBiblioteca({
                accountId,
                huecos: [{ indice: 0, uso: p.foto.uso, texto: textoLamina, tono: p.foto.tono, espacio: p.foto.espacio }],
                terminos: textos(f.payload.terminosFoto),
                evitar,
              })
            ).get(0)
          : undefined
      if (!elegida) {
        avisos.push(`No encontré otra foto en la biblioteca que sirva para la lámina ${n}.`)
        continue
      }
      l.foto = { tipo: "biblioteca", imagenId: elegida.imagenId, motivo: elegida.motivo }
      nuevasFotos.push({ n, imagenId: elegida.imagenId, motivo: elegida.motivo })
      tocadas.add(n)
    }
  }

  const p = pie(cambios, f.payload)
  if (!tocadas.size && !p.cambio) throw new Error(avisos[0] ?? "El cambio no tocaba nada del carrusel.")

  const fotosBiblioteca = [
    ...((f.payload.fotosBiblioteca as { lamina: number; imagenId: string; motivo: string }[] | undefined) ?? []).filter(
      (x) => !nuevasFotos.some((nf) => nf.n === x.lamina)
    ),
    ...nuevasFotos.map((x) => ({ lamina: x.n, imagenId: x.imagenId, motivo: x.motivo })),
  ].sort((a, b) => a.lamina - b.lamina)
  const payload = {
    ...f.payload,
    maqueta: { ...maqueta, laminas },
    caption: p.caption,
    hashtags: p.hashtags,
    ...(nuevasFotos.length ? { fotosBiblioteca } : {}),
  }
  const { error } = await supabase.from("content_pieces").update({ payload }).eq("id", f.id)
  if (error) throw new Error(error.message)
  if (p.cambio && f.job_instagram_id) {
    const respuesta = await respuestaDe("jobs_instagram", f.job_instagram_id).catch(() => null)
    if (respuesta) await supabase.from("jobs_instagram").update({ respuesta: { ...respuesta, caption: p.caption, hashtags: p.hashtags } }).eq("id", f.job_instagram_id)
  }

  if (!tocadas.size) return { tocadas: [], avisos }
  let dibujado: CarouselPayload
  try {
    dibujado = await dibujarDesdeFuente(accountId, f.id)
  } catch (e) {
    await supabase.from("content_pieces").update({ payload: f.payload }).eq("id", f.id)
    throw new Error(`No se pudo volver a dibujar el carrusel: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (nuevasFotos.length) await registrarUsos(accountId, f.id, "instagram", fotosBiblioteca)
  const n = [...tocadas].sort((a, b) => a - b)
  return { tocadas: n, avisos: [...avisos, ...apretadas(dibujado, n)] }
}

/** Las posiciones en el guion de las laminas que parseSlides deja: se salta las vacias. */
function indicesDeLaminas(bruto: unknown[]): number[] {
  const vale = (t: unknown) => typeof t === "string" && t.trim().length > 0
  return bruto.flatMap((item, i) => {
    if (!item || typeof item !== "object") return []
    const o = item as Record<string, unknown>
    if (String(o.type ?? "").trim() === "photo_hook") return [i]
    const hay = [o.title, o.titulo, o.body, o.cuerpo, o.text].some(vale) || (Array.isArray(o.items) && o.items.some(vale))
    return hay ? [i] : []
  })
}

async function aplicarGuion(accountId: string, f: Fila, cambios: Cambios): Promise<Omit<Aplicado, "version" | "motivo">> {
  const supabase = supabaseAdmin()
  if (!f.job_instagram_id) throw new Error("Esta pieza no conserva el guion del que salió.")
  const antes = await respuestaDe("jobs_instagram", f.job_instagram_id)
  const respuesta = structuredClone(antes) as Record<string, unknown>
  const slides = Array.isArray(respuesta.slides) ? (respuesta.slides as Record<string, unknown>[]) : []
  const indices = indicesDeLaminas(slides)
  const tocadas = new Set<number>()
  const avisos: string[] = []
  let fuente: string | null = null

  for (const c of cambios.laminas ?? []) {
    const n = Number(c?.n)
    const s = slides[indices[n - 1]]
    if (!s) {
      avisos.push(`La lámina ${c?.n} no existe: la dejé fuera.`)
      continue
    }
    if (String(s.type ?? "") === "photo_hook") {
      const hook = limpio(c.hook ?? c.title)
      if (hook) {
        s.hook = hook
        tocadas.add(n)
      }
      continue
    }
    for (const campo of ["title", "lead", "body"] as const) {
      const v = c[campo]
      if (typeof v !== "string") continue
      s[campo] = v.trim() || null
      // El guion puede traer el mismo campo con su nombre en español: manda el nuevo.
      if (campo === "title") delete s.titulo
      if (campo === "body") {
        delete s.cuerpo
        delete s.text
      }
      tocadas.add(n)
    }
    const items = lista(c.items)
    if (items) {
      s.items = items.slice(0, 5)
      tocadas.add(n)
    }
    if (c.figura && typeof c.figura === "object") {
      const vieja = parseFigura(s.figura)
      if (!vieja) avisos.push(`La lámina ${n} no tiene figura: la dejé fuera.`)
      else {
        fuente ??= await fuenteDeCifras(f.content_angle_id, JSON.stringify(slides))
        const r = figuraCambiada(vieja, c.figura, fuente)
        if ("aviso" in r) avisos.push(`La figura de la lámina ${n} ${r.aviso}: la dejé como estaba.`)
        else {
          s.figura = r.figura
          tocadas.add(n)
        }
      }
    }
  }
  const cierre = respuesta.cierre as Record<string, unknown> | null | undefined
  if (cambios.cierre && cierre && typeof cierre === "object") {
    for (const campo of ["title", "body"] as const) {
      const v = limpio(cambios.cierre[campo])
      if (v) {
        cierre[campo] = v
        tocadas.add(indices.length + 1)
      }
    }
  }
  const p = pie(cambios, f.payload)
  if (p.cambio) {
    respuesta.caption = p.caption
    respuesta.hashtags = p.hashtags
  }
  if (!tocadas.size && !p.cambio) throw new Error(avisos[0] ?? "El cambio no tocaba nada del carrusel.")
  // El diseño libre tiene el texto viejo dibujado dentro: con texto nuevo ya no sirve.
  if (tocadas.size) delete respuesta.diseno_libre

  await supabase.from("jobs_instagram").update({ respuesta }).eq("id", f.job_instagram_id)
  if (!tocadas.size) {
    await supabase.from("content_pieces").update({ payload: { ...f.payload, caption: p.caption, hashtags: p.hashtags } }).eq("id", f.id)
    return { tocadas: [], avisos }
  }

  try {
    const payload = await rehacerDesdeGuion(accountId, f, respuesta, { caption: p.caption, hashtags: p.hashtags })
    const n = [...tocadas].sort((a, b) => a - b)
    return { tocadas: n, avisos: [...avisos, ...apretadas(payload, n)] }
  } catch (e) {
    await supabase.from("jobs_instagram").update({ respuesta: antes }).eq("id", f.job_instagram_id)
    throw new Error(`No se pudo volver a armar el carrusel: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Vuelve a maquetar y dibujar un carrusel desde su guion, con las fotos que
 * elija (no evita las que tenia). Es lo que se hace cuando no hay maqueta que
 * redibujar: deja la maqueta guardada, y desde ahi se marca por huecos.
 */
export async function rehacerDesdeGuion(
  accountId: string,
  f: Pick<Fila, "id" | "payload" | "job_instagram_id" | "content_angle_id">,
  respuesta: Record<string, unknown>,
  pie: { caption?: string; hashtags?: string[] }
): Promise<CarouselPayload> {
  const supabase = supabaseAdmin()
  if (!f.job_instagram_id) throw new Error("Esta pieza no conserva el guion del que salió.")
  const [{ data: cfg }, { data: hermana }] = await Promise.all([
    supabase.from("generation_config").select("carousel").eq("account_id", accountId).maybeSingle(),
    supabase
      .from("content_pieces")
      .select("id, payload")
      .eq("job_instagram_id", f.job_instagram_id)
      .eq("network", "facebook")
      .is("published_at", null)
      .maybeSingle(),
  ])
  const estilo = estiloDesdeConfig((cfg as { carousel?: unknown } | null)?.carousel)
  const carrusel = await generarCarrusel(
    f.job_instagram_id,
    accountId,
    respuesta,
    await noticiaDelAngulo(f.content_angle_id),
    // Se queda en el modo en que estaba, salvo el diseño libre: su diseño ya no sirve.
    { ...estilo, diseno: f.payload.modoDiseno === "mecanico" ? "mecanico" : "plantillas" },
    await nichosConocidos(accountId),
    Boolean(hermana)
  )
  const payload = { ...carrusel, caption: pie.caption ?? carrusel.caption, hashtags: pie.hashtags ?? carrusel.hashtags }
  const { error } = await supabase.from("content_pieces").update({ payload, publish_error: null }).eq("id", f.id)
  if (error) throw new Error(error.message)
  await registrarUsos(accountId, f.id, "instagram", carrusel.fotosBiblioteca)
  const portadaFb = carrusel.portadaFacebook ?? carrusel.images[0]
  if (hermana && portadaFb) {
    const h = hermana as { id: string; payload: Record<string, unknown> }
    await supabase.from("content_pieces").update({ payload: { ...h.payload, image: portadaFb } }).eq("id", h.id)
  }
  return payload
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lo marcado tal como llega de la pantalla, sin nada que no sea de una marca. */
export function limpiarSelecciones(v: unknown): Seleccion[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 20).flatMap((x): Seleccion[] => {
    if (!x || typeof x !== "object") return []
    const o = x as Record<string, unknown>
    const lamina = Number(o.lamina)
    if (typeof o.pieceId !== "string" || !UUID.test(o.pieceId) || !Number.isInteger(lamina) || lamina < 1) return []
    const red = o.red === "instagram" || o.red === "linkedin" ? o.red : undefined
    const item = Number(o.item)
    return [
      {
        pieceId: o.pieceId,
        ...(red ? { red } : {}),
        lamina,
        campo: typeof o.campo === "string" && o.campo ? o.campo.slice(0, 60) : null,
        ...(Number.isInteger(item) && item > 0 ? { item } : {}),
        html: typeof o.html === "string" ? o.html.slice(0, 800) : "",
        texto: typeof o.texto === "string" ? o.texto.slice(0, 400) : "",
        etiqueta: typeof o.etiqueta === "string" && o.etiqueta ? o.etiqueta.slice(0, 80) : `L${lamina}`,
      },
    ]
  })
}
