"use client"

import * as React from "react"

import { DIAS_PAPELERA } from "@/lib/chat-tipos"

import s from "./chat.module.css"
import { cx, I, Ico } from "./comun"

export type PedidoBorrar = { id: string; titulo: string; definitivo: boolean }

/** La confirmacion de borrar: a la papelera, o para siempre desde ella. */
export function ModalBorrar({ pedido, onCancelar, onConfirmar }: { pedido: PedidoBorrar; onCancelar: () => void; onConfirmar: () => void }) {
  const cancelar = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    cancelar.current?.focus()
  }, [])
  React.useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar()
    }
    document.addEventListener("keydown", tecla)
    return () => document.removeEventListener("keydown", tecla)
  }, [onCancelar])

  return (
    <div
      className={s.modalwrap}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancelar()
      }}
    >
      <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="titulo-borrar">
        <div className={s.trash}>
          <Ico d={I.basura} style={{ width: 20, height: 20 }} />
        </div>
        <h2 id="titulo-borrar">{pedido.definitivo ? "¿Borrar para siempre?" : "¿Borrar esta conversación?"}</h2>
        {pedido.definitivo ? (
          <p>
            <strong>{pedido.titulo}</strong> y todos sus mensajes se borran ya y no se pueden recuperar. Las piezas que ya aprobaste siguen en
            Publicación.
          </p>
        ) : (
          <p>
            <strong>{pedido.titulo}</strong> va a la papelera y se borra para siempre en {DIAS_PAPELERA} días. Las piezas que ya aprobaste siguen
            en Publicación.
          </p>
        )}
        <div className={s.mbtns}>
          <button ref={cancelar} type="button" className={s.btn} onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className={cx(s.btn, s.red)} onClick={onConfirmar}>
            {pedido.definitivo ? "Borrar para siempre" : "Borrar conversación"}
          </button>
        </div>
      </div>
    </div>
  )
}

export type Aviso = { texto: string; accion?: { etiqueta: string; fn: () => void } }

/** El aviso de abajo, con "Deshacer" u otra accion. Se va solo. */
export function AvisoVista({ aviso, onCerrar }: { aviso: Aviso; onCerrar: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onCerrar, aviso.accion ? 5000 : 4200)
    return () => clearTimeout(t)
  }, [aviso, onCerrar])
  return (
    <div className={s.toast} role="status">
      <span>{aviso.texto}</span>
      {aviso.accion ? (
        <button
          type="button"
          onClick={() => {
            aviso.accion?.fn()
            onCerrar()
          }}
        >
          {aviso.accion.etiqueta}
        </button>
      ) : null}
    </div>
  )
}
