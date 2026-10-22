"use server"

import { after } from "next/server"

import {
  activarImagenes,
  actualizarImagen,
  bibliotecaDisponible,
  eliminarImagenes,
  etiquetarPendientes,
  galeria,
  guardarDiasSinRepetir,
  huellasExistentes,
  imagenDe,
  prepararSubidas,
  recortarImagen,
  reetiquetar,
  registrarImagenes,
  resumenBiblioteca,
  urlsFirmadas,
  usosDeImagen,
  type CambiosImagen,
  type FiltrosGaleria,
  type ImagenDeGaleria,
  type ImagenSubida,
  type ResumenBiblioteca,
  type SubidaPreparada,
} from "@/engine/marca/imagenes"
import type { Recorte, UsoDeImagen } from "@/engine/marca/imagenes-modelo"
import { idDeCuentaActual } from "@/lib/accounts"

/**
 * Lo que pide Marca > Imagenes. Apagar (descartar) una imagen la saca de la
 * eleccion y se puede deshacer; eliminar la borra para siempre y solo lo hace la
 * persona desde la pantalla, despues de confirmar.
 */

type Fallo = { ok: false; error: string }
const fallo = (error: unknown, porDefecto: string): Fallo => ({
  ok: false,
  error: (error instanceof Error ? error.message : String(error)) || porDefecto,
})

export async function cargarBiblioteca(
  filtros: FiltrosGaleria,
  pagina = 0
): Promise<
  | { ok: true; disponible: false }
  | { ok: true; disponible: true; resumen: ResumenBiblioteca; imagenes: ImagenDeGaleria[]; hayMas: boolean }
  | Fallo
> {
  try {
    if (!(await bibliotecaDisponible())) return { ok: true, disponible: false }
    const cuenta = await idDeCuentaActual()
    const [resumen, { imagenes, hayMas }] = await Promise.all([resumenBiblioteca(cuenta), galeria(cuenta, filtros, pagina)])
    return { ok: true, disponible: true, resumen, imagenes, hayMas }
  } catch (error) {
    return fallo(error, "No se pudo leer la biblioteca.")
  }
}

/** Paso 1 de la subida: que fotos ya estan, para no subirlas otra vez. */
export async function comprobarHuellas(huellas: string[]): Promise<{ ok: true; existentes: string[] } | Fallo> {
  try {
    return { ok: true, existentes: await huellasExistentes(await idDeCuentaActual(), huellas) }
  } catch (error) {
    return fallo(error, "No se pudo comprobar qué fotos ya estaban.")
  }
}

/** Paso 2: enlaces firmados para que el navegador suba directo al storage. */
export async function prepararSubidasMarca(tipos: string[]): Promise<{ ok: true; subidas: SubidaPreparada[] } | Fallo> {
  try {
    return { ok: true, subidas: await prepararSubidas(await idDeCuentaActual(), tipos) }
  } catch (error) {
    return fallo(error, "No se pudo preparar la subida.")
  }
}

/**
 * Paso 3: las fichas de lo ya subido. Al responder, Claude empieza a mirarlas
 * en segundo plano; lo que no le de tiempo lo recoge el tick.
 */
export async function registrarSubidas(lista: ImagenSubida[]): Promise<{ ok: true; nuevas: number } | Fallo> {
  try {
    const cuenta = await idDeCuentaActual()
    const nuevas = await registrarImagenes(cuenta, lista)
    if (nuevas > 0) after(() => etiquetarPendientes(cuenta, 20).then(() => undefined))
    return { ok: true, nuevas }
  } catch (error) {
    return fallo(error, "No se pudieron guardar las fichas.")
  }
}

export async function etiquetarAhora(): Promise<{ ok: true; hechas: number; fallidas: number } | Fallo> {
  try {
    return { ok: true, ...(await etiquetarPendientes(await idDeCuentaActual(), 12)) }
  } catch (error) {
    return fallo(error, "No se pudieron etiquetar.")
  }
}

export async function cambiarImagen(id: string, cambios: CambiosImagen): Promise<{ ok: true } | Fallo> {
  try {
    await actualizarImagen(await idDeCuentaActual(), id, cambios)
    return { ok: true }
  } catch (error) {
    return fallo(error, "No se pudo guardar la imagen.")
  }
}

export async function reetiquetarImagen(id: string): Promise<{ ok: true } | Fallo> {
  try {
    const cuenta = await idDeCuentaActual()
    await reetiquetar(cuenta, id)
    after(() => etiquetarPendientes(cuenta, 4).then(() => undefined))
    return { ok: true }
  } catch (error) {
    return fallo(error, "No se pudo volver a etiquetar.")
  }
}

/** La imagen grande y su historial, para la ficha. */
export async function detalleImagen(
  id: string
): Promise<{ ok: true; url: string | null; usos: (UsoDeImagen & { estadoPieza: string | null })[] } | Fallo> {
  try {
    const cuenta = await idDeCuentaActual()
    const imagen = await imagenDe(cuenta, id)
    if (!imagen) return { ok: false, error: "No se encontró la imagen." }
    const [urls, usos] = await Promise.all([urlsFirmadas([imagen.ruta]), usosDeImagen(cuenta, id)])
    return { ok: true, url: urls.get(imagen.ruta) ?? null, usos }
  } catch (error) {
    return fallo(error, "No se pudo abrir la imagen.")
  }
}

export async function guardarDias(dias: number): Promise<{ ok: true } | Fallo> {
  try {
    await guardarDiasSinRepetir(await idDeCuentaActual(), dias)
    return { ok: true }
  } catch (error) {
    return fallo(error, "No se pudieron guardar los días.")
  }
}

export async function recortar(id: string, recorte: Recorte | null): Promise<{ ok: true } | Fallo> {
  try {
    await recortarImagen(await idDeCuentaActual(), id, recorte)
    return { ok: true }
  } catch (error) {
    return fallo(error, "No se pudo guardar el recorte.")
  }
}

/** Descartar (activa = false) o volver a activar varias a la vez. */
export async function activarVarias(ids: string[], activa: boolean): Promise<{ ok: true } | Fallo> {
  try {
    await activarImagenes(await idDeCuentaActual(), ids, activa)
    return { ok: true }
  } catch (error) {
    return fallo(error, "No se pudieron cambiar.")
  }
}

export async function eliminarVarias(ids: string[]): Promise<{ ok: true; eliminadas: number } | Fallo> {
  try {
    return { ok: true, eliminadas: await eliminarImagenes(await idDeCuentaActual(), ids) }
  } catch (error) {
    return fallo(error, "No se pudieron eliminar.")
  }
}
