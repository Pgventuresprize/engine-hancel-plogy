"use client"

import * as React from "react"

import { PlogyStudioLogo } from "@/components/plogy-studio-logo"
import type { AgenteChat } from "@/lib/chat-tipos"

import s from "./chat.module.css"

/** Los agentes como se ven en el chat: letra, nombre y color (chat.html). */
export const AG: Record<AgenteChat, { letra: string; nombre: string; bg: string; fg: string; color: string }> = {
  coordinador: { letra: "C", nombre: "Coordinador", bg: "#e6e6e4", fg: "#262626", color: "#0a0a0a" },
  instagram: { letra: "I", nombre: "Instagram", bg: "#db2777", fg: "#fff", color: "#db2777" },
  linkedin: { letra: "L", nombre: "LinkedIn", bg: "#2563eb", fg: "#fff", color: "#2563eb" },
  revisor: { letra: "R", nombre: "Revisor", bg: "#c2410c", fg: "#fff", color: "#c2410c" },
}

export const ORDEN_AGENTES: AgenteChat[] = ["coordinador", "instagram", "linkedin", "revisor"]

export function cx(...clases: (string | false | null | undefined)[]): string {
  return clases.filter(Boolean).join(" ")
}

export function Avatar({ agente, apagado, chico }: { agente: AgenteChat; apagado?: boolean; chico?: boolean }) {
  const a = AG[agente]
  return (
    <div className={cx(s.av, apagado && s.off, chico && s.sm)} style={{ background: a.bg, color: a.fg }} aria-hidden={apagado || undefined}>
      {a.letra}
    </div>
  )
}

/** "Luciano" → "LU"; "Ana Pérez" → "AP". */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase()
  return (partes[0] ?? "?").slice(0, 2).toUpperCase()
}

export function Ico({ d, style }: { d: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <svg className={s.ico} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      {d}
    </svg>
  )
}

/** Los trazos de los iconos de chat.html. */
export const I = {
  panel: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>),
  conv: <path d="M4 5h12v8H8l-4 3zM20 9v9l-3-2h-7" />,
  mas: <path d="M12 5v14M5 12h14" />,
  buscar: (<><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>),
  clip: <path d="M20 11l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />,
  abajo: <path d="M6 9l6 6 6-6" />,
  flecha: <path d="M5 12h14M13 6l6 6-6 6" />,
  marcador: <path d="M6 3h12v18l-6-4-6 4z" />,
  puntos: (<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>),
  lapiz: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  basura: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  equipo: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2.5 3 5" /></>),
  derecha: <path d="M9 6l6 6-6 6" />,
  atras: <path d="M15 6l-6 6 6 6" />,
  restaurar: <path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" />,
  salir: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  check: <path d="M5 12l5 5 9-10" />,
}

export function Logo({ grande }: { grande?: boolean }) {
  return <PlogyStudioLogo className={s.logo} style={grande ? { fontSize: 19 } : undefined} />
}

/**
 * Las fechas dependen de la zona horaria del navegador, que el servidor no
 * conoce: se pintan solo despues de montar, para no chocar con el HTML del
 * servidor.
 */
const sinSuscripcion = () => () => {}
export function useMontado(): boolean {
  return React.useSyncExternalStore(sinSuscripcion, () => true, () => false)
}

export function hora(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function esHoy(iso: string): boolean {
  return mismoDia(new Date(iso), new Date())
}

/** "hoy", "ayer" o "29 oct". */
export function cuando(iso: string): string {
  const d = new Date(iso)
  const hoy = new Date()
  if (mismoDia(d, hoy)) return "hoy"
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  if (mismoDia(d, ayer)) return "ayer"
  return d.toLocaleDateString("es", { day: "numeric", month: "short" }).replace(".", "")
}

/** Cierra un menu o ventanita al hacer clic fuera o con Esc. */
export function useFuera(ref: React.RefObject<HTMLElement | null>, activo: boolean, cerrar: () => void) {
  React.useEffect(() => {
    if (!activo) return
    const abajo = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar()
    }
    document.addEventListener("mousedown", abajo)
    document.addEventListener("keydown", tecla)
    return () => {
      document.removeEventListener("mousedown", abajo)
      document.removeEventListener("keydown", tecla)
    }
  }, [ref, activo, cerrar])
}

/** Ajusta la altura del campo a lo escrito, hasta un tope. */
export function autoAltura(t: HTMLTextAreaElement | null, max: number) {
  if (!t) return
  t.style.height = "auto"
  t.style.height = `${Math.min(t.scrollHeight, max)}px`
}

/** "8/10" a partir del puntaje de la noticia. */
export function puntaje(n: number | null): string {
  if (n === null) return "–"
  return `${Number.isInteger(n) ? n : n.toFixed(1)}/10`
}
