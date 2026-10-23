import type { Figura } from "../marca/figuras"
import { ALTO, ANCHO, ESCALA, MARGEN, TOPES, type Estilo, type Variante } from "./theme"

/**
 * Las laminas del carrusel.
 *
 * Se dibujan con Satori (via next/og), que entiende un subconjunto de CSS: hay
 * flexbox pero no grid, y todo div con varios hijos necesita `display: flex`
 * explicito. De ahi que los estilos vayan en linea y sin clases.
 *
 * Hay varias composiciones a proposito. Cinco laminas identicas con la foto
 * detras se leen como un formulario; alternar el peso del texto, el sitio de la
 * foto y algun elemento grafico es lo que hace que el carrusel se recorra.
 *
 * Lo que no cambia entre composiciones es el marco: el mismo aire por los cuatro
 * lados, la marca siempre en el mismo sitio y la paginacion siempre a la misma
 * altura. Es lo que las convierte en una serie en vez de en ocho posts pegados.
 */

export type SlideTexto = {
  n: number
  type: "text"
  title?: string | null
  body?: string | null
  /** Linea corta sobre el titular. Solo la usa la plantilla Plogy. */
  lead?: string | null
  /** Puntos de una lista numerada. Solo la usa la plantilla Plogy. */
  items?: string[] | null
  /** Con kit de diseño: el tipo de lamina del kit que pidio quien escribio (dato, lista...). */
  tipoLamina?: string | null
  /** Con kit de diseño: la figura que construye la lamina (barras, tabla, niveles...). */
  figura?: Figura | null
}

export type SlidePortada = {
  n: number
  type: "photo_hook"
  hook?: string | null
  tipoLamina?: string | null
}

export type Slide = SlideTexto | SlidePortada

/** Lo que necesita una lamina para dibujarse. */
export type LaminaProps = {
  slide: Slide
  total: number
  estilo: Estilo
  variante: Variante
  /** Data URI ya descargado, o null. */
  foto: string | null
  /** El logo de la marca, ya descargado. Solo lo usa la lamina de cierre. */
  logo?: string | null
  /** El elemento recortado de la portada, ya descargado. */
  inserto?: string | null
  /** Cual de las cuatro posiciones ocupa. Solo la portada lo usa. */
  insertoPos?: number
  /** Circulo o cuadrado. Se sortea al generar. */
  insertoForma?: FormaInserto
  /** Si llena el hueco recortando o se encaja entero. */
  insertoAjuste?: AjusteInserto
  /** La captura del perfil, ya descargada. Solo la usa el cierre. */
  perfil?: string | null
  /**
   * Antetitulo de la portada: el tema de la noticia, en versalitas sobre el
   * hook. Es el hueco que en las cuentas que funcionan lleva la seccion, y sirve
   * para situar de que va el post antes de leer el titular.
   */
  etiqueta?: string | null
}

/** El ancho util: el lienzo menos el marco. Ninguna lamina se sale de aqui. */
const UTIL = ANCHO - MARGEN * 2

/**
 * Recorta por palabra y cierra con puntos suspensivos.
 *
 * Los tamaños de letra son fijos para que el carrusel se lea parejo, asi que lo
 * que no cabe hay que quitarlo: Satori no ajusta el texto al hueco, lo desborda
 * y lo corta contra el borde a media palabra.
 */
/**
 * Recorta sin dejar una frase a medias.
 *
 * Antes cortaba por caracteres y ponia puntos suspensivos, y salian titulos
 * como "El mecanismo tiene fecha de vencimiento: el 31 de diciembre de 2026 o
 * antes si...". Eso no es un titular acortado: es una frase sin sentido, y el
 * lector no sabe si le falta lo importante.
 *
 * Ahora se busca un final legitimo. Primero una oracion completa; si no la hay,
 * el ultimo corte natural de la frase (dos puntos, punto y coma, coma). Solo si
 * no hay ninguno se corta por palabra, y entonces si se avisa con puntos
 * suspensivos, porque ahi de verdad falta texto.
 */
