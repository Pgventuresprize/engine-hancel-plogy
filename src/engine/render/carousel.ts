import type { RawNews } from "@/lib/types"

import { supabaseAdmin } from "../supabase-admin"
import { terminosDeBusqueda } from "./keywords"
import { BancoDeFotos, descargarFotoPexels, pexelsConfigurado } from "./pexels"
import {
  descargarFoto,
  descargarInserto,
  MAX_SLIDES,
  MIN_SLIDES,
  necesitanFoto,
  parseSlides,
  renderSlide,
  repartirVariantes,
} from "./render"
import { subirCarrusel, subirImagenSuelta } from "./storage"
import type { Slide } from "./templates"
import { ESTILO_POR_DEFECTO, type Estilo } from "./theme"

/**
 * De la respuesta del agente de Instagram al carrusel subido.
 *
 * Igual que con las otras redes, la app es la que materializa: el agente solo
 * escribe su buzon. Aqui ademas hay dos pasos que las otras no tienen —buscar
 * fotos y dibujar— que pueden fallar por motivos ajenos al texto.
 */

export type CarouselPayload = {
  caption: string
  hashtags: string[]
  /** En orden: es el orden del carrusel. */
  images: string[]
  slideCount: number
  /** Si la portada salio sin foto, para poder revisarlo despues. */
  portadaSinFoto: boolean
  /** Con que se buscaron las fotos de banco, para entender por que salieron esas. */
  terminosFoto: string[]
  /** Creditos de Pexels: la licencia no lo exige, pero se agradece. */
  creditos: { autor: string; url: string }[]
  /**
   * La portada redibujada para Facebook, sin numeracion ni "desliza".
   *
   * Facebook publica una sola imagen, asi que reutilizar la del carrusel metia
   * en el feed un "1 / 6" y una invitacion a deslizar que no llevan a ninguna
   * parte. Es la misma lamina y la misma foto, dibujada otra vez sin esos dos
   * elementos: una llamada mas a Satori y ni una a Pexels.
   */
  portadaFacebook?: string
}

/** Lo que el agente deja en `jobs_instagram.respuesta`. */
/**
 * Repone las tildes que el modelo se deja, solo donde no hay duda.
 *
 * Al agente se le pide en el prompt que escriba en español correcto y ahora el
 * prompt entero va acentuado, que era la causa de fondo: leyendo instrucciones
 * sin tildes, imitaba esa forma de escribir. Esto es la red de debajo.
 *
 * Solo entra lo que no puede significar otra cosa. "anos" por "años" no es una
 * falta cualquiera, es otra palabra. "-cion" al final de palabra siempre lleva
 * tilde, y su plural "-ciones" nunca. Lo ambiguo se queda fuera a proposito:
 * "esta" puede ser "está" o el demostrativo, "cayo" puede ser "cayó" o el
 * accidente del terreno, y arreglar a medias es peor que no arreglar.
 */
