"use client"

import * as React from "react"

import { DIAS_PAPELERA, type FilaConversacion } from "@/lib/chat-tipos"

import s from "./chat.module.css"
import { AG, cuando, cx, esHoy, I, Ico, useFuera } from "./comun"

/**
 * El panel de Conversaciones (296 px): Hoy, Guardadas y Recientes, con
 * buscador, menu por fila, renombrar en la misma fila y, al pie, la papelera.
 */
export function PanelConversaciones(props: {
  conversaciones: FilaConversacion[]
  papelera: FilaConversacion[]
  activa: string | null
  montado: boolean
  renombrando: string | null
  enPapelera: boolean
  onPapelera: (abierta: boolean) => void
  onNueva: () => void
  onAbrir: (id: string) => void
  onGuardar: (id: string) => void
  onEmpezarRenombrar: (id: string) => void
  onRenombrar: (id: string, titulo: string | null) => void
  onBorrar: (id: string) => void
  onRestaurar: (id: string) => void
  onBorrarYa: (id: string) => void
}) {
  const [q, setQ] = React.useState("")
  const [menu, setMenu] = React.useState<string | null>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const cerrarMenu = React.useCallback(() => setMenu(null), [])
  useFuera(menuRef, menu !== null, cerrarMenu)

  const busca = q.trim().toLowerCase()

  if (props.enPapelera) {
    const lista = props.papelera.filter((c) => !busca || c.titulo.toLowerCase().includes(busca))
    return (
      <aside className={s.panel} aria-label="Papelera">
        <div className={s.panelH} style={{ justifyContent: "flex-start" }}>
          <button type="button" className={s.mini} aria-label="Volver a las conversaciones" title="Volver" onClick={() => props.onPapelera(false)}>
            <Ico d={I.atras} />
          </button>
          <h2>Papelera</h2>
        </div>
        <p className={s.panelNote}>Se borran para siempre a los {DIAS_PAPELERA} días. Las piezas que ya aprobaste siguen en Publicación.</p>
        <div className={s.list}>
          {lista.length ? (
            lista.map((c) => (
              <div key={c.id} className={s.row}>
                <div className={s.rowmain} style={{ cursor: "default" }}>
                  <span className={s.rowtxt}>
                    <span className={s.ct}>{c.titulo}</span>
                    <span className={s.cm}>{quedan(c.borrada)}</span>
                  </span>
                </div>
                <div className={s.rowact} style={{ opacity: 1 }}>
                  <button type="button" className={s.mini} title="Restaurar" aria-label={`Restaurar ${c.titulo}`} onClick={() => props.onRestaurar(c.id)}>
                    <Ico d={I.restaurar} />
                  </button>
                  <button type="button" className={s.mini} title="Borrar para siempre" aria-label={`Borrar para siempre ${c.titulo}`} onClick={() => props.onBorrarYa(c.id)}>
                    <Ico d={I.basura} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className={s.emptylist}>La papelera está vacía.</div>
          )}
        </div>
      </aside>
    )
  }

  const filtradas = props.conversaciones.filter((c) => !busca || c.titulo.toLowerCase().includes(busca))
  // Las fechas solo despues de montar: antes, todo va a Recientes.
  const hoy = filtradas.filter((c) => !c.guardada && props.montado && esHoy(c.actualizada))
  const guardadas = filtradas.filter((c) => c.guardada)
  const recientes = filtradas.filter((c) => !c.guardada && !(props.montado && esHoy(c.actualizada)))

  const fila = (c: FilaConversacion) => {
    const on = c.id === props.activa
    const abierto = menu === c.id
    if (props.renombrando === c.id) {
      return (
        <div key={c.id} className={cx(s.row, on && s.on)}>
          <div className={s.rowmain} style={{ cursor: "default" }}>
            <CampoRenombrar titulo={c.titulo} onListo={(t) => props.onRenombrar(c.id, t)} />
          </div>
        </div>
      )
    }
    return (
      <div key={c.id} ref={abierto ? menuRef : undefined} className={cx(s.row, on && s.on, abierto && s.menuOpen)}>
        <button type="button" className={s.rowmain} aria-current={on || undefined} onClick={() => props.onAbrir(c.id)}>
          {c.ocupado ? (
            <span className={s.dot} style={{ background: AG[c.ocupado].color }} />
          ) : c.guardada ? (
            <Ico d={I.marcador} style={{ marginTop: 2, fill: "#0a0a0a" }} />
          ) : null}
          <span className={s.rowtxt}>
            <span className={s.ct}>{c.titulo}</span>
            <span className={s.cm}>{meta(c, props.montado)}</span>
          </span>
        </button>
        <div className={s.rowact}>
          <button
            type="button"
            className={s.mini}
            aria-label={c.guardada ? "Quitar de guardadas" : "Guardar conversación"}
            title={c.guardada ? "Quitar de guardadas" : "Guardar"}
            onClick={() => props.onGuardar(c.id)}
          >
            <Ico d={I.marcador} style={c.guardada ? { fill: "#0a0a0a" } : undefined} />
          </button>
          <button
            type="button"
            className={s.mini}
            aria-label="Más opciones de la conversación"
            aria-expanded={abierto}
            onClick={() => setMenu(abierto ? null : c.id)}
          >
            <Ico d={I.puntos} />
          </button>
        </div>
        {abierto ? (
          <div className={s.menu} role="menu" style={{ top: 46, right: 4 }}>
            <button type="button" className={s.mi} role="menuitem" onClick={() => { setMenu(null); props.onAbrir(c.id) }}>
              <Ico d={I.chat} />
              Abrir
            </button>
            <button type="button" className={s.mi} role="menuitem" onClick={() => { setMenu(null); props.onEmpezarRenombrar(c.id) }}>
              <Ico d={I.lapiz} />
              Renombrar
            </button>
            <button type="button" className={s.mi} role="menuitem" onClick={() => { setMenu(null); props.onGuardar(c.id) }}>
              <Ico d={I.marcador} />
              {c.guardada ? "Quitar de guardadas" : "Guardar"}
            </button>
            <div className={s.msep} />
            <button type="button" className={cx(s.mi, s.danger)} role="menuitem" onClick={() => { setMenu(null); props.onBorrar(c.id) }}>
              <Ico d={I.basura} />
              Borrar
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <aside className={s.panel} aria-label="Conversaciones">
      <div className={s.panelH}>
        <h2>Conversaciones</h2>
        <button type="button" className={s.chip} style={{ height: 30, padding: "0 10px" }} onClick={props.onNueva}>
          <Ico d={I.mas} />
          Nueva
        </button>
      </div>
      <label className={s.search}>
        <span className={s.sr}>Buscar conversaciones</span>
        <Ico d={I.buscar} />
        <input type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      <div className={s.list}>
        {hoy.length ? (<><div className={s.grp}>Hoy</div>{hoy.map(fila)}</>) : null}
        {guardadas.length ? (<><div className={s.grp}>Guardadas</div>{guardadas.map(fila)}</>) : null}
        {recientes.length ? (<><div className={s.grp}>Recientes</div>{recientes.map(fila)}</>) : null}
        {!filtradas.length ? (
          <div className={s.emptylist}>
            {busca ? (
              <>Ninguna conversación coincide con “{q}”.</>
            ) : (
              <>Aún no hay conversaciones.<br />Escríbele al equipo para empezar una.</>
            )}
          </div>
        ) : null}
      </div>
      <button type="button" className={s.trashfoot} onClick={() => props.onPapelera(true)}>
        <Ico d={I.basura} />
        Papelera
        {props.papelera.length ? <span className={s.count}>{props.papelera.length}</span> : null}
      </button>
    </aside>
  )
}

function meta(c: FilaConversacion, montado: boolean): string {
  if (c.ocupado) return `${AG[c.ocupado].nombre} trabajando…`
  const nombres = c.agentes.filter((a) => a !== "coordinador").map((a) => AG[a].nombre)
  const quienes = nombres.length ? nombres.join(", ") : "Coordinador"
  return montado ? `${quienes} · ${cuando(c.actualizada)}` : quienes
}

function quedan(borrada: string | null): string {
  if (!borrada) return ""
  const pasados = Math.floor((Date.now() - new Date(borrada).getTime()) / 86_400_000)
  const n = Math.max(DIAS_PAPELERA - pasados, 0)
  return n <= 1 ? "Se borra mañana" : `Se borra en ${n} días`
}

/** El nombre editable en la misma fila: Enter guarda, Esc cancela, salir guarda. */
function CampoRenombrar({ titulo, onListo }: { titulo: string; onListo: (titulo: string | null) => void }) {
  const ref = React.useRef<HTMLInputElement>(null)
  const hecho = React.useRef(false)
  React.useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const terminar = (valor: string | null) => {
    if (hecho.current) return
    hecho.current = true
    onListo(valor)
  }
  return (
    <>
      <label className={s.sr} htmlFor="renombrar-conversacion">Nuevo nombre</label>
      <input
        ref={ref}
        id="renombrar-conversacion"
        className={s.ren}
        defaultValue={titulo}
        maxLength={120}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            terminar(e.currentTarget.value)
          }
          if (e.key === "Escape") {
            e.preventDefault()
            terminar(null)
          }
        }}
        onBlur={(e) => terminar(e.currentTarget.value)}
      />
    </>
  )
}