function recortar(texto: string, tope: number): string {
  if (texto.length <= tope) return texto

  const cortado = texto.slice(0, tope)

  // Una oracion entera: es el corte que no se nota.
  const finFrase = Math.max(
    cortado.lastIndexOf(". "),
    cortado.lastIndexOf("? "),
    cortado.lastIndexOf("! ")
  )
  if (finFrase > tope * 0.3) return cortado.slice(0, finFrase + 1).trimEnd()

  // Una pausa fuerte: la frase queda coja pero se entiende sola.
  const pausa = Math.max(
    cortado.lastIndexOf(": "),
    cortado.lastIndexOf("; "),
    cortado.lastIndexOf(", ")
  )
  if (pausa > tope * 0.3) {
    return `${cortado.slice(0, pausa).trimEnd().replace(/[.,;:]$/, "")}.`
  }

  const ultimoEspacio = cortado.lastIndexOf(" ")
  const limpio = (ultimoEspacio > tope * 0.6 ? cortado.slice(0, ultimoEspacio) : cortado).trimEnd()

  return `${limpio.replace(/[.,;:]$/, "")}…`
}

function Foto({ src, ...estilo }: { src: string } & React.CSSProperties) {
  // Satori dibuja un subconjunto de HTML y no conoce next/image; ademas esto no
  // acaba en un navegador sino en un PNG, asi que ni la optimizacion ni el alt
  // tienen a quien servir.
  // La foto va a color aunque la paleta sea monocroma. El blanco y negro es del
  // sistema —fondo, tipografia, elementos graficos—, no de la fotografia:
  // desaturarla le quitaba justo lo que hace que el pulgar se pare, y una serie
  // se reconoce igual de bien por la tipografia y el negro.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={src} style={{ objectFit: "cover", ...estilo }} />
}

/**
 * Funde la foto en el fondo de la paleta.
 *
 * Un velo plano sobre toda la foto la apaga entera para poder leer cuatro
 * palabras. El degradado deja la mitad de arriba limpia y solo se vuelve solido
 * donde va el texto, que es lo que hace legible un titular grande sin renunciar
 * a la imagen.
 */
