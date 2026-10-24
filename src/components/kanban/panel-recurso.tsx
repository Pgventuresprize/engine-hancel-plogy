"use client"

import * as React from "react"
import { CheckIcon, CopyIcon, ExternalLinkIcon, RefreshCwIcon, SendIcon, WandSparklesIcon, XIcon } from "lucide-react"

import {
  aprobarRecurso,
  leerRecurso,
  rehacerRecurso,
  retirarRecurso,
  type EstadoRecursoFicha,
  type RecursoDeLaFicha,
} from "@/app/estudio/recurso-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { Hallazgo } from "@/engine/content/revisor"
import {
  CRITERIOS_RECURSO,
  NOMBRE_LECTURA,
  NOMBRE_ROTULO,
  NOMBRE_TIPO_RECURSO,
  VEREDICTOS,
  type Bloque,
  type Item,
  type Lectura,
  type Rotulo,
} from "@/engine/recursos/modelo"
import { formatDateTime } from "@/lib/format"

/**
 * La pestaña Recurso de la ficha: el reporte o la guia que promete el cierre,
 * con su revision, su registro, sus fuentes y los mensajes del DM, y los
 * botones para aprobarlo (sale al portal), corregirlo, rehacerlo o retirarlo.
 *
 * Se lee al abrir la pestaña y no con el tablero: un reporte entero pesa, y el
 * tablero carga todas las fichas a la vez.
 */

const NOMBRE_ESTADO_DATO: Record<string, string> = {
  confirmado: "Confirmado",
  de_terceros: "De terceros",
  sin_verificar: "Sin verificar",
}

/** El color de cada rotulo: lo que no es un hecho se ve distinto al leer. */
const CLASE_ROTULO: Record<Rotulo, string> = {
  hecho: "border-transparent bg-muted text-muted-foreground",
  lectura: "border-transparent bg-primary/10 text-primary",
  hipotesis: "border-amber-400 text-amber-700 dark:text-amber-400",
  calculo: "border-sky-400 text-sky-700 dark:text-sky-400",
  traduccion: "border-violet-400 text-violet-700 dark:text-violet-400",
  ejemplo: "border-amber-400 text-amber-700 dark:text-amber-400",
}

export function PanelRecurso({ angleId }: { angleId: string }) {
  const [estado, setEstado] = React.useState<EstadoRecursoFicha | null>(null)
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null)
  const [cargando, startCarga] = React.useTransition()

  const cargar = React.useCallback(() => {
    startCarga(async () => {
      const r = await leerRecurso(angleId)
      if (r.ok) {
        setEstado(r.estado)
        setErrorCarga(null)
      } else setErrorCarga(r.error)
    })
  }, [angleId])

  React.useEffect(() => cargar(), [cargar])

  if (errorCarga) return <p className="text-destructive text-sm">{errorCarga}</p>
  if (!estado) return <p className="text-muted-foreground text-sm">Cargando el recurso…</p>

  return (
    <div className="flex flex-col gap-4 text-sm">
      {estado.enCurso ? (
        <p className="rounded-md border border-sky-300 bg-sky-50 p-2.5 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
          El agente de recursos está trabajando: <strong>{estado.enCurso.etapa}</strong> (pedido {formatDateTime(estado.enCurso.desde)}). Va por
          etapas entre pasadas y tarda unos minutos.
        </p>
      ) : null}
      {estado.error && !estado.enCurso ? (
        <p className="rounded-md border border-red-300 bg-red-50 p-2.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
          La última vez falló: {estado.error}
        </p>
      ) : null}

      {estado.recurso ? (
        <Recurso recurso={estado.recurso} angleId={angleId} portal={estado.portalConectado} ocupado={Boolean(estado.enCurso)} alCambiar={cargar} />
      ) : (
        <SinRecurso angleId={angleId} ocupado={Boolean(estado.enCurso)} alCambiar={cargar} />
      )}

      <div>
        <Button size="sm" variant="ghost" disabled={cargando} onClick={cargar}>
          <RefreshCwIcon />
          {cargando ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>
    </div>
  )
}

