"use client"

import * as React from "react"

import {
  ArrowRight,
  BriefcaseBusiness,
  ChevronRight,
  Download,
  FileText,
  Gem,
  Images,
  Loader2,
  Package,
  Shapes,
  Store,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react"

import { PlogyStudioLogo } from "@/components/plogy-studio-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Brief } from "@/engine/onboarding/brief"
import type { Analisis, ArchivoSubido } from "@/engine/onboarding/estratega"
import { avance, completo, NOMBRE_TIPO, parsePaleta, requisitosDe, TIPOS_MARCA, type Dato, type TipoMarca } from "@/engine/onboarding/requisitos"
import { cn } from "@/lib/utils"

/**
 * El onboarding en pantalla. No guarda nada propio: cada accion va al servidor y
 * vuelve el analisis al dia, asi cerrar la pestaña no pierde nada.
 */

const ETIQUETA: Record<Dato["origen"], string> = {
  persona: "Lo dijiste tú",
  fuente: "Lo encontramos",
  studio: "Propuesto por el Studio",
}

async function enviar(cuerpo: Record<string, unknown>): Promise<Analisis> {
  const res = await fetch("/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  })
  const json = (await res.json().catch(() => ({}))) as Analisis & { error?: string }
  if (!res.ok) throw new Error(json.error || "Algo falló. Intenta otra vez.")
  return json
}

const EXTENSION_A_TIPO: Record<string, string> = { md: "text/markdown", txt: "text/plain", pdf: "application/pdf" }

/** Sube directo al storage: el archivo no pasa por el servidor. */
async function subir(archivos: File[]): Promise<ArchivoSubido[]> {
  if (!archivos.length) return []
  const tipo = (f: File) => f.type || EXTENSION_A_TIPO[f.name.split(".").pop()?.toLowerCase() ?? ""] || "application/octet-stream"
  const res = await fetch("/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accion: "subidas", archivos: archivos.map((f) => ({ nombre: f.name, mime: tipo(f), bytes: f.size })) }),
  })
  const json = (await res.json().catch(() => ({}))) as { subidas?: (ArchivoSubido & { url: string })[]; error?: string }
  if (!res.ok || !json.subidas) throw new Error(json.error || "No se pudieron subir los archivos.")
  await Promise.all(
    json.subidas.map(async (s, i) => {
      const r = await fetch(s.url, { method: "PUT", body: archivos[i], headers: { "content-type": s.mime, "x-upsert": "false" } })
      if (!r.ok) throw new Error(`No se pudo subir ${s.nombre}.`)
    })
  )
  return json.subidas.map((s) => ({ ruta: s.ruta, nombre: s.nombre, mime: s.mime, bytes: s.bytes }))
}

/** Los cuatro tramos del recorrido. El brief es la llegada: ya no lleva paso. */
const PASOS = ["Tu marca", "Lo que tienes", "Completarla", "Tu primer post"]

function pasoDe(a: Analisis | null): number {
  if (!a?.tipo) return 1
  if (!a.mensajes.length) return 2
  return completo(a.datos, a.tipo as TipoMarca) && a.temas.length ? 4 : 3
}

function Pasos({ actual }: { actual: number }) {
  return (
    <div className="flex flex-col items-end gap-1.5" aria-label={`Paso ${actual} de ${PASOS.length}: ${PASOS[actual - 1]}`}>
      <div className="flex gap-1" aria-hidden>
        {PASOS.map((p, i) => (
          <span key={p} className={cn("h-1 w-7 rounded-full", i < actual ? "bg-foreground" : "bg-foreground/15")} />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {actual} de {PASOS.length} · {PASOS[actual - 1]}
      </p>
    </div>
  )
}

function Titulo({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-3xl leading-tight font-bold text-balance md:text-4xl">{titulo}</h1>
      {children ? <p className="text-muted-foreground text-sm leading-relaxed md:text-base">{children}</p> : null}
    </div>
  )
}

const CAJA = "rounded-2xl border border-border bg-white/85"
const OPCION = cn(
  CAJA,
  "group flex w-full items-center gap-4 p-4 text-left transition-colors outline-none",
  "hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
)
const CAMPO = "bg-white/85"

export function Empezar({ inicial }: { inicial: Analisis | null }) {
  const [a, setA] = React.useState<Analisis | null>(inicial)
  const [ocupado, setOcupado] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const hacer = async (mensaje: string, cuerpo: Record<string, unknown>) => {
    setOcupado(mensaje)
    setError(null)
    try {
      setA(await enviar(cuerpo))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo falló.")
    } finally {
      setOcupado(null)
    }
  }

  const traer = async (c: Entrada) => {
    setOcupado("Subiendo tus archivos")
    setError(null)
    try {
      const [archivos, fotos, [logo]] = await Promise.all([subir(c.archivos), subir(c.fotos), subir(c.logo ? [c.logo] : [])])
      setOcupado("Leyendo lo que trajiste. Puede tardar un minuto")
      setA(await enviar({ accion: "fuentes", enlaces: c.enlaces, pegado: c.pegado, permiso: c.permiso, construir: c.construir, archivos, fotos, logo }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo falló.")
    } finally {
      setOcupado(null)
    }
  }

  const saltar = async () => {
    await enviar({ accion: "saltar" }).catch(() => null)
    window.location.href = "/"
  }

  return (
    <div className="plogy-liquid min-h-svh">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-10">
        <header className="flex items-center justify-between gap-4 px-1">
          <PlogyStudioLogo className="text-xl" />
          {a?.brief ? null : <Pasos actual={pasoDe(a)} />}
        </header>
        <div className="plogy-glass flex flex-col gap-6 p-5 md:p-10">
          {!a?.tipo ? (
            <ElegirTipo ocupado={ocupado} onElegir={(tipo) => hacer("Guardando", { accion: "tipo", tipo })} />
          ) : a.brief ? (
            <Entrega a={a} />
          ) : !a.mensajes.length ? (
            <TraerMarca tipo={a.tipo} ocupado={ocupado} onEnviar={traer} />
          ) : (
            <Conversacion a={a} ocupado={ocupado} hacer={hacer} />
          )}
          {error ? (
            <div role="alert" className="border-destructive/40 text-destructive rounded-2xl border bg-white/85 p-3 text-sm">
              {error}{" "}
              <button type="button" className="font-medium underline underline-offset-2" onClick={saltar}>
                Seguir sin esto
              </button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

/** Mientras el servidor trabaja. Lo de `detalle` explica la espera, no mide un avance. */
function Espera({ mensaje, detalle }: { mensaje: string; detalle?: string[] }) {
  return (
    <div role="status" className={cn(CAJA, "flex flex-col gap-3 p-4")}>
      <p className="flex items-center gap-2.5 text-sm font-medium">
        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
        {mensaje}…
      </p>
      {detalle ? (
        <ul className="text-muted-foreground flex flex-col gap-1 pl-6.5 text-sm">
          {detalle.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const ICONO_TIPO: Record<TipoMarca, LucideIcon> = {
  persona: UserRound,
  servicios: BriefcaseBusiness,
  producto: Package,
  alto_valor: Gem,
  local: Store,
}

function ElegirTipo(props: { ocupado: string | null; onElegir: (t: TipoMarca) => void }) {
  return (
    <section className="flex flex-col gap-6">
      <Titulo titulo="¿Qué estamos creando?">Empezamos por tu marca. De aquí sale todo lo que vamos a publicar.</Titulo>
      <div className="flex flex-col gap-2.5">
        {TIPOS_MARCA.map((t) => {
          const Icono = ICONO_TIPO[t]
          return (
            <button key={t} type="button" disabled={Boolean(props.ocupado)} onClick={() => props.onElegir(t)} className={OPCION}>
              <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
                <Icono aria-hidden className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{NOMBRE_TIPO[t].titulo}</span>
                <span className="text-muted-foreground block text-sm">{NOMBRE_TIPO[t].detalle}</span>
              </span>
              <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>
          )
        })}
      </div>
    </section>
  )
}

type Entrada = { enlaces: string[]; pegado: string; permiso: boolean; construir: boolean; archivos: File[]; fotos: File[]; logo: File | null }

const MAX_ARCHIVOS = 8

/** Una zona para soltar o elegir archivos. El input queda oculto, pero sigue siendo el real. */
function Subida(props: {
  icono: LucideIcon
  titulo: string
  ayuda: string
  accept: string
  multiple?: boolean
  archivos: File[]
  onCambiar: (archivos: File[]) => void
}) {
  const Icono = props.icono
  const [encima, setEncima] = React.useState(false)
  const cuantos = props.archivos.length
  const agregar = (nuevos: FileList | null) => {
    const lista = [...(nuevos ?? [])]
    if (lista.length) props.onCambiar(props.multiple ? [...props.archivos, ...lista].slice(0, MAX_ARCHIVOS) : lista.slice(0, 1))
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setEncima(true)
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault()
          setEncima(false)
          agregar(e.dataTransfer.files)
        }}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed bg-white/60 p-4 transition-colors sm:h-full sm:flex-col sm:items-start",
          "hover:border-foreground/40 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
          encima || cuantos ? "border-foreground/50" : "border-input"
        )}
      >
        <input
          type="file"
          multiple={props.multiple}
          accept={props.accept}
          className="sr-only"
          onChange={(e) => {
            agregar(e.target.files)
            e.target.value = ""
          }}
        />
        <Icono aria-hidden className="size-5 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{props.titulo}</span>
          <span className="text-muted-foreground block text-xs">{props.ayuda}</span>
        </span>
      </label>
      {props.archivos.map((f, i) => (
        <span key={`${f.name}-${i}`} className="bg-muted flex items-center gap-1 rounded-lg py-1 pr-1 pl-2 text-xs">
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <button
            type="button"
            aria-label={`Quitar ${f.name}`}
            className="hover:bg-background rounded p-1 transition-colors"
            onClick={() => props.onCambiar(props.archivos.filter((_, j) => j !== i))}
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}
    </div>
  )
}

function TraerMarca(props: { tipo: TipoMarca; ocupado: string | null; onEnviar: (c: Entrada) => void }) {
  const [web, setWeb] = React.useState("")
  const [pegado, setPegado] = React.useState("")
  const [permiso, setPermiso] = React.useState(false)
  const [archivos, setArchivos] = React.useState<File[]>([])
  const [fotos, setFotos] = React.useState<File[]>([])
  const [logo, setLogo] = React.useState<File | null>(null)
  const persona = props.tipo === "persona"
  const algo = Boolean(web.trim() || pegado.trim() || archivos.length || fotos.length || logo)

  if (props.ocupado)
    return (
      <section className="flex flex-col gap-6">
        <Titulo titulo="Estamos leyendo tu marca" />
        <Espera
          mensaje={props.ocupado}
          detalle={["Abrimos tu web y leemos lo que subiste", "Medimos tus colores y tus fuentes", "Guardamos tus fotos en tu biblioteca"]}
        />
      </section>
    )

  return (
    <section className="flex flex-col gap-6">
      <Titulo titulo="Trae lo que tengas">Con una sola cosa basta. Mientras más traigas, menos te preguntamos.</Titulo>
      <div className="grid gap-2">
        <Label htmlFor="web">{persona ? "Tu web, si tienes" : "Tu web"}</Label>
        <Input id="web" value={web} onChange={(e) => setWeb(e.target.value)} placeholder="tumarca.com" inputMode="url" className={cn("h-11", CAMPO)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pegado">{persona ? "Tu historia" : "Lo que ya tengas escrito"}</Label>
        <Textarea
          id="pegado"
          value={pegado}
          onChange={(e) => setPegado(e.target.value)}
          rows={4}
          className={CAMPO}
          placeholder={persona ? "Pega tu bio, tu perfil de LinkedIn o tu CV, o cuéntanos quién eres." : "Pega tu bio, textos, posts o tu presentación."}
        />
      </div>
      <div className="grid gap-2">
        <p className="text-sm leading-none font-medium">Tus archivos</p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Subida
            icono={FileText}
            titulo="Documentos"
            ayuda={persona ? "CV, presentaciones, capturas" : "Manual de marca, capturas"}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
            multiple
            archivos={archivos}
            onCambiar={setArchivos}
          />
          <Subida
            icono={Images}
            titulo="Fotos"
            ayuda={persona ? "Tuyas o de tu trabajo" : "Producto, equipo, lugar"}
            accept=".png,.jpg,.jpeg,.webp"
            multiple
            archivos={fotos}
            onCambiar={setFotos}
          />
          <Subida
            icono={Shapes}
            titulo="Logo"
            ayuda="PNG, JPG o WEBP"
            accept=".png,.jpg,.jpeg,.webp"
            archivos={logo ? [logo] : []}
            onCambiar={(l) => setLogo(l[0] ?? null)}
          />
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" className="accent-foreground mt-0.5 size-4 shrink-0" checked={permiso} onChange={(e) => setPermiso(e.target.checked)} />
        Esta marca es mía o tengo autorización para usarla.
      </label>
      <div className="flex flex-col gap-3">
        <Button
          variant="brand"
          className="h-11 w-full"
          disabled={!permiso || !algo}
          onClick={() => props.onEnviar({ enlaces: web.trim() ? [web.trim()] : [], pegado, permiso, construir: false, archivos, fotos, logo })}
        >
          Seguir
        </Button>
        <Button
          variant="outline"
          className="h-11 w-full bg-white/85"
          disabled={!permiso}
          onClick={() => props.onEnviar({ enlaces: [], pegado: "", permiso, construir: true, archivos: [], fotos: [], logo: null })}
        >
          No tengo nada, quiero construir mi marca
        </Button>
      </div>
    </section>
  )
}

function Mensaje({ de, children }: { de: "persona" | "estratega"; children: React.ReactNode }) {
  if (de === "persona")
    return <div className="bg-foreground text-background ml-auto max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed">{children}</div>
  return (
    <div className="flex max-w-[92%] items-start gap-2.5">
      <PlogyStudioLogo forma="simbolo" className="mt-1 shrink-0 text-xl" />
      <div className={cn(CAJA, "rounded-tl-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap")}>{children}</div>
    </div>
  )
}

const BOTON = "h-10 px-4"

function Conversacion(props: {
  a: Analisis
  ocupado: string | null
  hacer: (mensaje: string, cuerpo: Record<string, unknown>) => Promise<void>
}) {
  const { a, ocupado, hacer } = props
  const [respuesta, setRespuesta] = React.useState("")
  const final = React.useRef<HTMLDivElement>(null)
  const tipo = a.tipo as TipoMarca
  const { listos, total } = avance(a.datos, tipo)
  const lista = completo(a.datos, tipo)
  const temas = lista && a.temas.length > 0

  React.useEffect(() => {
    final.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [a.mensajes.length, ocupado])

  const responder = async (texto: string) => {
    setRespuesta("")
    await hacer("Pensando", { accion: "responder", texto })
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Titulo titulo={temas ? "Elige tu primer post" : "Armemos tu marca"} />
        <div>
          <div className="bg-foreground/10 h-1.5 w-full overflow-hidden rounded-full">
            <div className="bg-foreground h-full rounded-full transition-all" style={{ width: `${Math.round((listos / total) * 100)}%` }} />
          </div>
          <p className="text-muted-foreground mt-1.5 text-xs">
            {listos === total ? "Tu marca está completa" : `Nos faltan ${total - listos} cosas para tu primer post`}
          </p>
        </div>
      </div>

      {a.fuentes.avisos?.length ? <p className="text-warning bg-warning-soft rounded-2xl p-3 text-sm">{a.fuentes.avisos.join(" ")}</p> : null}
      {a.fuentes.fotosGuardadas ? (
        <p className="bg-success-soft text-success flex items-center gap-2 rounded-2xl p-3 text-sm">
          <Images aria-hidden className="size-4 shrink-0" />
          Guardamos {a.fuentes.fotosGuardadas === 1 ? "1 foto" : `${a.fuentes.fotosGuardadas} fotos`} en tu biblioteca.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {a.mensajes.map((m, i) => (
          <Mensaje key={i} de={m.de}>
            {m.texto}
          </Mensaje>
        ))}
      </div>

      {temas && !a.fuentes.logoListo ? (
        <ConfirmarLogo logos={a.fuentes.logos ?? []} ocupado={ocupado} hacer={hacer} />
      ) : temas ? (
        <div className="flex flex-col gap-2.5">
          {a.temas.map((t, i) => (
            <button
              key={t.titulo}
              type="button"
              disabled={Boolean(ocupado)}
              onClick={() => hacer("Armando tu brief y las plantillas de tu marca. Tarda unos dos minutos, no cierres esta pantalla", { accion: "tema", indice: i })}
              className={OPCION}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t.titulo}</span>
                <span className="text-muted-foreground block text-sm">{t.por_que}</span>
              </span>
              <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {a.opciones.length ? (
            <div className="grid gap-2.5">
              {a.opciones.map((o) => (
                <button key={o.titulo} type="button" disabled={Boolean(ocupado)} onClick={() => responder(`Elijo: ${o.titulo}. ${o.detalle}`)} className={OPCION}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{o.titulo}</span>
                    <span className="text-muted-foreground block text-sm">{o.detalle}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <Textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            rows={3}
            className={CAMPO}
            placeholder="Escribe tu respuesta. Con una frase basta."
            disabled={Boolean(ocupado)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && respuesta.trim()) {
                e.preventDefault()
                void responder(respuesta.trim())
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" className={BOTON} disabled={!respuesta.trim() || Boolean(ocupado)} onClick={() => responder(respuesta.trim())}>
              Responder
            </Button>
            <Button variant="outline" className={cn(BOTON, "bg-white/85")} disabled={Boolean(ocupado)} onClick={() => hacer("Pensando", { accion: "ayudame" })}>
              Ayúdame
            </Button>
            <Button variant="outline" className={cn(BOTON, "bg-white/85")} disabled={Boolean(ocupado)} onClick={() => hacer("Proponiendo", { accion: "rellenar" })}>
              Rellénalo tú
            </Button>
            <Button variant="ghost" className={BOTON} disabled={Boolean(ocupado)} onClick={() => hacer("Completando tu marca", { accion: "rellenar_todo" })}>
              Rellenar todo lo que falta
            </Button>
          </div>
        </div>
      )}

      {ocupado ? <Espera mensaje={ocupado} /> : null}
      <div ref={final} />
    </section>
  )
}

/** El logo nunca se da por hecho: lo que se encontro en la web lo confirma la persona. */
function ConfirmarLogo(props: {
  logos: string[]
  ocupado: string | null
  hacer: (mensaje: string, cuerpo: Record<string, unknown>) => Promise<void>
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">¿Cuál es tu logo?</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {props.logos.slice(0, 3).map((logo) => (
          <button
            key={logo}
            type="button"
            disabled={Boolean(props.ocupado)}
            onClick={() => props.hacer("Guardando", { accion: "logo", logo })}
            className="hover:border-foreground/40 flex h-24 items-center justify-center rounded-2xl border bg-neutral-400 p-3 transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- viene de la web de la marca, no de un dominio configurado */}
            <img src={logo} alt="Posible logo" className="max-h-full max-w-full object-contain" />
          </button>
        ))}
      </div>
      <Button variant="outline" className="h-10 w-full bg-white/85" disabled={Boolean(props.ocupado)} onClick={() => props.hacer("Guardando", { accion: "logo", logo: null })}>
        Ninguno es, firmar con mi nombre
      </Button>
    </div>
  )
}

const ESTILO_ORIGEN: Record<Dato["origen"], "success" | "info" | "warning"> = { persona: "success", fuente: "info", studio: "warning" }

function Entrega({ a }: { a: Analisis }) {
  const brief = a.brief as Brief
  const tipo = a.tipo as TipoMarca
  const partes = [...new Set(requisitosDe(tipo).map((r) => r.parte))]
  const paleta = parsePaleta(a.datos.paleta?.valor)

  const descargar = () => {
    const lineas = partes.flatMap((parte) => [
      `\n# ${parte}`,
      ...requisitosDe(tipo)
        .filter((r) => r.parte === parte && a.datos[r.id]?.valor)
        .map((r) => `${r.nombre}: ${a.datos[r.id].valor}`),
    ])
    const contenido = `Brief de marca: ${brief.perfil.nombre}\n${lineas.join("\n")}\n\n# Esencia completa\n${brief.esencia}\n\n# Voz\n${brief.voz}\n\n# Lo que sabe\n${brief.sabe}\n\n# Ideas\n${brief.ideas.join("\n")}`
    const enlace = document.createElement("a")
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: "text/plain;charset=utf-8" }))
    enlace.download = `brief-${brief.perfil.nombre}.txt`
    enlace.click()
    URL.revokeObjectURL(enlace.href)
  }

  return (
    <section className="flex flex-col gap-6">
      <Titulo titulo={`El brief de ${brief.perfil.nombre}`}>Tu primer post ya se está armando. Lo propuesto por el Studio lo puedes cambiar cuando quieras en Marca.</Titulo>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="brand" className="h-11 px-6" onClick={() => (window.location.href = `/?c=${a.conversacion_id}`)}>
          Ver mi primer post
          <ArrowRight data-icon="inline-end" aria-hidden className="size-4" />
        </Button>
        <Button variant="outline" className="h-11 bg-white/85 px-6" onClick={descargar}>
          <Download data-icon="inline-start" aria-hidden className="size-4" />
          Descargar brief
        </Button>
      </div>
      {paleta ? (
        <div className="flex h-14 overflow-hidden rounded-2xl border">
          {Object.entries(paleta).map(([papel, hex]) => (
            <div key={papel} className="flex-1" style={{ background: hex }} title={`${papel}: ${hex}`} />
          ))}
        </div>
      ) : null}
      {partes.map((parte) => {
        const datos = requisitosDe(tipo).filter((r) => a.datos[r.id]?.valor && r.parte === parte)
        if (!datos.length) return null
        return (
          <div key={parte} className="flex flex-col gap-2.5">
            <h2 className="font-display text-lg font-bold">{parte}</h2>
            <div className={cn(CAJA, "divide-border divide-y")}>
              {datos.map((r) => {
                const d = a.datos[r.id]
                return (
                  <div key={r.id} className="flex flex-col gap-1 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{r.nombre}</span>
                      <Badge variant={ESTILO_ORIGEN[d.origen]}>{ETIQUETA[d.origen]}</Badge>
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{d.valor}</p>
                    {d.motivo ? <p className="text-muted-foreground text-xs">{d.motivo}</p> : null}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="flex flex-col gap-2.5">
        <h2 className="font-display text-lg font-bold">Ideas para tus próximos posts</h2>
        <ul className={cn(CAJA, "divide-border divide-y text-sm")}>
          {brief.ideas.map((i) => (
            <li key={i} className="p-4 leading-relaxed">
              {i}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