function Fundido({
  estilo,
  ancho,
  alto,
  desde = 32,
}: {
  estilo: Estilo
  ancho: number
  alto: number
  /** A que altura, en porcentaje, empieza a oscurecer. */
  desde?: number
}) {
  const [claro, medio, solido] = estilo.paleta.fundido

  return (
    <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: ancho, height: alto }}>
      {/* Banda de arriba: sostiene la marca cuando la foto tiene un cielo claro. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: ancho,
          height: alto,
          backgroundImage: `linear-gradient(180deg, ${estilo.paleta.veloTecho} 0%, ${claro} 24%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: ancho,
          height: alto,
          backgroundImage: `linear-gradient(180deg, ${claro} ${desde}%, ${medio} ${Math.min(
            desde + 42,
            94
          )}%, ${solido} 100%)`,
        }}
      />
    </div>
  )
}

/**
 * Cabecera y pie comunes: es lo que hace que las laminas sean una serie.
 *
 * `alinear` decide donde cae el contenido dentro del marco: centrado en las
 * laminas interiores y abajo en la portada, que es donde va el hook.
 */
function Marco({
  estilo,
  numero,
  total,
  children,
  fondo,
  foto,
  sobreFoto = false,
  alinear = "centro",
}: {
  estilo: Estilo
  numero: number
  total: number
  children: React.ReactNode
  fondo: string
  sobreFoto?: boolean
  alinear?: "centro" | "abajo"
  /**
   * Foto de fondo, ya descargada.
   *
   * Las laminas de solo tipografia se leian como un hueco en medio del
   * carrusel: seis imagenes con foto y una negra parecia un error de
   * generacion mas que una decision. Con la foto detras y el velo delante el
   * texto se lee igual y la serie no se corta.
   */
  foto?: string | null
}) {
  const { paleta, fuente, marca, mostrarPaginacion } = estilo
  const abajo = alinear === "abajo"

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        width: ANCHO,
        height: ALTO,
        padding: MARGEN,
        background: foto ? paleta.fondo : fondo,
        fontFamily: fuente,
        color: paleta.texto,
      }}
    >
      {foto ? (
        <>
          {/* El desplazamiento negativo no es un truco: Satori coloca lo
              absoluto dentro de la caja de relleno, no de la lamina, asi que
              sin el la foto quedaba encajada con un marco negro alrededor. */}
          <Foto
            src={foto}
            position="absolute"
            top={-MARGEN}
            left={-MARGEN}
            width={ANCHO}
            height={ALTO}
          />
          {/* El velo: aqui el texto va sin bloque detras y compite con la foto
              entera, no con una esquina. */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: -MARGEN,
              left: -MARGEN,
              width: ANCHO,
              height: ALTO,
              background: paleta.velo,
            }}
          />
        </>
      ) : null}

      {marca ? (
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 14,
              background: paleta.acento,
              marginRight: 16,
            }}
          />
          <div
            style={{
              fontSize: ESCALA.numero,
              fontWeight: 600,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: sobreFoto ? paleta.texto : paleta.textoSuave,
            }}
          >
            {marca}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", height: 14 }} />
      )}

      {/* Los dos huecos elasticos colocan el contenido sin tocar el marco. */}
      <div style={{ display: "flex", flex: 1 }} />
      {children}
      <div style={{ display: "flex", flex: abajo ? 0 : 1 }} />

      {mostrarPaginacion ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 48,
            fontSize: ESCALA.numero,
            color: sobreFoto ? paleta.texto : paleta.textoSuave,
          }}
        >
          <div style={{ display: "flex" }}>
            {numero} / {total}
          </div>
          {numero < total ? (
            <div style={{ display: "flex", fontWeight: 600, color: paleta.acento }}>desliza →</div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
        </div>
      ) : (
        <div style={{ display: "flex", height: 14 }} />
      )}
    </div>
  )
}

/**
 * Portada: foto a sangre arriba y el titular abajo.
 *
 * Es la composicion de las cuentas que funcionan, y el motivo es que las dos
 * cosas que tienen que pasar en el feed pasan en sitios distintos. La foto, a
 * color y sin nada encima en su mitad de arriba, es lo que frena el pulgar; el
 * titular, abajo y sobre fondo solido, es lo que hace deslizar. Ponerlos
 * mezclados —texto grande cruzando la foto— arruina las dos: ni se ve la imagen
 * ni se lee bien el texto.
 *
 * El antetitulo en versalitas cierra el patron: dice de que va antes de que
 * nadie lea el titular.
 */
/**
 * El elemento recortado de la portada.
 *
 * Un logo, un producto, una cara: la cosa concreta de la que habla la noticia,
 * dentro de un circulo. Es lo que hace que alguien reconozca el hecho antes de
 * leer el titular, como hace la portada de un medio, y lo que separa un post
 * que se entiende de un vistazo de una foto de archivo con texto encima.
 *
 * Vive siempre en la mitad superior. El titular ocupa la de abajo y taparlo
 * seria cambiar un problema por otro peor; dentro de esa mitad la posicion se
 * sortea, para que una serie de posts no salga toda igual.
 */
const POSICIONES_INSERTO = [
  { top: 96, left: 76 },
  { top: 96, right: 76 },
  { top: 152, right: 60 },
  { top: 152, left: 60 },
] as const

/**
 * El tamaño sale de donde empieza el titular, no del gusto.
 *
 * El hook son hasta seis lineas de 92px ancladas abajo, asi que por encima de
 * los ~540px no hay nada que tapar. Con 384 de lado y la posicion mas baja el
 * elemento acaba en 536: entra justo, y cualquier cosa mas grande empieza a
 * comerse la primera linea.
 */
const LADO_INSERTO = 384

