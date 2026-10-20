/**
 * El perfil de marca: quien es la marca y como escribe.
 *
 * Es lo que hace que una cuenta suene a si misma y no a la fabrica. Los prompts
 * de los agentes traen el oficio —estructura, rigor, formato— y esto les dice
 * para quien escriben. Vive en `brand_profile`, una fila por cuenta, y lo llena
 * la propia marca desde Configuracion > Marca.
 *
 * La fila no existe hasta el primer guardado: una cuenta nueva no hereda nada
 * de nadie y, mientras tanto, `perfilDe` devuelve el perfil vacio, con el que
 * todo funciona con valores generales.
 *
 * Aqui solo van los tipos, los topes y la limpieza, sin acceso a la base, para
 * que la interfaz pueda importarlos. La lectura y el guardado estan en perfil.ts.
 */

export const IDIOMAS_MARCA = ["es", "en"] as const
export type IdiomaMarca = (typeof IDIOMAS_MARCA)[number]

export const NOMBRE_IDIOMA: Record<IdiomaMarca, string> = { es: "español", en: "inglés" }

/** Los paises que se ofrecen. "Sin pais" para una marca que no escribe para uno. */
export const PAISES: { codigo: string; nombre: string }[] = [
  { codigo: "AR", nombre: "Argentina" },
  { codigo: "BO", nombre: "Bolivia" },
  { codigo: "BR", nombre: "Brasil" },
  { codigo: "CL", nombre: "Chile" },
  { codigo: "CO", nombre: "Colombia" },
  { codigo: "CR", nombre: "Costa Rica" },
  { codigo: "EC", nombre: "Ecuador" },
  { codigo: "SV", nombre: "El Salvador" },
  { codigo: "ES", nombre: "España" },
  { codigo: "US", nombre: "Estados Unidos" },
  { codigo: "GT", nombre: "Guatemala" },
  { codigo: "HN", nombre: "Honduras" },
  { codigo: "MX", nombre: "México" },
  { codigo: "NI", nombre: "Nicaragua" },
  { codigo: "PA", nombre: "Panamá" },
  { codigo: "PY", nombre: "Paraguay" },
  { codigo: "PE", nombre: "Perú" },
  { codigo: "DO", nombre: "República Dominicana" },
  { codigo: "UY", nombre: "Uruguay" },
  { codigo: "VE", nombre: "Venezuela" },
]

export const nombrePais = (codigo: string | null) =>
  codigo ? (PAISES.find((p) => p.codigo === codigo)?.nombre ?? codigo) : null

/**
 * Cuanto cabe en cada campo. Todo entra en cada prompt, asi que un perfil sin
 * tope encarece cada llamada. Son los mismos que impone la base.
 */
export const TOPES_PERFIL = {
  nombre: 60,
  handle: 40,
  que_hace: 600,
  mensaje_central: 300,
  voz_si: 1200,
  voz_no: 1200,
  reglas: 2000,
  temas_vetados: 1200,
  frases: 50,
  frase: 80,
} as const

export type PerfilMarca = {
  nombre: string
  /** Sin la arroba: "plogy". La interfaz y el carrusel la anteponen. */
  handle: string
  que_hace: string
  mensaje_central: string
  idioma: IdiomaMarca
  /** ISO 3166 de dos letras ("CO"), o null si la marca no es de un pais. */
  pais: string | null
  voz_si: string
  voz_no: string
  reglas: string
  frases_prohibidas: string[]
  temas_vetados: string
  /** Cuantos hashtags lleva un post de Instagram. 0 y 0 = ninguno. */
  hashtags_min: number
  hashtags_max: number
  /** Cuantas laminas lleva un carrusel, sin contar el cierre. */
  laminas_min: number
  laminas_max: number
  emojis_instagram: boolean
  emojis_linkedin: boolean
}

/**
 * Los limites de las reglas que se comprueban, los mismos que impone la base.
 * Las laminas llegan a seis porque con el cierre son siete, y mas que eso ya no
 * es un carrusel que se lea entero.
 */
export const RANGOS_REGLAS = {
  hashtags: { min: 0, max: 30 },
  laminas: { min: 3, max: 6 },
} as const

export const PERFIL_VACIO: PerfilMarca = {
  nombre: "",
  handle: "",
  que_hace: "",
  mensaje_central: "",
  idioma: "es",
  pais: null,
  voz_si: "",
  voz_no: "",
  reglas: "",
  frases_prohibidas: [],
  temas_vetados: "",
  // Lo que pide la fabrica: una cuenta que no los toque no nota nada.
  hashtags_min: 3,
  hashtags_max: 6,
  laminas_min: 3,
  laminas_max: 5,
  emojis_instagram: false,
  emojis_linkedin: false,
}

const CAMPOS_DE_TEXTO = ["nombre", "que_hace", "mensaje_central", "voz_si", "voz_no", "reglas", "temas_vetados"] as const

const texto = (valor: unknown, tope: number) => (typeof valor === "string" ? valor.trim().slice(0, tope) : "")

/** "@Plogy " -> "Plogy". Lo que no sea un usuario valido de red social se descarta. */
function limpiarHandle(valor: unknown): string {
  const sinArroba = texto(valor, TOPES_PERFIL.handle + 1).replace(/^@+/, "")
  return /^[A-Za-z0-9._]{1,40}$/.test(sinArroba) ? sinArroba : ""
}

function limpiarPais(valor: unknown): string | null {
  // Sin recortar antes de mirar: "Colombia" no es "CO", es un valor invalido.
  const t = typeof valor === "string" ? valor.trim().toUpperCase() : ""
  return /^[A-Z]{2}$/.test(t) ? t : null
}

