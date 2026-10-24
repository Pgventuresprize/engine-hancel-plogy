import { llamarClaude, parsearJSONDeClaude, type Sistema, type UsoClaude } from "../claude/messages"
import { bloqueClasificacion } from "../marca/clasificacion"
import { bloqueCriterioEscritor } from "../content/criterio"
import type { LinkedinJobInput } from "../content/types"
import { textoFuentes, textoRegistro, type FuenteRecurso, type Registro } from "./investigacion"
import { normalizarRecurso, ROTULOS, SECCIONES, type Recurso } from "./modelo"

/**
 * El que escribe el recurso: Opus, con la marca, sus skills y sus ejemplos de
 * recurso, a partir del registro de verificacion, las fuentes leidas a fondo,
 * el angulo y el criterio que la marca ya decidio. La lectura de la marca no la
 * inventa el que escribe: sale de ese criterio (lo que se aprendio en B4).
 */

export const MODELO_RECURSO = "claude-opus-5-5"

/** Un reporte de 2.000 palabras en bloques, con rotulos y fuentes, mas el DM. */
const MAX_TOKENS_RECURSO = 16_000
/** Opus escribiendo eso tarda; la etapa tiene su propia pasada. */
const TIMEOUT_RECURSO_MS = 230_000

export const RECURSO_OFICIO = `Eres el editor de recursos de la marca. Una pieza (un carrusel de Instagram y su post de LinkedIn) va a pedir a quien la lee que comente una palabra a cambio de un recurso. Tú escribes ese recurso antes que la pieza, y con él la palabra, la promesa y los dos mensajes del DM que lo entregan. El carrusel se escribe después a partir de lo tuyo: su cierre solo podrá prometer lo que tú escribas.

QUÉ RECURSO
- "reporte": cuando lo valioso es entender el hecho a fondo. Explica la noticia con sus fuentes, separa lo que se sabe de lo que no, y da la lectura de la marca y lo que significa para quien lee.
- "guia": cuando lo valioso es hacer algo que la noticia vuelve urgente o posible. Paso a paso, errores comunes, un ejemplo y una plantilla o lista para usar.
Elige el que más le sirve a la audiencia de la marca con este ángulo. Ante la duda, reporte.

LA REGLA DE LAS TRES PIEZAS
El carrusel da el gancho y el criterio, el recurso profundiza, el DM entrega. El recurso no repite el carrusel en largo: trae lo que no cabe en siete láminas (el detalle de las fuentes, las contradicciones, el marco completo, la lista o la plantilla).

CÓMO SE ESCRIBE
1. Fuente primaria primero. Los hechos centrales salen de la fuente primaria si la hay (la organización que lo hizo o lo anunció). Lo que solo dice un medio se atribuye a ese medio.
2. Cada afirmación lleva su rótulo y sus fuentes:
   - "hecho": lo dicen las fuentes. Lleva los ids de las que lo dicen.
   - "lectura": la interpretación de la marca. Sin fuente, porque es suya.
   - "hipotesis": algo que puede pasar o que se supone. Se dice como posibilidad.
   - "calculo": una cuenta propia hecha con datos de las fuentes. Lleva los ids de los datos.
   - "traduccion": una cita traducida por la marca. Lleva el id de la fuente.
   - "ejemplo": un caso inventado para explicar. Lo dice en el texto ("Un ejemplo con cifras inventadas: ...").
3. Qué se sabe y qué no. Sale del registro de verificación: lo confirmado, lo que solo dice un tercero, lo que no está verificado y las contradicciones entre fuentes, con las dos versiones. No fuerces una conclusión que las fuentes no dan.
4. El interés de cada fuente se declara cuando lo tiene (vende lo que comenta, es parte, compite). Y si la marca ofrece algo relacionado con el tema, también se dice.
5. La lectura de la marca sale del criterio que ya decidió (viene abajo). No es la tesis de la fuente con otras palabras: si la fuente ya lo concluye, se atribuye a la fuente.
6. El recurso tiene que servir: lleva al menos una lista con casillas, una plantilla o una tabla que quien lee pueda copiar y usar mañana. Concreto: qué revisar, dónde, quién decide, con qué umbral.
7. Las cifras, tal cual las dan las fuentes, con su unidad, su moneda y su reserva ("según la empresa", "hasta", "en sus pruebas"). Nunca una cifra que no esté en las fuentes, salvo en un cálculo o un ejemplo rotulado.
8. Nada de piezas internas: no digas "en el carrusel", "en nuestra pieza anterior" ni números de pieza.
9. Voz de la marca, en el idioma de la marca. Sin guiones largos ni medios, sin muletillas, sin emojis, sin promesas de resultado ni urgencia inventada.
10. Largo: un reporte de 1.200 a 2.000 palabras; una guía de 900 a 1.600. Si las fuentes no dan para tanto, más corto y cierto. Si no dan ni para eso, "status": "material_insuficiente" con lo que falta.

LA PALABRA
Una sola palabra, en mayúsculas, sin tildes ni signos, de 3 a 14 letras, ligada al tema para que no se confunda con otra pieza (BANCO, MIGRAR, COSTO). No puede ser ninguna de las ocupadas que vienen abajo.

LA PROMESA
Una frase con lo que recibe quien comenta, nombrando lo que de verdad trae el recurso ("el reporte con lo que pasó, lo que no se sabe y la lista de seis comprobaciones antes de migrar"). Es lo único que el cierre del carrusel podrá prometer.

EL DM
- mensaje1: la respuesta privada al comentario. Agradece que comentó la palabra, entrega la noticia (si es un reporte, el enlace a la fuente original y una línea propia que la resume; nunca el texto del medio copiado) y ofrece el recurso. Hasta 500 caracteres.
- boton: el texto del botón para pedir el recurso, hasta 20 caracteres ("Sí, mándamelo").
- mensaje2: tras el botón, el enlace al recurso y qué trae, nombrando solo secciones que existen. Lleva {enlace} donde va el enlace; el motor lo cambia por la dirección con su seguimiento. Hasta 400 caracteres.
- cierre: para quien comenta cuando la palabra ya venció: amable, sin enlace al recurso si no aplica, invitando a seguir a la marca. Hasta 300 caracteres.
Un solo enlace por mensaje, sin emojis, sin insistir.

Antes de responder relee y comprueba: que cada afirmación tiene rótulo, que cada hecho tiene fuente, que ninguna cifra falta en las fuentes, que no hay guiones largos, que la promesa y el mensaje 2 solo nombran lo que el recurso trae, y que la palabra no está ocupada.`

