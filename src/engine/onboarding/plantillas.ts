import { llamarClaude, parsearJSONDeClaude, type Bloque } from "../claude/messages"
import { activarKit, cargarKit, crearKit, guardarPlantilla, subirArchivoKit } from "../marca/kit"
import { bajarDeGoogle } from "../marca/kit-fuentes"
import { LENGUAJE } from "../marca/kit-importar"
import {
  FORMATOS,
  HUECOS_COMUNES,
  paginaDeLamina,
  parseHuecos,
  rellenarPlantilla,
  revisarCss,
  revisarPlantilla,
  TIPOS_COMUNES,
  type ColorKit,
  type DatosLamina,
  type FotoPlantilla,
  type Fondo,
  type Hueco,
  type SistemaVisual,
} from "../marca/kit-modelo"
import { dibujarLaminas, type LaminaDibujada } from "../render/navegador"
import { supabaseAdmin } from "../supabase-admin"
import type { LogoBajado } from "./archivos"
import type { Brief } from "./brief"

/**
 * Las plantillas de una marca, generadas a partir de su brief.
 *
 * No hay kit de fabrica: cada marca recibe las suyas, escritas desde su identidad
 * visual, con sus fuentes reales y sus colores. Usa el mismo lenguaje y las mismas
 * comprobaciones del importador, asi que el resultado es un kit normal: se ve, se
 * edita y se dibuja como cualquier otro. Una sola llamada escribe todo el sistema a
 * la vez para que las laminas se vean de la misma familia.
 */

const MODELO = "claude-sonnet-5-5"
const MAX_TOKENS = 16_000
const PLAZO_MS = 200_000
const PESOS = [400, 700]
const TIPOS = ["portada", "idea", "lista", "dato", "tesis", "criterio", "cierre"] as const

export type Muestra = Pick<DatosLamina, "textos" | "listas">

export type PlantillaEscrita = {
  tipo: string
  nombre: string
  cuando_usar: string
  fondo: Fondo
  foto: FotoPlantilla
  huecos: Hueco[]
  html: string
  muestra: Muestra
}

export type DisenoMarca = { css: string; parciales: Record<string, string>; plantillas: PlantillaEscrita[]; notas: string }

const SISTEMA_DISENO = `Eres un director de arte de primer nivel. Diseñas el sistema de láminas de carrusel de Instagram de una marca: 1080 por 1350 px. No es una plantilla genérica: tiene que verse como si un estudio lo hubiera hecho solo para esta marca, a partir de su personalidad, su estilo y sus colores.

Criterio:
- Una idea gráfica fuerte y repetible que sea de esta marca. Nada de tarjetas con sombra, degradados de plantilla ni decoración gratuita.
- Jerarquía contundente: títulos grandes, mucho aire, letra de lectura mínima de 32 px y títulos de 84 px o más en la portada.
- Usa la paleta con intención, alternando fondos según el ritmo que se te da. El contraste de texto siempre tiene que leerse.
- Todas las láminas son de la misma familia, pero cada tipo se compone distinto.
- La lámina se ocupa entera. Los textos reales suelen ser cortos: nunca dejes todo pegado arriba con media lámina vacía debajo. Reparte el contenido en el alto, centra el bloque con intención o haz que un elemento gráfico de la marca ocupe el resto.
- El resaltado no puede tapar la línea de arriba ni la de abajo: deja interlineado suficiente.
- Los títulos de portada y de cierre se encogen si hace falta: márcalos con data-encoger y deja que el bloque de texto crezca hacia arriba, sin chocar con lo de abajo.
- Ningún adorno cruza un texto: una línea, una forma o una figura va en una zona que los títulos largos no alcancen. Piensa en el texto más largo que quepa, no en tu muestra.
- Ningún elemento fijo se pisa con otro: el contador, los puntos, la firma y un "desliza" van cada uno en su sitio. Si la portada lleva "desliza", el contador no va en esa misma esquina.
- Cada bloque de texto queda entero dentro de un solo fondo: un título nunca se parte entre dos colores ni cruza el borde de un panel. El texto empuja al panel, no al revés: usa flex y evita alturas fijas en lo que lleva texto.
- El contador y la firma se leen siempre, también sobre una foto: van sobre la zona oscurecida o con fondo propio. El contador nunca se parte en dos líneas.
- Ninguna palabra se parte a la mitad: el resaltado es texto en línea, sin inline-block, y si un título no cabe baja de tamaño.
- Las capturas de la web dan carácter, no contenido: ninguna lámina lleva menús, palabras de navegación, botones ni textos sacados de la web.
- Texto real al diseñar: ningún lorem ipsum.`

