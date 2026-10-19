import { supabaseAdmin } from "../supabase-admin"

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
 */

export const IDIOMAS_MARCA = ["es", "en"] as const
export type IdiomaMarca = (typeof IDIOMAS_MARCA)[number]

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
}

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

/**
 * Normaliza lo que venga de la base o de un formulario. Nunca lanza: lo que no
 * cabe se recorta y lo invalido cae al valor vacio. Lo que avisa al usuario es
 * `validarPerfil`, que se usa al guardar.
 */
export function parsePerfil(valor: unknown): PerfilMarca {
  const raw = (valor ?? {}) as Record<string, unknown>
  const idioma = String(raw.idioma ?? "")
  const perfil: PerfilMarca = {
    ...PERFIL_VACIO,
    handle: limpiarHandle(raw.handle),
    idioma: (IDIOMAS_MARCA as readonly string[]).includes(idioma) ? (idioma as IdiomaMarca) : PERFIL_VACIO.idioma,
    pais: limpiarPais(raw.pais),
    frases_prohibidas: limpiarFrases(raw.frases_prohibidas),
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

/** El perfil de la cuenta, o el vacio si todavia no lo guardo nunca. */
export async function perfilDe(accountId: string): Promise<PerfilMarca> {
  const { data, error } = await supabaseAdmin()
    .from("brand_profile")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer el perfil de marca: ${error.message}`)
  return data ? parsePerfil(data) : { ...PERFIL_VACIO }
}

/**
 * Guarda los campos que lleguen, sin tocar los demas. La primera vez crea la
 * fila: es el unico momento en que nace el perfil.
 */
export async function guardarPerfil(accountId: string, cambios: Partial<PerfilMarca>): Promise<void> {
  const invalido = validarPerfil(cambios as Record<string, unknown>)
  if (invalido) throw new Error(invalido)

  // Se normaliza el perfil completo y se escriben solo las claves que vinieron.
  const limpio = parsePerfil({ ...(await perfilDe(accountId)), ...cambios })
  const fila: Record<string, unknown> = { account_id: accountId, updated_at: new Date().toISOString() }
  for (const clave of Object.keys(cambios) as (keyof PerfilMarca)[]) {
    if (clave in PERFIL_VACIO) fila[clave] = limpio[clave]
  }

  const { error } = await supabaseAdmin().from("brand_profile").upsert(fila, { onConflict: "account_id" })
  if (error) throw new Error(`No se pudo guardar el perfil de marca: ${error.message}`)
}
