import { llamarClaude, parsearJSONDeClaude, type Bloque } from "../claude/messages"
import type { Figura } from "../marca/figuras"
import { armarLamina, medidasDe, type KitCargado } from "../marca/kit"
import { FONDOS, revisarPlantilla, type Fondo, type Plantilla } from "../marca/kit-modelo"
import { GRAVES, plantillaDe, type VarianteLamina } from "./kit-carrusel"
import { MODELO_DISENO, reducida, tira } from "./kit-libre"
import { dibujarLaminas, type LaminaDibujada } from "./navegador"

/**
 * Diseñar una lamina a pedido desde el chat, cuando ninguna plantilla del kit da
 * lo que se pidio: una foto detras del texto, otra composicion, otro fondo.
 *
 * No es diseño libre: el resultado es una VARIANTE de la plantilla de esa lamina,
 * su mismo HTML con sus marcas {{t:...}}, adaptado al pedido. Lo que manda es la
 * plantilla y el carrusel que se esta haciendo, que el diseñador ve dibujado. Asi
 * el texto sigue en sus huecos: no se puede perder ni reescribir, la lamina se
 * sigue cambiando y marcando igual, y se redibuja sin volver a llamar a Claude.
 *
 * Lo que no se negocia lo comprueba el codigo (revisarPlantilla y el dibujo: nada
 * prohibido, todos los huecos, nada fuera ni encima, la letra minima), y un
 * critico mira la lamina dentro del carrusel.
 */

/** Rondas de correccion despues del primer diseño. */
const MAX_RONDAS = 2
/** A partir de este puntaje del critico no se corrige mas. */
const PUNTAJE_BUENO = 8
/** Lo que el diseño puede escribir por su cuenta: rotulos, no contenido. */
const PALABRAS_PROPIAS = 8
/** Lo que tarda como mucho una llamada de diseño. */
const PLAZO_DISENO_MS = 150_000
/** Sin esto por delante no se empieza otra correccion: tiene que caber dibujar. */
const MARGEN_CORREGIR_MS = 100_000
const MARGEN_CRITICO_MS = 45_000

const SISTEMA_LAMINA = `Eres quien diseña los carruseles de Instagram de la marca. Un carrusel ya está hecho y te piden cambiar el diseño de una lámina. No diseñas una lámina nueva: haces una VARIANTE de la plantilla con la que está hecha esa lámina, para que siga pareciendo del mismo carrusel.

LO QUE MANDA, EN ESTE ORDEN
1. El pedido de la persona: se cumple de verdad. Si pide una foto de fondo, la foto se ve y ocupa la lámina; no la escondas detrás de un velo opaco.
2. La plantilla de la lámina: parte de su HTML y conserva lo que la hace reconocible (su estructura, su tipografía, sus tamaños, su alineación, sus márgenes, su marco).
3. El carrusel: la lámina va entre las otras. Mira cómo se ven: mismos colores, misma jerarquía, mismo oficio. Tiene que parecer hecha a la vez que las demás.

EL TEXTO
- Conserva TODOS los huecos de la plantilla, con sus marcas tal cual: {{t:nombre}}, {{?nombre}}...{{/nombre}}, {{#lista}}...{{/lista}}, {{f:nombre}}, y sus atributos data-hueco, data-encoger y data-min. El texto lo pone el sistema.
- No escribas contenido. Como mucho un rótulo corto de diseño, sin cifras.

LA FOTO
- Si hay foto para esta lámina va con la marca {{a:foto}}, en src="" o en url().
- Que el texto se lea: un velo o degradado solo donde hace falta, el texto en el color que contraste con lo que tiene detrás. Sigue las notas de fotos del sistema de la marca.

REGLAS TÉCNICAS
- Responde solo con la plantilla nueva: un <style> con el CSS que añades o cambias, y una <section> de 1080x1350 px con su class, data-lamina y data-seguro="x1,y1,x2,y2", el área donde va todo el texto.
- En la <section> pon data-fondo con el fondo que queda: claro, oscuro, acento o foto. Si cambia, usa el marco que le toca a ese fondo.
- Usa nombres de clase propios, con el prefijo "var-", para lo que añadas: el CSS común del kit ya está cargado y no lo repitas.
- Puedes usar {{a:papel}} para los logos del kit, {{p:nombre}} para los trozos comunes y {{s:n2}}, {{s:total2}}, {{s:puntos}} para la paginación. El contador y los puntos llevan data-paginacion.
- Nada más se carga: ni enlaces, ni @import, ni @font-face, ni url(http...), ni scripts, ni eventos.
- Ningún texto se sale del área segura ni se monta sobre otro. El texto y el logo van por delante de la foto.
- Sin explicaciones ni texto alrededor.`

