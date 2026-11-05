/**
 * Prueba la decision del calendario y el reparto, sin base ni redes: es pura, asi
 * que no publica nada ni necesita credenciales.
 *
 *   npx tsx scripts/probar-calendario.ts
 */
import assert from "node:assert/strict"

import { agruparEnPosts, captionDeTextos, extraerCaption, huellaDeCaption, proporcionValida, tituloDeCarpeta } from "../src/engine/chat/posts-carpeta"
import { decidirProgramada, ESPERA_EDICION_MS, MAX_INTENTOS, sinFreno, VENTANA_MS, type PiezaProgramada } from "../src/engine/calendario/decidir"
import { armarPlan, claveHueco, fechaCorta, fechaLarga, horaLibre, horariosVacios, huecosDelDia, lunesDe, parseHorarios, redondearHora, repartir, sumarDias, sumarMeses, yaPaso, type Horarios } from "../src/engine/calendario/reparto"

const AHORA = new Date("2026-11-04T17:00:00.000Z")
const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString()

const pieza = (cambios: Partial<PiezaProgramada> = {}): PiezaProgramada => ({
  id: "p",
  network: "instagram",
  status: "generated",
  carril: "general",
  revision: { frena: false },
  programada_para: hace(60_000),
  programada_intentos: 0,
  programada_revisar: false,
  contenido_cambiado_at: null,
  ...cambios,
})

const accion = (p: PiezaProgramada) => decidirProgramada(p, AHORA).accion

const casos: [string, PiezaProgramada, string][] = [
  ["a su hora", pieza(), "publicar"],
  ["justo a su hora", pieza({ programada_para: AHORA.toISOString() }), "publicar"],
  ["futura", pieza({ programada_para: hace(-60_000) }), "esperar"],
  ["sin revision (de antes del revisor)", pieza({ revision: null }), "publicar"],
  ["frenada sin aprobar", pieza({ revision: { frena: true } }), "frenada"],
  ["revision sin dato de freno", pieza({ revision: {} }), "frenada"],
  ["frenada aprobada", pieza({ status: "approved", revision: { frena: true } }), "publicar"],
  ["del chat sin aprobar", pieza({ carril: "chat" }), "frenada"],
  ["del chat aprobada", pieza({ carril: "chat", status: "approved" }), "publicar"],
  ["editada hace 1 min", pieza({ contenido_cambiado_at: hace(60_000) }), "esperar"],
  ["editada hace mas de la espera", pieza({ contenido_cambiado_at: hace(ESPERA_EDICION_MS + 1000) }), "publicar"],
  ["justo al final de la ventana", pieza({ programada_para: hace(VENTANA_MS) }), "publicar"],
  ["pasada la ventana", pieza({ programada_para: hace(VENTANA_MS + 1000) }), "vencida"],
  ["aprobada tarde, pasada la ventana", pieza({ status: "approved", programada_para: hace(VENTANA_MS + 1000) }), "vencida"],
  ["intentos agotados", pieza({ programada_intentos: MAX_INTENTOS }), "agotada"],
  ["un intento antes de agotar", pieza({ programada_intentos: MAX_INTENTOS - 1 }), "publicar"],
  ["en revisar", pieza({ programada_revisar: true }), "revisar"],
  ["en revisar gana a todo", pieza({ programada_revisar: true, status: "approved", programada_intentos: 9 }), "revisar"],
  ["frenada y editada: manda el freno", pieza({ revision: { frena: true }, contenido_cambiado_at: hace(1000) }), "frenada"],
]

for (const [nombre, p, esperado] of casos) {
  assert.equal(accion(p), esperado, nombre)
  console.log(`ok  ${nombre} -> ${esperado}`)
}
assert.equal(sinFreno({ status: "generated", carril: null, revision: null }), true, "carril vacio cuenta como general")

