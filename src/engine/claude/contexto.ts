import { AsyncLocalStorage } from "node:async_hooks"

/**
 * De quien es el gasto de las llamadas a Claude que se hagan dentro.
 *
 * Quien trabaja sobre una noticia (el analisis, el buzon, el diseño del
 * carrusel) abre el contexto con `conContexto` y todas las llamadas que salgan
 * de ahi, por hondo que esten, quedan anotadas con la noticia y la red. Asi se
 * suma lo que costo cada pieza sin pasar el dato por cada funcion.
 *
 * `red` vacia es gasto compartido entre las piezas de la noticia (analisis,
 * angulo); "instagram" o "linkedin" es de esa pieza.
 */
export type ContextoUso = { noticia?: string; red?: string }

const almacen = new AsyncLocalStorage<ContextoUso>()

export function conContexto<T>(contexto: ContextoUso, trabajo: () => Promise<T>): Promise<T> {
  return almacen.run({ ...almacen.getStore(), ...contexto }, trabajo)
}

export function contextoUso(): ContextoUso {
  return almacen.getStore() ?? {}
}