const SISTEMA_CRITICO = `Eres director de arte de la marca. Miras una lámina recién rediseñada dentro de su carrusel y dices, con ojo de diseñador, si cumple lo que se pidió, si todo se lee y si parece del mismo carrusel. No opinas del contenido. Respondes solo con JSON.`

export type EncargoLamina = {
  accountId: string
  kc: KitCargado
  /** La plantilla de la que se parte. */
  plantilla: Plantilla
  n: number
  total: number
  textos: Record<string, string>
  listas: Record<string, string[]>
  figura: Figura | null
  /** La foto de la lamina como data URI, si lleva. */
  foto: string | null
  /** Las laminas del carrusel tal como estan ahora, en orden. */
  imagenes: Buffer[]
  pedido: string
  /** Hasta cuando se puede trabajar (hora en ms). */
  hasta: number
}

export type ResultadoLamina = { ok: true; variante: VarianteLamina } | { ok: false; motivo: string }

type Medida = { fallos: string[]; dibujada: LaminaDibujada | null }

/** Lo que el diseño escribio por su cuenta: lo que se lee en el HTML sin las marcas. */
export function textoPropio(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Lo que pide cada hueco y lo que dice ahora. */
function huecosDe(e: EncargoLamina): string {
  return e.plantilla.huecos
    .map((h) => {
      const valor = h.tipo === "lista" ? JSON.stringify(e.listas[h.nombre] ?? []) : h.tipo === "figura" ? (e.figura ? `(figura ${e.figura.tipo})` : "(vacío)") : JSON.stringify(e.textos[h.nombre] ?? "")
      return `- ${h.nombre} (${h.tipo}, máx. ${h.max}${h.obligatorio ? ", obligatorio" : ""}): ${valor}`
    })
    .join("\n")
}

function encargoDe(e: EncargoLamina): string {
  const { kc, plantilla: p } = e
  const logos = kc.archivos.filter((a) => a.tipo === "logo").map((a) => a.papel)
  const marcos = Object.entries(kc.kit.parciales).filter(([k]) => !k.startsWith("figura_"))
  return `EL SISTEMA DE LA MARCA
${JSON.stringify(kc.kit.sistema)}
Logos: ${logos.map((l) => `{{a:${l}}}`).join(", ") || "(ninguno)"}.

CSS COMÚN DEL KIT (ya está cargado; usa sus variables y sus clases)
${kc.kit.css}

TROZOS COMUNES
${marcos.map(([k, v]) => `{{p:${k}}}: ${v}`).join("\n") || "(ninguno)"}

LA PLANTILLA DE LA LÁMINA ${e.n} DE ${e.total}: "${p.nombre}" (${p.tipo}, fondo ${p.fondo})
${p.html}

SUS HUECOS Y LO QUE DICE ESTA LÁMINA
${huecosDe(e)}

${e.foto ? "Esta lámina lleva foto: la de la imagen de arriba, con la marca {{a:foto}}." : "Esta lámina no lleva foto."}

EL PEDIDO
${e.pedido}`
}

const dataUriABuffer = (uri: string) => Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64")

async function bloquesDe(e: EncargoLamina): Promise<Bloque[]> {
  const bloques: Bloque[] = []
  if (e.imagenes.length) {
    bloques.push(
      { tipo: "texto", texto: `El carrusel como va, láminas en orden (de izquierda a derecha y de arriba abajo). La que cambias es la ${e.n}:` },
      { tipo: "imagen", mime: "image/jpeg", datos: await tira(e.imagenes.map((png) => ({ png }))) }
    )
    const actual = e.imagenes[e.n - 1]
    if (actual) bloques.push({ tipo: "texto", texto: `La lámina ${e.n} ahora:` }, { tipo: "imagen", mime: "image/jpeg", datos: await reducida(actual, 720) })
  }
  if (e.foto) bloques.push({ tipo: "texto", texto: "La foto de esta lámina:" }, { tipo: "imagen", mime: "image/jpeg", datos: await reducida(dataUriABuffer(e.foto), 720) })
  return bloques
}

/** Saca la plantilla de lo que devolvio el diseñador. */
export function leerVariante(texto: string): { html: string; fondo: Fondo | null } {
  const html = texto
    .replace(/^[\s\S]*?(?=<style|<section)/i, "")
    .replace(/```[\s\S]*$/, "")
    .trim()
  const fondo = /<section\b[^>]*\bdata-fondo\s*=\s*["']?(\w+)/i.exec(html)?.[1] as Fondo | undefined
  return { html, fondo: fondo && FONDOS.includes(fondo) ? fondo : null }
}

async function pedir(e: EncargoLamina, prompt: string, bloques: Bloque[]): Promise<string> {
  const queda = e.hasta - Date.now()
  const r = await llamarClaude({
    paso: "diseno-lamina",
    accountId: e.accountId,
    model: MODELO_DISENO,
    esfuerzo: "low",
    system: SISTEMA_LAMINA,
    prompt,
    bloques,
    maxTokens: 16_000,
    timeoutMs: Math.max(30_000, Math.min(PLAZO_DISENO_MS, queda - 30_000)),
  })
  if (!r.ok) throw new Error(`El diseñador no respondió: ${r.error}`)
  return r.texto
}

/** Comprueba la variante y, si esta bien formada, la dibuja y mide lo que no se negocia. */
async function medir(e: EncargoLamina, html: string, fondo: Fondo): Promise<Medida> {
  const { kc, plantilla } = e
  const fallos = revisarPlantilla(html, plantilla.huecos, {
    papeles: kc.archivos.map((a) => a.papel),
    parciales: Object.keys(kc.kit.parciales),
  })
  if (e.foto && !html.includes("{{a:foto}}")) fallos.push("Esta lámina lleva foto y el diseño no usa {{a:foto}}.")
  const propio = textoPropio(html)
  if (/\d/.test(propio)) fallos.push(`El diseño escribe cifras por su cuenta ("${propio.slice(0, 80)}"). Los datos van en los huecos.`)
  if (propio.split(" ").filter(Boolean).length > PALABRAS_PROPIAS) fallos.push(`El diseño escribe demasiado texto por su cuenta ("${propio.slice(0, 80)}"). El texto va en los huecos.`)
  if (fallos.length) return { fallos, dibujada: null }

  const pagina = await armarLamina(
    kc,
    plantillaDe(plantilla, { html, fondo }),
    { textos: e.textos, listas: e.listas, n: e.n, total: e.total, foto: e.foto, figura: e.figura }
  )
  const [dibujada] = await dibujarLaminas([pagina], medidasDe(plantilla))
  return {
    fallos: dibujada.problemas
      .filter((p) => GRAVES.has(p.tipo))
      .map((p) => `${p.hueco}: ${p.tipo === "choca" ? `choca ${p.detalle}` : p.tipo === "se_sale" ? `se sale del área segura (${p.detalle})` : p.tipo === "letra_pequena" ? `letra pequeña (${p.detalle})` : "no entra en su caja"}`),
    dibujada,
  }
}

/** Mira la lamina nueva dentro del carrusel. Sin respuesta, no frena nada. */
async function criticar(e: EncargoLamina, dibujada: LaminaDibujada): Promise<{ puntaje: number; cambios: string[] } | null> {
  const carrusel = e.imagenes.length ? e.imagenes.map((png, i) => ({ png: i === e.n - 1 ? dibujada.png : png })) : [{ png: dibujada.png }]
  const r = await llamarClaude({
    paso: "diseno-lamina-critico",
    accountId: e.accountId,
    model: MODELO_DISENO,
    esfuerzo: "low",
    system: SISTEMA_CRITICO,
    prompt: `Lo que se pidió para la lámina ${e.n}: ${e.pedido}

Mírala dentro del carrusel. ¿Cumple de verdad el pedido? ¿Se lee todo el texto sin esfuerzo, también sobre la foto? ¿Parece hecha a la vez que las demás? Puntúa de 0 a 10 y di solo los cambios de diseño que más la acercarían, concretos, como mucho tres.

Responde con este JSON:
{"puntaje": <0-10>, "cambios": ["<qué cambiar>"]}`,
    bloques: [
      { tipo: "texto", texto: `El carrusel, con la lámina ${e.n} nueva:` },
      { tipo: "imagen", mime: "image/jpeg", datos: await tira(carrusel) },
      { tipo: "texto", texto: `La lámina ${e.n} sola:` },
      { tipo: "imagen", mime: "image/jpeg", datos: await reducida(dibujada.png, 720) },
    ],
    maxTokens: 4000,
    timeoutMs: 60_000,
  })
  if (!r.ok) return null
  try {
    const d = parsearJSONDeClaude(r.texto) as { puntaje?: number; cambios?: unknown[] }
    return {
      puntaje: Math.max(0, Math.min(10, Number(d.puntaje) || 0)),
      cambios: (d.cambios ?? []).filter((c): c is string => typeof c === "string" && Boolean(c.trim())).slice(0, 3),
    }
  } catch {
    return null
  }
}

/**
 * La variante de la plantilla que cumple el pedido. Devuelve la ultima que paso
 * lo que no se negocia, o por que no salio ninguna; un fallo de la llamada a
 * Claude lanza, para que quien llama decida si reintenta.
 */
export async function disenarLamina(e: EncargoLamina): Promise<ResultadoLamina> {
  const encargo = encargoDe(e)
  const bloques = await bloquesDe(e)

  let actual = leerVariante(await pedir(e, encargo, bloques))
  let fondo = actual.fondo ?? e.plantilla.fondo
  let medida = await medir(e, actual.html, fondo)
  let mejor = medida.fallos.length ? null : { html: actual.html, fondo }

  for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
    const critica = !medida.fallos.length && medida.dibujada && e.hasta - Date.now() > MARGEN_CRITICO_MS ? await criticar(e, medida.dibujada) : null
    if (critica && critica.puntaje >= PUNTAJE_BUENO && !critica.cambios.length) break
    const pendientes = [...medida.fallos, ...(critica?.cambios ?? []).map((c) => `crítico: ${c}`)]
    if (!pendientes.length || e.hasta - Date.now() < MARGEN_CORREGIR_MS) break

    const prompt = `${encargo}

TU VARIANTE ACTUAL
${actual.html}

${medida.dibujada ? "Así se ve (la última imagen). " : ""}Esto es lo que hay que cambiar:
${pendientes.map((p) => `- ${p}`).join("\n")}

Corrígelo sin romper lo que ya funciona y devuelve la plantilla entera.`
    const conDibujo: Bloque[] = medida.dibujada
      ? [...bloques, { tipo: "texto", texto: "Tu variante dibujada:" }, { tipo: "imagen", mime: "image/jpeg", datos: await reducida(medida.dibujada.png, 720) }]
      : bloques
    actual = leerVariante(await pedir(e, prompt, conDibujo))
    fondo = actual.fondo ?? fondo
    medida = await medir(e, actual.html, fondo)
    if (!medida.fallos.length) mejor = { html: actual.html, fondo }
  }

  if (!mejor) return { ok: false, motivo: `no pasó las comprobaciones: ${medida.fallos.join("; ").slice(0, 400)}` }
  return { ok: true, variante: { ...mejor, conFoto: Boolean(e.foto), pedido: e.pedido } }
}