// ---------------------------------------------------------------------- fechas
assert.equal(lunesDe("2026-11-04"), "2026-11-02", "miercoles")
assert.equal(lunesDe("2026-11-08"), "2026-11-02", "el domingo es de esa semana")
assert.equal(lunesDe("2026-11-02"), "2026-11-02", "el lunes es su propio lunes")
assert.equal(sumarDias("2026-12-31", 1), "2027-01-01")
assert.equal(fechaCorta("2026-11-04"), "mié 4 nov")
assert.equal(fechaLarga("2026-11-04"), "miércoles 4 de noviembre")
assert.equal(sumarMeses("2026-12-15", 1), "2027-01-01")
assert.equal(sumarMeses("2026-01-31", -1), "2025-12-01")
assert.equal(yaPaso("2026-11-04", "12:00", { dia: "2026-11-04", hora: "12:00" }), true, "la hora actual cuenta como pasada")
assert.equal(yaPaso("2026-11-04", "12:05", { dia: "2026-11-04", hora: "12:00" }), false)

// ------------------------------------------------------------------- hora libre
const llenas = new Set([claveHueco("instagram", "2026-11-05", "12:00"), claveHueco("instagram", "2026-11-05", "12:05")])
assert.equal(horaLibre("2026-11-05", "12:00", "instagram", llenas), "12:10", "salta lo ocupado")
assert.equal(horaLibre("2026-11-05", "12:00", "linkedin", llenas), "12:00", "las redes no chocan entre si")
assert.equal(horaLibre("2026-11-05", "23:55", "instagram", new Set([claveHueco("instagram", "2026-11-05", "23:55")])), null, "no se pasa al dia siguiente")

// --------------------------------------------------------------------- horarios
const crudo = {
  instagram: { "4": ["12:00", "12:00", "08:00"], "9": ["10:00"], "1": ["25:00", "10:03", 7, "10:00"], "2": "nada" },
  linkedin: { "4": ["08:00"] },
  facebook: { "4": ["08:00"] },
}
const horarios: Horarios = parseHorarios(crudo)
assert.deepEqual(horarios, { instagram: { "4": ["08:00", "12:00", "12:00"], "1": ["10:00"] }, linkedin: { "4": ["08:00"] } }, "ignora lo que no entiende")
assert.deepEqual(parseHorarios(null), horariosVacios())
assert.deepEqual(parseHorarios("x"), horariosVacios())
assert.deepEqual(
  huecosDelDia("2026-11-05", horarios),
  [
    { red: "instagram", hora: "08:00" },
    { red: "linkedin", hora: "08:00" },
    { red: "instagram", hora: "12:00" },
    { red: "instagram", hora: "12:05" },
  ],
  "una hora repetida son varios huecos, de cinco en cinco"
)

// ------------------------------------------------------------------------ reparto
const ig = (id: string) => ({ id, red: "instagram" })
const li = (id: string) => ({ id, red: "linkedin" })
const ahoraLocal = { dia: "2026-11-05", hora: "09:00" }
const base = { desde: "2026-11-05", hasta: "2026-11-05", horarios, ocupadas: new Set<string>(), ahora: ahoraLocal }

let r = repartir({ ...base, piezas: [ig("a"), ig("b"), li("c")] })
assert.deepEqual(r.plan.map((x) => [x.pieza.id, x.hora]), [["a", "12:00"], ["b", "12:05"]], "lo pasado no cuenta y cada red va a sus huecos")
assert.equal(r.sobran, 1, "linkedin ya paso")

r = repartir({ ...base, ahora: { dia: "2026-11-04", hora: "20:00" }, piezas: [ig("a"), ig("b"), ig("c"), ig("d")] })
assert.equal(r.plan.length, 3)
assert.equal(r.sobran, 1, "lo que no cabe sobra")

