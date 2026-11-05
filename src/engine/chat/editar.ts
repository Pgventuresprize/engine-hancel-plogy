import { guardarVersion, versionesDe } from "../content/versiones"
import { cifrasInventadas, figurasDelKit, parseFigura, type Figura, type ItemFigura, type TipoFigura } from "../marca/figuras"
import { elegirDeBiblioteca, hayFotosEnBiblioteca, registrarUsos } from "../marca/imagenes"
import { FORMATOS, kitActivo, type KitCargado } from "../marca/kit"
import type { Hueco, Plantilla } from "../marca/kit-modelo"
import { generarCarrusel, nichosConocidos, noticiaDelAngulo, parseInstagramResponse, type CarouselPayload } from "../render/carousel"
import type { MaquetaGuardada, VarianteLamina } from "../render/kit-carrusel"
import { disenarLamina } from "../render/kit-lamina"
import { cargarFotosLibre, claveKit, type FotoGuardada } from "../render/kit-libre-pasos"
import { quitado } from "../render/kit-maqueta"
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
 *
 * En un carrusel con maqueta, ademas del texto y las fotos se puede cambiar la
 * plantilla de una lamina por otra del kit o pedir que se rediseñe a partir de la
 * suya (render/kit-lamina.ts). Una pieza no limita lo que se puede pedir: limita
 * lo que se inventa (cifras) y lo que ya salio publicado.
 */

export type ModoEdicion = "huecos" | "guion" | "post"

type HuecoEditable = Pick<Hueco, "nombre" | "tipo" | "max" | "min_items" | "max_items" | "descripcion"> & { valor: string | string[] }

export type Editable =
  | {
      modo: "huecos"
      pieceId: string
      laminas: {
        n: number
        tipo: string
        /** La plantilla con que esta hecha y su clave en el catalogo. */
        plantilla: string
        clave: string
        /** Lo que se pidio al rediseñarla, si se rediseño. */
        disenada: string | null
        huecos: HuecoEditable[]
        foto: "tiene" | "puede" | "no"
        figura: Figura | null
      }[]
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
  /** Solo para poner una figura en una lamina que no tiene. */
  tipo?: TipoFigura
  columnas?: string[]
  titulo?: string
  items?: Partial<Pick<ItemFigura, "texto" | "nota" | "cifra" | "valor" | "celdas">>[]
}

