/**
 * Cambia la contraseña de una persona de Hancel desde la terminal.
 *
 *   npx tsx --env-file=.env.local scripts/cambiar-contrasena.ts correo@ejemplo.com
 *
 * La contraseña nueva se escribe aqui mismo y no se ve en pantalla: no queda en
 * el historial de la terminal ni en ningun archivo. Supabase solo guarda su hash.
 */
import { createInterface } from "node:readline"
import { Writable } from "node:stream"

import { supabaseAdmin } from "../src/engine/supabase-admin"

/** Pide un texto sin enseñarlo mientras se escribe. */
function preguntarOculto(pregunta: string): Promise<string> {
  let callado = false
  const salida = new Writable({
    write(trozo, _codificacion, listo) {
      if (!callado) process.stdout.write(trozo)
      listo()
    },
  })
  const rl = createInterface({ input: process.stdin, output: salida, terminal: true })
  return new Promise((resolver) => {
    rl.question(pregunta, (respuesta) => {
      rl.close()
      process.stdout.write("\n")
      resolver(respuesta)
    })
    callado = true
  })
}

async function main() {
  const correo = (process.argv[2] ?? "").trim().toLowerCase()
  if (!correo) throw new Error("Falta el correo: scripts/cambiar-contrasena.ts correo@ejemplo.com")

  const supabase = supabaseAdmin()
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const persona = data.users.find((u) => u.email?.toLowerCase() === correo)
  if (!persona) throw new Error(`No hay nadie en Hancel con el correo ${correo}.`)

  const nueva = await preguntarOculto(`Contraseña nueva para ${correo}: `)
  if (nueva.length < 8) throw new Error("Tiene que tener al menos 8 caracteres.")
  const otraVez = await preguntarOculto("Escríbela otra vez: ")
  if (otraVez !== nueva) throw new Error("No coinciden: no cambié nada.")

  const { error: fallo } = await supabase.auth.admin.updateUserById(persona.id, { password: nueva })
  if (fallo) throw fallo
  console.log(`Listo: ${correo} ya entra con la contraseña nueva.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
