"use client"

import * as React from "react"
import { CheckIcon, CropIcon, FolderUpIcon, ImagePlusIcon, RefreshCwIcon, SparklesIcon, Trash2Icon } from "lucide-react"

import {
  activarVarias,
  cambiarImagen,
  cargarBiblioteca,
  comprobarHuellas,
  detalleImagen,
  eliminarVarias,
  etiquetarAhora,
  guardarDias,
  prepararSubidasMarca,
  recortar,
  reetiquetarImagen,
  registrarSubidas,
} from "@/app/marca/imagenes-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { FiltrosGaleria, ImagenDeGaleria, ResumenBiblioteca } from "@/engine/marca/imagenes"
import {
  ANCHO_MINIMO_LAMINA,
  CALIDAD_IMAGEN,
  CALIDAD_MINI,
  ESPACIO_PLAN_BYTES,
  formatoBytes,
  LADO_IMAGEN,
  LADO_MINI,
  MAX_BYTES_IMAGEN,
  medidasEncajadas,
  medidasUtiles,
  NOMBRE_USO,
  PROPORCIONES_RECORTE,
  USOS_IMAGEN,
  type Recorte,
  type UsoDeImagen,
  type UsoImagen,
} from "@/engine/marca/imagenes-modelo"

const SELECT =
  "border-input bg-background h-8 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

/** De cuantas en cuantas se suben: una tanda pide sus enlaces y registra sus fichas de una vez. */
const TANDA = 6
/** Cuantas se comprimen a la vez en el navegador. Mas satura la memoria con fotos de 12 MP. */
const COMPRIMIR_A_LA_VEZ = 3

type Estado =
  | { cargando: true }
  | { cargando: false; disponible: false }
  | {
      cargando: false
      disponible: true
      resumen: ResumenBiblioteca
      imagenes: ImagenDeGaleria[]
      hayMas: boolean
    }

type Progreso = {
  total: number
  hechas: number
  subidas: number
  repetidas: number
  fallos: { nombre: string; motivo: string }[]
  fase: string
}

/**
 * Marca > Imagenes: la biblioteca de fotos de la marca.
 *
 * Las fotos se comprimen aqui, en el navegador, antes de subir: una WebP de
 * 1600 px y una miniatura de 400 px. El original no sale del equipo. Claude las
 * mira despues para etiquetarlas, y el carrusel elige de aqui antes que de
 * Pexels, sin repetir lo usado en los ultimos dias.
 */