const bloquesDelContrato = `Cada bloque es uno de estos:
{"tipo":"parrafo","texto":"...","rotulo":"<${ROTULOS.join(" | ")}>","fuentes":["f1"]}
{"tipo":"lista","items":[{"texto":"...","rotulo":"...","fuentes":["f2"]}]}
{"tipo":"checklist","items":[{"texto":"<una comprobación en positivo>","rotulo":"...","fuentes":[]}]}
{"tipo":"tabla","titulo":"...","columnas":["...","..."],"filas":[["...","..."]],"rotulo":"...","fuentes":["f1"]}
{"tipo":"plantilla","titulo":"...","contenido":"<texto para copiar, con [corchetes] donde quien lee pone lo suyo>"}`

export const RECURSO_CONTRATO = `RESPONDE SOLO con este JSON, sin texto alrededor:
{"status":"ok","tipo":"reporte | guia","titular":"<oración completa, concreta>","resumen":["<3 a 5 puntos con lo esencial>"],"palabra":"<PALABRA>","promesa":"<lo que recibe quien comenta>","secciones":[{"clave":"<clave>","titulo":"<título concreto, dice lo que hay>","bloques":[<bloques>]}],"siguiente_paso":"<una sola acción al final del recurso>","dm":{"mensaje1":"...","boton":"...","mensaje2":"... {enlace} ...","cierre":"..."},"fuentes_usadas":["f1","f2"],"faltantes":[]}

${bloquesDelContrato}

Las secciones van en este orden y con estas claves:
- reporte: ${SECCIONES.reporte.map((s) => `"${s.clave}" (${s.que})`).join("; ")}
- guia: ${SECCIONES.guia.map((s) => `"${s.clave}" (${s.que})`).join("; ")}
Las fuentes y el historial no los escribes: los pone el motor con el registro.

Dentro de los textos, las citas textuales van entre comillas angulares («así»), nunca entre comillas dobles: unas comillas dobles sin escapar rompen el JSON.
Si el material no da para un recurso: {"status":"material_insuficiente","faltantes":["..."]} y lo demás vacío.`

