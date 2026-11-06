/**
 * Abre una web con el navegador del onboarding y enseña lo que saca. No usa Claude
 * ni la base.
 *
 *   npx tsx scripts/probar-captura.ts <url> [<url>...]
 */
import { mkdirSync, writeFileSync } from "node:fs"

import { capturarWeb } from "../src/engine/onboarding/capturar"

async function main() {
  mkdirSync("scripts/.salida/capturas", { recursive: true })
  for (const url of process.argv.slice(2)) {
    const t = Date.now()
    try {
      const c = await capturarWeb(url)
      console.log(`\n${url} en ${((Date.now() - t) / 1000).toFixed(1)} s`)
      console.log("paginas", c.paginas.map((p) => `${p.url} (${p.texto.length})`))
      console.log("colores", c.colores.slice(0, 8).map((x) => `${x.hex} ${x.de} ${x.peso}%`))
      console.log("fuentes", c.fuentes)
      console.log("logos", c.logos)
      console.log("imagenes", c.imagenes.length, c.imagenes.slice(0, 3).map((i) => i.url))
      console.log("inicio del texto:", c.paginas[0].texto.slice(0, 300).replace(/\n/g, " | "))
      const nombre = new URL(/^https?:/.test(url) ? url : `https://${url}`).hostname
      c.capturas.forEach((b, i) => writeFileSync(`scripts/.salida/capturas/${nombre}-${i}.jpg`, b))
    } catch (e) {
      console.log(`\n${url} FALLÓ en ${((Date.now() - t) / 1000).toFixed(1)} s:`, e instanceof Error ? e.message : e)
    }
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
