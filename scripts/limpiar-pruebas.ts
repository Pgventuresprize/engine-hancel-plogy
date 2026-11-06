/**
 * Borra las cuentas de prueba del onboarding: sus archivos, sus filas y sus usuarios.
 * Solo toca slugs `prueba-onboarding-*` y `prueba-pantalla*`, y correos
 * `prueba-onboarding-*@example.com`.
 *
 *   npx tsx --env-file=.env.local scripts/limpiar-pruebas.ts          (solo lista)
 *   npx tsx --env-file=.env.local scripts/limpiar-pruebas.ts --borrar
 */
import { supabaseAdmin } from "../src/engine/supabase-admin"

const DE_PRUEBA = /^prueba-(onboarding-[0-9a-f]{8}|pantalla(-\d+)?)$/
const BUCKETS = ["marca-kits", "marca-imagenes", "carousels"]

const supabase = supabaseAdmin()

/** Todas las rutas bajo una carpeta, a cualquier profundidad. */
async function rutasDe(bucket: string, carpeta: string): Promise<string[]> {
  const { data } = await supabase.storage.from(bucket).list(carpeta, { limit: 1000 })
  const salida: string[] = []
  for (const f of data ?? []) {
    const ruta = `${carpeta}/${f.name}`
    if (f.id) salida.push(ruta)
    else salida.push(...(await rutasDe(bucket, ruta)))
  }
  return salida
}

async function main() {
  const borrar = process.argv.includes("--borrar")
  const { data, error } = await supabase.from("accounts").select("id, slug")
  if (error) throw new Error(error.message)
  const cuentas = ((data ?? []) as { id: string; slug: string }[]).filter((c) => DE_PRUEBA.test(c.slug))
  console.log(`${cuentas.length} cuentas de prueba de ${data?.length ?? 0}`)

  for (const c of cuentas) {
    if (!DE_PRUEBA.test(c.slug)) continue
    // Las laminas viven por trabajo, no por cuenta: se sacan de las piezas antes de borrarlas.
    const { data: piezas } = await supabase.from("content_pieces").select("payload").eq("account_id", c.id)
    const laminas = (JSON.stringify(piezas ?? []).match(/\/carousels\/[^"\\?]+/g) ?? []).map((u) => u.replace("/carousels/", ""))
    const porBucket: Record<string, string[]> = { carousels: laminas }
    for (const b of BUCKETS) porBucket[b] = [...(porBucket[b] ?? []), ...(await rutasDe(b, c.id))]
    const total = Object.values(porBucket).reduce((n, l) => n + l.length, 0)
    console.log(c.slug, `${total} archivos`)
    if (!borrar) continue
    for (const [b, rutas] of Object.entries(porBucket)) {
      if (rutas.length) await supabase.storage.from(b).remove([...new Set(rutas)])
    }
    const { error: fallo } = await supabase.from("accounts").delete().eq("id", c.id).eq("slug", c.slug)
    console.log(fallo ? `  NO se borró: ${fallo.message}` : "  borrada")
  }

  const { data: lista } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  for (const u of lista?.users ?? []) {
    if (!/^prueba-onboarding-[0-9a-f]{8}@example\.com$/.test(u.email ?? "")) continue
    console.log("usuario", u.email)
    if (borrar) {
      const { error: fallo } = await supabase.auth.admin.deleteUser(u.id)
      console.log(fallo ? `  NO se borró: ${fallo.message}` : "  borrado")
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