/** El CTA y lo que ya esta ocupado: lo que la palabra y la promesa no pueden pisar. */
export type ParaEscribir = {
  input: LinkedinJobInput
  registro: Registro
  fuentes: FuenteRecurso[]
  pendientes: { url: string; medio: string }[]
  cta: { nombre: string; descripcion: string | null } | null
  palabrasOcupadas: string[]
  /** La palabra que ya pide una pieza escrita: se mantiene. */
  palabraFija?: string | null
}

export function promptRecurso(p: ParaEscribir): string {
  const a = p.input.angle
  const n = p.input.raw_news
  const clasificacion = bloqueClasificacion(a.clasificacion)
  return `ÁNGULO
- ángulo: ${a.angle}
- tesis: ${a.thesis ?? "(sin tesis)"}
- formato: ${a.playbook_format ?? "(sin formato)"}
${clasificacion ? `\n${clasificacion}\n` : ""}${bloqueCriterioEscritor(a.criterio)}
EL CTA QUE PIDE EL RECURSO
${p.cta ? `- ${p.cta.nombre}${p.cta.descripcion ? `: ${p.cta.descripcion}` : ""}` : "- (sin CTA: escribe el recurso igual, con su palabra)"}

${p.palabraFija ? `LA PALABRA YA ESTÁ EN LA PIEZA: usa exactamente ${p.palabraFija}. La promesa puede cambiar si el recurso cambia, pero el carrusel ya pide comentar esa palabra.` : `PALABRAS OCUPADAS (no puedes usar ninguna)
${p.palabrasOcupadas.length ? p.palabrasOcupadas.join(", ") : "(ninguna)"}`}

NOTICIA
- título: ${n.title}
- enlace original: ${n.link}
- medio: ${n.source ?? "desconocido"}

REGISTRO DE VERIFICACIÓN (lo armó un verificador con las mismas fuentes)
${textoRegistro(p.registro)}
${p.pendientes.length ? `\nFUENTES QUE NO SE PUDIERON LEER (no las cites: si importan, van en lo que no se sabe)\n${p.pendientes.map((f) => `- ${f.medio}: ${f.url}`).join("\n")}\n` : ""}
FUENTES
${textoFuentes(p.fuentes)}

VARIABLES
- idioma: ${p.input.variables.idioma}`
}

/** Una version del recurso: la primera, o una correccion con el pedido del revisor. */
export async function escribirRecurso(o: {
  accountId: string
  model: string
  system: Sistema
  prompt: string
  paso: "recurso" | "recurso-correccion"
  /** El final de la pasada: el segundo intento solo si le cabe. */
  hasta?: number
}): Promise<{ recurso: Recurso; uso: UsoClaude }> {
  let error = ""
  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0 && o.hasta && Date.now() + TIMEOUT_RECURSO_MS > o.hasta) break
    const r = await llamarClaude({
      paso: o.paso,
      accountId: o.accountId,
      model: o.model,
      system: o.system,
      prompt: o.prompt,
      maxTokens: MAX_TOKENS_RECURSO,
      timeoutMs: TIMEOUT_RECURSO_MS,
    })
    if (!r.ok) {
      error = r.error
      continue
    }
    try {
      const recurso = normalizarRecurso(parsearJSONDeClaude(r.texto))
      if (recurso.status === "ok" && (!recurso.titular || recurso.secciones.length === 0)) {
        throw new Error("El recurso llegó incompleto (sin titular o sin secciones).")
      }
      return { recurso, uso: r.uso }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`No se pudo escribir el recurso: ${error}`)
}
