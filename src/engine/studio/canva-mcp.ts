import { ejecutar, type Resultado } from "../composio/conexiones"

/**
 * Llama a una herramienta del Canva MCP con la conexion de Canva de una
 * empresa, a traves de Composio.
 *
 * La conexion de Canva es la del servidor MCP oficial de Canva (toolkit
 * `canva_mcp`), no la API REST: por eso las herramientas son las de un agente
 * (importar un diseno, exportarlo, abrir una transaccion de edicion) y no el
 * autofill de Canva Enterprise.
 *
 * No lanza: el fallo viaja en el resultado.
 */

export type ResultadoMcp<T = Record<string, unknown>> = Resultado<T>

export async function canvaMcp<T = Record<string, unknown>>(
  accountId: string,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 90_000
): Promise<ResultadoMcp<T>> {
  // Las herramientas del MCP piden siempre una intencion: es para su registro.
  return ejecutar<T>(accountId, "canva", tool, { user_intent: "Motor de contenido de Engine Hancel", ...args }, timeoutMs)
}

// ------------------------------------------------------------------ tipos

export type TextoCanva = {
  element_id: string
  page_index: number
  regions?: { text?: string }[]
  containerElement?: { dimension?: { width: number; height: number } }
}

export type FillCanva = {
  element_id: string
  page_index: number
  type?: string
  alt_text?: { text?: string }
  containerElement?: { dimension?: { width: number; height: number } }
}

export type PaginaCanva = { page_id: string; page_number?: number; is_responsive: boolean }

export type Transaccion = {
  transaction: { transaction_id: string }
  pages: PaginaCanva[]
  richtexts: TextoCanva[]
  fills: FillCanva[]
}

/** El texto entero de un elemento de texto. */
export function textoDe(t: TextoCanva): string {
  return (t.regions ?? []).map((r) => r.text ?? "").join("")
}