const CON_TILDE: Record<string, string> = {
  ademas: "además",
  ahi: "ahí",
  alli: "allí",
  ano: "año",
  anos: "años",
  aqui: "aquí",
  asi: "así",
  compania: "compañía",
  credito: "crédito",
  dia: "día",
  dias: "días",
  despues: "después",
  economia: "economía",
  energia: "energía",
  estan: "están",
  habia: "había",
  habian: "habían",
  hectarea: "hectárea",
  hectareas: "hectáreas",
  mananas: "mañanas",
  manana: "mañana",
  mas: "más",
  millon: "millón",
  nino: "niño",
  ninos: "niños",
  numero: "número",
  pais: "país",
  paises: "países",
  pequeno: "pequeño",
  podria: "podría",
  podrian: "podrían",
  proximo: "próximo",
  proxima: "próxima",
  quiza: "quizá",
  segun: "según",
  senal: "señal",
  sera: "será",
  seran: "serán",
  tambien: "también",
  tecnologia: "tecnología",
  ultima: "última",
  ultimo: "último",
  via: "vía",
  vias: "vías",
  agricola: "agrícola",
  agricolas: "agrícolas",
  analisis: "análisis",
  area: "área",
  areas: "áreas",
  basica: "básica",
  basico: "básico",
  deficit: "déficit",
  dificil: "difícil",
  facil: "fácil",
  indice: "índice",
  indices: "índices",
  kilometro: "kilómetro",
  kilometros: "kilómetros",
  logistica: "logística",
  maximo: "máximo",
  minimo: "mínimo",
  politica: "política",
  politicas: "políticas",
  rapido: "rápido",
  tramite: "trámite",
  tramites: "trámites",
  unico: "único",
  unica: "única",
  // Del agro, sin ambigüedad posible.
  acido: "ácido",
  acidos: "ácidos",
  acida: "ácida",
  acidas: "ácidas",
  comun: "común",
  comunes: "comunes",
  criticos: "críticos",
  debil: "débil",
  debiles: "débiles",
  nitrogeno: "nitrógeno",
  pequena: "pequeña",
  pequenas: "pequeñas",
  pequenos: "pequeños",
  arbol: "árbol",
  arboles: "árboles",
  cafe: "café",
  cafes: "cafés",
  fosforo: "fósforo",
  limon: "limón",
  maiz: "maíz",
  organico: "orgánico",
  organica: "orgánica",
  organicos: "orgánicos",
  organicas: "orgánicas",
  platano: "plátano",
  platanos: "plátanos",
  quimico: "químico",
  quimicos: "químicos",
  raiz: "raíz",
  raices: "raíces",
  tecnico: "técnico",
  tecnica: "técnica",
}

/** Conserva la mayuscula inicial de la palabra original. */
function comoEstaba(original: string, corregida: string): string {
  return original[0] === original[0].toUpperCase()
    ? corregida[0].toUpperCase() + corregida.slice(1)
    : corregida
}

export function arreglarOrtografia(texto: string): string {
  return (
    texto
      // Palabras de la lista cerrada.
      .replace(/[a-zA-ZáéíóúñÁÉÍÓÚÑ]+/g, (palabra) => {
        const fijada = CON_TILDE[palabra.toLowerCase()]
        return fijada ? comoEstaba(palabra, fijada) : palabra
      })
      // "-cion" final siempre lleva tilde; "-ciones" nunca. Igual "-sion". El
      // lookahead exige final de palabra: sin el, la regla tambien entraria en el
      // plural y escribiria "decisiónes". La o se pone en la caja que traia,
      // para que "PRODUCCION" no salga "PRODUCción".
      .replace(/([a-záéíóúñ])([cs]i)(o)(n)(?![a-záéíóúñ])/gi, (_m, antes, ci, o, n) =>
        `${antes}${ci}${o === "O" ? "Ó" : "ó"}${n}`
      )
  )
}

