import { cifrasPerdidas, normalizar, viciosDeTexto, type Campo, type Hallazgo } from "../content/revisor"

/**
 * El recurso de una pieza: el reporte o la guia que recibe quien comenta la
 * palabra del cierre, mas los dos mensajes del DM que lo entregan.
 *
 * Viene del kit de carruseles de Plogy (FLUJO-REPORTE-DM.md): el carrusel da el
 * gancho y el criterio, el recurso profundiza y el DM entrega. Ninguno copia al
 * otro, y el recurso se escribe antes que el carrusel para que el cierre solo
 * prometa lo que existe.
 *
 * El agente lo devuelve en bloques, no en markdown: cada afirmacion lleva su
 * rotulo (hecho, lectura de la marca, hipotesis...) y las fuentes que la
 * sostienen, y asi el codigo puede comprobar que nada quede sin rotulo y que
 * cada cifra este en las fuentes.
 *
 * Todo es puro y sin base: lo usan el motor, la ficha y el webhook.
 */

export const TIPOS_RECURSO = ["reporte", "guia"] as const
export type TipoRecurso = (typeof TIPOS_RECURSO)[number]
export const NOMBRE_TIPO_RECURSO: Record<TipoRecurso, string> = { reporte: "Reporte", guia: "Guía" }

export const ROTULOS = ["hecho", "lectura", "hipotesis", "calculo", "traduccion", "ejemplo"] as const
export type Rotulo = (typeof ROTULOS)[number]
export const NOMBRE_ROTULO: Record<Rotulo, string> = {
  hecho: "Hecho",
  lectura: "Lectura de la marca",
  hipotesis: "Hipótesis",
  calculo: "Cálculo propio",
  traduccion: "Traducción propia",
  ejemplo: "Ejemplo hipotético",
}

/** Lo que tiene que afirmarse con una fuente al lado. */
const PIDEN_FUENTE: Rotulo[] = ["hecho", "calculo", "traduccion"]

/** Como se leyo cada fuente: lo que el recurso puede afirmar depende de esto. */
export type Lectura = "completa" | "recortada" | "busqueda" | "pendiente"

export const NOMBRE_LECTURA: Record<Lectura, string> = {
  completa: "Leída completa",
  recortada: "Leída en parte",
  busqueda: "Vista en la búsqueda",
  pendiente: "No se pudo leer",
}

/** La rubrica del revisor de recursos (recursos/revisor.ts): una nota de 1 a 5 por criterio. */
export const CRITERIOS_RECURSO = [
  { clave: "evidencia", nombre: "Honestidad de la evidencia" },
  { clave: "se_sabe", nombre: "Qué se sabe y qué no" },
  { clave: "lectura", nombre: "Lectura propia de la marca" },
  { clave: "valor", nombre: "Valor para quien lee" },
  { clave: "recurso", nombre: "Lo que se puede usar" },
  { clave: "voz", nombre: "Voz de la marca" },
  { clave: "orden", nombre: "Claridad y orden" },
  { clave: "promesa", nombre: "Promesa y DM" },
] as const

export const VEREDICTOS = {
  publicar: "Publicar con ajustes",
  mejorar: "Mejorar antes de seguir",
  replantear: "Descartar o replantear",
} as const
export type Veredicto = keyof typeof VEREDICTOS

/** Como se lee cada etapa del agente mientras trabaja (agente.ts, EnCurso). */
export const NOMBRE_ETAPA_RECURSO: Record<string, string> = {
  registro: "leyendo las fuentes",
  escribir: "escribiendo",
  revisar: "en revisión",
  corregir: "corrigiendo",
}

export type Nota = { criterio: string; nota: number; por_que: string }

export type Item = { texto: string; rotulo: Rotulo | null; fuentes: string[] }

export type Bloque =
  | ({ tipo: "parrafo" } & Item)
  | { tipo: "lista"; items: Item[] }
  | { tipo: "checklist"; items: Item[] }
  | { tipo: "tabla"; titulo: string; columnas: string[]; filas: string[][]; rotulo: Rotulo | null; fuentes: string[] }
  | { tipo: "plantilla"; titulo: string; contenido: string }

export type Seccion = { clave: string; titulo: string; bloques: Bloque[] }

