/**
 * Cuantos dias tiene una noticia, a partir de lo que devuelve Serper.
 *
 * Serper no da una fecha: da texto libre y en el idioma de la busqueda ("2 days
 * ago", "hace 3 dias", "13 sept 2026"). Por eso el filtro de antiguedad no se
 * puede hacer en la consulta y se hace aqui, al ingerir.
 *
 * El `tbs` de la busqueda ya acota (qdr:d es el ultimo dia, qdr:w la semana),
 * pero no permite "5 dias" exactos y ademas Google se lo salta a menudo: esto es
 * la red que si corta.
 */

/** Mas viejo que esto no entra al pipeline. */
export const DIAS_DE_FRESCURA = 5

const UNIDADES: { patron: RegExp; dias: number }[] = [
  { patron: /(minut|hour|hora|min\b|segund|second)/i, dias: 0 },
  { patron: /\b(dia|día|day)/i, dias: 1 },
  { patron: /\b(semana|week)/i, dias: 7 },
  { patron: /\b(mes|month)/i, dias: 30 },
  { patron: /\b(año|ano|year)/i, dias: 365 },
]

/**
 * Dias de antiguedad, o `null` si el texto no se entiende.
 *
 * Ante la duda devuelve `null` y quien llama deja pasar la noticia: descartar
 * por no saber leer una fecha seria peor que colar alguna vieja.
 */
export function diasDeAntiguedad(texto: string | null | undefined, ahora = new Date()): number | null {
  if (!texto) return null
  const t = texto.trim().toLowerCase()
  if (t.length === 0) return null

  // Fecha absoluta primero: "9 ene 2020" tambien empieza por "numero +
  // palabra" y, leida como relativa, no casaba con ninguna unidad y se dejaba
  // pasar. Asi entro una noticia de 2020 al pipeline.
  const absoluta = fechaDeTexto(t)
  if (absoluta) {
    const dias = (ahora.getTime() - absoluta.getTime()) / 86_400_000
    return dias >= 0 ? Math.floor(dias) : 0
  }

  // "hace 2 dias", "2 days ago", "hace un mes"
  const relativo = t.match(/(\d+|un|una|a|an)\s+(\p{L}+)/u)
  if (relativo) {
    const crudo = relativo[1]
    const cantidad = /^\d+$/.test(crudo) ? Number(crudo) : 1
    for (const { patron, dias } of UNIDADES) {
      if (patron.test(relativo[2])) return cantidad * dias
    }
  }

  // "hoy" / "ayer" y sus equivalentes.
  if (/\b(hoy|today|ahora|just now)\b/.test(t)) return 0
  if (/\b(ayer|yesterday)\b/.test(t)) return 1

  // Lo que no se entiende pero trae un año anterior al actual es viejo seguro.
  const anio = t.match(/\b(19|20)\d{2}\b/)
  if (anio && Number(anio[0]) < ahora.getUTCFullYear()) {
    return Math.floor((ahora.getTime() - Date.UTC(Number(anio[0]), 11, 31)) / 86_400_000)
  }

  return null
}

const MESES: Record<string, number> = {
  ene: 0, enero: 0, jan: 0, january: 0,
  feb: 1, febrero: 1, february: 1,
  mar: 2, marzo: 2, march: 2,
  abr: 3, abril: 3, apr: 3, april: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5, june: 5,
  jul: 6, julio: 6, july: 6,
  ago: 7, agosto: 7, aug: 7, august: 7,
  sep: 8, sept: 8, septiembre: 8, setiembre: 8, september: 8,
  oct: 9, octubre: 9, october: 9,
  nov: 10, noviembre: 10, november: 10,
  dic: 11, diciembre: 11, dec: 11, december: 11,
}

/**
 * Una fecha absoluta en español o en inglés: "9 ene 2020", "13 sept 2026",
 * "3 de octubre de 2026", "Oct 2, 2026", "2026-10-02". Null si no lo es.
 */
export function fechaDeTexto(texto: string): Date | null {
  const t = texto.trim().toLowerCase().replace(/\./g, "")
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))

  // dia mes año: "9 ene 2020", "3 de octubre de 2026"
  const dma = t.match(/\b(\d{1,2})\s+(?:de\s+)?(\p{L}+)\s+(?:de\s+)?(\d{4})\b/u)
  if (dma && dma[2] in MESES) return new Date(Date.UTC(Number(dma[3]), MESES[dma[2]], Number(dma[1])))

  // mes dia, año: "oct 2, 2026"
  const mda = t.match(/\b(\p{L}+)\s+(\d{1,2}),?\s+(\d{4})\b/u)
  if (mda && mda[1] in MESES) return new Date(Date.UTC(Number(mda[3]), MESES[mda[1]], Number(mda[2])))

  // mes año: "mayo 2026"
  const ma = t.match(/\b(\p{L}+)\s+(?:de\s+)?(\d{4})\b/u)
  if (ma && ma[1] in MESES) return new Date(Date.UTC(Number(ma[2]), MESES[ma[1]], 1))

  return null
}

/** `true` si la noticia es demasiado vieja para el pipeline. */
export function esVieja(dateSerper: string | null | undefined, ahora = new Date()): boolean {
  const dias = diasDeAntiguedad(dateSerper, ahora)
  return dias !== null && dias > DIAS_DE_FRESCURA
}
