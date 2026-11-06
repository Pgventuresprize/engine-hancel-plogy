/**
 * El onboarding: que necesita una marca para sacar posts decentes.
 *
 * Es la lista que manda todo el flujo (ver ONBOARDING.md). La comprueba el
 * codigo, no el criterio de un modelo, y aqui solo van tipos y reglas, sin base,
 * para que la interfaz y las pruebas la lean igual.
 *
 * La regla de fondo son tres clases de dato:
 *   - hecho: es verdad o no (clientes, cifras, su historia). Nunca se rellena.
 *   - decision: lo que la marca elige ser. Se puede rellenar.
 *   - opinion: lo que alguien cree. Se propone y se muestra, nunca en silencio.
 *
 * Lo derivado (pilares, ideas, reglas visuales) no se pregunta: lo escribe el
 * brief a partir de esto, y su densidad se comprueba en `validarBrief`.
 */

export const TIPOS_MARCA = ["persona", "servicios", "producto", "alto_valor", "local"] as const
export type TipoMarca = (typeof TIPOS_MARCA)[number]

export const NOMBRE_TIPO: Record<TipoMarca, { titulo: string; detalle: string }> = {
  persona: { titulo: "Mi marca personal", detalle: "Tú eres la marca: tu historia, tu criterio, tu voz." },
  servicios: { titulo: "Una empresa de servicios", detalle: "Consultoría, agencia, profesional independiente, B2B." },
  producto: { titulo: "Un producto", detalle: "Ropa, comida, cosmética, algo que se compra." },
  alto_valor: { titulo: "Una compra grande", detalle: "Carros, inmuebles, algo que se piensa mucho." },
  local: { titulo: "Un negocio local", detalle: "Restaurante, tienda, consultorio, gimnasio." },
}

export type Clase = "hecho" | "decision" | "opinion"

export type Requisito = {
  id: string
  /** La parte del brief donde vive. */
  parte: string
  nombre: string
  clase: Clase
  /** Lo que tiene que quedar claro, dicho para el Estratega. */
  que_es: string
  /** Solo para estos tipos. Vacio = para todos. */
  tipos?: TipoMarca[]
  /** Sin esto no se genera. Los hechos que no bloquean pueden quedar vacios. */
  bloquea: boolean
  /** Cuantas lineas tiene que tener, para las listas. */
  minimo?: number
}

