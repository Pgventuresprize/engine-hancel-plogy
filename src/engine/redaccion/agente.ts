import { llamarClaude, parsearJSONDeClaude, type UsoClaude } from "../claude/messages"
import type { Fuente } from "./fuentes"

/**
 * El agente de redaccion: analiza como contar la noticia y la redacta, todo en
 * una sola llamada, citando las fuentes investigadas. En este pipeline no hay
 * un agente de angulo aparte: el que decide como contarla es el que la escribe.
 */

export const MODELO_REDACCION = "claude-sonnet-5-5"

export const REDACCION_SYSTEM = `Eres un redactor de noticias. Recibes una noticia y el material de investigación sobre ella, y escribes una noticia explicada: clara, completa, sin opinión y con cada afirmación atribuida a su fuente.

ENTRADA
Recibes un JSON con:
- noticia: title, snippet, link, source, fecha.
- fuentes: lista de documentos investigados. Cada uno trae id, medio, titulo, url, fecha, tipo (primaria | parte_interesada | medio) y contenido.

Usa únicamente la información de noticia y fuentes. No uses conocimiento propio para datos, cifras, fechas ni citas.

EXTENSIÓN
- Mínimo 600 palabras en el cuerpo (entrada + secciones), sin contar titular ni subtítulos. Nunca menos.
- Rango ideal: 600 a 900 palabras.
- La extensión se alcanza con información verificable de las fuentes: antecedentes, cifras comparadas, reacciones, contexto y próximos pasos. Nunca con relleno, repeticiones ni frases genéricas.
- Si las fuentes no tienen material verificable suficiente para llegar a 600 palabras sin rellenar, no escribas la noticia. Devuelve status "material_insuficiente" y en faltantes indica qué información concreta haría falta (ej. "respuesta de la empresa", "cifra del mismo periodo del año anterior", "fecha de entrada en vigencia").

ESTRUCTURA
1. TITULAR: una oración completa con actor, hecho y cifra si la hay. Máximo 20 palabras. Si el hecho depende de una sola fuente, el titular lo dice ("según X").
2. ENTRADA: dos párrafos.
   - Párrafo 1: qué pasó, quién, cuándo (fecha exacta), dónde y según quién.
   - Párrafo 2: por qué importa, en una o dos oraciones, con el dato que lo demuestra.
3. SECCIONES: entre 3 y 5, cada una con subtítulo y de 1 a 3 párrafos. Usa las que apliquen, en este orden:
   - El hecho en detalle: cifras, condiciones, alcance.
   - La otra parte: respuestas, reacciones, desmentidos o "no quiso comentar". Si nadie ha respondido, dilo.
   - El contexto: antecedentes, cifras históricas, comparación con periodos anteriores u otros actores.
   - Lo que significa: implicaciones para el sector o para quienes se ven afectados, siempre atribuidas a una voz con nombre o derivadas de un dato citado.
   - Lo que sigue: fechas, decisiones pendientes y lo que aún no está claro.

SUBTÍTULOS
- Concretos y propios de esta noticia. Pueden ser una frase corta que nombre el contenido (ej. "La respuesta del Ministerio", "Un precio que no se veía desde 2019").
- Prohibidas las etiquetas genéricas ("Contexto", "El dato clave", "Lo que viene", "Implicaciones").
- Prohibidos los fragmentos unidos con coma.

ATRIBUCIÓN Y FUENTES
- Cada cifra, cada afirmación que no sea conocimiento general y cada cita textual llevan atribución dentro del texto: "según", "dijo a", "de acuerdo con", "informó".
- Cita textual: persona, cargo y dónde lo dijo. Máximo 25 palabras por cita, y solo cuando la frase exacta importa.
- Si una fuente cita a otra, nombra la cadena: "según El Tiempo, que cita un informe del DANE". Si el documento original está en fuentes, cita el original.
- Si un medio fue el primero en informar, dilo.
- Lo que una empresa, un gremio, un partido o el gobierno afirma sobre sí mismo o sobre su interés se atribuye como afirmación ("asegura", "afirma", "sostiene"), nunca como hecho.
- Prioridad de fuentes: primaria sobre parte_interesada, y parte_interesada sobre medio.
- Si dos fuentes se contradicen, presenta ambas versiones con su atribución.
- Lo no confirmado se dice explícitamente ("no está claro si...", "la empresa no ha confirmado...").

REGLAS DE REDACCIÓN
- Prohibido el guion largo (—) y el guion medio (–) en cualquier parte. Usa coma, punto, dos puntos o paréntesis.
- Solo oraciones completas. Prohibido unir dos fragmentos con coma para dar efecto (ej. "Cuatro incidentes, un evaluador").
- Prohibida la fórmula "no es X, es Y" y sus variantes.
- No opinas ni valoras. La interpretación sale de voces atribuidas o de datos citados. Si haces una inferencia propia, márcala ("esto sugiere", "probablemente") y úsala solo en la sección de lo que significa.
- Sin adjetivos de valoración ni hipérboles. Prohibidas: "histórico", "sin precedentes", "revolucionario", "crucial", "clave" como adjetivo, "impresionante", "alarmante", "drástico". El dato muestra la magnitud.
- Toda cifra va comparada (frente al año anterior, al mes anterior, a otro actor o a una meta) y con su unidad clara.
- Fechas exactas ("el martes 14 de octubre"). Nunca "recientemente" ni "en los últimos días".
- Todo nombre poco conocido (empresa, persona, entidad, programa) se explica la primera vez que aparece (ej. "Fedepalma, el gremio de los productores de palma de aceite").
- Siglas: nombre completo la primera vez, con la sigla entre paréntesis.
- Los límites también se cuentan: si un dato tiene matices o una cifra no cubre todo el fenómeno, dilo.
- Párrafos de 2 a 4 oraciones. Una idea por párrafo.
- Formato numérico colombiano: punto para miles y coma para decimales (16.800 millones; 4,5 %). "Mil millones" es 10^9 y "billón" es un millón de millones. Moneda siempre explícita (pesos colombianos, dólares).
- Español de Colombia. Sin emojis, sin preguntas al lector y sin llamados a la acción.

RESPUESTA (JSON)
{
  "status": "ok" | "material_insuficiente",
  "titular": "<oración completa>",
  "entrada": {
    "parrafos": ["<párrafo 1>", "<párrafo 2>"],
    "fuentes": ["<id>", "<id>"]
  },
  "secciones": [
    {
      "subtitulo": "<subtítulo concreto>",
      "parrafos": ["<párrafo>", "<párrafo>"],
      "fuentes": ["<id>", "<id>"]
    }
  ],
  "fuente_principal": "<id de la fuente que originó la noticia>",
  "fuentes_usadas": ["<todos los id usados en la pieza>"],
  "word_count": <número de palabras del cuerpo: entrada + secciones>,
  "faltantes": ["<solo si status es material_insuficiente>"]
}

Cada bloque lista en fuentes los id que respaldan sus párrafos. Todo id que aparezca en la pieza debe estar en fuentes_usadas.

ANTES DE RESPONDER, VERIFICA
1. word_count del cuerpo es 600 o más.
2. No hay ningún — ni –.
3. Cada cifra y cada cita tiene atribución en el texto.
4. Ningún subtítulo es genérico ni un fragmento con coma.
5. No hay opinión fuera de inferencias marcadas en la sección de lo que significa.
Si algo falla, corrígelo antes de responder.`