r = repartir({ ...base, ahora: { dia: "2026-11-04", hora: "20:00" }, ocupadas: new Set([claveHueco("instagram", "2026-11-05", "12:00")]), piezas: [ig("a"), ig("b")] })
assert.deepEqual(r.plan.map((x) => x.hora), ["08:00", "12:05"], "lo ya programado no se toca")

r = repartir({ ...base, hasta: "2026-11-04", piezas: [ig("a")] })
assert.equal(r.plan.length, 0, "un rango al reves no reparte")
assert.equal(r.sobran, 1)

r = repartir({ ...base, desde: "", piezas: [ig("a")] })
assert.equal(r.plan.length, 0, "una fecha vacia no rompe")

r = repartir({ ...base, horarios: horariosVacios(), piezas: [ig("a")] })
assert.equal(r.plan.length, 0, "sin horarios no reparte")

r = repartir({ ...base, desde: "2026-11-02", hasta: "2036-11-02", ahora: { dia: "2026-11-01", hora: "00:00" }, piezas: Array.from({ length: 500 }, (_, i) => ig(String(i))) })
assert.ok(r.plan.length < 100, "un rango enorme tiene tope")

// ------------------------------------------------------------- plan de un lote
const pedido = (id: string, cambios: Partial<{ vence: string; dia: string; hora: string }> = {}) => ({ id, red: "instagram", vence: "", dia: "", hora: "", ...cambios })
const hor: Horarios = { instagram: { "4": ["10:00", "18:00", "20:00"], "5": ["10:00"] }, linkedin: {} }
const lote = { desde: "2026-11-05", hasta: "2026-11-06", horarios: hor, ocupadas: new Set<string>(), ahora: { dia: "2026-11-05", hora: "09:00" } }
assert.equal(redondearHora("14:32"), "14:35")
assert.equal(redondearHora("14:30"), "14:30")
assert.equal(redondearHora("23:58"), null)

let p = armarPlan({ ...lote, pedidos: [pedido("a"), pedido("b", { vence: "2026-11-05 19:30" })] })
assert.deepEqual(p.filas, [{ id: "b", dia: "2026-11-05", hora: "10:00" }, { id: "a", dia: "2026-11-05", hora: "18:00" }], "lo que caduca va primero")

p = armarPlan({ ...lote, pedidos: [pedido("a", { vence: "2026-11-05 09:30" })] })
assert.equal(p.filas.length, 0, "no se publica despues de que deje de servir")
assert.match(p.fuera[0].motivo, /deje de servir/)

p = armarPlan({ ...lote, pedidos: [pedido("a", { dia: "2026-11-05", hora: "14:32" }), pedido("b", { dia: "2026-11-05", hora: "14:35" })] })
assert.deepEqual(p.filas.map((f) => f.hora), ["14:35", "14:40"], "hora pedida, redondeada, y sin chocar")

p = armarPlan({ ...lote, pedidos: [pedido("a", { dia: "2026-11-05", hora: "08:00" })] })
assert.match(p.fuera[0].motivo, /ya pasó/)

p = armarPlan({ ...lote, pedidos: [pedido("a", { dia: "2026-11-05" })] })
assert.match(p.fuera[0].motivo, /falta/)

p = armarPlan({ ...lote, ocupadas: new Set([claveHueco("instagram", "2026-11-05", "10:00")]), pedidos: [pedido("a")] })
assert.equal(p.filas[0].hora, "18:00", "lo ya programado se respeta")

p = armarPlan({ ...lote, pedidos: ["a", "b", "c", "d", "e"].map((x) => pedido(x)) })
assert.equal(p.filas.length, 4)
assert.equal(p.fuera[0].id, "e", "lo que no cabe se dice")

