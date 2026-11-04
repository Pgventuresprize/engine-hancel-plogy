import type { RawNews } from "@/lib/types"

import { cifrasInventadas, figurasDelKit, type TipoFigura } from "../marca/figuras"
import { elegirDeBiblioteca, hayFotosEnBiblioteca, type FotoElegida, type HuecoDeFoto } from "../marca/imagenes"
import { piezasDelKit } from "../marca/kit-piezas"
import { archivosComoDatos, armarLamina, CSS_SIN_PAGINACION, FORMATOS, medidasDe, type DatosLamina, type KitCargado } from "../marca/kit"
import type { Fondo, Plantilla } from "../marca/kit-modelo"
import type { CarouselPayload, parseInstagramResponse } from "./carousel"
import { terminosDeBusqueda } from "./keywords"
import { maquetar } from "./kit-maqueta"
import { laminasDeGuionClasico, repartirKit, type LaminaKit, type LaminaRepartida } from "./kit-reparto"
import { paginasDeFuente } from "./kit-libre"
import { cargarFotosLibre, claveKit, guionLibreDe, parseEstadoLibre, type EstadoLibre, type FotoGuardada } from "./kit-libre-pasos"
import { cerrarNavegador, dibujarLaminas, type LaminaDibujada, type OpcionesDibujo, type Problema } from "./navegador"
import { BancoDeFotos, descargarFotoPexels, pexelsConfigurado } from "./pexels"
import { MAX_SLIDES } from "./render"
import { subirCarrusel, subirImagenSuelta } from "./storage"
import type { Slide } from "./templates"
import type { Estilo } from "./theme"

/**
 * El carrusel dibujado con el kit activo de la marca: sus plantillas aprobadas,
 * rellenas con el guion y las fotos de la biblioteca, en un navegador de verdad.
 *
 * Lanza si el kit no puede enseñar alguna lamina o si el navegador falla dos
 * veces: generarCarrusel lo dibuja entonces con la plantilla de antes y la
 * ficha avisa de que salio con respaldo.
 */

/** Lo que el navegador encontro mal en la version final, por lamina (1 es la portada). */
export type ProblemaDibujo = Problema & { lamina: number }

/** Lo que el carrusel anota del kit con que se dibujo, para saber de donde salio. */
export type KitDelCarrusel = { id: string; version: number; nombre: string; plantillas: string[] }

/**
 * Lo que se dibujo en cada lamina con las plantillas del kit: que plantilla,
 * que texto en cada hueco y de donde salio su foto. Va en el payload de la
 * pieza para volver a dibujarla igual —sin volver a maquetar ni elegir otras
 * fotos— y para que el chat la enseñe y cambie una lamina sola.
 */
export type MaquetaGuardada = {
  /** El kit con que se dibujo (id y version): con otro kit, la maqueta ya no sirve. */
  kit: string
  laminas: {
    plantilla: string
    textos: Record<string, string>
    listas: Record<string, string[]>
    figura: LaminaKit["figura"]
    foto: FotoGuardada["origen"] | null
    variante?: VarianteLamina
  }[]
}

/**
 * La lamina que un agente rediseño desde el chat (kit-lamina.ts): su plantilla,
 * adaptada a lo que se pidio, con los mismos huecos. Se guarda en la maqueta y se
 * dibuja en lugar de la plantilla; el texto sigue siendo el de la lamina.
 */
export type VarianteLamina = {
  html: string
  fondo: Fondo
  conFoto: boolean
  /** Lo que se pidio: se enseña al agente cuando vuelve a esa lamina. */
  pedido: string
}

/** La plantilla con la que se dibuja una lamina: la del kit o su variante. */
export const plantillaDe = (p: Plantilla, v?: Pick<VarianteLamina, "html" | "fondo"> | null): Plantilla =>
  v ? { ...p, html: v.html, fondo: v.fondo } : p

/** Lo que hace falta rehacer: no cabe, se sale o choca. */
export const GRAVES = new Set<Problema["tipo"]>(["se_sale", "choca", "desborda", "letra_pequena"])

