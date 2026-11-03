"use client"

import * as React from "react"

import type { AgenteElegible, NoticiaAdjunta } from "@/lib/chat-tipos"

import s from "./chat.module.css"
import { AG, autoAltura, Avatar, I, Ico, puntaje, useFuera } from "./comun"

export type Eleccion = Record<AgenteElegible, boolean>

const ELEGIBLES: AgenteElegible[] = ["instagram", "linkedin", "revisor"]

/**
 * La portada "¿Que armamos hoy?": el equipo, el compositor con la noticia
 * adjunta y "¿Quien trabaja?", y una sugerencia por agente.
 */
export function Portada(props: {
  noticias: NoticiaAdjunta[]
  enviando: boolean
  onAbrirNoticias: () => void
  /** Devuelve false si no se pudo enviar: el texto se queda. */
  onEnviar: (texto: string, noticia: NoticiaAdjunta | null, eleccion: Eleccion) => Promise<boolean>
}) {
  const [texto, setTexto] = React.useState("")
  const [noticia, setNoticia] = React.useState<NoticiaAdjunta | null>(null)
  const [eleccion, setEleccion] = React.useState<Eleccion>({ instagram: true, linkedin: true, revisor: true })
  const [pop, setPop] = React.useState<"noticias" | "agentes" | null>(null)
  const campo = React.useRef<HTMLTextAreaElement>(null)
  const compositor = React.useRef<HTMLDivElement>(null)
  const cerrarPop = React.useCallback(() => setPop(null), [])
  useFuera(compositor, pop !== null, cerrarPop)

  React.useEffect(() => {
    campo.current?.focus()
  }, [])

  const enviar = async () => {
    const t = texto.trim()
    if (!t || props.enviando) return
    setPop(null)
    const ok = await props.onEnviar(t, noticia, eleccion)
    if (ok) {
      setTexto("")
      setNoticia(null)
    }
  }

  const sugerir = (agente: AgenteElegible, frase: string) => {
    setTexto(frase)
    setEleccion({ instagram: agente === "instagram", linkedin: agente === "linkedin", revisor: true })
    setNoticia(agente === "revisor" ? null : (props.noticias[0] ?? null))
    requestAnimationFrame(() => {
      autoAltura(campo.current, 220)
      campo.current?.focus()
    })
  }

  const elegidos = ELEGIBLES.filter((k) => eleccion[k])
  const etiqueta =
    elegidos.length === 3 ? (
      <>
        <Ico d={I.equipo} />
        Todos los agentes
      </>
    ) : elegidos.length === 0 ? (
      "Solo el coordinador"
    ) : (
      <>
        {elegidos.map((k) => (
          <span key={k} style={{ width: 8, height: 8, borderRadius: 99, background: AG[k].color }} />
        ))}
        {elegidos.map((k) => AG[k].nombre).join(", ")}
      </>
    )

  return (
    <section className={s.home} aria-label="Nuevo chat">
      <div className={s.homeIn}>
        <div className={s.hero}>
          <div className={s.team} aria-hidden="true">
            <Avatar agente="coordinador" />
            {ELEGIBLES.map((k) => (
              <Avatar key={k} agente={k} apagado={!eleccion[k]} />
            ))}
          </div>
          <h1>¿Qué armamos hoy?</h1>
          <p>Escríbele al equipo. El coordinador reparte el trabajo entre Instagram, LinkedIn y el revisor.</p>
        </div>

        <div className={s.composer} ref={compositor}>
          {noticia ? (
            <div className={s.newschip}>
              <div className={s.score}>{puntaje(noticia.puntaje)}</div>
              <div style={{ minWidth: 0 }}>
                <div className={s.nt}>{noticia.titulo}</div>
                <div className={s.ns}>Noticia · Ángulo decidido{noticia.fuente ? ` · ${noticia.fuente}` : ""}</div>
              </div>
              <button type="button" className={s.mini} aria-label="Quitar noticia" onClick={() => setNoticia(null)}>
                <Ico d={I.cerrar} style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ) : null}
          <label className={s.sr} htmlFor="mensaje-portada">Mensaje para los agentes</label>
          <textarea
            id="mensaje-portada"
            ref={campo}
            rows={3}
            placeholder="Pide carruseles o posts sobre cualquier tema, o que investigue algo…"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              autoAltura(e.target, 220)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void enviar()
              }
            }}
          />
          <div className={s.crow}>
            <button
              type="button"
              className={s.chip}
              aria-expanded={pop === "noticias"}
              onClick={() => {
                if (pop !== "noticias") props.onAbrirNoticias()
                setPop(pop === "noticias" ? null : "noticias")
              }}
            >
              <Ico d={I.clip} />
              Adjuntar noticia
            </button>
            <button type="button" className={s.chip} aria-expanded={pop === "agentes"} onClick={() => setPop(pop === "agentes" ? null : "agentes")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{etiqueta}</span>
              <Ico d={I.abajo} style={{ width: 14, height: 14 }} />
            </button>
            <span className={s.grow} />
            <span className={s.hint}>↵ enviar · ⇧↵ nueva línea</span>
            <button type="button" className={s.send} disabled={!texto.trim() || props.enviando} onClick={() => void enviar()}>
              {props.enviando ? "Enviando…" : "Enviar"}
              <Ico d={I.flecha} />
            </button>
          </div>

          {pop === "noticias" ? (
            <div className={s.pop} style={{ left: 12 }}>
              <div className={s.ph}>Noticias con ángulo decidido</div>
              <div className={s.popList}>
                {props.noticias.length ? (
                  props.noticias.map((n) => (
                    <button
                      key={n.angleId}
                      type="button"
                      className={s.newsopt}
                      onClick={() => {
                        setNoticia(n)
                        setPop(null)
                        campo.current?.focus()
                      }}
                    >
                      <div className={s.score}>{puntaje(n.puntaje)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className={s.nt}>{n.titulo}</div>
                        <div className={s.ns}>{n.fuente ?? "Sin fuente"}</div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className={s.popEmpty}>
                    No hay noticias con ángulo decidido sin pieza. Cuando el agente de ángulos decida uno, aparece aquí.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {pop === "agentes" ? (
            <div className={s.pop} style={{ left: 150, width: 240 }}>
              <div className={s.ph}>¿Quién trabaja?</div>
              {ELEGIBLES.map((k) => (
                <label key={k} className={s.agentopt}>
                  <input type="checkbox" checked={eleccion[k]} onChange={(e) => setEleccion({ ...eleccion, [k]: e.target.checked })} />
                  <Avatar agente={k} />
                  {AG[k].nombre}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className={s.sugs}>
          <button type="button" className={s.sug} onClick={() => sugerir("instagram", "Arma el carrusel de la noticia con mejor score para Instagram.")}>
            <b style={{ color: AG.instagram.color }}>Instagram</b>
            <span>Arma el carrusel de la noticia con mejor score</span>
          </button>
          <button type="button" className={s.sug} onClick={() => sugerir("linkedin", "Escribe el post de LinkedIn de hoy a partir del ángulo decidido.")}>
            <b style={{ color: AG.linkedin.color }}>LinkedIn</b>
            <span>Escribe el post de hoy a partir del ángulo decidido</span>
          </button>
          <button type="button" className={s.sug} onClick={() => sugerir("revisor", "Revisa los borradores frenados y dime qué falla.")}>
            <b style={{ color: AG.revisor.color }}>Revisor</b>
            <span>Revisa los borradores frenados y dime qué falla</span>
          </button>
        </div>
      </div>
    </section>
  )
}