// ------------------------------------------------------------------- carpetas
const carpeta = (rutas: string[]) => rutas.map((ruta) => ({ ruta, tamano: 1000 }))
let posts = agruparEnPosts(carpeta([
  "piezas/047-estilo/brief.md", "piezas/047-estilo/textos.md", "piezas/047-estilo/generar.py",
  "piezas/047-estilo/assets/mood-1.jpg", "piezas/047-estilo/exports/_hoja.jpg",
  "piezas/047-estilo/exports/slide-10.png", "piezas/047-estilo/exports/slide-02.png",
  "piezas/050-idea/textos.md", "piezas/050-idea/exports/slide-01.png",
  "piezas/_comun/logo.png", "piezas/vacia/notas.md",
]))
assert.deepEqual(posts.map((x) => x.nombre), ["047-estilo", "050-idea"], "cada subcarpeta con imagenes es un post")
assert.deepEqual(posts[0].imagenes, ["piezas/047-estilo/exports/slide-02.png", "piezas/047-estilo/exports/slide-10.png"], "las finales, en orden numerico, sin assets ni _hoja")
assert.deepEqual(posts[0].textos, ["piezas/047-estilo/brief.md", "piezas/047-estilo/textos.md"])

posts = agruparEnPosts(carpeta(["047-estilo/textos.md", "047-estilo/assets/a.jpg", "047-estilo/exports/slide-01.png"]))
assert.equal(posts.length, 1, "la carpeta de un post sola es un post, no dos")
assert.deepEqual(posts[0].imagenes, ["047-estilo/exports/slide-01.png"])

posts = agruparEnPosts(carpeta(["foto-2.jpg", "foto-10.jpg", "foto-1.jpg", "caption.txt"]))
assert.equal(posts.length, 1, "unas fotos sueltas son un post")
assert.deepEqual(posts[0].imagenes, ["foto-1.jpg", "foto-2.jpg", "foto-10.jpg"])

posts = agruparEnPosts(carpeta(["lote/mio/1.jpg", "lote/mio/2.jpg", "lote/tuyo/1.png"]))
assert.equal(posts.length, 2, "sin nombres conocidos tambien funciona")

posts = agruparEnPosts(carpeta(Array.from({ length: 38 }, (_, i) => `026-motion/exports/slide-${i + 1}.png`)))
assert.match(posts[0].problema ?? "", /38 láminas/, "mas de 10 no se sube")

assert.deepEqual(agruparEnPosts(carpeta(["a/notas.md"])), [], "sin imagenes no hay post")
assert.equal(tituloDeCarpeta("047-tu-estilo-en-un-parrafo"), "Tu estilo en un parrafo")

// -------------------------------------------------------------------- captions
const md = "# Textos\n\nEstado: BORRADOR.\n\n## Caption de Instagram\n\nHola mundo.\n\nSegunda línea.\n\n#Uno #Dos\n\n### Hashtags elegidos\n\n- #Uno: tema.\n\n## Post de LinkedIn\n\nOtra cosa."
assert.deepEqual(extraerCaption(md), { caption: "Hola mundo.\n\nSegunda línea.", hashtags: ["#Uno", "#Dos"] }, "la seccion exacta, tal cual")
assert.deepEqual(extraerCaption("Texto suelto del post.\n#Tag"), { caption: "Texto suelto del post.", hashtags: ["#Tag"] }, "un archivo sin secciones es el caption")
assert.equal(extraerCaption("# Brief\n\nFecha: lunes.\n\n## Fotos\n\nDe banco."), null, "sin seccion de caption no se adivina")
assert.equal(extraerCaption("x".repeat(3000)), null, "un texto largo sin secciones no es un caption")
assert.equal(captionDeTextos([{ nombre: "brief.md", contenido: "# Brief\n\nNada." }, { nombre: "textos.md", contenido: md }])?.hashtags.length, 2)
assert.equal(huellaDeCaption("Hola   MUNDO\n"), "hola mundo")
assert.equal(proporcionValida(1080, 1350), true)
assert.equal(proporcionValida(1080, 1920), false, "9:16 no entra en un carrusel")

console.log(`\n${casos.length + 1} casos de decision y las reglas de fechas, huecos y reparto correctos`)
