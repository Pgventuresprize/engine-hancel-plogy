/**
 * Pasa la auditoria sobre un brief ya guardado por probar-onboarding.ts, para ver si
 * encuentra lo que no tiene respaldo. No guarda nada.
 *
 *   npx tsx --env-file=.env.local scripts/probar-auditoria.ts <archivo.json> <palabra>...
 *
 * Las palabras son lo que no deberia sobrevivir.
 */
import { readFileSync } from "node:fs"

import { auditarBrief, type Brief } from "../src/engine/onboarding/brief"
import { analisisDe } from "../src/engine/onboarding/estratega"

async function main() {
  const [archivo, ...palabras] = process.argv.slice(2)
  const { accountId, brief } = JSON.parse(readFileSync(archivo, "utf8")) as { accountId: string; brief: Brief }
  const a = await analisisDe(accountId)
  if (!a) throw new Error("No hay análisis de esa cuenta.")
  const t = Date.now()
  const auditado = await auditarBrief(a, brief)
  console.log(`auditado en ${((Date.now() - t) / 1000).toFixed(1)} s`)
  const todo = [auditado.esencia, auditado.sabe, auditado.material, ...auditado.ideas].join("\n")
  for (const p of palabras) console.log(`"${p}" sobrevive:`, new RegExp(p, "i").test(todo))
  console.log("\nSABE\n", auditado.sabe.slice(0, 800), "\n\nMATERIAL\n", auditado.material.slice(0, 600))
  console.log("\nlargos", { antes: brief.esencia.length, despues: auditado.esencia.length }, "ideas", brief.ideas.length, auditado.ideas.length)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
