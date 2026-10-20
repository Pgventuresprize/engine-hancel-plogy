import { readFile } from "node:fs/promises"
import path from "node:path"

import { ImageResponse } from "next/og"

import { ALTO, ANCHO } from "./theme"

/**
 * La plantilla de Plogy: una estructura propia, no la clasica recoloreada.
 *
 * Sale de los carruseles de referencia de la marca: laminas que alternan tinta
 * y papel; arriba el logo, el tema y la paginacion; titulares en mayusculas con
 * las palabras clave en naranja; fotos en blanco y negro sobre un bloque
 * naranja; listas numeradas en tarjetas con el numero en un circulo naranja; y
 * el usuario de la cuenta al pie.
 *
 * Satori entiende un subconjunto de CSS: flex en todo div con varios hijos y
 * nada de grid. El resaltado se arma palabra por palabra porque un texto con
 * tramos de dos colores no se puede partir en lineas de otra forma.
 */

export const PLOGY = {
  tinta: "#141110",
  papel: "#F4F1EF",
  blanco: "#FFFFFF",
  texto: "#171310",
  suave: "#625951",
  suaveOscuro: "#B9AFA6",
  naranja: "#FF5B00",
  borde: "#171310",
}

const M = 72

export type FondoPlogy = "tinta" | "papel"
export type ComposicionPlogy = "portada" | "texto" | "lista" | "foto" | "tesis" | "cierre"

export type LaminaPlogy = {
  composicion: ComposicionPlogy
  fondo: FondoPlogy
  /** Linea corta sobre el titular ("Una persona puede pedirle a una IA:"). */
  lead?: string | null
  /** Titular. Lo que va entre *asteriscos* sale en naranja. */
  titular: string
  cuerpo?: string | null
  items?: string[]
  foto?: string | null
  /** El elemento de la noticia (un logo, un producto), para la portada. */
  inserto?: string | null
  /** El boton "Seguir" del cierre. Por defecto si; no cuando el CTA pide otra cosa. */
  botonSeguir?: boolean
  n: number
  total: number
  tema: string
  handle: string
  logoClaro: string | null
  logoOscuro: string | null
}

// ------------------------------------------------------------------ fuentes

type Fuente = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: "normal" }
let fuentes: Fuente[] | null = null

async function cargar(): Promise<Fuente[]> {
  if (fuentes) return fuentes
  const dir = path.join(process.cwd(), "src", "engine", "render", "fonts")
  const leer = async (archivo: string) => {
    const b = await readFile(path.join(dir, archivo))
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  }
  fuentes = [
    { name: "Plogy Display", data: await leer("ChakraPetch-700.ttf"), weight: 700, style: "normal" },
    { name: "Plogy Display", data: await leer("ChakraPetch-600.ttf"), weight: 600, style: "normal" },
    { name: "Plogy Texto", data: await leer("SpaceGrotesk-400.ttf"), weight: 400, style: "normal" },
    { name: "Plogy Texto", data: await leer("SpaceGrotesk-600.ttf"), weight: 600, style: "normal" },
    { name: "Plogy Texto", data: await leer("SpaceGrotesk-700.ttf"), weight: 700, style: "normal" },
  ]
  return fuentes
}

// ----------------------------------------------------------------- piezas

