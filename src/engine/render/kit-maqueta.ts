import { llamarClaude, parsearJSONDeClaude } from "../claude/messages"
import type { KitCargado } from "../marca/kit"
import type { Plantilla } from "../marca/kit-modelo"
import type { PlanLamina } from "./carousel"
import { laminasDeGuionClasico, type LaminaKit } from "./kit-reparto"
import type { Slide } from "./templates"

/**
 * El maquetador: pasa el guion ya escrito a las plantillas del kit de la marca.
 *
 * Quien escribe el carrusel no sabe nada del kit, y asi su prompt (la receta,
 * el criterio de la marca) no cambia de una marca a otra. Despues, Claude mira
 * el guion y el catalogo de plantillas y decide, lamina por lamina, cual la
 * enseña mejor y que va en cada hueco: la cifra al numero, los pasos a la
 * lista, la palabra del CTA a su hueco.
 *
 * No escribe nada nuevo. El codigo lo comprueba: una lamina que trae una cifra
 * o palabras que no estaban en el guion se descarta y sale por el reparto
 * automatico, que solo usa el titulo y el cuerpo tal cual.
 */

export const MODELO_MAQUETA = "claude-opus-5-5"
/**
 * Pensando a su manera tardaba de 2 a 4 minutos por carrusel (y alguna vez se
 * quedaba sin presupuesto para responder); el carrusel se dibuja dentro de una
 * pasada de 300 s. Repartir texto ya escrito no pide deliberar largo.
 */
export const ESFUERZO_MAQUETA = "low"

type Guion = {
  slides: Slide[]
  antetitulo: string
  cierre: { titulo: string; texto: string; tipo: string | null } | null
  plan: PlanLamina[]
}

const SISTEMA_MAQUETA = `Eres el director de arte de la marca. Recibes un carrusel de Instagram ya escrito y el catálogo de plantillas del kit de diseño de la marca. Para cada lámina eliges la plantilla que mejor la enseña y repartes su texto en los huecos de esa plantilla.

NO ESCRIBES NADA NUEVO. El texto ya está aprobado: el criterio y los datos son de quien lo escribió.
- Cada hueco se llena con palabras de ESA lámina del guion. Puedes copiarlas, partir una frase entre dos huecos (la cifra en "numero" y lo que mide en "etiqueta"), quitar un conector o una muletilla para que quepa en el máximo, y poner en mayúsculas la palabra que el CTA pide comentar.
- Nunca agregas datos, cifras, nombres, fechas ni afirmaciones, ni cambias el sentido de una frase. Si una plantilla tiene un hueco obligatorio que la lámina no puede llenar con sus propias palabras, esa plantilla no es para esa lámina.
- Tampoco quitas información: cada cifra, nombre, fuente, condición y matiz de la lámina tiene que quedar en algún hueco. Si no cabe, elige una plantilla con más sitio; el criterio de la marca vive en esos matices.
- El antetítulo de la pieza puede ir en el hueco de antetítulo de la portada.

CÓMO ELEGIR
- Una lámina del guion es una lámina del carrusel, en el mismo orden. La 1 va en una portada. El cierre va en una plantilla de cierre hecha para su tipo de CTA.
- Si quien escribió pidió un tipo para la lámina, úsalo salvo que su texto no quepa en ninguna plantilla de ese tipo.
- Elige por lo que la lámina es: una cifra protagonista es un dato; pasos o puntos del mismo nivel, una lista; dos lados (antes y después, error y acierto), una comparación; lo que dijo alguien, una cita; la postura de la marca en una frase, una tesis. Lo demás, una idea.
- Varía: no repitas la misma plantilla en láminas seguidas si otra sirve igual, y sigue el ritmo de fondos del kit cuando puedas.
- Respeta el máximo de caracteres de cada hueco. Si no cabe ni quitando muletillas, elige otra plantilla con más sitio.
- Una plantilla con foto obligatoria solo para una lámina que se preste a una foto.
- Una lámina que trae figura va en una plantilla con hueco de figura: de su tipo si hay, si no de otro tipo del medio. La figura la pone el sistema tal cual: no la copies en los huecos de texto ni llenes el hueco de figura.
- En los huecos que admiten resaltado, marca con *asteriscos* de 1 a 4 palabras que ya están y llevan el peso de la frase (el kit las pinta de su color de acento). No en todos los huecos.

RESPONDE SOLO con este JSON, sin texto alrededor:
{"laminas":[{"lamina":1,"plantilla":"<clave>","huecos":{"<nombre>":"<texto>","<lista>":["<punto>"]}},{"lamina":"cierre","plantilla":"<clave>","huecos":{}}]}`

