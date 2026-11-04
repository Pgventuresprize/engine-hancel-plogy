"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AlertTriangleIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, PauseCircleIcon, PlayCircleIcon } from "lucide-react"

import { programarPiezas, quitarAprobacion, quitarDelCalendario, reintentarPieza, repartirPiezas, resolverRevision } from "@/app/calendario/actions"
import { approvePiece, publishPieceNow } from "@/app/estudio/actions"
import { Bandeja } from "@/components/calendario/bandeja"
import { DetallePost, type AccionesDetalle } from "@/components/calendario/detalle-post"
import { HorariosDialog } from "@/components/calendario/horarios-dialog"
import { RepartirDialog, type PlanReparto } from "@/components/calendario/repartir-dialog"
import { sePuedeMover, tieneAviso } from "@/components/calendario/tarjeta-post"
import { Agenda, fechaCorta, MESES, Mes, mesDe, numeroDia, Semana } from "@/components/calendario/vistas"
import { useAltoHastaAbajo } from "@/components/kanban/use-alto-hasta-abajo"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { aHora, claveHueco, horaLibre, lunesDe, sumarDias, sumarMeses, yaPaso } from "@/engine/calendario/reparto"
import { useIsMobile } from "@/hooks/use-mobile"
import { NOMBRE_RED, type Ahora, type Colocacion, type DatosCalendario, type PostCalendario, type RedCalendario, type ResultadoCalendario, type VistaCalendario } from "@/lib/calendario-tipos"
import { cn } from "@/lib/utils"

type Filtro = "todas" | RedCalendario
type Lugar = { id: string; dia: string | null; hora: string | null }
type Cambio = { tipo: "colocar"; lista: Lugar[] } | { tipo: "estado"; id: string; estado: PostCalendario["estado"] }
type AvisoPantalla = { texto: string; deshacer?: () => void }

/** Lo que viaja en el arrastre: propio, para no aceptar texto soltado desde otra ventana. */
const TIPO_ARRASTRE = "application/x-plogy-piezas"

/** Mientras el servidor responde, la pantalla ya muestra el cambio; si falla, vuelve sola. */
function aplicarCambio(posts: PostCalendario[], cambio: Cambio): PostCalendario[] {
  if (cambio.tipo === "estado") return posts.map((p) => (p.id === cambio.id ? { ...p, estado: cambio.estado } : p))
  return posts.map((p) => {
    const nuevo = cambio.lista.find((c) => c.id === p.id)
    return nuevo ? { ...p, dia: nuevo.dia, hora: nuevo.hora, estado: nuevo.dia ? "programada" : "bandeja", error: null } : p
  })
}

function horaEn(zona: string): Ahora {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date())
  const n = (t: string) => partes.find((p) => p.type === t)?.value ?? ""
  return { dia: `${n("year")}-${n("month")}-${n("day")}`, hora: aHora(Number(n("hour")) * 60 + Number(n("minute"))) }
}

function Segmentos<T extends string>({ opciones, valor, alCambiar }: { opciones: [T, string][]; valor: T; alCambiar: (v: T) => void }) {
  return (
    <div className="bg-muted inline-flex max-w-full gap-0.5 rounded-lg p-0.5">
      {opciones.map(([id, nombre]) => (
        <button key={id} type="button" aria-pressed={valor === id} onClick={() => alCambiar(id)} className={cn("rounded-md px-2 py-1 text-[12.5px] whitespace-nowrap", valor === id ? "bg-background font-semibold shadow-xs" : "text-muted-foreground")}>
          {nombre}
        </button>
      ))}
    </div>
  )
}

