import { textoAHtml } from "./kit-modelo"

/**
 * Las figuras de una lamina: lo que se construye con datos dentro de ella
 * (unas barras, una tabla, una escalera de niveles, una encuesta...).
 *
 * El motor arma el HTML de cada figura siempre con la misma estructura y el kit
 * de la marca le pone el estilo: el importador escribe un CSS por figura
 * mirando como la dibuja el kit, y lo guarda en los trozos comunes del kit como
 * `figura_<tipo>`. Asi los datos (el ancho de una barra, cuantos cuadros, el
 * escapado) los resuelve el codigo, y el aspecto sale de la marca.
 *
 * Una plantilla enseña la figura con {{f:figura}} dentro de su hueco de tipo
 * "figura". Sin base de datos ni navegador: lo usan el importador, el
 * redactor y el carrusel.
 */

export const TIPOS_FIGURA = [
  "barras",
  "niveles",
  "flujo",
  "pastillas",
  "tabla",
  "cifras",
  "checklist",
  "opciones",
  "cuadricula",
  "citas",
  "interfaz",
] as const
export type TipoFigura = (typeof TIPOS_FIGURA)[number]

export const MODOS_INTERFAZ = ["comentario", "chat", "terminal", "navegador"] as const
export type ModoInterfaz = (typeof MODOS_INTERFAZ)[number]

export type ItemFigura = {
  /** La etiqueta, el paso, la opcion o la linea. */
  texto: string
  /** Una linea de apoyo debajo. */
  nota?: string
  /** El numero que mide (barras, cuadricula, el porcentaje de una opcion). */
  valor?: number
  /** Como se lee la cifra: "$3,98", "62.000", "29 %". */
  cifra?: string
  /** El que la figura destaca (el nivel actual, la barra que importa). */
  resaltado?: boolean
  /** En un checklist: si se cumple o no. */
  estado?: "si" | "no"
  /** En una cita: quien lo dijo. */
  autor?: string
  /** En una tabla: las celdas de la fila. */
  celdas?: string[]
}

export type Figura = {
  tipo: TipoFigura
  /** Encabezado: lo que miden las barras, la pregunta de la encuesta, la cuenta o el titulo de la ventana. */
  titulo?: string
  items: ItemFigura[]
  /** Tabla: las cabeceras. */
  columnas?: string[]
  /** Interfaz: que pantalla es. */
  modo?: ModoInterfaz
  /** Interfaz u opciones: el texto del boton. */
  boton?: string
  /** Cuadricula: cuanto vale cada cuadro. */
  por_cuadro?: number
  /** Un ejemplo para explicar, no un dato: la figura lo dice. */
  hipotetico?: boolean
  /** Una nota debajo de la figura (la escala, de donde sale). */
  pie?: string
}

/** Lo que cabe en cada figura: cuantos elementos y cuanto texto en cada uno. */
export const LIMITES_FIGURA: Record<TipoFigura, { min: number; max: number; texto: number; nota: number; titulo: number }> = {
  barras: { min: 2, max: 6, texto: 28, nota: 0, titulo: 60 },
  niveles: { min: 2, max: 5, texto: 26, nota: 60, titulo: 60 },
  flujo: { min: 2, max: 4, texto: 24, nota: 50, titulo: 60 },
  pastillas: { min: 2, max: 10, texto: 24, nota: 0, titulo: 60 },
  tabla: { min: 2, max: 5, texto: 24, nota: 0, titulo: 60 },
  cifras: { min: 1, max: 3, texto: 40, nota: 70, titulo: 60 },
  checklist: { min: 2, max: 4, texto: 50, nota: 60, titulo: 60 },
  opciones: { min: 2, max: 4, texto: 30, nota: 50, titulo: 80 },
  cuadricula: { min: 1, max: 3, texto: 30, nota: 0, titulo: 60 },
  citas: { min: 1, max: 3, texto: 120, nota: 0, titulo: 60 },
  interfaz: { min: 1, max: 6, texto: 80, nota: 0, titulo: 40 },
}

