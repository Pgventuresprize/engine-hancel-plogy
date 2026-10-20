"use client"

import * as React from "react"
import { FileUpIcon, Loader2Icon } from "lucide-react"

import { extraerEjemplosDeArchivo, guardarEjemplosImportados } from "@/app/configuracion/marca/ejemplos-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { NOMBRE_OBJETIVO, OBJETIVOS } from "@/engine/marca/clasificacion"
import { NOMBRE_TIPO_CTA } from "@/engine/marca/cuando"
import { TIPOS_CTA } from "@/engine/marca/editorial-modelo"
import { NOMBRE_RED_EJEMPLO, REDES_EJEMPLO, TOPES_EJEMPLO, type CamposEjemplo } from "@/engine/marca/ejemplos-modelo"
import { pideRevision, TOPE_ARCHIVO, type PropuestaEjemplo } from "@/engine/marca/importar-ejemplos-modelo"

type Pilar = { id: string; name: string }

/** Una propuesta en pantalla: lo que dijo Claude y lo que la persona va decidiendo. */
type Fila = { propuesta: PropuestaEjemplo; campos: CamposEjemplo; elegido: boolean; revisado: boolean }

const SELECT =
  "border-input bg-background h-8 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

/**
 * Importar ejemplos desde un archivo. Claude separa las piezas y las ordena;
 * la app comprueba que el texto sea el del archivo; la persona revisa y elige.
 * Nada se guarda hasta «Guardar».
 */
