import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"

/**
 * Cliente para lecturas de la interfaz, EXCLUSIVO del servidor. Es el mismo del
 * motor (InsForge con la API key): las tablas tienen RLS sin politicas y la
 * anon key no ve nada. "server-only" hace que el build falle si un componente
 * de cliente lo importa.
 */
export const supabase = new Proxy({} as ReturnType<typeof supabaseAdmin>, {
  get: (_t, prop) => Reflect.get(supabaseAdmin(), prop),
})