export type Dm = {
  /** La respuesta privada al comentario: entrega la noticia o resume el recurso y ofrece el boton. */
  mensaje1: string
  boton: string
  /** Tras el boton: el enlace al recurso. Lleva {enlace}, que pone el codigo. */
  mensaje2: string
  /** Para quien comenta cuando la palabra ya vencio. */
  cierre: string
}

export type Recurso = {
  status: "ok" | "material_insuficiente"
  tipo: TipoRecurso
  titular: string
  /** De 3 a 5 puntos con lo esencial. */
  resumen: string[]
  /** La palabra que se comenta: una sola, en mayusculas, sin tildes. */
  palabra: string
  /** Lo que recibe quien comenta, en una frase: lo que el cierre puede prometer. */
  promesa: string
  secciones: Seccion[]
  siguiente_paso: string
  dm: Dm
  fuentes_usadas: string[]
  faltantes: string[]
}

/**
 * Las secciones que cada tipo no puede dejar vacias, por su clave. El titulo lo
 * escribe el agente para cada pieza; la clave es la que el codigo comprueba.
 */
export const SECCIONES: Record<TipoRecurso, { clave: string; que: string }[]> = {
  reporte: [
    { clave: "que_paso", que: "Qué pasó: los hechos, cada uno con su fuente." },
    { clave: "se_sabe", que: "Qué se sabe y qué no: lo confirmado, lo que dicen terceros, lo que no se ha verificado y las contradicciones entre fuentes, sin forzar una conclusión." },
    { clave: "lectura", que: "La lectura de la marca: la tesis propia, la que la fuente no tiene." },
    { clave: "para_ti", que: "Qué significa para quien lee: el criterio o marco aplicable a su trabajo o su negocio, con los ejemplos hipotéticos rotulados." },
    { clave: "primero", que: "Qué haría la marca primero: pasos concretos y verificables, sin promesas de resultado. Aquí va el recurso que sirve: una lista con casillas, una plantilla o una tabla." },
  ],
  guia: [
    { clave: "idea", que: "La idea: el problema y por qué importa, en pocas líneas." },
    { clave: "pasos", que: "Paso a paso: qué hacer, en orden, con lo concreto de cada paso." },
    { clave: "errores", que: "Errores comunes: los que se cometen al hacerlo y cómo evitarlos." },
    { clave: "ejemplo", que: "Un ejemplo: con cifras inventadas rotuladas como ejemplo hipotético, o con un caso real con su fuente." },
    { clave: "plantilla", que: "La plantilla o la lista de comprobación para copiar y usar." },
    { clave: "no_cubre", que: "Lo que esta guía no cubre." },
  ],
}

// ----------------------------------------------------------------- normalizar

type Bruto = Record<string, unknown>
const esObjeto = (v: unknown): v is Bruto => Boolean(v) && typeof v === "object" && !Array.isArray(v)
const cadena = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.map(cadena).filter(Boolean) : [])
const rotulo = (v: unknown): Rotulo | null => ((ROTULOS as readonly string[]).includes(cadena(v)) ? (cadena(v) as Rotulo) : null)

function item(v: unknown): Item | null {
  if (typeof v === "string") return v.trim() ? { texto: v.trim(), rotulo: null, fuentes: [] } : null
  if (!esObjeto(v)) return null
  const texto = cadena(v.texto)
  return texto ? { texto, rotulo: rotulo(v.rotulo), fuentes: textos(v.fuentes) } : null
}

function bloque(v: unknown): Bloque | null {
  if (!esObjeto(v)) return null
  switch (v.tipo) {
    case "parrafo": {
      const i = item(v)
      return i ? { tipo: "parrafo", ...i } : null
    }
    case "lista":
    case "checklist": {
      const items = (Array.isArray(v.items) ? v.items : []).map(item).filter((i): i is Item => i !== null)
      if (!items.length) return null
      return v.tipo === "lista" ? { tipo: "lista", items } : { tipo: "checklist", items }
    }
    case "tabla": {
      const columnas = textos(v.columnas)
      const filas = (Array.isArray(v.filas) ? v.filas : []).map((f) => (Array.isArray(f) ? f.map((c) => cadena(c)) : [])).filter((f) => f.some(Boolean))
      return columnas.length && filas.length
        ? { tipo: "tabla", titulo: cadena(v.titulo), columnas, filas, rotulo: rotulo(v.rotulo), fuentes: textos(v.fuentes) }
        : null
    }
    case "plantilla": {
      const contenido = cadena(v.contenido)
      return contenido ? { tipo: "plantilla", titulo: cadena(v.titulo), contenido } : null
    }
    default:
      return null
  }
}