/** "*sin entrar* a tu web" -> palabras con su color. */
function tramos(texto: string): { palabra: string; resaltada: boolean; sufijo?: string }[] {
  const salida: { palabra: string; resaltada: boolean; sufijo?: string }[] = []
  texto.split(/(\*[^*]+\*)/g).forEach((parte) => {
    const resaltada = parte.startsWith("*") && parte.endsWith("*") && parte.length > 2
    const limpio = resaltada ? parte.slice(1, -1) : parte
    // La puntuacion pegada a un resaltado ("*auditorias*, luego") va con la
    // palabra anterior: sola quedaria con un espacio delante.
    const pegada = !resaltada ? limpio.match(/^[,.;:!?)»"]+/) : null
    let resto = limpio
    if (pegada && salida.length > 0 && !/^\s/.test(limpio)) {
      salida[salida.length - 1].sufijo = (salida[salida.length - 1].sufijo ?? "") + pegada[0]
      resto = limpio.slice(pegada[0].length)
    }
    for (const palabra of resto.split(/\s+/).filter(Boolean)) salida.push({ palabra, resaltada })
  })
  return salida
}

function Titular({ texto, tamano, color, alinear = "flex-start" }: { texto: string; tamano: number; color: string; alinear?: "flex-start" | "center" }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: alinear, lineHeight: 1.02 }}>
      {tramos(texto.toLocaleUpperCase("es")).map((t, i) => (
        <span
          key={i}
          style={{
            fontFamily: "Plogy Display",
            fontWeight: 700,
            fontSize: tamano,
            color: t.resaltada ? PLOGY.naranja : color,
            marginRight: tamano * 0.26,
            letterSpacing: 1,
          }}
        >
          {t.palabra}
          {t.sufijo ? <span style={{ color }}>{t.sufijo}</span> : null}
        </span>
      ))}
    </div>
  )
}

function Texto({ texto, tamano, color, peso = 400, alinear = "flex-start" }: { texto: string; tamano: number; color: string; peso?: 400 | 600; alinear?: "flex-start" | "center" }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", lineHeight: 1.32, justifyContent: alinear }}>
      {tramos(texto).map((t, i) => (
        <span
          key={i}
          style={{
            fontFamily: "Plogy Texto",
            fontWeight: t.resaltada ? 700 : peso,
            fontSize: tamano,
            color: t.resaltada ? PLOGY.naranja : color,
            marginRight: tamano * 0.26,
          }}
        >
          {t.palabra}
          {t.sufijo ?? ""}
        </span>
      ))}
    </div>
  )
}

function Encabezado({ l, oscuro }: { l: LaminaPlogy; oscuro: boolean }) {
  const logo = oscuro ? (l.logoClaro ?? l.logoOscuro) : (l.logoOscuro ?? l.logoClaro)
  const color = oscuro ? PLOGY.blanco : PLOGY.texto
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {logo ? (
          // El logo trae su area de proteccion: se recorta con el contenedor.
          <div style={{ display: "flex", width: 210, height: 64, overflow: "hidden", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" width={262} height={128} style={{ marginLeft: -36, objectFit: "contain" }} />
          </div>
        ) : (
          <span style={{ fontFamily: "Plogy Display", fontWeight: 700, fontSize: 40, color }}>Plogy.</span>
        )}
        <span style={{ fontFamily: "Plogy Texto", fontWeight: 600, fontSize: 24, color, letterSpacing: 2 }}>
          {String(l.n).padStart(2, "0")} / {String(l.total).padStart(2, "0")}
        </span>
      </div>
      {l.tema ? (
        <span style={{ fontFamily: "Plogy Texto", fontWeight: 600, fontSize: 22, letterSpacing: 3, color: oscuro ? PLOGY.suaveOscuro : PLOGY.suave }}>
          {l.tema.toLocaleUpperCase("es")}
        </span>
      ) : null}
    </div>
  )
}

function Pie({ l, oscuro }: { l: LaminaPlogy; oscuro: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <span style={{ fontFamily: "Plogy Texto", fontWeight: 600, fontSize: 24, color: oscuro ? PLOGY.suaveOscuro : PLOGY.suave }}>{l.handle}</span>
      <div style={{ display: "flex", gap: 10 }}>
        {Array.from({ length: l.total }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              width: i + 1 === l.n ? 26 : 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: i + 1 === l.n ? PLOGY.naranja : oscuro ? "#4A423C" : "#CFC6BE",
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** Foto en blanco y negro sobre un bloque naranja desplazado, como en las referencias. */
function FotoBloque({ foto, ancho, alto, bloque = "izquierda" }: { foto: string; ancho: number; alto: number; bloque?: "izquierda" | "derecha" }) {
  return (
    <div style={{ display: "flex", position: "relative", width: ancho + 40, height: alto + 40 }}>
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: bloque === "izquierda" ? 0 : 40,
          width: ancho * 0.62,
          height: alto * 0.7,
          backgroundColor: PLOGY.naranja,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={foto}
        alt=""
        width={ancho}
        height={alto}
        style={{ position: "absolute", top: 40, left: bloque === "izquierda" ? 40 : 0, objectFit: "cover", borderRadius: 18 }}
      />
    </div>
  )
}

function Marco({ l, children }: { l: LaminaPlogy; children: React.ReactNode }) {
  const oscuro = l.fondo === "tinta"
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: ANCHO,
        height: ALTO,
        padding: M,
        backgroundColor: oscuro ? PLOGY.tinta : PLOGY.papel,
      }}
    >
      <Encabezado l={l} oscuro={oscuro} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, marginTop: 36, marginBottom: 28 }}>{children}</div>
      <Pie l={l} oscuro={oscuro} />
    </div>
  )
}