function useAccion(alTerminar: () => void) {
  const [pending, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const correr = (fn: () => Promise<{ ok: boolean; error?: string; warning?: string }>) =>
    start(async () => {
      setError(null)
      setAviso(null)
      try {
        const r = await fn()
        if (!r.ok) setError(r.error ?? "Algo falló.")
        else if (r.warning) setAviso(r.warning)
      } catch (e) {
        setError(e instanceof Error && e.message ? `No se pudo completar: ${e.message}` : "No se pudo completar: la acción no respondió.")
      }
      alTerminar()
    })
  return { pending, error, aviso, correr }
}

function SinRecurso({ angleId, ocupado, alCambiar }: { angleId: string; ocupado: boolean; alCambiar: () => void }) {
  const { pending, error, aviso, correr } = useAccion(alCambiar)
  if (ocupado) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground">Este ángulo todavía no tiene recurso escrito.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending} onClick={() => correr(() => rehacerRecurso(angleId, "rehacer"))}>
          <WandSparklesIcon />
          {pending ? "Encolando…" : "Escribir el recurso"}
        </Button>
        {error ? <span className="text-destructive text-xs">{error}</span> : null}
        {aviso ? <span className="text-muted-foreground text-xs">{aviso}</span> : null}
      </div>
    </div>
  )
}

