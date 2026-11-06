/**
 * Prueba el onboarding de punta a punta sin pantalla: crea una cuenta de prueba,
 * conversa como una persona, genera el brief y deja corriendo el primer post.
 *
 *   npx tsx --env-file=.env.local scripts/probar-onboarding.ts <caso> [--borrar <slug>]
 *
 * Casos: persona | web | nada | rellenar. Usa como clave de plataforma el token de
 * la cuenta de Plogy, sin imprimirlo, asi que gasta lo que gastaria una persona.
 * Con PRUEBA_CLAVE=real usa CLAUDE_PLATAFORMA_KEY. El modelo se cambia con
 * CLAUDE_PLATAFORMA_MODELO. Imprime lo que hace falta para juzgar: el brief, los
 * tiempos y el kit. El post se corre despues con scripts/pasada-chat.ts.
 */
import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"

import { guardarCapturas } from "../src/engine/onboarding/archivos"
import { generar, validarBrief } from "../src/engine/onboarding/brief"
import { analisisDe, guardarAnalisis, turno, type Analisis } from "../src/engine/onboarding/estratega"
import { leerFuentes } from "../src/engine/onboarding/leer"
import { avance, completo, faltan, type TipoMarca } from "../src/engine/onboarding/requisitos"
import { supabaseAdmin } from "../src/engine/supabase-admin"

type Caso = { tipo: TipoMarca; enlaces: string[]; pegado: string; construir: boolean; respuestas: string[]; rellenarTodo: boolean }

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
      "Quiero que me llegue gente a consulta, pero sin sonar a vendedora.",
    ],
    rellenarTodo: true,
  },
  web: { tipo: "producto", enlaces: [process.env.PRUEBA_WEB ?? "crepesywaffles.com"], pegado: "", construir: false, respuestas: [], rellenarTodo: true },
  nada: {
    tipo: "local",
    enlaces: [],
    pegado: "",
    construir: true,
    respuestas: ["Quiero abrir una panadería de masa madre en Bogotá, en Chapinero. Todavía no tiene nombre.", "No sé", "Ayúdame"],
    rellenarTodo: true,
  },
  rellenar: { tipo: "producto", enlaces: [], pegado: "Vendo velas de soya hechas a mano en Cali. Se llaman Lumbre.", construir: false, respuestas: [], rellenarTodo: true },
}

const supabase = supabaseAdmin()
const ms = (d: number) => `${(d / 1000).toFixed(1)} s`

async function crearCuenta(nombre: string): Promise<string> {
  const slug = `prueba-onboarding-${randomUUID().slice(0, 8)}`
  const { data, error } = await supabase
    .from("accounts")
    .insert({ name: nombre, slug, plan: "basic", onboarding: "en_curso", clave_plataforma: true })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  const id = (data as { id: string }).id
  await supabase.from("account_secrets").insert({ account_id: id })
  const { asegurarConfiguracion } = await import("../src/engine/empresas")
  await asegurarConfiguracion(id)
  return id
}

async function ponerClave() {
  if (process.env.PRUEBA_CLAVE === "real") return
  const { data } = await supabase.from("accounts").select("id").eq("slug", "hancel").maybeSingle()
  const { secretosDe } = await import("../src/engine/secretos")
  const token = (await secretosDe((data as { id: string }).id)).claude_oauth_token?.replace(/\s+/g, "")
  if (!token) throw new Error("La cuenta de Plogy no tiene token.")
  process.env.CLAUDE_PLATAFORMA_KEY = token
}

/** La conversacion necesita un autor real: se usa quien administra Plogy. */
async function autorDePrueba(): Promise<string> {
  const { data: cuenta } = await supabase.from("accounts").select("id").eq("slug", "hancel").maybeSingle()
  const { data } = await supabase.from("account_members").select("user_id").eq("account_id", (cuenta as { id: string }).id).limit(1).maybeSingle()
  return (data as { user_id: string }).user_id
}

async function main() {
  const [nombreCaso] = process.argv.slice(2)
  const caso = CASOS[nombreCaso]
  if (!caso) throw new Error(`Caso desconocido. Usa: ${Object.keys(CASOS).join(", ")}`)
  await ponerClave()
  const accountId = await crearCuenta(`Prueba ${nombreCaso}`)
  console.log("cuenta", accountId)

  const lectura = await leerFuentes(caso.enlaces, caso.pegado)
  console.log("corpus", lectura.corpus.length, "colores", lectura.colores, "avisos", lectura.avisos)
  let a: Analisis = {
    account_id: accountId,
    tipo: caso.tipo,
    modo: caso.construir ? "construir" : "traer",
    permiso: { usuario: "prueba", fecha: new Date().toISOString() },
    fuentes: {
      enlaces: caso.enlaces,
      colores: lectura.colores,
      medidos: lectura.medidos,
      tipografias: lectura.tipografias,
      logos: lectura.logos,
      imagenes: lectura.imagenes,
      avisos: lectura.avisos,
      capturas: await guardarCapturas(accountId, lectura.capturas),
      logo: lectura.logos[0] ?? null,
      logoListo: true,
    },
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

  const inicio = Date.now()
  a = await turno(a, { tipo: "iniciar", bloques: lectura.capturas.map((datos) => ({ tipo: "imagen" as const, mime: "image/jpeg" as const, datos })) })
  console.log(`\n[${ms(Date.now() - inicio)}] ESTRATEGA: ${a.mensajes.at(-1)?.texto}`)
  console.log("avance", avance(a.datos, caso.tipo))
  for (const r of caso.respuestas) {
    const t = Date.now()
    a = r === "Ayúdame" ? await turno(a, { tipo: "ayudame" }) : await turno(a, { tipo: "responder", texto: r })
    console.log(`\nPERSONA: ${r}\n[${ms(Date.now() - t)}] ESTRATEGA: ${a.mensajes.at(-1)?.texto}`)
    if (a.opciones.length) console.log("OPCIONES:", a.opciones)
  }
  if (caso.rellenarTodo && !a.temas.length) {
    const t = Date.now()
    a = await turno(a, { tipo: "rellenar_todo" })
    console.log(`\nRELLENAR TODO [${ms(Date.now() - t)}]: ${a.mensajes.at(-1)?.texto}`)
  }
  console.log("avance", avance(a.datos, caso.tipo), "faltan", faltan(a.datos, caso.tipo, a.omitidos).map((r) => r.id))
  console.log("completo", completo(a.datos, caso.tipo), "temas", a.temas)
  if (!completo(a.datos, caso.tipo) || !a.temas.length) {
    await guardarAnalisis(a)
    throw new Error("La lista no quedó completa.")
  }

  a = { ...a, tema: a.temas[0] }
  await guardarAnalisis(a)
  const reloj = Date.now()
  const { brief, conversacionId } = await generar(a, await autorDePrueba())
  const final = await analisisDe(accountId)
  console.log(`
GENERAR en ${ms(Date.now() - reloj)}. Errores del brief:`, validarBrief(brief), "kit:", final?.kit)

  mkdirSync("scripts/.salida", { recursive: true })
  writeFileSync(`scripts/.salida/${nombreCaso}-${process.env.CLAUDE_PLATAFORMA_MODELO ?? "mixto"}.json`, JSON.stringify({ accountId, conversacionId, datos: a.datos, brief }, null, 2))
  console.log(`\nconversacion ${conversacionId}\nreloj_inicio ${new Date(reloj).toISOString()}`)
  console.log("guardado", Boolean(await analisisDe(accountId)))
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
