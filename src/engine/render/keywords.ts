import type { RawNews } from "@/lib/types"

import { terminosLiteralesAgro } from "./keywords-agro"

/**
 * De que buscar las fotos del carrusel.
 *
 * La regla: **no buscar lo obvio**. Si todo el corpus es de IA, ilustrar con
 * fotos de "IA" da carruseles identicos entre si y ademas vacios — cerebros de
 * neon y circuitos que no dicen nada. Lo que hace la foto util es el otro lado
 * del tema: si la noticia habla de IA y abogados, se buscan abogados; si habla
 * de IA y comida, se busca comida.
 *
 * Asi que se descarta el vocabulario del sector y se conserva lo concreto.
 */

/**
 * Lo que casi siempre es el nicho y casi nunca la foto interesante.
 *
 * En minusculas y sin tildes; la comparacion normaliza.
 */
const VOCABULARIO_DEL_SECTOR = new Set([
  "ai",
  "a.i",
  "artificial intelligence",
  "inteligencia artificial",
  "machine learning",
  "deep learning",
  "llm",
  "llms",
  "gpt",
  "chatbot",
  "algorithm",
  "algoritmo",
  "model",
  "modelo",
  "models",
  "modelos",
  "tech",
  "technology",
  "tecnologia",
  "software",
  "hardware",
  "startup",
  "startups",
  "saas",
  "venture capital",
  "vc",
  "funding",
  "investment",
  "inversion",
  "data",
  "datos",
  "cloud",
  "api",
  "app",
  "digital",
  "innovation",
  "innovacion",
  "platform",
  "plataforma",
  "company",
  "empresa",
  "business",
  "negocio",
  "industry",
  "industria",
  "market",
  "mercado",
  "launch",
  "lanzamiento",
  "release",
  "update",
  "news",
  "noticia",
  "report",
  "informe",

  // Las marcas del sector son tan implicitas como el nicho, y ademas en un banco
  // de fotos no existen: buscarlas devuelve el mismo imaginario generico de
  // circuitos y pantallas que se querian evitar.
  "openai",
  "anthropic",
  "claude",
  "chatgpt",
  "gemini",
  "copilot",
  "deepmind",
  "google",
  "meta",
  "microsoft",
  "nvidia",
  "apple",
  "amazon",
  "tesla",
  "spacex",

  // Palabras de titular: dicen que paso, no que se ve.
  "warning",
  "warnings",
  "call",
  "calls",
  "claim",
  "claims",
  "researcher",
  "researchers",
  "investigador",
  "investigadores",
  "study",
  "estudio",
  "growth",
  "crecimiento",
  "revenue",
  "ingresos",
  "billion",
  "million",
  "percent",
  "quarter",
  "trimestre",
])

/** Palabras vacias que nunca son un buen termino de busqueda. */
const RUIDO = new Set([
  "the","and","for","with","from","that","this","have","has","was","were","are","its","new",
  "more","than","says","said","after","over","into","about","como","para","con","desde","que",
  "esta","este","son","los","las","del","por","una","uno","sus","mas","segun","tras","sobre",
  "entre","cuando","donde","porque","aunque","pero","muy","ser","estar","haber","hacer",
])

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Marcadores que el analisis deja en `keywords_matched` y no son temas.
 *
 * Se filtran por frase completa porque, palabra a palabra, "pending" y
 * "enrichment" no llaman la atencion.
 */
const NO_SON_TEMAS = new Set(["pending enrichment", "sin analizar", "n a", "none", "null"])

/**
 * Quita de un termino lo que es implicito y devuelve lo que queda.
 *
 * Las keywords del analisis llegan como frases —"openai rogue agents",
 * "ai security"— asi que filtrar por frase completa no sirve de nada: hay que
 * podar palabra a palabra y quedarse con el resto. De "ai security" sale
 * "security", que es lo que de verdad se quiere ver en la foto.
 *
 * Devuelve `null` cuando no sobrevive nada util.
 */
function podar(termino: string, nichos: string[]): string | null {
  const limpio = normalizar(termino)
  if (limpio.length === 0 || NO_SON_TEMAS.has(limpio)) return null

  const vetadas = new Set([
    ...VOCABULARIO_DEL_SECTOR,
    ...nichos.map((n) => normalizar(n)).filter(Boolean),
  ])

  const supervivientes = limpio
    .split(" ")
    .filter((palabra) => palabra.length >= 3 && !vetadas.has(palabra) && !RUIDO.has(palabra))

  if (supervivientes.length === 0) return null

  // Mas de tres palabras deja de ser una busqueda y pasa a ser una frase: los
  // bancos de fotos devuelven poco o nada.
  return supervivientes.slice(0, 3).join(" ")
}

/**
 * Fotos neutras cuando no queda nada concreto.
 *
 * Texturas y espacios, nunca "tecnologia": una foto abstracta no dice nada
 * falso, mientras que un circuito de neon sugiere un tema que quiza no es el de
 * la noticia.
 */
const RESPALDO = [
  "minimal texture",
  "abstract paper",
  "empty workspace",
  "city morning",
  "hands working",
]

/**
 * Los terminos con los que buscar, del mas concreto al mas generico.
 *
 * `keywords_matched` primero, porque son las que el analisis considero
 * relevantes; luego el tema del segmento y las palabras largas del titulo.
 */
export function terminosDeBusqueda(
  news: RawNews | null,
  nichos: string[] = [],
  literales = false
): string[] {
  if (!news) return [...RESPALDO]

  // En modo literal se ilustra el tema de frente y traducido al ingles, que es
  // el idioma del banco de fotos. Hoy solo hay diccionario del campo (ver
  // `keywords-agro.ts`); si no reconoce nada, se busca como siempre.
  if (literales) {
    const literalesAgro = terminosLiteralesAgro(news.title, news.tema, news.keywords_matched)
    if (literalesAgro.length > 0) return literalesAgro
  }

  const vetados = [...nichos, news.niche]
  const terminos: string[] = []

  const anadir = (bruto: string | null | undefined) => {
    if (!bruto) return
    const podado = podar(bruto, vetados)
    if (!podado || podado.length < 3) return
    if (terminos.includes(podado)) return
    terminos.push(podado)
  }

  for (const keyword of news.keywords_matched ?? []) anadir(keyword)

  // El tema del segmento suele traer el "otro lado" del nicho: "cybersecurity",
  // "founder story", "cloud hardware".
  anadir(news.tema)

  // Del titulo, solo las palabras con cuerpo: las cortas son ruido.
  for (const palabra of normalizar(news.title).split(" ")) {
    if (palabra.length >= 5) anadir(palabra)
  }

  // Siempre queda algo con lo que ilustrar, aunque no sea especifico.
  return terminos.length > 0 ? [...terminos, ...RESPALDO] : [...RESPALDO]
}
