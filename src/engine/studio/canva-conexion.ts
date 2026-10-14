import {
  AUTH_CONFIG,
  claveComposio,
  enlaceConexion,
  estadoConexion,
  type EstadoConexion,
} from "../composio/conexiones"

/**
 * La conexion con Canva de cada empresa, a traves de Composio (toolkit
 * `canva_mcp`). Ver `composio/conexiones.ts`: cada empresa conecta su propio
 * Canva iniciando sesion desde Conexiones.
 */

export { claveComposio }

/** La auth config de Canva en Composio. */
export const CANVA_AUTH_CONFIG = AUTH_CONFIG.canva

export type EstadoCanva = EstadoConexion

/** La cuenta de Canva activa de una empresa. Nunca lanza. */
export async function estadoCanva(accountId: string): Promise<EstadoCanva> {
  return estadoConexion(accountId, "canva")
}

/** Abre una sesion de autenticacion de una empresa con Canva y devuelve la url. */
export async function enlaceConexionCanva(accountId: string, callbackUrl: string) {
  return enlaceConexion(accountId, "canva", callbackUrl)
}
