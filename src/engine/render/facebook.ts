import type { PiecePayload } from "../content/types"
import type { Slide } from "./templates"

/**
 * La version de Facebook de un carrusel.
 *
 * Facebook no tiene agente propio: se hace con lo que ya escribio el de
 * Instagram. La idea es que el mismo contenido cambie de forma con la red. En
 * Instagram se lee lamina a lamina; en Facebook se lee de un tiron, con una
 * imagen y un texto largo debajo, que es como esta hecho el feed.
 *
 * Asi que la imagen es la portada —la que lleva el hook— y la descripcion es el
 * texto de todas las laminas, en orden, con el titulo de cada una como
 * encabezado. Lo que en Instagram era pasar el dedo aqui es seguir leyendo.
 *
 * El resultado tiene la forma de `PiecePayload` a proposito: hook, cuerpo y
 * hashtags, igual que LinkedIn, mas la imagen. Asi la pantalla de contenido lo
 * enseña y lo edita con el mismo codigo, sin un caso aparte.
 */
export function armarPublicacionFacebook(opciones: {
  slides: Slide[]
  caption: string
  hashtags: string[]
  portada: string
}): PiecePayload & { image: string } {
  const { slides, caption, hashtags, portada } = opciones

  const hook =
    slides
      .map((slide) => (slide.type === "photo_hook" ? slide.hook : null))
      .find((texto) => texto && texto.trim().length > 0)
      ?.trim() ?? null

  // Cada lamina de texto es un parrafo con su titulo delante. El titulo va en
  // su propia linea y no en negrita porque Facebook no tiene formato: lo que
  // separa las ideas es el espacio en blanco.
  const parrafos = slides
    .filter((slide): slide is Extract<Slide, { type: "text" }> => slide.type === "text")
    .map((slide) => {
      const titulo = slide.title?.trim()
      const cuerpo = slide.body?.trim()
      // Una lamina de pasos no tiene cuerpo: sus puntos van numerados, con su
      // etiqueta delante, como se ven en la imagen.
      const lista = slide.items?.length ? slide.items.map((item, i) => `${i + 1}. ${item.trim()}`).join("\n") : null
      return [slide.lead?.trim(), titulo, cuerpo, lista].filter((parte) => parte && parte.length > 0).join("\n")
    })
    .filter((parrafo) => parrafo.length > 0)

  // El caption de Instagram no entra. Es un resumen del carrusel con su
  // invitacion a comentar, y las laminas ya cuentan eso mismo entero y con mas
  // detalle: ponerlo debajo era leer la misma historia dos veces seguidas. Si no
  // hubiera laminas de texto —no deberia pasar— se usa como unico cuerpo.
  const body = parrafos.length > 0 ? parrafos.join("\n\n") : caption.trim()

  return {
    hook,
    body,
    hashtags,
    cta: null,
    notas: null,
    image: portada,
  }
}
