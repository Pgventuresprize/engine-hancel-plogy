/**
 * Baja lo que salio en una pieza para juzgarla: texto y laminas.
 *
 *   npx tsx --env-file=.env.local scripts/ver-pieza.ts <piece_id> <carpeta>
 */
import { mkdirSync, writeFileSync } from "node:fs"

import { supabaseAdmin } from "../src/engine/supabase-admin"

async function main() {
  const [id, carpeta] = process.argv.slice(2)
  const supabase = supabaseAdmin()
  const { data, error } = await supabase.from("content_pieces").select("*").eq("id", id).maybeSingle()
  if (error || !data) throw new Error(error?.message ?? "No existe esa pieza")
  const p = data as Record<string, unknown>
  console.log("columnas", Object.keys(p).join(", "))
  console.log("modelo/estado", p.status, p.template, p.review_status)
  console.log("\nCAPTION\n", p.caption ?? p.body ?? p.copy)
  const dir = `scripts/.salida/${carpeta}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/pieza.json`, JSON.stringify(p, null, 2))
  const crudo = JSON.stringify(p)
  const urls = [...new Set(crudo.match(/https:[^"\\]+\.(png|jpg|jpeg|webp)[^"\\]*/g) ?? [])]
  console.log("urls", urls.length)
  for (const [i, u] of urls.slice(0, 12).entries()) {
    const r = await fetch(u)
    if (r.ok) writeFileSync(`${dir}/lamina-${String(i + 1).padStart(2, "0")}.png`, Buffer.from(await r.arrayBuffer()))
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