export const REQUISITOS: Requisito[] = [
  // Posicionamiento
  { id: "nombre", parte: "Posicionamiento", nombre: "Nombre", clase: "hecho", bloquea: true, que_es: "Cómo se llama la marca o cómo se presenta la persona, y su usuario de redes si lo tiene." },
  { id: "que_hace", parte: "Posicionamiento", nombre: "Qué hace", clase: "hecho", bloquea: true, que_es: "A qué se dedica, en una o dos frases simples y concretas." },
  { id: "idioma_pais", parte: "Posicionamiento", nombre: "Idioma y país", clase: "decision", bloquea: true, que_es: "En qué idioma publica y para qué país. Formato: es, CO" },
  { id: "categoria", parte: "Posicionamiento", nombre: "Categoría", clase: "decision", bloquea: true, que_es: "En qué categoría la ubicaría alguien que la ve por primera vez." },
  { id: "referente", parte: "Posicionamiento", nombre: "De qué quiere ser referente", clase: "decision", bloquea: true, que_es: "El terreno en el que quiere que la recuerden. Una frase." },
  { id: "diferencia", parte: "Posicionamiento", nombre: "En qué se diferencia", clase: "decision", bloquea: true, que_es: "Qué hace distinto frente a las alternativas que tiene quien la elige." },
  // Audiencia
  { id: "audiencia", parte: "Audiencia", nombre: "A quién le habla", clase: "decision", bloquea: true, que_es: "De 1 a 3 perfiles, uno por línea: quién es, qué le preocupa, qué quiere, qué le frena y cómo habla." },
  // Esencia
  { id: "por_que", parte: "Esencia", nombre: "Por qué existe", clase: "opinion", bloquea: true, que_es: "Qué le molestó del mundo, qué quiere cambiar, por qué hace esto." },
  { id: "posturas", parte: "Esencia", nombre: "Qué cree", clase: "opinion", bloquea: true, minimo: 2, que_es: "Una postura por línea, al menos 2. Cosas que alguien razonable discutiría." },
  { id: "contra", parte: "Esencia", nombre: "Contra qué está", clase: "opinion", bloquea: false, que_es: "Una práctica o una idea de su sector, no un competidor." },
  { id: "promesa", parte: "Esencia", nombre: "Qué promete", clase: "decision", bloquea: true, que_es: "Qué gana quien la sigue o la elige. Concreto." },
  { id: "metodo", parte: "Esencia", nombre: "Cómo trabaja o mira las cosas", clase: "opinion", bloquea: true, que_es: "Qué mira primero, en qué orden, qué mide. De aquí sale el criterio propio de cada pieza." },
  { id: "nunca", parte: "Esencia", nombre: "Qué nunca haría", clase: "decision", bloquea: false, que_es: "Líneas rojas concretas." },
  { id: "rasgos", parte: "Esencia", nombre: "Personalidad", clase: "decision", bloquea: true, minimo: 3, que_es: "De 3 a 5 rasgos, uno por línea, cada uno con su opuesto. Ejemplo: directo, no agresivo." },
  // Voz
  { id: "voz", parte: "Voz", nombre: "Cómo suena", clase: "decision", bloquea: true, que_es: "Registro, largo de frase, cómo trata a quien lee, cómo sí y cómo no." },
  { id: "frases", parte: "Voz", nombre: "Frases de muestra", clase: "decision", bloquea: true, minimo: 3, que_es: "Al menos 3 frases, una por línea, que suenen exactamente a la marca. Reales si existen." },
  // Contenido
  { id: "objetivo", parte: "Contenido", nombre: "Para qué publica", clase: "decision", bloquea: true, que_es: "Qué quiere lograr: audiencia, clientes, ventas, oportunidades." },
  { id: "vetos", parte: "Contenido", nombre: "Temas que no toca", clase: "decision", bloquea: false, que_es: "De qué nunca se habla." },
  { id: "limites", parte: "Contenido", nombre: "Lo que no se cuenta", clase: "decision", bloquea: true, tipos: ["persona"], que_es: "Temas personales que nunca aparecen: familia, salud, dinero, dónde vive." },
  // Lo que puede afirmar
  { id: "hechos", parte: "Lo que puede afirmar", nombre: "Hechos", clase: "hecho", bloquea: false, que_es: "Hechos reales, uno por línea: clientes, años, cifras, títulos, resultados." },
  { id: "historia", parte: "Lo que puede afirmar", nombre: "Su historia", clase: "hecho", bloquea: false, tipos: ["persona"], que_es: "Qué hacía antes, qué le hizo cambiar, los momentos que la formaron." },
  { id: "caso", parte: "Lo que puede afirmar", nombre: "Un caso real", clase: "hecho", bloquea: false, tipos: ["servicios", "alto_valor"], que_es: "Un trabajo o una venta real, contada de principio a fin." },
  { id: "oferta", parte: "Lo que puede afirmar", nombre: "Qué ofrece y dónde", clase: "hecho", bloquea: false, tipos: ["producto", "local", "alto_valor"], que_es: "Qué vende y dónde se consigue." },
  // Que pide
  { id: "cta", parte: "Qué pide", nombre: "Qué pide al final", clase: "decision", bloquea: true, que_es: "Qué debe hacer quien lee y a dónde lleva: seguir, comentar, escribir por mensaje, comprar." },
  // Identidad visual
  { id: "paleta", parte: "Identidad visual", nombre: "Colores", clase: "decision", bloquea: true, que_es: "Cinco colores en hexadecimal, en este formato exacto: principal #112233, acento #112233, fondo_claro #112233, fondo_oscuro #112233, texto #112233" },
  { id: "fuentes", parte: "Identidad visual", nombre: "Fuentes", clase: "decision", bloquea: true, que_es: "Dos fuentes de Google Fonts, en este formato exacto: titulos: Nombre; texto: Nombre" },
  { id: "estilo", parte: "Identidad visual", nombre: "Estilo gráfico", clase: "decision", bloquea: true, que_es: "Cómo se ve: formas, bordes, densidad, mayúsculas, si domina lo claro o lo oscuro." },
  { id: "foto", parte: "Identidad visual", nombre: "Dirección de foto", clase: "decision", bloquea: true, que_es: "Qué se ve en sus fotos: sujetos, luz, encuadre y qué evitar." },
]

export type Dato = {
  valor: string
  /** De donde salio. "studio" es lo propuesto: se ve marcado en el brief. */
  origen: "persona" | "fuente" | "studio"
  /** La frase literal de las fuentes. */
  cita?: string
  /** Por que se propuso. */
  motivo?: string
}

export type Datos = Record<string, Dato>
export type DatoNuevo = { valor?: unknown; origen?: unknown; cita?: unknown; motivo?: unknown }

export type Opcion = { titulo: string; detalle: string }
export type Tema = { titulo: string; por_que: string }
export type MensajeOnboarding = { de: "estratega" | "persona"; texto: string }

export const PAPELES_COLOR = ["principal", "acento", "fondo_claro", "fondo_oscuro", "texto"] as const
export type PaletaMarca = Record<(typeof PAPELES_COLOR)[number], string>

