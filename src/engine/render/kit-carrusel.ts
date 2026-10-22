import type { RawNews } from "@/lib/types"

import { elegirDeBiblioteca, hayFotosEnBiblioteca, type FotoElegida, type HuecoDeFoto } from "../marca/imagenes"
import { armarLamina, medidasDe, type DatosLamina, type KitCargado } from "../marca/kit"
import type { CarouselPayload, parseInstagramResponse } from "./carousel"
import { terminosDeBusqueda } from "./keywords"
import { maquetar } from "./kit-maqueta"
import { repartirKit, type LaminaKit, type LaminaRepartida } from "./kit-reparto"
import { cerrarNavegador, dibujarLaminas, type LaminaDibujada, type Problema } from "./navegador"
import { BancoDeFotos, descargarFotoPexels, pexelsConfigurado } from "./pexels"
import { MAX_SLIDES } from "./render"
import { subirCarrusel, subirImagenSuelta } from "./storage"
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

/** Lo que hace falta rehacer: no cabe, se sale o choca. */
const GRAVES = new Set<Problema["tipo"]>(["se_sale", "choca", "desborda", "letra_pequena"])

const graves = (d: LaminaDibujada) => d.problemas.filter((p) => GRAVES.has(p.tipo)).length

/** Lo que dice una lamina, para elegir una foto que vaya con ello. */
const textoDe = (l: LaminaKit) =>
  [...Object.values(l.textos), ...Object.values(l.listas).flat()].filter(Boolean).join(". ")

/** Un fallo del navegador (se cayo, tardo demasiado) merece otro intento con uno nuevo. */
async function dibujarConReintento(htmls: string[], medidas: { ancho: number; alto: number }) {
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
  // Hasta el tope de Instagram, contando el cierre.
  const slides = guion.slides.slice(0, MAX_SLIDES - (guion.cierre ? 1 : 0))
  // El maquetador pone el guion en las plantillas; lo que no supere su
  // comprobacion sale del reparto automatico.
  const maqueta = await maquetar(accountId, kc, guion, slides)
  const laminas = maqueta.laminas
  const avisosKit = [
    ...(maqueta.error ? [`El maquetador no respondió (${maqueta.error}): láminas repartidas automáticamente.`] : []),
    ...(maqueta.descartadas.length
      ? [
          `Láminas ${maqueta.descartadas.join(", ")} repartidas automáticamente: la maqueta cambiaba el texto o no usaba una plantilla válida.`,
        ]
      : []),
  ]

  const reparto = repartirKit(kc.plantillas, laminas, kc.kit.sistema.ritmo)
  const sinPlantilla = reparto.findIndex((r) => r === null)
  if (sinPlantilla >= 0)
    throw new Error(
      `El kit no tiene una plantilla aprobada que sirva para la lámina ${sinPlantilla + 1} (${laminas[sinPlantilla].tipo}).`
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
  for (const [i, r] of repartidas.entries()) {
    if (fotoDe[i] || r.plantilla.foto.usa !== "obligatoria") continue
    if (estilo.usarFotos && pexelsConfigurado()) {
      const elegida = await banco.siguiente()
      const descargada = elegida ? await descargarFotoPexels(elegida) : null
      if (descargada) {
        fotoDe[i] = descargada
        if (elegida?.autor) creditos.push({ autor: elegida.autor, url: elegida.autorUrl })
        continue
      }
    }
    // Sin foto, mejor otra plantilla que la pida opcional o no la use.
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
  }
}
