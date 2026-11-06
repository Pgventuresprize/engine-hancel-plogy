/**
 * Sube un archivo a una cuenta de prueba como lo haria la pantalla y lo lee.
 * Comprueba la direccion firmada, la ruta de la cuenta y la transcripcion.
 *
 *   npx tsx --env-file=.env.local scripts/probar-archivos.ts <cuenta> <archivo> <mime>
 */
import { readFileSync, statSync } from "node:fs"
import { basename } from "node:path"

import { bajarArchivo, leerArchivos, prepararSubidas } from "../src/engine/onboarding/archivos"

async function main() {
  const [cuenta, ruta, mime] = process.argv.slice(2)
  const [subida] = await prepararSubidas(cuenta, [{ nombre: basename(ruta), mime, bytes: statSync(ruta).size }])
  const r = await fetch(subida.url, { method: "PUT", body: readFileSync(ruta), headers: { "content-type": mime, "x-upsert": "false" } })
  console.log("subida", r.status)
  const t = Date.now()
  const lectura = await leerArchivos(cuenta, [subida])
  console.log(`leído en ${((Date.now() - t) / 1000).toFixed(1)} s`, "avisos", lectura.avisos, "imagenes", lectura.bloques.length)
  console.log(lectura.corpus.slice(0, 700))
  console.log("\nruta ajena se rechaza:", (await bajarArchivo(cuenta, "00000000-0000-0000-0000-000000000000/onboarding/x.pdf")) === null)
  console.log("salirse de la carpeta se rechaza:", (await bajarArchivo(cuenta, `${cuenta}/onboarding/../../otro.pdf`)) === null)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
