/**
 * Lee una web y deja listas sus fotos sin tocar la base: cuantas aparecen, cuantas
 * pasan el filtro. Guarda las que pasan para mirarlas.
 *
 *   npx tsx scripts/probar-fotos.ts <url>...
 */
import { mkdirSync, writeFileSync } from "node:fs"

import { enCola } from "../src/engine/onboarding/archivos"
import { capturarWeb } from "../src/engine/onboarding/capturar"
import { prepararFoto } from "../src/engine/onboarding/fotos"

async function main() {
  for (const url of process.argv.slice(2)) {
    const t = Date.now()
    const c = await capturarWeb(url)
    const dir = `scripts/.salida/fotos/${url.replace(/\W+/g, "-")}`
    mkdirSync(dir, { recursive: true })
    let bajadas = 0
    let buenas = 0
    await enCola(
      c.imagenes.map((f, i) => ({ f, i })),
      5,
      async ({ f, i }) => {
        const r = await fetch(f.url, { signal: AbortSignal.timeout(12_000) }).catch(() => null)
        if (!r?.ok) return
        bajadas++
        const datos = await r.arrayBuffer().catch(() => null)
        if (!datos) return
        const p = await prepararFoto(Buffer.from(datos))
        if (!p) return
        buenas++
        writeFileSync(`${dir}/${String(i).padStart(2, "0")}.webp`, p.mini)
      }
    )
    console.log(`${url}: ${c.imagenes.length} encontradas, ${bajadas} bajadas, ${buenas} pasan el filtro, ${((Date.now() - t) / 1000).toFixed(1)} s`)
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