function contrato(conLogo: boolean): string {
  const tipos = TIPOS.map((t) => `- ${t}: ${TIPOS_COMUNES[t]}`).join("\n")
  return `Tipos de lámina que tienes que escribir, uno por cada uno:
${tipos}

${LENGUAJE}

Huecos con nombre común: ${Object.entries(HUECOS_COMUNES)
    .filter(([k]) => k !== "figura")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ")}
Cada hueco: {"nombre","tipo":"texto"|"lista"|"numero","max":<caracteres que caben sin romper el diseño>,"min_items":<lista>,"max_items":<lista>,"obligatorio":true|false,"resaltado":true|false,"descripcion":"..."}.
Todas las plantillas tienen un hueco de texto llamado exactamente "titulo", sin importar qué tan corto sea su papel en esa lámina. "lista" lleva además hueco "items" de tipo lista. "dato" huecos "numero" y "etiqueta". "cierre" huecos "titulo", "cta" y "motivo".
Las fotos son parte de esta marca, no un extra. La "portada" y al menos otras dos plantillas (por ejemplo "idea", "tesis" o "cierre") llevan foto opcional, con {{?foto}}...{{/foto}} y {{a:foto}}, y "foto":{"usa":"opcional"}. {{?foto}}...{{/foto}} solo aparece si hay foto y {{^foto}}...{{/foto}} solo si no la hay.
Casi todos los huecos pueden llegar vacíos: un botón, una etiqueta o un marco que dependa de un hueco va dentro de {{?hueco}}...{{/hueco}}, para que nunca quede una caja vacía.
Cada una tiene que verse bien con foto y sin ella, porque a veces no habrá foto: un marco o una tarjeta pensados para la foto van dentro de {{?foto}}, para que nunca quede un recuadro vacío. Con foto, la foto se tiene que ver y el texto se tiene que leer. Hay dos maneras: foto a sangre, con todo el texto (antetítulo incluido) en un solo bloque pegado al borde de abajo o de arriba, y el degradado como fondo de ese mismo bloque, nunca como una capa aparte de alto fijo: así, si el título crece, el degradado crece con él y ningún texto queda sobre la foto limpia. El degradado va del color oscuro de la marca, sólido detrás del texto, a transparente en un espacio de 200 px por encima del bloque. La foto tiene que quedar libre en al menos el 40 % de la lámina: si el bloque va abajo, pon en la sección data-seguro='80,540,1000,1270' y en el título data-encoger='100:60', y el título bajará de tamaño hasta caber sin subir de ahí. La otra manera es foto en una banda que no se pise con el texto. Nunca un velo parejo sobre toda la foto, ni tintes, filter, blur o mix-blend-mode. Usa object-fit: cover. En "foto" di cómo se usa: "uso" portada, fondo, inserto o cierre; "tono" oscura, clara o cualquiera; "espacio" arriba, abajo, centro o cualquiera.
${
    conLogo
      ? "La marca tiene logo y se usa con <img src='{{a:logo}}' data-zona='logo'>, con un alto de entre 48 y 90 px y sin cambiarle el color. Va pensado para fondo claro: ponlo solo sobre fondo claro liso. En las láminas de fondo oscuro, de acento o con foto detrás firma con el nombre escrito en su fuente de títulos; nunca pongas el logo encima de una foto."
      : "No uses {{a:...}} de logos: la marca firma con su nombre escrito, fijo en un trozo común, en su fuente de títulos."
  }

Responde SOLO con este JSON, y dentro de las cadenas usa comillas simples en el HTML para no romperlo:
{"notas":"la idea gráfica en una línea","css":"CSS común: variables, base de la lámina, tipografía, .resalte y lo compartido","parciales":{"marco":"HTML del marco común con la firma y el contador"},"plantillas":[{"tipo":"portada","nombre":"","cuando_usar":"","fondo":"claro|oscuro|acento","foto":{"usa":"no|opcional","uso":"portada","tono":"cualquiera","espacio":"cualquiera","orientacion":"vertical"},"huecos":[],"html":"<style>lo propio</style><section data-lamina data-seguro='80,80,1000,1270'>...</section>","muestra":{"textos":{"<hueco>":"texto real de esta marca"},"listas":{"<hueco>":["..."]}}}]}`
}

