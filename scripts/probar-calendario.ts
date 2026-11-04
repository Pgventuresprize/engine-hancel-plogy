/**
 * Prueba la decision del calendario, sin base ni redes: es pura, asi que no
 * publica nada ni necesita credenciales.
 *
 *   npx tsx scripts/probar-calendario.ts
 */
import assert from "node:assert/strict"

import { decidirProgramada, ESPERA_EDICION_MS, MAX_INTENTOS, sinFreno, VENTANA_MS, type PiezaProgramada } from "../src/engine/calendario/decidir"

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
console.log(`\n${casos.length + 1} casos correctos`)
