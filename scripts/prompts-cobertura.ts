/**
 * Prueba de cobertura de los prompts: arma el prompt de cada agente con la
 * marca real de una cuenta en todas las situaciones posibles y comprueba que
 * ninguno salga incompleto.
 *
 *   npm run prompts:cobertura -- --cuenta hancel
 *
 * Solo lee la base; no llama a Claude ni escribe nada. Falla (codigo 1) si:
 *   - un tipo de CTA no tiene su pieza de cierre en el oficio de Instagram;
 *   - alguna combinacion no se puede armar (le falta algo obligatorio);
 *   - alguna combinacion pasa del tope de tamaño;
 *   - una skill pide un pilar que ya no existe.
 * Avisa (sin fallar) si el mismo prompt da dos rangos distintos de hashtags o
 * de laminas: suele ser una skill que dice otro numero que el de Marca > Voz.
 */
import { textoDelPrompt } from "../src/engine/agents/armador"
import { AGENTES_CON_PROMPT, AGENTES_POR_PIEZA, armarPromptDe, PIEZAS_DE_OFICIO } from "../src/engine/agents/prompts"
import { ajustesDe } from "../src/engine/agents/settings"
import { cuentaPorSlug } from "../src/engine/accounts"
import { TOPE_PROMPT } from "../src/engine/marca/bloque"
import { OBJETIVOS } from "../src/engine/marca/clasificacion"
import { FORMATOS_ANGULO, type Situacion } from "../src/engine/marca/cuando"
import { TIPOS_CTA } from "../src/engine/marca/editorial-modelo"
import { datosParaPrompt } from "../src/engine/marca/prompt"

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file)
  } catch {
    // El archivo puede no existir: las variables pueden venir del entorno.
  }
}

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".")

/**
 * Los rangos de un numero que aparecen en un texto ("3 a 6 hashtags",
 * "Hashtags: 3 a 6"), cada uno con un trozo de donde sale.
 */
function rangos(texto: string, palabra: string): Map<string, string> {
  const vistos = new Map<string, string>()
  const numero = String.raw`(\d+)(?:\s*(?:a|-|–|o|y)\s*(\d+))?`
  const patrones = [new RegExp(String.raw`${numero}\s+${palabra}`, "gi"), new RegExp(String.raw`${palabra}:\s*${numero}`, "gi")]
  for (const patron of patrones) {
    for (const m of texto.matchAll(patron)) {
      const clave = m[2] ? `${m[1]}-${m[2]}` : m[1]
      if (!vistos.has(clave)) vistos.set(clave, texto.slice(Math.max(0, m.index - 60), m.index + m[0].length + 20).replace(/\s+/g, " "))
    }
  }
  return vistos
}

function situaciones(pilares: string[]): Situacion[] {
  const todas: Situacion[] = []
  for (const pilar of [null, ...pilares])
    for (const objetivo of [null, ...OBJETIVOS])
      for (const cta_tipo of [null, ...TIPOS_CTA])
        for (const formato of [null, ...FORMATOS_ANGULO])
          for (const logro of [false, true])
            for (const poco_material of [false, true])
              todas.push({ pilar, objetivo, cta_tipo, formato, logro, poco_material })
  return todas
}

async function main() {
  const i = process.argv.indexOf("--cuenta")
  const slug = i >= 0 ? process.argv[i + 1] : undefined
  if (!slug) throw new Error("Falta --cuenta <slug>.")
  const cuenta = await cuentaPorSlug(slug)
  if (!cuenta) throw new Error(`No existe la cuenta ${slug}.`)

  const datos = await datosParaPrompt(cuenta.id)
  const errores: string[] = []
  const avisos: string[] = []

  // Cada tipo de CTA tiene que tener su cierre: si mañana se añade uno, esto falla.
  for (const tipo of TIPOS_CTA) {
    if (!PIEZAS_DE_OFICIO.instagram.some((p) => p.cuando.cta_tipos.includes(tipo))) {
      errores.push(`El oficio de Instagram no tiene cierre para el CTA de tipo «${tipo}».`)
    }
  }

  const pilares = new Set(datos.editorial.pilares.map((p) => p.id))
  for (const s of datos.skills) {
    const perdidos = s.cuando.pilares.filter((id) => !pilares.has(id))
    if (perdidos.length > 0) errores.push(`La skill «${s.nombre}» pide un pilar que ya no existe.`)
  }

  for (const agente of AGENTES_CON_PROMPT) {
    const editado = (await ajustesDe(cuenta.id, agente)).prompt?.trim() || null
    const lista = (AGENTES_POR_PIEZA as readonly string[]).includes(agente) ? situaciones([...pilares]) : [null]
    let menor = Infinity
    let mayor = 0
    let fallidas = 0
    const hashtags = new Map<string, string>()
    const laminas = new Map<string, string>()

    for (const situacion of lista) {
      try {
        // Sin tope: se mide el tamaño real, no el recortado.
        const armado = armarPromptDe(agente, datos, editado, situacion, undefined, Infinity)
        const largo = armado.receta.caracteres
        menor = Math.min(menor, largo)
        mayor = Math.max(mayor, largo)
        if (largo > TOPE_PROMPT) {
          errores.push(`${agente}: «${armado.receta.situacion}» mide ${miles(largo)} caracteres (tope ${miles(TOPE_PROMPT)}).`)
        }
        const texto = textoDelPrompt(armado)
        for (const [r, donde] of rangos(texto, "hashtags")) if (!hashtags.has(r)) hashtags.set(r, donde)
        for (const [r, donde] of rangos(texto, "láminas")) if (!laminas.has(r)) laminas.set(r, donde)
      } catch (e) {
        fallidas++
        if (fallidas <= 3) errores.push(`${agente}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (fallidas > 3) errores.push(`${agente}: ${fallidas} combinaciones no se pudieron armar en total.`)
    const lista_ = (m: Map<string, string>) => [...m].map(([r, donde]) => `
         ${r}: «…${donde}…»`).join("")
    if (hashtags.size > 1) avisos.push(`${agente}: el prompt da varios números de hashtags:${lista_(hashtags)}`)
    if (laminas.size > 1) avisos.push(`${agente}: el prompt da varios números de láminas:${lista_(laminas)}`)

    console.log(
      `${agente.padEnd(10)} ${String(lista.length).padStart(5)} combinaciones · de ${miles(menor)} a ${miles(mayor)} caracteres${editado ? " · oficio editado" : ""}`
    )
  }

  console.log("")
  for (const a of avisos) console.log(`AVISO  ${a}`)
  for (const e of errores) console.log(`ERROR  ${e}`)
  if (errores.length === 0) console.log("Cobertura completa: todas las combinaciones se arman y caben.")
  process.exitCode = errores.length > 0 ? 1 : 0
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