// ------------------------------------------------------------ composiciones

function Lamina(l: LaminaPlogy) {
  const oscuro = l.fondo === "tinta"
  const tinta = oscuro ? PLOGY.blanco : PLOGY.texto
  const suave = oscuro ? PLOGY.suaveOscuro : PLOGY.suave

  if (l.composicion === "portada") {
    return (
      <Marco l={l}>
        <Titular texto={l.titular} tamano={l.titular.length > 70 ? 74 : 84} color={tinta} />
        <div style={{ display: "flex", flexGrow: 1, alignItems: "flex-end", justifyContent: "space-between", marginTop: 24 }}>
          {l.inserto ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 18, marginBottom: 40 }}>
              <div
                style={{
                  display: "flex",
                  width: 250,
                  height: 250,
                  borderRadius: 26,
                  backgroundColor: PLOGY.blanco,
                  border: `4px solid ${PLOGY.naranja}`,
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 26,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.inserto} alt="" width={196} height={196} style={{ objectFit: "contain" }} />
              </div>
              <div style={{ display: "flex", gap: 10, marginLeft: 30 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ display: "flex", width: 22, height: 6, borderRadius: 4, backgroundColor: PLOGY.naranja }} />
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
          {l.foto ? <FotoBloque foto={l.foto} ancho={l.inserto ? 520 : 640} alto={l.inserto ? 560 : 560} bloque="derecha" /> : null}
        </div>
      </Marco>
    )
  }

  if (l.composicion === "lista") {
    return (
      <Marco l={l}>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
        {l.lead ? <div style={{ display: "flex", marginBottom: 14 }}><Texto texto={l.lead} tamano={34} color={suave} /></div> : null}
        <Titular texto={l.titular} tamano={70} color={tinta} />
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 40 }}>
          {(l.items ?? []).slice(0, 5).map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26,
                padding: "20px 26px",
                borderRadius: 14,
                border: `2px solid ${oscuro ? "#4A423C" : PLOGY.borde}`,
                backgroundColor: oscuro ? "#1E1A17" : PLOGY.blanco,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 58,
                  height: 58,
                  borderRadius: 999,
                  backgroundColor: PLOGY.naranja,
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Plogy Display",
                  fontWeight: 700,
                  fontSize: 32,
                  color: PLOGY.blanco,
                }}
              >
                {i + 1}
              </div>
              <div style={{ display: "flex", width: 2, height: 44, backgroundColor: oscuro ? "#4A423C" : "#CFC6BE" }} />
              <div style={{ display: "flex", flex: 1 }}>
                <Texto texto={item} tamano={34} color={tinta} peso={600} />
              </div>
            </div>
          ))}
        </div>
        </div>
      </Marco>
    )
  }

  if (l.composicion === "foto") {
    return (
      <Marco l={l}>
        {l.lead ? <div style={{ display: "flex", marginBottom: 14 }}><Texto texto={l.lead} tamano={34} color={suave} /></div> : null}
        <Titular texto={l.titular} tamano={66} color={tinta} />
        <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center", marginTop: 20 }}>
          {l.foto ? <FotoBloque foto={l.foto} ancho={860} alto={430} bloque="izquierda" /> : null}
        </div>
        {l.cuerpo ? <Texto texto={l.cuerpo} tamano={34} color={suave} /> : null}
      </Marco>
    )
  }

  if (l.composicion === "tesis") {
    return (
      <Marco l={l}>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 40 }}>
          <div style={{ display: "flex", width: 120, height: 10, backgroundColor: PLOGY.naranja }} />
          <Titular texto={l.titular} tamano={76} color={tinta} />
          {l.cuerpo ? <Texto texto={l.cuerpo} tamano={36} color={suave} /> : null}
        </div>
      </Marco>
    )
  }

  if (l.composicion === "cierre") {
    const logo = oscuro ? (l.logoClaro ?? l.logoOscuro) : (l.logoOscuro ?? l.logoClaro)
    return (
      <Marco l={l}>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 34 }}>
          {logo ? (
            <div style={{ display: "flex", width: 560, height: 200, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" width={640} height={312} style={{ objectFit: "contain" }} />
            </div>
          ) : null}
          <Titular texto={l.titular} tamano={78} color={tinta} alinear="center" />
          {l.cuerpo ? (
            <div style={{ display: "flex", justifyContent: "center", width: 820 }}>
              <Texto texto={l.cuerpo} tamano={36} color={suave} alinear="center" />
            </div>
          ) : null}
          {l.botonSeguir !== false ? (
            <div
              style={{
                display: "flex",
                padding: "18px 40px",
                borderRadius: 999,
                backgroundColor: PLOGY.naranja,
                fontFamily: "Plogy Texto",
                fontWeight: 700,
                fontSize: 30,
                color: PLOGY.tinta,
              }}
            >
              Seguir {l.handle}
            </div>
          ) : null}
        </div>
      </Marco>
    )
  }

  // texto
  return (
    <Marco l={l}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 30 }}>
        {l.lead ? <Texto texto={l.lead} tamano={36} color={suave} /> : null}
        <Titular texto={l.titular} tamano={78} color={tinta} />
        {l.cuerpo ? <Texto texto={l.cuerpo} tamano={36} color={suave} /> : null}
      </div>
    </Marco>
  )
}