/** Lo que el agente devuelve en el bloque ```cambios. */
export type Cambios = {
  /** La pieza que cambia (P1, P2...), cuando el agente tiene varias delante. */
  pieza?: string
  motivo?: string
  laminas?: {
    n: number
    /** La clave de otra plantilla del kit. */
    plantilla?: string
    /** Lo que se pide rediseñar de la lamina, partiendo de su plantilla. */
    diseno?: string
    textos?: Record<string, string>
    listas?: Record<string, string[]>
    foto?: "otra"
    /** Como tiene que ser la foto, si se pidio algo concreto. */
    foto_pide?: string
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
  /** Vuelve a maquetar el carrusel sin tocar su texto: otro diseño, el mismo contenido. */
  rehacer?: { pedido?: string; mas_fotos?: boolean }
}

export type Aplicado = { version: number | null; tocadas: number[]; avisos: string[]; motivo: string }

/** Lo que dejo el diseñador por lamina: la variante y su foto, o por que no salio. */
export type Disenos = Record<string, { variante?: VarianteLamina; foto?: FotoGuardada["origen"]; motivo?: string }>

/** Si el cambio pide rediseñar alguna lamina: esos tardan y van como trabajo. */
export const pideDiseno = (c: Cambios): boolean => Boolean(c.rehacer) || Boolean(c.laminas?.some((l) => typeof l.diseno === "string" && l.diseno.trim()))

type Fila = {
  id: string
  status: string
  network: string
  payload: Record<string, unknown>
  published_at: string | null
  content_angle_id: string
  job_instagram_id: string | null
  job_linkedin_id: string | null
}

/** Como se nombra una plantilla ante el agente: su id es demasiado largo para escribirlo. */
const claveDe = (p: Plantilla) => p.id.slice(0, 8)

const admiteFoto = (p: Plantilla, v?: VarianteLamina | null) => (v ? v.conFoto : p.foto.usa !== "no")

async function filaDe(accountId: string, pieceId: string): Promise<Fila> {
  const { data } = await supabaseAdmin()
    .from("content_pieces")
    .select("id, status, network, payload, published_at, content_angle_id, job_instagram_id, job_linkedin_id")
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
  if (payload.postPropio)
    return "Es un post que se subió como imágenes: su texto se leyó de las láminas. Al cambiarlo se vuelve a maquetar con el kit y las imágenes originales quedan en el historial de versiones."
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
          plantilla: p.nombre,
          clave: claveDe(p),
          disenada: l.variante?.pedido ?? null,
          foto: l.foto ? "tiene" : admiteFoto(p, l.variante) ? "puede" : "no",
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
  const lectura = ((respuesta ?? {}) as { lectura?: { avisos?: unknown } }).lectura
  return {
    modo: "guion",
    pieceId,
    caption,
    hashtags,
    porque: [porqueGuion(f.payload, kc), ...textos(lectura?.avisos)].join(" "),
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
          `## Lámina ${l.n} (${l.tipo}, plantilla "${l.plantilla}" ${l.clave}${l.disenada ? `, rediseñada: ${l.disenada}` : ""})`,
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

/** Las plantillas del kit, para que el agente pueda cambiar la de una lamina. */
export function catalogoDelKit(kc: KitCargado): string {
  const lineas = kc.plantillas.map((p) => {
    const foto = p.foto.usa === "no" ? "sin foto" : `foto ${p.foto.usa} (${p.foto.uso === "inserto" ? "dentro de la lámina" : "de fondo"})`
    const huecos = p.huecos.map((h) => `${h.nombre}${h.obligatorio ? "*" : ""}${h.tipo === "figura" ? " (figura)" : h.tipo === "lista" ? ` (lista, ${h.max} c/u)` : ` (${h.max})`}`)
    return `- ${claveDe(p)} · ${p.tipo} · ${p.nombre} · fondo ${p.fondo} · ${foto} · huecos: ${huecos.join(", ")}. ${p.cuando_usar}`
  })
  return `# LAS PLANTILLAS DEL KIT DE LA MARCA\n\nEl asterisco es hueco obligatorio; el número, los caracteres que caben.\n\n${lineas.join("\n")}`
}

const REGLA_FIGURA = `- "figura" cambia la figura de esa lámina: {"titulo": "…", "items": [{"texto": "…", "cifra": "…"}, …]}. En "items" van todos sus elementos, en orden, con lo que cambia de cada uno (texto, nota, cifra, valor o celdas); sin "items" quedan como están. Una cifra que no esté en la noticia ni en el carrusel no entra: no inventes datos.`

const EJEMPLO_CAMBIOS: Record<ModoEdicion, string> = {
  huecos: `{"motivo": "Dos láminas con foto", "laminas": [{"n": 1, "textos": {"titulo": "…"}}, {"n": 6, "listas": {"puntos": ["…", "…", "…"]}}, {"n": 4, "figura": {"titulo": "…"}}, {"n": 8, "foto": "otra"}, {"n": 3, "plantilla": "<clave>", "textos": {"titulo": "…", "cuerpo": "…"}, "foto": "otra"}, {"n": 5, "diseno": "Foto a sangre detrás del texto, con velo para que se lea", "foto": "otra"}]}`,
  guion: `{"motivo": "Acortó el titular de la portada", "laminas": [{"n": 1, "hook": "…"}, {"n": 3, "title": "…", "body": "…"}], "cierre": {"title": "…"}}`,
  post: `{"motivo": "Reescribió el gancho", "parrafos": {"1": "…", "4": ""}}`,
}

const REGLAS_CAMBIOS: Record<ModoEdicion, string[]> = {
  huecos: [
    `- En "textos" va cada hueco de texto que cambia, con su texto nuevo completo; en "listas", cada lista que cambia, completa. Solo los huecos que tiene esa lámina, con sus nombres exactos.`,
    `- Respeta el máximo de caracteres de cada hueco: si no cabe, no se lee.`,
    `- "foto": "otra" le pone a esa lámina una foto de la biblioteca de la marca, o le cambia la que tiene. Si se pidió cómo tiene que ser, añade "foto_pide" con la descripción.`,
    `- "plantilla": "<clave>" pasa la lámina a otra plantilla del kit, de la lista de plantillas. Llena en "textos" los huecos de la nueva, sin perder nada de lo que dice la lámina: si tenía algo en un hueco que la nueva no tiene (una fuente, un antetítulo), pásalo a otro hueco. Una lámina con figura solo va a una plantilla con hueco de figura. Si la plantilla lleva foto, añade "foto": "otra".`,
    `- "diseno": "<lo que se pidió>" rediseña esa lámina partiendo de su plantilla y del carrusel: su texto no cambia. Úsalo cuando ninguna plantilla del kit dé lo que te pidieron: una foto detrás del texto en una lámina que no la lleva, otra composición, otro fondo. Escribe lo que se pidió, concreto. Si lleva foto, añade "foto": "otra". Va con su texto si también lo cambias.`,
    `- Si te piden fotos o imágenes en general, decide tú en qué láminas: primero las que se prestan, nunca encima de una figura.`,
    `- Donde el texto admite *resaltado*, se marca con asteriscos, como ya viene.`,
    REGLA_FIGURA,
    `- Para poner una figura en una lámina que no tiene, manda "figura" con su forma completa, junto con "plantilla": la clave de una plantilla con hueco de figura. Tabla: {"tipo": "tabla", "columnas": ["…", "…"], "items": [{"celdas": ["…", "…"]}]}, hasta 6 filas y 36 caracteres por celda. Pastillas: {"tipo": "pastillas", "items": [{"texto": "…"}]}, hasta 10. Si quedan datos fuera de la figura, déjalos en "textos".`,
    `- "diseno" solo cambia cómo se ve lo que ya hay: nunca agrega una figura, una tabla ni texto. Si la persona pide una tabla o un gráfico, usa "figura". Si un aviso dice que no se pudo, cuéntale ese motivo y no prometas volver a intentarlo igual.`,
  ],
  guion: [
    `- En cada lámina, solo los campos que cambian (hook en la portada; lead, title, body o items en las demás), con su texto nuevo completo. El cierre va aparte, en "cierre".`,
    `- "rehacer": {"pedido": "<lo que se pidió, con sus palabras>", "mas_fotos": true} vuelve a maquetar el carrusel con las plantillas del kit sin cambiar su texto: mismas láminas, mismo contenido, otro diseño. Úsalo cuando pidan más fotos, más gráficos, más visual u otro diseño. Pon "mas_fotos" en true solo si pidieron fotos. No tiene "laminas" salvo que también pidan cambiar un texto. Tarda: di en una frase lo que vas a hacer, en futuro, y no digas que ya quedó.`,
    REGLA_FIGURA,
    `- Al aplicarlo, el carrusel se vuelve a maquetar: avísalo en una frase si puede cambiar el aspecto.`,
  ],
  post: [`- En "parrafos", el número de cada párrafo que cambia y su texto nuevo completo. "" lo quita. Para añadir uno, ponlo junto a otro separado por una línea en blanco.`],
}

/** Como se escribe el bloque de cambios para las piezas que el agente tiene delante. */
export function contratoDeCambios(modos: ModoEdicion[], varias: boolean): string {
  const usados = [...new Set(modos)]
  const conHuecos = usados.includes("huecos")
  const reglas = usados.flatMap((m) => (usados.length > 1 ? [`Para una pieza por ${m === "huecos" ? "plantillas" : m}:`, ...REGLAS_CAMBIOS[m]] : REGLAS_CAMBIOS[m]))
  return `# CÓMO CAMBIAS LA PIEZA

Si la persona pide un cambio en una pieza, hazlo tú. Primero dile en una o dos frases qué cambiaste, con el texto nuevo. Al final, sin nada después, añade el bloque con el cambio:

\`\`\`cambios
${usados.map((m) => EJEMPLO_CAMBIOS[m]).join("\n")}
\`\`\`

- "motivo": lo que cambió, de 3 a 8 palabras, como se lee en el historial de versiones.
${reglas.join("\n")}
- "caption" (texto nuevo completo) y "hashtags" (lista) solo si cambian.
- Cambia solo lo que se pide. Si marcó partes de la pieza, solo esas: lo demás queda igual.
${varias ? `- Con varias piezas, cada cambio lleva "pieza" con su etiqueta (P1, P2...). Si el pedido vale para varias ("los carruseles", "todos"), el bloque es una lista con un cambio por pieza: [{"pieza": "P1", ...}, {"pieza": "P2", ...}].\n` : ""}${conHuecos || varias ? `- Un cambio con "diseno" o en varias piezas no se aplica al instante: se pone a trabajar y sale como tarjeta. Entonces di en una frase lo que vas a hacer, en futuro, y no digas que ya quedó.\n` : ""}- Lo que te pidan se hace: que una plantilla no lo traiga no es motivo para decir que no, ni para mandar a la persona a otro agente. ${conHuecos ? `Cambia la plantilla o rediseña la lámina.` : ""} Solo dos cosas no se hacen: inventar cifras o datos, y tocar lo ya publicado.
- Si lo pedido puede costar algo (menos legibilidad, un texto que no cabe), hazlo igual y avísalo en una frase.
- Si el pedido no se entiende, pregunta y no pongas el bloque.
- Nunca digas que cambiaste algo si no pones el bloque: sin bloque, la pieza no cambia.`
}

/** Separa la prosa del bloque ```cambios. */
export function leerCambios(texto: string): { prosa: string; cambios: Cambios[] | null; error: string | null } {
  const m = texto.match(/```cambios\s*([\s\S]*?)(```|$)/)
  const prosa = texto.replace(/```[\s\S]*$/, "").trim()
  if (!m) return { prosa, cambios: null, error: null }
  try {
    const c = JSON.parse(m[1].trim()) as Cambios | Cambios[]
    const lista = Array.isArray(c) ? c : [c]
    if (!lista.length || lista.some((x) => !x || typeof x !== "object" || Array.isArray(x))) throw new Error("no es un objeto")
    return { prosa, cambios: lista, error: null }
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

/** Lo que se tolera perder al pasar a una plantilla: lo que suelta quien parte una frase. */
const TEXTO_PERDIDO = 0.1

const limpio = (t: unknown) => (typeof t === "string" ? t.trim() : null)
const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : null)

/**
 * Aplica los cambios y guarda la version nueva. Lanza con un motivo claro si no
 * se puede; si el carrusel no se puede volver a dibujar, la pieza queda como estaba.
 */
export async function aplicarCambios(o: { accountId: string; pieceId: string; cambios: Cambios; agente: string; disenos?: Disenos }): Promise<Aplicado> {
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
    r = maqueta && kc ? await aplicarHuecos(o.accountId, f, kc, maqueta, o.cambios, o.disenos ?? {}) : await aplicarGuion(o.accountId, f, o.cambios)
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

/**
 * Una figura para una lamina que no tenia. Tiene que entrar entera: una tabla a la
 * que se le cae una fila dice otra cosa, y ahi es mejor no ponerla y decirlo.
 */
function figuraNueva(c: CambioFigura, p: Plantilla, kc: KitCargado, fuente: string): { figura: Figura } | { aviso: string } {
  if (!p.huecos.some((h) => h.tipo === "figura")) return { aviso: `la plantilla "${p.nombre}" no tiene dónde dibujarla: va junto con "plantilla", en una que tenga hueco de figura` }
  const delKit = figurasDelKit(kc.kit.parciales)
  const figura = parseFigura(c, delKit)
  if (!figura) return { aviso: `no es una figura válida; el kit dibuja ${delKit.join(", ")}` }
  if (Array.isArray(c.items) && figura.items.length < c.items.length) return { aviso: `traía ${c.items.length} elementos y en una ${figura.tipo} caben ${figura.items.length}` }
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

/** La plantilla del kit con esa clave. */
const plantillaPorClave = (kc: KitCargado, clave: string) => kc.plantillas.find((p) => p.id === clave || claveDe(p) === clave.trim())

/** Una foto de la biblioteca para una lamina, sin repetir las que ya se usan. */
async function fotoParaLamina(o: {
  accountId: string
  f: Fila
  plantilla: Plantilla
  uso: Plantilla["foto"]["uso"]
  texto: string
  pide?: string
  evitar: string[]
}): Promise<{ imagenId: string; motivo: string } | null> {
  if (!(await hayFotosEnBiblioteca(o.accountId))) return null
  const pide = o.pide?.trim()
  const { ancho, alto } = FORMATOS[o.plantilla.formato]
  const elegidas = await elegirDeBiblioteca({
    accountId: o.accountId,
    huecos: [{ indice: 0, uso: o.uso, texto: pide ? `${pide}. ${o.texto}` : o.texto, tono: o.plantilla.foto.tono, espacio: o.plantilla.foto.espacio }],
    terminos: [...(pide ? [pide] : []), ...textos(o.f.payload.terminosFoto)],
    evitar: o.evitar,
    // Dentro de la lamina la foto ocupa cerca de la mitad; de fondo, toda.
    salida: { ancho, alto: o.uso === "inserto" ? Math.round(alto * 0.5) : alto },
    obligatoria: true,
  })
  const elegida = elegidas.get(0)
  return elegida ? { imagenId: elegida.imagenId, motivo: elegida.motivo } : null
}

const textoDeLamina = (l: Pick<MaquetaGuardada["laminas"][number], "textos" | "listas">) =>
  [...Object.values(l.textos), ...Object.values(l.listas).flat()].join(". ")

async function aplicarHuecos(
  accountId: string,
  f: Fila,
  kc: KitCargado,
  maqueta: MaquetaGuardada,
  cambios: Cambios,
  disenos: Disenos
): Promise<Omit<Aplicado, "version" | "motivo">> {
  const supabase = supabaseAdmin()
  const laminas = maqueta.laminas.map((l) => ({ ...l, textos: { ...l.textos }, listas: { ...l.listas } }))
  const tocadas = new Set<number>()
  const avisos: string[] = []
  let nuevasFotos: { n: number; imagenId: string; motivo: string }[] = []
  let fuente: string | null = null

  for (const c of cambios.laminas ?? []) {
    const n = Number(c?.n)
    const l = laminas[n - 1]
    if (!l) {
      avisos.push(`La lámina ${c?.n} no existe: la dejé fuera.`)
      continue
    }
    let p = kc.plantillas.find((x) => x.id === l.plantilla) as Plantilla
    const hueco = (nombre: string) => p.huecos.find((h) => h.nombre === nombre)
    // Un cambio de plantilla que no se puede completar deja la lamina como estaba.
    const copia = { ...l, textos: { ...l.textos }, listas: { ...l.listas } }
    const yaTocada = tocadas.has(n)
    const deshacer = (aviso: string) => {
      laminas[n - 1] = copia
      if (!yaTocada) tocadas.delete(n)
      nuevasFotos = nuevasFotos.filter((x) => x.n !== n)
      avisos.push(aviso)
    }
    const pedirDiseno = typeof c.diseno === "string" && Boolean(c.diseno.trim())
    if (typeof c.plantilla === "string" && c.plantilla.trim()) {
      const nueva = plantillaPorClave(kc, c.plantilla)
      if (!nueva) {
        avisos.push(`El kit no tiene la plantilla ${c.plantilla}: la lámina ${n} quedó como estaba.`)
        continue
      }
      if (l.figura && !nueva.huecos.some((h) => h.tipo === "figura")) {
        avisos.push(`La plantilla "${nueva.nombre}" no dibuja la figura de la lámina ${n}: quedó como estaba.`)
        continue
      }
      const quedan = new Set(nueva.huecos.map((h) => h.nombre))
      l.plantilla = nueva.id
      l.textos = Object.fromEntries(Object.entries(l.textos).filter(([k]) => quedan.has(k)))
      l.listas = Object.fromEntries(Object.entries(l.listas).filter(([k]) => quedan.has(k)))
      delete l.variante
      if (nueva.foto.usa === "no") l.foto = null
      p = nueva
      tocadas.add(n)
    }
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
    if (l.plantilla !== copia.plantilla) {
      const falta = p.huecos.find((h) => h.obligatorio && h.tipo !== "figura" && !(h.tipo === "lista" ? l.listas[h.nombre]?.length : l.textos[h.nombre]?.trim()))
      if (falta) {
        deshacer(`La plantilla "${p.nombre}" pide "${falta.nombre}" y no lo llené: la lámina ${n} quedó como estaba.`)
        continue
      }
      const perdido = quitado(textoDeLamina(copia), textoDeLamina(l))
      if (perdido.cifras.length) avisos.push(`Al cambiar la plantilla, la lámina ${n} perdió estas cifras: ${perdido.cifras.join(", ")}.`)
    }
    if (c.figura && typeof c.figura === "object") {
      fuente ??= await fuenteDeCifras(
        f.content_angle_id,
        laminas.flatMap((x) => [...Object.values(x.textos), ...Object.values(x.listas).flat()]).join(" ")
      )
      if (!l.figura) {
        const r = figuraNueva(c.figura, p, kc, fuente)
        if ("aviso" in r) {
          deshacer(`La figura de la lámina ${n} no se pudo poner: ${r.aviso}.`)
          continue
        }
        l.figura = r.figura
        delete l.variante
        tocadas.add(n)
      } else {
        const r = figuraCambiada(l.figura, c.figura, fuente)
        if ("aviso" in r) avisos.push(`La figura de la lámina ${n} ${r.aviso}: la dejé como estaba.`)
        else {
          l.figura = r.figura
          tocadas.add(n)
        }
      }
    }
    // Con diseño, la foto ya la eligio quien diseño: la ve al diseñar.
    const hayQuePonerFoto = !pedirDiseno && (c.foto === "otra" || (l.plantilla !== copia.plantilla && p.foto.usa === "obligatoria" && !l.foto))
    if (hayQuePonerFoto) {
      if (!admiteFoto(p, l.variante)) {
        avisos.push(`La plantilla de la lámina ${n} no lleva foto: pide rediseñarla si la quieres.`)
        continue
      }
      const elegida = await fotoParaLamina({
        accountId,
        f,
        plantilla: p,
        uso: l.variante ? "fondo" : p.foto.uso,
        texto: textoDeLamina(l),
        pide: c.foto_pide,
        evitar: laminas.flatMap((x) => (x.foto?.tipo === "biblioteca" ? [x.foto.imagenId] : [])),
      })
      if (!elegida) {
        const aviso = `No encontré otra foto en la biblioteca que sirva para la lámina ${n} y tenga la resolución que necesita.`
        if (p.foto.usa === "obligatoria" && !l.foto) deshacer(aviso)
        else avisos.push(aviso)
        continue
      }
      l.foto = { tipo: "biblioteca", imagenId: elegida.imagenId, motivo: elegida.motivo }
      nuevasFotos.push({ n, ...elegida })
      tocadas.add(n)
    }
    if (pedirDiseno) {
      const d = disenos[String(n)]
      if (!d?.variante) {
        avisos.push(`No pude rediseñar la lámina ${n}: ${d?.motivo ?? "no salió el diseño"}.`)
        continue
      }
      l.variante = d.variante
      if (d.foto) {
        l.foto = d.foto
        if (d.foto.tipo === "biblioteca") nuevasFotos.push({ n, imagenId: d.foto.imagenId, motivo: d.foto.motivo })
      }
      tocadas.add(n)
    }
  }

  const p = pie(cambios, f.payload)
  if (!tocadas.size && !p.cambio) throw new Error(avisos[0] ?? "El cambio no tocaba nada del carrusel.")

  const fotosBiblioteca = [
    ...((f.payload.fotosBiblioteca as { lamina: number; imagenId: string; motivo: string }[] | undefined) ?? []).filter(
      (x) => !nuevasFotos.some((nf) => nf.n === x.lamina) && laminas[x.lamina - 1]?.foto?.tipo === "biblioteca"
    ),
    ...nuevasFotos.map((x) => ({ lamina: x.n, imagenId: x.imagenId, motivo: x.motivo })),
  ].sort((a, b) => a.lamina - b.lamina)
  const payload = {
    ...f.payload,
    maqueta: { ...maqueta, laminas },
    caption: p.caption,
    hashtags: p.hashtags,
    fotosBiblioteca,
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

/** Laminas que se diseñan a la vez en una pasada. */
const DISENOS_A_LA_VEZ = 3
/** Sin esto por delante no se empieza otra tanda: no cabria entera. */
const MARGEN_TANDA_MS = 130_000

const leerImagen = async (url: string): Promise<Buffer | null> => {
  try {
    const r = await fetch(url, { cache: "no-store" })
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  } catch {
    return null
  }
}

/**
 * Diseña las laminas que el cambio pide rediseñar. Avanza lo que cabe hasta
 * `hasta` y devuelve lo hecho: quien llama lo guarda y sigue en otra pasada, sin
 * volver a pagar lo que ya salio. Lanza si Claude no responde, sin perder `hechos`.
 */
export async function disenarCambios(o: {
  accountId: string
  pieceId: string
  cambios: Cambios
  hechos: Disenos
  hasta: number
  alAvance?: (etiqueta: string) => Promise<void>
}): Promise<{ hechos: Disenos; faltan: number }> {
  const hechos = { ...o.hechos }
  let resto = (o.cambios.laminas ?? []).filter((c) => typeof c.diseno === "string" && c.diseno.trim() && !(String(c.n) in hechos))
  if (!resto.length) return { hechos, faltan: 0 }

  const f = await filaDe(o.accountId, o.pieceId)
  const kc = await kitActivo(o.accountId)
  const maqueta = maquetaUsable(f.payload, kc)
  if (!maqueta || !kc) {
    const motivo = "este carrusel no está hecho con las plantillas del kit de ahora"
    for (const c of resto) hechos[String(c.n)] = { motivo }
    return { hechos, faltan: 0 }
  }
  const urls = textos(f.payload.images)
  const leidas = await Promise.all(urls.map(leerImagen))
  const imagenes = leidas.every(Boolean) ? (leidas as Buffer[]) : []
  // Lo elegido en esta tanda tampoco se repite.
  const usadas = maqueta.laminas.flatMap((x) => (x.foto?.tipo === "biblioteca" ? [x.foto.imagenId] : []))
  for (const d of Object.values(hechos)) if (d.foto?.tipo === "biblioteca") usadas.push(d.foto.imagenId)

  while (resto.length && Date.now() + MARGEN_TANDA_MS < o.hasta) {
    const tanda = resto.slice(0, DISENOS_A_LA_VEZ)
    resto = resto.slice(DISENOS_A_LA_VEZ)
    await o.alAvance?.(`Diseñando ${tanda.length === 1 ? `la lámina ${tanda[0].n}` : `las láminas ${tanda.map((c) => c.n).join(", ")}`}`)
    const encargos = []
    for (const c of tanda) {
      const n = Number(c.n)
      const l = maqueta.laminas[n - 1]
      const clave = String(c.n)
      if (!l) {
        hechos[clave] = { motivo: "esa lámina no existe" }
        continue
      }
      const plantilla = (typeof c.plantilla === "string" && plantillaPorClave(kc, c.plantilla)) || (kc.plantillas.find((p) => p.id === l.plantilla) as Plantilla)
      const pedido = (c.diseno as string).trim()
      const datos = { textos: { ...l.textos, ...c.textos }, listas: { ...l.listas, ...c.listas } }
      const quiereFoto = c.foto === "otra" || (!l.foto && /\b(foto|imagen|fotograf)/i.test(pedido))
      let origen: FotoGuardada["origen"] | null = l.foto
      if (quiereFoto) {
        const elegida = await fotoParaLamina({ accountId: o.accountId, f, plantilla, uso: "fondo", texto: textoDeLamina(datos), pide: c.foto_pide, evitar: usadas })
        if (elegida) {
          origen = { tipo: "biblioteca", ...elegida }
          usadas.push(elegida.imagenId)
        } else if (!l.foto) {
          hechos[clave] = { motivo: "no encontré una foto en la biblioteca que sirva y tenga la resolución que necesita" }
          continue
        }
      }
      encargos.push({ n, clave, l, plantilla, pedido, datos, origen })
    }
    await Promise.all(
      encargos.map(async ({ n, clave, l, plantilla, pedido, datos, origen }) => {
        const [foto] = origen ? await cargarFotosLibre(o.accountId, [{ clave: "foto", lamina: n, descripcion: "", origen }]) : []
        const r = await disenarLamina({
          accountId: o.accountId,
          kc,
          plantilla,
          n,
          total: maqueta.laminas.length,
          ...datos,
          figura: l.figura ?? null,
          foto: foto?.datos ?? null,
          imagenes,
          pedido,
          hasta: o.hasta,
        })
        hechos[clave] = r.ok ? { variante: r.variante, ...(origen && origen !== l.foto ? { foto: origen } : {}) } : { motivo: r.motivo }
      })
    )
  }
  return { hechos, faltan: resto.length }
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

/**
 * Lo que no llego a dibujarse. Mira los huecos de la plantilla, no lo guardado: el
 * reparto guarda textos en huecos que la plantilla no tiene y esos no se ven.
 */
export function textoPerdido(respuesta: Record<string, unknown>, payload: CarouselPayload, kc: KitCargado | null): string[] {
  const maqueta = (payload as unknown as { maqueta?: MaquetaGuardada }).maqueta
  if (!maqueta || !kc) return []
  const { slides } = parseInstagramResponse(respuesta)
  const dibujado = (l: MaquetaGuardada["laminas"][number]) => {
    const huecos = new Set(kc.plantillas.find((p) => p.id === l.plantilla)?.huecos.map((h) => h.nombre) ?? [])
    const de = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => huecos.has(k)))
    return [textoDeLamina({ textos: de(l.textos), listas: de(l.listas) }), ...(l.figura?.items.flatMap((x) => [x.texto, x.nota ?? "", x.cifra ?? "", ...(x.celdas ?? [])]) ?? [])].join(" ")
  }
  const faltaTexto: number[] = []
  const faltaFuente: number[] = []
  slides.forEach((s, i) => {
    const l = maqueta.laminas[i]
    if (!l) return
    const visto = dibujado(l)
    const propio = s.type === "photo_hook" ? (s.hook ?? "") : [s.lead, s.title, s.body, ...(s.items ?? [])].filter(Boolean).join(" ")
    const q = quitado(propio, visto)
    if (q.cifras.length || q.parteDePalabras > TEXTO_PERDIDO) faltaTexto.push(i + 1)
    if (s.type === "text" && s.fuente && quitado(s.fuente, visto).parteDePalabras > 0.5) faltaFuente.push(i + 1)
  })
  const enLas = (n: number[]) => (n.length === 1 ? `la lámina ${n[0]}` : `las láminas ${n.join(", ")}`)
  return [
    ...(faltaTexto.length ? [`En ${enLas(faltaTexto)} el texto no entró entero en la plantilla: compáralas con la versión anterior.`] : []),
    ...(faltaFuente.length ? [`La fuente de ${enLas(faltaFuente)} no tiene sitio en su plantilla y no salió.`] : []),
  ]
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
  const rehacer = cambios.rehacer
  if (rehacer) for (let n = 1; n <= indices.length + (cierre ? 1 : 0); n++) tocadas.add(n)
  if (!tocadas.size && !p.cambio) throw new Error(avisos[0] ?? "El cambio no tocaba nada del carrusel.")
  // El diseño libre tiene el texto viejo dibujado dentro: con texto nuevo ya no sirve.
  if (tocadas.size) delete respuesta.diseno_libre

  if (!tocadas.size) {
    await supabase.from("jobs_instagram").update({ respuesta }).eq("id", f.job_instagram_id)
    await supabase.from("content_pieces").update({ payload: { ...f.payload, caption: p.caption, hashtags: p.hashtags } }).eq("id", f.id)
    return { tocadas: [], avisos }
  }

  try {
    const payload = await rehacerDesdeGuion(accountId, f, respuesta, { caption: p.caption, hashtags: p.hashtags }, rehacer)
    // El guion se guarda con el dibujo ya hecho: si el proceso muere antes, no quedan desparejos.
    const { error: errorGuion } = await supabase.from("jobs_instagram").update({ respuesta }).eq("id", f.job_instagram_id)
    if (errorGuion) throw new Error(errorGuion.message)
    const n = [...tocadas].sort((a, b) => a - b)
    return {
      tocadas: n,
      avisos: [
        ...avisos,
        ...apretadas(payload, n),
        ...(rehacer
          ? [
              ...textoPerdido(respuesta, payload, await kitActivo(accountId)),
              ...(payload.avisosKit ?? []),
              ...(f.status === "approved" ? ["Como cambió el diseño, hay que aprobarla otra vez antes de que salga."] : []),
            ]
          : []),
      ],
    }
  } catch (e) {
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
  pie: { caption?: string; hashtags?: string[] },
  /** Lo que se pidio para esta version, si se esta rehaciendo por el diseño. */
  visual?: Cambios["rehacer"]
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
    {
      ...estilo,
      diseno: f.payload.modoDiseno === "mecanico" ? "mecanico" : "plantillas",
      pedidoVisual: pedidoDeDiseno(visual),
      masFotos: visual?.mas_fotos === true,
      plazoMaquetaMs: PLAZO_MAQUETA_REHACER_MS,
    },
    await nichosConocidos(accountId),
    Boolean(hermana)
  )
  // Las notas de un post subido siguen sirviendo para decidir cuando sale, y el caption
  // que escribio el agente sigue siendo suyo: la propuesta lo muestra para que lo revisen.
  const notas = {
    ...(typeof f.payload.notasPost === "string" ? { notasPost: f.payload.notasPost } : {}),
    ...(f.payload.captionEscrito === true ? { captionEscrito: true } : {}),
  }
  const payload = { ...carrusel, ...notas, caption: pie.caption ?? carrusel.caption, hashtags: pie.hashtags ?? carrusel.hashtags }
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

/** Vercel corta la pasada a los 300 s: las fotos y dibujar 10 laminas necesitan lo demas. */
const PLAZO_MAQUETA_REHACER_MS = 170_000

/** Lo que se pidio, como lo lee el maquetador. */
export function pedidoDeDiseno(visual: Cambios["rehacer"]): string | undefined {
  if (!visual) return undefined
  const pedido = limpio(visual.pedido)?.slice(0, 500) ?? ""
  const fotos = visual.mas_fotos ? "Prefiere plantillas con foto en todas las láminas donde se pueda, también en las de lista." : ""
  return [pedido, fotos].filter(Boolean).join("\n") || undefined
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