/**
 * Circulo o cuadrado, a suertes.
 *
 * Las dos formas funcionan y alternarlas evita que una serie de posts se lea
 * como una plantilla. El cuadrado va con las esquinas redondeadas: a escuadra
 * compite con el borde de la lamina y parece un recorte mal pegado.
 */
export type FormaInserto = "circulo" | "cuadrado"

/**
 * Como encaja el elemento en su hueco.
 *
 * `llenar` recorta para cubrir, que es lo que luce con una foto o un logo
 * cuadrado. `encajar` mete la imagen entera y deja margen, que es lo unico que
 * vale para un logo apaisado: recortado pierde las puntas y deja de leerse
 * —"Asocolflores" salia como "socolflore"— y un logo que no se lee no cumple
 * su unica funcion.
 */
export type AjusteInserto = "llenar" | "encajar"

function Inserto({
  src,
  estilo,
  posicion,
  forma,
  ajuste,
}: {
  src: string
  estilo: Estilo
  posicion: number
  forma: FormaInserto
  ajuste: AjusteInserto
}) {
  const sitio = POSICIONES_INSERTO[posicion % POSICIONES_INSERTO.length]
  const redondeo = forma === "circulo" ? LADO_INSERTO : 56
  // Encajado necesita aire alrededor, o el logo toca el aro y parece pegado.
  const aire = ajuste === "encajar" ? (forma === "circulo" ? 56 : 36) : 0

  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        ...sitio,
        width: LADO_INSERTO,
        height: LADO_INSERTO,
        borderRadius: redondeo,
        padding: aire,
        alignItems: "center",
        justifyContent: "center",
        // El aro despega el circulo de la foto: sin el, un elemento de fondo
        // parecido al de la foto se funde con ella y deja de leerse como pieza.
        border: `8px solid ${estilo.paleta.acento}`,
        // Fondo blanco, no el de la paleta: casi todos los logos se dibujan en
        // oscuro sobre transparente, y sobre el negro de la paleta desaparecian
        // —el circulo salia entero negro—. Sobre blanco se leen siempre, que es
        // ademas el fondo para el que estan pensados.
        background: "#FFFFFF",
      }}
    >
      {/* El redondeo va tambien en la imagen. Satori no recorta a los hijos con
          el `overflow` del padre, asi que confiar en el dejaba un cuadrado
          blanco con las esquinas del logo asomando por fuera del aro. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={LADO_INSERTO}
        height={LADO_INSERTO}
        style={{
          width: "100%",
          height: "100%",
          objectFit: ajuste === "llenar" ? "cover" : "contain",
          borderRadius: ajuste === "llenar" ? redondeo : 0,
        }}
      />
    </div>
  )
}

function Portada({
  slide,
  total,
  estilo,
  foto,
  etiqueta,
  inserto,
  insertoPos = 0,
  insertoForma = "circulo",
  insertoAjuste = "llenar",
}: LaminaProps) {
  const { paleta } = estilo
  const hook = slide.type === "photo_hook" ? (slide.hook ?? "").trim() : ""
  const antetitulo = (etiqueta ?? "").trim()

  return (
    <div style={{ display: "flex", width: ANCHO, height: ALTO, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={ANCHO} height={ALTO} />
      ) : (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: ANCHO,
            height: ALTO,
            background: paleta.fondo,
          }}
        />
      )}

      {/* Desde el 30%: deja limpia la mitad superior, que es la que atrae. */}
      <Fundido estilo={estilo} ancho={ANCHO} alto={ALTO} desde={30} />

      {inserto ? (
        <Inserto
          src={inserto}
          estilo={estilo}
          posicion={insertoPos}
          forma={insertoForma}
          ajuste={insertoAjuste}
        />
      ) : null}

      <div style={{ display: "flex", position: "absolute", top: 0, left: 0 }}>
        <Marco estilo={estilo} numero={slide.n} total={total} fondo="transparent" sobreFoto alinear="abajo">
          <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
            {antetitulo ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: 26,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 52,
                    height: 5,
                    borderRadius: 5,
                    background: paleta.acento,
                    marginRight: 20,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    fontSize: ESCALA.antetitulo,
                    fontWeight: 600,
                    letterSpacing: 5,
                    textTransform: "uppercase",
                    color: paleta.texto,
                  }}
                >
                  {recortar(antetitulo, TOPES.antetitulo)}
                </div>
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                fontSize: ESCALA.hook,
                fontWeight: 700,
                lineHeight: 1.06,
                letterSpacing: -2,
                width: UTIL,
              }}
            >
              {recortar(hook, TOPES.hook)}
            </div>
          </div>
        </Marco>
      </div>
    </div>
  )
}