/** El catalogo del kit como lo lee el maquetador, con una clave corta por plantilla. */
function catalogo(plantillas: Plantilla[]): { texto: string; porClave: Map<string, Plantilla> } {
  const porClave = new Map<string, Plantilla>()
  const texto = plantillas
    .map((p, i) => {
      const clave = `p${i + 1}`
      porClave.set(clave, p)
      const huecos = p.huecos
        .map((h) => {
          if (h.tipo === "figura")
            return `    - ${h.nombre} (hueco de figura${h.obligatorio ? ", obligatorio: solo para láminas con figura" : ""}): lo llena el sistema con la figura de la lámina`
          const forma =
            h.tipo === "lista"
              ? `lista de ${h.min_items ?? 1} a ${h.max_items ?? 5}, cada punto hasta ${h.max} caracteres`
              : `hasta ${h.max} caracteres`
          return `    - ${h.nombre} (${forma}${h.obligatorio ? ", obligatorio" : ""}${h.resaltado ? ", admite *resaltado*" : ""}): ${h.descripcion}`
        })
        .join("\n")
      const foto = p.foto.usa === "no" ? "sin foto" : `foto ${p.foto.usa}`
      const cta = p.tipo === "cierre" && p.cta_tipos.length ? ` · CTA: ${p.cta_tipos.join(", ")}` : ""
      return `[${clave}] ${p.tipo} · ${p.nombre} · fondo ${p.fondo} · ${foto}${cta}\n  cuándo: ${p.cuando_usar || "(sin indicar)"}\n${huecos}`
    })
    .join("\n\n")
  return { texto, porClave }
}

function guionComoTexto(g: Guion, slides: Slide[]): string {
  const lineas = slides.map((s, i) => {
    const plan = g.plan.find((p) => p.n === i + 1)
    const cabeza = `LÁMINA ${i + 1}${i === 0 ? " (portada)" : ""}${s.tipoLamina && i > 0 ? ` · tipo que pidió quien la escribió: ${s.tipoLamina}` : ""}${plan?.funcion ? ` · función: ${plan.funcion}` : ""}`
    if (s.type === "photo_hook") return `${cabeza}\n  gancho: ${s.hook ?? ""}`
    return [
      cabeza,
      s.lead ? `  rótulo: ${s.lead}` : "",
      s.title ? `  título: ${s.title}` : "",
      s.body ? `  cuerpo: ${s.body}` : "",
      s.items?.length ? `  puntos:\n${s.items.map((t) => `    - ${t}`).join("\n")}` : "",
      s.figura ? `  figura: ${s.figura.tipo} con ${s.figura.items.length} elementos (la pone el sistema)` : "",
    ]
      .filter(Boolean)
      .join("\n")
  })
  if (g.cierre)
    lineas.push(
      `CIERRE (CTA: ${g.cierre.tipo ?? "sin tipo"})\n  título: ${g.cierre.titulo}\n  cuerpo: ${g.cierre.texto}`
    )
  return `ANTETÍTULO DE LA PIEZA: ${g.antetitulo || "(ninguno)"}\n\n${lineas.join("\n\n")}`
}

