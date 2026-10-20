"use server"

import { revalidatePath } from "next/cache"

import { guardarPiezaComoEjemplo } from "@/engine/content/ejemplo-de-pieza"
import { borrarEjemplo, guardarEjemplo, type CamposEjemplo } from "@/engine/marca/ejemplos"
import { idDeCuentaActual } from "@/lib/accounts"

/** Lo que se guarda desde Marca > Ejemplos y desde "Guardar como ejemplo". */

export type ResultadoEjemplo = { ok: true; id: string } | { ok: false; error: string }
type Resultado = { ok: true } | { ok: false; error: string }

const mensaje = (error: unknown, porDefecto: string) =>
  (error instanceof Error ? error.message : String(error)) || porDefecto

function refresh() {
  revalidatePath("/configuracion/marca")
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
