"use client"

import * as React from "react"

import type { Marca, PiezaVista, VersionVista } from "@/lib/chat-tipos"

import s from "./chat.module.css"
import { AG, cuando, cx, I, Ico, useFuera } from "./comun"

/** Medidas de la lamina armada (carrusel 4:5): el iframe se dibuja asi y se escala. */
const ANCHO = 1080
const ALTO = 1350

/** Lo que dura el destello de las laminas que acaba de cambiar un agente. */
const DESTELLO_MS = 2400

const escribiendo = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return Boolean(el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable))
}

/**
 * El panel de la pieza, a la derecha del chat (prototipo-chat-pieza.html): una
 * pestaña por pieza abierta, las laminas o el post, las versiones y el modo
 * Marcar.
 *
 * Al marcar, la lamina de un carrusel con maqueta se enseña armada (la misma
 * pagina que se dibuja) en un iframe aislado: cada hueco de texto se marca solo.
 * Un carrusel sin maqueta se marca por lamina entera, y un post por parrafo.
 */
export function PanelPieza(props: {
  abiertas: string[]
  activa: string
  /** Cambia cuando el hilo trae algo nuevo: puede haber una version nueva. */
  recarga: string
  montado: boolean
  marca: string
  onActivar: (id: string) => void
  onCerrar: (id: string) => void
  onCerrarTodo: () => void
  /** En el celular: vuelve al chat dejando la pieza abierta y lo marcado. */
  onOcultar: () => void
  onAvisar: (texto: string) => void
  marcas: Marca[]
  onMarcar: (m: Marca) => void
  onLimpiarMarcas: () => void
  /** Las laminas que acaba de cambiar un agente. */
  destello: { id: string; tocadas: number[]; cuando: number } | null
  /** Un agente responde o aplica un cambio. */
  ocupada: boolean
}) {
  const [vistas, setVistas] = React.useState<Record<string, PiezaVista | { error: string }>>({})
  const [vieja, setVieja] = React.useState<VersionVista | null>(null)
  const [cargandoVieja, setCargandoVieja] = React.useState(false)
  const [restaurando, setRestaurando] = React.useState(false)
  const [menu, setMenu] = React.useState(false)
  const [lamina, setLamina] = React.useState(0)
  const [marcar, setMarcar] = React.useState(true)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const cerrarMenu = React.useCallback(() => setMenu(false), [])
  useFuera(menuRef, menu, cerrarMenu)

  const { activa, recarga, onMarcar, onLimpiarMarcas } = props
  const cargar = React.useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/chat/pieza/${id}`, { cache: "no-store" })
      const data = (await r.json()) as PiezaVista | { error: string }
      setVistas((v) => ({ ...v, [id]: r.ok ? data : { error: (data as { error?: string }).error ?? "No se pudo abrir la pieza." } }))
    } catch {
      setVistas((v) => ({ ...v, [id]: { error: "No se pudo abrir la pieza." } }))
    }
  }, [])

  // Al cambiar de pieza o llegar algo nuevo al hilo, se trae de nuevo.
  React.useEffect(() => {
    const t = setTimeout(() => void cargar(activa), 0)
    return () => clearTimeout(t)
  }, [activa, recarga, cargar])

  const vista = vistas[activa]
  const pieza = vista && !("error" in vista) ? vista : null
  const total = pieza?.imagenes.length ?? 0
  const actual = Math.min(lamina, Math.max(total - 1, 0))
  // Lo publicado no se cambia, y una version vieja se mira, no se marca.
  const marcando = marcar && Boolean(pieza?.restaurable) && !vieja
  const deEsta = props.marcas.map((m, i) => ({ m, numero: i + 1 })).filter((x) => x.m.pieceId === activa)

  // Teclas: flechas para pasar laminas y M para marcar, salvo escribiendo.
  const tecla = React.useCallback(
    (key: string) => {
      if (key === "ArrowRight") setLamina((n) => Math.min(n + 1, Math.max(total - 1, 0)))
      else if (key === "ArrowLeft") setLamina((n) => Math.max(n - 1, 0))
      else if (key === "m" || key === "M") setMarcar((v) => !v)
      else if (key === "Escape") onLimpiarMarcas()
    },
    [total, onLimpiarMarcas]
  )
  React.useEffect(() => {
    if (vieja) return
    const alTeclear = (e: KeyboardEvent) => {
      if (escribiendo(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "m" || e.key === "M") tecla(e.key)
    }
    window.addEventListener("keydown", alTeclear)
    return () => window.removeEventListener("keydown", alTeclear)
  }, [vieja, tecla])

  const activar = (id: string) => {
    setVieja(null)
    setLamina(0)
    props.onActivar(id)
  }

  const verVersion = async (n: number) => {
    setMenu(false)
    if (!pieza || n === pieza.version) {
      setVieja(null)
      return
    }
    setCargandoVieja(true)
    try {
      const r = await fetch(`/api/chat/pieza/${pieza.id}/version/${n}`, { cache: "no-store" })
      const data = (await r.json()) as VersionVista & { error?: string }
      if (!r.ok) throw new Error(data.error ?? "No se pudo abrir esa versión.")
      setVieja(data)
    } catch (e) {
      props.onAvisar(e instanceof Error ? e.message : "No se pudo abrir esa versión.")
    } finally {
      setCargandoVieja(false)
    }
  }

  const restaurar = async () => {
    if (!pieza || !vieja) return
    setRestaurando(true)
    try {
      const r = await fetch(`/api/chat/pieza/${pieza.id}/restaurar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: vieja.n }),
      })
      const data = (await r.json().catch(() => ({}))) as { version?: number | null; error?: string }
      if (!r.ok) throw new Error(data.error ?? "No se pudo restaurar.")
      props.onAvisar(data.version ? `Restaurada: quedó como v${data.version}` : "Restaurada")
      setVieja(null)
      setLamina(0)
      await cargar(pieza.id)
    } catch (e) {
      props.onAvisar(e instanceof Error ? e.message : "No se pudo restaurar.")
    } finally {
      setRestaurando(false)
    }
  }

  // El destello dura un rato y se apaga solo.
  const [ahora, setAhora] = React.useState(0)
  const { destello } = props
  React.useEffect(() => {
    if (!destello) return
    const t0 = setTimeout(() => setAhora(Date.now()), 0)
    const t1 = setTimeout(() => setAhora(Date.now()), DESTELLO_MS + 50)
    return () => {
      clearTimeout(t0)
      clearTimeout(t1)
    }
  }, [destello])
  const destella = (n: number) =>
    Boolean(destello && destello.id === activa && destello.tocadas.includes(n) && ahora - destello.cuando < DESTELLO_MS)

  const marcarLaminaEntera = (n: number) => {
    if (!pieza) return
    onMarcar({ pieceId: pieza.id, red: "instagram", lamina: n, campo: null, html: "", texto: "", etiqueta: `L${n} · Lámina entera` })
  }
  const marcarParte = (n: number, p: NonNullable<PiezaVista["partes"]>[number][number]) => {
    if (!pieza) return
    onMarcar({
      pieceId: pieza.id,
      red: "instagram",
      lamina: n,
      campo: p.campo,
      ...(p.item ? { item: p.item } : {}),
      html: "",
      texto: p.texto,
      etiqueta: `L${n} · ${p.etiqueta}`,
    })
  }
  // En un carrusel sin maqueta, la lamina entera se marca sobre la imagen y sus partes en la lista.
  const enteras = deEsta.filter((x) => x.m.lamina === actual + 1 && !x.m.campo)
  const partes = marcando && vista && !("error" in vista) && vista.marcar === "lamina" ? (vista.partes?.[actual] ?? []) : []

  return (
    <aside className={s.pieza} aria-label="Pieza">
      <div className={s.pbar}>
        <button type="button" className={cx(s.tool, s.volver)} onClick={props.onOcultar}>
          <Ico d={I.atras} />
          {props.marcas.length ? `Pedir el cambio (${props.marcas.length})` : "Volver al chat"}
        </button>
        <div className={s.tabs} role="tablist" aria-label="Piezas abiertas">
          {props.abiertas.map((id) => {
            const v = vistas[id]
            const p = v && !("error" in v) ? v : null
            const red = p?.red ?? null
            return (
              <span
                key={id}
                role="tab"
                tabIndex={0}
                aria-selected={id === activa}
                className={s.tab}
                onClick={() => activar(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    activar(id)
                  }
                }}
              >
                <i style={{ background: red ? AG[red].color : "var(--line2)" }} />
                {red === "instagram" ? "Carrusel" : red === "linkedin" ? "Post" : "Pieza"}
                <button
                  type="button"
                  className={s.tabx}
                  aria-label="Cerrar esta pieza"
                  style={{ border: 0, background: "transparent", padding: 0 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onCerrar(id)
                  }}
                >
                  <Ico d={I.cerrar} style={{ width: 12, height: 12 }} />
                </button>
              </span>
            )
          })}
        </div>
        <span className={s.grow} />
        {pieza?.restaurable && !vieja ? (
          <button type="button" className={s.tool} aria-pressed={marcar} title="Marcar lo que quieres cambiar (M)" onClick={() => setMarcar(!marcar)}>
            <span className={s.cur} aria-hidden="true" />
            Marcar
          </button>
        ) : null}
        {pieza && pieza.versiones.length ? (
          <div ref={menuRef} style={{ display: "contents" }}>
            <button type="button" className={s.tool} aria-expanded={menu} onClick={() => setMenu(!menu)} title="Versiones de esta pieza">
              <span className={s.mono}>v{vieja?.n ?? pieza.version}</span>
              <Ico d={I.abajo} style={{ width: 14, height: 14 }} />
            </button>
            {menu ? (
              <div className={s.vmenu} role="menu">
                {pieza.versiones.map((v) => (
                  <button
                    key={v.n}
                    type="button"
                    role="menuitem"
                    className={cx(s.vopt, v.n === (vieja?.n ?? pieza.version) && s.on)}
                    onClick={() => void verVersion(v.n)}
                  >
                    <span className={s.mono}>v{v.n}</span>
                    <span>
                      {v.motivo ?? "Cambio"}
                      <small>
                        {v.autor}
                        {props.montado ? ` · ${cuando(v.creada)}` : ""}
                        {v.n === pieza.version ? " · actual" : ""}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <button type="button" className={s.iconbtn} aria-label="Cerrar el panel" title="Cerrar el panel" onClick={props.onCerrarTodo}>
          <Ico d={I.cerrar} />
        </button>
      </div>

      {vieja && pieza ? (
        <div className={s.oldbanner}>
          <span>
            Estás viendo la <b>v{vieja.n}</b>
            {vieja.motivo ? ` · ${vieja.motivo}` : ""}
            {pieza.red === "instagram" ? ". De las versiones viejas se guarda el texto; al restaurarla se vuelve a dibujar." : "."} Para marcar, vuelve a la actual.
          </span>
          <span className={s.grow} />
          {pieza.restaurable ? (
            <button type="button" className={s.tool} disabled={restaurando || props.ocupada} onClick={() => void restaurar()}>
              <Ico d={I.restaurar} />
              {restaurando ? (pieza.red === "instagram" ? "Redibujando…" : "Restaurando…") : "Restaurar como nueva versión"}
            </button>
          ) : null}
          <button type="button" className={s.tool} disabled={restaurando} onClick={() => setVieja(null)}>
            Volver a la actual
          </button>
        </div>
      ) : null}

      <div className={s.escena}>
        {!vista || cargandoVieja ? (
          <div className={s.pvacio}>Abriendo la pieza…</div>
        ) : "error" in vista ? (
          <div className={s.pvacio}>{vista.error}</div>
        ) : vieja ? (
          <VersionVieja v={vieja} marca={props.marca} />
        ) : vista.red === "instagram" ? (
          total ? (
            <>
              <div className={s.stage}>
                <div
                  key={destella(actual + 1) ? `d-${destello?.cuando}` : "quieta"}
                  className={cx(s.slidebox, destella(actual + 1) && s.flash)}
                >
                  {marcando && vista.marcar === "hueco" ? (
                    <LaminaMarcable
                      pieza={vista}
                      n={actual + 1}
                      marcas={deEsta.filter((x) => x.m.lamina === actual + 1)}
                      onMarcar={onMarcar}
                      onTecla={tecla}
                    />
                  ) : (
                    <>
                      {/* Las laminas ya estan dibujadas y alojadas: se enseñan tal cual. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={vista.imagenes[actual]} alt={`Lámina ${actual + 1} de ${total}`} />
                      {marcando ? (
                        <button
                          type="button"
                          className={cx(s.laminaentera, enteras.length > 0 && s.sel)}
                          aria-label={`Marcar la lámina ${actual + 1} entera`}
                          aria-pressed={enteras.length > 0}
                          onClick={() => marcarLaminaEntera(actual + 1)}
                        >
                          {enteras.map((x) => (
                            <span key={x.numero} className={s.badge}>
                              {x.numero}
                            </span>
                          ))}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
                <button type="button" className={cx(s.navbtn, s.prev)} aria-label="Lámina anterior" disabled={actual === 0} onClick={() => setLamina(actual - 1)}>
                  <Ico d={I.atras} />
                </button>
                <button type="button" className={cx(s.navbtn, s.next)} aria-label="Lámina siguiente" disabled={actual >= total - 1} onClick={() => setLamina(actual + 1)}>
                  <Ico d={I.derecha} />
                </button>
              </div>
              <div className={s.contador}>
                Lámina {actual + 1} de {total}
              </div>
              {marcando ? (
                <div className={s.panelhint}>
                  {vista.marcar === "hueco"
                    ? "Haz clic en lo que quieras cambiar. Puedes marcar varias cosas, también en otras láminas."
                    : partes.length
                      ? "Marca las partes que quieras cambiar, o haz clic en la lámina para marcarla entera."
                      : "Haz clic en la lámina para marcarla entera."}
                </div>
              ) : null}
              {partes.length ? (
                <div className={s.partes} aria-label={`Partes de la lámina ${actual + 1}`}>
                  {partes.map((p) => {
                    const marca = deEsta.find(
                      (x) => x.m.lamina === actual + 1 && x.m.campo === p.campo && (x.m.item ?? null) === (p.item ?? null)
                    )
                    return (
                      <button
                        key={`${p.campo}-${p.item ?? ""}`}
                        type="button"
                        className={cx(s.parte, marca && s.sel)}
                        aria-pressed={Boolean(marca)}
                        onClick={() => marcarParte(actual + 1, p)}
                      >
                        <span className={s.parteq}>
                          {marca ? <span className={s.badge}>{marca.numero}</span> : null}
                          {p.etiqueta}
                        </span>
                        <span className={s.partet}>{p.texto}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <div className={s.tira}>
                {vista.imagenes.map((src, i) => {
                  const n = deEsta.filter((x) => x.m.lamina === i + 1).length
                  return (
                    <button
                      key={destella(i + 1) ? `${src}-${destello?.cuando}` : src}
                      type="button"
                      className={cx(s.mini2, destella(i + 1) && s.flash)}
                      aria-current={i === actual}
                      aria-label={`Lámina ${i + 1}${n ? `, ${n} ${n === 1 ? "marca" : "marcas"}` : ""}`}
                      onClick={() => setLamina(i)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" loading="lazy" />
                      <span>{i + 1}</span>
                      {n ? <b className={s.cuenta}>{n}</b> : null}
                    </button>
                  )
                })}
              </div>
              <AccionesDePost imagenes={vista.imagenes} caption={vista.caption} hashtags={vista.hashtags} />
              {vista.caption ? (
                <details className={s.pcaption}>
                  <summary>Texto de la publicación</summary>
                  <p>
                    {vista.caption}
                    {vista.hashtags.length ? `\n\n${vista.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}` : ""}
                  </p>
                </details>
              ) : null}
            </>
          ) : (
            <div className={s.pvacio}>Este carrusel todavía no tiene láminas dibujadas.</div>
          )
        ) : vista.post ? (
          <>
            {marcando ? <div className={s.panelhint} style={{ paddingTop: 14 }}>Haz clic en un párrafo para marcarlo.</div> : null}
            <PostLinkedin
              post={vista.post}
              marca={props.marca}
              marcas={marcando ? deEsta : null}
              destella={destella}
              onParrafo={(n, texto) =>
                onMarcar({ pieceId: vista.id, red: "linkedin", lamina: n, campo: "parrafo", html: "", texto, etiqueta: `Párrafo ${n}` })
              }
            />
          </>
        ) : null}
      </div>
    </aside>
  )
}

/**
 * La lamina armada en un iframe aislado (sin acceso a esta pagina), escalada a
 * la caja. El script de dentro resalta y avisa del clic; aqui se le cuenta que
 * esta marcado para que lo pinte con su numero.
 */
function LaminaMarcable(props: {
  pieza: PiezaVista
  n: number
  marcas: { m: Marca; numero: number }[]
  onMarcar: (m: Marca) => void
  onTecla: (key: string) => void
}) {
  const { pieza, n, onMarcar, onTecla } = props
  const caja = React.useRef<HTMLDivElement>(null)
  const marco = React.useRef<HTMLIFrameElement>(null)
  const [escala, setEscala] = React.useState(0)
  const [paginas, setPaginas] = React.useState<Record<string, string | { error: string }>>({})
  // La imagen cambia de URL al redibujarse: con ella, la pagina se pide de nuevo.
  const clave = `${pieza.id}|${n}|${pieza.imagenes[n - 1] ?? ""}`
  const pagina = paginas[clave]

  React.useEffect(() => {
    if (paginas[clave]) return
    let vivo = true
    void (async () => {
      try {
        const r = await fetch(`/api/chat/pieza/${pieza.id}/lamina/${n}`, { cache: "no-store" })
        const html = r.ok ? await r.text() : null
        const error = html ? null : (((await r.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo armar la lámina.")
        if (vivo) setPaginas((p) => ({ ...p, [clave]: html ?? { error: error ?? "" } }))
      } catch {
        if (vivo) setPaginas((p) => ({ ...p, [clave]: { error: "No se pudo armar la lámina." } }))
      }
    })()
    return () => {
      vivo = false
    }
  }, [clave, paginas, pieza.id, n])

  React.useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setEscala(el.clientWidth / ANCHO)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const enviarMarcas = React.useCallback(() => {
    marco.current?.contentWindow?.postMessage(
      { hancel: "marcas", marcas: props.marcas.map((x) => ({ campo: x.m.campo, item: x.m.item ?? null, numero: x.numero })) },
      "*"
    )
  }, [props.marcas])
  React.useEffect(enviarMarcas, [enviarMarcas])

  React.useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      if (!marco.current || e.source !== marco.current.contentWindow) return
      const d = e.data as { hancel?: string; lamina?: number; campo?: string | null; item?: number | null; html?: string; texto?: string; etiqueta?: string; key?: string }
      if (d?.hancel === "lista") enviarMarcas()
      else if (d?.hancel === "tecla" && d.key) onTecla(d.key)
      else if (d?.hancel === "marca" && d.lamina === n) {
        onMarcar({
          pieceId: pieza.id,
          red: "instagram",
          lamina: n,
          campo: d.campo ?? null,
          item: d.item ?? null,
          html: String(d.html ?? "").slice(0, 800),
          texto: String(d.texto ?? "").slice(0, 400),
          etiqueta: String(d.etiqueta ?? `L${n}`).slice(0, 80),
        })
      }
    }
    window.addEventListener("message", alMensaje)
    return () => window.removeEventListener("message", alMensaje)
  }, [enviarMarcas, onMarcar, onTecla, pieza.id, n])

  const lista = typeof pagina === "string"
  return (
    <div ref={caja} className={s.marcable}>
      {/* Debajo, la lamina dibujada: se ve mientras llega la armada, o si no se pudo armar. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pieza.imagenes[n - 1]} alt={`Lámina ${n}`} />
      {lista && escala ? (
        <iframe
          ref={marco}
          title={`Lámina ${n} para marcar`}
          sandbox="allow-scripts"
          srcDoc={pagina}
          style={{ width: ANCHO, height: ALTO, transform: `scale(${escala})` }}
        />
      ) : (
        <div className={s.preparando}>{pagina && typeof pagina !== "string" ? pagina.error : "Preparando para marcar…"}</div>
      )}
    </div>
  )
}

function PostLinkedin(props: {
  post: NonNullable<PiezaVista["post"]>
  marca: string
  /** Con marcas (aunque vacias), los parrafos se marcan con un clic. */
  marcas?: { m: Marca; numero: number }[] | null
  destella?: (n: number) => boolean
  onParrafo?: (n: number, texto: string) => void
}) {
  const { post, marca } = props
  const parrafos = [post.hook && !post.body.startsWith(post.hook) ? post.hook : null, ...post.body.split(/\n\s*\n/)]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
  return (
    <div className={s.lilienzo}>
      <article className={s.lipost}>
        <div className={s.lihead}>
          <div className={s.me}>{marca.trim().charAt(0).toUpperCase() || "?"}</div>
          <div>
            <b>{marca}</b>
            <small>Borrador de LinkedIn</small>
          </div>
        </div>
        {parrafos.map((p, i) => {
          const marcas = props.marcas?.filter((x) => x.m.lamina === i + 1) ?? []
          const brilla = props.destella?.(i + 1)
          return props.marcas ? (
            <p
              key={brilla ? `${i}-brilla` : i}
              role="button"
              tabIndex={0}
              className={cx(s.parr, marcas.length > 0 && s.sel, brilla && s.flash)}
              aria-pressed={marcas.length > 0}
              onClick={() => props.onParrafo?.(i + 1, p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  props.onParrafo?.(i + 1, p)
                }
              }}
            >
              {marcas.map((x) => (
                <span key={x.numero} className={s.badge}>
                  {x.numero}
                </span>
              ))}
              {p}
            </p>
          ) : (
            <p key={brilla ? `${i}-brilla` : i} className={cx(brilla && s.flash)}>
              {p}
            </p>
          )
        })}
        {post.hashtags.length ? <div className={s.litags}>{post.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</div> : null}
      </article>
    </div>
  )
}

function VersionVieja({ v, marca }: { v: VersionVista; marca: string }) {
  if (v.post) return <PostLinkedin post={v.post} marca={marca} />
  if (!v.laminas?.length) return <div className={s.pvacio}>Esta versión no conserva el texto de sus láminas.</div>
  return (
    <>
      <div className={s.vlaminas}>
        {v.laminas.map((t, i) => (
          <div key={i} className={s.vlamina}>
            <b>Lámina {i + 1}</b>
            {t}
          </div>
        ))}
      </div>
      {v.caption ? (
        <details className={s.pcaption}>
          <summary>Texto de la publicación</summary>
          <p>{v.caption}</p>
        </details>
      ) : null}
    </>
  )
}

/** Lo que hace falta para subir el post a mano: las laminas y su texto. */
function AccionesDePost(props: { imagenes: string[]; caption: string | null; hashtags: string[] }) {
  const [aviso, setAviso] = React.useState<string | null>(null)

  const descargar = async () => {
    setAviso("Descargando…")
    try {
      for (const [i, url] of props.imagenes.entries()) {
        const blob = await (await fetch(url)).blob()
        const enlace = document.createElement("a")
        enlace.href = URL.createObjectURL(blob)
        enlace.download = `lamina-${String(i + 1).padStart(2, "0")}.png`
        enlace.click()
        URL.revokeObjectURL(enlace.href)
      }
      setAviso("Listo")
    } catch {
      setAviso("No se pudieron descargar")
    }
  }

  const copiar = async () => {
    const etiquetas = props.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
    try {
      await navigator.clipboard.writeText([props.caption ?? "", etiquetas].filter(Boolean).join("\n\n"))
      setAviso("Texto copiado")
    } catch {
      setAviso("No se pudo copiar")
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "10px 0", fontSize: 13 }}>
      <button type="button" className={s.pacc} onClick={descargar}>
        Descargar láminas
      </button>
      {props.caption ? (
        <button type="button" className={s.pacc} onClick={copiar}>
          Copiar texto
        </button>
      ) : null}
      {aviso ? <span style={{ color: "var(--muted)" }}>{aviso}</span> : null}
    </div>
  )
}
