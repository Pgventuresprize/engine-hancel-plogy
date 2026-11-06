/**
 * Genera las plantillas de una marca a partir de un brief guardado por
 * probar-brief-seco.ts y las dibuja en PNG. No guarda nada en la base.
 *
 *   npx tsx --env-file=.env.local scripts/probar-plantillas.ts <caso>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

import type { Brief } from "../src/engine/onboarding/brief"
import { dibujarDiseno, disenarPlantillas, fuentesDeMarca, type DisenoMarca } from "../src/engine/onboarding/plantillas"
import { cerrarNavegador } from "../src/engine/render/navegador"
import { supabaseAdmin } from "../src/engine/supabase-admin"

async function main() {
  const caso = process.argv[2]
  const brief = JSON.parse(readFileSync(`scripts/.salida/seco-${caso}-brief.json`, "utf8")) as Brief
  const { data } = await supabaseAdmin().from("accounts").select("id").eq("slug", "hancel").maybeSingle()
  const accountId = (data as { id: string }).id

  let t = Date.now()
  const fuentes = await fuentesDeMarca(brief)
  console.log(`fuentes en ${Date.now() - t} ms:`, fuentes.map((f) => `${f.familia} ${f.peso}`))
  t = Date.now()
  const guardado = `scripts/.salida/plantillas-${caso}/diseno.json`
  const diseno = process.argv.includes("--dibujar") ? (JSON.parse(readFileSync(guardado, "utf8")) as DisenoMarca) : await disenarPlantillas(accountId, brief)
  console.log(`diseño en ${((Date.now() - t) / 1000).toFixed(1)} s:`, diseno.notas, diseno.plantillas.map((p) => p.tipo))

  const dir = `scripts/.salida/plantillas-${caso}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/diseno.json`, JSON.stringify(diseno, null, 2))
  t = Date.now()
  const dibujadas = await dibujarDiseno(diseno, fuentes)
  console.log(`dibujo en ${((Date.now() - t) / 1000).toFixed(1)} s`)
  for (const { tipo, lamina } of dibujadas) {
    writeFileSync(`${dir}/${tipo}.png`, lamina.png)
    console.log(tipo, "problemas:", JSON.stringify(lamina.problemas).slice(0, 300))
  }
  await cerrarNavegador()
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
