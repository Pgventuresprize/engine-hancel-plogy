"use server"

import { revalidatePath } from "next/cache"

import { agenteReal, guardarAjustes, type Agente, type Modo } from "@/engine/agents/settings"
import type { Receta } from "@/engine/agents/armador"
import { PROMPT_DE_FABRICA, promptPara, tienePrompt } from "@/engine/agents/prompts"
import { parseSituacion, type Situacion } from "@/engine/marca/cuando"
import { fichaDe, type ClaveAgente } from "@/lib/agentes-catalogo"
import { MODELOS_DISPONIBLES } from "@/lib/modelos-ia"
import { idDeCuentaActual } from "@/lib/accounts"

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback: string): ActionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message || fallback }
}

function refresh(clave: string) {
  revalidatePath(`/agentes/${clave}`)
  revalidatePath("/")
}

/**
 * Comprueba que el agente existe y que no es un espejo.
 *
 * Facebook comparte fila con Instagram: se ve pero no se edita, porque guardar
 * ahi escribiria en la configuracion de Instagram sin que quien lo hace lo
 * espere. La pagina ya lo enseña en modo lectura; esto es el cierre del
 * servidor, que es el que de verdad tiene que impedirlo.
 */
function resolver(clave: string): { ok: true; agent: Agente } | { ok: false; error: string } {
  const ficha = fichaDe(clave)
  if (!ficha) return { ok: false, error: "Ese agente no existe." }
  if (ficha.espejoDe) {
    return {
      ok: false,
      error: `${ficha.nombre} se configura desde ${ficha.espejoDe}: comparten el mismo trabajo.`,
    }
  }
  return { ok: true, agent: agenteReal(clave as ClaveAgente as Agente) }
}

/** Pone o quita de servicio a un agente. */
export async function guardarActivo(
  clave: string,
  activo: boolean,
  canal = ""
): Promise<ActionResult> {
  const r = resolver(clave)
  if (!r.ok) return r

  try {
    await guardarAjustes(await idDeCuentaActual(), r.agent, canal, { enabled: activo })
    refresh(clave)
    if (activo) await arrancar(r.agent)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo cambiar el estado del agente.")
  }
}

export async function guardarModo(
  clave: string,
  modo: Modo,
  canal = ""
): Promise<ActionResult> {
  const r = resolver(clave)
  if (!r.ok) return r

  const ficha = fichaDe(clave)!
  if (!ficha.modos.includes(modo)) {
    return { ok: false, error: `${ficha.nombre} no admite el modo ${modo}.` }
  }

  try {
    await guardarAjustes(await idDeCuentaActual(), r.agent, canal, { mode: modo })
    refresh(clave)

    // Poner un agente en automatico es decir "esto ya puede correr", asi que
    // corre. Esperar al siguiente tick para ver si el cambio hizo algo convierte
    // una decision en una duda de varios minutos.
    if (modo === "automatico") await arrancar(r.agent)

    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el modo.")
  }
}

/**
 * Una pasada suelta para que el cambio se note ya.
 *
 * Acotada como todas las que alguien espera delante: mueve una pieza, no la
 * cola entera. El resto lo recoge el tick, que pasa cada dos minutos.
 */
async function arrancar(agent: Agente): Promise<void> {
  try {
    if (agent === "extraccion") return
    if (agent === "redaccion") {
      const { cuentaActual } = await import("@/lib/accounts")
      const { despertarRedaccion } = await import("@/lib/redaccion-despertar")
      await despertarRedaccion((await cuentaActual()).slug)
      return
    }
    const { runContentTick } = await import("@/engine/content/tick")
    await runContentTick({ trigger: "manual", forzar: [agent], presupuesto: 1 })
  } catch {
    // Que falle la pasada no invalida el cambio de modo, que ya esta guardado.
  }
}

export async function guardarHorario(
  clave: string,
  /** Minutos del dia, de 0 a 1439. Un 545 son las 09:05. */
  minutos: number[],
  canal = "",
  /** Cuantas piezas por pasada. Solo lo usa publicacion. */
  tanda?: number
): Promise<ActionResult> {
  const r = resolver(clave)
  if (!r.ok) return r

  // Se limpia aqui y no se confia en el formulario: es una accion de servidor y
  // una hora fuera de rango dejaria al agente sin correr nunca, en silencio.
  const limpias = [...new Set(minutos.filter((m) => Number.isInteger(m) && m >= 0 && m <= 1439))]
    .sort((a, b) => a - b)
    .slice(0, 24)

  if (tanda !== undefined && (!Number.isInteger(tanda) || tanda < 1 || tanda > 20)) {
    return { ok: false, error: "La tanda tiene que ser un entero entre 1 y 20." }
  }

  try {
    await guardarAjustes(await idDeCuentaActual(), r.agent, canal, {
      run_at: limpias,
      ...(tanda === undefined ? {} : { batch_size: tanda }),
    })
    refresh(clave)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el horario.")
  }
}

export async function guardarModelo(clave: string, modelo: string): Promise<ActionResult> {
  const r = resolver(clave)
  if (!r.ok) return r
  if (!MODELOS_DISPONIBLES.some((m) => m.id === modelo)) {
    return { ok: false, error: "Ese modelo no esta disponible." }
  }

  try {
    await guardarAjustes(await idDeCuentaActual(), r.agent, "", { model: modelo })
    refresh(clave)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el modelo.")
  }
}

