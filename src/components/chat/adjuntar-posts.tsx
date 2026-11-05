"use client"

import * as React from "react"

import { agruparEnPosts, captionDeTextos, huellaDeCaption, MAX_POSTS_POR_LOTE, MAX_TEXTO, proporcionValida, type PostDetectado } from "@/engine/chat/posts-carpeta"

import s from "./chat.module.css"
import { cx, I, Ico, useFuera } from "./comun"

/**
 * Adjuntar posts ya hechos: fotos sueltas o carpetas, con el boton o arrastrando.
 *
 * Se sube al elegir, no al enviar: asi el mensaje sale al instante y un corte de
 * red se ve antes de escribir nada. Las piezas no existen hasta enviar, de modo
 * que arrepentirse no deja nada en el Estudio.
 */

/** Adjuntar sin escribir nada es pedir esto. */
export const PEDIDO_POR_DEFECTO = "Organiza estos posts y propónme cuándo publicarlos."

const SUBIDAS_A_LA_VEZ = 5

type Archivo = { ruta: string; archivo: File }
type Fuera = { nombre: string; motivo: string }
type PostSubido = { id: string; nombre: string; textos: { nombre: string; contenido: string }[]; portada: string | null; laminas: number }

export type LoteEnviado = { ids: string[]; fuera: Fuera[]; miniaturas: string[] }

type Estado =
  | { fase: "vacio" }
  | { fase: "leyendo" }
  | { fase: "subiendo"; hechas: number; total: number }
  | { fase: "listo"; posts: PostSubido[]; fuera: Fuera[] }
  | { fase: "error"; mensaje: string }

/** La carpeta soltada hay que recorrerla a mano: el navegador solo da la primera capa. */
async function archivosDe(entrada: FileSystemEntry, prefijo = ""): Promise<Archivo[]> {
  if (entrada.isFile) {
    const archivo = await new Promise<File>((ok, mal) => (entrada as FileSystemFileEntry).file(ok, mal))
    return [{ ruta: `${prefijo}${entrada.name}`, archivo }]
  }
  const lector = (entrada as FileSystemDirectoryEntry).createReader()
  const salida: Archivo[] = []
  // readEntries entrega por tandas: hay que pedir hasta que venga vacia.
  for (;;) {
    const tanda = await new Promise<FileSystemEntry[]>((ok, mal) => lector.readEntries(ok, mal))
    if (!tanda.length) return salida
    for (const hijo of tanda) salida.push(...(await archivosDe(hijo, `${prefijo}${entrada.name}/`)))
  }
}

async function proporcionDe(archivo: File): Promise<boolean> {
  try {
    const img = await createImageBitmap(archivo)
    const bien = proporcionValida(img.width, img.height)
    img.close()
    return bien
  } catch {
    // Si el navegador no la puede leer, que lo diga Instagram y no una suposicion.
    return true
  }
}

async function enCola<T>(lista: T[], cuantos: number, hacer: (x: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(cuantos, lista.length) }, async () => {
      while (i < lista.length) await hacer(lista[i++])
    })
  )
}

