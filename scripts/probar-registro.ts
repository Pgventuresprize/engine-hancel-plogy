/**
 * Crea varias cuentas a la vez, como un registro masivo. Deja cuentas de prueba: se
 * borran con scripts/limpiar-pruebas.ts.
 *
 *   npx tsx --env-file=.env.local scripts/probar-registro.ts [cuantas]
 */
import { randomUUID } from "node:crypto"

import { asegurarConfiguracion } from "../src/engine/empresas"
import { supabaseAdmin } from "../src/engine/supabase-admin"

async function crear(): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("accounts")
    .insert({ name: "Prueba registro", slug: `prueba-onboarding-${randomUUID().slice(0, 8)}`, plan: "basic" })
    .select("id")
    .single()
  if (error) return `cuenta: ${error.message}`
  try {
    await asegurarConfiguracion((data as { id: string }).id)
    return null
  } catch (e) {
    return `configuración: ${e instanceof Error ? e.message : e}`
  }
}

async function main() {
  const n = Number(process.argv[2] ?? 10)
  for (let tanda = 1; tanda <= 2; tanda++) {
    const fallos = (await Promise.all(Array.from({ length: n }, crear))).filter(Boolean)
    console.log(`tanda ${tanda}: ${n - fallos.length} de ${n} bien`, fallos.slice(0, 3))
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