export function ImportarEjemplos({ pilares, onCerrar }: { pilares: Pilar[]; onCerrar: () => void }) {
  const archivoRef = React.useRef<HTMLInputElement>(null)
  const [leyendo, setLeyendo] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [avisos, setAvisos] = React.useState<string[]>([])
  const [filas, setFilas] = React.useState<Fila[] | null>(null)
  const [guardando, startGuardar] = React.useTransition()

  const leer = async (lista: FileList | null) => {
    const archivo = lista?.[0]
    if (!archivo) return
    setError(null)
    if (!/\.(md|markdown|txt)$/i.test(archivo.name)) {
      setError(`Solo archivos de texto (.md o .txt). «${archivo.name}» no lo es.`)
      return
    }
    const texto = (await archivo.text()).replace(/\r\n/g, "\n").trim()
    if (texto.length > TOPE_ARCHIVO) {
      setError(`«${archivo.name}» tiene ${texto.length} caracteres y el tope es ${TOPE_ARCHIVO}. Pártelo en dos.`)
      return
    }
    setLeyendo(archivo.name)
    try {
      const r = await extraerEjemplosDeArchivo(archivo.name, texto)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setAvisos(r.avisos)
      setFilas(
        r.propuestas.map((p) => ({
          propuesta: p,
          campos: p.campos,
          // Lo repetido sale sin marcar: casi siempre es un ejemplo que ya cargaste.
          elegido: !p.duplicado,
          revisado: !pideRevision(p),
        }))
      )
    } finally {
      setLeyendo(null)
    }
  }

  const cambiar = (i: number, cambio: Partial<Fila>) => setFilas((f) => f && f.map((x, j) => (j === i ? { ...x, ...cambio } : x)))
  const elegidas = filas?.filter((f) => f.elegido) ?? []
  const sinRevisar = elegidas.filter((f) => !f.revisado)

  const guardar = () => {
    setError(null)
    startGuardar(async () => {
      const r = await guardarEjemplosImportados(elegidas.map((f) => f.campos))
      if (!r.ok) {
        setError(r.error)
        return
      }
      onCerrar()
    })
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-4 py-4">
        <div>
          <h4 className="text-sm font-semibold">Importar desde archivo</h4>
          <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
            Sube un .md o .txt con una o varias piezas. Claude las separa, reparte el texto por láminas con el tipo de cada
            una y propone pilar, CTA y objetivo. No reescribe nada: la app compara cada ejemplo con tu archivo y marca lo que
            no coincida. Revisas, eliges y guardas; antes de eso no se guarda nada.
          </p>
        </div>

        <input
          ref={archivoRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          hidden
          onChange={(e) => {
            void leer(e.target.files)
            // Para poder volver a elegir el mismo archivo.
            e.target.value = ""
          }}
        />

        {leyendo ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Claude está leyendo «{leyendo}». Con muchas piezas tarda uno o dos minutos.
          </p>
        ) : null}

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        {avisos.length ? (
          <ul className="text-sm text-amber-700 dark:text-amber-500">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}

        {filas === null ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => archivoRef.current?.click()} disabled={Boolean(leyendo)}>
              <FileUpIcon />
              Elegir archivo
            </Button>
            <Button variant="ghost" onClick={onCerrar} disabled={Boolean(leyendo)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm">
              {filas.length === 1 ? "Salió 1 ejemplo." : `Salieron ${filas.length} ejemplos.`} Marca los que quieres guardar.
            </p>
            <div className="flex flex-col gap-2">
              {filas.map((f, i) => (
                <TarjetaPropuesta key={f.propuesta.clave} fila={f} pilares={pilares} cambiar={(c) => cambiar(i, c)} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button onClick={guardar} disabled={guardando || elegidas.length === 0 || sinRevisar.length > 0}>
                {guardando
                  ? "Guardando…"
                  : elegidas.length === 1
                    ? "Guardar el elegido"
                    : `Guardar los ${elegidas.length} elegidos`}
              </Button>
              <Button variant="ghost" onClick={onCerrar} disabled={guardando}>
                Descartar
              </Button>
              {sinRevisar.length ? (
                <span className="text-sm text-amber-700 dark:text-amber-500">
                  Falta marcar «Lo revisé» en {sinRevisar.length === 1 ? "1 ejemplo" : `${sinRevisar.length} ejemplos`}.
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TarjetaPropuesta({ fila, pilares, cambiar }: { fila: Fila; pilares: Pilar[]; cambiar: (c: Partial<Fila>) => void }) {
  const { propuesta: p, campos: c } = fila
  const set = <K extends keyof CamposEjemplo>(k: K, v: CamposEjemplo[K]) => cambiar({ campos: { ...c, [k]: v } })
  const base = React.useId()
  const id = (campo: string) => `${base}-${campo}`
  const revisar = pideRevision(p)

  return (
    <div className={`flex flex-col gap-3 rounded-lg border p-3 ${fila.elegido ? "" : "opacity-60"}`}>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="accent-primary mt-1 size-4"
          checked={fila.elegido}
          onChange={(e) => cambiar({ elegido: e.target.checked })}
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium">{c.nombre || "Sin nombre"}</span>
          <span className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="font-normal">
              {NOMBRE_RED_EJEMPLO[c.red]}
            </Badge>
            {p.ajenos.length ? <Badge variant="destructive">Texto distinto del archivo</Badge> : null}
            {p.porQuePropuesto ? <Badge variant="outline">Porqué propuesto por Claude</Badge> : null}
            {p.vicios.length ? <Badge variant="outline">Lo castiga el revisor</Badge> : null}
            {p.duplicado ? <Badge variant="outline">Repetido</Badge> : null}
          </span>
        </span>
      </label>

      {p.ajenos.length ? (
        <Aviso tono="rojo" titulo="No está así en tu archivo (Claude lo cambió o lo agregó). Corrígelo en el texto de abajo:">
          {p.ajenos}
        </Aviso>
      ) : null}
      {p.vicios.length ? (
        <Aviso tono="ambar" titulo="El agente imita los ejemplos, y esto lo castiga el revisor:">
          {p.vicios}
        </Aviso>
      ) : null}
      {p.faltan.length ? (
        <Aviso tono="ambar" titulo="Del archivo, esto no entró en el ejemplo. Mira que no sea texto de la pieza:">
          {p.faltan}
        </Aviso>
      ) : null}
      {p.avisos.length ? <Aviso tono="gris">{p.avisos}</Aviso> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor={id("nombre")} className="text-xs">
            Nombre
          </Label>
          <Input
            id={id("nombre")}
            value={c.nombre}
            maxLength={TOPES_EJEMPLO.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            className="h-8"
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Red</Label>
          <select className={SELECT} value={c.red} onChange={(e) => set("red", e.target.value as CamposEjemplo["red"])}>
            {REDES_EJEMPLO.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_RED_EJEMPLO[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Pilar</Label>
          <select className={SELECT} value={c.pilar_id ?? ""} onChange={(e) => set("pilar_id", e.target.value || null)}>
            <option value="">Sin pilar</option>
            {pilares.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Tipo de CTA</Label>
          <select
            className={SELECT}
            value={c.cta_tipo ?? ""}
            onChange={(e) => set("cta_tipo", (e.target.value || null) as CamposEjemplo["cta_tipo"])}
          >
            <option value="">Sin CTA</option>
            {TIPOS_CTA.map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TIPO_CTA[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Objetivo</Label>
          <select
            className={SELECT}
            value={c.objetivo ?? ""}
            onChange={(e) => set("objetivo", (e.target.value || null) as CamposEjemplo["objetivo"])}
          >
            <option value="">Sin objetivo</option>
            {OBJETIVOS.map((o) => (
              <option key={o} value={o}>
                {NOMBRE_OBJETIVO[o]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-1">
        <Label htmlFor={id("por_que")} className="text-xs">
          Por qué es buena{p.porQuePropuesto ? " (lo escribió Claude: léelo, es lo que el agente aprende de la pieza)" : ""}
        </Label>
        <Textarea
          id={id("por_que")}
          rows={3}
          maxLength={TOPES_EJEMPLO.por_que}
          value={c.por_que}
          onChange={(e) => set("por_que", e.target.value)}
          className="text-sm"
        />
      </div>

      <details>
        <summary className="text-muted-foreground cursor-pointer text-xs">La pieza, como la leerá el agente</summary>
        <Textarea
          rows={14}
          maxLength={TOPES_EJEMPLO.texto}
          value={c.texto}
          onChange={(e) => set("texto", e.target.value)}
          className="mt-2 font-mono text-xs leading-relaxed"
        />
      </details>

      {revisar ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={fila.revisado}
            onChange={(e) => cambiar({ revisado: e.target.checked })}
          />
          Lo revisé
        </label>
      ) : null}
    </div>
  )
}

function Aviso({ tono, titulo, children }: { tono: "rojo" | "ambar" | "gris"; titulo?: string; children: string[] }) {
  const color =
    tono === "rojo"
      ? "border-destructive/40 text-destructive"
      : tono === "ambar"
        ? "border-amber-500/40 text-amber-700 dark:text-amber-500"
        : "text-muted-foreground"
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${color}`}>
      {titulo ? <p className="font-medium">{titulo}</p> : null}
      <ul className="mt-1 list-disc pl-4">
        {children.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  )
}