function Recurso({
  recurso: r,
  angleId,
  portal,
  ocupado,
  alCambiar,
}: {
  recurso: RecursoDeLaFicha
  angleId: string
  portal: boolean
  ocupado: boolean
  alCambiar: () => void
}) {
  const { pending, error, aviso, correr } = useAccion(alCambiar)
  const [pedido, setPedido] = React.useState("")
  const p = r.payload
  const revision = r.revision

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{NOMBRE_TIPO_RECURSO[r.tipo]}</Badge>
        <Badge variant="secondary">Comenta {r.palabra}</Badge>
        <EstadoBadge recurso={r} />
        <span className="text-muted-foreground text-xs">
          Versión {r.version}
          {r.wordCount ? ` · ${r.wordCount.toLocaleString("es-CO")} palabras` : ""} · {formatDateTime(r.actualizado)}
        </span>
      </div>

      {revision ? <RevisionRecurso revision={revision} /> : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold leading-snug">{p.titular}</h3>
        <ul className="list-disc space-y-1 pl-5">
          {p.resumen.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
        {p.secciones.map((s, i) => (
          <div key={i} className="flex flex-col gap-2 pt-2">
            <h4 className="font-semibold">{s.titulo}</h4>
            {s.bloques.map((b, j) => (
              <BloqueVista key={j} bloque={b} />
            ))}
          </div>
        ))}
        {p.siguiente_paso ? (
          <div className="flex flex-col gap-1 pt-2">
            <h4 className="font-semibold">Siguiente paso</h4>
            <p>{p.siguiente_paso}</p>
          </div>
        ) : null}
      </section>

      <Dm recurso={r} />

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-xs font-medium">Fuentes ({r.fuentes.length}) y registro de verificación</summary>
        <div className="mt-3 flex flex-col gap-3 text-xs">
          <ol className="flex flex-col gap-1.5">
            {r.fuentes.map((f) => (
              <li key={f.id}>
                <span className="font-mono">{f.id}</span>{" "}
                <a href={f.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {f.titulo || f.medio}
                </a>{" "}
                · {f.medio}
                {f.fecha ? ` · ${f.fecha}` : ""} · <span className="text-muted-foreground">{NOMBRE_LECTURA[f.lectura as Lectura] ?? f.lectura}</span>
              </li>
            ))}
            {r.pendientes.map((f) => (
              <li key={f.url} className="text-muted-foreground">
                {f.medio}: no se pudo leer ({f.url})
              </li>
            ))}
          </ol>
          {r.registro ? (
            <div className="flex flex-col gap-2 border-t pt-2">
              <ul className="flex flex-col gap-1">
                {r.registro.datos.map((d, i) => (
                  <li key={i}>
                    <Badge variant="outline" className="mr-1 px-1.5 py-0 text-[10px] font-normal">
                      {NOMBRE_ESTADO_DATO[d.estado] ?? d.estado}
                    </Badge>
                    {d.dato}
                    {d.nota ? <span className="text-muted-foreground"> ({d.nota})</span> : null}
                    <span className="text-muted-foreground"> · {d.fuentes.join(", ")}</span>
                  </li>
                ))}
              </ul>
              {r.registro.contradicciones.length ? (
                <div>
                  <p className="font-medium">Contradicciones</p>
                  <ul className="flex flex-col gap-1">
                    {r.registro.contradicciones.map((c, i) => (
                      <li key={i}>
                        {c.tema}: {c.versiones.map((v) => `${v.fuente} dice «${v.dice}»`).join("; ")}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {r.registro.intereses.length ? (
                <div>
                  <p className="font-medium">Interés de las fuentes</p>
                  <ul className="flex flex-col gap-1">
                    {r.registro.intereses.map((x, i) => (
                      <li key={i}>
                        {x.fuente}: {x.interes}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {r.registro.no_se_sabe.length ? (
                <div>
                  <p className="font-medium">Lo que no se sabe</p>
                  <ul className="list-disc pl-4">
                    {r.registro.no_se_sabe.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>

      <div className="flex flex-col gap-2 border-t pt-3">
        {r.web.error ? <p className="text-xs text-amber-700 dark:text-amber-400">{r.web.error}</p> : null}
        {r.web.url ? (
          <p className="text-xs">
            En la web:{" "}
            <a href={r.web.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {r.web.url}
            </a>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {r.status === "listo" ? (
            <Button size="sm" disabled={pending || ocupado} onClick={() => correr(() => aprobarRecurso(r.id))}>
              <SendIcon />
              {portal ? "Aprobar y enviar a la web" : "Aprobar"}
            </Button>
          ) : null}
          {r.status === "aprobado" && r.web.url ? (
            <Button size="sm" variant="outline" render={<a href={r.web.url} target="_blank" rel="noreferrer" />}>
              <ExternalLinkIcon />
              Ver en la web
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={pending || ocupado} onClick={() => correr(() => rehacerRecurso(angleId, "corregir", pedido))}>
            <WandSparklesIcon />
            Corregir
          </Button>
          <Button size="sm" variant="outline" disabled={pending || ocupado} onClick={() => correr(() => rehacerRecurso(angleId, "rehacer"))}>
            <RefreshCwIcon />
            Rehacer
          </Button>
          {r.status !== "descartado" ? (
            <Button size="sm" variant="ghost" disabled={pending || ocupado} onClick={() => correr(() => retirarRecurso(r.id))}>
              <XIcon />
              {r.web.url ? "Retirar de la web" : "Descartar"}
            </Button>
          ) : null}
        </div>
        <Textarea
          rows={2}
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          placeholder="Opcional, para Corregir: qué quieres que cambie. Sin esto, corrige lo que encontró el revisor."
          className="text-xs"
        />
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        {aviso ? <p className="text-muted-foreground text-xs">{aviso}</p> : null}
        {!portal ? (
          <p className="text-muted-foreground text-xs">
            La marca no tiene portal conectado: el recurso no puede salir a la web ni el DM tener enlace. Se conecta en Configuración &gt;
            Conexiones.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function EstadoBadge({ recurso: r }: { recurso: RecursoDeLaFicha }) {
  if (r.status === "descartado") return <Badge variant="outline">Descartado</Badge>
  if (r.status === "aprobado" && r.web.url)
    return (
      <Badge className="bg-emerald-600 text-white">
        <CheckIcon className="size-3" />
        En la web
      </Badge>
    )
  if (r.status === "aprobado") return <Badge variant="secondary">Aprobado, enviando</Badge>
  return <Badge variant="outline">Por revisar</Badge>
}

function RotuloChip({ rotulo }: { rotulo: Rotulo | null }) {
  if (!rotulo) return <Badge variant="outline" className="border-red-400 px-1.5 py-0 text-[10px] font-normal text-red-700">sin rótulo</Badge>
  return (
    <Badge variant="outline" className={`px-1.5 py-0 text-[10px] font-normal ${CLASE_ROTULO[rotulo]}`}>
      {NOMBRE_ROTULO[rotulo]}
    </Badge>
  )
}

const citas = (fuentes: string[]) => (fuentes.length ? <span className="text-muted-foreground font-mono text-[10px]"> [{fuentes.join(", ")}]</span> : null)

function ItemVista({ item }: { item: Item }) {
  return (
    <>
      <RotuloChip rotulo={item.rotulo} /> {item.texto}
      {citas(item.fuentes)}
    </>
  )
}

function BloqueVista({ bloque: b }: { bloque: Bloque }) {
  switch (b.tipo) {
    case "parrafo":
      return (
        <p className="leading-relaxed">
          <ItemVista item={b} />
        </p>
      )
    case "lista":
      return (
        <ul className="list-disc space-y-1 pl-5">
          {b.items.map((i, k) => (
            <li key={k}>
              <ItemVista item={i} />
            </li>
          ))}
        </ul>
      )
    case "checklist":
      return (
        <ul className="space-y-1">
          {b.items.map((i, k) => (
            <li key={k} className="flex gap-2">
              <span aria-hidden className="mt-1 inline-block size-3 shrink-0 rounded-sm border" />
              <span>
                {i.texto}
                {citas(i.fuentes)}
              </span>
            </li>
          ))}
        </ul>
      )
    case "tabla":
      return (
        <div className="flex flex-col gap-1">
          {b.titulo ? <p className="text-xs font-medium">{b.titulo}</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {b.columnas.map((c, k) => (
                    <th key={k} className="bg-muted border px-2 py-1 text-left font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.filas.map((f, k) => (
                  <tr key={k}>
                    {f.map((c, m) => (
                      <td key={m} className="border px-2 py-1 align-top">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs">
            <RotuloChip rotulo={b.rotulo} />
            {citas(b.fuentes)}
          </p>
        </div>
      )
    case "plantilla":
      return (
        <div className="flex flex-col gap-1">
          {b.titulo ? <p className="text-xs font-medium">{b.titulo}</p> : null}
          <pre className="bg-muted overflow-x-auto whitespace-pre-wrap rounded-md p-3 font-mono text-xs">{b.contenido}</pre>
        </div>
      )
  }
}

function RevisionRecurso({ revision }: { revision: NonNullable<RecursoDeLaFicha["revision"]> }) {
  const frenos = revision.hallazgos.filter((h) => h.nivel === "frena")
  const avisos = revision.hallazgos.filter((h) => h.nivel === "aviso")
  const nombre = new Map<string, string>(CRITERIOS_RECURSO.map((c) => [c.clave, c.nombre]))
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {revision.veredicto ? (
          <Badge variant={revision.veredicto === "publicar" ? "secondary" : "outline"}>{VEREDICTOS[revision.veredicto]}</Badge>
        ) : null}
        {revision.claude?.estado === "fallo" ? <span className="text-amber-700 dark:text-amber-400">El revisor con Claude no pudo leerlo.</span> : null}
        {revision.correcciones.length ? (
          <span className="text-muted-foreground">
            {revision.correcciones.length === 1 ? "1 vuelta de corrección" : `${revision.correcciones.length} vueltas de corrección`}
          </span>
        ) : null}
      </div>
      {revision.notas.length ? (
        <ul className="grid gap-1 sm:grid-cols-2">
          {revision.notas.map((n) => (
            <li key={n.criterio}>
              <span className="font-medium tabular-nums">{n.nota}/5</span> {nombre.get(n.criterio) ?? n.criterio}
              <span className="text-muted-foreground"> · {n.por_que}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {frenos.length ? <Hallazgos titulo="Frena" clase="text-red-700 dark:text-red-400" hallazgos={frenos} /> : null}
      {avisos.length ? <Hallazgos titulo="Avisos" clase="text-amber-700 dark:text-amber-400" hallazgos={avisos} /> : null}
      {!frenos.length && !avisos.length ? <p className="text-emerald-700 dark:text-emerald-400">Sin hallazgos.</p> : null}
    </div>
  )
}

function Hallazgos({ titulo, clase, hallazgos }: { titulo: string; clase: string; hallazgos: Hallazgo[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className={`font-medium ${clase}`}>{titulo}</p>
      <ul className="flex flex-col gap-1.5">
        {hallazgos.map((h, i) => (
          <li key={i} className="leading-relaxed">
            <span className="font-medium">{h.donde}:</span> {h.detalle} <span className="text-muted-foreground">Qué hacer: {h.pide}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Dm({ recurso: r }: { recurso: RecursoDeLaFicha }) {
  const dm = r.dm
  if (!dm) return null
  const filas: { titulo: string; texto: string; nota?: string }[] = [
    { titulo: "Lo que promete el cierre", texto: r.payload.promesa },
    { titulo: "DM, mensaje 1 (respuesta al comentario)", texto: dm.mensaje1 },
    { titulo: "Botón", texto: dm.boton },
    {
      titulo: "DM, mensaje 2 (tras el botón)",
      texto: r.mensaje2 ?? dm.mensaje2,
      nota: r.mensaje2 ? undefined : "{enlace} se cambia por la dirección del recurso cuando el portal la devuelva.",
    },
    { titulo: "Cierre (cuando la palabra ya venció)", texto: dm.cierre },
  ]
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-xs font-medium">Mensajes del DM</p>
      {filas.map((f) => (
        <TextoCopiable key={f.titulo} {...f} />
      ))}
    </div>
  )
}

function TextoCopiable({ titulo, texto, nota }: { titulo: string; texto: string; nota?: string }) {
  const [copiado, setCopiado] = React.useState(false)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{titulo}</span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Copiar: ${titulo}`}
          onClick={() => {
            void navigator.clipboard.writeText(texto).then(() => {
              setCopiado(true)
              setTimeout(() => setCopiado(false), 1500)
            })
          }}
        >
          {copiado ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm">{texto}</p>
      {nota ? <p className="text-muted-foreground text-xs">{nota}</p> : null}
    </div>
  )
}
