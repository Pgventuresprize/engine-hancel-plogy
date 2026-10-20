/**
 * La identidad visual del carrusel, en un solo sitio.
 *
 * Separado de las plantillas a proposito: cambiar la paleta, la marca o la
 * tipografia no deberia obligar a tocar el codigo que dibuja. Todo lo que se
 * querria ajustar vive aqui, y lo que el usuario puede cambiar desde la interfaz
 * llega como `Estilo`.
 */

/**
 * El lienzo del carrusel: 4:5 vertical, no cuadrado.
 *
 * Instagram admite hasta 4:5 y es el formato que mas alto ocupa en el feed: el
 * mismo post gana un tercio de pantalla frente al cuadrado, y esa altura es
 * justo lo que deja poner la foto arriba y el titular abajo sin apretar.
 */
export const ANCHO = 1080
export const ALTO = 1350

export type Paleta = {
  fondo: string
  fondoAlterno: string
  texto: string
  textoSuave: string
  acento: string
  /** Velo sobre la foto: sin el, el texto encima no se lee. */
  velo: string
  /** Para el cierre y la tarjeta, donde el texto va suelto y pide mas calma. */
  veloFuerte: string
  /** Los tres cortes del degradado que funde la foto en el fondo. */
  fundido: [string, string, string]
  /** Banda superior sobre la foto, para que la marca se lea sobre un cielo claro. */
  veloTecho: string
  /**
   * El fondo es claro.
   *
   * Lo unico que decide es que version del logo se usa: un logo blanco sobre
   * fondo blanco no se ve, y es un fallo que no se descubre hasta publicar.
   */
  fondoClaro?: boolean
}

export const PALETA: Paleta = {
  fondo: "#0A0A0A",
  fondoAlterno: "#141414",
  texto: "#FFFFFF",
  textoSuave: "#A1A1A1",
  acento: "#FFFFFF",
  velo: "rgba(0, 0, 0, 0.66)",
  veloFuerte: "rgba(0, 0, 0, 0.8)",
  fundido: ["rgba(10, 10, 10, 0)", "rgba(10, 10, 10, 0.92)", "#0A0A0A"],
  veloTecho: "rgba(10, 10, 10, 0.55)",
}

/**
 * Paletas listas para elegir. Todas en blanco y negro.
 *
 * Sin color a proposito: en un feed saturado, una serie estrictamente monocroma
 * se reconoce de un vistazo, y el contraste puro deja el peso en la tipografia y
 * en la foto en vez de repartirlo con un acento de color.
 *
 * El acento no desaparece —hace falta para la barra de la cita, el numero grande
 * o el punto de la marca— pero es el propio blanco o negro, asi que marca por
 * contraste y no por tono.
 */
export const PALETAS: Record<string, Paleta> = {
  negro: PALETA,
  blanco: {
    fondo: "#FFFFFF",
    fondoAlterno: "#F2F2F2",
    texto: "#0A0A0A",
    textoSuave: "#616161",
    acento: "#0A0A0A",
    // Sobre fondo claro el velo tambien aclara: si no, el texto negro no se lee.
    velo: "rgba(255, 255, 255, 0.78)",
    veloFuerte: "rgba(255, 255, 255, 0.88)",
    fundido: ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.94)", "#FFFFFF"],
    veloTecho: "rgba(255, 255, 255, 0.62)",
    fondoClaro: true,
  },
  carbon: {
    fondo: "#1C1C1C",
    fondoAlterno: "#262626",
    texto: "#FAFAFA",
    textoSuave: "#9E9E9E",
    acento: "#FAFAFA",
    velo: "rgba(12, 12, 12, 0.62)",
    veloFuerte: "rgba(8, 8, 8, 0.78)",
    fundido: ["rgba(28, 28, 28, 0)", "rgba(28, 28, 28, 0.92)", "#1C1C1C"],
    veloTecho: "rgba(28, 28, 28, 0.55)",
  },
  /**
   * Plogy (brand kit 01): papel blanco, tinta y el naranja de la marca como
   * acento. Es la unica paleta con color: la marca lo pide, y el naranja marca
   * la barra de la cita, el numero grande y el punto, no el texto corrido.
   */
  plogy: {
    fondo: "#FFFFFF",
    fondoAlterno: "#F4F1EF",
    texto: "#171310",
    textoSuave: "#625951",
    acento: "#FF5B00",
    velo: "rgba(255, 255, 255, 0.8)",
    veloFuerte: "rgba(255, 255, 255, 0.9)",
    fundido: ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.94)", "#FFFFFF"],
    veloTecho: "rgba(255, 255, 255, 0.62)",
    fondoClaro: true,
  },
  /** Plogy sobre tinta: la misma marca en oscuro. */
  "plogy-tinta": {
    fondo: "#171310",
    fondoAlterno: "#221C18",
    texto: "#FFFFFF",
    textoSuave: "#A39486",
    acento: "#FF5B00",
    velo: "rgba(23, 19, 16, 0.66)",
    veloFuerte: "rgba(23, 19, 16, 0.82)",
    fundido: ["rgba(23, 19, 16, 0)", "rgba(23, 19, 16, 0.92)", "#171310"],
    veloTecho: "rgba(23, 19, 16, 0.55)",
  },
}