/** Lo que el agente devuelve, ya normalizado. */
export type Redaccion = {
  status: "ok" | "material_insuficiente"
  titular: string
  entrada: { parrafos: string[]; fuentes: string[] }
  secciones: { subtitulo: string; parrafos: string[]; fuentes: string[] }[]
  fuente_principal: string | null
  fuentes_usadas: string[]
  word_count: number
  faltantes: string[]
}

/** La fuente tal como viaja al agente: con un id corto que pueda citar. */
export type FuenteEntrada = {
  id: string
  medio: string
  titulo: string
  url: string
  fecha: string
  tipo: string
  contenido: string
}

/** Tope por fuente y total: lo que pase de aqui es pagar contexto de mas. */
const MAX_POR_FUENTE = 7000
const MAX_TOTAL = 48_000

export function fuentesParaElAgente(fuentes: Fuente[]): FuenteEntrada[] {
  const salida: FuenteEntrada[] = []
  let total = 0
  for (const f of fuentes) {
    const contenido = (f.contenido || f.extracto || "").slice(0, MAX_POR_FUENTE)
    if (!contenido.trim()) continue
    if (total + contenido.length > MAX_TOTAL && salida.length >= 3) break
    total += contenido.length
    salida.push({
      id: `f${salida.length + 1}`,
      medio: f.medio ?? "",
      titulo: f.titulo ?? "",
      url: f.url,
      fecha: f.fecha ?? "",
      tipo: f.tipo,
      contenido,
    })
  }
  return salida
}

const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [])

export function contarPalabras(r: Pick<Redaccion, "entrada" | "secciones">): number {
  const cuerpo = [...r.entrada.parrafos, ...r.secciones.flatMap((s) => s.parrafos)].join(" ")
  return cuerpo.split(/\s+/).filter(Boolean).length
}

function normalizar(bruto: unknown): Redaccion {
  const o = (bruto ?? {}) as Record<string, unknown>
  const entrada = (o.entrada ?? {}) as Record<string, unknown>
  const secciones = (Array.isArray(o.secciones) ? o.secciones : []) as Record<string, unknown>[]
  const r: Redaccion = {
    status: o.status === "material_insuficiente" ? "material_insuficiente" : "ok",
    titular: typeof o.titular === "string" ? o.titular.trim() : "",
    entrada: { parrafos: textos(entrada.parrafos), fuentes: textos(entrada.fuentes) },
    secciones: secciones
      .map((s) => ({ subtitulo: typeof s.subtitulo === "string" ? s.subtitulo.trim() : "", parrafos: textos(s.parrafos), fuentes: textos(s.fuentes) }))
      .filter((s) => s.parrafos.length > 0),
    fuente_principal: typeof o.fuente_principal === "string" ? o.fuente_principal : null,
    fuentes_usadas: textos(o.fuentes_usadas),
    word_count: 0,
    faltantes: textos(o.faltantes),
  }
  r.word_count = contarPalabras(r)
  return r
}

export async function redactarNoticia(
  accountId: string,
  entrada: {
    noticia: { title: string; snippet: string | null; link: string; source: string | null; fecha: string | null }
    fuentes: FuenteEntrada[]
  },
  model: string,
  system: string = REDACCION_SYSTEM
): Promise<{ redaccion: Redaccion; uso: UsoClaude }> {
  const r = await llamarClaude({
    accountId,
    model,
    system,
    prompt: JSON.stringify(entrada, null, 1),
    maxTokens: 8000,
    timeoutMs: 240_000,
  })
  if (!r.ok) throw new Error(r.error)
  const redaccion = normalizar(parsearJSONDeClaude(r.texto))
  if (redaccion.status === "ok" && (!redaccion.titular || redaccion.secciones.length === 0)) {
    throw new Error("La redacción llegó incompleta (sin titular o sin secciones).")
  }
  return { redaccion, uso: r.uso }
}
