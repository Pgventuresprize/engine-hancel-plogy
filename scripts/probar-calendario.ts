/**
 * Prueba la decision del calendario y el reparto, sin base ni redes: es pura, asi
 * que no publica nada ni necesita credenciales.
 *
 *   npx tsx scripts/probar-calendario.ts
 */
import assert from "node:assert/strict"

import { decidirProgramada, ESPERA_EDICION_MS, MAX_INTENTOS, sinFreno, VENTANA_MS, type PiezaProgramada } from "../src/engine/calendario/decidir"
import { claveHueco, fechaCorta, fechaLarga, horaLibre, horariosVacios, huecosDelDia, lunesDe, parseHorarios, repartir, sumarDias, sumarMeses, yaPaso, type Horarios } from "../src/engine/calendario/reparto"

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

console.log(`\n${casos.length + 1} casos de decision y las reglas de fechas, huecos y reparto correctos`)