function pedido(brief: Brief, errores: string, conLogo: boolean): string {
  const v = brief.visual
  return `LA MARCA
Nombre con el que firma: ${brief.perfil.nombre}
Qué hace: ${brief.perfil.que_hace}
Mensaje central: ${brief.perfil.mensaje_central}
Esencia (para sacar la idea gráfica): ${brief.esencia.slice(0, 1800)}
Cómo suena: ${brief.perfil.voz_si}

IDENTIDAD VISUAL
Colores: principal ${v.paleta.principal}, acento ${v.paleta.acento}, fondo claro ${v.paleta.fondo_claro}, fondo oscuro ${v.paleta.fondo_oscuro}, texto ${v.paleta.texto}
Fuentes ya cargadas: "${v.fuentes.titulos}" para títulos y "${v.fuentes.texto}" para texto, en pesos ${PESOS.join(" y ")}.
Estilo gráfico: ${v.estilo}
Ritmo de fondos del carrusel: ${v.ritmo.join(", ")}

Ideas de esta marca, para los textos de muestra: ${brief.ideas.slice(0, 5).join(" / ")}

${contrato(conLogo)}${errores ? `\n\nTu intento anterior falló. Corrige esto: ${errores}` : ""}`
}

const texto = (v: unknown) => (typeof v === "string" ? v : "")

function parseFoto(v: unknown): FotoPlantilla {
  const o = (v ?? {}) as Record<string, string>
  return {
    usa: o.usa === "opcional" || o.usa === "obligatoria" ? o.usa : "no",
    uso: o.uso === "fondo" || o.uso === "cierre" || o.uso === "inserto" ? o.uso : "portada",
    tono: o.tono === "oscura" || o.tono === "clara" ? o.tono : "cualquiera",
    espacio: o.espacio === "arriba" || o.espacio === "abajo" || o.espacio === "centro" ? o.espacio : "cualquiera",
    orientacion: o.orientacion === "apaisada" || o.orientacion === "cuadrada" || o.orientacion === "cualquiera" ? o.orientacion : "vertical",
  }
}

/**
 * Lo unico sin lo que una lamina no se sostiene. El guion no siempre trae el resto, y si
 * un cierre exige un "motivo" que no llega, ninguna plantilla sirve y la pieza entera cae
 * al respaldo. Salvo donde manda otro hueco, basta con el titulo, que toda plantilla tiene.
 */
const OBLIGATORIOS: Record<string, string[]> = { lista: ["items"], dato: ["numero"] }

export function soloLoNecesario(tipo: string, huecos: Hueco[]): Hueco[] {
  const necesarios = OBLIGATORIOS[tipo] ?? ["titulo"]
  return huecos.map((h) => ({ ...h, obligatorio: necesarios.includes(h.nombre) }))
}

function parseDiseno(bruto: unknown): DisenoMarca {
  const j = (bruto ?? {}) as Record<string, unknown>
  const lista = Array.isArray(j.plantillas) ? (j.plantillas as Record<string, unknown>[]) : []
  const parciales = Object.fromEntries(
    Object.entries((j.parciales ?? {}) as Record<string, unknown>).map(([k, v]) => [k, texto(v)])
  )
  return {
    css: texto(j.css),
    notas: texto(j.notas),
    parciales,
    plantillas: lista.map((p) => {
      const m = (p.muestra ?? {}) as Muestra
      return {
        tipo: texto(p.tipo),
        nombre: texto(p.nombre) || texto(p.tipo),
        cuando_usar: texto(p.cuando_usar) || TIPOS_COMUNES[texto(p.tipo)] || "",
        fondo: (["claro", "oscuro", "acento", "foto"].includes(texto(p.fondo)) ? p.fondo : "oscuro") as Fondo,
        foto: parseFoto(p.foto),
        huecos: soloLoNecesario(texto(p.tipo), parseHuecos(p.huecos)),
        html: sinCajasVacias(texto(p.html), soloLoNecesario(texto(p.tipo), parseHuecos(p.huecos))),
        muestra: { textos: m.textos ?? {}, listas: m.listas ?? {} },
      }
    }),
  }
}

const LOGO = /<img\b[^>]*\{\{a:logo\}\}[^>]*>/g

/** El logo solo va en las laminas sin foto. Dentro de {{^foto}} ya esta bien puesto. */
const logoSinFoto = (html: string) =>
  html.replace(/\{\{([?^])foto\}\}[\s\S]*?\{\{\/foto\}\}|<img\b[^>]*\{\{a:logo\}\}[^>]*>/g, (m: string, signo?: string) =>
    signo === "?" ? m.replace(LOGO, "") : signo === "^" ? m : `{{^foto}}${m}{{/foto}}`
  )

