import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"
import { investigarNoticia, leerPagina } from "../redaccion/fuentes"
import { supabaseAdmin } from "../supabase-admin"
import type { Lectura } from "./modelo"

/**
 * Lo que el recurso sabe antes de escribirse: las fuentes leidas enteras y el
 * registro de verificacion.
 *
 * La redaccion lee cada fuente hasta 7.000 caracteres; un reporte no se puede
 * sostener asi. Aqui la noticia y las fuentes primarias se vuelven a leer con un
 * tope mucho mas alto, y de cada fuente queda dicho si se leyo completa, solo se
 * vio en la busqueda o no se pudo leer. "Que se sabe y que no" y "Fuentes" salen
 * de ese registro, no de la memoria de quien escribe.
 */

/** Hasta donde se lee una fuente para el recurso: un articulo largo cabe entero. */
const TOPE_LECTURA = 60_000
/** Lo que entra al prompt entre todas: unas 40.000 palabras de contexto. */
const MAX_TOTAL = 150_000
/** Cuantas fuentes se vuelven a leer enteras: la noticia y las primeras. */
const RELEER = 4

/** Una fuente como la ve el agente: con id corto, su lectura y su contenido. */
export type FuenteRecurso = {
  id: string
  url: string
  medio: string
  titulo: string
  fecha: string
  tipo: string
  origen: string
  lectura: Lectura
  contenido: string
}

const dominio = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/**
 * Las fuentes de la noticia, leidas a fondo. Investiga si aun no hay busqueda,
 * vuelve a leer la noticia y las primeras fuentes con el tope del recurso y
 * guarda lo leido (mas largo que lo de la redaccion, que lo sigue recortando).
 */
export async function fuentesDelRecurso(
  accountId: string,
  rawNewsId: string
): Promise<{ fuentes: FuenteRecurso[]; pendientes: { url: string; medio: string }[]; imagen: string | null }> {
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from("raw_news")
    .select("id, link, source, title, tema, date_serper, image_url, snippet")
    .eq("id", rawNewsId)
    .single()
  if (!data) throw new Error("La noticia del recurso ya no existe.")
  const news = data as { id: string; link: string; source: string | null; title: string; tema: string; date_serper: string | null; image_url: string | null; snippet: string | null }

  const { fuentes, imagenArticulo } = await investigarNoticia(accountId, news)
  const leidas = new Map<string, { texto: string; completa: boolean }>()
  const aReleer = fuentes.filter((f) => !/\.pdf($|\?)/i.test(f.url)).slice(0, RELEER)
  await Promise.all(
    aReleer.map(async (f) => {
      const p = await leerPagina(f.url, TOPE_LECTURA)
      if (!p?.texto) return
      leidas.set(f.id, { texto: p.texto, completa: p.texto.length < TOPE_LECTURA })
      if (p.texto.length > (f.contenido?.length ?? 0)) {
        await supabase.from("news_sources").update({ contenido: p.texto, updated_at: new Date().toISOString() }).eq("id", f.id)
      }
    })
  )

  const salida: FuenteRecurso[] = []
  const pendientes: { url: string; medio: string }[] = []
  let total = 0
  for (const f of fuentes) {
    const releida = leidas.get(f.id)
    const contenido = releida?.texto ?? f.contenido ?? f.extracto ?? ""
    if (!contenido.trim()) {
      pendientes.push({ url: f.url, medio: f.medio ?? dominio(f.url) })
      continue
    }
    const lectura: Lectura = releida ? (releida.completa ? "completa" : "recortada") : f.contenido ? "recortada" : "busqueda"
    const cabe = Math.min(contenido.length, Math.max(0, MAX_TOTAL - total))
    if (cabe < 400 && salida.length >= 3) break
    total += cabe
    salida.push({
      id: `f${salida.length + 1}`,
      url: f.url,
      medio: f.medio ?? dominio(f.url),
      titulo: f.titulo ?? "",
      fecha: f.fecha ?? "",
      tipo: f.tipo,
      origen: f.origen,
      lectura: cabe < contenido.length ? "recortada" : lectura,
      contenido: contenido.slice(0, cabe),
    })
  }
  return { fuentes: salida, pendientes, imagen: imagenArticulo ?? news.image_url }
}

// ------------------------------------------------------------------ registro

export type EstadoDato = "confirmado" | "de_terceros" | "sin_verificar"

export type Registro = {
  datos: { dato: string; estado: EstadoDato; fuentes: string[]; nota: string }[]
  /** Lo que gana cada fuente con contar la noticia: vende el producto, es parte, compite... */
  intereses: { fuente: string; interes: string }[]
  contradicciones: { tema: string; versiones: { fuente: string; dice: string }[] }[]
  no_se_sabe: string[]
}

export const MODELO_REGISTRO = "claude-sonnet-5-5"