export function parsePaleta(valor: string | undefined): PaletaMarca | null {
  const salida: Partial<PaletaMarca> = {}
  for (const papel of PAPELES_COLOR) {
    const hex = new RegExp(`${papel}\\s*[:=]?\\s*(#[0-9a-f]{6})\\b`, "i").exec(valor ?? "")?.[1]
    if (!hex) return null
    salida[papel] = hex.toUpperCase()
  }
  return salida as PaletaMarca
}

export type FuentesMarca = { titulos: string; texto: string }

export function parseFuentes(valor: string | undefined): FuentesMarca | null {
  const de = (papel: string) => new RegExp(`${papel}\\s*[:=]\\s*([^;\\n,]+)`, "i").exec(valor ?? "")?.[1]?.trim()
  const titulos = de("t[ií]tulos")
  const texto = de("texto")
  return titulos && texto ? { titulos, texto } : null
}

/** Cuantas preguntas se hacen antes de proponer lo que falte. */
export const maxPreguntas = (conMaterial: boolean) => (conMaterial ? 7 : 10)

export const requisitosDe = (tipo: TipoMarca) => REQUISITOS.filter((r) => !r.tipos || r.tipos.includes(tipo))

const lineas = (t: string) => t.split("\n").filter((l) => l.trim().length > 0).length

/** El dato esta bien: tiene valor, y si es una lista o un formato, lo cumple. */
export function cumple(r: Requisito, datos: Datos): boolean {
  const valor = datos[r.id]?.valor.trim() ?? ""
  if (!valor) return false
  if (r.id === "paleta") return parsePaleta(valor) !== null
  if (r.id === "fuentes") return parseFuentes(valor) !== null
  return lineas(valor) >= (r.minimo ?? 1)
}

/** Lo que falta por resolver, en orden. Lo saltado (hechos sin dato) ya no cuenta. */
export function faltan(datos: Datos, tipo: TipoMarca, omitidos: string[] = []): Requisito[] {
  return requisitosDe(tipo).filter((r) => !cumple(r, datos) && !omitidos.includes(r.id))
}

/** Se puede pasar a elegir tema: todo lo que bloquea esta bien. */
export function completo(datos: Datos, tipo: TipoMarca): boolean {
  return requisitosDe(tipo).every((r) => !r.bloquea || cumple(r, datos))
}

/** Cuanto de la lista obligatoria esta listo, para el avance en pantalla. */
export function avance(datos: Datos, tipo: TipoMarca): { listos: number; total: number } {
  const obligatorios = requisitosDe(tipo).filter((r) => r.bloquea)
  return { listos: obligatorios.filter((r) => cumple(r, datos)).length, total: obligatorios.length }
}

const normal = (t: string) =>
  t
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/**
 * Mezcla lo que trae el Estratega con lo que habia, con tres seguros de codigo:
 *   - un hecho propuesto por el Studio no entra: seria inventar. La unica
 *     excepcion es el nombre de una marca que aun no tiene: ahi es una decision.
 *   - lo que dijo la persona no lo pisa una fuente ni una propuesta.
 *   - lo que dice salir de las fuentes tiene que estar en ellas, tal cual.
 */
export function mezclar(
  previos: Datos,
  nuevos: Record<string, DatoNuevo>,
  tipo: TipoMarca,
  corpus: string,
  construir = false
): Datos {
  const salida: Datos = { ...previos }
  const corpusNormal = normal(corpus)
  for (const r of requisitosDe(tipo)) {
    const n = nuevos[r.id]
    const valor = texto(n?.valor)
    if (!valor) continue
    const cita = texto(n?.cita)
    const motivo = texto(n?.motivo)
    const hecho = r.clase === "hecho" && !(construir && r.id === "nombre")
    let origen: Dato["origen"] = n?.origen === "persona" || n?.origen === "fuente" ? n.origen : "studio"
    if (origen === "fuente" && (!cita || !corpusNormal.includes(normal(cita)))) {
      // Sin cita real no es algo encontrado: un hecho se cae y lo demas es propuesta.
      if (hecho) continue
      origen = "studio"
    }
    if (origen === "studio" && hecho) continue
    if (previos[r.id]?.origen === "persona" && origen !== "persona") continue
    salida[r.id] = {
      valor: valor.slice(0, 1500),
      origen,
      ...(cita ? { cita: cita.slice(0, 300) } : {}),
      ...(motivo ? { motivo: motivo.slice(0, 300) } : {}),
    }
  }
  return salida
}

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

/** Texto legible sobre un color: blanco o casi negro, el que mas contraste de. */
export const textoSobre = (hex: string) => (luminancia(hex) > 0.4 ? "#141414" : "#FFFFFF")