/**
 * El logo viene pensado para fondo claro: sobre una foto o un fondo oscuro no se ve. El
 * prompt ya lo pide, pero repetir el diseño no cabe en los 5 minutos, asi que aqui se
 * corrige en vez de rechazarlo. Una lamina sin fondo claro saca el logo tambien del marco.
 */
export function logoEnSuSitio(d: DisenoMarca): DisenoMarca {
  const parciales = Object.fromEntries(Object.entries(d.parciales).map(([k, v]) => [k, logoSinFoto(v)]))
  const conMarcoSinLogo = (html: string) =>
    html.replace(/\{\{p:(\w+)\}\}/g, (m: string, k: string) => (d.parciales[k]?.includes("{{a:logo}}") ? d.parciales[k].replace(LOGO, "") : m))
  return {
    ...d,
    css: `${d.css}\n[data-lamina]{overflow-wrap:normal;word-break:normal;hyphens:none}`,
    parciales,
    plantillas: d.plantillas.map((p) => ({
      ...p,
      html: p.fondo === "claro" ? logoSinFoto(p.html) : conMarcoSinLogo(p.html).replace(LOGO, ""),
    })),
  }
}

/** Una caja cuyo unico contenido es un hueco opcional no se dibuja si el hueco llega vacio. */
export function sinCajasVacias(html: string, huecos: Hueco[]): string {
  return html.replace(/\{\{[?^](\w+)\}\}[\s\S]*?\{\{\/\1\}\}|<(\w+)\b[^>]*>\s*\{\{t:(\w+)\}\}\s*<\/\2>/g, (m: string, _b?: string, _e?: string, hueco?: string) =>
    hueco && huecos.some((h) => h.nombre === hueco && !h.obligatorio) ? `{{?${hueco}}}${m}{{/${hueco}}}` : m
  )
}

function erroresDe(d: DisenoMarca, conLogo: boolean): string[] {
  const errores = [...revisarCss(d.css), ...Object.values(d.parciales).flatMap(revisarCss)]
  for (const tipo of TIPOS) if (!d.plantillas.some((p) => p.tipo === tipo)) errores.push(`Falta la plantilla "${tipo}".`)
  for (const p of d.plantillas) {
    // Una lamina con titulo no entra en una plantilla sin ese hueco: la pieza cae al respaldo.
    if (!p.huecos.some((h) => h.nombre === "titulo")) errores.push(`${p.tipo}: falta el hueco "titulo", con ese nombre exacto.`)
    const malos = revisarPlantilla(p.html, p.huecos, { papeles: conLogo ? ["logo"] : [], parciales: Object.keys(d.parciales) })
    errores.push(...malos.map((e) => `${p.tipo}: ${e}`))
  }
  return errores
}

/** Las fuentes de la marca, de Google. Si una no existe, se avisa y cae a la otra. */
export async function fuentesDeMarca(brief: Brief): Promise<{ familia: string; peso: number; datos: Buffer }[]> {
  const familias = [...new Set([brief.visual.fuentes.titulos, brief.visual.fuentes.texto])]
  const salida = await Promise.all(
    familias.flatMap((familia) =>
      PESOS.map(async (peso) => {
        const datos = await bajarDeGoogle(familia, peso)
        return datos ? { familia, peso, datos } : null
      })
    )
  )
  return salida.filter((f): f is { familia: string; peso: number; datos: Buffer } => f !== null)
}

function cssFuentes(fuentes: { familia: string; peso: number; datos: Buffer }[]): string {
  return fuentes
    .map((f) => `@font-face{font-family:"${f.familia}";font-weight:${f.peso};src:url(data:font/ttf;base64,${f.datos.toString("base64")}) format("truetype")}`)
    .join("\n")
}

/** Dibuja cada plantilla con su muestra: la prueba de que funciona de verdad. */
export async function dibujarDiseno(
  d: DisenoMarca,
  fuentes: { familia: string; peso: number; datos: Buffer }[],
  logo?: LogoBajado | null
): Promise<{ tipo: string; lamina: LaminaDibujada }[]> {
  const css = cssFuentes(fuentes)
  const archivos: Record<string, string> = logo ? { logo: `data:${logo.mime};base64,${logo.datos.toString("base64")}` } : {}
  const total = d.plantillas.length
  const htmls = d.plantillas.map((p, i) =>
    paginaDeLamina(d.css, css, rellenarPlantilla(p.html, { ...p.muestra, n: i + 1, total }, archivos, d.parciales, ""), "carrusel_4x5")
  )
  const laminas = await dibujarLaminas(htmls, FORMATOS.carrusel_4x5)
  return laminas.map((lamina, i) => ({ tipo: d.plantillas[i].tipo, lamina }))
}