export function Calendario({ datos }: { datos: DatosCalendario }) {
  const router = useRouter()
  const movil = useIsMobile()
  const [ref, alto] = useAltoHastaAbajo<HTMLDivElement>(40)

  const [posts, aplicar] = React.useOptimistic(datos.posts, aplicarCambio)
  const [ocupado, iniciar] = React.useTransition()
  const [navegando, iniciarNavegacion] = React.useTransition()

  const [reloj, setReloj] = React.useState<Ahora | null>(null)
  const ahora = reloj ?? datos.ahora
  const [filtro, setFiltro] = React.useState<Filtro>("todas")
  const [seleccion, setSeleccion] = React.useState<Set<string>>(new Set())
  const [abierto, setAbierto] = React.useState<PostCalendario | null>(null)
  const [pendiente, setPendiente] = React.useState<Colocacion[] | null>(null)
  const [aviso, setAviso] = React.useState<AvisoPantalla | null>(null)
  const [encima, setEncima] = React.useState<string | null>(null)
  const [repartirAbierto, setRepartirAbierto] = React.useState(false)
  const [horariosAbierto, setHorariosAbierto] = React.useState(false)
  // Editar horarios desde Repartir: al terminar se vuelve donde se estaba.
  const [volverARepartir, setVolverARepartir] = React.useState(false)
  const arrastrando = React.useRef(false)

  // El reloj avanza y la pantalla se refresca sola: un post puede salir con esto
  // abierto, y no enterarse dejaria moverlo a sabiendas de nada.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      setReloj(horaEn(datos.zona))
      if (document.visibilityState === "visible" && !arrastrando.current) router.refresh()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [datos.zona, router])

  React.useEffect(() => {
    if (!aviso) return
    const id = window.setTimeout(() => setAviso(null), aviso.deshacer ? 8000 : 6000)
    return () => window.clearTimeout(id)
  }, [aviso])

  const porId = (id: string) => posts.find((p) => p.id === id)
  const visibles = posts.filter((p) => filtro === "todas" || p.red === filtro)
  const enBandeja = visibles.filter((p) => p.estado === "bandeja")
  const colocados = visibles.filter((p) => p.dia)
  // El conteo del servidor incluye lo que no se cargo. Se ajusta con lo que aun
  // esta en camino, para que el numero no vaya por detras de la lista.
  const totalBandeja = filtro === "todas" ? datos.enBandeja + enBandeja.length - datos.posts.filter((p) => p.estado === "bandeja").length : enBandeja.length
  // El que esta abierto puede quedar fuera de lo cargado al moverlo a otra semana.
  const postAbierto = abierto ? (porId(abierto.id) ?? abierto) : null

  /** Corre una accion; lo que falle se dice en pantalla en vez de perderse. */
  const correr = (accion: () => Promise<void>) =>
    iniciar(async () => {
      try {
        await accion()
      } catch {
        setAviso({ texto: "No respondió. Revisa tu conexión e inténtalo otra vez." })
      }
    })

  /** `aprobadas`: las que se aprobaron solo para colocarlas. Deshacer tambien las desaprueba. */
  const restaurar = (previo: Lugar[], aprobadas: string[] = []) =>
    correr(async () => {
      aplicar({ tipo: "colocar", lista: previo })
      const conFecha = previo.filter((p): p is Colocacion => Boolean(p.dia && p.hora))
      const sinFecha = previo.filter((p) => !p.dia).map((p) => p.id)
      const r1 = conFecha.length ? await programarPiezas(conFecha) : null
      if (r1 && !r1.ok) return setAviso({ texto: r1.error })
      const r2 = sinFecha.length ? await quitarDelCalendario(sinFecha) : null
      if (r2 && !r2.ok) return setAviso({ texto: r2.error })
      const r3 = await quitarAprobacion(aprobadas)
      if (!r3.ok) return setAviso({ texto: r3.error })
      setAviso({ texto: "Deshecho." })
    })

  const ejecutar = (lista: Colocacion[], aprobar: boolean) => {
    const previo = lista.map((c) => ({ id: c.id, dia: porId(c.id)?.dia ?? null, hora: porId(c.id)?.hora ?? null }))
    const aprobadas = aprobar ? lista.filter((c) => porId(c.id)?.frenada).map((c) => c.id) : []
    correr(async () => {
      aplicar({ tipo: "colocar", lista })
      const r = await repartirPiezas(lista, aprobadas)
      if (!r.ok) return setAviso({ texto: r.error })
      setSeleccion(new Set())
      const [c] = r.colocadas
      const texto = r.colocadas.length === 1 ? `Programada: ${fechaCorta(c.dia)}, ${c.hora}.` : `${r.colocadas.length} piezas programadas.`
      setAviso({ texto: r.warning ? `${texto} ${r.warning}` : texto, deshacer: () => restaurar(previo, aprobadas) })
    })
  }

  const colocar = (ids: string[], dia: string, hora: string | null) => {
    const piezas = ids.flatMap((id) => porId(id) ?? []).filter(sePuedeMover)
    if (piezas.length === 0) return

    const ocupadas = new Set(posts.filter((p) => p.dia && p.hora && !ids.includes(p.id)).map((p) => claveHueco(p.red, p.dia as string, p.hora as string)))
    const lista: Colocacion[] = []
    for (const p of piezas) {
      const pedida = hora ?? p.hora ?? "12:00"
      if (yaPaso(dia, pedida, ahora)) return setAviso({ texto: `Esa hora ya pasó: elige después de ${fechaCorta(ahora.dia)}, ${ahora.hora}.` })
      const libre = horaLibre(dia, pedida, p.red, ocupadas)
      if (!libre) return setAviso({ texto: "No queda sitio ese día a partir de esa hora." })
      ocupadas.add(claveHueco(p.red, dia, libre))
      lista.push({ id: p.id, dia, hora: libre })
    }

    // Una frenada programada sin aprobar no saldria: mejor decidirlo ahora.
    if (piezas.some((p) => p.frenada)) return setPendiente(lista)
    ejecutar(lista, false)
  }

  const quitar = (ids: string[]) => {
    const piezas = ids.flatMap((id) => porId(id) ?? []).filter((p) => sePuedeMover(p) && p.dia)
    if (piezas.length === 0) return
    const previo = piezas.map((p) => ({ id: p.id, dia: p.dia, hora: p.hora }))
    correr(async () => {
      aplicar({ tipo: "colocar", lista: piezas.map((p) => ({ id: p.id, dia: null, hora: null })) })
      const r = await quitarDelCalendario(piezas.map((p) => p.id))
      if (!r.ok) return setAviso({ texto: r.error })
      setAviso({ texto: "Volvió a la bandeja.", deshacer: () => restaurar(previo) })
    })
  }

  const ejecutarReparto = ({ lista, aprobar }: PlanReparto) => {
    const previo = lista.map((c) => ({ id: c.id, dia: null, hora: null }))
    setRepartirAbierto(false)
    correr(async () => {
      aplicar({ tipo: "colocar", lista })
      const r = await repartirPiezas(lista, aprobar)
      if (!r.ok) return setAviso({ texto: r.error })
      setSeleccion(new Set())
      const faltan = lista.length - r.colocadas.length
      const texto = `${r.colocadas.length} ${r.colocadas.length === 1 ? "pieza programada" : "piezas programadas"}.${faltan ? ` ${faltan} no se pudieron colocar y siguen en la bandeja.` : ""}`
      setAviso({ texto: r.warning ? `${texto} ${r.warning}` : texto, deshacer: () => restaurar(previo, aprobar) })
    })
  }

  const conResultado = (r: ResultadoCalendario, texto: string) => setAviso({ texto: r.ok ? texto : r.error })

  const acciones: AccionesDetalle = {
    colocar,
    quitar,
    aprobar: (id) =>
      correr(async () => {
        const r = await approvePiece(id)
        setAviso({ texto: r.ok ? "Aprobada." : r.error })
      }),
    reintentar: (id) =>
      correr(async () => {
        aplicar({ tipo: "estado", id, estado: "programada" })
        conResultado(await reintentarPieza(id), "Se reintenta en la próxima pasada.")
      }),
    resolver: (id, salio) =>
      correr(async () => {
        conResultado(await resolverRevision(id, salio), salio ? "Quedó como publicada." : "Se publica en la próxima pasada.")
      }),
    publicarYa: (id) =>
      correr(async () => {
        aplicar({ tipo: "estado", id, estado: "publicando" })
        const r = await publishPieceNow(id)
        setAviso({ texto: r.ok ? "Publicada." : r.error })
      }),
    abrirPorId: (id) => {
      const p = porId(id)
      if (p) setAbierto(p)
      else setAviso({ texto: "Esa pieza está fuera de las fechas que estás viendo." })
    },
  }

  const alArrastrar = (id: string, e: React.DragEvent) => {
    arrastrando.current = true
    e.dataTransfer.setData(TIPO_ARRASTRE, (seleccion.has(id) ? [...seleccion] : [id]).join(","))
    e.dataTransfer.effectAllowed = "move"
  }

  const destino = (clave: string, bloqueado: boolean, alSoltar: (ids: string[]) => void): React.HTMLAttributes<HTMLElement> => ({
    onDragOver: (e) => {
      if (bloqueado || !e.dataTransfer.types.includes(TIPO_ARRASTRE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      if (encima !== clave) setEncima(clave)
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima((c) => (c === clave ? null : c))
    },
    onDrop: (e) => {
      e.preventDefault()
      const ids = e.dataTransfer.getData(TIPO_ARRASTRE)
      setEncima(null)
      if (!bloqueado && ids) alSoltar(ids.split(","))
    },
  })

  const ir = (vista: VistaCalendario, fecha: string) =>
    iniciarNavegacion(() => router.push(`/calendario?vista=${vista}&fecha=${fecha}`, { scroll: false }))

  const mover = (paso: number) => (datos.vista === "mes" ? ir("mes", sumarMeses(datos.fecha, paso)) : ir("semana", sumarDias(datos.fecha, paso * 7)))

  const finSemana = sumarDias(datos.fecha, 6)
  const titulo =
    datos.vista === "mes"
      ? `${MESES[mesDe(datos.fecha)][0].toUpperCase()}${MESES[mesDe(datos.fecha)].slice(1)} ${datos.fecha.slice(0, 4)}`
      : `${numeroDia(datos.fecha)}${mesDe(datos.fecha) !== mesDe(finSemana) ? ` de ${MESES[mesDe(datos.fecha)]}` : ""} al ${numeroDia(finSemana)} de ${MESES[mesDe(finSemana)]}`

  const nProgramadas = colocados.filter((p) => p.estado === "programada").length
  const nPublicadas = colocados.filter((p) => p.estado === "publicada").length
  const fallidas = colocados.filter((p) => p.estado === "fallida")
  const enRevisar = visibles.filter((p) => p.estado === "revisar")
  const conAviso = colocados.filter(tieneAviso)
  const sinConectar = (["instagram", "linkedin"] as const).filter((r) => !datos.redesConectadas.includes(r))
  const frenadasPendientes = (pendiente ?? []).flatMap((c) => {
    const p = porId(c.id)
    return p?.frenada ? [p] : []
  })

  const ocupadas = new Set([...datos.ocupados, ...posts.filter((p) => p.dia && p.hora).map((p) => claveHueco(p.red, p.dia as string, p.hora as string))])
  const paraRepartir = seleccion.size ? enBandeja.filter((p) => seleccion.has(p.id)) : enBandeja
  const nProgramadasTotal = datos.ocupados.length

  const comun = { posts: colocados, ahora, alAbrir: setAbierto, alArrastrar }
  const conDestinos = { destino, encima, alSoltar: colocar }

  return (
    <div
      ref={ref}
      // En el celular la pagina hace scroll: encajarlo todo en el alto de la pantalla
      // dejaba la agenda en una rendija.
      style={alto && !movil ? { height: alto } : undefined}
      onDragEnd={() => {
        arrastrando.current = false
        setEncima(null)
      }}
      className="bg-background grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border md:grid-cols-[286px_minmax(0,1fr)] md:grid-rows-1"
    >
      <div className="flex max-h-[36vh] min-h-0 flex-col md:contents md:max-h-none">
        <Bandeja
          posts={enBandeja}
          total={totalBandeja}
          seleccion={seleccion}
          encima={encima === "bandeja"}
          destino={destino("bandeja", false, quitar)}
          alSeleccionar={(ids, marcar) =>
            setSeleccion((s) => {
              const nueva = new Set(s)
              for (const id of ids) {
                if (marcar) nueva.add(id)
                else nueva.delete(id)
              }
              return nueva
            })
          }
          alAbrir={setAbierto}
          alArrastrar={alArrastrar}
          alRepartir={() => setRepartirAbierto(true)}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
          <Button variant="outline" size="icon" aria-label="Anterior" onClick={() => mover(-1)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" onClick={() => ir(datos.vista, ahora.dia)}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" aria-label="Siguiente" onClick={() => mover(1)}>
            <ChevronRightIcon />
          </Button>
          <h2 className={cn("font-display mx-1 text-[19px] leading-tight whitespace-nowrap", navegando && "opacity-50")}>{titulo}</h2>
          <Segmentos<VistaCalendario> opciones={[["semana", "Semana"], ["mes", "Mes"]]} valor={datos.vista} alCambiar={(v) => ir(v, v === datos.vista ? datos.fecha : v === "mes" ? datos.fecha : lunesDe(ahora.dia))} />
          <Segmentos<Filtro> opciones={[["todas", "Todas"], ["instagram", "Instagram"], ["linkedin", "LinkedIn"]]} valor={filtro} alCambiar={setFiltro} />
          <span className="flex-1" />
          {datos.publicarActivo ? (
            <span className="bg-success-soft text-success inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold">
              <PlayCircleIcon className="size-3.5" />
              Publicando a su hora
            </span>
          ) : null}
          <Button variant="outline" onClick={() => setHorariosAbierto(true)}>
            <ClockIcon />
            Horarios
          </Button>
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3.5 gap-y-1 px-4 pb-2.5 text-[12.5px]">
          <span>
            <b className="text-foreground font-semibold tabular-nums">{nProgramadas}</b> programadas
          </span>
          <span>
            <b className="text-foreground font-semibold tabular-nums">{nPublicadas}</b> publicadas
          </span>
          {enRevisar.length ? (
            <button type="button" className="text-warning font-semibold underline underline-offset-2" onClick={() => setAbierto(enRevisar[0])}>
              {enRevisar.length} por revisar
            </button>
          ) : null}
          {fallidas.length ? (
            <button type="button" className="text-destructive font-semibold underline underline-offset-2" onClick={() => setAbierto(fallidas[0])}>
              {fallidas.length} sin salir
            </button>
          ) : null}
          {conAviso.length ? (
            <button type="button" className="text-warning font-semibold underline underline-offset-2" onClick={() => setAbierto(conAviso[0])}>
              {conAviso.length} no saldrían
            </button>
          ) : null}
        </div>

        {!datos.publicarActivo ? (
          <div className="bg-muted text-muted-foreground flex items-center gap-2 border-t px-4 py-1.5 text-[12.5px]">
            <PauseCircleIcon className="size-4 shrink-0" />
            <span>La publicación programada está apagada: puedes organizar todo, pero nada sale solo.</span>
          </div>
        ) : null}
        {sinConectar.length ? (
          <div className="bg-warning-soft text-warning flex items-center gap-2 border-t px-4 py-1.5 text-[12.5px]">
            <AlertTriangleIcon className="size-4 shrink-0" />
            <span>{sinConectar.map((r) => NOMBRE_RED[r]).join(" y ")} sin conectar: sus posts no saldrán hasta conectarlo en Configuración.</span>
          </div>
        ) : null}

        <div className={cn("min-h-0 flex-1 overflow-auto border-t", navegando && "opacity-60")}>
          {datos.vista === "mes" ? (
            <Mes {...comun} {...conDestinos} inicio={datos.fecha} primerLunes={lunesDe(datos.fecha)} alIrADia={(dia) => ir("semana", dia)} />
          ) : movil ? (
            <Agenda {...comun} lunes={datos.fecha} />
          ) : (
            <Semana {...comun} {...conDestinos} lunes={datos.fecha} horarios={datos.horarios} ocupadas={ocupadas} filtro={filtro} />
          )}
        </div>
      </div>

      <RepartirDialog
        abierto={repartirAbierto}
        piezas={paraRepartir}
        haySeleccion={seleccion.size > 0}
        horarios={datos.horarios}
        ocupadas={ocupadas}
        ahora={ahora}
        alCerrar={() => setRepartirAbierto(false)}
        alConfirmar={ejecutarReparto}
        alEditarHorarios={() => {
          setRepartirAbierto(false)
          setVolverARepartir(true)
          setHorariosAbierto(true)
        }}
      />

      <HorariosDialog
        abierto={horariosAbierto}
        horarios={datos.horarios}
        publicarActivo={datos.publicarActivo}
        programadas={nProgramadasTotal}
        alAviso={(texto) => setAviso({ texto })}
        alCerrar={() => {
          setHorariosAbierto(false)
          if (volverARepartir) setRepartirAbierto(true)
          setVolverARepartir(false)
        }}
      />

      <DetallePost post={postAbierto} ahora={ahora} publicarActivo={datos.publicarActivo} ocupado={ocupado} acciones={acciones} alCerrar={() => setAbierto(null)} />

      <Dialog open={pendiente !== null} onOpenChange={(a) => (a ? null : setPendiente(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{frenadasPendientes.length > 1 ? `${frenadasPendientes.length} piezas están frenadas` : "Esta pieza está frenada"}</DialogTitle>
            <DialogDescription>Si la programas sin aprobarla, no saldrá a su hora.</DialogDescription>
          </DialogHeader>
          {frenadasPendientes[0] ? (
            <div className="bg-warning-soft text-warning flex gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-snug">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              <span>{(frenadasPendientes[0].hallazgo ?? (frenadasPendientes[0].deChat ? "Viene del chat y aún nadie la aprueba." : "El revisor marcó un problema.")).slice(0, 300)}</span>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendiente(null)}>
              Dejarla como está
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (frenadasPendientes[0]) setAbierto(frenadasPendientes[0])
                setPendiente(null)
              }}
            >
              Abrir para ver
            </Button>
            <Button
              variant="brand"
              onClick={() => {
                if (pendiente) ejecutar(pendiente, true)
                setPendiente(null)
              }}
            >
              <CheckIcon />
              Aprobar y programar
              {(pendiente?.length ?? 0) > 1 ? ` (${pendiente?.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {aviso ? (
        <div role="status" className="bg-foreground text-background fixed bottom-[calc(18px+env(safe-area-inset-bottom,0px))] left-1/2 z-[60] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl px-3.5 py-2 text-[13.5px] shadow-lg">
          <span>{aviso.texto}</span>
          {aviso.deshacer ? (
            <button
              type="button"
              className="text-brand font-semibold whitespace-nowrap"
              onClick={() => {
                aviso.deshacer?.()
                setAviso(null)
              }}
            >
              Deshacer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
