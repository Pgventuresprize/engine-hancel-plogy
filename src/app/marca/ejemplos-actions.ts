"use server"

import { revalidatePath } from "next/cache"

import { guardarPiezaComoEjemplo } from "@/engine/content/ejemplo-de-pieza"
import { borrarEjemplo, guardarEjemplo, validarEjemplo, type CamposEjemplo } from "@/engine/marca/ejemplos"
import { extraerEjemplos, type ResultadoImportacion } from "@/engine/marca/importar-ejemplos"
import { idDeCuentaActual } from "@/lib/accounts"

/** Lo que se guarda desde Marca > Ejemplos y desde "Guardar como ejemplo". */

export type ResultadoEjemplo = { ok: true; id: string } | { ok: false; error: string }
type Resultado = { ok: true } | { ok: false; error: string }

const mensaje = (error: unknown, porDefecto: string) =>
  (error instanceof Error ? error.message : String(error)) || porDefecto

function refresh() {
  revalidatePath("/marca")
  // El simulador de la ficha de cada agente enseña que ejemplos entran.
  revalidatePath("/agentes/[agente]", "page")
}

export async function guardarEjemploMarca(id: string | null, campos: CamposEjemplo): Promise<ResultadoEjemplo> {
  try {
    const guardado = await guardarEjemplo(await idDeCuentaActual(), id, campos)
    refresh()
    return { ok: true, id: guardado }
  } catch (error) {
    return { ok: false, error: mensaje(error, "No se pudo guardar el ejemplo.") }
  }
}

export async function borrarEjemploMarca(id: string): Promise<Resultado> {
  try {
    await borrarEjemplo(await idDeCuentaActual(), id)
    refresh()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: mensaje(error, "No se pudo borrar el ejemplo.") }
  }
}

/** "Guardar como ejemplo" desde la ficha de una pieza. */
export async function guardarPiezaComoEjemploMarca(pieceId: string, porQue: string): Promise<ResultadoEjemplo> {
  try {
    if (!porQue.trim()) return { ok: false, error: "Escribe por qué es buena: es lo que el agente tiene que aprender de ella." }
    const id = await guardarPiezaComoEjemplo(await idDeCuentaActual(), pieceId, porQue.trim())
    refresh()
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: mensaje(error, "No se pudo guardar el ejemplo.") }
  }
}

/** Importar desde archivo, paso 1: Claude extrae y el codigo comprueba. No guarda nada. */
export async function extraerEjemplosDeArchivo(
  nombre: string,
  texto: string
): Promise<({ ok: true } & ResultadoImportacion) | { ok: false; error: string }> {
  try {
    const r = await extraerEjemplos(await idDeCuentaActual(), { nombre, texto })
    return { ok: true, ...r }
  } catch (error) {
    return { ok: false, error: mensaje(error, "No se pudo leer el archivo.") }
  }
}

/**
 * Importar desde archivo, paso 2: los que la persona eligio. Se validan todos
 * antes de guardar el primero, para no dejar la mitad guardada por un error.
 */
export async function guardarEjemplosImportados(lista: CamposEjemplo[]): Promise<{ ok: true; guardados: number } | { ok: false; error: string }> {
  try {
    if (lista.length === 0) return { ok: false, error: "No elegiste ningún ejemplo." }
    for (const c of lista) {
      const invalido = validarEjemplo(c)
      if (invalido) return { ok: false, error: `«${c.nombre || "Sin nombre"}»: ${invalido}` }
    }
    const cuenta = await idDeCuentaActual()
    // Uno detras de otro: cada uno toma la posicion siguiente al anterior.
    for (const c of lista) await guardarEjemplo(cuenta, null, c)
    refresh()
    return { ok: true, guardados: lista.length }
  } catch (error) {
    return { ok: false, error: mensaje(error, "No se pudieron guardar los ejemplos.") }
  }
}