/** Para que sirve cada figura, como lo lee quien escribe y quien estudia el kit. */
export const DESCRIPCION_FIGURA: Record<TipoFigura, string> = {
  barras: "Barras que comparan cifras de lo mismo (precios, porcentajes, tiempos).",
  niveles: "Escalones o etapas en orden (niveles de permiso, semanas de una ruta); uno puede ir marcado como el actual.",
  flujo: "Un proceso de 2 a 4 pasos unidos por flechas: de qué se pasa a qué.",
  pastillas: "Etiquetas cortas en pastillas (herramientas, categorías); las que importan van resaltadas.",
  tabla: "Filas y columnas: antes y después, quién hace qué, una ficha con sus datos.",
  cifras: "De 1 a 3 cifras en tarjetas, cada una con lo que mide (el precio antes y después).",
  checklist: "Puntos con su marca de sí o no: lo que cumple y lo que no.",
  opciones: "Una pregunta con sus respuestas, como una encuesta; con porcentajes solo si son un dato.",
  cuadricula: "Una cantidad dibujada en cuadros, para ver la proporción entre dos o tres cifras.",
  citas: "Frases literales en burbujas o tarjetas, con quién las dijo.",
  interfaz: "Una pantalla: un comentario con su caja, un chat, una terminal con comandos o una página.",
}

/** La forma del JSON de cada figura, para el contrato de quien escribe. */
export const FORMA_FIGURA: Record<TipoFigura, string> = {
  barras: `{"tipo":"barras","titulo":"<qué se mide, con su unidad>","items":[{"texto":"<etiqueta>","valor":<número>,"cifra":"<cómo se lee: $3,98>","resaltado":<true en la que importa>}]}`,
  niveles: `{"tipo":"niveles","items":[{"texto":"<nivel o etapa>","nota":"<qué significa>","resaltado":<true en el actual>}]}`,
  flujo: `{"tipo":"flujo","items":[{"texto":"<paso>","nota":"<opcional>"}]}`,
  pastillas: `{"tipo":"pastillas","titulo":"<opcional>","items":[{"texto":"<etiqueta corta>","resaltado":<true en las que importan>}]}`,
  tabla: `{"tipo":"tabla","columnas":["<cabecera>","<cabecera>"],"items":[{"celdas":["<celda>","<celda>"],"resaltado":<true en la fila que importa>}]}`,
  cifras: `{"tipo":"cifras","items":[{"cifra":"<62.000, $19.900, 29 %>","texto":"<qué mide>","nota":"<opcional>","resaltado":<true en la que importa>}]}`,
  checklist: `{"tipo":"checklist","items":[{"texto":"<punto>","nota":"<opcional>","estado":"si"|"no"}]}`,
  opciones: `{"tipo":"opciones","titulo":"<la pregunta>","items":[{"texto":"<respuesta>","nota":"<opcional>","valor":<porcentaje, solo si es un dato>,"resaltado":<true en la que gana o la que recomienda la marca>}]}`,
  cuadricula: `{"tipo":"cuadricula","items":[{"texto":"<qué se cuenta>","valor":<número>,"cifra":"<cómo se lee: 6.000+>"}],"pie":"<cuánto vale cada cuadro>"}`,
  citas: `{"tipo":"citas","items":[{"texto":"<la frase, literal>","autor":"<quién, y su cargo>"}]}`,
  interfaz: `{"tipo":"interfaz","modo":"comentario"|"chat"|"terminal"|"navegador","titulo":"<la cuenta o el título de la ventana>","items":[{"texto":"<cada línea>"}],"boton":"<opcional: Publicar, Enviar>"}`,
}

// --------------------------------------------------------------- en el kit

/** El trozo comun del kit donde vive el CSS de cada figura. */
export const PREFIJO_FIGURA = "figura_"

/** Las figuras que el kit sabe dibujar: las que tienen su CSS. */
export function figurasDelKit(parciales: Record<string, string>): TipoFigura[] {
  return TIPOS_FIGURA.filter((t) => parciales[PREFIJO_FIGURA + t]?.trim())
}

/** El CSS de todas las figuras del kit, para la pagina de la lamina. */
export function cssDeFiguras(parciales: Record<string, string>): string {
  return figurasDelKit(parciales)
    .map((t) => parciales[PREFIJO_FIGURA + t])
    .join("\n")
}

// ------------------------------------------------------------------ parseo

const texto = (v: unknown, tope: number) => (typeof v === "string" ? v.trim().slice(0, tope) : "")

