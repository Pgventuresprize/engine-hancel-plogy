"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import {
  borrarConversacionYa,
  guardarConversacion,
  mandarAPapelera,
  renombrarConversacion,
  restaurarConversacion,
} from "@/app/chat/actions"
import type { AgenteChat, AgenteElegible, EstadoChat, FilaConversacion, Hilo, NoticiaAdjunta } from "@/lib/chat-tipos"
import { tituloProvisional } from "@/lib/chat-titulo"

import s from "./chat.module.css"
import { cx, I, Ico, Logo, useMontado } from "./comun"
import { Conversacion } from "./conversacion"
import { AvisoVista, ModalBorrar, type Aviso, type PedidoBorrar } from "./dialogos"
import { MenuFunciones } from "./menu-funciones"
import { PanelConversaciones } from "./panel-conversaciones"
import { Portada, type Eleccion } from "./portada"

/** Cada cuanto se mira el avance mientras algo trabaja. */
const CADA_MS = 3000

const angosta = () => typeof window !== "undefined" && window.innerWidth <= 900

/**
 * La pantalla del chat con los agentes, el inicio de Hancel. Se ve y funciona
 * como chat.html: barra superior, menu de funciones, panel de Conversaciones,
 * la portada "¿Que armamos hoy?" y la conversacion abierta.
 *
 * La conversacion abierta vive en la URL (`?c=`), para que atras y adelante y
 * los enlaces funcionen. Lo que trabaja se sigue consultando /api/chat cada
 * pocos segundos; el resto de cambios se pintan al instante y se guardan detras.
 */