const graves = (d: LaminaDibujada) => d.problemas.filter((p) => GRAVES.has(p.tipo)).length

/** Lo que dice una lamina, para elegir una foto que vaya con ello. */
const textoDe = (l: LaminaKit) =>
  [...Object.values(l.textos), ...Object.values(l.listas).flat()].filter(Boolean).join(". ")

/**
 * Las figuras del guion que se pueden dibujar. Se quita (y se avisa) la que el
 * kit no sabe dibujar y la que trae una cifra que no esta en la noticia ni en el
 * texto del carrusel, salvo que se presente como ejemplo hipotetico: una figura
 * no puede ser el sitio por donde entra un dato inventado.
 */
export function figurasComprobadas(
  slides: Slide[],
  news: Pick<RawNews, "title" | "snippet" | "full_content" | "analysis_notes"> | null,
  delKit: TipoFigura[]
): { slides: Slide[]; avisos: string[] } {
  const textoDe = (s: Slide) =>
    s.type === "photo_hook" ? (s.hook ?? "") : [s.lead, s.title, s.body, ...(s.items ?? [])].filter(Boolean).join(" ")
  const fuente = [news?.title, news?.snippet, news?.full_content, news?.analysis_notes, ...slides.map(textoDe)]
    .filter(Boolean)
    .join(" ")
  const avisos: string[] = []
  const limpias = slides.map((s, i) => {
    if (s.type !== "text" || !s.figura) return s
    const { figura, ...sinFigura } = s
    if (!delKit.includes(figura.tipo)) {
      avisos.push(`Lámina ${i + 1}: el kit no tiene la figura "${figura.tipo}"; sale sin ella.`)
      return sinFigura
    }
    const inventadas = figura.hipotetico ? [] : cifrasInventadas(figura, fuente)
    if (inventadas.length) {
      avisos.push(
        `Lámina ${i + 1}: la figura traía cifras que no están en la noticia ni en el texto (${inventadas.join(", ")}); sale sin ella.`
      )
      return sinFigura
    }
    return s
  })
  return { slides: limpias, avisos }
}

/**
 * El carrusel de diseño libre, dibujado de la fuente que dejo el diseñador
 * (kit-libre-pasos.ts) con sus fotos, y subido. La portada de Facebook es la
 * misma lamina sin su paginacion.
 */
async function carruselLibre(
  pieceKey: string,
  accountId: string,
  kc: KitCargado,
  guion: ReturnType<typeof parseInstagramResponse>,
  libre: EstadoLibre,
  conPortadaFacebook: boolean
): Promise<CarouselPayload & { kit: KitDelCarrusel }> {
  const g = guionLibreDe(guion)
  const total = g.slides.length + (g.cierre ? 1 : 0)
  const fotos = await cargarFotosLibre(accountId, libre.fotos)
  const paginas = paginasDeFuente({ kc, fotos, archivos: await archivosComoDatos(kc), total }, libre.fuente ?? "")
  const { ancho, alto } = FORMATOS.carrusel_4x5
  const dibujadas = await dibujarConReintento(paginas, { ancho, alto, libre: { letraMinima: kc.kit.sistema.reglas.letra_minima } })
  const images = await subirCarrusel(
    pieceKey,
    dibujadas.map((d) => d.png)
  )
  let portadaFacebook: string | undefined
  if (conPortadaFacebook) {
    const [portada] = await dibujarConReintento([paginas[0].replace("</style>", `${CSS_SIN_PAGINACION}</style>`)], { ancho, alto })
    portadaFacebook = await subirImagenSuelta(pieceKey, "facebook", portada.png)
  }
  const problemasDibujo = dibujadas.flatMap((d, i) => d.problemas.map((p) => ({ ...p, lamina: i + 1 })))
  const fotosBiblioteca = libre.fotos.flatMap((f) =>
    f.origen.tipo === "biblioteca" ? [{ lamina: f.lamina, imagenId: f.origen.imagenId, motivo: f.origen.motivo }] : []
  )
  return {
    caption: guion.caption,
    hashtags: guion.hashtags,
    images,
    ...(portadaFacebook ? { portadaFacebook } : {}),
    slideCount: total,
    portadaSinFoto: !fotos.some((f) => f.lamina === 1),
    terminosFoto: guion.fotos.slice(0, 6),
    creditos: libre.fotos.flatMap((f) => (f.origen.tipo === "pexels" ? [{ autor: f.origen.foto.autor, url: f.origen.foto.autorUrl }] : [])),
    ...(guion.plan.length ? { plan: guion.plan } : {}),
    ...(fotosBiblioteca.length ? { fotosBiblioteca } : {}),
    kit: { id: kc.kit.id, version: kc.kit.version, nombre: kc.kit.nombre, plantillas: [] },
    ...(problemasDibujo.length ? { problemasDibujo } : {}),
    ...(libre.avisos.length ? { avisosKit: libre.avisos } : {}),
    disenoLibre: { rondas: libre.rondas, puntaje: libre.puntaje, piezas: libre.piezas },
    modoDiseno: "inteligencia",
  }
}