/** Texto sobre una foto a sangre, para las laminas interiores. */
function SobreFoto({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""

  return (
    <div style={{ display: "flex", width: ANCHO, height: ALTO, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={ANCHO} height={ALTO} />
      ) : (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: ANCHO,
            height: ALTO,
            background: paleta.fondo,
          }}
        />
      )}

      {/* Mas bajo que en la portada: aqui manda el texto, no la imagen. */}
      <Fundido estilo={estilo} ancho={ANCHO} alto={ALTO} desde={14} />

      <div style={{ display: "flex", position: "absolute", top: 0, left: 0 }}>
        <Marco estilo={estilo} numero={slide.n} total={total} fondo="transparent" sobreFoto alinear="abajo">
          <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
            {titulo ? (
              <div
                style={{
                  display: "flex",
                  fontSize: ESCALA.titulo,
                  fontWeight: 700,
                  lineHeight: 1.12,
                  letterSpacing: -1,
                  marginBottom: cuerpo ? 28 : 0,
                }}
              >
                {recortar(titulo, TOPES.titulo)}
              </div>
            ) : null}
            {cuerpo ? (
              <div style={{ display: "flex", fontSize: ESCALA.cuerpo, lineHeight: 1.4 }}>
                {recortar(cuerpo, TOPES.cuerpoAjustado)}
              </div>
            ) : null}
          </div>
        </Marco>
      </div>
    </div>
  )
}

/**
 * Foto arriba y texto debajo, las dos dentro del marco.
 *
 * La foto va recuadrada y no a sangre a proposito: en esta composicion es
 * contenido, no fondo, y sacarla al borde rompia el unico eje que comparten
 * todas las laminas.
 */
function FotoLateral({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""
  const altoFoto = Math.round(ALTO * 0.34)

  return (
    <Marco estilo={estilo} numero={slide.n} total={total} fondo={paleta.fondo}>
      <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
        {foto ? (
          <Foto src={foto} width={UTIL} height={altoFoto} borderRadius={18} />
        ) : (
          <div
            style={{
              display: "flex",
              width: UTIL,
              height: altoFoto,
              borderRadius: 18,
              background: paleta.fondoAlterno,
            }}
          />
        )}

        {titulo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.titulo,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -1,
              marginTop: 44,
              marginBottom: cuerpo ? 24 : 0,
            }}
          >
            {recortar(titulo, TOPES.titulo)}
          </div>
        ) : null}

        {cuerpo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.cuerpo,
              lineHeight: 1.4,
              color: paleta.textoSuave,
              marginTop: titulo ? 0 : 44,
            }}
          >
            {recortar(cuerpo, TOPES.cuerpoAjustado)}
          </div>
        ) : null}
      </div>
    </Marco>
  )
}

/** Foto en recuadro bajo, con aire alrededor: la mas tranquila de las tres con foto. */
function FotoRecuadro({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""
  const altoFoto = Math.round(ALTO * 0.24)

  return (
    <Marco estilo={estilo} numero={slide.n} total={total} fondo={paleta.fondoAlterno}>
      <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
        {foto ? <Foto src={foto} width={UTIL} height={altoFoto} borderRadius={20} /> : null}

        {titulo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.titulo,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -1,
              marginTop: foto ? 40 : 0,
              marginBottom: cuerpo ? 20 : 0,
            }}
          >
            {recortar(titulo, TOPES.titulo)}
          </div>
        ) : null}

        {cuerpo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.cuerpo,
              lineHeight: 1.42,
              color: paleta.textoSuave,
            }}
          >
            {recortar(cuerpo, TOPES.cuerpoAjustado)}
          </div>
        ) : null}
      </div>
    </Marco>
  )
}