/** Escribe y comprueba el sistema de plantillas. No guarda nada. */
export async function disenarPlantillas(accountId: string, brief: Brief, referencias: Bloque[] = [], conLogo = false): Promise<DisenoMarca> {
  let errores = ""
  let ultimo = "sin respuesta"
  for (let intento = 0; intento < 3; intento++) {
    const r = await llamarClaude({
      paso: "onboarding-plantillas",
      accountId,
      model: MODELO,
      system: SISTEMA_DISENO,
      prompt: pedido(brief, errores, conLogo),
      maxTokens: MAX_TOKENS,
      timeoutMs: PLAZO_MS,
      ...(referencias.length
        ? { bloques: [{ tipo: "texto" as const, texto: "Capturas de la web de esta marca: toma de ahí su carácter. No copies su composición, su menú ni sus textos." }, ...referencias] }
        : {}),
    })
    if (!r.ok) {
      ultimo = r.error
      continue
    }
    try {
      const d = logoEnSuSitio(parseDiseno(parsearJSONDeClaude(r.texto)))
      const malos = erroresDe(d, conLogo)
      if (!malos.length) return d
      errores = malos.slice(0, 12).join(" ")
      ultimo = errores
      console.error("[onboarding] Plantillas rechazadas:", errores)
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e)
      errores = "El JSON llegó roto. Usa comillas simples dentro del HTML y escapa bien."
    }
  }
  throw new Error(`No salieron las plantillas: ${ultimo}`)
}

export function sistemaDe(brief: Brief, conLogo = false): SistemaVisual {
  const p = brief.visual.paleta
  const colores: ColorKit[] = [
    { nombre: "Principal", valor: p.principal, papel: "principal" },
    { nombre: "Acento", valor: p.acento, papel: "acento" },
    { nombre: "Fondo claro", valor: p.fondo_claro, papel: "fondo claro" },
    { nombre: "Fondo oscuro", valor: p.fondo_oscuro, papel: "fondo oscuro" },
    { nombre: "Texto", valor: p.texto, papel: "texto" },
  ]
  return {
    colores,
    fuentes: [
      { papel: "titulos", familia: brief.visual.fuentes.titulos },
      { papel: "texto", familia: brief.visual.fuentes.texto },
    ],
    logos: conLogo ? { claro: "logo" } : {},
    ritmo: brief.visual.ritmo,
    reglas: { letra_minima: 32, notas: [brief.visual.estilo.slice(0, 400)] },
    fotos_por_carrusel: 3,
    fotos_siempre: true,
  }
}

/** Convierte el diseño en el kit activo de la marca. */
export async function instalarKit(accountId: string, brief: Brief, d: DisenoMarca, logo?: LogoBajado | null): Promise<string> {
  const kit = await crearKit(accountId, {
    nombre: `Kit de ${brief.perfil.nombre}`,
    origen: "Generado en el onboarding a partir del brief.",
    sistema: sistemaDe(brief, Boolean(logo)),
    css: d.css,
    parciales: d.parciales,
  })
  if (logo) await subirArchivoKit(accountId, kit.id, { papel: "logo", tipo: "logo", contenido: logo.datos, mime: logo.mime, nombre_original: "logo" })
  const fuentes = await fuentesDeMarca(brief)
  await Promise.all(
    fuentes.map((f) =>
      subirArchivoKit(accountId, kit.id, {
        papel: `fuente_${f.familia.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}_${f.peso}`,
        tipo: "fuente",
        contenido: f.datos,
        mime: "font/ttf",
        nombre_original: `${f.familia}-${f.peso}.ttf`,
        meta: { familia: f.familia, peso: f.peso, estilo: "normal" },
      })
    )
  )
  for (const [orden, p] of d.plantillas.entries()) {
    const creada = await guardarPlantilla(accountId, kit.id, {
      tipo: p.tipo,
      nombre: p.nombre,
      cuando_usar: p.cuando_usar,
      html: p.html,
      huecos: p.huecos,
      foto: p.foto,
      fondo: p.fondo,
      cta_tipos: [],
      orden,
    })
    const { error } = await supabaseAdmin().from("brand_kit_plantillas").update({ estado: "aprobada" }).eq("id", creada.id)
    if (error) throw new Error(`No se pudo aprobar la plantilla: ${error.message}`)
  }
  if (!(await cargarKit(accountId, kit.id))) throw new Error("El kit no quedó guardado.")
  await activarKit(accountId, kit.id)
  return kit.id
}