export function ChatApp(props: {
  inicial: EstadoChat
  noticiasIniciales: NoticiaAdjunta[]
  usuario: { nombre: string; email: string }
  cuenta: { nombre: string; slug: string; plan: string }
  cuentas: { nombre: string; slug: string }[]
}) {
  const router = useRouter()
  const activa = useSearchParams().get("c")
  const montado = useMontado()

  const [estado, setEstado] = React.useState(props.inicial)
  const [noticias, setNoticias] = React.useState(props.noticiasIniciales)
  /** La conversacion que se esta creando, antes de que el servidor devuelva su id. */
  const [provisional, setProvisional] = React.useState<Hilo | null>(null)
  const [enviando, setEnviando] = React.useState(false)
  /** La respuesta que un agente esta escribiendo ahora, antes de guardarse. */
  const [enVivo, setEnVivo] = React.useState<{ conversacion: string; agente: AgenteChat | null; texto: string } | null>(null)
  const [faltante, setFaltante] = React.useState<string | null>(null)
  const [panel, setPanel] = React.useState(false)
  const [enPapelera, setEnPapelera] = React.useState(false)
  const [drawer, setDrawer] = React.useState(false)
  const [renombrando, setRenombrando] = React.useState<string | null>(null)
  const [borrar, setBorrar] = React.useState<PedidoBorrar | null>(null)
  const [aviso, setAviso] = React.useState<Aviso | null>(null)

  // Una consulta vieja no pisa lo que se acaba de cambiar a mano ni a otra mas nueva.
  const version = React.useRef(0)
  const ultimaConsulta = React.useRef(0)
  const activaRef = React.useRef(activa)
  React.useEffect(() => {
    activaRef.current = activa
  }, [activa])

  const refrescar = React.useCallback(async (opciones?: { noticias?: boolean }) => {
    const mia = ++ultimaConsulta.current
    const v = version.current
    const c = activaRef.current
    const q = new URLSearchParams()
    if (c) q.set("c", c)
    if (opciones?.noticias) q.set("noticias", "1")
    try {
      const r = await fetch(`/api/chat?${q}`, { cache: "no-store" })
      if (!r.ok) return
      const data = (await r.json()) as EstadoChat & { noticias?: NoticiaAdjunta[] }
      if (data.noticias) setNoticias(data.noticias)
      if (mia !== ultimaConsulta.current || v !== version.current) return
      setEstado({ conversaciones: data.conversaciones, papelera: data.papelera, hilo: data.hilo })
      setFaltante(c && !data.hilo ? c : null)
    } catch {
      // Sin red un momento: la siguiente consulta lo arregla.
    }
  }, [])

  const mutar = React.useCallback((fn: (e: EstadoChat) => EstadoChat) => {
    version.current++
    setEstado(fn)
  }, [])

  const avisar = React.useCallback((texto: string, accion?: Aviso["accion"]) => setAviso({ texto, accion }), [])
  const cerrarAviso = React.useCallback(() => setAviso(null), [])
  const fallo = React.useCallback(
    (error: string) => {
      avisar(error)
      void refrescar()
    },
    [avisar, refrescar]
  )

  // Al cambiar de conversacion (o volver con atras), se trae la nueva.
  React.useEffect(() => {
    if (!activa || estado.hilo?.conversacion.id === activa) return
    const t = setTimeout(() => void refrescar(), 0)
    return () => clearTimeout(t)
    // Solo al cambiar la conversacion: el hilo cambia en cada consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa])

  // Lo que se esta creando se ve mientras no llegue el hilo de verdad, y solo
  // donde se creo: si se navega a otra parte, deja de verse.
  const hiloReal = activa && estado.hilo?.conversacion.id === activa ? estado.hilo : null
  const enCreacion =
    provisional && (provisional.conversacion.id ? provisional.conversacion.id === activa : !activa) ? provisional : null
  const hiloAbierto = hiloReal ?? enCreacion

  // Mientras algo trabaja, se mira el avance; al volver a la pestaña, tambien.
  const algoTrabaja =
    enviando ||
    estado.conversaciones.some((c) => c.ocupado) ||
    Boolean(hiloAbierto?.trabajos.some((t) => t.estado !== "detenido"))
  React.useEffect(() => {
    if (!algoTrabaja) return
    const t = setInterval(() => void refrescar(), CADA_MS)
    return () => clearInterval(t)
  }, [algoTrabaja, refrescar])
  React.useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") void refrescar()
    }
    document.addEventListener("visibilitychange", alVolver)
    return () => document.removeEventListener("visibilitychange", alVolver)
  }, [refrescar])

  // ------------------------------------------------------------ navegar

  const ir = (id: string | null) => {
    activaRef.current = id
    window.history.pushState(null, "", id ? `/?c=${id}` : "/")
  }

  const abrir = (id: string) => {
    setProvisional(null)
    setEnPapelera(false)
    if (angosta()) setPanel(false)
    ir(id)
  }

  const nueva = () => {
    setProvisional(null)
    if (angosta()) setPanel(false)
    ir(null)
  }

  // ------------------------------------------------------------ conversaciones

  const fila = (id: string) => estado.conversaciones.find((c) => c.id === id) ?? null

  const alternarGuardada = async (id: string) => {
    const c = fila(id)
    if (!c) return
    const valor = !c.guardada
    const poner = (g: boolean) =>
      mutar((e) => ({ ...e, conversaciones: e.conversaciones.map((x) => (x.id === id ? { ...x, guardada: g } : x)) }))
    poner(valor)
    const r = await guardarConversacion(id, valor)
    if (!r.ok) return fallo(r.error)
    avisar(valor ? "Conversación guardada" : "Se quitó de guardadas", {
      etiqueta: "Deshacer",
      fn: () => {
        poner(!valor)
        void guardarConversacion(id, !valor).then((x) => (x.ok ? undefined : fallo(x.error)))
      },
    })
  }

  const empezarRenombrar = (id: string) => {
    setEnPapelera(false)
    setPanel(true)
    setRenombrando(id)
  }

  const renombrar = async (id: string, titulo: string | null) => {
    setRenombrando(null)
    const c = fila(id)
    const limpio = titulo?.replace(/\s+/g, " ").trim()
    if (!c || !limpio || limpio === c.titulo) return
    mutar((e) => ({ ...e, conversaciones: e.conversaciones.map((x) => (x.id === id ? { ...x, titulo: limpio } : x)) }))
    const r = await renombrarConversacion(id, limpio)
    if (!r.ok) fallo(r.error)
  }

  const pedirBorrar = (id: string, definitivo = false) => {
    const c = definitivo ? estado.papelera.find((x) => x.id === id) : fila(id)
    if (c) setBorrar({ id, titulo: c.titulo, definitivo })
  }

  const confirmarBorrar = async () => {
    const p = borrar
    setBorrar(null)
    if (!p) return
    if (p.definitivo) {
      mutar((e) => ({ ...e, papelera: e.papelera.filter((x) => x.id !== p.id) }))
      const r = await borrarConversacionYa(p.id)
      if (!r.ok) return fallo(r.error)
      avisar("Se borró para siempre")
      return
    }
    const c = fila(p.id)
    if (!c) return
    const borrada: FilaConversacion = { ...c, ocupado: null, borrada: new Date().toISOString() }
    mutar((e) => ({
      ...e,
      conversaciones: e.conversaciones.filter((x) => x.id !== p.id),
      papelera: [borrada, ...e.papelera],
    }))
    if (activaRef.current === p.id) nueva()
    const r = await mandarAPapelera(p.id)
    if (!r.ok) return fallo(r.error)
    avisar("Se fue a la papelera", { etiqueta: "Deshacer", fn: () => void restaurar(p.id) })
  }

  const restaurar = async (id: string) => {
    const c = estado.papelera.find((x) => x.id === id)
    mutar((e) => {
      const x = e.papelera.find((y) => y.id === id) ?? c
      return {
        ...e,
        papelera: e.papelera.filter((y) => y.id !== id),
        conversaciones: x ? [{ ...x, borrada: null }, ...e.conversaciones.filter((y) => y.id !== id)].sort((a, b) => b.actualizada.localeCompare(a.actualizada)) : e.conversaciones,
      }
    })
    const r = await restaurarConversacion(id)
    if (!r.ok) return fallo(r.error)
    void refrescar()
  }

  // ------------------------------------------------------------ conversar

  /** Pide la respuesta del agente y la pinta mientras llega; al final trae el hilo guardado. */
  const escuchar = async (id: string) => {
    setEnVivo({ conversacion: id, agente: null, texto: "" })
    try {
      const r = await fetch(`/api/chat/${id}/responder`, { method: "POST" })
      if (!r.ok || !r.body) {
        const data = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "El agente no pudo responder.")
      }
      const lector = r.body.getReader()
      const decodificar = new TextDecoder()
      let resto = ""
      for (;;) {
        const { done, value } = await lector.read()
        if (done) break
        resto += decodificar.decode(value, { stream: true })
        const lineas = resto.split("\n")
        resto = lineas.pop() ?? ""
        for (const linea of lineas) {
          if (!linea.trim()) continue
          const e = JSON.parse(linea) as { tipo: string; agente?: AgenteChat; t?: string; error?: string }
          if (e.tipo === "agente" && e.agente) {
            const agente = e.agente
            setEnVivo((v) => (v ? { ...v, agente } : v))
          } else if (e.tipo === "texto" && e.t) {
            const t = e.t
            setEnVivo((v) => (v ? { ...v, texto: v.texto + t } : v))
          } else if (e.tipo === "error") avisar(e.error ?? "El agente no pudo responder.")
        }
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : "El agente no pudo responder.")
    } finally {
      version.current++
      await refrescar()
      setEnVivo(null)
      // El nombre automatico se pone justo despues de responder.
      setTimeout(() => void refrescar(), 4000)
    }
  }

  // ------------------------------------------------------------ pedir trabajo

  const enviarPortada = async (texto: string, noticia: NoticiaAdjunta | null, eleccion: Eleccion): Promise<boolean> => {
    const agentes = (["instagram", "linkedin", "revisor"] as AgenteElegible[]).filter((k) => eleccion[k])
    const ahora = new Date().toISOString()
    setProvisional({
      conversacion: {
        id: "",
        titulo: tituloProvisional(texto, noticia, agentes),
        guardada: false,
        agentes: ["coordinador", ...agentes],
        creada: ahora,
        actualizada: ahora,
        ocupado: "coordinador",
        borrada: null,
      },
      mensajes: [{ id: "nuevo", rol: "usuario", agente: null, autor: props.usuario.nombre, contenido: texto, noticia, referencias: [], creado: ahora }],
      trabajos: [],
    })
    setEnviando(true)
    if (!angosta()) setPanel(true)
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, noticia, agentes }),
      })
      const data = (await r.json().catch(() => ({}))) as { id?: string; responder?: boolean; error?: string }
      if (!r.ok || !data.id) throw new Error(data.error ?? "No se pudo enviar.")
      const id = data.id
      // Se sigue viendo lo escrito hasta que llega el hilo de verdad.
      setProvisional((p) => (p ? { ...p, conversacion: { ...p.conversacion, id } } : p))
      ir(id)
      await refrescar()
      setEnviando(false)
      if (data.responder) await escuchar(id)
      return true
    } catch (e) {
      setProvisional(null)
      avisar(e instanceof Error ? e.message : "No se pudo enviar.")
      return false
    } finally {
      setEnviando(false)
    }
  }

  const enviarEnConversacion = async (texto: string): Promise<boolean> => {
    const id = activaRef.current
    if (!id) return false
    const ahora = new Date().toISOString()
    mutar((e) =>
      e.hilo && e.hilo.conversacion.id === id
        ? {
            ...e,
            hilo: {
              ...e.hilo,
              mensajes: [
                ...e.hilo.mensajes,
                { id: `nuevo-${ahora}`, rol: "usuario", agente: null, autor: props.usuario.nombre, contenido: texto, noticia: null, referencias: [], creado: ahora },
              ],
            },
          }
        : e
    )
    setEnviando(true)
    try {
      const r = await fetch(`/api/chat/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      })
      const data = (await r.json().catch(() => ({}))) as { responder?: boolean; error?: string }
      if (!r.ok) throw new Error(data.error ?? "No se pudo enviar.")
      version.current++
      await refrescar()
      setEnviando(false)
      if (data.responder) await escuchar(id)
      return true
    } catch (e) {
      fallo(e instanceof Error ? e.message : "No se pudo enviar.")
      return false
    } finally {
      setEnviando(false)
    }
  }

  const detener = async () => {
    const id = activaRef.current
    if (!id) return
    const r = await fetch(`/api/chat/${id}/detener`, { method: "POST" })
    if (!r.ok) avisar("No se pudo detener. Prueba otra vez.")
    version.current++
    await refrescar()
  }

  const abrirPieza = () => {
    avisar("El panel de la pieza llega en el siguiente bloque. Mientras, está en el Estudio.", {
      etiqueta: "Ir al Estudio",
      fn: () => router.push("/estudio"),
    })
  }

  // ------------------------------------------------------------ pintar

  const enChat = Boolean(activa || enCreacion)
  const filaAbierta = (activa ? (fila(activa) ?? hiloReal?.conversacion) : null) ?? enCreacion?.conversacion ?? null
  const empezado = enChat || panel

  return (
    <div className={cx(s.app, empezado && s.started)}>
      <header className={s.top}>
        <button type="button" className={s.iconbtn} aria-label="Mostrar funciones" aria-expanded={drawer} onClick={() => setDrawer(true)}>
          <Ico d={I.panel} />
        </button>
        <button type="button" onClick={nueva} style={{ border: 0, background: "transparent", padding: 0 }} aria-label="Ir al inicio del chat">
          <Logo />
        </button>
        {enChat && filaAbierta ? (
          <div className={s.crumb}>
            <span className={s.muted}>Chat</span>
            <span className={s.sep}>›</span>
            <span className={s.crumbTitle}>{filaAbierta.titulo}</span>
          </div>
        ) : null}
        <span className={s.grow} />
        <button
          type="button"
          className={cx(s.chip, s.sq)}
          aria-pressed={panel}
          onClick={() => {
            setPanel(!panel)
            setEnPapelera(false)
          }}
        >
          <Ico d={I.conv} />
          <span className={s.lbl}>Conversaciones</span>
          <span className={s.count}>{estado.conversaciones.length}</span>
        </button>
        <div className={s.me} title={`${props.cuenta.nombre} · ${props.usuario.email}`}>
          {props.cuenta.nombre.trim().charAt(0).toUpperCase() || "?"}
        </div>
      </header>

      <div className={s.body}>
        {panel ? (
          <PanelConversaciones
            conversaciones={estado.conversaciones}
            papelera={estado.papelera}
            activa={activa}
            montado={montado}
            renombrando={renombrando}
            enPapelera={enPapelera}
            onPapelera={setEnPapelera}
            onNueva={nueva}
            onAbrir={abrir}
            onGuardar={(id) => void alternarGuardada(id)}
            onEmpezarRenombrar={empezarRenombrar}
            onRenombrar={(id, t) => void renombrar(id, t)}
            onBorrar={(id) => pedirBorrar(id)}
            onRestaurar={(id) => void restaurar(id)}
            onBorrarYa={(id) => pedirBorrar(id, true)}
          />
        ) : null}

        <main className={s.main}>
          {enChat ? (
            <Conversacion
              fila={filaAbierta}
              hilo={hiloAbierto}
              faltante={!hiloAbierto && Boolean(activa) && faltante === activa}
              enviando={enviando}
              enVivo={enVivo && enVivo.conversacion === activa ? enVivo : null}
              montado={montado}
              onGuardar={() => activa && void alternarGuardada(activa)}
              onRenombrar={() => activa && empezarRenombrar(activa)}
              onNueva={nueva}
              onBorrar={() => activa && pedirBorrar(activa)}
              onEnviar={enviarEnConversacion}
              onDetener={() => void detener()}
              onAbrirPieza={abrirPieza}
            />
          ) : (
            <Portada noticias={noticias} enviando={enviando} onAbrirNoticias={() => void refrescar({ noticias: true })} onEnviar={enviarPortada} />
          )}
        </main>
      </div>

      {drawer ? <MenuFunciones onCerrar={() => setDrawer(false)} usuario={props.usuario} cuenta={props.cuenta} cuentas={props.cuentas} /> : null}
      {borrar ? <ModalBorrar pedido={borrar} onCancelar={() => setBorrar(null)} onConfirmar={() => void confirmarBorrar()} /> : null}
      {aviso ? <AvisoVista aviso={aviso} onCerrar={cerrarAviso} /> : null}
    </div>
  )
}