async function pedir<T>(cuerpo: unknown): Promise<T> {
  const r = await fetch("/api/chat/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) })
  const data = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(data.error ?? "No se pudo subir.")
  return data
}

export function useAdjuntarPosts() {
  const [estado, setEstado] = React.useState<Estado>({ fase: "vacio" })
  const [guardando, setGuardando] = React.useState(false)
  const registrado = React.useRef<LoteEnviado | null>(null)
  const urls = React.useRef<string[]>([])

  const soltarUrls = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u))
    urls.current = []
  }
  React.useEffect(() => soltarUrls, [])

  const subir = async (archivos: Archivo[]) => {
    registrado.current = null
    setEstado({ fase: "leyendo" })
    try {
      const porRuta = new Map(archivos.map((a) => [a.ruta, a.archivo]))
      const detectados = agruparEnPosts(archivos.map((a) => ({ ruta: a.ruta, tamano: a.archivo.size })))
      if (!detectados.length) throw new Error("No encontré imágenes ahí. Sube JPG, PNG o WebP.")
      if (detectados.length > MAX_POSTS_POR_LOTE) throw new Error(`Son ${detectados.length} posts y el máximo por vez es ${MAX_POSTS_POR_LOTE}.`)

      const fuera: Fuera[] = detectados.flatMap((p) => (p.problema ? [{ nombre: p.nombre, motivo: p.problema }] : []))
      const validos: (PostDetectado & { textosLeidos: { nombre: string; contenido: string }[] })[] = []
      for (const post of detectados.filter((p) => !p.problema)) {
        const portada = porRuta.get(post.imagenes[0])
        if (portada && !(await proporcionDe(portada))) {
          fuera.push({ nombre: post.nombre, motivo: "Su proporción no entra en un carrusel de Instagram (de 4:5 a 1.91:1)." })
          continue
        }
        const textosLeidos = await Promise.all(
          post.textos.map(async (ruta) => ({ nombre: ruta.split("/").pop() ?? ruta, contenido: (await (porRuta.get(ruta) as File).text()).slice(0, MAX_TEXTO) }))
        )
        validos.push({ ...post, textosLeidos })
      }

      const preparado = validos.length
        ? await pedir<{ posts: { id: string; nombre: string; subidas: { ruta: string; url: string }[] }[]; fuera: Fuera[] }>({
            accion: "preparar",
            posts: validos.map((p) => {
              const caption = captionDeTextos(p.textosLeidos)?.caption
              return { nombre: p.nombre, imagenes: p.imagenes, huella: caption ? huellaDeCaption(caption) : null }
            }),
          })
        : { posts: [], fuera: [] }

      const tareas = preparado.posts.flatMap((p) => p.subidas)
      let hechas = 0
      setEstado({ fase: "subiendo", hechas, total: tareas.length })
      await enCola(tareas, SUBIDAS_A_LA_VEZ, async ({ ruta, url }) => {
        const archivo = porRuta.get(ruta) as File
        const r = await fetch(url, { method: "PUT", body: archivo, headers: { "content-type": archivo.type || "application/octet-stream", "x-upsert": "false" } })
        if (!r.ok) throw new Error(`No se pudo subir ${ruta.split("/").pop()}.`)
        hechas++
        setEstado({ fase: "subiendo", hechas, total: tareas.length })
      })

      soltarUrls()
      const posts: PostSubido[] = preparado.posts.map((p) => {
        // Dos carpetas pueden llamarse igual: se casan por sus archivos, no por el nombre.
        const origen = validos.find((v) => v.imagenes[0] === p.subidas[0]?.ruta)
        const archivo = p.subidas[0] ? porRuta.get(p.subidas[0].ruta) : undefined
        const portada = archivo ? URL.createObjectURL(archivo) : null
        if (portada) urls.current.push(portada)
        return { id: p.id, nombre: p.nombre, textos: origen?.textosLeidos ?? [], portada, laminas: p.subidas.length }
      })
      setEstado({ fase: "listo", posts, fuera: [...fuera, ...preparado.fuera] })
    } catch (e) {
      setEstado({ fase: "error", mensaje: e instanceof Error ? e.message : "No se pudo subir." })
    }
  }

  const elegir = (lista: FileList | null) => {
    if (!lista?.length) return
    void subir([...lista].map((archivo) => ({ ruta: archivo.webkitRelativePath || archivo.name, archivo })))
  }

  const soltar = (datos: DataTransfer) => {
    // Las entradas hay que tomarlas ya: pasado este evento el navegador las vacia.
    const entradas = [...datos.items].map((i) => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => Boolean(e))
    if (!entradas.length) return
    void (async () => {
      try {
        const listas = await Promise.all(entradas.map((e) => archivosDe(e)))
        await subir(listas.flat())
      } catch {
        setEstado({ fase: "error", mensaje: "No pude leer lo que soltaste." })
      }
    })()
  }

  const quitar = () => {
    if (estado.fase === "listo") void pedir({ accion: "descartar", ids: estado.posts.map((p) => p.id) }).catch(() => {})
    soltarUrls()
    registrado.current = null
    setEstado({ fase: "vacio" })
  }

  /** Convierte lo subido en piezas. Null si no hay nada adjunto. Si el mensaje falla, se puede repetir. */
  const enviarLote = async (): Promise<LoteEnviado | null> => {
    if (estado.fase !== "listo") return null
    if (registrado.current) return registrado.current
    // Veinte posts tardan: sin esto, un segundo clic los manda a guardar otra vez.
    setGuardando(true)
    try {
      const r = await pedir<{ ids: string[]; fuera: Fuera[] }>({
        accion: "registrar",
        posts: estado.posts.map((p) => ({ id: p.id, nombre: p.nombre, textos: p.textos })),
      })
      registrado.current = { ids: r.ids, fuera: [...estado.fuera, ...r.fuera], miniaturas: [] }
      return registrado.current
    } finally {
      setGuardando(false)
    }
  }

  const terminar = () => {
    soltarUrls()
    registrado.current = null
    setEstado({ fase: "vacio" })
  }

  const listo = estado.fase === "listo" && estado.posts.length > 0
  const ocupado = guardando || estado.fase === "leyendo" || estado.fase === "subiendo"
  return { estado, elegir, soltar, quitar, enviarLote, terminar, listo, ocupado, guardando }
}

