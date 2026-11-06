import { NextResponse } from "next/server"

import { guardarCapturas, leerArchivos, prepararSubidas, type PedidoSubida } from "@/engine/onboarding/archivos"
import { generar } from "@/engine/onboarding/brief"
import { analisisDe, guardarAnalisis, turno, type Accion, type Analisis, type ArchivoSubido } from "@/engine/onboarding/estratega"
import { traerFotos } from "@/engine/onboarding/fotos"
import { leerFuentes } from "@/engine/onboarding/leer"
import { completo, TIPOS_MARCA, type TipoMarca } from "@/engine/onboarding/requisitos"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { cuentaActual } from "@/lib/accounts"
import { usuarioActual } from "@/lib/supabase/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const VACIO = (accountId: string): Analisis => ({
  account_id: accountId,
  tipo: null,
  modo: "traer",
  permiso: null,
  fuentes: {},
  corpus: "",
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
})

const texto = (v: unknown, tope: number) => (typeof v === "string" ? v.trim().slice(0, tope) : "")

/** Lo subido, tal como lo devolvio la subida. El servidor comprueba de nuevo cada ruta al leerla. */
function archivosDe(v: unknown): ArchivoSubido[] {
  if (!Array.isArray(v)) return []
  return (v as Record<string, unknown>[])
    .map((o) => ({ ruta: texto(o?.ruta, 300), nombre: texto(o?.nombre, 200), mime: texto(o?.mime, 60), bytes: Number(o?.bytes) || 0 }))
    .filter((a) => a.ruta && a.mime)
    .slice(0, 8)
}

async function marcarEnCurso(accountId: string): Promise<void> {
  await supabaseAdmin().from("accounts").update({ onboarding: "en_curso" }).eq("id", accountId).eq("onboarding", "pendiente")
}

/** Cada paso del onboarding. Devuelve el analisis al dia para pintar la pantalla. */
export async function POST(request: Request) {
  const usuario = await usuarioActual()
  if (!usuario) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const cuenta = await cuentaActual()
  if (cuenta.rol !== "owner") return NextResponse.json({ error: "Solo quien gestiona la marca puede hacer esto." }, { status: 403 })

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const accion = texto(body.accion, 30)
  const previo = (await analisisDe(cuenta.id)) ?? VACIO(cuenta.id)

  try {
    if (accion === "tipo") {
      const tipo = texto(body.tipo, 20) as TipoMarca
      if (!TIPOS_MARCA.includes(tipo)) return NextResponse.json({ error: "Ese tipo no existe." }, { status: 400 })
      const siguiente = { ...previo, tipo }
      await guardarAnalisis(siguiente)
      await marcarEnCurso(cuenta.id)
      return NextResponse.json(siguiente)
    }

    if (accion === "subidas") {
      const pedidos: PedidoSubida[] = (Array.isArray(body.archivos) ? (body.archivos as Record<string, unknown>[]) : []).map((o) => ({
        nombre: texto(o?.nombre, 200),
        mime: texto(o?.mime, 60),
        bytes: Number(o?.bytes) || 0,
      }))
      return NextResponse.json({ subidas: await prepararSubidas(cuenta.id, pedidos) })
    }

    if (accion === "logo") {
      const elegido = typeof body.logo === "string" ? body.logo : null
      if (elegido && !previo.fuentes.logos?.includes(elegido)) return NextResponse.json({ error: "Ese logo no está entre los encontrados." }, { status: 400 })
      const siguiente = { ...previo, fuentes: { ...previo.fuentes, logo: elegido, logoListo: true } }
      await guardarAnalisis(siguiente)
      return NextResponse.json(siguiente)
    }

    if (accion === "fuentes") {
      if (body.permiso !== true) return NextResponse.json({ error: "Confirma que la marca es tuya o que tienes autorización." }, { status: 400 })
      const enlaces = Array.isArray(body.enlaces) ? body.enlaces.map((e) => texto(e, 300)).filter(Boolean) : []
      const archivos = archivosDe(body.archivos)
      const logoPropio = archivosDe(body.logo ? [body.logo] : [])[0]?.ruta ?? null
      const fotos = archivosDe(body.fotos).map((f) => f.ruta)
      const [lectura, subidos] = await Promise.all([leerFuentes(enlaces, texto(body.pegado, 20_000)), leerArchivos(cuenta.id, archivos)])
      const capturas = await guardarCapturas(cuenta.id, lectura.capturas)
      const conFuentes: Analisis = {
        ...previo,
        modo: body.construir === true ? "construir" : "traer",
        permiso: { usuario: usuario.id, fecha: new Date().toISOString() },
        fuentes: {
          enlaces,
          colores: lectura.colores,
          medidos: lectura.medidos,
          tipografias: lectura.tipografias,
          logos: lectura.logos,
          imagenes: lectura.imagenes,
          capturas,
          fotos,
          avisos: [...lectura.avisos, ...subidos.avisos],
          logo: logoPropio,
          logoListo: Boolean(logoPropio) || !lectura.logos.length,
        },
        archivos,
        corpus: [lectura.corpus, subidos.corpus].filter(Boolean).join("\n\n"),
      }
      const bloques = [...subidos.bloques, ...lectura.capturas.map((datos) => ({ tipo: "imagen" as const, mime: "image/jpeg" as const, datos }))]
      // Las fotos van a la biblioteca de una vez: quien se vaya antes de terminar no las pierde.
      const [conTurno, traidas] = await Promise.all([turno(conFuentes, { tipo: "iniciar", bloques }), traerFotos(cuenta.id, fotos, lectura.imagenes)])
      console.log("[onboarding] Fotos a la biblioteca:", traidas)
      const siguiente: Analisis = { ...conTurno, fuentes: { ...conTurno.fuentes, fotosGuardadas: traidas.utiles } }
      await guardarAnalisis(siguiente)
      return NextResponse.json(siguiente)
    }

    if (accion === "responder" || accion === "ayudame" || accion === "rellenar" || accion === "rellenar_todo") {
      const respuesta = texto(body.texto, 4000)
      if (accion === "responder" && !respuesta) return NextResponse.json({ error: "Escribe algo." }, { status: 400 })
      const pedido: Accion = accion === "responder" ? { tipo: "responder", texto: respuesta } : { tipo: accion }
      const siguiente = await turno(previo, pedido)
      await guardarAnalisis(siguiente)
      return NextResponse.json(siguiente)
    }

    if (accion === "tema") {
      const tema = previo.temas[Number(body.indice)]
      if (!tema) return NextResponse.json({ error: "Ese tema no existe." }, { status: 400 })
      if (!previo.tipo || !completo(previo.datos, previo.tipo)) {
        return NextResponse.json({ error: "Todavía falta completar la marca." }, { status: 400 })
      }
      const conTema = { ...previo, tema }
      await guardarAnalisis(conTema)
      const { brief, conversacionId } = await generar(conTema, usuario.id)
      return NextResponse.json({ ...conTema, brief, conversacion_id: conversacionId })
    }

    if (accion === "saltar") {
      await supabaseAdmin().from("accounts").update({ onboarding: "omitido" }).eq("id", cuenta.id)
      return NextResponse.json(previo)
    }

    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 })
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    console.error("[onboarding]", accion, mensaje)
    return NextResponse.json({ error: mensaje }, { status: 500 })
  }
}