/**
 * Cita: el cuerpo en grande y centrado, con una barra de acento.
 *
 * Para las laminas cuyo peso esta en una frase, no en una explicacion.
 */
function Cita({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""
  const frase = cuerpo || titulo

  return (
    <Marco
      estilo={estilo}
      numero={slide.n}
      total={total}
      fondo={paleta.fondo}
      foto={foto}
      sobreFoto={Boolean(foto)}
    >
      <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
        <div
          style={{
            display: "flex",
            width: 96,
            height: 8,
            borderRadius: 8,
            background: paleta.acento,
            marginBottom: 40,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: ESCALA.cita,
            fontWeight: 600,
            lineHeight: 1.24,
            letterSpacing: -0.8,
          }}
        >
          {recortar(frase, TOPES.cita)}
        </div>
        {cuerpo && titulo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.etiqueta,
              marginTop: 32,
              color: paleta.textoSuave,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {recortar(titulo, TOPES.titulo)}
          </div>
        ) : null}
      </div>
    </Marco>
  )
}

/**
 * Dato: el numero de lamina enorme como elemento grafico.
 *
 * Da ritmo sin necesitar foto, que es util cuando el banco no devuelve nada.
 */
function Dato({ slide, total, estilo, foto }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""

  return (
    <Marco
      estilo={estilo}
      numero={slide.n}
      total={total}
      fondo={paleta.fondo}
      foto={foto}
      sobreFoto={Boolean(foto)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", width: UTIL }}>
        <div
          style={{
            display: "flex",
            fontSize: 190,
            fontWeight: 700,
            lineHeight: 0.82,
            color: paleta.acento,
            opacity: 0.32,
            marginRight: 36,
          }}
        >
          {String(slide.n).padStart(2, "0")}
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {titulo ? (
            <div
              style={{
                display: "flex",
                fontSize: ESCALA.titulo,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: -1,
                marginBottom: cuerpo ? 22 : 0,
              }}
            >
              {recortar(titulo, TOPES.titulo)}
            </div>
          ) : null}
          {cuerpo ? (
            <div
              style={{
                display: "flex",
                fontSize: ESCALA.cuerpo,
                lineHeight: 1.42,
                color: paleta.textoSuave,
              }}
            >
              {recortar(cuerpo, TOPES.cuerpoAjustado)}
            </div>
          ) : null}
        </div>
      </div>
    </Marco>
  )
}

/** Lamina de texto sin adornos: la mas sobria, para dar respiro entre las demas. */
function Lamina({ slide, total, estilo }: LaminaProps) {
  const { paleta } = estilo
  const titulo = slide.type === "text" ? (slide.title ?? "").trim() : ""
  const cuerpo = slide.type === "text" ? (slide.body ?? "").trim() : ""
  const fondo = slide.n % 2 === 0 ? paleta.fondo : paleta.fondoAlterno

  return (
    <Marco estilo={estilo} numero={slide.n} total={total} fondo={fondo}>
      <div style={{ display: "flex", flexDirection: "column", width: UTIL }}>
        {titulo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.titulo,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: -1,
              marginBottom: cuerpo ? 32 : 0,
            }}
          >
            {recortar(titulo, TOPES.titulo)}
          </div>
        ) : null}

        {cuerpo ? (
          <div
            style={{
              display: "flex",
              fontSize: ESCALA.cuerpo,
              lineHeight: 1.42,
              color: titulo ? paleta.textoSuave : paleta.texto,
            }}
          >
            {recortar(cuerpo, TOPES.cuerpoAmplio)}
          </div>
        ) : null}
      </div>
    </Marco>
  )
}

/**
 * Cierre: la invitacion a seguir la cuenta.
 *
 * Centrada y sin paginacion, para que se lea como el final y no como una lamina
 * mas. La foto va muy velada: aqui la imagen es fondo, no contenido.
 */