export type NombrePaleta = keyof typeof PALETAS
export const PALETA_POR_DEFECTO = "negro"

/**
 * Los colores propios de una marca.
 *
 * Las paletas de arriba son puntos de partida; lo que la marca guarda son sus
 * colores. Se piensan como un sistema y no como "fondo y texto": tinta y papel
 * son los dos extremos, superficie el fondo alterno claro, acento el color de
 * marca y acentoTexto su version legible sobre papel (un naranja puro sobre
 * blanco no pasa contraste en texto corrido).
 */
export type ColoresMarca = {
  tinta: string
  papel: string
  superficie: string
  acento: string
  acentoTexto: string
  /** De 0 a 5 cortes. Vacio = la marca no usa degradado. */
  degradado: string[]
}

/** Sobre que fondo se dibuja el carrusel clasico con los colores de la marca. */
export type FondoBase = "claro" | "oscuro"

const HEX = /^#[0-9a-f]{6}$/i

export function esHex(valor: unknown): valor is string {
  return typeof valor === "string" && HEX.test(valor.trim())
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function rgba(hex: string, alfa: number): string {
  const [r, g, b] = rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alfa})`
}

/** Mezcla `a` con `b`; `t` = 0 es `a`, 1 es `b`. */
function mezclar(a: string, b: string, t: number): string {
  const [ra, ga, ba] = rgb(a)
  const [rb, gb, bb] = rgb(b)
  const canal = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0")
  return `#${canal(ra, rb)}${canal(ga, gb)}${canal(ba, bb)}`
}