/** La palabra como se comenta: una sola, en mayusculas y sin tildes ni signos. */
export function limpiarPalabra(v: string): string {
  return v
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

export function normalizarRecurso(bruto: unknown): Recurso {
  const o = esObjeto(bruto) ? bruto : {}
  const dm = esObjeto(o.dm) ? o.dm : {}
  return {
    status: o.status === "material_insuficiente" ? "material_insuficiente" : "ok",
    tipo: o.tipo === "guia" ? "guia" : "reporte",
    titular: cadena(o.titular),
    resumen: textos(o.resumen),
    palabra: cadena(o.palabra),
    promesa: cadena(o.promesa),
    secciones: (Array.isArray(o.secciones) ? o.secciones : [])
      .filter(esObjeto)
      .map((s) => ({
        clave: cadena(s.clave),
        titulo: cadena(s.titulo),
        bloques: (Array.isArray(s.bloques) ? s.bloques : []).map(bloque).filter((b): b is Bloque => b !== null),
      }))
      .filter((s) => s.titulo || s.bloques.length),
    siguiente_paso: cadena(o.siguiente_paso),
    dm: { mensaje1: cadena(dm.mensaje1), boton: cadena(dm.boton), mensaje2: cadena(dm.mensaje2), cierre: cadena(dm.cierre) },
    fuentes_usadas: textos(o.fuentes_usadas),
    faltantes: textos(o.faltantes),
  }
}

// --------------------------------------------------------------- los textos

/** Cada texto que se publica, con donde esta: lo que los revisores citan. */
export function camposRecurso(r: Recurso): Campo[] {
  const campos: Campo[] = [{ donde: "titular", texto: r.titular }]
  r.resumen.forEach((t, i) => campos.push({ donde: `resumen (punto ${i + 1})`, texto: t }))
  r.secciones.forEach((s, i) => {
    const en = `sección ${i + 1} «${s.titulo}»`
    if (s.titulo) campos.push({ donde: `${en} (título)`, texto: s.titulo })
    s.bloques.forEach((b, j) => {
      const donde = `${en}, bloque ${j + 1}`
      if (b.tipo === "parrafo") campos.push({ donde, texto: b.texto })
      else if (b.tipo === "lista" || b.tipo === "checklist") b.items.forEach((it, k) => campos.push({ donde: `${donde}, punto ${k + 1}`, texto: it.texto }))
      else if (b.tipo === "tabla") {
        if (b.titulo) campos.push({ donde: `${donde} (título de la tabla)`, texto: b.titulo })
        campos.push({ donde: `${donde} (tabla)`, texto: [b.columnas.join(" | "), ...b.filas.map((f) => f.join(" | "))].join("\n") })
      } else campos.push({ donde: `${donde} (plantilla)`, texto: [b.titulo, b.contenido].filter(Boolean).join("\n") })
    })
  })
  if (r.siguiente_paso) campos.push({ donde: "siguiente paso", texto: r.siguiente_paso })
  campos.push({ donde: "promesa", texto: r.promesa })
  for (const [clave, nombre] of [["mensaje1", "DM, mensaje 1"], ["boton", "DM, botón"], ["mensaje2", "DM, mensaje 2"], ["cierre", "DM, cierre"]] as const) {
    if (r.dm[clave]) campos.push({ donde: nombre, texto: r.dm[clave] })
  }
  return campos.filter((c) => c.texto)
}

/** El recurso como texto plano para leerlo de corrido (revisor, ejemplos, conteo). */
export function textoRecurso(r: Recurso): string {
  const lineas: string[] = [`# ${r.titular}`, "", ...r.resumen.map((t) => `- ${t}`)]
  for (const s of r.secciones) {
    lineas.push("", `## ${s.titulo}`)
    for (const b of s.bloques) {
      const marca = (i: Item) => (i.rotulo ? ` [${NOMBRE_ROTULO[i.rotulo]}${i.fuentes.length ? `; ${i.fuentes.join(", ")}` : ""}]` : "")
      if (b.tipo === "parrafo") lineas.push("", `${b.texto}${marca(b)}`)
      else if (b.tipo === "lista") lineas.push("", ...b.items.map((i) => `- ${i.texto}${marca(i)}`))
      else if (b.tipo === "checklist") lineas.push("", ...b.items.map((i) => `- [ ] ${i.texto}${marca(i)}`))
      else if (b.tipo === "tabla") {
        lineas.push(
          "",
          ...(b.titulo ? [`**${b.titulo}**`] : []),
          `| ${b.columnas.join(" | ")} |`,
          `| ${b.columnas.map(() => "---").join(" | ")} |`,
          ...b.filas.map((f) => `| ${f.join(" | ")} |`)
        )
        if (b.rotulo) lineas.push(`[${NOMBRE_ROTULO[b.rotulo]}${b.fuentes.length ? `; ${b.fuentes.join(", ")}` : ""}]`)
      } else lineas.push("", ...(b.titulo ? [`**${b.titulo}**`] : []), "```", b.contenido, "```")
    }
  }
  if (r.siguiente_paso) lineas.push("", "## Siguiente paso", r.siguiente_paso)
  return lineas.join("\n")
}

export function contarPalabrasRecurso(r: Recurso): number {
  return camposRecurso(r)
    .filter((c) => !c.donde.startsWith("DM") && c.donde !== "promesa")
    .map((c) => c.texto)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length
}

// ------------------------------------------------------------- revision por codigo

/** Lo que el revisor de codigo necesita del recurso: contra que comprueba. */
export type ContextoRecurso = {
  /** El texto de todas las fuentes que vio el agente y el registro: lo que vale como dato. */
  material: string
  /** Los ids de fuente que existen (f1, f2...). */
  fuentes: string[]
  frasesProhibidas: string[]
  /** Las palabras que otras piezas tienen ocupadas ahora. */
  palabrasOcupadas: string[]
}

const hallazgo = (regla: Hallazgo["regla"], nivel: Hallazgo["nivel"], donde: string, detalle: string, pide: string): Hallazgo => ({
  regla,
  nivel,
  donde,
  detalle,
  pide,
})

/**
 * Lo mecanico del recurso: guiones y frases prohibidas, cifras que no estan en
 * las fuentes, afirmaciones sin rotulo o sin fuente, secciones que faltan, la
 * palabra y el DM. Lo que frena no puede salir; vuelve al agente.
 */
export function revisarRecurso(r: Recurso, ctx: ContextoRecurso): Hallazgo[] {
  const hallazgos: Hallazgo[] = []
  const existen = new Set(ctx.fuentes)

  // Las mismas reglas de texto que el carrusel: el guion y la frase prohibida
  // frenan; la muletilla y la formula "No es X, es Y" avisan.
  for (const { donde, texto } of camposRecurso(r)) {
    for (const vicio of viciosDeTexto(texto, ctx.frasesProhibidas)) {
      const [regla, nivel]: [Hallazgo["regla"], Hallazgo["nivel"]] = /guion/.test(vicio)
        ? ["guion_largo", "frena"]
        : /prohibidas/.test(vicio)
          ? ["frase_prohibida", "frena"]
          : /fórmula/.test(vicio)
            ? ["no_es_x_es_y", "aviso"]
            : ["frase_de_fabrica", "aviso"]
      hallazgos.push(hallazgo(regla, nivel, donde, vicio, "Reescribe esa frase sin eso: el dato o la idea concreta, con coma, punto o dos puntos."))
    }
  }

  // Las cifras: cada una tiene que estar en las fuentes o en el registro. Las
  // de un ejemplo hipotetico o un calculo propio se rotulan y no se comprueban.
  r.secciones.forEach((s, i) => {
    s.bloques.forEach((b, j) => {
      const donde = `sección ${i + 1} «${s.titulo}», bloque ${j + 1}`
      const conRotulo: Item[] =
        b.tipo === "parrafo" ? [b] : b.tipo === "lista" || b.tipo === "checklist" ? b.items : b.tipo === "tabla" ? [{ texto: [b.titulo, ...b.filas.flat()].join(" "), rotulo: b.rotulo, fuentes: b.fuentes }] : []
      for (const it of conRotulo) {
        // En una lista de pasos o una checklist, el rotulo solo hace falta si
        // el punto afirma algo; una accion ("Mide el tiempo...") no es un dato.
        const esAccion = b.tipo === "checklist" || (b.tipo === "lista" && !/\d/.test(it.texto))
        if (!it.rotulo && !esAccion) {
          hallazgos.push(hallazgo("sin_rotulo", "frena", donde, `Afirma algo sin decir qué es: «${corto(it.texto)}».`, `Ponle "rotulo": ${ROTULOS.map((x) => `"${x}"`).join(", ")}.`))
        }
        const malas = it.fuentes.filter((f) => !existen.has(f))
        if (malas.length) {
          hallazgos.push(hallazgo("sin_fuente", "frena", donde, `Cita ${malas.join(", ")}, que no está entre las fuentes.`, "Cita solo ids de las fuentes que recibiste, o quita la cita."))
        }
        if (it.rotulo && PIDEN_FUENTE.includes(it.rotulo) && it.fuentes.length === 0) {
          hallazgos.push(hallazgo("sin_fuente", "frena", donde, `Es un ${NOMBRE_ROTULO[it.rotulo].toLowerCase()} sin fuente: «${corto(it.texto)}».`, "Di de qué fuente sale (sus ids en \"fuentes\"); si no sale de ninguna, no es un hecho: rotúlalo como lectura o hipótesis, o quítalo."))
        }
        if (it.rotulo === "ejemplo" || it.rotulo === "calculo" || it.rotulo === "hipotesis") continue
        const fuera = cifrasPerdidas(it.texto, ctx.material)
        if (fuera.length) {
          hallazgos.push(hallazgo("cifra_fuera", "frena", donde, `${fuera.length === 1 ? "La cifra" : "Las cifras"} ${fuera.map((c) => `«${c}»`).join(", ")} no ${fuera.length === 1 ? "aparece" : "aparecen"} en las fuentes: «${corto(it.texto)}».`, "Usa solo cifras de las fuentes. Si es una cuenta propia o un ejemplo, rotúlalo como «calculo» o «ejemplo»; si no, quítala."))
        }
      }
    })
  })

  const claves = new Set(r.secciones.filter((s) => s.bloques.length > 0).map((s) => s.clave))
  for (const s of SECCIONES[r.tipo]) {
    if (!claves.has(s.clave)) {
      hallazgos.push(hallazgo("seccion_faltante", "frena", "estructura", `Falta la sección «${s.clave}» o está vacía.`, `Escríbela con la clave «${s.clave}»: ${s.que}`))
    }
  }
  if (r.resumen.length < 3 || r.resumen.length > 5) {
    hallazgos.push(hallazgo("seccion_faltante", "aviso", "resumen", `El resumen tiene ${r.resumen.length} puntos.`, "Deja el resumen en 3 a 5 puntos con lo esencial."))
  }
  const conRecursoUtil = r.secciones.some((s) => s.bloques.some((b) => b.tipo === "checklist" || b.tipo === "plantilla" || b.tipo === "tabla"))
  if (!conRecursoUtil) {
    hallazgos.push(hallazgo("seccion_faltante", "frena", "estructura", "No trae nada para usar: ni lista con casillas, ni plantilla, ni tabla.", "Añade el recurso que sirve: una lista de comprobación, una plantilla o una tabla que quien lee pueda copiar y usar."))
  }

  const limpia = limpiarPalabra(r.palabra)
  if (!limpia || limpia !== r.palabra || limpia.length < 3 || limpia.length > 14) {
    hallazgos.push(hallazgo("palabra_clave", "frena", "palabra", `La palabra «${r.palabra}» no sirve para comentar.`, "Una sola palabra de 3 a 14 letras, en mayúsculas, sin tildes, espacios ni signos, ligada al tema."))
  } else if (ctx.palabrasOcupadas.includes(limpia)) {
    hallazgos.push(hallazgo("palabra_clave", "frena", "palabra", `«${limpia}» ya la usa otra pieza activa.`, `Elige otra. Ocupadas ahora: ${ctx.palabrasOcupadas.join(", ")}.`))
  }

  if (!r.dm.mensaje1 || !r.dm.boton || !r.dm.mensaje2) {
    hallazgos.push(hallazgo("dm_incompleto", "frena", "DM", "Al DM le falta el mensaje 1, el botón o el mensaje 2.", "Escribe los tres, más el cierre para cuando la palabra venza."))
  } else {
    if (!r.dm.mensaje2.includes("{enlace}")) {
      hallazgos.push(hallazgo("dm_incompleto", "frena", "DM, mensaje 2", "El mensaje 2 no lleva {enlace}.", "Pon {enlace} donde va el enlace al recurso: el motor lo cambia por la dirección con su seguimiento."))
    }
    if (r.dm.mensaje1.includes("{enlace}")) {
      hallazgos.push(hallazgo("dm_incompleto", "frena", "DM, mensaje 1", "El mensaje 1 lleva {enlace}: el recurso va en el mensaje 2.", "Quita {enlace} del mensaje 1. Si entrega la noticia, que enlace la fuente original."))
    }
    if (!normalizar(r.dm.mensaje1).includes(normalizar(limpia))) {
      hallazgos.push(hallazgo("dm_incompleto", "aviso", "DM, mensaje 1", `El mensaje 1 no nombra la palabra ${limpia}.`, `Empieza agradeciendo que comentó ${limpia}, para que se sepa de qué pieza viene.`))
    }
  }
  if (!r.promesa) hallazgos.push(hallazgo("dm_incompleto", "frena", "promesa", "Falta la promesa.", "Di en una frase qué recibe quien comenta: es lo que el cierre del carrusel puede prometer."))

  return hallazgos
}

const corto = (t: string, tope = 90) => (t.length > tope ? `${t.slice(0, tope - 1).trim()}…` : t)

// --------------------------------------------------------------------- el DM

/** La palabra deja de estar ocupada a los 30 dias de escribirse el recurso. */
export const DIAS_DE_PALABRA = 30

/**
 * El enlace del DM o del post con su seguimiento: de que red viene y de que
 * pieza. `utm_campaign` es corto y legible para leerlo en la analitica.
 */
export function enlaceConSeguimiento(url: string, o: { red: "instagram" | "linkedin"; medio: "dm" | "post"; angulo: string; palabra: string }): string {
  try {
    const u = new URL(url)
    u.searchParams.set("utm_source", o.red)
    u.searchParams.set("utm_medium", o.medio)
    u.searchParams.set("utm_campaign", `${o.angulo.slice(0, 8)}-${o.palabra.toLowerCase()}`)
    return u.toString()
  } catch {
    return url
  }
}

/** El mensaje 2 con su enlace, si ya hay URL. Sin URL, el texto con {enlace}. */
export function mensajeConEnlace(dm: Dm, url: string | null, angulo: string, palabra: string): string {
  if (!url) return dm.mensaje2
  return dm.mensaje2.replaceAll("{enlace}", enlaceConSeguimiento(url, { red: "instagram", medio: "dm", angulo, palabra }))
}

// ----------------------------------------------------------- para el carrusel

/**
 * Lo que el carrusel y el post saben del recurso: para que el cierre pida su
 * palabra y prometa solo lo que hay. Viaja en el input del buzon.
 */
export type RecursoParaPieza = {
  id: string
  tipo: TipoRecurso
  titular: string
  palabra: string
  promesa: string
  secciones: string[]
  url: string | null
}

export function recursoParaPieza(id: string, r: Recurso, url: string | null): RecursoParaPieza {
  return { id, tipo: r.tipo, titular: r.titular, palabra: r.palabra, promesa: r.promesa, secciones: r.secciones.map((s) => s.titulo), url }
}

/** El bloque del prompt del carrusel o del post: la palabra, la promesa y lo que trae. */
export function bloqueRecursoEscritor(r: RecursoParaPieza | null | undefined, red: "instagram" | "linkedin"): string {
  if (!r) return ""
  const comun = `EL RECURSO DE ESTA PIEZA (ya escrito)
- tipo: ${NOMBRE_TIPO_RECURSO[r.tipo].toLowerCase()}
- título: ${r.titular}
- lo que recibe quien lo pide: ${r.promesa}
- sus secciones: ${r.secciones.join(" · ")}`
  if (red === "instagram") {
    return `${comun}
- la palabra: ${r.palabra}
El cierre pide comentar exactamente ${r.palabra} y promete solo lo que dice "lo que recibe", con las palabras de esta pieza. El caption repite ${r.palabra} en mayúsculas y la misma promesa. No prometas secciones, listas ni plantillas que no estén arriba, ni plazos. Las láminas no adelantan el recurso entero: dan el gancho y el criterio.`
  }
  return `${comun}
En LinkedIn no se comenta una palabra: el post cierra invitando a leer el ${NOMBRE_TIPO_RECURSO[r.tipo].toLowerCase()}, con lo que trae, y el enlace va en el primer comentario o al final del post. Promete solo lo que dice "lo que recibe".`
}
