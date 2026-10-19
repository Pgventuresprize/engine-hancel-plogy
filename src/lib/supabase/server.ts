import "server-only"

import { createClient } from "@supabase/supabase-js"

/**
 * Cliente de Supabase para uso EXCLUSIVO en el servidor.
 *
 * Las tablas `raw_news` y `pipeline_runs` tienen RLS deshabilitado, asi que la
 * clave publicable concede lectura y escritura sobre todas las filas. Por eso
 * las variables no llevan el prefijo NEXT_PUBLIC_ y este modulo importa
 * "server-only": si algun componente de cliente lo importa, el build falla en
 * lugar de filtrar la credencial al navegador.
 */
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    "Faltan SUPABASE_URL y/o SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local."
  )
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
