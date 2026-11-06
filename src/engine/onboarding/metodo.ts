import type { TipoMarca } from "./requisitos"

/**
 * Lo que el Estratega sabe de cada tipo de marca: de donde viene la confianza,
 * que funciona y que evitar. Es la guia con la que propone cuando la persona no
 * sabe, y sin ella lo rellenado sale generico.
 *
 * Neutro: nada de ninguna marca. Es una version corta hecha a partir de la tabla
 * del Paso 0 de MARCAS.md, a la espera de la investigacion con fuentes.
 */
export const METODO: Record<TipoMarca, string> = {
  persona:
    "La persona es la marca: la confianza viene de su historia, sus opiniones y cómo ve las cosas. Nadie sigue a un currículum: siguen a alguien con un punto de vista reconocible y experiencia vivida. Funciona lo que solo esa persona puede contar: lo que vio, lo que le salió mal, lo que cambió de opinión. Se escribe siempre en primera persona del singular, nunca en plural. Elegir un terreno estrecho al principio pesa más que hablar de todo. No toda marca personal vende algo: el objetivo puede ser audiencia, oportunidades o comunidad. Visualmente manda su cara y su nombre: fotos reales, poco adorno.",
  servicios:
    "Se compra confianza antes que un servicio: autoridad demostrada, un método entendible y casos reales. Funciona enseñar cómo se piensa un problema, mostrar el proceso y nombrar los errores comunes del sector. El ciclo de decisión es largo: el contenido debe ser útil antes de pedir algo. Visualmente, claridad y orden: se ve como quien sabe lo que hace.",
  producto:
    "Se compra identidad y deseo, no características. Importan la estética, por qué existe el producto, quién lo usa y la comunidad alrededor. Funciona mostrar el producto real en uso, el proceso y las personas. Nunca se describe el producto con detalles que no estén confirmados. Visualmente, la foto del producto real manda.",
  alto_valor:
    "Es una decisión larga, con miedo a equivocarse. Importan la aspiración, la prueba social, la claridad del proceso y qué pasa después de comprar. Funciona responder las dudas que frenan la decisión y mostrar casos reales. Visualmente, sobrio y aspiracional, sin gritar.",
  local:
    "La confianza viene de la cercanía: el lugar, las personas, la oferta concreta y la costumbre de volver. Funciona mostrar el día a día, a quién atiende y por qué elegirlo a la vuelta de la esquina. Horarios y precios solo si están confirmados. Visualmente, cálido y real: el lugar y su gente.",
}
