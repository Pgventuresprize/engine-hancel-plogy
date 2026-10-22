"use server"

import { revalidatePath } from "next/cache"

import { borrarSkill, guardarSkill, moverSkill, type CamposSkill } from "@/engine/marca/skills"
import { idDeCuentaActual } from "@/lib/accounts"

/** Lo que se guarda desde Marca > Skills. Cada skill es de la cuenta abierta. */

export type ResultadoSkill = { ok: true; id: string } | { ok: false; error: string }
type Resultado = { ok: true } | { ok: false; error: string }

const mensaje = (error: unknown, porDefecto: string) =>
  (error instanceof Error ? error.message : String(error)) || porDefecto

function refresh() {
  revalidatePath("/configuracion/marca")
  // La ficha de cada agente lista sus skills y enseña su prompt final.
  revalidatePath("/agentes/[agente]", "page")
}

export async function guardarSkillMarca(id: string | null, campos: CamposSkill): Promise<ResultadoSkill> {
  try {
    const accountId = await idDeCuentaActual()
    const guardada = await guardarSkill(accountId, id, campos)
    refresh()
    return { ok: true, id: guardada }
  } catch (error) {
    return { ok: false, error: mensaje(error, "No se pudo guardar la skill.") }
  }
}

export async function borrarSkillMarca(id: string): Promise<Resultado> {
  try {
    await borrarSkill(await idDeCuentaActual(), id)
    refresh()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: mensaje(error, "No se pudo borrar la skill.") }
  }
}

export async function moverSkillMarca(id: string, direccion: "arriba" | "abajo"): Promise<Resultado> {
  try {
    await moverSkill(await idDeCuentaActual(), id, direccion)
    refresh()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: mensaje(error, "No se pudo mover la skill.") }
  }
}