/** Palabras (3 letras o mas, sin tildes) y cifras de un texto, para comparar. */
function fichas(texto: string): { palabras: Set<string>; cifras: Set<string> } {
  const plano = texto
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
  return {
    palabras: new Set(plano.match(/[a-zñ]{3,}/g) ?? []),
    cifras: new Set((plano.match(/\d+(?:[.,]\d+)*/g) ?? []).map((c) => c.replace(/[.,]/g, ""))),
  }
}

/**
 * Lo que la maqueta agrego al guion: cifras y palabras que no estaban. Una
 * palabra suelta se tolera (un "de" largo, un plural); una cifra, nunca.
 */
export function agregado(fuente: string, puesto: string): { cifras: string[]; palabras: string[] } {
  const f = fichas(fuente)
  const p = fichas(puesto)
  return {
    cifras: [...p.cifras].filter((c) => !f.cifras.has(c)),
    palabras: [...p.palabras].filter((w) => !f.palabras.has(w)),
  }
}

/** Lo que la maqueta quito del guion: cifras y la parte de las palabras con contenido (4 letras o mas). */
export function quitado(fuente: string, puesto: string): { cifras: string[]; parteDePalabras: number } {
  const f = fichas(fuente)
  const p = fichas(puesto)
  const llenas = [...f.palabras].filter((w) => w.length >= 4)
  return {
    cifras: [...f.cifras].filter((c) => !p.cifras.has(c)),
    parteDePalabras: llenas.length ? llenas.filter((w) => !p.palabras.has(w)).length / llenas.length : 0,
  }
}

/**
 * Lo que se tolera: ninguna cifra nueva ni perdida, una palabra nueva, y quitar
 * hasta un cuarto de las palabras (conectores, muletillas, una frase partida que
 * se dice mas corta). Mas que eso ya es otra lamina. En el cierre, hasta el 40 %:
 * es la llamada a la accion, sin datos ni criterio, y las plantillas de cierre
 * reparten poco texto en muchos huecos (la accion, la palabra, la respuesta).
 */
const fiel = ({ propio, permitido }: { propio: string; permitido: string }, puesto: string, quitar = 0.25) => {
  const a = agregado(permitido, puesto)
  const q = quitado(propio, puesto)
  return a.cifras.length === 0 && a.palabras.length <= 1 && q.cifras.length === 0 && q.parteDePalabras <= quitar
}
const QUITAR_EN_CIERRE = 0.4

/**
 * El texto de una lamina del guion: `propio` es lo que tiene que quedar y
 * `permitido`, de donde puede salir lo que va en sus huecos (en la portada,
 * ademas, el antetitulo de la pieza, que puede ir o no).
 */
function fuenteDe(g: Guion, slides: Slide[], i: number): { propio: string; permitido: string } {
  if (i === slides.length) {
    const cierre = g.cierre ? `${g.cierre.titulo} ${g.cierre.texto}` : ""
    return { propio: cierre, permitido: cierre }
  }
  const s = slides[i]
  const propio =
    s.type === "photo_hook" ? (s.hook ?? "") : [s.lead, s.title, s.body, ...(s.items ?? [])].filter(Boolean).join(" ")
  return { propio, permitido: i === 0 ? `${propio} ${g.antetitulo}` : propio }
}

/**
 * Las laminas del guion en las plantillas del kit. Nunca lanza: si Claude no
 * responde o una lamina no pasa la comprobacion, esa lamina (o todas) sale del
 * reparto automatico.
 */