/** Sin vacias, sin repetidas (ignorando mayusculas) y con tope de lista y de largo. */
function limpiarFrases(valor: unknown): string[] {
  const lista = Array.isArray(valor) ? valor : typeof valor === "string" ? valor.split("\n") : []
  const vistas = new Set<string>()
  const salida: string[] = []
  for (const item of lista) {
    const frase = texto(item, TOPES_PERFIL.frase)
    const clave = frase.toLocaleLowerCase("es")
    if (!frase || vistas.has(clave)) continue
    vistas.add(clave)
    salida.push(frase)
    if (salida.length === TOPES_PERFIL.frases) break
  }
  return salida
}

const entero = (valor: unknown): number | null => {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() ? Number(valor) : NaN
  return Number.isInteger(n) ? n : null
}

/**
 * Un rango min-max dentro de sus limites. Lo que no es un entero cae al de
 * fabrica, lo que se sale se lleva al borde, y si llegan cruzados se ordenan.
 */
function limpiarRango(
  min: unknown,
  max: unknown,
  limites: { min: number; max: number },
  porDefecto: [number, number]
): [number, number] {
  const encaja = (n: number) => Math.min(limites.max, Math.max(limites.min, n))
  const a = encaja(entero(min) ?? porDefecto[0])
  const b = encaja(entero(max) ?? porDefecto[1])
  return a <= b ? [a, b] : [b, a]
}

/**
 * Normaliza lo que venga de la base o de un formulario. Nunca lanza: lo que no
 * cabe se recorta y lo invalido cae al valor vacio. Lo que avisa al usuario es
 * `validarPerfil`, que se usa al guardar.
 */
export function parsePerfil(valor: unknown): PerfilMarca {
  const raw = (valor ?? {}) as Record<string, unknown>
  const idioma = String(raw.idioma ?? "")
  const [hashtags_min, hashtags_max] = limpiarRango(raw.hashtags_min, raw.hashtags_max, RANGOS_REGLAS.hashtags, [
    PERFIL_VACIO.hashtags_min,
    PERFIL_VACIO.hashtags_max,
  ])
  const [laminas_min, laminas_max] = limpiarRango(raw.laminas_min, raw.laminas_max, RANGOS_REGLAS.laminas, [
    PERFIL_VACIO.laminas_min,
    PERFIL_VACIO.laminas_max,
  ])
  const perfil: PerfilMarca = {
    ...PERFIL_VACIO,
    handle: limpiarHandle(raw.handle),
    idioma: (IDIOMAS_MARCA as readonly string[]).includes(idioma) ? (idioma as IdiomaMarca) : PERFIL_VACIO.idioma,
    pais: limpiarPais(raw.pais),
    frases_prohibidas: limpiarFrases(raw.frases_prohibidas),
    hashtags_min,
    hashtags_max,
    laminas_min,
    laminas_max,
    emojis_instagram: raw.emojis_instagram === true,
    emojis_linkedin: raw.emojis_linkedin === true,
  }
  for (const campo of CAMPOS_DE_TEXTO) perfil[campo] = texto(raw[campo], TOPES_PERFIL[campo])
  return perfil
}

/** Mensaje para el usuario, o null si todo vale. Solo mira los campos presentes. */
export function validarPerfil(valor: Record<string, unknown>): string | null {
  for (const campo of CAMPOS_DE_TEXTO) {
    const v = valor[campo]
    if (typeof v === "string" && v.trim().length > TOPES_PERFIL[campo]) {
      return `"${campo}" no puede pasar de ${TOPES_PERFIL[campo]} caracteres.`
    }
  }
  if (typeof valor.handle === "string" && valor.handle.trim() && !limpiarHandle(valor.handle)) {
    return "El usuario solo admite letras, números, punto y guion bajo (máximo 40)."
  }
  if (typeof valor.pais === "string" && valor.pais.trim() && !limpiarPais(valor.pais)) {
    return "El país va con su código de dos letras, por ejemplo CO."
  }
  if (valor.idioma !== undefined && !(IDIOMAS_MARCA as readonly string[]).includes(String(valor.idioma))) {
    return `El idioma tiene que ser uno de: ${IDIOMAS_MARCA.join(", ")}.`
  }
  const frases = Array.isArray(valor.frases_prohibidas) ? valor.frases_prohibidas : null
  if (frases && frases.filter((f) => typeof f === "string" && f.trim()).length > TOPES_PERFIL.frases) {
    return `Caben hasta ${TOPES_PERFIL.frases} frases prohibidas.`
  }
  const rangos = [
    ["hashtags", "Los hashtags", RANGOS_REGLAS.hashtags],
    ["laminas", "Las láminas", RANGOS_REGLAS.laminas],
  ] as const
  for (const [campo, nombre, limites] of rangos) {
    const min = valor[`${campo}_min`]
    const max = valor[`${campo}_max`]
    if (min === undefined && max === undefined) continue
    const a = entero(min)
    const b = entero(max)
    if (a === null || b === null || a < limites.min || b > limites.max) {
      return `${nombre} van de ${limites.min} a ${limites.max}.`
    }
    if (a > b) return `${nombre}: el mínimo no puede pasar del máximo.`
  }
  return null
}

/** Cuantos campos del perfil tienen algo. Para el indicador de "marca completa". */
export function camposLlenos(perfil: PerfilMarca): { llenos: number; total: number } {
  const valores = [
    perfil.nombre,
    perfil.handle,
    perfil.que_hace,
    perfil.mensaje_central,
    perfil.pais ?? "",
    perfil.voz_si,
    perfil.voz_no,
    perfil.reglas,
    perfil.frases_prohibidas.join(""),
    perfil.temas_vetados,
  ]
  return { llenos: valores.filter((v) => v.trim().length > 0).length, total: valores.length }
}
