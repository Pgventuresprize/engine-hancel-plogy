/**
 * Las reglas del onboarding que no pueden fallar. Sin red ni base, no gasta nada.
 *
 *   npx tsx scripts/onboarding-reglas.test.ts
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { modeloPlataforma } from "../src/engine/claude/plataforma"
import { logoEsClaro } from "../src/engine/onboarding/archivos"
import { acentoLegible, coloresDeRespaldo, paletaLegible } from "../src/engine/onboarding/brief"
import { resumirColores } from "../src/engine/onboarding/capturar"
import sharp from "sharp"

import { rellenarPlantilla, revisarPlantilla, sinRepetidos, type Hueco } from "../src/engine/marca/kit-modelo"
import { prepararFoto } from "../src/engine/onboarding/fotos"
import { logoEnSuSitio, sinCajasVacias, soloLoNecesario, type DisenoMarca, type PlantillaEscrita } from "../src/engine/onboarding/plantillas"
import { contraste, parseColores } from "../src/engine/render/theme"
import { coloresDe, direccionPrivada, textoDe } from "../src/engine/onboarding/leer"
import { completo, cumple, faltan, mezclar, parseFuentes, parsePaleta, REQUISITOS, textoSobre, type Datos } from "../src/engine/onboarding/requisitos"

const req = (id: string) => REQUISITOS.find((r) => r.id === id)!

test("un hecho propuesto por el Studio no entra", () => {
  const d = mezclar({}, { hechos: { valor: "500 clientes", origen: "studio" } }, "servicios", "")
  assert.equal(d.hechos, undefined)
})

test("el nombre si se puede proponer cuando la marca se planea desde cero", () => {
  const d = mezclar({}, { nombre: { valor: "Migaja", origen: "studio" } }, "local", "", true)
  assert.equal(d.nombre.valor, "Migaja")
})

test("un hecho con cita falsa se cae", () => {
  const d = mezclar({}, { hechos: { valor: "Fundada en 1990", origen: "fuente", cita: "desde 1990" } }, "servicios", "Somos una empresa nueva")
  assert.equal(d.hechos, undefined)
})

test("un hecho con cita real entra, sin importar tildes ni mayusculas", () => {
  const d = mezclar({}, { hechos: { valor: "Fundada en 1990", origen: "fuente", cita: "DESDE 1990 en Bogota" } }, "servicios", "Trabajamos desde 1990 en Bogotá")
  assert.equal(d.hechos.origen, "fuente")
})

test("una decision con cita falsa queda como propuesta, no como encontrada", () => {
  const d = mezclar({}, { voz: { valor: "Directa", origen: "fuente", cita: "no existe" } }, "servicios", "otra cosa")
  assert.equal(d.voz.origen, "studio")
})

test("lo que dijo la persona no lo pisa una propuesta", () => {
  const previos: Datos = { voz: { valor: "La suya", origen: "persona" } }
  const d = mezclar(previos, { voz: { valor: "Otra", origen: "studio" } }, "servicios", "")
  assert.equal(d.voz.valor, "La suya")
})

test("un dato de otro tipo de marca no entra", () => {
  const d = mezclar({}, { limites: { valor: "Familia", origen: "persona" } }, "servicios", "")
  assert.equal(d.limites, undefined)
})

test("las listas piden su minimo de lineas", () => {
  assert.equal(cumple(req("posturas"), { posturas: { valor: "Una sola", origen: "persona" } }), false)
  assert.equal(cumple(req("posturas"), { posturas: { valor: "Una\nDos", origen: "persona" } }), true)
})

test("la paleta y las fuentes exigen su formato", () => {
  assert.equal(parsePaleta("principal #112233"), null)
  const p = parsePaleta("principal #112233, acento #aabbcc, fondo_claro #ffffff, fondo_oscuro #000000, texto #111111")
  assert.equal(p?.acento, "#AABBCC")
  assert.deepEqual(parseFuentes("titulos: Space Grotesk; texto: Inter"), { titulos: "Space Grotesk", texto: "Inter" })
  assert.equal(parseFuentes("Inter"), null)
})

test("los hechos que no bloquean no impiden completar; los que bloquean si", () => {
  const datos: Datos = {}
  for (const r of REQUISITOS) {
    if (r.bloquea && (!r.tipos || r.tipos.includes("servicios"))) {
      datos[r.id] = { valor: "a\nb\nc", origen: "persona" }
    }
  }
  datos.paleta = { valor: "principal #112233, acento #aabbcc, fondo_claro #ffffff, fondo_oscuro #000000, texto #111111", origen: "studio" }
  datos.fuentes = { valor: "titulos: A; texto: B", origen: "studio" }
  assert.equal(completo(datos, "servicios"), true)
  delete datos.nombre
  assert.equal(completo(datos, "servicios"), false)
  assert.ok(faltan(datos, "servicios").some((r) => r.id === "nombre"))
})

test("la marca personal exige sus limites y una empresa no", () => {
  assert.ok(faltan({}, "persona").some((r) => r.id === "limites"))
  assert.ok(!faltan({}, "servicios").some((r) => r.id === "limites"))
})

test("la clave de plataforma nunca usa Opus ni Fable", () => {
  for (const pedido of ["claude-opus-5-5", "claude-fable-5-1", "claude-sonnet-5", "claude-sonnet-5-5"]) {
    assert.equal(modeloPlataforma(pedido), "claude-haiku-5-5")
  }
  assert.equal(modeloPlataforma("claude-haiku-4-5-20251001"), "claude-haiku-5-5")
})

test("las direcciones internas quedan bloqueadas", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "100.64.0.1"]) {
    assert.equal(direccionPrivada(ip), true, ip)
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) assert.equal(direccionPrivada(ip), false, ip)
})

test("el texto de una pagina no trae scripts ni estilos", () => {
  const t = textoDe("<style>a{}</style><script>x()</script><h1>Hola</h1><p>Mundo &amp; más</p>")
  assert.equal(t, "Hola\nMundo & más")
})

test("los colores salen sin grises y por frecuencia", () => {
  assert.deepEqual(coloresDe("#111111 #ff0000 #ff0000 #00ff00"), ["#FF0000", "#00FF00"])
})

test("el texto sobre un color se lee", () => {
  assert.equal(textoSobre("#FFFFFF"), "#141414")
  assert.equal(textoSobre("#000000"), "#FFFFFF")
})

test("los detalles del plan B se leen sobre el papel, y siguen siendo el color de la marca", () => {
  const paleta = { principal: "#C2562E", acento: "#5C8A4D", fondo_claro: "#FBF6EE", fondo_oscuro: "#2B2420", texto: "#2B2420" }
  const colores = parseColores(coloresDeRespaldo(paleta))
  assert.ok(colores, "el motor tiene que aceptar los colores")
  assert.ok(contraste(colores.acentoTexto, colores.papel) >= 4.5)
  assert.equal(colores.acento, "#C2562E")
  const claro = { ...paleta, principal: "#F4D35E" }
  assert.ok(contraste(acentoLegible(claro), claro.fondo_claro) >= 4.5)
})

test("los colores medidos se juntan por area y lo transparente no cuenta", () => {
  const r = resumirColores([
    { css: "rgba(0, 0, 0, 0)", peso: 900, de: "fondo" },
    { css: "rgb(255, 255, 255)", peso: 60, de: "fondo" },
    { css: "rgba(255, 255, 255, 1)", peso: 20, de: "fondo" },
    { css: "rgb(13, 23, 56)", peso: 20, de: "texto" },
  ])
  assert.deepEqual(r.map((c) => c.hex), ["#FFFFFF", "#0D1738"])
  assert.equal(r[0].peso, 80)
})

test("con la clave de plataforma: Sonnet para la marca, Haiku para cada post y nunca Opus", () => {
  assert.equal(modeloPlataforma("claude-opus-5-5", "instagram"), "claude-haiku-5-5")
  assert.equal(modeloPlataforma("claude-sonnet-5-5", "revisor"), "claude-haiku-5-5")
  assert.equal(modeloPlataforma("claude-opus-5-5", "onboarding-brief"), "claude-sonnet-5-5")
  assert.equal(modeloPlataforma("claude-haiku-5-5", "onboarding-archivos"), "claude-haiku-5-5")
})

test("un color de texto que no se lee se cambia por uno que si", () => {
  const p = { principal: "#8B6B4E", acento: "#BCAEA7", fondo_claro: "#FFFFFF", fondo_oscuro: "#3A2D22", texto: "#BCAEA7" }
  assert.equal(paletaLegible(p).texto, "#3A2D22")
  assert.equal(paletaLegible({ ...p, texto: "#222222" }).texto, "#222222")
})

test("una marca de plantilla que no existe no pasa: acabaria impresa en la lamina", () => {
  const html = "<section data-lamina>{{~foto}}{{/foto}}</section>"
  assert.ok(revisarPlantilla(html, [], { papeles: [], parciales: [] }).some((e) => e.includes("no se entiende")))
})

test("un cierre solo exige su titulo: lo demas no puede dejar la pieza sin plantilla", () => {
  const hueco = (nombre: string) => ({ nombre, tipo: "texto", max: 80, obligatorio: true }) as Hueco
  const r = soloLoNecesario("cierre", ["titulo", "cta", "motivo"].map(hueco))
  assert.deepEqual(r.filter((h) => h.obligatorio).map((h) => h.nombre), ["titulo"])
})

const ruido = (ancho: number, alto: number, canales: 3 | 4 = 3) => {
  const datos = Buffer.alloc(ancho * alto * canales)
  for (let i = 0; i < datos.length; i++) datos[i] = canales === 4 && i % 4 === 3 ? (i % 7 ? 255 : 0) : Math.floor(Math.random() * 256)
  return sharp(datos, { raw: { width: ancho, height: alto, channels: canales } }).png().toBuffer()
}

test("una foto entra a la biblioteca reducida y con su miniatura", async () => {
  const p = await prepararFoto(await ruido(2400, 1800))
  assert.ok(p)
  assert.equal(Math.max(p.ancho, p.alto), 1600)
  assert.match(p.huella, /^[0-9a-f]{64}$/)
})

test("lo que no es una foto se queda fuera: pequeña, franja, recorte o grafico plano", async () => {
  assert.equal(await prepararFoto(await ruido(300, 300)), null)
  assert.equal(await prepararFoto(await ruido(2000, 500)), null)
  assert.equal(await prepararFoto(await ruido(1000, 1000, 4)), null)
  const plano = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#C2562E" } }).png().toBuffer()
  assert.equal(await prepararFoto(plano), null)
})

test("una plantilla puede decir que va con foto y que va sin ella", () => {
  const html = "<section data-lamina>{{?foto}}<img src='{{a:foto}}'>{{/foto}}{{^foto}}<b>plano</b>{{/foto}}</section>"
  assert.deepEqual(revisarPlantilla(html, [], { papeles: [], parciales: [] }), [])
  const datos = { textos: {}, listas: {}, n: 1, total: 1 }
  assert.ok(rellenarPlantilla(html, { ...datos, foto: "data:x" }, {}, {}).includes("<img"))
  assert.ok(!rellenarPlantilla(html, { ...datos, foto: "data:x" }, {}, {}).includes("plano"))
  assert.ok(rellenarPlantilla(html, { ...datos, foto: null }, {}, {}).includes("plano"))
})

const texto = (nombre: string, obligatorio = false): Hueco => ({ nombre, tipo: "texto", max: 200, obligatorio }) as Hueco

test("el cierre no repite lo que ya dicen el titulo o el boton", () => {
  const textos = { titulo: "Cuéntanos: COMENTA tu plato de siempre y con quién lo compartiste.", motivo: "Comenta tu plato de siempre y con quien lo compartiste", cta: "Comenta" }
  const salen = sinRepetidos(textos, [texto("titulo", true), texto("motivo"), texto("cta")])
  assert.deepEqual(Object.keys(salen).sort(), ["cta", "titulo"])
})

test("un texto distinto y uno obligatorio se quedan aunque se parezcan", () => {
  const textos = { titulo: "Cada carrusel cuenta", motivo: "Lo hacemos por los clientes", etiqueta: "Cada carrusel" }
  const salen = sinRepetidos(textos, [texto("titulo", true), texto("motivo"), texto("etiqueta", true)])
  assert.deepEqual(salen, textos)
})

const IMG = "<img src='{{a:logo}}' data-zona='logo'>"
const plantilla = (fondo: PlantillaEscrita["fondo"], html: string) => ({ tipo: "idea", fondo, html }) as PlantillaEscrita
const diseno = (plantillas: PlantillaEscrita[], marco = "") => ({ css: "", notas: "", parciales: { marco }, plantillas }) as DisenoMarca

test("el logo nunca queda encima de una foto", () => {
  const d = logoEnSuSitio(diseno([plantilla("claro", `{{?foto}}<img src='{{a:foto}}'>${IMG}{{/foto}}${IMG}`)], `<div>${IMG}</div>`))
  const lamina = (foto?: string) => rellenarPlantilla(d.plantillas[0].html + "{{p:marco}}", { textos: {}, listas: {}, n: 1, total: 1, foto }, { logo: "logo.svg" }, d.parciales)
  assert.equal(lamina("foto.jpg").includes("logo.svg"), false)
  assert.equal(lamina().match(/logo\.svg/g)?.length, 2)
})

test("una lamina oscura saca el logo tambien del marco, sin perder el contador", () => {
  const d = logoEnSuSitio(diseno([plantilla("oscuro", `${IMG}{{p:marco}}`)], `<div>${IMG}{{s:n}}</div>`))
  const html = rellenarPlantilla(d.plantillas[0].html, { textos: {}, listas: {}, n: 3, total: 5 }, { logo: "logo.svg" }, d.parciales)
  assert.equal(html, "<div>3</div>")
})

test("el logo que ya va dentro de {{^foto}} no se toca", () => {
  const html = `{{^foto}}${IMG}{{/foto}}`
  assert.equal(logoEnSuSitio(diseno([plantilla("claro", html)])).plantillas[0].html, html)
})

const logoSvg = (color: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect x="20" y="20" width="160" height="40" fill="${color}"/></svg>`)

test("un logo blanco se reconoce; uno oscuro o sin transparencia no", async () => {
  assert.equal(await logoEsClaro(logoSvg("#FFFFFF")), true)
  assert.equal(await logoEsClaro(logoSvg("#2B1A4A")), false)
  const opaco = await sharp({ create: { width: 200, height: 80, channels: 3, background: "#FFFFFF" } }).png().toBuffer()
  assert.equal(await logoEsClaro(opaco), false)
})

test("un boton sin texto no se dibuja; el titulo obligatorio y lo ya condicionado no se tocan", () => {
  const huecos = [texto("titulo", true), texto("cta")]
  const html = sinCajasVacias("<h1>{{t:titulo}}</h1><a class='boton'>{{t:cta}}</a>", huecos)
  assert.equal(rellenarPlantilla(html, { textos: { titulo: "Hola" }, listas: {}, n: 1, total: 1 }, {}, {}), "<h1>Hola</h1>")
  assert.equal(rellenarPlantilla(html, { textos: { titulo: "Hola", cta: "Ven" }, listas: {}, n: 1, total: 1 }, {}, {}), "<h1>Hola</h1><a class='boton'>Ven</a>")
  const ya = "{{?cta}}<a>{{t:cta}}</a>{{/cta}}"
  assert.equal(sinCajasVacias(ya, huecos), ya)
})

test("las condiciones anidadas se resuelven y ninguna marca llega a la lamina", () => {
  const html = "{{?foto}}<img src='{{a:foto}}'>{{?etiqueta}}<i>{{t:etiqueta}}</i>{{/etiqueta}}{{/foto}}{{^foto}}{{?etiqueta}}<b>{{t:etiqueta}}</b>{{/etiqueta}}{{/foto}}{{/suelta}}"
  const datos = { textos: { etiqueta: "Hola" }, listas: {}, n: 1, total: 1 }
  assert.equal(rellenarPlantilla(html, { ...datos, foto: "f.jpg" }, {}, {}), "<img src='f.jpg'><i>Hola</i>")
  assert.equal(rellenarPlantilla(html, datos, {}, {}), "<b>Hola</b>")
  assert.equal(rellenarPlantilla(html, { ...datos, textos: {} }, {}, {}), "")
})

test("una imagen plana no pasa si viene de la web, pero si la subio la persona", async () => {
  const plana = await sharp({ create: { width: 1000, height: 800, channels: 3, background: "#D9C7B0" } }).png().toBuffer()
  assert.equal(await prepararFoto(plana), null)
  assert.ok(await prepararFoto(plana, true))
})