/**
 * Guarda el prompt, o lo devuelve a fabrica.
 *
 * Vacio significa volver al del codigo, no dejar al agente sin instrucciones:
 * un prompt en blanco haria que el modelo respondiera cualquier cosa, y la
 * unica forma de recuperar el de fabrica seria copiarlo a mano de algun sitio.
 */
export async function guardarPrompt(clave: string, prompt: string): Promise<ActionResult> {
  const r = resolver(clave)
  if (!r.ok) return r
  if (!tienePrompt(r.agent)) {
    return { ok: false, error: "Ese agente no usa un prompt." }
  }

  const limpio = prompt.trim()
  if (limpio.length > 0 && limpio.length < 80) {
    return {
      ok: false,
      error: "El prompt es demasiado corto. Dejalo vacio si quieres volver al de fabrica.",
    }
  }

  try {
    await guardarAjustes(await idDeCuentaActual(), r.agent, "", {
      // Igual que el de fabrica tampoco se guarda: asi una correccion futura del
      // codigo le sigue llegando a quien no lo cambio de verdad.
      prompt: limpio.length === 0 || limpio === PROMPT_DE_FABRICA[r.agent].trim() ? null : limpio,
    })
    refresh(clave)
    return { ok: true }
  } catch (error) {
    return fail(error, "No se pudo guardar el prompt.")
  }
}

/**
 * Corre un agente ahora, sin cambiarle el modo.
 *
 * Es lo que hace el boton de una etapa en el estudio. Trabaja sobre lo que dejo
 * el paso anterior —lo que esta en cola— igual que haria una pasada automatica;
 * la diferencia es solo quien aprieta el gatillo. Asi una cuenta puede tener el
 * pipeline entero en manual y seguir avanzando etapa a etapa.
 *
 * Publicacion admite una red concreta: el tablero tiene una sola columna
 * "Publicado", asi que el boton pregunta a cual sacar en vez de suponer que
 * quien lo pulsa quiere las tres.
 */
export async function ejecutarAgente(
  clave: string,
  /** Solo para publicacion: la red a la que sacar. Vacio son todas. */
  canal = ""
): Promise<{ ok: true; resumen: string } | { ok: false; error: string }> {
  const ficha = fichaDe(clave)
  if (!ficha) return { ok: false, error: "Ese agente no existe." }

  const accountId = await idDeCuentaActual()
  const agent = agenteReal((ficha.espejoDe ?? ficha.clave) as ClaveAgente as Agente)

  try {
    if (agent === "extraccion") {
      const { runIngestion } = await import("@/engine/ingest")
      const r = await runIngestion({ accountId })
      refresh(clave)
      return { ok: true, resumen: `${r.inserted} noticias nuevas.` }
    }

    if (agent === "redaccion") {
      // Redactar tarda mas de lo que aguanta esta accion: se seleccionan las
      // que pasan el umbral y el tick de redaccion las escribe por su cuenta.
      const { seleccionarParaRedaccion } = await import("@/engine/redaccion/tick")
      const { cuentaActual } = await import("@/lib/accounts")
      const { despertarRedaccion } = await import("@/lib/redaccion-despertar")
      const sel = await seleccionarParaRedaccion(accountId, "manual")
      await despertarRedaccion((await cuentaActual()).slug)
      refresh(clave)
      return {
        ok: true,
        resumen: `${sel.seleccionadas} noticias nuevas a redacción; el agente escribe la cola en segundo plano.`,
      }
    }

    const { runContentTick } = await import("@/engine/content/tick")
    const r = await runContentTick({
      trigger: "manual",
      forzar: [agent],
      forzarCanal: agent === "publicacion" ? canal : undefined,
    })
    refresh(clave)

    // Cada agente informa de lo suyo: un resumen con los seis numeros no dice
    // nada sobre el boton que se acaba de pulsar.
    const resumen =
      agent === "analisis"
        ? `${r.noticiasAnalizadas} noticias analizadas.`
        : agent === "angulo"
          ? `${r.anglesQueued} noticias enviadas a angulo.`
          : agent === "publicacion"
            ? `${r.piecesPublished} piezas publicadas.`
            : `${r.piecesCreated + r.carouselsCreated + r.facebookCreated} piezas generadas.`

    return { ok: true, resumen }
  } catch (error) {
    return fail(error, "No se pudo ejecutar el agente.") as { ok: false; error: string }
  }
}

export type Simulacion =
  | { ok: true; fijo: string; resto: string; receta: Receta }
  | { ok: false; error: string }

/**
 * El prompt que recibiria el agente con una situacion inventada: sin llamar a
 * Claude ni escribir nada. Se lee igual en Facebook, que usa el de Instagram.
 */
export async function simularPrompt(clave: string, situacion: Situacion): Promise<Simulacion> {
  try {
    const ficha = fichaDe(clave)
    if (!ficha) return { ok: false, error: "Ese agente no existe." }
    const agent = agenteReal((ficha.espejoDe ?? ficha.clave) as Agente)
    if (!tienePrompt(agent)) return { ok: false, error: "Este agente no usa prompt." }
    const { fijo, resto, receta } = await promptPara(await idDeCuentaActual(), agent, parseSituacion(situacion))
    return { ok: true, fijo, resto, receta }
  } catch (error) {
    const r = fail(error, "No se pudo armar el prompt.")
    return r.ok ? { ok: false, error: "No se pudo armar el prompt." } : r
  }
}