/** Un fallo del navegador (se cayo, tardo demasiado) merece otro intento con uno nuevo. */
async function dibujarConReintento(htmls: string[], medidas: OpcionesDibujo) {
  try {
    return await dibujarLaminas(htmls, medidas)
  } catch {
    await cerrarNavegador()
    return dibujarLaminas(htmls, medidas)
  }
}

export async function generarCarruselKit(
  pieceKey: string,
  accountId: string,
  kc: KitCargado,
  guion: ReturnType<typeof parseInstagramResponse>,
  news: RawNews | null,
  estilo: Estilo,
  nichos: string[],
  conPortadaFacebook: boolean,
  evitarImagenes: string[]
): Promise<CarouselPayload & { kit: KitDelCarrusel }> {
  const { caption, hashtags, fotos, antetitulo, plan } = guion
  // Con diseño libre ya hecho (por pasos, en pasadas anteriores), se dibuja de
  // su fuente. Si no salio, va con las plantillas y la ficha dice por que. Solo
  // en el modo "inteligencia": con los otros dos se dibuja con las plantillas
  // aunque la pieza guarde un diseño de antes.
  const conIA = estilo.diseno === "inteligencia"
  const libre = conIA ? parseEstadoLibre(guion.disenoLibre) : null
  const avisosLibre: string[] = []
  if (conIA && !libre && piezasDelKit(kc).length) {
    avisosLibre.push(
      "Esta pieza no tiene diseño con inteligencia (se creó antes o con otro modo): va con las plantillas del kit. Ese diseño se hace al crear la pieza."
    )
  }
  if (libre?.paso === "listo" && libre.fuente && libre.kit === claveKit(kc)) {
    try {
      return await carruselLibre(pieceKey, accountId, kc, guion, libre, conPortadaFacebook)
    } catch (error) {
      avisosLibre.push(
        `El diseño libre no se pudo dibujar (${error instanceof Error ? error.message : String(error)}): va con las plantillas del kit.`
      )
    }
  } else if (libre?.paso === "fallo") {
    avisosLibre.push(`El diseño libre no salió (${libre.error ?? "sin motivo"}): va con las plantillas del kit.`)
  }
  // Hasta el tope de Instagram, contando el cierre.
  const { slides, avisos: avisosFiguras } = figurasComprobadas(
    guion.slides.slice(0, MAX_SLIDES - (guion.cierre ? 1 : 0)),
    news,
    figurasDelKit(kc.kit.parciales)
  )
  // El maquetador pone el guion en las plantillas; lo que no supere su
  // comprobacion sale del reparto automatico. En modo mecanico no se le llama:
  // todo sale del reparto automatico.
  const fotosDelKit = kc.kit.sistema.fotos_por_carrusel ?? 0
  const mecanico = estilo.diseno === "mecanico"
  let maqueta: Awaited<ReturnType<typeof maquetar>> = mecanico
    ? { laminas: laminasDeGuionClasico(slides, guion.antetitulo, guion.cierre), descartadas: [] }
    : await maquetar(accountId, kc, guion, slides)
  // Una plantilla con huecos obligatorios que el reparto automatico no sabe
  // llenar (la palabra y la respuesta de un cierre de DM) deja la lamina sin
  // sitio: el maquetador se prueba otra vez antes de dibujar con el respaldo.
  if (!mecanico && repartirKit(kc.plantillas, maqueta.laminas, kc.kit.sistema.ritmo, fotosDelKit).some((r) => r === null)) {
    const otra = await maquetar(accountId, kc, guion, slides)
    if (otra.descartadas.length < maqueta.descartadas.length) maqueta = otra
  }
  const laminas = maqueta.laminas
  const avisosKit = [
    ...avisosLibre,
    ...avisosFiguras,
    ...(maqueta.error ? [`El maquetador no respondió (${maqueta.error}): láminas repartidas automáticamente.`] : []),
    ...(maqueta.descartadas.length
      ? [
          `Láminas ${maqueta.descartadas.join(", ")} repartidas automáticamente: ${maqueta.motivos?.join(" / ") || "la maqueta cambiaba el texto o no usaba una plantilla válida"}.`,
        ]
      : []),
  ]

  const reparto = repartirKit(kc.plantillas, laminas, kc.kit.sistema.ritmo, fotosDelKit)
  const sinPlantilla = reparto.findIndex((r) => r === null)
  if (sinPlantilla >= 0)
    throw new Error(
      mecanico
        ? `En modo mecánico ninguna plantilla del kit se puede llenar con la lámina ${sinPlantilla + 1} (${laminas[sinPlantilla].tipo}) sin inventar texto: el kit pide huecos que el guion no trae.`
        : `El kit no tiene una plantilla aprobada que sirva para la lámina ${sinPlantilla + 1} (${laminas[sinPlantilla].tipo}).`
    )
  const repartidas = reparto as LaminaRepartida[]

  // Fotos: primero la biblioteca, con el tono y el espacio que pide cada
  // plantilla. Pexels solo donde la plantilla no se sostiene sin foto.
  const huecos: HuecoDeFoto[] = repartidas.flatMap((r, i) =>
    r.plantilla.foto.usa === "no"
      ? []
      : [
          {
            indice: i,
            uso: r.plantilla.foto.uso,
            texto: textoDe(r.lamina),
            tono: r.plantilla.foto.tono,
            espacio: r.plantilla.foto.espacio,
          },
        ]
  )
  const terminos = fotos.length > 0 ? fotos : terminosDeBusqueda(news, nichos, estilo.fotosLiterales)
  const deBiblioteca =
    estilo.usarFotos && huecos.length && (await hayFotosEnBiblioteca(accountId))
      ? await elegirDeBiblioteca({
          accountId,
          huecos,
          terminos: [antetitulo, ...terminos].filter(Boolean),
          evitar: evitarImagenes,
        })
      : new Map<number, FotoElegida>()

  const banco = new BancoDeFotos(terminos)
  const creditos: { autor: string; url: string }[] = []
  const fotoDe: (string | null)[] = repartidas.map((_, i) => deBiblioteca.get(i)?.foto ?? null)
  // De donde salio cada foto, para la maqueta guardada: la foto en si es un data
  // URI de cientos de KB y no cabe en el payload.
  const origenDe: (FotoGuardada["origen"] | null)[] = repartidas.map((_, i) => {
    const b = deBiblioteca.get(i)
    return b ? { tipo: "biblioteca", imagenId: b.imagenId, motivo: b.motivo } : null
  })
  // Las fotos que lleva un carrusel del kit de este largo (el kit lo cuenta en
  // uno tipico de 7): hasta ahi, una plantilla con foto opcional tambien la busca fuera.
  const objetivo = Math.round((fotosDelKit * repartidas.length) / 7)
  for (const [i, r] of repartidas.entries()) {
    if (fotoDe[i] || r.plantilla.foto.usa === "no") continue
    const faltan = fotoDe.filter(Boolean).length < objetivo
    if (r.plantilla.foto.usa === "opcional" && !faltan) continue
    if (estilo.usarFotos && pexelsConfigurado()) {
      const elegida = await banco.siguiente()
      const descargada = elegida ? await descargarFotoPexels(elegida) : null
      if (descargada && elegida) {
        fotoDe[i] = descargada
        origenDe[i] = { tipo: "pexels", foto: elegida }
        if (elegida?.autor) creditos.push({ autor: elegida.autor, url: elegida.autorUrl })
        continue
      }
    }
    // Sin foto, mejor otra plantilla que la pida opcional o no la use.
    if (r.plantilla.foto.usa !== "obligatoria") continue
    const otra = r.alternativas.find((a) => a.plantilla.foto.usa !== "obligatoria")
    if (otra) repartidas[i] = { ...otra, alternativas: r.alternativas.filter((a) => a !== otra) }
  }

  const total = repartidas.length
  const datosDe = (r: Pick<LaminaRepartida, "lamina">, i: number): DatosLamina => ({
    textos: r.lamina.textos,
    listas: r.lamina.listas,
    n: i + 1,
    total,
    foto: fotoDe[i],
    figura: r.lamina.figura ?? null,
  })
  const medidas = medidasDe(repartidas[0].plantilla)
  const htmls = await Promise.all(repartidas.map((r, i) => armarLamina(kc, r.plantilla, datosDe(r, i))))
  const dibujadas = await dibujarConReintento(htmls, medidas)

  // Una lamina que no cabe se prueba en la siguiente plantilla que le sirva, y
  // se queda la que salga mejor. Todas en una sola tanda.
  const segundas = dibujadas.flatMap((d, i) => {
    if (!graves(d)) return []
    const otra = repartidas[i].alternativas.find((a) => a.plantilla.foto.usa !== "obligatoria" || fotoDe[i])
    return otra ? [{ i, otra }] : []
  })
  if (segundas.length) {
    const otras = await dibujarConReintento(
      await Promise.all(segundas.map(({ i, otra }) => armarLamina(kc, otra.plantilla, datosDe(otra, i)))),
      medidas
    )
    for (const [k, { i, otra }] of segundas.entries()) {
      if (graves(otras[k]) >= graves(dibujadas[i])) continue
      dibujadas[i] = otras[k]
      repartidas[i] = { ...otra, alternativas: [] }
    }
  }

  const images = await subirCarrusel(
    pieceKey,
    dibujadas.map((d) => d.png)
  )

  let portadaFacebook: string | undefined
  if (conPortadaFacebook) {
    const html = await armarLamina(kc, repartidas[0].plantilla, { ...datosDe(repartidas[0], 0), total: 1 }, { sinPaginacion: true })
    const [portada] = await dibujarConReintento([html], medidas)
    portadaFacebook = await subirImagenSuelta(pieceKey, "facebook", portada.png)
  }

  // Solo cuentan las fotos de la biblioteca que se ven: una plantilla de
  // respaldo sin foto deja la suya sin usar.
  const fotosBiblioteca = [...deBiblioteca]
    .filter(([i]) => repartidas[i].plantilla.foto.usa !== "no")
    .map(([i, e]) => ({ lamina: i + 1, imagenId: e.imagenId, motivo: e.motivo }))
  const problemasDibujo = dibujadas.flatMap((d, i) => d.problemas.map((p) => ({ ...p, lamina: i + 1 })))
  const usaFoto = repartidas[0].plantilla.foto.usa !== "no"

  return {
    caption,
    hashtags,
    images,
    ...(portadaFacebook ? { portadaFacebook } : {}),
    slideCount: total,
    // Una portada tipografica no lleva foto a proposito: no es una portada sin foto.
    portadaSinFoto: usaFoto && !fotoDe[0],
    terminosFoto: terminos.slice(0, 6),
    creditos,
    ...(plan.length ? { plan } : {}),
    ...(fotosBiblioteca.length ? { fotosBiblioteca } : {}),
    kit: {
      id: kc.kit.id,
      version: kc.kit.version,
      nombre: kc.kit.nombre,
      plantillas: repartidas.map((r) => r.plantilla.id),
    },
    ...(problemasDibujo.length ? { problemasDibujo } : {}),
    ...(avisosKit.length ? { avisosKit } : {}),
    modoDiseno: mecanico ? "mecanico" : "plantillas",
    maqueta: {
      kit: claveKit(kc),
      laminas: repartidas.map((r, i) => ({
        plantilla: r.plantilla.id,
        textos: r.lamina.textos,
        listas: r.lamina.listas,
        figura: r.lamina.figura ?? null,
        // Una plantilla de respaldo sin foto deja la suya sin usar.
        foto: r.plantilla.foto.usa !== "no" && fotoDe[i] ? origenDe[i] : null,
      })),
    },
  }
}