export function parseInstagramResponse(respuesta: unknown): {
  caption: string
  hashtags: string[]
  slides: Slide[]
  /** Las busquedas de foto que eligio quien escribio el carrusel. */
  fotos: string[]
  /** La cosa concreta que va recortada en la portada. Vacio = sin elemento. */
  elemento: string
} {
  const raiz = (respuesta ?? {}) as Record<string, unknown>

  const slides = parseSlides(raiz.slides).map((slide) =>
    slide.type === "photo_hook"
      ? { ...slide, hook: slide.hook ? arreglarOrtografia(slide.hook) : slide.hook }
      : {
          ...slide,
          title: slide.title ? arreglarOrtografia(slide.title) : slide.title,
          body: slide.body ? arreglarOrtografia(slide.body) : slide.body,
          lead: slide.lead ? arreglarOrtografia(slide.lead) : slide.lead,
          items: slide.items ? slide.items.map(arreglarOrtografia) : slide.items,
        }
  )
  if (slides.length < MIN_SLIDES) {
    throw new Error(
      `El agente de Instagram devolvio ${slides.length} slides utiles y hacen falta al menos ` +
        `${MIN_SLIDES}. Se esperaba {"caption":"...","hashtags":[...],"slides":[{"n":1,` +
        `"type":"photo_hook","hook":"..."},{"n":2,"type":"text","title":"...","body":"..."}]}.`
    )
  }

  const caption = typeof raiz.caption === "string" ? arreglarOrtografia(raiz.caption.trim()) : ""
  const hashtags = Array.isArray(raiz.hashtags)
    ? raiz.hashtags
        .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
        .map((h) => (h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`))
    : []

  // Las busquedas de foto las decide quien escribe el carrusel: es el unico
  // que sabe de que va cada lamina. Antes salian de las palabras del titular,
  // y eso daba montañas para una noticia de cannabis o un puesto de fruta para
  // una de leche, porque el titular casi nunca nombra lo que hay que fotografiar.
  const fotos = Array.isArray(raiz.fotos)
    ? raiz.fotos
        .filter((f): f is string => typeof f === "string" && f.trim().length > 2)
        .map((f) => f.trim().toLowerCase())
        .slice(0, 8)
    : []

  const elemento =
    typeof raiz.elemento === "string" && raiz.elemento.trim().length > 2
      ? raiz.elemento.trim()
      : ""

  return { caption, hashtags, slides, fotos, elemento }
}

/**
 * Dibuja y sube el carrusel entero.
 *
 * Las imagenes se generan en serie y no en paralelo: son hasta diez PNG de
 * 1080x1350 y hacerlas a la vez dispara la memoria de la funcion sin ganar gran
 * cosa, porque el cuello es el propio render.
 */
export async function generarCarrusel(
  pieceKey: string,
  respuesta: unknown,
  news: RawNews | null,
  estilo: Estilo = ESTILO_POR_DEFECTO,
  nichos: string[] = [],
  /** Dibuja ademas la portada suelta que usa Facebook. */
  conPortadaFacebook = false
): Promise<CarouselPayload> {
  const { caption, hashtags, slides, fotos, elemento } = parseInstagramResponse(respuesta)

  // Plogy tiene su propia estructura de laminas, no la clasica recoloreada.
  if (estilo.plantilla === "plogy") {
    return generarCarruselPlogy(pieceKey, { caption, hashtags, slides, fotos, elemento }, news, estilo, nichos, conPortadaFacebook)
  }

  // El cierre es una lamina de marca, no del guion: se añade aqui y no se le
  // pide al agente. Va siempre, porque la llamada a seguir la cuenta es lo
  // unico que convierte un carrusel en algo que deja audiencia detras, y
  // dejarla al criterio de cada generacion era garantizar que faltara. Si el
  // guion ya llega al tope de Instagram se recorta una lamina para hacerle
  // sitio, en vez de pasarse.
  if (slides.length >= MAX_SLIDES) slides.length = MAX_SLIDES - 1

  const variantes = repartirVariantes(slides, estilo.usarFotos && pexelsConfigurado())
  slides.push({
    n: slides.length + 1,
    type: "text",
    title: estilo.cierre.titulo,
    body: estilo.cierre.texto,
  })
  variantes.push("cierre")

  // El logo y la captura se descargan una vez: Satori necesita los bytes, no
  // una URL. La captura solo si el cierre la va a usar.
  const logo = await descargarFoto(estilo.logo)
  const perfil =
    estilo.cierre.estilo === "perfil" ? await descargarFoto(estilo.perfil) : null

  // El elemento de la portada: la cosa concreta de la que habla la noticia,
  // buscada en internet y no en el banco de fotos. Es opcional de verdad: si no
  // aparece nada utilizable la portada sale como siempre, sin hueco raro.
  const hallado = news?.account_id ? await buscarInserto(elemento, news.account_id) : null
  const inserto = hallado?.imagen ?? null
  // Un logo apaisado recortado a cuadro pierde las puntas y deja de leerse:
  // "Asocolflores" salia como "socolflore". Lo cuadrado se rellena, que luce
  // mejor; lo que no lo es se encaja entero aunque queden margenes.
  // Se rellena siempre que el recorte no se coma lo importante. El margen es
  // amplio a proposito: encajar deja la imagen flotando pequeña dentro del
  // circulo, y eso se ve peor que un recorte leve por los lados.
  const insertoAjuste =
    hallado && hallado.proporcion > 0.62 && hallado.proporcion < 1.6 ? "llenar" : "encajar"
  const insertoPos = Math.floor(Math.random() * 4)
  // La forma tambien se sortea: dos formas evitan que una serie de posts se lea
  // como una plantilla, y las dos funcionan igual de bien.
  const insertoForma = Math.random() < 0.5 ? "circulo" : "cuadrado"
  const conFoto = necesitanFoto(variantes)

  // Lo que pidio el agente manda; el rastreo del titular queda de respaldo por
  // si la respuesta viene sin busquedas.
  const terminos =
    fotos.length > 0 ? fotos : terminosDeBusqueda(news, nichos, estilo.fotosLiterales)
  const banco = new BancoDeFotos(terminos)
  const creditos: { autor: string; url: string }[] = []

  /** Una foto nueva del banco, o `null` si ya no queda ninguna sin usar. */
  const delBanco = async (): Promise<string | null> => {
    if (!estilo.usarFotos || !pexelsConfigurado()) return null

    // `siguiente()` no repite dentro del mismo post: lleva la cuenta de lo ya
    // servido y va agotando terminos antes que reutilizar una foto.
    const elegida = await banco.siguiente()
    if (!elegida) return null

    const descargada = await descargarFotoPexels(elegida)
    if (descargada && elegida.autor) {
      creditos.push({ autor: elegida.autor, url: elegida.autorUrl })
    }
    return descargada
  }

  // La portada se resuelve antes que nada y con red de seguridad, porque es la
  // unica lamina que no puede salir sin foto: es lo que frena el pulgar en el
  // feed, y una portada de solo texto sobre negro es un post que nadie abre.
  //
  // Primero el banco, que da fotos grandes y distintas en cada post. Si no
  // devuelve nada —sin clave de Pexels, red caida, terminos agotados— se recurre
  // a la imagen de la noticia: es una miniatura de unos 300px y se ve mas
  // blanda, pero una portada blanda es mejor que una portada vacia.
  const fotoPortada = (await delBanco()) ?? (await descargarFoto(news?.image_url))
  const sinFotoPortada = fotoPortada === null

  // El antetitulo situa el post antes de que nadie lea el titular. Sale del tema
  // del segmento, que es lo mas concreto que la noticia trae siempre.
  const etiqueta = (news?.tema ?? news?.niche ?? "").trim() || null

  const imagenes: Buffer[] = []

  for (const [indice, slide] of slides.entries()) {
    const foto =
      indice === 0
        ? fotoPortada
        : conFoto[indice] || variantes[indice] === "cierre"
          ? await delBanco()
          : null

    imagenes.push(
      await renderSlide(
        {
          slide,
          variante: variantes[indice],
          foto,
          etiqueta,
          logo,
          inserto: indice === 0 ? inserto : null,
          insertoPos,
          insertoForma,
          insertoAjuste,
          perfil,
        },
        slides.length,
        estilo
      )
    )
  }

  const images = await subirCarrusel(pieceKey, imagenes)

  // La de Facebook se dibuja aparte y con la misma foto: total 1 y sin
  // paginacion, que es lo que quita el "1 / 6" y el "desliza".
  let portadaFacebook: string | undefined
  if (conPortadaFacebook && slides[0]) {
    const png = await renderSlide(
      {
        slide: slides[0],
        variante: variantes[0],
        foto: fotoPortada,
        etiqueta,
        // La misma portada, con lo mismo encima. Se dibuja aparte solo para
        // quitarle la numeracion y el "desliza", que en una imagen suelta
        // invitan a un gesto que no existe; todo lo demas tiene que venir
        // igual, y el elemento se quedaba fuera por no pasarlo aqui.
        inserto,
        insertoPos,
        insertoForma,
        insertoAjuste,
      },
      1,
      { ...estilo, mostrarPaginacion: false }
    )
    portadaFacebook = await subirImagenSuelta(pieceKey, "facebook", png)
  }

  return {
    caption,
    hashtags,
    images,
    ...(portadaFacebook ? { portadaFacebook } : {}),
    slideCount: slides.length,
    portadaSinFoto: sinFotoPortada,
    terminosFoto: terminos.slice(0, 6),
    creditos,
  }
}

/** La noticia de la que salio el angulo, para la foto de portada. */
export async function noticiaDelAngulo(angleId: string): Promise<RawNews | null> {
  const supabase = supabaseAdmin()

  const { data: angle } = await supabase
    .from("content_angles")
    .select("raw_news_id")
    .eq("id", angleId)
    .maybeSingle()

  const rawNewsId = (angle as { raw_news_id: string } | null)?.raw_news_id
  if (!rawNewsId) return null

  const { data } = await supabase.from("raw_news").select("*").eq("id", rawNewsId).maybeSingle()
  return (data as RawNews) ?? null
}

/** Los slugs de categoria, que son lo implicito y no deben buscarse en el banco. */
export async function nichosConocidos(accountId: string): Promise<string[]> {
  const { data } = await supabaseAdmin()
    .from("engine_categories")
    .select("slug")
    .eq("account_id", accountId)
  return ((data ?? []) as { slug: string }[]).map((row) => row.slug)
}

export { MAX_SLIDES, MIN_SLIDES }


/**
 * El elemento recortado de la portada, ya descargado.
 *
 * Se piden varias candidatas y se prueban en orden: la primera que se pueda
 * descargar de verdad gana. Muchas imagenes de resultados vienen de sitios que
 * bloquean la descarga directa o sirven HTML en vez de la imagen, asi que
 * quedarse con la primera sin comprobarla dejaria la portada sin elemento la
 * mitad de las veces.
 *
 * Se prueban las mas cuadradas primero: el hueco es cuadrado, y cuanto mas se
 * aleje la imagen de esa forma peor queda, se recorte o se encaje.
 */
async function buscarInserto(
  consulta: string,
  accountId: string
): Promise<{ imagen: string; proporcion: number } | null> {
  if (!consulta) return null

  try {
    const { searchImage } = await import("../serper")
    const candidatas = await searchImage(accountId, consulta)
    if (candidatas.length === 0) return null

    // Primero las que mejor encajan en un hueco cuadrado. Una muy apaisada hay
    // que encajarla con margenes y se ve pequeña dentro del circulo.
    const porForma = [...candidatas].sort(
      (a, b) => Math.abs(Math.log(a.ancho / a.alto)) - Math.abs(Math.log(b.ancho / b.alto))
    )

    // Y entre las mejores, una al azar. Coger siempre la primera hacia que dos
    // noticias del mismo gremio salieran con exactamente la misma imagen, y en
    // un feed eso se lee como contenido repetido aunque el texto sea distinto.
    const buenas = porForma.slice(0, 6)
    for (let i = buenas.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[buenas[i], buenas[j]] = [buenas[j], buenas[i]]
    }

    for (const imagen of buenas) {
      const descargada = await descargarInserto(imagen.url)
      if (descargada) return { imagen: descargada, proporcion: imagen.ancho / imagen.alto }
    }
  } catch {
    // Una busqueda caida no puede tumbar el carrusel: es un adorno, no el post.
  }

  return null
}

// ------------------------------------------------------------------- plogy

/**
 * El carrusel con la estructura de Plogy (ver `plogy.tsx`): las laminas del
 * guion con su composicion y su fondo alternado, y el cierre de marca.
 */
async function generarCarruselPlogy(
  pieceKey: string,
  guion: ReturnType<typeof parseInstagramResponse>,
  news: RawNews | null,
  estilo: Estilo,
  nichos: string[],
  conPortadaFacebook: boolean
): Promise<CarouselPayload> {
  const { renderPlogy, fotoEnByN, repartirPlogy } = await import("./plogy")
  const { caption, hashtags, fotos, elemento } = guion
  const slides = guion.slides.slice(0, MAX_SLIDES - 1)

  const terminos = fotos.length > 0 ? fotos : terminosDeBusqueda(news, nichos, estilo.fotosLiterales)
  const banco = new BancoDeFotos(terminos)
  const creditos: { autor: string; url: string }[] = []
  const delBanco = async (): Promise<string | null> => {
    if (!estilo.usarFotos || !pexelsConfigurado()) return null
    const elegida = await banco.siguiente()
    if (!elegida) return null
    const descargada = await descargarFotoPexels(elegida)
    if (descargada && elegida.autor) creditos.push({ autor: elegida.autor, url: elegida.autorUrl })
    return descargada
  }

  const [logoClaro, logoOscuro] = await Promise.all([descargarFoto(estilo.logoClaro), descargarFoto(estilo.logoOscuro)])
  const hallado = news?.account_id ? await buscarInserto(elemento, news.account_id) : null
  const tema = [news?.niche, news?.tema].filter(Boolean).join(" + ")
  const reparto = repartirPlogy(slides.map((s) => ({ items: s.type === "text" ? s.items : null })))
  const total = slides.length + 1
  const titularDe = (s: Slide) => (s.type === "photo_hook" ? (s.hook ?? "") : (s.title ?? ""))

  const imagenes: Buffer[] = []
  let fotoPortada: string | null = null
  for (const [i, slide] of slides.entries()) {
    const { composicion, fondo } = reparto[i]
    const necesitaFoto = composicion === "portada" || composicion === "foto"
    const foto = necesitaFoto ? await fotoEnByN((await delBanco()) ?? (i === 0 ? await descargarFoto(news?.image_url) : null)) : null
    if (i === 0) fotoPortada = foto
    imagenes.push(
      await renderPlogy({
        composicion,
        fondo,
        titular: titularDe(slide),
        cuerpo: slide.type === "text" ? slide.body : null,
        lead: slide.type === "text" ? slide.lead : null,
        items: slide.type === "text" ? (slide.items ?? undefined) : undefined,
        foto,
        inserto: i === 0 ? (hallado?.imagen ?? null) : null,
        n: i + 1,
        total,
        tema,
        handle: estilo.marca,
        logoClaro,
        logoOscuro,
      })
    )
  }

  // El cierre: la marca y una sola accion, en el fondo que le toque.
  imagenes.push(
    await renderPlogy({
      composicion: "cierre",
      fondo: slides.length % 2 === 0 ? "tinta" : "papel",
      titular: estilo.cierre.titulo,
      cuerpo: estilo.cierre.texto,
      n: total,
      total,
      tema,
      handle: estilo.marca,
      logoClaro,
      logoOscuro,
    })
  )

  const images = await subirCarrusel(pieceKey, imagenes)
  let portadaFacebook: string | undefined
  if (conPortadaFacebook && slides[0]) {
    const png = await renderPlogy({
      composicion: "portada",
      fondo: "tinta",
      titular: titularDe(slides[0]),
      foto: fotoPortada,
      inserto: hallado?.imagen ?? null,
      n: 1,
      total: 1,
      tema,
      handle: estilo.marca,
      logoClaro,
      logoOscuro,
    })
    portadaFacebook = await subirImagenSuelta(pieceKey, "facebook", png)
  }

  return {
    caption,
    hashtags,
    images,
    ...(portadaFacebook ? { portadaFacebook } : {}),
    slideCount: total,
    portadaSinFoto: fotoPortada === null,
    terminosFoto: terminos.slice(0, 6),
    creditos,
  }
}