/** Un numero de lo que venga: 62000, "62.000", "3,98", "29 %". null si no hay. */
export function numeroDe(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string") return null
  const m = /-?\d[\d.,]*/.exec(v)
  if (!m) return null
  let s = m[0]
  // "62.000" y "1.250.000" son miles; "3,98" y "3.98", decimales.
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s) || /^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "")
  else s = s.replace(",", ".")
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Una figura escrita por el agente, normalizada; null si no sirve (tipo que no
 * existe, pocos elementos, barras sin numeros). Los textos se recortan a una
 * vez y media su limite: pasarse un poco lo absorbe la figura achicandose.
 */
export function parseFigura(bruto: unknown, permitidas?: readonly TipoFigura[]): Figura | null {
  if (!bruto || typeof bruto !== "object") return null
  const o = bruto as Record<string, unknown>
  const tipo = TIPOS_FIGURA.find((t) => t === o.tipo)
  if (!tipo || (permitidas && !permitidas.includes(tipo))) return null
  const lim = LIMITES_FIGURA[tipo]
  const tope = (n: number) => Math.ceil(n * 1.5)
  const columnas = Array.isArray(o.columnas)
    ? o.columnas.map((c) => texto(c, tope(lim.texto))).filter(Boolean).slice(0, 4)
    : []
  const items = (Array.isArray(o.items) ? o.items : [])
    .map((x): ItemFigura | null => {
      const it = (x ?? {}) as Record<string, unknown>
      const celdas = Array.isArray(it.celdas) ? it.celdas.map((c) => texto(c, tope(lim.texto))) : []
      const cifra = texto(it.cifra, 16)
      const valor = numeroDe(it.valor) ?? (tipo === "barras" || tipo === "cuadricula" ? numeroDe(cifra) : null)
      const salida: ItemFigura = { texto: texto(it.texto, tope(lim.texto)) }
      if (lim.nota && texto(it.nota, tope(lim.nota))) salida.nota = texto(it.nota, tope(lim.nota))
      if (valor !== null) salida.valor = valor
      if (cifra) salida.cifra = cifra
      if (it.resaltado === true) salida.resaltado = true
      if (it.estado === "si" || it.estado === "no") salida.estado = it.estado
      if (texto(it.autor, 60)) salida.autor = texto(it.autor, 60)
      if (celdas.some(Boolean)) salida.celdas = celdas
      return salida
    })
    .filter((it): it is ItemFigura => {
      if (!it) return false
      if (tipo === "tabla") return Boolean(it.celdas?.length)
      if (tipo === "cifras") return Boolean(it.cifra && it.texto)
      return Boolean(it.texto)
    })
    .slice(0, lim.max)
  if (items.length < lim.min) return null
  // Barras y cuadricula miden: sin un numero en cada elemento no dicen nada.
  if ((tipo === "barras" || tipo === "cuadricula") && items.some((it) => it.valor === undefined || it.valor < 0))
    return null
  if (tipo === "tabla" && columnas.length < 2) return null
  const figura: Figura = { tipo, items }
  if (texto(o.titulo, tope(lim.titulo))) figura.titulo = texto(o.titulo, tope(lim.titulo))
  if (tipo === "tabla") {
    figura.columnas = columnas
    for (const it of items) it.celdas = Array.from({ length: columnas.length }, (_, i) => it.celdas?.[i] ?? "")
  }
  if (tipo === "interfaz") figura.modo = MODOS_INTERFAZ.find((m) => m === o.modo) ?? "navegador"
  if (texto(o.boton, 20)) figura.boton = texto(o.boton, 20)
  const porCuadro = numeroDe(o.por_cuadro)
  if (tipo === "cuadricula" && porCuadro && porCuadro > 0) figura.por_cuadro = porCuadro
  if (o.hipotetico === true) figura.hipotetico = true
  if (texto(o.pie, 120)) figura.pie = texto(o.pie, 120)
  return figura
}

// ------------------------------------------------------------- comprobar

