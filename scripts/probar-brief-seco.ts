/**
 * Prueba en seco del Estratega y del brief: conversa y escribe el brief sin crear
 * cuentas ni guardar nada de marca. Las llamadas salen con el token de la cuenta
 * de Plogy (solo se anota su gasto, como cualquier llamada).
 *
 *   npx tsx --env-file=.env.local scripts/probar-brief-seco.ts <caso>
 *
 * Sirve para juzgar la calidad del brief antes de tocar la base.
 */
import { mkdirSync, writeFileSync } from "node:fs"

import { escribirBrief, validarBrief } from "../src/engine/onboarding/brief"
import { turno, type Analisis } from "../src/engine/onboarding/estratega"
import { leerFuentes } from "../src/engine/onboarding/leer"
import { avance, completo, faltan, type TipoMarca } from "../src/engine/onboarding/requisitos"
import { supabaseAdmin } from "../src/engine/supabase-admin"

type Caso = { tipo: TipoMarca; enlaces: string[]; pegado: string; construir: boolean; respuestas: string[] }

const CASOS: Record<string, Caso> = {
  persona: {
    tipo: "persona",
    enlaces: [],
    pegado:
      "Soy Laura Méndez, nutricionista en Medellín. Atiendo en consulta hace 6 años, sobre todo a personas con diabetes tipo 2. Antes trabajé 3 años en un hospital. Me cansé de ver gente saliendo con una dieta fotocopiada que nadie sigue. Creo que comer rico es parte del tratamiento, no un premio.",
    construir: false,
    respuestas: [
      "Lo primero que miro no es qué come la persona sino cómo es su semana: quién cocina, a qué hora come, qué le da pereza.",
      "Las dietas de internet me parecen el mayor error. Y creo que la culpa no cura a nadie.",
      "No quiero hablar de mi familia ni de mi peso.",
    ],
  },
  web: { tipo: "servicios", enlaces: ["https://plogy.co"], pegado: "", construir: false, respuestas: [] },
  nada: {
    tipo: "local",
    enlaces: [],
    pegado: "",
    construir: true,
    respuestas: ["Quiero abrir una panadería de masa madre en Bogotá, en Chapinero. Todavía no tiene nombre.", "Ayúdame"],
  },
}

const ms = (d: number) => `${(d / 1000).toFixed(1)} s`

async function main() {
  const nombre = process.argv[2]
  const caso = CASOS[nombre]
  if (!caso) throw new Error(`Usa: ${Object.keys(CASOS).join(", ")}`)
  const { data } = await supabaseAdmin().from("accounts").select("id").eq("slug", "hancel").maybeSingle()
  const accountId = (data as { id: string }).id

  const lectura = await leerFuentes(caso.enlaces, caso.pegado)
  console.log("corpus", lectura.corpus.length, "colores", lectura.colores, "avisos", lectura.avisos)
  let a: Analisis = {
    account_id: accountId,
    tipo: caso.tipo,
    modo: caso.construir ? "construir" : "traer",
    permiso: null,
    fuentes: { colores: lectura.colores, avisos: lectura.avisos },
    corpus: lectura.corpus,
    archivos: [],
    datos: {},
    omitidos: [],
    mensajes: [],
    pendiente: null,
    opciones: [],
    temas: [],
    tema: null,
    caminos: [],
    preguntas: 0,
    brief: null,
    kit: null,
    conversacion_id: null,
    error: null,
  }

  let t = Date.now()
  a = await turno(a, { tipo: "iniciar" })
  console.log(`\n[${ms(Date.now() - t)}] ESTRATEGA: ${a.mensajes.at(-1)?.texto}\navance`, avance(a.datos, caso.tipo))
  for (const r of caso.respuestas) {
    t = Date.now()
    a = r === "Ayúdame" ? await turno(a, { tipo: "ayudame" }) : await turno(a, { tipo: "responder", texto: r })
    console.log(`\nPERSONA: ${r}\n[${ms(Date.now() - t)}] ESTRATEGA: ${a.mensajes.at(-1)?.texto}`)
    if (a.opciones.length) console.log("OPCIONES:", JSON.stringify(a.opciones, null, 1))
  }
  t = Date.now()
  a = await turno(a, { tipo: "rellenar_todo" })
  console.log(`\nRELLENAR TODO [${ms(Date.now() - t)}]: ${a.mensajes.at(-1)?.texto}`)
  console.log("avance", avance(a.datos, caso.tipo), "faltan", faltan(a.datos, caso.tipo, a.omitidos).map((r) => r.id))
  console.log("completo", completo(a.datos, caso.tipo), "temas", JSON.stringify(a.temas))

  mkdirSync("scripts/.salida", { recursive: true })
  writeFileSync(`scripts/.salida/seco-${nombre}-datos.json`, JSON.stringify(a.datos, null, 2))
  if (!completo(a.datos, caso.tipo) || !a.temas.length) throw new Error("La lista no quedó completa.")

  t = Date.now()
  const brief = await escribirBrief({ ...a, tema: a.temas[0] })
  console.log(`\nBRIEF en ${ms(Date.now() - t)}. Errores:`, validarBrief(brief))
  writeFileSync(`scripts/.salida/seco-${nombre}-brief.json`, JSON.stringify(brief, null, 2))
  console.log(JSON.stringify(brief, null, 2))
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