/**
 * Las paginas de cada lamina de una maqueta guardada, listas para el navegador
 * o para enseñarlas en el chat. Lanza si el kit ya no tiene alguna plantilla.
 * Con `solo`, arma solo esa lamina (1 es la portada): la que se ve en el panel.
 */
export async function paginasDeMaqueta(
  accountId: string,
  kc: KitCargado,
  maqueta: MaquetaGuardada,
  { sinPaginacionEnLaPrimera = false, solo }: { sinPaginacionEnLaPrimera?: boolean; solo?: number } = {}
): Promise<{ htmls: string[]; medidas: OpcionesDibujo }> {
  const plantillas = maqueta.laminas.map((l, i) => {
    const p = kc.plantillas.find((x) => x.id === l.plantilla)
    if (!p) throw new Error(`El kit ya no tiene la plantilla de la lámina ${i + 1}.`)
    return p
  })
  const cargadas = await cargarFotosLibre(
    accountId,
    maqueta.laminas.flatMap((l, i) =>
      l.foto && (!solo || solo === i + 1) ? [{ clave: `foto${i + 1}`, lamina: i + 1, descripcion: "", origen: l.foto }] : []
    )
  )
  const fotoDe = (n: number) => cargadas.find((f) => f.lamina === n)?.datos ?? null
  const total = maqueta.laminas.length
  const htmls = await Promise.all(
    maqueta.laminas.flatMap((l, i) =>
      solo && solo !== i + 1
        ? []
        : [
            armarLamina(
              kc,
              plantillaDe(plantillas[i], l.variante),
              { textos: l.textos, listas: l.listas, n: i + 1, total: sinPaginacionEnLaPrimera && i === 0 ? 1 : total, foto: fotoDe(i + 1), figura: l.figura ?? null },
              { sinPaginacion: sinPaginacionEnLaPrimera && i === 0 }
            ),
          ]
    )
  )
  return { htmls, medidas: medidasDe(plantillas[0]) }
}