export type Adjuntos = ReturnType<typeof useAdjuntarPosts>

/** El clip: fotos sueltas o una carpeta. */
export function BotonAdjuntar({ adj, etiqueta, className }: { adj: Adjuntos; etiqueta?: string; className?: string }) {
  const [abierto, setAbierto] = React.useState(false)
  const raiz = React.useRef<HTMLDivElement>(null)
  const fotos = React.useRef<HTMLInputElement>(null)
  const carpeta = React.useRef<HTMLInputElement>(null)
  const cerrar = React.useCallback(() => setAbierto(false), [])
  useFuera(raiz, abierto, cerrar)

  return (
    <div ref={raiz} className={s.adjraiz}>
      <button type="button" className={className} aria-label="Adjuntar posts" title="Adjuntar posts ya hechos" aria-expanded={abierto} disabled={adj.ocupado} onClick={() => setAbierto(!abierto)}>
        <Ico d={I.clip} />
        {etiqueta}
      </button>
      {abierto ? (
        <div className={s.adjmenu} role="menu">
          <button type="button" role="menuitem" onClick={() => { setAbierto(false); fotos.current?.click() }}>
            Fotos de un post
          </button>
          <button type="button" role="menuitem" onClick={() => { setAbierto(false); carpeta.current?.click() }}>
            Carpeta con posts
          </button>
        </div>
      ) : null}
      <input
        ref={fotos}
        type="file"
        accept="image/jpeg,image/png,image/webp,.md,.txt"
        multiple
        hidden
        onChange={(e) => {
          adj.elegir(e.target.files)
          e.target.value = ""
        }}
      />
      <input
        ref={carpeta}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          adj.elegir(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}

/** Lo adjunto, encima del campo: como va la subida o lo que se va a enviar. */
export function BarraAdjuntos({ adj }: { adj: Adjuntos }) {
  const e = adj.estado
  if (e.fase === "vacio") return null

  if (e.fase === "leyendo" || e.fase === "subiendo") {
    const pct = e.fase === "subiendo" && e.total ? Math.round((e.hechas / e.total) * 100) : 0
    return (
      <div className={s.adjbarra} role="status">
        <span className={s.adjtexto}>{e.fase === "leyendo" ? "Leyendo los posts…" : `Subiendo ${e.hechas} de ${e.total} láminas…`}</span>
        <span className={s.adjprogreso}>
          <i style={{ width: `${pct}%` }} />
        </span>
      </div>
    )
  }

  if (e.fase === "error") {
    return (
      <div className={cx(s.adjbarra, s.adjerror)} role="alert">
        <span className={s.adjtexto}>{e.mensaje}</span>
        <button type="button" className={s.mini} aria-label="Cerrar" onClick={adj.quitar}>
          <Ico d={I.cerrar} style={{ width: 14, height: 14 }} />
        </button>
      </div>
    )
  }

  const laminas = e.posts.reduce((n, p) => n + p.laminas, 0)
  if (adj.guardando) {
    return (
      <div className={s.adjbarra} role="status">
        <span className={s.adjtexto}>Guardando {e.posts.length === 1 ? "el post" : `${e.posts.length} posts`}…</span>
      </div>
    )
  }
  return (
    <div className={s.adjbarra}>
      <span className={s.adjminis} aria-hidden="true">
        {e.posts.slice(0, 6).map((p) =>
          // Son archivos locales del navegador: next/image no aplica.
          // eslint-disable-next-line @next/next/no-img-element
          p.portada ? <img key={p.id} src={p.portada} alt="" /> : null
        )}
      </span>
      <span className={s.adjtexto}>
        {e.posts.length ? `${e.posts.length} ${e.posts.length === 1 ? "post" : "posts"} · ${laminas} láminas` : "Ningún post se puede subir"}
        {e.fuera.length ? <small title={e.fuera.map((f) => `${f.nombre}: ${f.motivo}`).join("\n")}> · {e.fuera.length} fuera</small> : null}
      </span>
      <button type="button" className={s.mini} aria-label="Quitar los posts adjuntos" onClick={adj.quitar}>
        <Ico d={I.cerrar} style={{ width: 14, height: 14 }} />
      </button>
    </div>
  )
}

/** Para soltar carpetas encima del campo. */
export function zonaDeSoltar(adj: Adjuntos, marcar: (v: boolean) => void) {
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      marcar(true)
    },
    onDragLeave: () => marcar(false),
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      marcar(false)
      adj.soltar(e.dataTransfer)
    },
  }
}
