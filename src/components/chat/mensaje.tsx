"use client"

import * as React from "react"

import type { AgenteChat, MensajeUI, ReferenciaUI, TrabajoUI } from "@/lib/chat-tipos"

import s from "./chat.module.css"
import { AG, Avatar, cx, hora, iniciales, puntaje } from "./comun"

/** Un mensaje del hilo: de quien escribe, la linea del coordinador o un agente con sus tarjetas. */
export function MensajeVista({ m, montado, onAbrirPieza }: { m: MensajeUI; montado: boolean; onAbrirPieza: (r: ReferenciaUI) => void }) {
  const esUsuario = m.rol === "usuario"
  const agente = m.agente ?? "coordinador"
  const nombre = esUsuario ? (m.autor ?? "Tú") : AG[agente].nombre
  const color = esUsuario || agente === "coordinador" ? "var(--ink)" : AG[agente].color

  return (
    <div className={s.msg}>
      {esUsuario ? (
        <div className={s.av} style={{ background: "#0a0a0a", color: "#fff" }}>
          {iniciales(nombre)}
        </div>
      ) : (
        <Avatar agente={agente} />
      )}
      <div className={s.mb}>
        <div className={s.mh}>
          <span className={s.n} style={{ color }}>
            {nombre}
          </span>
          <span className={s.cm}>{montado ? hora(m.creado) : ""}</span>
        </div>
        {m.rol === "ruta" ? (
          <p className={cx(s.mt, s.sys)}>{conNegritas(m.contenido)}</p>
        ) : (
          <p className={s.mt}>{esUsuario ? m.contenido : conNegritas(m.contenido)}</p>
        )}
        {m.marcas.length ? (
          <div className={s.refs} aria-label="Lo que marcó en la pieza">
            {m.marcas.map((x, i) => (
              <span key={i} className={s.ref}>
                {i + 1}. {x}
              </span>
            ))}
          </div>
        ) : null}
        {m.noticia ? (
          <div className={s.newsref}>
            <span className={s.score}>{puntaje(m.noticia.puntaje)}</span>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.noticia.titulo}</span>
          </div>
        ) : null}
        {m.referencias.map((r) => (
          <TarjetaPieza key={`${r.pieceId}-${r.version ?? 0}`} r={r} onAbrir={() => onAbrirPieza(r)} />
        ))}
      </div>
    </div>
  )
}

/** "Se lo paso a **Instagram**" → con el nombre en negrita. */
function conNegritas(texto: string): React.ReactNode[] {
  return texto.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 ? <strong key={i}>{parte}</strong> : parte))
}

function TarjetaPieza({ r, onAbrir }: { r: ReferenciaUI; onAbrir: () => void }) {
  return (
    <div className={s.card}>
      {r.red === "instagram" ? (
        <div className={cx(s.thumb, s.dark)} aria-hidden="true" style={r.miniatura ? { padding: 0 } : undefined}>
          {/* La portada ya esta dibujada y alojada; next/image no aporta nada a 48 px. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.miniatura ? <img src={r.miniatura} alt="" loading="lazy" /> : null}
        </div>
      ) : (
        <div className={cx(s.thumb, s.light)} aria-hidden="true">
          <i style={{ width: "100%" }} />
          <i style={{ width: "80%" }} />
          <i style={{ width: "100%" }} />
          <i style={{ width: "60%" }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={s.cardt}>{r.titulo}</div>
        <div className={s.cm}>{r.meta}</div>
      </div>
      <button type="button" className={s.open} onClick={onAbrir}>
        Abrir
      </button>
    </div>
  )
}

/** La tarjeta de un agente que trabaja, espera su turno o quedo detenido. */
export function TrabajoVista({ t }: { t: TrabajoUI }) {
  const a = AG[t.agente]
  if (t.estado === "espera" && t.esperaA) {
    return (
      <div className={s.waiting}>
        <div className={cx(s.av, s.ghost)} style={{ color: a.color }}>
          {a.letra}
        </div>
        <span style={{ fontSize: 13, color: "var(--ink3)" }}>
          {a.nombre} espera a que {AG[t.esperaA].nombre} termine
        </span>
      </div>
    )
  }
  const detenido = t.estado === "detenido"
  const pct = t.total ? Math.round((Math.min(t.paso, t.total) / t.total) * 100) : 0
  return (
    <div className={s.msg}>
      <Avatar agente={t.agente} />
      <div className={s.mb}>
        <div className={s.mh}>
          <span className={s.n} style={{ color: a.color }}>
            {a.nombre}
          </span>
          <span className={s.cm}>{detenido ? "" : "trabajando"}</span>
        </div>
        {detenido ? (
          <div className={s.stopped}>Detenido. Puedes pedirle que siga cuando quieras.</div>
        ) : (
          <div className={s.work}>
            <div className={s.dots} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t.etiqueta}</div>
              <div className={s.bar}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className={s.cm}>
              {t.unidad} {Math.max(t.paso, 1)} de {t.total}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** El coordinador leyendo el pedido, mientras el servidor responde. */
export function PensandoVista() {
  return (
    <div className={s.msg}>
      <Avatar agente="coordinador" />
      <div className={s.mb}>
        <div className={s.mh}>
          <span className={s.n}>Coordinador</span>
          <span className={s.cm}>trabajando</span>
        </div>
        <div className={s.dots} aria-label="El coordinador está leyendo tu pedido" style={{ padding: "6px 0" }}>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}

/** La respuesta de un agente mientras la escribe. */
export function EnVivoVista({ agente, texto, aplicando }: { agente: AgenteChat; texto: string; aplicando?: boolean }) {
  const a = AG[agente]
  return (
    <div className={s.msg}>
      <Avatar agente={agente} />
      <div className={s.mb}>
        <div className={s.mh}>
          <span className={s.n} style={{ color: agente === "coordinador" ? "var(--ink)" : a.color }}>
            {a.nombre}
          </span>
          <span className={s.cm}>{aplicando ? "aplicando el cambio" : "escribiendo"}</span>
        </div>
        {texto ? <p className={s.mt}>{conNegritas(texto)}</p> : null}
        {aplicando ? (
          <div className={s.aplicando} role="status">
            <span className={s.dots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            Aplicando el cambio y volviendo a dibujar…
          </div>
        ) : texto ? null : (
          <div className={s.dots} aria-label={`${a.nombre} está pensando`} style={{ padding: "6px 0" }}>
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </div>
  )
}
