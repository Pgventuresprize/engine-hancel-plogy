"use server"

import {
  activarKit,
  cargarKit,
  kitsDisponibles,
  revisarPlantillaDelKit,
  type ArchivoKit,
  type Kit,
  type Plantilla,
} from "@/engine/marca/kit"
import {
  avanzarImportacion,
  empezarImportacion,
  imagenesDeRevision,
  parseImportacion,
  prepararSubidaImportacion,
  registrarSubidaImportacion,
  rehacerPlantilla,
  reintentarImportacion,
  type ArchivoImportado,
  type Importacion,
  type SubidaKit,
} from "@/engine/marca/kit-importar"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"

/**
 * Lo que pide Marca > Kit de diseño: subir un kit, ir avanzando su
 * importacion, revisar sus plantillas y activarlo.
 */

type Fallo = { ok: false; error: string }
const fallo = (error: unknown, porDefecto: string): Fallo => ({
  ok: false,
  error: (error instanceof Error ? error.message : String(error)) || porDefecto,
})

export type KitEnLista = {
  id: string
  version: number
  estado: Kit["estado"]
  nombre: string
  created_at: string
  importacion: Importacion | null
}

export async function listarKits(): Promise<{ ok: true; disponible: boolean; kits: KitEnLista[] } | Fallo> {
  try {
    if (!(await kitsDisponibles())) return { ok: true, disponible: false, kits: [] }
    const { data, error } = await supabaseAdmin()
      .from("brand_kits")
      .select("id, version, estado, nombre, created_at, importacion")
      .eq("account_id", await idDeCuentaActual())
      .order("version", { ascending: false })
    if (error) throw new Error(error.message)
    return {
      ok: true,
      disponible: true,
      kits: (data ?? []).map((k) => ({
        id: String(k.id),
        version: Number(k.version),
        estado: k.estado as Kit["estado"],
        nombre: String(k.nombre ?? ""),
        created_at: String(k.created_at),
        importacion: parseImportacion(k.importacion),
      })),
    }
  } catch (error) {
    return fallo(error, "No se pudieron leer los kits.")
  }
}

export async function empezarImportacionKit(nombre: string): Promise<{ ok: true; kitId: string } | Fallo> {
  try {
    return { ok: true, kitId: await empezarImportacion(await idDeCuentaActual(), nombre.trim().slice(0, 120)) }
  } catch (error) {
    return fallo(error, "No se pudo empezar la importación.")
  }
}

export async function prepararSubidaKit(
  kitId: string,
  lista: { ruta: string; mime: string; bytes: number }[]
): Promise<{ ok: true; subidas: SubidaKit[] } | Fallo> {
  try {
    return { ok: true, subidas: await prepararSubidaImportacion(await idDeCuentaActual(), kitId, lista) }
  } catch (error) {
    return fallo(error, "No se pudo preparar la subida.")
  }
}

export async function registrarSubidaKit(
  kitId: string,
  archivos: ArchivoImportado[],
  terminado: boolean
): Promise<{ ok: true; importacion: Importacion } | Fallo> {
  try {
    return {
      ok: true,
      importacion: await registrarSubidaImportacion(await idDeCuentaActual(), kitId, archivos, terminado),
    }
  } catch (error) {
    return fallo(error, "No se pudo registrar la subida.")
  }
}

/** Un paso de la importacion. La pantalla lo llama hasta que termina. */
export async function avanzarKit(kitId: string): Promise<{ ok: true; importacion: Importacion } | Fallo> {
  try {
    return { ok: true, importacion: await avanzarImportacion(await idDeCuentaActual(), kitId) }
  } catch (error) {
    return fallo(error, "No se pudo avanzar la importación.")
  }
}

export async function reintentarKit(kitId: string, paso: Importacion["paso"]): Promise<{ ok: true } | Fallo> {
  try {
    await reintentarImportacion(await idDeCuentaActual(), kitId, paso)
    return { ok: true }
  } catch (error) {
    return fallo(error, "No se pudo reintentar.")
  }
}

export type DetalleKit = {
  kit: Kit
  plantillas: Plantilla[]
  archivos: Pick<ArchivoKit, "id" | "papel" | "tipo" | "nombre_original" | "meta">[]
  imagenes: Record<string, string>
}

/** El kit con sus plantillas y las imagenes de revision (original, generada, pruebas). */
export async function detalleKit(kitId: string): Promise<{ ok: true; detalle: DetalleKit } | Fallo> {
  try {
    const kc = await cargarKit(await idDeCuentaActual(), kitId)
    if (!kc) return { ok: false, error: "No se encontró el kit." }
    return {
      ok: true,
      detalle: {
        kit: kc.kit,
        plantillas: kc.plantillas,
        archivos: kc.archivos.map(({ id, papel, tipo, nombre_original, meta }) => ({
          id,
          papel,
          tipo,
          nombre_original,
          meta,
        })),
        imagenes: await imagenesDeRevision(kc),
      },
    }
  } catch (error) {
    return fallo(error, "No se pudo abrir el kit.")
  }
}

export async function aprobarPlantilla(plantillaId: string, aprobada: boolean): Promise<{ ok: true } | Fallo> {
  try {
    await revisarPlantillaDelKit(await idDeCuentaActual(), plantillaId, { estado: aprobada ? "aprobada" : "pendiente" })
    return { ok: true }
  } catch (error) {
    return fallo(error, "No se pudo guardar.")
  }
}

/** Claude corrige la plantilla con la nota de la persona y se vuelve a probar. */
export async function rehacerPlantillaKit(plantillaId: string, nota: string): Promise<{ ok: true } | Fallo> {
  try {
    if (!nota.trim()) return { ok: false, error: "Escribe qué hay que cambiar." }
    await rehacerPlantilla(await idDeCuentaActual(), plantillaId, nota.trim())
    return { ok: true }
  } catch (error) {
    return fallo(error, "No se pudo rehacer la plantilla.")
  }
}

export async function activarKitMarca(kitId: string): Promise<{ ok: true } | Fallo> {
  try {
    await activarKit(await idDeCuentaActual(), kitId)
    return { ok: true }
  } catch (error) {
    return fallo(error, "No se pudo activar el kit.")
  }
}