const REGISTRO_SISTEMA = `Eres verificador de datos. Recibes una noticia y sus fuentes, cada una con un id (f1, f2...) y su contenido. Armas el registro de verificación que va a usar quien escriba un reporte sobre ella. No escribes el reporte: ordenas lo que se sabe.

QUÉ HACES
1. datos: cada dato que importa para contar la noticia (cifras, fechas, nombres, decisiones, características, precios, plazos), uno por línea, tal como lo dicen las fuentes y con su unidad. Para cada uno:
   - estado: "confirmado" si lo dice una fuente primaria (la organización que lo hizo o lo anunció, un documento oficial) o dos fuentes independientes; "de_terceros" si solo lo dice un medio o un tercero; "sin_verificar" si sale de una sola fuente débil, de un rumor o de una cifra que las fuentes dan distinta.
   - fuentes: los ids que lo dicen.
   - nota: la condición o reserva con que lo dicen ("según la empresa", "en sus pruebas", "hasta", "en promedio", "estimado"), o vacío.
2. intereses: para cada fuente que tenga un interés en la noticia (vende el producto del que habla, es parte, compite, es un comunicado), qué gana con contarla. Las demás no van.
3. contradicciones: cuando dos fuentes dicen cosas distintas del mismo punto (fecha, cifra, disponibilidad), las dos versiones con su fuente. No elijas una.
4. no_se_sabe: lo que una persona que lee querría saber y ninguna fuente dice.

REGLAS
- Solo lo que dicen las fuentes. Lo que sabes por tu cuenta no cuenta.
- Las cifras tal cual, con su unidad y su moneda. No conviertas ni redondees.
- Escribe en el idioma de la noticia que se pide.

RESPONDE SOLO con este JSON:
{"datos":[{"dato":"...","estado":"confirmado","fuentes":["f1"],"nota":""}],"intereses":[{"fuente":"f2","interes":"..."}],"contradicciones":[{"tema":"...","versiones":[{"fuente":"f1","dice":"..."},{"fuente":"f3","dice":"..."}]}],"no_se_sabe":["..."]}`

const cadena = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const lista = (v: unknown) => (Array.isArray(v) ? v : [])
const ids = (v: unknown) => lista(v).map(cadena).filter(Boolean)

export function normalizarRegistro(bruto: unknown): Registro {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})
  return {
    datos: lista(o.datos)
      .map(obj)
      .map((d) => ({
        dato: cadena(d.dato),
        estado: (["confirmado", "de_terceros", "sin_verificar"].includes(cadena(d.estado)) ? cadena(d.estado) : "sin_verificar") as EstadoDato,
        fuentes: ids(d.fuentes),
        nota: cadena(d.nota),
      }))
      .filter((d) => d.dato),
    intereses: lista(o.intereses)
      .map(obj)
      .map((i) => ({ fuente: cadena(i.fuente), interes: cadena(i.interes) }))
      .filter((i) => i.fuente && i.interes),
    contradicciones: lista(o.contradicciones)
      .map(obj)
      .map((c) => ({
        tema: cadena(c.tema),
        versiones: lista(c.versiones)
          .map(obj)
          .map((v) => ({ fuente: cadena(v.fuente), dice: cadena(v.dice) }))
          .filter((v) => v.dice),
      }))
      .filter((c) => c.tema && c.versiones.length >= 2),
    no_se_sabe: ids(o.no_se_sabe),
  }
}

export function textoFuentes(fuentes: FuenteRecurso[]): string {
  return fuentes
    .map((f) => `<fuente id="${f.id}" medio="${f.medio}" tipo="${f.tipo}" fecha="${f.fecha}" lectura="${f.lectura}" url="${f.url}">
${f.titulo ? `${f.titulo}\n` : ""}${f.contenido}
</fuente>`)
    .join("\n\n")
}

/** El registro de verificacion de la noticia, con Sonnet: ordena, no escribe. */
export async function armarRegistro(
  accountId: string,
  noticia: { title: string; idioma: string },
  fuentes: FuenteRecurso[]
): Promise<{ registro: Registro; uso: UsoClaude }> {
  const prompt = `NOTICIA: ${noticia.title}
IDIOMA: ${noticia.idioma}

FUENTES
${textoFuentes(fuentes)}`
  let error = ""
  for (let intento = 0; intento < 2; intento++) {
    const r = await llamarClaude({
      paso: "recurso-registro",
      accountId,
      model: MODELO_REGISTRO,
      system: REGISTRO_SISTEMA,
      prompt,
      maxTokens: 8000,
      timeoutMs: 180_000,
    })
    if (!r.ok) {
      error = r.error
      continue
    }
    try {
      return { registro: normalizarRegistro(parsearJSONDeClaude(r.texto)), uso: r.uso }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`No se pudo armar el registro de verificación: ${error}`)
}

/** El registro como lo lee quien escribe y quien revisa. */
export function textoRegistro(r: Registro): string {
  const datos = r.datos.map((d) => `- [${d.estado}] ${d.dato}${d.nota ? ` (${d.nota})` : ""} · ${d.fuentes.join(", ") || "sin fuente"}`)
  const intereses = r.intereses.map((i) => `- ${i.fuente}: ${i.interes}`)
  const contradicciones = r.contradicciones.map((c) => `- ${c.tema}: ${c.versiones.map((v) => `${v.fuente} dice «${v.dice}»`).join("; ")}`)
  return [
    "DATOS",
    ...(datos.length ? datos : ["(ninguno)"]),
    "",
    "INTERÉS DE LAS FUENTES",
    ...(intereses.length ? intereses : ["(ninguna declara interés)"]),
    "",
    "CONTRADICCIONES",
    ...(contradicciones.length ? contradicciones : ["(ninguna)"]),
    "",
    "LO QUE NO SE SABE",
    ...(r.no_se_sabe.length ? r.no_se_sabe.map((t) => `- ${t}`) : ["(nada anotado)"]),
  ].join("\n")
}
