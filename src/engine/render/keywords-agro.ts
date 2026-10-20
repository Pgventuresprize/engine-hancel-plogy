/**
 * Terminos literales para ilustrar agro.
 *
 * El criterio general del carrusel es evitar lo obvio: si todo el corpus es de
 * IA, buscar "IA" da cerebros de neon iguales entre si. En agro pasa lo
 * contrario: si la noticia habla de cafe, la foto util **es** cafe. Nadie se
 * cansa de ver granos, y una foto abstracta ahi no ilustra nada.
 *
 * Ademas Pexels es un banco anglosajon: "caficultores colombia" devuelve
 * resultados sueltos y genericos porque hace coincidencia difusa, mientras que
 * "coffee farmer" devuelve justo eso. Por eso se traduce en vez de buscar en
 * español.
 */

/** Del vocabulario agro en español al sujeto fotografiable en ingles. */
const TRADUCCION: Record<string, string> = {
  // cultivos
  cafe: "coffee plantation",
  cafeteros: "coffee farmer",
  caficultor: "coffee farmer",
  caficultores: "coffee farmer",
  caficultura: "coffee plantation",
  fedecafe: "coffee farmer",
  pasilla: "coffee beans",
  arabica: "coffee beans",
  cacao: "cocoa pods",
  fedecacao: "cocoa farmer",
  aguacate: "avocado tree",
  hass: "avocado",
  banano: "banana plantation",
  platano: "banana plantation",
  arroz: "rice field",
  maiz: "corn field",
  papa: "potato harvest",
  papas: "potato harvest",
  palma: "oil palm plantation",
  cana: "sugarcane field",
  azucar: "sugarcane field",
  flores: "flower farm",
  floricultura: "flower farm",
  floricultor: "flower farm worker",
  panela: "sugarcane field",
  algodon: "cotton field",
  citricos: "citrus orchard",
  limon: "lemon tree",
  mango: "mango tree",
  pina: "pineapple field",

  // ganaderia
  ganaderia: "cattle ranch",
  ganado: "cattle",
  ganadero: "cattle rancher",
  fedegan: "cattle ranch",
  leche: "dairy farm",
  lechero: "dairy farm",
  bovino: "cattle",
  porcicultura: "pig farm",
  avicultura: "poultry farm",
  pollo: "poultry farm",

  // clima y agua
  sequia: "drought cracked soil",
  lluvias: "rain over crops",
  lluvia: "rain over crops",
  nino: "drought farmland",
  nina: "flooded farmland",
  inundacion: "flooded farmland",
  inundaciones: "flooded farmland",
  heladas: "frost on crops",
  helada: "frost on crops",
  clima: "farmland sky",
  ideam: "weather farmland",
  agua: "irrigation water",
  riego: "irrigation system",

  // labor y tierra
  cosecha: "harvest",
  cosechas: "harvest",
  siembra: "planting seeds",
  cultivo: "crop field",
  cultivos: "crop field",
  campesino: "farmer portrait",
  campesinos: "farmers working",
  agricultor: "farmer portrait",
  agricultores: "farmers working",
  agricultura: "farmland",
  agro: "farmland",
  rural: "rural landscape",
  tierra: "farm soil",
  suelo: "farm soil",
  finca: "farm",
  parcela: "farm field",
  tractor: "tractor field",
  maquinaria: "farm machinery",

  // insumos y sanidad
  fertilizante: "fertilizer bags",
  fertilizantes: "fertilizer bags",
  abono: "fertilizer",
  plaga: "crop pest damage",
  plagas: "crop pest damage",
  roya: "coffee leaf disease",
  fumigacion: "crop spraying",
  pesticida: "crop spraying",
  agroquimicos: "crop spraying",
  semilla: "seeds in hand",
  semillas: "seeds in hand",
  bioinsumos: "organic fertilizer",

  // mercado
  exportacion: "cargo shipping port",
  exportaciones: "cargo shipping port",
  exportador: "cargo shipping port",
  precio: "market produce",
  precios: "market produce",
  mercado: "farmers market",
  dolar: "money currency",
  cosechero: "harvest worker",
}

/** Palabras que no son sujeto de foto: verbos, relleno, siglas sin imagen. */
const SIN_IMAGEN = new Set([
  "golpea", "sube", "baja", "cae", "aumenta", "alerta", "advierte", "anuncia",
  "busca", "pide", "logra", "avanza", "sigue", "puede", "podria", "deberia",
  "millones", "miles", "ciento", "porciento", "gobierno", "ministerio",
  "colombia", "nacional", "pais", "region", "departamento", "idea", "papel",
  "impacto", "crisis", "produccion", "sector", "industria", "medida", "plan",
])

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Para completar cuando la noticia si es del campo. */
const RESPALDO = ["farmland", "farmer working field", "crop harvest", "rural landscape"]

/**
 * Traduce lo que reconozca y descarta lo que no es fotografiable.
 *
 * Solo devuelve terminos traducidos: una palabra en español que no este en el
 * diccionario da resultados genericos en Pexels, que es justo lo que se quiere
 * evitar aqui. Si no reconoce nada, la noticia no es del campo y devuelve una
 * lista vacia: quien llama busca entonces como siempre, en vez de llenar de
 * cultivos el carrusel de una marca que no es agro.
 */
export function terminosLiteralesAgro(
  titulo: string,
  tema: string | null,
  keywords: string[] | null
): string[] {
  const terminos: string[] = []

  const anadir = (t: string) => {
    if (!terminos.includes(t)) terminos.push(t)
  }

  // El tema del segmento es lo mas fiable: lo puso una persona.
  const fuentes = [tema ?? "", ...(keywords ?? []), titulo]

  for (const fuente of fuentes) {
    for (const palabra of normalizar(fuente).split(" ")) {
      if (palabra.length < 3 || SIN_IMAGEN.has(palabra)) continue
      const traducido = TRADUCCION[palabra]
      if (traducido) anadir(traducido)
    }
  }

  return terminos.length > 0 ? [...terminos, ...RESPALDO].slice(0, 6) : []
}