export async function maquetar(
  accountId: string,
  kc: KitCargado,
  g: Guion,
  slides: Slide[],
  modelo = MODELO_MAQUETA,
  esfuerzo: "low" | "medium" | "high" = ESFUERZO_MAQUETA
): Promise<{ laminas: LaminaKit[]; descartadas: number[]; motivos?: string[]; error?: string }> {
  const automaticas = laminasDeGuionClasico(slides, g.antetitulo, g.cierre)
  const { texto: cat, porClave } = catalogo(kc.plantillas)
  const ritmo = kc.kit.sistema.ritmo.length ? `\nRitmo de fondos del kit: ${kc.kit.sistema.ritmo.join(", ")}.` : ""
  const r = await llamarClaude({ paso: "maquetador",
    accountId,
    model: modelo,
    esfuerzo,
    system: SISTEMA_MAQUETA,
    prompt: `CATÁLOGO DEL KIT (${kc.kit.nombre})${ritmo}\n\n${cat}\n\nEL CARRUSEL ESCRITO\n\n${guionComoTexto(g, slides)}`,
    // Con todo el catalogo delante piensa largo, y lo que piensa sale del mismo
    // presupuesto que la respuesta: con 4000 se quedaba sin texto.
    maxTokens: 12000,
    timeoutMs: 240_000,
  })
  if (!r.ok) return { laminas: automaticas, descartadas: [], error: r.error }

  let bruto: { laminas?: { lamina?: unknown; plantilla?: unknown; huecos?: unknown }[] }
  try {
    bruto = parsearJSONDeClaude(r.texto) as typeof bruto
  } catch {
    return { laminas: automaticas, descartadas: [], error: "El maquetador no devolvió un JSON válido." }
  }

  const descartadas: number[] = []
  const motivos: string[] = []
  const descartar = (i: number, motivo: string, auto: LaminaKit) => {
    descartadas.push(i + 1)
    motivos.push(`${auto.tipo === "cierre" ? "cierre" : `lámina ${i + 1}`}: ${motivo}`)
    return auto
  }
  const laminas = automaticas.map((auto, i): LaminaKit => {
    const esCierre = auto.tipo === "cierre"
    const suya = (bruto.laminas ?? []).find((l) => (esCierre ? l.lamina === "cierre" : Number(l.lamina) === i + 1))
    const p = typeof suya?.plantilla === "string" ? porClave.get(suya.plantilla) : undefined
    if (!suya) return descartar(i, "el maquetador no la devolvió", auto)
    if (!p) return descartar(i, `la plantilla ${String(suya.plantilla)} no existe`, auto)
    if (esCierre !== (p.tipo === "cierre") || (i === 0) !== (p.tipo === "portada"))
      return descartar(i, `la puso en una plantilla de ${p.tipo}`, auto)
    const huecos = (suya.huecos ?? {}) as Record<string, unknown>
    const textos: Record<string, string> = {}
    const listas: Record<string, string[]> = {}
    for (const h of p.huecos) {
      const v = huecos[h.nombre]
      if (h.tipo === "lista" && Array.isArray(v)) {
        const items = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
        if (items.length) listas[h.nombre] = items
      } else if (typeof v === "string" && v.trim()) textos[h.nombre] = v.trim()
    }
    const puesto = [...Object.values(textos), ...Object.values(listas).flat()].join(" ").replace(/\*/g, "")
    if (!puesto) return descartar(i, "no llenó ningún hueco", auto)
    const fuente = fuenteDe(g, slides, i)
    const tope = esCierre ? QUITAR_EN_CIERRE : 0.25
    if (!fiel(fuente, puesto, tope)) {
      const a = agregado(fuente.permitido, puesto)
      const q = quitado(fuente.propio, puesto)
      const que = [
        a.cifras.length ? `agregó cifras (${a.cifras.join(", ")})` : "",
        a.palabras.length > 1 ? `agregó palabras (${a.palabras.slice(0, 6).join(", ")})` : "",
        q.cifras.length ? `quitó cifras (${q.cifras.join(", ")})` : "",
        q.parteDePalabras > tope ? `quitó el ${Math.round(q.parteDePalabras * 100)} % del texto` : "",
      ].filter(Boolean)
      return descartar(i, que.join("; ") || "cambió el texto", auto)
    }
    return {
      tipo: p.tipo,
      plantilla: p.id,
      textos,
      listas,
      cta_tipo: auto.cta_tipo,
      ...(auto.figura ? { figura: auto.figura } : {}),
    }
  })
  return { laminas, descartadas, motivos }
}