export function PestanaImagenes() {
  const [estado, setEstado] = React.useState<Estado>({ cargando: true })
  const [filtros, setFiltros] = React.useState<FiltrosGaleria>({
    estado: null,
  })
  const [pagina, setPagina] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [progreso, setProgreso] = React.useState<Progreso | null>(null)
  const [abierta, setAbierta] = React.useState<ImagenDeGaleria | null>(null)
  const [arrastrando, setArrastrando] = React.useState(false)
  // null = no se esta seleccionando; un Set (aunque este vacio) = modo seleccion.
  const [seleccion, setSeleccion] = React.useState<Set<string> | null>(null)
  const [aEliminar, setAEliminar] = React.useState<string[] | null>(null)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [enLote, startLote] = React.useTransition()
  const archivos = React.useRef<HTMLInputElement>(null)
  const carpeta = React.useRef<HTMLInputElement>(null)

  const aplicar = React.useCallback((r: Awaited<ReturnType<typeof cargarBiblioteca>>, pag: number) => {
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(null)
    if (!r.disponible) {
      setEstado({ cargando: false, disponible: false })
      return
    }
    setPagina(pag)
    setEstado((previo) => ({
      cargando: false,
      disponible: true,
      resumen: r.resumen,
      hayMas: r.hayMas,
      imagenes: pag > 0 && !previo.cargando && previo.disponible ? [...previo.imagenes, ...r.imagenes] : r.imagenes,
    }))
  }, [])

  const cargar = React.useCallback(
    async (pag = 0) => aplicar(await cargarBiblioteca(filtros, pag), pag),
    [filtros, aplicar]
  )

  React.useEffect(() => {
    let vivo = true
    void cargarBiblioteca(filtros, 0).then((r) => {
      if (vivo) aplicar(r, 0)
    })
    return () => {
      vivo = false
    }
  }, [filtros, aplicar])

  // Mientras Claude etiqueta, la galeria se refresca sola para ver como avanza.
  const pendientes = !estado.cargando && estado.disponible ? estado.resumen.pendientes : 0
  React.useEffect(() => {
    if (pendientes === 0 || progreso || pagina > 0) return
    const t = setInterval(() => void cargar(0), 15_000)
    return () => clearInterval(t)
  }, [pendientes, progreso, pagina, cargar])

  const subir = async (lista: File[]) => {
    const fotos = lista.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
    if (fotos.length === 0) return
    const p: Progreso = {
      total: fotos.length,
      hechas: 0,
      subidas: 0,
      repetidas: 0,
      fallos: [],
      fase: "Comprobando cuáles ya están…",
    }
    const avanzar = () => setProgreso({ ...p, fallos: [...p.fallos] })
    avanzar()

    // 1. Huellas, para saltar lo que ya esta (y lo repetido dentro de la misma subida).
    const conHuella: { archivo: File; huella: string }[] = []
    const vistas = new Set<string>()
    for (const archivo of fotos) {
      try {
        const huella = await huellaDe(archivo)
        if (vistas.has(huella)) {
          p.repetidas++
          p.hechas++
        } else {
          vistas.add(huella)
          conHuella.push({ archivo, huella })
        }
      } catch {
        p.fallos.push({
          nombre: archivo.name,
          motivo: "No se pudo leer el archivo.",
        })
        p.hechas++
      }
    }
    const existentes = new Set<string>()
    for (let i = 0; i < conHuella.length; i += 200) {
      const r = await comprobarHuellas(conHuella.slice(i, i + 200).map((c) => c.huella))
      if (r.ok) r.existentes.forEach((h) => existentes.add(h))
    }
    const nuevas = conHuella.filter((c) => {
      if (!existentes.has(c.huella)) return true
      p.repetidas++
      p.hechas++
      return false
    })
    p.fase = "Comprimiendo y subiendo…"
    avanzar()

    // 2. Por tandas: comprimir, pedir enlaces, subir y registrar las fichas.
    for (let i = 0; i < nuevas.length; i += TANDA) {
      const tanda = nuevas.slice(i, i + TANDA)
      const listas: {
        archivo: File
        huella: string
        grande: Comprimida
        mini: Comprimida
      }[] = []
      for (let j = 0; j < tanda.length; j += COMPRIMIR_A_LA_VEZ) {
        await Promise.all(
          tanda.slice(j, j + COMPRIMIR_A_LA_VEZ).map(async (c) => {
            try {
              const [grande, mini] = await comprimirDos(c.archivo)
              if (grande.blob.size > MAX_BYTES_IMAGEN) throw new Error("Pesa demasiado aun comprimida.")
              listas.push({ ...c, grande, mini })
            } catch (e) {
              p.fallos.push({
                nombre: c.archivo.name,
                motivo: motivoDeFallo(c.archivo, e),
              })
              p.hechas++
            }
          })
        )
      }
      avanzar()
      if (listas.length === 0) continue

      const preparadas = await prepararSubidasMarca(listas.map((l) => l.grande.blob.type))
      if (!preparadas.ok) {
        listas.forEach((l) => p.fallos.push({ nombre: l.archivo.name, motivo: preparadas.error }))
        p.hechas += listas.length
        avanzar()
        continue
      }

      const subidas = await Promise.all(
        listas.map(async (l, k) => {
          const destino = preparadas.subidas[k]
          try {
            await subirA(destino.urlSubida, l.grande.blob)
            await subirA(destino.urlSubidaMini, l.mini.blob)
            return {
              id: destino.id,
              ruta: destino.ruta,
              rutaMini: destino.rutaMini,
              ancho: l.grande.ancho,
              alto: l.grande.alto,
              bytes: l.grande.blob.size,
              huella: l.huella,
              nombreOriginal: l.archivo.webkitRelativePath || l.archivo.name,
            }
          } catch {
            p.fallos.push({
              nombre: l.archivo.name,
              motivo: "No se pudo subir.",
            })
            return null
          }
        })
      )
      const ok = subidas.filter((s): s is NonNullable<typeof s> => s !== null)
      if (ok.length) {
        const r = await registrarSubidas(ok)
        if (r.ok) p.subidas += r.nuevas
        else ok.forEach((s) => p.fallos.push({ nombre: s.nombreOriginal, motivo: r.error }))
      }
      p.hechas += listas.length
      avanzar()
    }

    p.fase = p.subidas > 0 ? "Listo. Claude ya las está mirando para etiquetarlas." : "Listo."
    avanzar()
    await cargar(0)
  }

  const alSoltar = (e: React.DragEvent) => {
    e.preventDefault()
    setArrastrando(false)
    void subir(Array.from(e.dataTransfer.files))
  }

  if (estado.cargando) return <p className="text-muted-foreground text-sm">Cargando la biblioteca…</p>

  if (!estado.disponible) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Imágenes de la marca</h3>
        <p className="text-muted-foreground text-sm">
          La biblioteca aún no está activada: falta aplicar la migración <code>2026-10-22-biblioteca-imagenes.sql</code>
          . Mientras tanto, los carruseles siguen usando Pexels.
        </p>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>
    )
  }

  const { resumen, imagenes, hayMas } = estado
  const ocupado = Boolean(progreso && progreso.hechas < progreso.total)
  const porcentajeEspacio = Math.min(100, Math.round((resumen.bytes / ESPACIO_PLAN_BYTES) * 100))

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-semibold">Imágenes de la marca</h3>
        <p className="text-muted-foreground text-sm">
          Las fotos de las que eligen los carruseles antes de ir a Pexels. Se comprimen aquí antes de subir y el
          original no sale de tu equipo. Claude mira cada una y la etiqueta; luego elige la que va con cada lámina.
        </p>
      </div>

      <Resumen resumen={resumen} porcentajeEspacio={porcentajeEspacio} onEtiquetado={() => cargar(0)} />

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltar}
        className={`flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors ${arrastrando ? "border-primary bg-primary/5" : ""}`}
      >
        <p className="text-muted-foreground text-sm">Arrastra fotos aquí, o elígelas desde tu equipo.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" disabled={ocupado} onClick={() => archivos.current?.click()}>
            <ImagePlusIcon /> Subir fotos
          </Button>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => carpeta.current?.click()}>
            <FolderUpIcon /> Subir una carpeta
          </Button>
        </div>
        <input
          ref={archivos}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void subir(Array.from(e.target.files ?? []))
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
            void subir(Array.from(e.target.files ?? []))
            e.target.value = ""
          }}
        />
        {progreso ? <PanelProgreso progreso={progreso} onCerrar={ocupado ? null : () => setProgreso(null)} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar: oficina, server, manos…"
          className="h-8 w-56"
          defaultValue={filtros.busqueda ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              setFiltros((f) => ({
                ...f,
                busqueda: (e.target as HTMLInputElement).value,
              }))
          }}
          onBlur={(e) => setFiltros((f) => (f.busqueda === e.target.value ? f : { ...f, busqueda: e.target.value }))}
        />
        <select
          className={SELECT}
          value={filtros.uso ?? ""}
          onChange={(e) =>
            setFiltros((f) => ({
              ...f,
              uso: (e.target.value || null) as UsoImagen | null,
            }))
          }
        >
          <option value="">Cualquier uso</option>
          {USOS_IMAGEN.map((u) => (
            <option key={u} value={u}>
              {NOMBRE_USO[u]}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          value={filtros.orientacion ?? ""}
          onChange={(e) =>
            setFiltros((f) => ({
              ...f,
              orientacion: (e.target.value || null) as FiltrosGaleria["orientacion"],
            }))
          }
        >
          <option value="">Cualquier forma</option>
          <option value="vertical">Vertical</option>
          <option value="cuadrada">Cuadrada</option>
          <option value="apaisada">Apaisada</option>
        </select>
        <select
          className={SELECT}
          value={filtros.estado ?? ""}
          onChange={(e) =>
            setFiltros((f) => ({
              ...f,
              estado: (e.target.value || null) as FiltrosGaleria["estado"],
            }))
          }
        >
          <option value="">Todas</option>
          <option value="activas">Activas</option>
          <option value="apagadas">Apagadas</option>
          <option value="pendientes">Por etiquetar o con fallo</option>
          <option value="nunca_usadas">Nunca usadas</option>
        </select>
        <Button size="sm" variant="ghost" onClick={() => cargar(0)} aria-label="Refrescar">
          <RefreshCwIcon />
        </Button>
        <Button
          size="sm"
          variant={seleccion ? "default" : "outline"}
          onClick={() => setSeleccion(seleccion ? null : new Set())}
        >
          <CheckIcon /> {seleccion ? "Terminar selección" : "Seleccionar"}
        </Button>
      </div>

      {seleccion ? (
        <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
          <span className="tabular-nums">
            {seleccion.size === 1 ? "1 seleccionada" : `${seleccion.size} seleccionadas`}
          </span>
          <Button size="xs" variant="ghost" onClick={() => setSeleccion(new Set(imagenes.map((i) => i.id)))}>
            Todas las visibles
          </Button>
          <Button size="xs" variant="ghost" disabled={seleccion.size === 0} onClick={() => setSeleccion(new Set())}>
            Ninguna
          </Button>
          <span className="flex-1" />
          <Button
            size="xs"
            variant="outline"
            disabled={seleccion.size === 0 || enLote}
            onClick={() =>
              startLote(async () => {
                const r = await activarVarias([...seleccion], false)
                setAviso(r.ok ? "Descartadas: ningún carrusel las elegirá. Se pueden volver a activar." : r.error)
                await cargar(0)
              })
            }
          >
            Descartar
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={seleccion.size === 0 || enLote}
            onClick={() =>
              startLote(async () => {
                const r = await activarVarias([...seleccion], true)
                setAviso(r.ok ? "Activadas." : r.error)
                await cargar(0)
              })
            }
          >
            Activar
          </Button>
          <Button
            size="xs"
            variant="destructive"
            disabled={seleccion.size === 0 || enLote}
            onClick={() => setAEliminar([...seleccion])}
          >
            <Trash2Icon /> Eliminar…
          </Button>
        </div>
      ) : null}
      {aviso ? <p className="text-muted-foreground text-xs">{aviso}</p> : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {imagenes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {resumen.total === 0 ? "Todavía no hay fotos. Sube las primeras." : "Ninguna foto cumple esos filtros."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {imagenes.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() =>
                seleccion
                  ? setSeleccion((actual) => {
                      const nueva = new Set(actual)
                      if (nueva.has(img.id)) nueva.delete(img.id)
                      else nueva.add(img.id)
                      return nueva
                    })
                  : setAbierta(img)
              }
              aria-pressed={seleccion ? seleccion.has(img.id) : undefined}
              className={`group bg-muted relative aspect-square overflow-hidden rounded-md text-left ${seleccion?.has(img.id) ? "ring-primary ring-3" : ""}`}
            >
              {img.urlMini ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.urlMini}
                  alt={img.descripcion || img.nombre_original}
                  loading="lazy"
                  className={`size-full object-cover transition-transform group-hover:scale-105 ${img.activa ? "" : "opacity-40 grayscale"}`}
                />
              ) : null}
              <div className="absolute inset-x-1 top-1 flex flex-wrap gap-1">
                {!img.activa ? <Badge variant="secondary">Apagada</Badge> : null}
                {img.etiquetado === "pendiente" || img.etiquetado === "procesando" ? (
                  <Badge variant="secondary">Por etiquetar</Badge>
                ) : null}
                {img.etiquetado === "fallido" ? <Badge variant="destructive">Sin etiquetar</Badge> : null}
              </div>
              {seleccion ? (
                <span
                  className={`absolute bottom-1 left-1 flex size-5 items-center justify-center rounded-full border-2 border-white ${seleccion.has(img.id) ? "bg-primary text-primary-foreground" : "bg-black/30"}`}
                >
                  {seleccion.has(img.id) ? <CheckIcon className="size-3" /> : null}
                </span>
              ) : null}
              {img.recorte ? (
                <span className="absolute bottom-1 left-8 rounded bg-black/60 px-1 py-0.5 text-white" title="Recortada">
                  <CropIcon className="size-3" />
                </span>
              ) : null}
              {img.usos > 0 ? (
                <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                  {img.usos === 1 ? "1 uso" : `${img.usos} usos`}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {hayMas ? (
        <Button variant="outline" size="sm" className="self-center" onClick={() => cargar(pagina + 1)}>
          Cargar más
        </Button>
      ) : null}

      {abierta ? (
        <FichaImagen
          imagen={abierta}
          onCerrar={() => setAbierta(null)}
          onCambio={async () => {
            await cargar(0)
          }}
          onEliminar={() => setAEliminar([abierta.id])}
        />
      ) : null}

      {aEliminar ? (
        <ConfirmarEliminar
          cantidad={aEliminar.length}
          pending={enLote}
          onCancelar={() => setAEliminar(null)}
          onConfirmar={() =>
            startLote(async () => {
              const r = await eliminarVarias(aEliminar)
              setAviso(r.ok ? (r.eliminadas === 1 ? "Eliminada." : `Eliminadas ${r.eliminadas}.`) : r.error)
              setAEliminar(null)
              setAbierta(null)
              setSeleccion((actual) => (actual ? new Set() : actual))
              await cargar(0)
            })
          }
        />
      ) : null}
    </div>
  )
}

function ConfirmarEliminar({
  cantidad,
  pending,
  onCancelar,
  onConfirmar,
}: {
  cantidad: number
  pending: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  return (
    <Dialog open onOpenChange={(abierto) => (abierto ? null : onCancelar())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{cantidad === 1 ? "¿Eliminar esta foto?" : `¿Eliminar ${cantidad} fotos?`}</DialogTitle>
          <DialogDescription>
            Se borran para siempre, con su historial. Las piezas que ya las usaron no cambian. Si solo quieres que no
            salgan en los carruseles, usa Descartar: se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirmar} disabled={pending}>
            <Trash2Icon /> {pending ? "Eliminando…" : "Eliminar para siempre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Resumen({
  resumen,
  porcentajeEspacio,
  onEtiquetado,
}: {
  resumen: ResumenBiblioteca
  porcentajeEspacio: number
  onEtiquetado: () => Promise<void>
}) {
  const [dias, setDias] = React.useState(String(resumen.diasSinRepetir))
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <strong className="tabular-nums">{resumen.total}</strong> fotos · {resumen.activas} activas
          {resumen.pendientes > 0 ? ` · ${resumen.pendientes} por etiquetar` : ""}
          {resumen.fallidas > 0 ? ` · ${resumen.fallidas} con fallo` : ""}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatoBytes(resumen.bytes)} de {formatoBytes(ESPACIO_PLAN_BYTES)}
        </span>
      </div>
      <div
        className="bg-muted h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={porcentajeEspacio}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full ${porcentajeEspacio > 85 ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${Math.max(1, porcentajeEspacio)}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        El espacio es el del plan de Supabase y lo comparten los carruseles ya dibujados. Las miniaturas suman una
        décima parte más.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="dias-sin-repetir" className="text-xs">
            Días sin repetir una foto
          </Label>
          <Input
            id="dias-sin-repetir"
            type="number"
            min={0}
            max={365}
            className="h-8 w-24"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || Number(dias) === resumen.diasSinRepetir}
          onClick={() =>
            startTransition(async () => {
              const r = await guardarDias(Number(dias))
              setAviso(r.ok ? "Guardado." : r.error)
            })
          }
        >
          Guardar
        </Button>
        {resumen.pendientes + resumen.fallidas > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setAviso("Etiquetando…")
                const r = await etiquetarAhora()
                setAviso(r.ok ? `Etiquetadas ${r.hechas}${r.fallidas ? `, ${r.fallidas} con fallo` : ""}.` : r.error)
                await onEtiquetado()
              })
            }
          >
            <SparklesIcon /> Etiquetar ahora
          </Button>
        ) : null}
        {aviso ? <span className="text-muted-foreground text-xs">{aviso}</span> : null}
      </div>
    </div>
  )
}