export async function renderPlogy(l: LaminaPlogy): Promise<Buffer> {
  const r = new ImageResponse(<Lamina {...l} />, { width: ANCHO, height: ALTO, fonts: await cargar() })
  return Buffer.from(await r.arrayBuffer())
}

/** Una foto en blanco y negro con contraste, que es como la usa la marca. */
export async function fotoEnByN(dataUri: string | null): Promise<string | null> {
  if (!dataUri) return null
  try {
    const sharp = (await import("sharp")).default
    const base64 = dataUri.split(",")[1]
    const salida = await sharp(Buffer.from(base64, "base64")).grayscale().linear(1.25, -22).jpeg({ quality: 86 }).toBuffer()
    return `data:image/jpeg;base64,${salida.toString("base64")}`
  } catch {
    return dataUri
  }
}

/** El orden de composiciones y fondos de un carrusel Plogy. */
export function repartirPlogy(slides: { items?: string[] | null }[]): { composicion: ComposicionPlogy; fondo: FondoPlogy }[] {
  const total = slides.length
  return slides.map((s, i) => {
    const fondo: FondoPlogy = i % 2 === 0 ? "tinta" : "papel"
    if (i === 0) return { composicion: "portada", fondo }
    if (s.items && s.items.length >= 3) return { composicion: "lista", fondo }
    if (i === total - 1) return { composicion: "tesis", fondo }
    if (i === 2) return { composicion: "foto", fondo }
    return { composicion: "texto", fondo }
  })
}
