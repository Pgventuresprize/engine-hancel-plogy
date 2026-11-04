"use client"

import * as React from "react"

import type { AgenteChat, FilaConversacion, Hilo, Marca, ReferenciaUI } from "@/lib/chat-tipos"

import s from "./chat.module.css"
import { AG, autoAltura, Avatar, cx, I, Ico, ORDEN_AGENTES, useFuera } from "./comun"
import { EnVivoVista, MensajeVista, PensandoVista, TrabajoVista } from "./mensaje"

/** Una conversacion abierta: cabecera, hilo y el campo para responder (o detener). */
export function Conversacion(props: {
  fila: FilaConversacion | null
  hilo: Hilo | null
  /** No existe o esta en la papelera. */
  faltante: boolean
  enviando: boolean
  /** La respuesta que se esta escribiendo; sin agente aun, el coordinador lee. */
  enVivo: { agente: AgenteChat | null; texto: string; aplicando: boolean; herramienta: string | null } | null
  montado: boolean
  onGuardar: () => void
  onRenombrar: () => void
  onNueva: () => void
  onBorrar: () => void
  onEnviar: (texto: string) => Promise<boolean>
  onDetener: () => void
  onAbrirPieza: (r: ReferenciaUI) => void
  /** Lo marcado en la pieza del panel: va con el mensaje. */
  marcas: Marca[]
  onQuitarMarca: (m: Marca) => void
  onLimpiarMarcas: () => void
}) {
  const { fila, hilo } = props
  const [mas, setMas] = React.useState(false)
  const [texto, setTexto] = React.useState("")
  const masRef = React.useRef<HTMLDivElement>(null)
  const campo = React.useRef<HTMLTextAreaElement>(null)
  const caja = React.useRef<HTMLDivElement>(null)
  const cerrarMas = React.useCallback(() => setMas(false), [])
  useFuera(masRef, mas, cerrarMas)

  const trabajando = Boolean(hilo?.trabajos.some((t) => t.estado !== "detenido"))
  const respondiendo = props.enviando || Boolean(props.enVivo)
  const ocupado = props.enVivo
    ? (props.enVivo.agente ?? "coordinador")
    : props.enviando
      ? "coordinador"
      : trabajando
        ? (hilo?.conversacion.ocupado ?? null)
        : null

  // El hilo en orden: los mensajes y, en su sitio, las tarjetas de trabajo vivas.
  const items = React.useMemo(() => {
    if (!hilo) return []
    return [
      ...hilo.mensajes.map((m) => ({ clave: `m-${m.id}`, creado: m.creado, m, t: null })),
      ...hilo.trabajos.map((t) => ({ clave: `t-${t.id}`, creado: t.creado, m: null, t })),
    ].sort((a, b) => a.creado.localeCompare(b.creado))
  }, [hilo])

  // Abajo del todo al abrir y cuando llega algo, salvo que se este leyendo arriba.
  const abierta = hilo?.conversacion.id ?? null
  const ultimaAbierta = React.useRef<string | null>(null)
  const firma = `${items.length}-${items.at(-1)?.t?.paso ?? ""}-${props.enviando}-${props.enVivo?.texto.length ?? -1}`
  React.useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const recienAbierta = ultimaAbierta.current !== abierta
    ultimaAbierta.current = abierta
    if (recienAbierta || el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight
  }, [abierta, firma])

  React.useEffect(() => {
    campo.current?.focus()
  }, [abierta])

  const enviar = async () => {
    const t = texto.trim()
    if (!t || respondiendo || trabajando) return
    setTexto("")
    requestAnimationFrame(() => autoAltura(campo.current, 160))
    const ok = await props.onEnviar(t)
    if (!ok) setTexto(t)
  }

  const piezas = hilo ? hilo.mensajes.reduce((n, m) => n + m.referencias.length, 0) : 0
  const agentes = ORDEN_AGENTES.filter((a) => fila?.agentes.includes(a))
  const n = agentes.length || 1
  const meta = ocupado
    ? `${AG[ocupado].nombre} está trabajando`
    : `${n} ${n === 1 ? "agente" : "agentes"}${piezas ? ` · ${piezas} ${piezas === 1 ? "pieza lista" : "piezas listas"} para revisar` : ""}`

  return (
    <section className={s.chat} aria-label="Chat">
      <div className={s.chathead}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className={s.t}>{fila?.titulo ?? ""}</div>
          <div className={s.cm}>{fila ? meta : ""}</div>
        </div>
        <div className={s.team} aria-label="Agentes en esta conversación">
          {agentes.map((a) => (
            <Avatar key={a} agente={a} chico />
          ))}
        </div>
        {fila && fila.id ? (
          <>
            <button type="button" className={s.savebtn} aria-pressed={fila.guardada} onClick={props.onGuardar}>
              <Ico d={I.marcador} />
              <span>{fila.guardada ? "Guardada" : "Guardar"}</span>
            </button>
            <div ref={masRef} style={{ display: "contents" }}>
              <button type="button" className={s.ibtn} aria-label="Más opciones" aria-expanded={mas} onClick={() => setMas(!mas)}>
                <Ico d={I.puntos} />
              </button>
              {mas ? (
                <div className={s.menu} role="menu" style={{ top: 54, right: 28 }}>
                  <button type="button" className={s.mi} role="menuitem" onClick={() => { setMas(false); props.onRenombrar() }}>
                    <Ico d={I.lapiz} />
                    Renombrar
                  </button>
                  <button type="button" className={s.mi} role="menuitem" onClick={() => { setMas(false); props.onNueva() }}>
                    <Ico d={I.mas} />
                    Nueva conversación
                  </button>
                  <div className={s.msep} />
                  <button type="button" className={cx(s.mi, s.danger)} role="menuitem" onClick={() => { setMas(false); props.onBorrar() }}>
                    <Ico d={I.basura} />
                    Borrar
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className={s.msgs} ref={caja}>
        <div className={s.msgsIn} aria-live="polite">
          {props.faltante ? (
            <div className={s.cargando}>
              Esta conversación ya no existe o está en la papelera.{" "}
              <button type="button" className={s.open} onClick={props.onNueva}>
                Empezar una nueva
              </button>
            </div>
          ) : !hilo ? (
            <div className={s.cargando}>Cargando la conversación…</div>
          ) : (
            items.map((it) =>
              it.m ? (
                <MensajeVista key={it.clave} m={it.m} montado={props.montado} onAbrirPieza={props.onAbrirPieza} />
              ) : it.t ? (
                <TrabajoVista key={it.clave} t={it.t} />
              ) : null
            )
          )}
          {props.enVivo?.agente ? (
            <EnVivoVista agente={props.enVivo.agente} texto={props.enVivo.texto} aplicando={props.enVivo.aplicando} herramienta={props.enVivo.herramienta} />
          ) : respondiendo ? (
            <PensandoVista />
          ) : null}
        </div>
      </div>

      <div className={cx(s.dock, props.marcas.length > 0 && s.conMarcas)}>
        {props.marcas.length ? (
          <div className={s.selchips} aria-label="Lo marcado en la pieza">
            {props.marcas.map((m, i) => (
              <button
                key={`${m.pieceId}-${m.lamina}-${m.campo ?? ""}-${m.item ?? ""}`}
                type="button"
                className={s.selchip}
                title="Quitar esta marca"
                onClick={() => props.onQuitarMarca(m)}
              >
                {i + 1}. {m.etiqueta}
                <span aria-hidden="true">×</span>
              </button>
            ))}
            {props.marcas.length > 1 ? (
              <button type="button" className={s.selclear} onClick={props.onLimpiarMarcas}>
                Quitar todo
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={s.dockc}>
          <label className={s.sr} htmlFor="mensaje-chat">Mensaje para los agentes</label>
          <textarea
            id="mensaje-chat"
            ref={campo}
            rows={1}
            placeholder={
              props.marcas.length === 1
                ? "¿Qué le cambio a lo marcado?"
                : props.marcas.length
                  ? `¿Qué le cambio a estas ${props.marcas.length} cosas?`
                  : "Responde o pide un cambio…"
            }
            value={texto}
            disabled={props.faltante}
            onChange={(e) => {
              setTexto(e.target.value)
              autoAltura(e.target, 160)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void enviar()
              }
            }}
          />
          {trabajando ? (
            <button type="button" className={cx(s.sq36, s.go)} aria-label="Detener" title="Detener" onClick={props.onDetener}>
              <span className={s.stopsq} />
            </button>
          ) : (
            <button
              type="button"
              className={cx(s.sq36, s.go)}
              aria-label="Enviar"
              disabled={!texto.trim() || respondiendo || props.faltante || !hilo}
              onClick={() => void enviar()}
            >
              <Ico d={I.flecha} />
            </button>
          )}
        </div>
        {props.marcas.length ? (
          <div className={s.dockhint}>
            El agente solo toca lo marcado. <kbd>Esc</kbd> quita las marcas.
          </div>
        ) : null}
      </div>
    </section>
  )
}