function PanelProgreso({ progreso, onCerrar }: { progreso: Progreso; onCerrar: (() => void) | null }) {
  const pct = progreso.total ? Math.round((progreso.hechas / progreso.total) * 100) : 0
  return (
    <div className="flex w-full flex-col gap-2 text-left text-sm">
      <div className="flex items-center justify-between gap-2">
        <span>{progreso.fase}</span>
        <span className="text-muted-foreground tabular-nums">
          {progreso.hechas} de {progreso.total}
        </span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-muted-foreground text-xs">
        {progreso.subidas} nuevas · {progreso.repetidas} ya estaban
        {progreso.fallos.length ? ` · ${progreso.fallos.length} con problema` : ""}
      </p>
      {progreso.fallos.length ? (
        <ul className="text-destructive max-h-32 overflow-y-auto text-xs">
          {progreso.fallos.map((f, i) => (
            <li key={i}>
              {f.nombre}: {f.motivo}
            </li>
          ))}
        </ul>
      ) : null}
      {onCerrar ? (
        <Button size="xs" variant="ghost" className="self-end" onClick={onCerrar}>
          Cerrar
        </Button>
      ) : null}
    </div>
  )
}

function FichaImagen({
  imagen,
  onCerrar,
  onCambio,
  onEliminar,
}: {
  imagen: ImagenDeGaleria
  onCerrar: () => void
  onCambio: () => Promise<void>
  onEliminar: () => void
}) {
  const [recortando, setRecortando] = React.useState(false)
  const [recorte, setRecorte] = React.useState<Recorte | null>(imagen.recorte)
  const util = medidasUtiles({ ancho: imagen.ancho, alto: imagen.alto, recorte })
  const [url, setUrl] = React.useState<string | null>(imagen.urlMini)
  const [usos, setUsos] = React.useState<(UsoDeImagen & { estadoPieza: string | null })[] | null>(null)
  const [descripcion, setDescripcion] = React.useState(imagen.descripcion)
  const [etiquetas, setEtiquetas] = React.useState(imagen.etiquetas.join(", "))
  const [usosSugeridos, setUsosSugeridos] = React.useState<UsoImagen[]>(imagen.usos_sugeridos)
  const [activa, setActiva] = React.useState(imagen.activa)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    let vivo = true
    void detalleImagen(imagen.id).then((r) => {
      if (!vivo || !r.ok) return
      if (r.url) setUrl(r.url)
      setUsos(r.usos)
    })
    return () => {
      vivo = false
    }
  }, [imagen.id])

  const guardar = () =>
    startTransition(async () => {
      const r = await cambiarImagen(imagen.id, {
        activa,
        descripcion,
        etiquetas: etiquetas.split(","),
        usos_sugeridos: usosSugeridos,
      })
      setAviso(r.ok ? "Guardado." : r.error)
      if (r.ok) await onCambio()
    })

  return (
    <Dialog open onOpenChange={(abierto) => (abierto ? null : onCerrar())}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{imagen.nombre_original || "Imagen"}</DialogTitle>
          <DialogDescription>
            {imagen.ancho}×{imagen.alto}
            {recorte ? ` · recortada a ${util.ancho}×${util.alto}` : ""} · {imagen.orientacion} ·{" "}
            {formatoBytes(imagen.bytes)}
            {imagen.calidad ? ` · calidad ${imagen.calidad}/5` : ""}
            {imagen.espacio_texto ? ` · texto ${imagen.espacio_texto}` : ""}
            {imagen.personas ? " · con personas" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {recortando && url ? (
            <Recortador
              url={url}
              ancho={imagen.ancho}
              alto={imagen.alto}
              inicial={recorte}
              pending={pending}
              onCancelar={() => setRecortando(false)}
              onGuardar={(nuevo) =>
                startTransition(async () => {
                  const r = await recortar(imagen.id, nuevo)
                  setAviso(r.ok ? (nuevo ? "Recorte guardado." : "Recorte quitado.") : r.error)
                  if (r.ok) {
                    setRecorte(nuevo)
                    setRecortando(false)
                    await onCambio()
                  }
                })
              }
            />
          ) : (
            <div className="bg-muted flex items-center justify-center overflow-hidden rounded-md">
              {url ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={imagen.descripcion} className="block max-h-[60vh] w-full object-contain" />
                  {recorte ? <MarcoRecorte recorte={recorte} /> : null}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="activa">Activa (los carruseles pueden usarla)</Label>
              <Switch id="activa" checked={activa} onCheckedChange={setActiva} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="etiquetas">Etiquetas, separadas por comas</Label>
              <Textarea id="etiquetas" rows={3} value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Sirve para</span>
              <div className="flex flex-wrap gap-1.5">
                {USOS_IMAGEN.map((u) => {
                  const marcado = usosSugeridos.includes(u)
                  return (
                    <Button
                      key={u}
                      size="xs"
                      variant={marcado ? "default" : "outline"}
                      onClick={() => setUsosSugeridos((l) => (marcado ? l.filter((x) => x !== u) : [...l, u]))}
                    >
                      {NOMBRE_USO[u]}
                    </Button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={pending} onClick={guardar}>
                Guardar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await reetiquetarImagen(imagen.id)
                    setAviso(r.ok ? "Claude la vuelve a mirar en segundo plano." : r.error)
                    if (r.ok) await onCambio()
                  })
                }
              >
                <SparklesIcon /> Volver a etiquetar
              </Button>
              <Button size="sm" variant="outline" disabled={pending || !url} onClick={() => setRecortando(true)}>
                <CropIcon /> Recortar
              </Button>
              <Button size="sm" variant="destructive" disabled={pending} onClick={onEliminar}>
                <Trash2Icon /> Eliminar
              </Button>
              {aviso ? <span className="text-muted-foreground text-xs">{aviso}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <h4 className="text-sm font-semibold">Dónde se ha usado</h4>
          {usos === null ? (
            <p className="text-muted-foreground text-xs">Cargando…</p>
          ) : usos.length === 0 ? (
            <p className="text-muted-foreground text-xs">Todavía en ninguna pieza.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {usos.map((u, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="tabular-nums">{haceCuanto(u.created_at)}</span>
                  <span>
                    {u.red} · lámina {u.lamina}
                  </span>
                  {u.estadoPieza === "rejected" ? (
                    <span className="text-muted-foreground">(pieza descartada, no cuenta)</span>
                  ) : null}
                  {u.motivo ? <span className="text-muted-foreground">— {u.motivo}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** La zona recortada sobre la imagen completa: lo de fuera se oscurece. */
function MarcoRecorte({ recorte }: { recorte: Recorte }) {
  return (
    <div
      className="pointer-events-none absolute border-2 border-white"
      style={{
        left: `${recorte.x * 100}%`,
        top: `${recorte.y * 100}%`,
        width: `${recorte.w * 100}%`,
        height: `${recorte.h * 100}%`,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
      }}
    />
  )
}

type Arrastre = { modo: "nuevo" | "mover" | "esquina"; x0: number; y0: number; inicio: Recorte }

/**
 * El recortador: arrastra sobre la foto para marcar la zona, dentro del
 * recuadro para moverlo y desde la esquina para cambiar su tamaño. Todo va en
 * fracciones de la imagen, que es como se guarda.
 */
function Recortador({
  url,
  ancho,
  alto,
  inicial,
  pending,
  onCancelar,
  onGuardar,
}: {
  url: string
  ancho: number
  alto: number
  inicial: Recorte | null
  pending: boolean
  onCancelar: () => void
  onGuardar: (recorte: Recorte | null) => void
}) {
  const [proporcion, setProporcion] = React.useState<number | null>(null)
  const [r, setR] = React.useState<Recorte>(inicial ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const caja = React.useRef<HTMLDivElement>(null)
  const arrastre = React.useRef<Arrastre | null>(null)
  // Una proporcion en pixeles, pasada a fracciones de esta imagen: w/h = k.
  const k = (p: number) => (p * alto) / ancho

  const ajustar = (c: Recorte, p: number | null): Recorte => {
    let w = Math.min(Math.max(c.w, 0.05), 1)
    let h = Math.min(Math.max(c.h, 0.05), 1)
    if (p) {
      h = w / k(p)
      if (h > 1) {
        h = 1
        w = k(p)
      }
      if (w > 1) {
        w = 1
        h = 1 / k(p)
      }
    }
    return { x: Math.min(Math.max(c.x, 0), 1 - w), y: Math.min(Math.max(c.y, 0), 1 - h), w, h }
  }

  const punto = (e: React.PointerEvent) => {
    const marco = caja.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - marco.left) / marco.width)),
      y: Math.min(1, Math.max(0, (e.clientY - marco.top) / marco.height)),
    }
  }

  const alPulsar = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = punto(e)
    const enEsquina = Math.abs(p.x - (r.x + r.w)) < 0.04 && Math.abs(p.y - (r.y + r.h)) < 0.04
    const dentro = p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h
    arrastre.current = { modo: enEsquina ? "esquina" : dentro ? "mover" : "nuevo", x0: p.x, y0: p.y, inicio: r }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const alMover = (e: React.PointerEvent) => {
    const a = arrastre.current
    if (!a) return
    const p = punto(e)
    if (a.modo === "mover") {
      setR(ajustar({ ...a.inicio, x: a.inicio.x + p.x - a.x0, y: a.inicio.y + p.y - a.y0 }, null))
    } else if (a.modo === "esquina") {
      setR(ajustar({ ...a.inicio, w: p.x - a.inicio.x, h: p.y - a.inicio.y }, proporcion))
    } else {
      const x = Math.min(a.x0, p.x)
      const y = Math.min(a.y0, p.y)
      setR(ajustar({ x, y, w: Math.abs(p.x - a.x0), h: Math.abs(p.y - a.y0) }, proporcion))
    }
  }

  const util = medidasUtiles({ ancho, alto, recorte: r })
  const blanda = util.ancho < ANCHO_MINIMO_LAMINA

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={caja}
        onPointerDown={alPulsar}
        onPointerMove={alMover}
        onPointerUp={() => {
          arrastre.current = null
        }}
        className="relative cursor-crosshair touch-none overflow-hidden rounded-md select-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" draggable={false} className="block w-full" />
        <div
          className="absolute cursor-move border-2 border-white"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        >
          <span className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm border-2 border-white bg-black" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PROPORCIONES_RECORTE.map((p) => (
          <Button
            key={p.etiqueta}
            size="xs"
            variant={proporcion === p.valor ? "default" : "outline"}
            onClick={() => {
              setProporcion(p.valor)
              if (!p.valor) return
              // Mantiene el centro y encaja la proporcion dentro de la imagen.
              const nuevo = ajustar(r, p.valor)
              setR(ajustar({ ...nuevo, x: r.x + (r.w - nuevo.w) / 2, y: r.y + (r.h - nuevo.h) / 2 }, null))
            }}
          >
            {p.etiqueta}
          </Button>
        ))}
      </div>
      <p className={`text-xs ${blanda ? "text-destructive" : "text-muted-foreground"}`}>
        Queda de {util.ancho}×{util.alto} px.
        {blanda ? ` La lámina usa ${ANCHO_MINIMO_LAMINA} px de ancho: así se verá algo blanda.` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => onGuardar(r)}>
          Guardar recorte
        </Button>
        {inicial ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => onGuardar(null)}>
            Quitar recorte
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={pending} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ en el navegador

type Comprimida = { blob: Blob; ancho: number; alto: number }

async function huellaDe(archivo: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** La imagen y su miniatura, de un solo decodificado. */
async function comprimirDos(archivo: File): Promise<[Comprimida, Comprimida]> {
  const bitmap = await createImageBitmap(archivo, {
    imageOrientation: "from-image",
  })
  try {
    return [await dibujar(bitmap, LADO_IMAGEN, CALIDAD_IMAGEN), await dibujar(bitmap, LADO_MINI, CALIDAD_MINI)]
  } finally {
    bitmap.close()
  }
}

async function dibujar(bitmap: ImageBitmap, lado: number, calidad: number): Promise<Comprimida> {
  const { ancho, alto } = medidasEncajadas(bitmap.width, bitmap.height, lado)
  const canvas = document.createElement("canvas")
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("El navegador no deja dibujar la imagen.")
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, 0, 0, ancho, alto)
  const webp = await aBlob(canvas, "image/webp", calidad)
  // Safari viejo no codifica WebP y devuelve PNG: ahi va JPEG, que pesa menos.
  const blob = webp && webp.type === "image/webp" ? webp : await aBlob(canvas, "image/jpeg", calidad)
  if (!blob) throw new Error("No se pudo comprimir.")
  return { blob, ancho, alto }
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolver) => canvas.toBlob(resolver, tipo, calidad))
}

/** Sube a un enlace firmado de Supabase Storage. */
async function subirA(url: string, blob: Blob): Promise<void> {
  const r = await fetch(url, {
    method: "PUT",
    body: blob,
    headers: { "content-type": blob.type, "x-upsert": "false" },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}

function motivoDeFallo(archivo: File, error: unknown): string {
  if (/\.(heic|heif)$/i.test(archivo.name)) return "Este navegador no abre HEIC. Expórtala como JPG y súbela otra vez."
  return error instanceof Error && error.message ? error.message : "No se pudo abrir la imagen."
}

function haceCuanto(fecha: string): string {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000)
  if (dias <= 0) return "hoy"
  if (dias === 1) return "ayer"
  return `hace ${dias} días`
}
