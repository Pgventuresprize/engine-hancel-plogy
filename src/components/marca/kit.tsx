"use client"

import * as React from "react"
import JSZip from "jszip"
import {
  CheckIcon,
  FileArchiveIcon,
  FolderUpIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"

import {
  activarKitMarca,
  aprobarPlantilla,
  avanzarKit,
  detalleKit,
  empezarImportacionKit,
  listarKits,
  prepararSubidaKit,
  registrarSubidaKit,
  rehacerPlantillaKit,
  reintentarKit,
  type DetalleKit,
  type KitEnLista,
} from "@/app/marca/kit-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  extension,
  LADO_IMPORTAR,
  MIME_IMPORTAR,
  PASOS_IMPORTACION,
  planificarSubida,
  type ArchivoImportado,
  type Importacion,
  type PlanDeArchivo,
} from "@/engine/marca/kit-importar-modelo"
import type { Plantilla } from "@/engine/marca/kit-modelo"

/**
 * Marca > Kit de diseño.
 *
 * Se sube la carpeta (o el zip) del kit de la marca y la app arma con ella las
 * plantillas de sus laminas. La importacion avanza mientras la pantalla esta
 * abierta: si se cierra, al volver sigue donde quedo. Despues se revisa cada
 * plantilla junto a su original y se activa el kit.
 */
export function PestanaKit() {
  const [cargado, setCargado] = React.useState(false)
  const [disponible, setDisponible] = React.useState(true)
  const [kits, setKits] = React.useState<KitEnLista[]>([])
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const aplicar = React.useCallback((r: Awaited<ReturnType<typeof listarKits>>) => {
    setCargado(true)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setDisponible(r.disponible)
    setKits(r.kits)
    setAbierto((actual) => actual ?? r.kits[0]?.id ?? null)
  }, [])
  const recargar = React.useCallback(() => listarKits().then(aplicar), [aplicar])

  React.useEffect(() => {
    listarKits().then(aplicar)
  }, [aplicar])

  if (!cargado) return <p className="text-muted-foreground text-sm">Cargando…</p>
  if (!disponible)
    return <p className="text-muted-foreground text-sm">Falta aplicar la migración de los kits de diseño.</p>

  const kit = kits.find((k) => k.id === abierto) ?? null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">Kit de diseño</h3>
        <p className="text-muted-foreground text-sm">
          Sube la carpeta del kit de la marca (sus piezas en HTML, sus láminas exportadas, fuentes, logos y documentos).
          La app estudia el kit, escribe una plantilla por cada tipo de lámina y la compara con su original. Después
          revisas cada una antes de activarlo.
        </p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <SubirKit
        onEmpezado={(id) => {
          setAbierto(id)
          void recargar()
        }}
      />

      {kits.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {kits.map((k) => (
            <Button
              key={k.id}
              size="sm"
              variant={k.id === abierto ? "default" : "outline"}
              onClick={() => setAbierto(k.id)}
            >
              v{k.version} · {k.nombre || "Kit"} <EstadoKit estado={k.estado} />
            </Button>
          ))}
        </div>
      ) : null}

      {kit ? (
        kit.estado === "importando" ? (
          <Importando key={kit.id} kit={kit} onTerminado={recargar} />
        ) : (
          <Revision key={kit.id} kitId={kit.id} onCambio={recargar} />
        )
      ) : null}
    </div>
  )
}

function EstadoKit({ estado }: { estado: KitEnLista["estado"] }) {
  const nombres: Record<KitEnLista["estado"], string> = {
    importando: "importando",
    borrador: "borrador",
    revision: "en revisión",
    activo: "activo",
    archivado: "archivado",
  }
  return (
    <Badge variant={estado === "activo" ? "default" : "secondary"} className="ml-1">
      {nombres[estado]}
    </Badge>
  )
}

// ------------------------------------------------------------------ subir

type Entrada = { ruta: string; bytes: number; leer: () => Promise<Blob> }