/** Las cifras de un texto, sin separadores, como las compara el maquetador. */
export function cifrasDe(s: string): string[] {
  return (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((c) => c.replace(/[.,]/g, ""))
}

/** Todo lo que se lee en una figura, para comparar con el guion. */
export function textoDeFigura(f: Figura): string {
  return [
    f.titulo,
    f.pie,
    f.boton,
    ...(f.columnas ?? []),
    ...f.items.flatMap((it) => [it.texto, it.nota, it.cifra, it.autor, ...(it.celdas ?? [])]),
  ]
    .filter(Boolean)
    .join(" ")
}

/**
 * Las cifras de la figura que no salen de `fuente` (la noticia y el guion). Los
 * valores de las barras cuentan aunque solo se dibujen: miden algo. La escala
 * de la cuadricula no, es como se dibuja.
 */
export function cifrasInventadas(f: Figura, fuente: string): string[] {
  const conocidas = new Set(cifrasDe(fuente))
  const valores = f.items.flatMap((it) =>
    it.valor !== undefined && !(it.cifra && numeroDe(it.cifra) === it.valor) ? [String(it.valor)] : []
  )
  const puestas = [...cifrasDe(textoDeFigura(f)), ...valores.flatMap(cifrasDe)]
  return [...new Set(puestas.filter((c) => !conocidas.has(c)))]
}

// -------------------------------------------------------------------- html

const t = (s: string | undefined) => textoAHtml(s ?? "")

/** Cuantos cuadros dibuja cada elemento de una cuadricula: nunca mas de 100 por grupo. */
export function cuadrosDe(f: Figura): number[] {
  const mayor = Math.max(...f.items.map((it) => it.valor ?? 0), 0)
  const porCuadro = f.por_cuadro && mayor / f.por_cuadro <= 100 ? f.por_cuadro : escalaDe(mayor)
  return f.items.map((it) => Math.max(0, Math.min(100, Math.round((it.valor ?? 0) / porCuadro))))
}

/** Una escala redonda (1, 2, 5, 10, 20, 50...) para que el mayor quepa en 100 cuadros. */
function escalaDe(mayor: number): number {
  if (mayor <= 100) return 1
  for (let base = 1; ; base *= 10) for (const k of [1, 2, 5]) if (mayor / (base * k) <= 100) return base * k
}

/**
 * La figura en HTML, con la estructura que espera el CSS del kit:
 *
 *   .fig.fig-<tipo>[data-fondo][data-modo]   la figura (--n: cuantos elementos)
 *     .fig-rotulo                            "Ejemplo hipotético", si lo es
 *     .fig-titulo                            el encabezado
 *     .fig-items > .fig-item                 cada elemento (--i: su numero, --v: su valor de 0 a 1)
 *         .es-resaltado .es-si .es-no        estados
 *         .fig-num .fig-texto .fig-nota .fig-cifra .fig-autor .fig-marca
 *         .fig-barra > .fig-relleno           (barras, opciones con porcentaje)
 *         .fig-cuadros > i.fig-cuadro         (cuadricula)
 *         .fig-celda                          (tabla; la cabecera es .fig-item.es-cabecera)
 *     .fig-flecha                            entre los pasos de un flujo
 *     .fig-accion > .fig-boton               el boton de una interfaz u opciones
 *     .fig-pie                               la nota de abajo
 */
export function figuraAHtml(f: Figura, fondo: string): string {
  const n = f.items.length
  const mayor = Math.max(...f.items.map((it) => it.valor ?? 0), 0)
  const cuadros = f.tipo === "cuadricula" ? cuadrosDe(f) : []
  const item = (it: ItemFigura, i: number, partes: string[]) => {
    const clases = [
      "fig-item",
      it.resaltado ? "es-resaltado" : "",
      it.estado === "si" ? "es-si" : it.estado === "no" ? "es-no" : "",
    ]
      .filter(Boolean)
      .join(" ")
    const v =
      f.tipo === "opciones"
        ? it.valor !== undefined
          ? Math.max(0, Math.min(1, it.valor / 100))
          : null
        : it.valor !== undefined && mayor > 0
          ? it.valor / mayor
          : null
    const estilo = `--i:${i + 1}${v !== null ? `;--v:${Math.round(v * 1000) / 1000}` : ""}`
    return `<div class="${clases}" style="${estilo}">${partes.filter(Boolean).join("")}</div>`
  }
  const num = (i: number) => `<span class="fig-num">${i + 1}</span>`
  const nota = (it: ItemFigura) => (it.nota ? `<span class="fig-nota">${t(it.nota)}</span>` : "")
  const cifra = (it: ItemFigura) => (it.cifra ? `<span class="fig-cifra">${t(it.cifra)}</span>` : "")
  const barra = '<span class="fig-barra"><span class="fig-relleno"></span></span>'

  let cuerpo = ""
  switch (f.tipo) {
    case "barras":
      cuerpo = f.items
        .map((it, i) => item(it, i, [`<span class="fig-texto">${t(it.texto)}</span>`, barra, cifra(it) || `<span class="fig-cifra">${it.valor}</span>`]))
        .join("")
      break
    case "niveles":
    case "flujo":
      cuerpo = f.items
        .map((it, i) => {
          const el = item(it, i, [num(i), `<span class="fig-texto">${t(it.texto)}</span>`, nota(it)])
          return f.tipo === "flujo" && i < n - 1 ? `${el}<span class="fig-flecha" aria-hidden="true"></span>` : el
        })
        .join("")
      break
    case "pastillas":
      cuerpo = f.items.map((it, i) => item(it, i, [`<span class="fig-texto">${t(it.texto)}</span>`])).join("")
      break
    case "tabla": {
      const fila = (celdas: string[], clase: string, i: number, resaltada = false) =>
        `<div class="fig-item ${clase}${resaltada ? " es-resaltado" : ""}" style="--i:${i}">${celdas.map((c) => `<span class="fig-celda">${t(c)}</span>`).join("")}</div>`
      cuerpo =
        fila(f.columnas ?? [], "es-cabecera", 0) +
        f.items.map((it, i) => fila(it.celdas ?? [], "es-fila", i + 1, it.resaltado)).join("")
      break
    }
    case "cifras":
      cuerpo = f.items.map((it, i) => item(it, i, [cifra(it), `<span class="fig-texto">${t(it.texto)}</span>`, nota(it)])).join("")
      break
    case "checklist":
      cuerpo = f.items
        .map((it, i) => item(it, i, ['<span class="fig-marca" aria-hidden="true"></span>', `<span class="fig-texto">${t(it.texto)}</span>`, nota(it)]))
        .join("")
      break
    case "opciones":
      cuerpo = f.items
        .map((it, i) =>
          item(it, i, [
            num(i),
            `<span class="fig-texto">${t(it.texto)}</span>`,
            nota(it),
            ...(it.valor !== undefined ? [barra, cifra(it) || `<span class="fig-cifra">${it.valor} %</span>`] : []),
          ])
        )
        .join("")
      break
    case "cuadricula":
      cuerpo = f.items
        .map((it, i) =>
          item(it, i, [
            cifra(it),
            `<span class="fig-texto">${t(it.texto)}</span>`,
            `<span class="fig-cuadros">${'<i class="fig-cuadro"></i>'.repeat(cuadros[i])}</span>`,
          ])
        )
        .join("")
      break
    case "citas":
      cuerpo = f.items
        .map((it, i) => item(it, i, [`<span class="fig-texto">${t(it.texto)}</span>`, it.autor ? `<span class="fig-autor">${t(it.autor)}</span>` : ""]))
        .join("")
      break
    case "interfaz":
      cuerpo = f.items.map((it, i) => item(it, i, [`<span class="fig-texto">${t(it.texto)}</span>`])).join("")
      break
  }
  return [
    `<div class="fig fig-${f.tipo}" data-figura="${f.tipo}" data-fondo="${fondo}"${f.modo ? ` data-modo="${f.modo}"` : ""} style="--n:${n}">`,
    f.hipotetico ? '<div class="fig-rotulo">Ejemplo hipotético</div>' : "",
    f.titulo ? `<div class="fig-titulo">${t(f.titulo)}</div>` : "",
    `<div class="fig-items">${cuerpo}</div>`,
    f.boton ? `<div class="fig-accion"><span class="fig-boton">${t(f.boton)}</span></div>` : "",
    f.pie ? `<div class="fig-pie">${t(f.pie)}</div>` : "",
    "</div>",
  ].join("")
}

// ----------------------------------------------------------------- muestras

/**
 * Una figura de cada tipo con datos neutros, para que el importador escriba y
 * pruebe su CSS: "normal" como una lamina tipica, "largo" con todo al limite y
 * "corto" con lo minimo.
 */
export function figuraDeMuestra(tipo: TipoFigura, modo: "normal" | "largo" | "corto" = "normal"): Figura {
  const lim = LIMITES_FIGURA[tipo]
  const cuantos = modo === "largo" ? lim.max : modo === "corto" ? lim.min : Math.min(lim.max, Math.max(lim.min, 4))
  const largo = (base: string, tope: number) => {
    if (modo !== "largo") return base
    let s = base
    while (s.length < tope) s += ` ${base}`
    return s.slice(0, tope).replace(/\s+\S*$/, "")
  }
  const etiquetas = ["Primera opción", "Segunda opción", "Tercera opción", "Cuarta opción", "Quinta opción", "Sexta opción", "Séptima", "Octava", "Novena", "Décima"]
  const items = (f: (i: number) => ItemFigura) => Array.from({ length: cuantos }, (_, i) => f(i))
  switch (tipo) {
    case "barras":
      return {
        tipo,
        titulo: largo("Costo por tarea, en dólares", lim.titulo),
        items: items((i) => ({ texto: largo(etiquetas[i], lim.texto), valor: [5.98, 3.98, 3.26, 1.98, 1.2, 0.8][i], cifra: `$${[5.98, 3.98, 3.26, 1.98, 1.2, 0.8][i].toFixed(2).replace(".", ",")}`, resaltado: i === 1 })),
      }
    case "niveles":
      return { tipo, items: items((i) => ({ texto: largo(["Ver", "Proponer", "Actuar con aprobación", "Actuar solo", "Delegar"][i], lim.texto), nota: largo("Lo que puede hacer en este nivel", lim.nota), resaltado: i === 2 })) }
    case "flujo":
      return { tipo, items: items((i) => ({ texto: largo(["Medir hoy", "Automatizar", "Medir igual", "Comparar"][i], lim.texto), resaltado: i === 1 })) }
    case "pastillas":
      return { tipo, items: items((i) => ({ texto: largo(etiquetas[i], lim.texto), resaltado: i % 3 === 0 })) }
    case "tabla":
      return {
        tipo,
        columnas: ["Paso", "Antes", "Después"].map((c) => largo(c, lim.texto)),
        items: items((i) => ({ texto: "", celdas: [largo(`Tarea ${i + 1}`, lim.texto), largo(`${25 - i} min`, lim.texto), largo(`${8 - i} min`, lim.texto)], resaltado: i === 0 })),
      }
    case "cifras":
      return { tipo, items: items((i) => ({ cifra: ["$19.900", "$39.800", "2,3×"][i], texto: largo(["Hasta el 30 de noviembre", "Desde el 1 de diciembre", "Lo que sube"][i], lim.texto), nota: largo("Por cada mil tareas", lim.nota), resaltado: i === 1 })) }
    case "checklist":
      return { tipo, items: items((i) => ({ texto: largo(["Se repite varias veces por semana", "Empieza y termina de forma clara", "Puedes ver casos reales", "Alguien lo revisa", "Tiene un dueño"][i], lim.texto), nota: largo("Una línea que lo explica", lim.nota), estado: i === 2 ? "no" : "si" })) }
    case "opciones":
      return { tipo, titulo: largo("¿Alguien eligió hacer esto?", lim.titulo), items: items((i) => ({ texto: largo(["Sí", "No", "A veces", "No lo sé"][i], lim.texto), nota: largo("Lo que significa esa respuesta", lim.nota), resaltado: i === 1 })) }
    case "cuadricula":
      return { tipo, items: items((i) => ({ texto: largo(["Primera cantidad", "Segunda cantidad", "Tercera cantidad"][i], lim.texto), valor: [6000, 4000, 1500][i], cifra: ["6.000+", "4.000+", "1.500"][i] })), pie: "Cada cuadro son 100" }
    case "citas":
      return { tipo, items: items((i) => ({ texto: largo(["“Se siente más rápido.”", "“Parece que hay menos errores.”", "“Nadie lo eligió.”", "“Lo revisamos a mano.”"][i], lim.texto), autor: largo("Persona del equipo", 50) })) }
    case "interfaz":
      return { tipo, modo: "terminal", titulo: largo("terminal", lim.titulo), items: items((i) => ({ texto: largo(["$ claude --plugin-dir ./mod", "Mod cargado: freno de mano", "¿Seguir con este comando?", "rm -rf ./clientes", "Bloqueado.", "Listo."][i], lim.texto) })), boton: "Permitir" }
  }
}
