/**
 * Instala un diseño ya generado en una cuenta de prueba nueva y lo dibuja con el
 * motor real, sin gastar en Claude. Comprueba que lo que dibuja `dibujarDiseno`
 * sobreviva al guardado: fuentes, plantillas aprobadas y kit activo.
 *
 *   npx tsx --env-file=.env.local scripts/probar-instalar-kit.ts <caso>
 *
 * Lee scripts/.salida/seco-<caso>-brief.json y plantillas-<caso>/diseno.json.
 */
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"

import { kitActivo } from "../src/engine/marca/kit"
import type { Brief } from "../src/engine/onboarding/brief"
import { instalarKit, type DisenoMarca } from "../src/engine/onboarding/plantillas"
import { supabaseAdmin } from "../src/engine/supabase-admin"

async function main() {
  const caso = process.argv[2]
  const brief = JSON.parse(readFileSync(`scripts/.salida/seco-${caso}-brief.json`, "utf8")) as Brief
  const diseno = JSON.parse(readFileSync(`scripts/.salida/plantillas-${caso}/diseno.json`, "utf8")) as DisenoMarca
  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from("accounts")
    .insert({ name: "Prueba kit", slug: `prueba-onboarding-${randomUUID().slice(0, 8)}`, plan: "basic", onboarding: "listo" })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  const id = (data as { id: string }).id
  console.log("cuenta", id)
  const t = Date.now()
  const kitId = await instalarKit(id, brief, diseno)
  console.log(`instalado en ${((Date.now() - t) / 1000).toFixed(1)} s`, kitId)
  const kc = await kitActivo(id)
  console.log("activo", kc?.kit.id === kitId, "plantillas", kc?.plantillas.length, "archivos", kc?.archivos.map((a) => a.papel))
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