function SubirKit({ onEmpezado }: { onEmpezado: (kitId: string) => void }) {
  const [nombre, setNombre] = React.useState("")
  const [estado, setEstado] = React.useState<string | null>(null)
  const [ocupado, setOcupado] = React.useState(false)
  const carpeta = React.useRef<HTMLInputElement>(null)
  const zip = React.useRef<HTMLInputElement>(null)

  const subir = async (entradas: Entrada[]) => {
    setOcupado(true)
    try {
      const porRuta = new Map(entradas.map((e) => [e.ruta, e]))
      setEstado(`Revisando ${entradas.length} archivos…`)
      const plan = await planificarSubida(
        entradas.map(({ ruta, bytes }) => ({ ruta, bytes })),
        async (ruta) => (await porRuta.get(ruta)?.leer())?.text() ?? "",
        async (ruta) => {
          try {
            const bmp = await createImageBitmap((await porRuta.get(ruta)?.leer())!)
            const m = { ancho: bmp.width, alto: bmp.height }
            bmp.close()
            return m
          } catch {
            return null
          }
        }
      )
      if (!plan.length) throw new Error("No encontré nada del diseño en esa carpeta.")
      const empezado = await empezarImportacionKit(nombre || "Kit de diseño")
      if (!empezado.ok) throw new Error(empezado.error)
      const kitId = empezado.kitId

      let hechos = 0
      for (let i = 0; i < plan.length; i += 10) {
        const tanda = plan.slice(i, i + 10)
        const listos = await Promise.all(tanda.map((p) => prepararArchivo(p, porRuta.get(p.ruta)!)))
        const urls = await prepararSubidaKit(
          kitId,
          listos.map(({ p, blob }) => ({ ruta: p.ruta, mime: blob.type, bytes: blob.size }))
        )
        if (!urls.ok) throw new Error(urls.error)
        const subidos: ArchivoImportado[] = []
        await Promise.all(
          listos.map(async ({ p, blob }, k) => {
            await subirA(urls.subidas[k].url, blob)
            subidos.push({
              ruta: p.ruta,
              storage: urls.subidas[k].storage,
              clase: p.clase,
              mime: blob.type,
              bytes: blob.size,
              ancho: p.ancho,
              alto: p.alto,
            })
          })
        )
        hechos += tanda.length
        setEstado(`Subiendo ${hechos} de ${plan.length}…`)
        const r = await registrarSubidaKit(kitId, subidos, hechos >= plan.length)
        if (!r.ok) throw new Error(r.error)
      }
      setEstado(null)
      setNombre("")
      onEmpezado(kitId)
    } catch (error) {
      setEstado(error instanceof Error ? error.message : String(error))
    } finally {
      setOcupado(false)
    }
  }

  const desdeCarpeta = (lista: FileList | null) => {
    if (!lista?.length) return
    const entradas = [...lista].map((f) => ({
      // Sin la carpeta raiz: las rutas quedan relativas al kit.
      ruta: (f.webkitRelativePath || f.name)
        .split("/")
        .slice(f.webkitRelativePath ? 1 : 0)
        .join("/"),
      bytes: f.size,
      leer: async () => f as Blob,
    }))
    void subir(entradas)
  }

  const desdeZip = async (archivo: File | undefined) => {
    if (!archivo) return
    try {
      const z = await JSZip.loadAsync(archivo)
      const archivos = Object.values(z.files).filter((f) => !f.dir)
      // Si todo cuelga de una carpeta, se quita.
      const raiz = archivos.every((f) => f.name.split("/")[0] === archivos[0]?.name.split("/")[0])
        ? `${archivos[0]?.name.split("/")[0]}/`
        : ""
      const entradas = archivos.map((f) => ({
        ruta: raiz && f.name.startsWith(raiz) ? f.name.slice(raiz.length) : f.name,
        // El tamano real se sabe al abrirlo; sirve el comprimido para los topes.
        bytes: (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0,
        leer: async () => new Blob([await f.async("arraybuffer")], { type: MIME_IMPORTAR[extension(f.name)] ?? "" }),
      }))
      void subir(entradas)
    } catch {
      setEstado("No se pudo abrir el zip.")
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del kit (opcional)"
          className="max-w-xs"
          disabled={ocupado}
        />
        <Button size="sm" disabled={ocupado} onClick={() => carpeta.current?.click()}>
          <FolderUpIcon /> Subir una carpeta
        </Button>
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => zip.current?.click()}>
          <FileArchiveIcon /> Subir un zip
        </Button>
        <input
          ref={carpeta}
          type="file"
          className="hidden"
          // @ts-expect-error webkitdirectory no esta en los tipos de React
          webkitdirectory=""
          multiple
          onChange={(e) => {
            desdeCarpeta(e.target.files)
            e.target.value = ""
          }}
        />
        <input
          ref={zip}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            void desdeZip(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Solo se sube una copia de lo necesario, comprimida. Las fotos que usan las piezas y las láminas se reducen a{" "}
        {LADO_IMPORTAR} px. La copia se borra al terminar; tu carpeta no se toca.
      </p>
      {estado ? (
        <p className="flex items-center gap-2 text-sm">
          {ocupado ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
          {estado}
        </p>
      ) : null}
    </div>
  )
}

/** Comprime laminas y fotos a JPEG del ancho de la lamina; lo demas va tal cual. */
async function prepararArchivo(p: PlanDeArchivo, e: Entrada): Promise<{ p: PlanDeArchivo; blob: Blob }> {
  const original = await e.leer()
  const mime = MIME_IMPORTAR[extension(p.ruta)] ?? "application/octet-stream"
  if (p.clase !== "lamina" && p.clase !== "foto") return { p, blob: new Blob([original], { type: mime }) }
  const bmp = await createImageBitmap(original, { imageOrientation: "from-image" })
  const escala = Math.min(1, LADO_IMPORTAR / bmp.width)
  const lienzo = document.createElement("canvas")
  lienzo.width = Math.round(bmp.width * escala)
  lienzo.height = Math.round(bmp.height * escala)
  const ctx = lienzo.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height)
  bmp.close()
  const blob = await new Promise<Blob>((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo comprimir."))), "image/jpeg", 0.82)
  )
  return { p: { ...p, ancho: lienzo.width, alto: lienzo.height }, blob }
}

async function subirA(url: string, blob: Blob): Promise<void> {
  const r = await fetch(url, { method: "PUT", body: blob, headers: { "content-type": blob.type, "x-upsert": "false" } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}

// -------------------------------------------------------------- importando

function Importando({ kit, onTerminado }: { kit: KitEnLista; onTerminado: () => void }) {
  const [imp, setImp] = React.useState<Importacion | null>(kit.importacion)
  const [error, setError] = React.useState<string | null>(null)
  const vivo = React.useRef(true)

  React.useEffect(() => {
    vivo.current = true
    // La importacion avanza mientras la pantalla este abierta: un paso, y otro.
    const seguir = async () => {
      while (vivo.current) {
        const r = await avanzarKit(kit.id)
        if (!vivo.current) return
        if (!r.ok) {
          setError(r.error)
          await new Promise((ok) => setTimeout(ok, 10_000))
          continue
        }
        setError(null)
        setImp(r.importacion)
        if (r.importacion.paso === "listo") {
          onTerminado()
          return
        }
        if (r.importacion.paso === "fallo" || r.importacion.paso === "subir") return
        // Otra pestana trabajando: se espera un poco antes de volver a mirar.
        if (r.importacion.ocupado_hasta) await new Promise((ok) => setTimeout(ok, 8_000))
      }
    }
    void seguir()
    return () => {
      vivo.current = false
    }
  }, [kit.id, onTerminado])

  if (!imp) return null
  const actual = PASOS_IMPORTACION.findIndex((p) => p.clave === imp.paso)

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium">{kit.nombre || "Kit"}: importando</h4>
        <span className="text-muted-foreground text-xs tabular-nums">
          {Math.round(imp.tokens.entrada / 1000)}k / {Math.round(imp.tokens.salida / 1000)}k tokens
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {PASOS_IMPORTACION.map((p, i) => {
          const hecho = imp.paso === "listo" || (actual >= 0 && i < actual)
          const ahora = i === actual
          return (
            <li key={p.clave} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">
                {hecho ? (
                  <CheckIcon className="size-4 text-emerald-600" />
                ) : ahora ? (
                  <LoaderCircleIcon className="size-4 animate-spin" />
                ) : (
                  <span className="bg-muted block size-4 rounded-full" />
                )}
              </span>
              <span className={hecho || ahora ? "" : "text-muted-foreground"}>
                {p.nombre}
                <span className="text-muted-foreground"> · {p.detalle}</span>
              </span>
            </li>
          )
        })}
      </ol>

      {imp.tareas.length ? (
        <div className="flex flex-wrap gap-1.5">
          {imp.tareas.map((t) => (
            <Badge
              key={t.clave}
              variant={t.etapa === "hecha" ? "default" : t.etapa === "fallo" ? "destructive" : "secondary"}
            >
              {t.nombre}
              {t.parecido !== undefined ? ` · ${t.parecido}/10` : ""}
              {t.etapa !== "hecha" && t.etapa !== "fallo" ? ` · ${NOMBRE_ETAPA[t.etapa]}` : ""}
            </Badge>
          ))}
        </div>
      ) : null}

      {imp.paso === "fallo" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-destructive text-sm">{imp.error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const ultimo = [...imp.log].reverse().find((l) => l.texto.startsWith("Falló "))
              const paso = (ultimo?.texto.slice(6).split(":")[0] ?? "leer") as Importacion["paso"]
              await reintentarKit(kit.id, paso)
              onTerminado()
            }}
          >
            <RefreshCwIcon /> Reintentar
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error} Se reintenta solo.</p> : null}

      <details className="text-xs">
        <summary className="text-muted-foreground cursor-pointer">Registro</summary>
        <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-auto">
          {[...imp.log].reverse().map((l, i) => (
            <li key={i}>
              <span className="text-muted-foreground tabular-nums">{l.cuando.slice(11, 19)}</span> {l.texto}
            </li>
          ))}
        </ul>
      </details>
      <p className="text-muted-foreground text-xs">
        Puede tardar 10 a 20 minutos. Si cierras esta pantalla, la importación sigue al volver.
      </p>
    </div>
  )
}

const NOMBRE_ETAPA = {
  escribir: "escribiendo",
  comprobar: "comparando",
  estres: "probando textos",
  hecha: "lista",
  fallo: "falló",
} as const

// ---------------------------------------------------------------- revision

function Revision({ kitId, onCambio }: { kitId: string; onCambio: () => void }) {
  const [detalle, setDetalle] = React.useState<DetalleKit | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const aplicar = React.useCallback((r: Awaited<ReturnType<typeof detalleKit>>) => {
    if (r.ok) setDetalle(r.detalle)
    else setError(r.error)
  }, [])
  const cargar = React.useCallback(() => detalleKit(kitId).then(aplicar), [kitId, aplicar])
  React.useEffect(() => {
    detalleKit(kitId).then(aplicar)
  }, [kitId, aplicar])

  if (error) return <p className="text-destructive text-sm">{error}</p>
  if (!detalle) return <p className="text-muted-foreground text-sm">Cargando el kit…</p>

  const { kit, plantillas } = detalle
  const aprobadas = plantillas.filter((p) => p.estado === "aprobada")
  const puedeActivar =
    kit.estado !== "activo" && aprobadas.some((p) => p.tipo === "portada") && aprobadas.some((p) => p.tipo === "cierre")

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h4 className="font-medium">
            {kit.nombre || "Kit"} · v{kit.version} <EstadoKit estado={kit.estado} />
          </h4>
          <p className="text-muted-foreground text-xs">
            {aprobadas.length} de {plantillas.length} plantillas aprobadas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void cargar()} aria-label="Refrescar">
            <RefreshCwIcon />
          </Button>
          <Button
            size="sm"
            disabled={!puedeActivar || pending}
            onClick={() =>
              startTransition(async () => {
                const r = await activarKitMarca(kitId)
                if (!r.ok) setError(r.error)
                await cargar()
                onCambio()
              })
            }
          >
            {kit.estado === "activo" ? "Activo" : "Activar kit"}
          </Button>
        </div>
      </div>
      {kit.origen ? <p className="text-muted-foreground text-sm">{kit.origen}</p> : null}
      {!puedeActivar && kit.estado !== "activo" ? (
        <p className="text-muted-foreground text-xs">
          Para activarlo hace falta aprobar al menos una portada y un cierre.
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        {plantillas.map((p) => (
          <FilaPlantilla key={p.id} plantilla={p} detalle={detalle} onCambio={cargar} />
        ))}
      </div>
    </div>
  )
}

function FilaPlantilla({
  plantilla,
  detalle,
  onCambio,
}: {
  plantilla: Plantilla
  detalle: DetalleKit
  onCambio: () => Promise<void>
}) {
  const [nota, setNota] = React.useState("")
  const [rehaciendo, setRehaciendo] = React.useState(false)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const papelRef = detalle.archivos.find((a) => a.id === plantilla.referencia_archivo_id)?.papel ?? ""
  const clave = papelRef.replace(/^ref_/, "")
  const img = (papel: string) => detalle.imagenes[papel]
  const prueba = plantilla.prueba as {
    parecido?: number
    diferencia?: number
    diferencias?: string[]
    ajustes?: string[]
    problemas_largo?: { hueco: string; detalle: string }[]
    que_cambio?: string
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            {plantilla.nombre} <span className="text-muted-foreground text-xs font-normal">({plantilla.tipo})</span>
          </span>
          <span className="text-muted-foreground text-xs">{plantilla.cuando_usar}</span>
        </div>
        <div className="flex items-center gap-2">
          {prueba.parecido !== undefined ? <Badge variant="outline">Parecido {prueba.parecido}/10</Badge> : null}
          <Badge variant={plantilla.estado === "aprobada" ? "default" : "secondary"}>
            {plantilla.estado === "aprobada" ? "aprobada" : "pendiente"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Imagen titulo="Original del kit" url={img(papelRef)} />
        <Imagen titulo="Con la plantilla" url={img(`prueba_${clave}_ref`)} />
        <Imagen titulo="Textos al máximo" url={img(`prueba_${clave}_largo`)} />
        <Imagen titulo="Textos mínimos" url={img(`prueba_${clave}_corto`)} />
      </div>

      <div className="text-muted-foreground flex flex-col gap-1 text-xs">
        <span>
          Huecos:{" "}
          {plantilla.huecos
            .map((h) => `${h.nombre} (${h.tipo === "lista" ? `${h.max_items} × ` : ""}${h.max})`)
            .join(", ")}
        </span>
        <span>
          Foto: {plantilla.foto.usa === "no" ? "no usa" : `${plantilla.foto.usa}, ${plantilla.foto.tono}`} · Fondo{" "}
          {plantilla.fondo}
          {plantilla.cta_tipos.length ? ` · Cierre para: ${plantilla.cta_tipos.join(", ")}` : ""}
        </span>
        {prueba.diferencias?.length ? <span>Diferencias que vio Claude: {prueba.diferencias.join("; ")}</span> : null}
        {prueba.ajustes?.length ? <span>Límites ajustados: {prueba.ajustes.join("; ")}</span> : null}
        {prueba.problemas_largo?.length ? (
          <span className="text-destructive">
            Con textos al máximo: {prueba.problemas_largo.map((x) => `${x.hueco} ${x.detalle}`).join("; ")}
          </span>
        ) : null}
        {prueba.que_cambio ? <span>Último cambio: {prueba.que_cambio}</span> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={plantilla.estado === "aprobada" ? "outline" : "default"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await aprobarPlantilla(plantilla.id, plantilla.estado !== "aprobada")
              setAviso(r.ok ? null : r.error)
              await onCambio()
            })
          }
        >
          {plantilla.estado === "aprobada" ? (
            <>
              <XIcon /> Quitar aprobación
            </>
          ) : (
            <>
              <CheckIcon /> Aprobar
            </>
          )}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setRehaciendo((v) => !v)}>
          <SparklesIcon /> Pedir cambios
        </Button>
        {aviso ? <span className="text-muted-foreground text-xs">{aviso}</span> : null}
      </div>
      {rehaciendo ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Qué hay que cambiar. Por ejemplo: el número más grande, la foto ocupa toda la lámina."
            rows={2}
          />
          <div>
            <Button
              size="sm"
              disabled={pending || !nota.trim()}
              onClick={() =>
                startTransition(async () => {
                  setAviso("Claude está corrigiéndola…")
                  const r = await rehacerPlantillaKit(plantilla.id, nota)
                  setAviso(r.ok ? "Corregida. Revísala de nuevo." : r.error)
                  if (r.ok) {
                    setNota("")
                    setRehaciendo(false)
                  }
                  await onCambio()
                })
              }
            >
              {pending ? <LoaderCircleIcon className="animate-spin" /> : <SparklesIcon />} Rehacer
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Imagen({ titulo, url }: { titulo: string; url?: string }) {
  return (
    <figure className="flex flex-col gap-1">
      <div className="bg-muted aspect-[4/5] overflow-hidden rounded-md">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={titulo} className="h-full w-full object-contain" />
          </a>
        ) : null}
      </div>
      <figcaption className="text-muted-foreground text-xs">{titulo}</figcaption>
    </figure>
  )
}
