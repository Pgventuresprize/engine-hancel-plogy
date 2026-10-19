import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Cliente con service role: inserta y borra en `raw_news` y `pipeline_runs`.
 *
 * A diferencia de `src/lib/supabase/server.ts`, este modulo NO importa
 * "server-only", porque el motor tambien corre fuera de Next (`npm run ingest`)
 * y ese paquete lanza al importarse desde Node plano. La proteccion aqui es
 * que la variable no lleva prefijo `NEXT_PUBLIC_`, asi que nunca entra al
 * bundle del navegador.
 *
 * NUNCA importar este modulo desde un Client Component.
 */
let cached: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. Copia .env.example a .env.local."
    )
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