/**
 * El cierre en estilo perfil.
 *
 * El titular grande arriba y debajo la captura del propio perfil con el cursor
 * sobre el boton de seguir. Enseñar donde hay que pulsar convierte mucho mejor
 * que pedirlo con palabras, y por eso este estilo renuncia a la foto de fondo y
 * al logo: lo unico que tiene que mirarse es la captura.
 */
function CierrePerfil({ estilo, perfil }: { estilo: Estilo; perfil: string }) {
  const { paleta, cierre, marca } = estilo

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        // Centrado: el bloque es corto y anclado arriba dejaba un tercio de
        // lamina en negro, que se lee como un fallo de maquetacion.
        justifyContent: "center",
        width: ANCHO,
        height: ALTO,
        padding: MARGEN,
        background: paleta.fondo,
        fontFamily: estilo.fuente,
        color: paleta.texto,
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 76,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: -2,
        }}
      >
        {cierre.titulo}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 44,
          lineHeight: 1.25,
          marginTop: 18,
          maxWidth: 820,
          color: paleta.textoSuave,
        }}
      >
        {cierre.texto}
      </div>

      {/* La captura, con el cursor encima. Van en el mismo contenedor para que
          el cursor se coloque en proporcion a la imagen y no al lienzo: la
          captura puede venir con cualquier tamaño. */}
      <div
        style={{
          display: "flex",
          position: "relative",
          width: UTIL,
          marginTop: 72,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={perfil}
          alt=""
          style={{ width: UTIL, borderRadius: 28, border: `2px solid ${paleta.textoSuave}` }}
        />

        {/* Sobre el boton de seguir, que en una captura de perfil de Instagram
            cae siempre en el mismo sitio: abajo a la izquierda. Es una posicion
            fija en proporcion, no una deteccion: recortar la captura de otra
            forma la descoloca, y es mas facil recortarla bien que adivinar. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: UTIL * 0.3,
            top: "78%",
            width: 120,
            height: 120,
            borderRadius: 120,
            background: "rgba(255, 255, 255, 0.28)",
          }}
        />
        <Cursor left={UTIL * 0.33} top="82%" />
      </div>

      {marca ? (
        <div
          style={{
            display: "flex",
            marginTop: 72,
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: paleta.acento,
          }}
        >
          {marca}
        </div>
      ) : null}
    </div>
  )
}

/** La flecha del raton. Dibujada a mano: es la forma mas simple que se lee. */
function Cursor({ left, top }: { left: number; top: string }) {
  return (
    <div style={{ display: "flex", position: "absolute", left, top }}>
      <svg width="86" height="86" viewBox="0 0 24 24">
        <path
          d="M5 2 L5 20 L9.5 15.5 L12.5 22 L15.5 20.5 L12.5 14.5 L18.5 14.5 Z"
          fill="#FFFFFF"
          stroke="#0A0A0A"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export function Cierre({
  estilo,
  foto,
  logo,
  perfil,
}: {
  estilo: Estilo
  foto: string | null
  /** Ya descargado. Sin el, la lamina sale con la marca tipografica de siempre. */
  logo?: string | null
  /** La captura del perfil, ya descargada. Solo la usa el estilo perfil. */
  perfil?: string | null
}) {
  // Sin captura el estilo perfil no tiene nada que enseñar, asi que se cae al
  // de marca en vez de publicar una lamina con un hueco.
  if (estilo.cierre.estilo === "perfil" && perfil) {
    return <CierrePerfil estilo={estilo} perfil={perfil} />
  }

  const { paleta, marca, cierre } = estilo

  return (
    <div style={{ display: "flex", width: ANCHO, height: ALTO, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={ANCHO} height={ALTO} />
      ) : null}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: ANCHO,
          height: ALTO,
          // El velo de la paleta, reforzado: aqui el texto va centrado y sin
          // bloque detras, asi que necesita el fondo mas tranquilo que el resto.
          background: foto ? paleta.veloFuerte : paleta.fondo,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "absolute",
          top: 0,
          left: 0,
          width: ANCHO,
          height: ALTO,
          padding: MARGEN,
          fontFamily: estilo.fuente,
          color: paleta.texto,
          textAlign: "center",
        }}
      >
        {/* El logo si esta subido; si no, el punto de siempre. Dejar el hueco
            vacio descolgaria el titular del centro optico de la lamina. */}
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            style={{ width: 200, height: 200, objectFit: "contain", marginBottom: 48 }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 72,
              height: 72,
              borderRadius: 72,
              background: paleta.acento,
              marginBottom: 48,
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            marginBottom: 28,
          }}
        >
          {cierre.titulo}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 40,
            lineHeight: 1.38,
            color: paleta.textoSuave,
            maxWidth: 760,
          }}
        >
          {cierre.texto}
        </div>

        {marca ? (
          <div
            style={{
              display: "flex",
              marginTop: 64,
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: paleta.acento,
            }}
          >
            {marca}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * La imagen que acompaña a un post de LinkedIn.
 *
 * Formato apaisado, que es el que LinkedIn muestra sin recortar en el feed, y el
 * mismo lenguaje que la portada del carrusel: foto a color arriba, degradado, y
 * el titular abajo sobre fondo solido. Que las dos redes compartan tratamiento
 * es lo que hace que se reconozcan como la misma cuenta.
 */
export function TarjetaLinkedin({
  titular,
  estilo,
  foto,
  ancho,
  alto,
  etiqueta,
}: {
  titular: string
  estilo: Estilo
  foto: string | null
  ancho: number
  alto: number
  etiqueta?: string | null
}) {
  const { paleta, marca } = estilo
  const antetitulo = (etiqueta ?? "").trim()
  const margen = 72
  const util = ancho - margen * 2
  const tamano = titular.length <= 70 ? 62 : titular.length <= 130 ? 50 : 42

  return (
    <div style={{ display: "flex", width: ancho, height: alto, position: "relative" }}>
      {foto ? (
        <Foto src={foto} position="absolute" top={0} left={0} width={ancho} height={alto} />
      ) : (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: ancho,
            height: alto,
            background: paleta.fondo,
          }}
        />
      )}

      {/* Apaisada y con menos alto: el degradado tiene que arrancar desde arriba
          o el titular, que ocupa la mitad de abajo, se queda sobre la foto. */}
      <Fundido estilo={estilo} ancho={ancho} alto={alto} desde={0} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          position: "absolute",
          top: 0,
          left: 0,
          width: ancho,
          height: alto,
          padding: margen,
          fontFamily: estilo.fuente,
          color: paleta.texto,
        }}
      >
        {antetitulo ? (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
            <div
              style={{
                display: "flex",
                width: 46,
                height: 5,
                borderRadius: 5,
                background: paleta.acento,
                marginRight: 18,
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: 5,
                textTransform: "uppercase",
                color: paleta.texto,
              }}
            >
              {recortar(antetitulo, TOPES.antetitulo)}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            fontSize: tamano,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1.2,
            width: util,
          }}
        >
          {titular}
        </div>

        {marca ? (
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: paleta.textoSuave,
            }}
          >
            {marca}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Elige la composicion. Si pide foto y no hay, cae a una que no la necesita. */
export function Composicion(props: LaminaProps) {
  const { variante, foto } = props

  switch (variante) {
    case "cierre":
      return <Cierre estilo={props.estilo} foto={foto} logo={props.logo} perfil={props.perfil} />
    case "portada":
      return <Portada {...props} />
    case "foto_fondo":
      return <SobreFoto {...props} />
    case "foto_lateral":
      return foto ? <FotoLateral {...props} /> : <Dato {...props} />
    case "foto_recuadro":
      return foto ? <FotoRecuadro {...props} /> : <Cita {...props} />
    case "cita":
      return <Cita {...props} />
    case "dato":
      return <Dato {...props} />
    default:
      return <Lamina {...props} />
  }
}