/**
 * Vuelve a dibujar y subir un carrusel desde su maqueta guardada: las mismas
 * plantillas, textos y fotos. No llama a Claude ni elige fotos nuevas.
 */
export async function dibujarMaqueta(
  pieceKey: string,
  accountId: string,
  kc: KitCargado,
  maqueta: MaquetaGuardada,
  conPortadaFacebook: boolean
): Promise<{ images: string[]; portadaFacebook?: string; problemasDibujo?: ProblemaDibujo[] }> {
  if (maqueta.kit !== claveKit(kc)) throw new Error("La maqueta es de otra versión del kit.")
  const { htmls, medidas } = await paginasDeMaqueta(accountId, kc, maqueta)
  const dibujadas = await dibujarConReintento(htmls, medidas)
  const images = await subirCarrusel(
    pieceKey,
    dibujadas.map((d) => d.png)
  )
  let portadaFacebook: string | undefined
  if (conPortadaFacebook) {
    const { htmls: sinPaginacion } = await paginasDeMaqueta(
      accountId,
      kc,
      { ...maqueta, laminas: maqueta.laminas.slice(0, 1) },
      { sinPaginacionEnLaPrimera: true }
    )
    const [portada] = await dibujarConReintento(sinPaginacion, medidas)
    portadaFacebook = await subirImagenSuelta(pieceKey, "facebook", portada.png)
  }
  const problemasDibujo = dibujadas.flatMap((d, i) => d.problemas.map((p) => ({ ...p, lamina: i + 1 })))
  return { images, ...(portadaFacebook ? { portadaFacebook } : {}), ...(problemasDibujo.length ? { problemasDibujo } : {}) }
}