/** Contraste WCAG entre dos colores: 1 (nada) a 21 (negro sobre blanco). */
export function contraste(a: string, b: string): number {
  const luz = (hex: string) => {
    const [r, g, b2] = rgb(hex).map((c) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2
  }
  const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/** Lo guardado, si es valido; null si la marca no tiene colores propios. */
export function parseColores(valor: unknown): ColoresMarca | null {
  const raw = (valor ?? {}) as Record<string, unknown>
  const claves = ["tinta", "papel", "superficie", "acento", "acentoTexto"] as const
  if (!claves.every((c) => esHex(raw[c]))) return null
  const degradado = Array.isArray(raw.degradado) ? raw.degradado.filter(esHex).slice(0, 5) : []
  return {
    tinta: String(raw.tinta).toUpperCase(),
    papel: String(raw.papel).toUpperCase(),
    superficie: String(raw.superficie).toUpperCase(),
    acento: String(raw.acento).toUpperCase(),
    acentoTexto: String(raw.acentoTexto).toUpperCase(),
    degradado: degradado.map((c) => c.toUpperCase()),
  }
}

/** Una paleta de las de arriba, leida como colores de marca: el punto de partida. */
export function coloresDePaleta(p: Paleta): { colores: ColoresMarca; fondo: FondoBase } {
  const claro = p.fondoClaro === true
  return {
    fondo: claro ? "claro" : "oscuro",
    colores: {
      tinta: (claro ? p.texto : p.fondo).toUpperCase(),
      papel: (claro ? p.fondo : p.texto).toUpperCase(),
      superficie: (claro ? p.fondoAlterno : mezclar(p.texto, p.fondo, 0.05)).toUpperCase(),
      acento: p.acento.toUpperCase(),
      acentoTexto: p.acento.toUpperCase(),
      degradado: [],
    },
  }
}

/**
 * Los colores de la marca, como paleta del carrusel clasico.
 *
 * Los velos y fundidos salen del propio fondo con transparencia, igual que en
 * las paletas hechas a mano, para que el texto sobre una foto se lea con
 * cualquier color que elija la marca.
 */
export function paletaDesdeColores(c: ColoresMarca, fondo: FondoBase): Paleta {
  const claro = fondo === "claro"
  const base = claro ? c.papel : c.tinta
  const texto = claro ? c.tinta : c.papel
  return {
    fondo: base,
    fondoAlterno: claro ? c.superficie : mezclar(c.tinta, c.papel, 0.07),
    texto,
    textoSuave: mezclar(texto, base, 0.38),
    acento: claro ? c.acentoTexto : c.acento,
    velo: rgba(base, claro ? 0.8 : 0.66),
    veloFuerte: rgba(base, claro ? 0.9 : 0.82),
    fundido: [rgba(base, 0), rgba(base, claro ? 0.94 : 0.92), base],
    veloTecho: rgba(base, claro ? 0.62 : 0.55),
    fondoClaro: claro,
  }
}

/**
 * Las familias disponibles. El render acepta cualquiera que este en `fonts/`
 * con estos cuatro pesos.
 */
export const FUENTES = {
  HeroFont: {
    nombre: "HeroFont",
    archivos: {
      light: "HeroFont-Light.otf",
      regular: "HeroFont-Regular.otf",
      semibold: "HeroFont-SemiBold.otf",
      bold: "HeroFont-Bold.otf",
    },
  },
  /**
   * La alternativa libre que define el brand kit de Plogy: su tipografia de
   * marca (Screener) es una version demo sin licencia comercial.
   */
  SpaceGrotesk: {
    nombre: "Space Grotesk",
    archivos: {
      light: "SpaceGrotesk-300.ttf",
      regular: "SpaceGrotesk-400.ttf",
      semibold: "SpaceGrotesk-600.ttf",
      bold: "SpaceGrotesk-700.ttf",
    },
  },
} as const

export type NombreFuente = keyof typeof FUENTES
export const FUENTE_POR_DEFECTO: NombreFuente = "HeroFont"

/**
 * Escala tipografica sobre el lienzo de 1080x1350.
 *
 * Grande a proposito: un carrusel se lee en un telefono, a menudo en miniatura
 * dentro del feed.
 */
export const ESCALA = {
  /** Portada. */
  hook: 92,
  /** Titulo de lamina. */
  titulo: 64,
  /** Descripcion: el cuerpo de texto de cualquier lamina. */
  cuerpo: 46,
  /** Frase suelta de las laminas de cita. */
  cita: 60,
  /** Etiqueta en versalitas bajo una cita. */
  etiqueta: 30,
  /** Antetitulo de la portada: el tema, en versalitas sobre el hook. */
  antetitulo: 30,
  pie: 28,
  numero: 26,
}

/**
 * Cuanto texto cabe en cada hueco antes de desbordar.
 *
 * Los tamaños son fijos —un titulo se ve igual en todas las laminas, y lo mismo
 * una descripcion— porque encogerlos segun el largo hacia que cada lamina
 * tuviera su propia escala y el carrusel se leyera desparejo. El precio de la
 * consistencia es que un texto muy largo hay que recortarlo, y es mejor
 * recortarlo con puntos suspensivos que dejar que Satori lo corte a media
 * palabra contra el borde.
 */
export const TOPES = {
  // Corto a proposito: en la portada el hook va abajo, sobre el fondo del
  // degradado, y pasar de cuatro o cinco lineas se come la foto que tiene que
  // atraer la mirada. Es un titular, no un resumen.
  hook: 100,
  titulo: 80,
  /** El hueco de la descripcion cambia segun la composicion. */
  cuerpoAmplio: 420,
  cuerpoAjustado: 300,
  cita: 260,
  antetitulo: 34,
}

/**
 * El marco: el aire que ninguna lamina invade.
 *
 * Es el mismo en las ocho composiciones y en las cuatro esquinas, y todo
 * —titulares, cuerpos, fotos de contenido, numeracion— vive dentro. Es lo unico
 * que hace que ocho maquetaciones distintas se lean como una serie: si cada
 * lamina empezara su texto a una altura distinta, el carrusel parecerian ocho
 * posts pegados.
 *
 * La excepcion es la foto de fondo, que va a sangre por debajo del marco. Ahi no
 * es contenido sino lienzo, y recuadrarla dejaria un borde que compite con el
 * texto en vez de sostenerlo.
 */
export const MARGEN = 84

/**
 * Como se compone cada lamina.
 *
 * Existe para que el carrusel no sea cinco veces la misma diapositiva: el
 * reparto lo decide `carousel.ts` a partir del contenido, no al azar puro.
 */
export type Variante =
  | "portada"
  | "cierre"
  | "texto"
  | "foto_fondo"
  | "foto_lateral"
  | "foto_recuadro"
  | "cita"
  | "dato"

/**
 * La lamina de cierre.
 *
 * Cierra todos los carruseles, siempre. Su texto lo escribe el agente con el
 * CTA que se eligio para la pieza (ver `estiloConCierre` en carousel.ts); el
 * que se guarda aqui es el de respaldo, para un guion que no lo trae o una
 * marca sin CTA. El estilo si es de la marca.
 */
export type EstiloCierre = "marca" | "perfil"

export type Cierre = {
  /**
   * Como se dibuja.
   *
   * `marca` es la lamina sobria: el logo, el titular y la frase sobre una foto.
   * `perfil` es la que funciona en Instagram: el titular grande arriba y debajo
   * una captura del propio perfil con el cursor sobre el boton de seguir. La
   * segunda pide mas, pero enseñar donde hay que pulsar convierte mucho mejor
   * que pedirlo con palabras.
   */
  estilo: EstiloCierre
  titulo: string
  texto: string
}

// Sin texto: el cierre lo escribe el agente en cada pieza, con su CTA. La marca
// solo elige como se ve.
export const CIERRE_POR_DEFECTO: Cierre = {
  estilo: "marca",
  titulo: "",
  texto: "",
}

/** Lo que el usuario puede cambiar desde la interfaz. */
export type Estilo = {
  paleta: Paleta
  /** Los colores propios de la marca, si los guardo. Mandan sobre la paleta. */
  colores: ColoresMarca | null
  fondoBase: FondoBase
  /** La de los titulares. El carrusel clasico la usa para todo. */
  fuente: NombreFuente
  /** La del texto corrido, para las plantillas que separan las dos. */
  fuenteTexto: NombreFuente
  /** Rotulo de la esquina superior. Vacio = sin rotulo. */
  marca: string
  /** Numerar las laminas y mostrar el "desliza". */
  mostrarPaginacion: boolean
  /** Meter fotos de banco en las laminas interiores. */
  usarFotos: boolean
  /**
   * El logo que toca a esta paleta, ya elegido. Vacio = sin logo.
   *
   * Es una URL del storage, no un archivo: el render la descarga como hace con
   * las fotos, porque Satori necesita los bytes y no sabe ir a buscarlos.
   */
  logo: string | null
  /**
   * Las dos versiones subidas, para la interfaz.
   *
   * Hay dos porque un logo no sirve sobre cualquier fondo: el claro va sobre
   * las paletas oscuras y el oscuro sobre la blanca. Guardar solo uno obligaria
   * a volver a subirlo cada vez que se cambia de paleta, y a descubrir el
   * problema con el post ya publicado.
   */
  logoClaro: string | null
  logoOscuro: string | null
  /**
   * La captura del propio perfil, para el cierre de estilo `perfil`.
   *
   * Es una imagen de la cuenta tal como se ve en Instagram, con su boton de
   * seguir. Sin ella ese estilo no tiene nada que enseñar, asi que el cierre
   * cae al de marca en vez de salir vacio.
   */
  perfil: string | null
  /**
   * Ilustrar el tema de frente en vez de buscar "el otro lado".
   * En agro la foto util es el cultivo mismo; en tecnologia seria un cliche.
   */
  fotosLiterales: boolean
  cierre: Cierre
  /**
   * La familia de laminas. "clasica" es la de siempre; "plogy" es la estructura
   * propia de Plogy (tinta y papel alternados, titulares con resaltado, fotos
   * en blanco y negro sobre bloque naranja, listas numeradas).
   */
  plantilla: "clasica" | "plogy"
}

export const ESTILO_POR_DEFECTO: Estilo = {
  paleta: PALETA,
  colores: null,
  fondoBase: "oscuro",
  fuente: FUENTE_POR_DEFECTO,
  fuenteTexto: FUENTE_POR_DEFECTO,
  // Vacio por defecto: el rotulo lo pone quien quiera, no el motor.
  marca: "",
  mostrarPaginacion: true,
  usarFotos: true,
  logo: null,
  logoClaro: null,
  logoOscuro: null,
  perfil: null,
  fotosLiterales: false,
  cierre: CIERRE_POR_DEFECTO,
  plantilla: "clasica",
}

/** Arma el estilo a partir de lo guardado en `generation_config.carousel`. */
export function estiloDesdeConfig(valor: unknown): Estilo {
  const raw = (valor ?? {}) as Record<string, unknown>
  const preset =
    typeof raw.paleta === "string" && raw.paleta in PALETAS
      ? PALETAS[raw.paleta]
      : PALETAS[PALETA_POR_DEFECTO]
  // Los colores propios mandan sobre la paleta, que queda como punto de partida.
  const colores = parseColores(raw.colores)
  const fondoBase: FondoBase =
    raw.fondo === "claro" || raw.fondo === "oscuro" ? raw.fondo : preset.fondoClaro ? "claro" : "oscuro"
  const paleta = colores ? paletaDesdeColores(colores, fondoBase) : preset
  const fuenteDe = (v: unknown): NombreFuente | null =>
    typeof v === "string" && v in FUENTES ? (v as NombreFuente) : null
  // `fuente` a secas es de cuando habia una sola: se lee como la de titulares.
  const fuente = fuenteDe(raw.fuenteTitulos) ?? fuenteDe(raw.fuente) ?? FUENTE_POR_DEFECTO

  const logos = (raw.logos ?? {}) as Record<string, unknown>
  const url = (valor: unknown) =>
    typeof valor === "string" && valor.trim().length > 0 ? valor.trim() : null

  // `logo` a secas es de cuando solo habia uno: se lee como el claro, que es el
  // que servia para las paletas oscuras que habia entonces.
  const logoClaro = url(logos.claro) ?? url(raw.logo)
  const logoOscuro = url(logos.oscuro)

  return {
    paleta,
    colores,
    fondoBase,
    fuente,
    fuenteTexto: fuenteDe(raw.fuenteTexto) ?? fuente,
    marca: typeof raw.marca === "string" ? raw.marca.trim().slice(0, 40) : "",
    mostrarPaginacion: raw.mostrarPaginacion !== false,
    usarFotos: raw.usarFotos !== false,
    // Sobre fondo claro manda el logo oscuro y al reves. Si solo hay uno se usa
    // ese: mal contraste se ve y se arregla; sin logo no hay nada que arreglar.
    logo: paleta.fondoClaro ? (logoOscuro ?? logoClaro) : (logoClaro ?? logoOscuro),
    logoClaro,
    logoOscuro,
    perfil: url(logos.perfil),
    fotosLiterales: raw.fotosLiterales === true,
    cierre: cierreDesdeConfig(raw.cierre),
    plantilla: raw.plantilla === "plogy" ? "plogy" : "clasica",
  }
}

/**
 * El titulo y el texto que guardaron las cuentas antes (el cierre de respaldo)
 * se ignoran: un texto fijo no sabe de que hablo la pieza.
 */
function cierreDesdeConfig(valor: unknown): Cierre {
  const raw = (valor ?? {}) as Record<string, unknown>
  return { ...CIERRE_POR_DEFECTO, estilo: raw.estilo === "perfil" ? "perfil" : "marca" }
}
