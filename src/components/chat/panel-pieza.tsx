"use client"

import * as React from "react"

import type { PiezaVista, VersionVista } from "@/lib/chat-tipos"

import s from "./chat.module.css"
import { AG, cuando, cx, I, Ico, useFuera } from "./comun"

/**
 * El panel de la pieza, a la derecha del chat (prototipo-chat-pieza.html): una
 * pestaña por pieza abierta, las laminas tal como se publican o el post, y las
 * versiones. Marcar componentes llega en la fase 3.
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
  onAvisar: (texto: string) => void
}) {
  const [vistas, setVistas] = React.useState<Record<string, PiezaVista | { error: string }>>({})
  const [vieja, setVieja] = React.useState<VersionVista | null>(null)
  const [cargandoVieja, setCargandoVieja] = React.useState(false)
  const [restaurando, setRestaurando] = React.useState(false)
  const [menu, setMenu] = React.useState(false)
  const [lamina, setLamina] = React.useState(0)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const cerrarMenu = React.useCallback(() => setMenu(false), [])
  useFuera(menuRef, menu, cerrarMenu)

  const { activa, recarga } = props
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

  // Flechas del teclado para pasar laminas, salvo escribiendo.
  React.useEffect(() => {
    if (!total || vieja) return
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return
      if (e.key === "ArrowRight") setLamina((n) => Math.min(n + 1, total - 1))
      if (e.key === "ArrowLeft") setLamina((n) => Math.max(n - 1, 0))
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [total, vieja])

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

  return (
    <aside className={s.pieza} aria-label="Pieza">
      <div className={s.pbar}>
        <button type="button" className={cx(s.tool, s.volver)} onClick={props.onCerrarTodo}>
          <Ico d={I.atras} />
          Volver al chat
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
                <i style={{ background: red ? AG[red].color : "#c4c4c2" }} />
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
            {pieza.red === "instagram" ? ". De las versiones viejas se guarda el texto; al restaurarla se vuelve a dibujar." : "."}
          </span>
          <span className={s.grow} />
          {pieza.restaurable ? (
            <button type="button" className={s.tool} disabled={restaurando} onClick={() => void restaurar()}>
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
                <div className={s.slidebox}>
                  {/* Las laminas ya estan dibujadas y alojadas: se enseñan tal cual. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={vista.imagenes[actual]} alt={`Lámina ${actual + 1} de ${total}`} />
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
              <div className={s.tira}>
                {vista.imagenes.map((src, i) => (
                  <button key={src} type="button" className={s.mini2} aria-current={i === actual} aria-label={`Lámina ${i + 1}`} onClick={() => setLamina(i)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" loading="lazy" />
                    <span>{i + 1}</span>
                  </button>
                ))}
              </div>
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
          <PostLinkedin post={vista.post} marca={props.marca} />
        ) : null}
      </div>
    </aside>
  )
}

function PostLinkedin({ post, marca }: { post: NonNullable<PiezaVista["post"]>; marca: string }) {
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
        {parrafos.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
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
