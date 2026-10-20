"use client"

import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, PaperclipIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { borrarSkillMarca, guardarSkillMarca, moverSkillMarca } from "@/app/configuracion/marca/skills-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { AGENTES_CON_MARCA, type AgenteConMarca } from "@/engine/marca/bloque"
import { NOMBRE_OBJETIVO, OBJETIVOS } from "@/engine/marca/clasificacion"
import {
  describirCuando,
  esSiempre,
  FORMATOS_ANGULO,
  NOMBRE_FORMATO,
  NOMBRE_SENAL,
  NOMBRE_TIPO_CTA,
  SENALES,
  SIEMPRE,
  type Cuando,
} from "@/engine/marca/cuando"
import { TIPOS_CTA } from "@/engine/marca/editorial-modelo"
import { NOMBRE_AGENTE, TOPES_SKILL, type CamposSkill, type Skill } from "@/engine/marca/skills-modelo"

import { CampoTexto, useFormulario } from "./campos"

const VACIA: CamposSkill = { nombre: "", descripcion: "", texto: "", original: "", agentes: [], cuando: SIEMPRE, activo: true }

type Pilar = { id: string; name: string }

/** El `name:` y el `description:` de la cabecera de un SKILL.md, si la tiene. */
function cabeceraDe(texto: string): { name?: string; description?: string } {
  const bloque = /^---\n([\s\S]*?)\n---/.exec(texto)?.[1]
  if (!bloque) return {}
  const campo = (clave: string) =>
    new RegExp(`^${clave}:\\s*(.+)$`, "m").exec(bloque)?.[1]?.trim().replace(/^["']|["']$/g, "") || undefined
  return { name: campo("name"), description: campo("description") }
}

/**
 * Las skills de la marca: como hace esta marca cosas concretas, y a que
 * agentes se lo dice.
 *
 * Cada skill se abre para editarla; cerrada enseña lo justo para ver de un
 * vistazo que tiene cada agente. El orden importa: es el orden en que entran
 * en el prompt.
 */
export function PestanaSkills({ skills, pilares }: { skills: Skill[]; pilares: Pilar[] }) {
  const nombrePilar = (id: string) => pilares.find((p) => p.id === id)?.name ?? "(pilar borrado)"
  const [abierta, setAbierta] = React.useState<string | null>(null)
  const [nueva, setNueva] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const correr = (accion: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const r = await accion()
      if (!r.ok) setError(r.error ?? "No se pudo.")
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">Skills de la marca</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Instrucciones propias de tu marca para tareas concretas: cómo escribe sus captions, cómo arma sus CTA, cómo
          cuenta una cifra. Cada una entra en el prompt de los agentes que marques, después de tu marca. Lo que entra
          es el texto operativo; el original se guarda para volver a él.
        </p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {skills.length === 0 && !nueva ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          Todavía no hay skills. Los agentes trabajan con su oficio y tu marca.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {skills.map((s, i) => (
          <Card key={s.id}>
            <CardContent className="flex flex-col gap-3 py-3">
              <div className="flex items-start gap-3">
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending || i === 0}
                    onClick={() => correr(() => moverSkillMarca(s.id, "arriba"))}
                    aria-label="Subir"
                  >
                    <ArrowUpIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending || i === skills.length - 1}
                    onClick={() => correr(() => moverSkillMarca(s.id, "abajo"))}
                    aria-label="Bajar"
                  >
                    <ArrowDownIcon className="size-4" />
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setAbierta(abierta === s.id ? null : s.id)}
                  aria-expanded={abierta === s.id}
                  className="flex min-w-0 flex-1 flex-col items-start gap-1.5 text-left"
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="truncate text-sm font-medium">{s.nombre}</span>
                    {!s.activo ? <Badge variant="outline">Inactiva</Badge> : null}
                    <ChevronDownIcon
                      className={`text-muted-foreground ml-auto size-4 shrink-0 transition-transform ${abierta === s.id ? "rotate-180" : ""}`}
                    />
                  </span>
                  {s.descripcion ? <span className="text-muted-foreground text-xs">{s.descripcion}</span> : null}
                  <span className="flex flex-wrap gap-1">
                    {s.agentes.length === 0 ? (
                      <Badge variant="outline" className="font-normal text-amber-600">
                        Sin agentes: no entra en ningún prompt
                      </Badge>
                    ) : (
                      s.agentes.map((a) => (
                        <Badge key={a} variant="secondary" className="font-normal">
                          {NOMBRE_AGENTE[a]}
                        </Badge>
                      ))
                    )}
                    {!esSiempre(s.cuando) ? (
                      <Badge variant="outline" className="font-normal">
                        Solo con: {describirCuando(s.cuando, nombrePilar)}
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground self-center text-xs tabular-nums">
                      · {s.texto.length} caracteres en el prompt
                    </span>
                  </span>
                </button>
              </div>
              {abierta === s.id ? (
                <EditorSkill
                  inicial={s}
                  pilares={pilares}
                  guardar={(campos) => guardarSkillMarca(s.id, campos)}
                  onBorrar={() => {
                    if (!window.confirm(`¿Borrar la skill "${s.nombre}"? Se pierden su texto y su original.`)) return
                    correr(() => borrarSkillMarca(s.id))
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {nueva ? (
        <Card className="border-dashed">
          <CardContent className="py-3">
            <EditorSkill
              inicial={VACIA}
              pilares={pilares}
              guardar={async (campos) => {
                const r = await guardarSkillMarca(null, campos)
                if (r.ok) setNueva(false)
                return r
              }}
              onCancelar={() => setNueva(false)}
            />
          </CardContent>
        </Card>
      ) : (
        <div>
          <Button variant="outline" onClick={() => setNueva(true)} disabled={pending}>
            <PlusIcon />
            Nueva skill
          </Button>
        </div>
      )}
    </div>
  )
}

function EditorSkill({
  inicial,
  pilares,
  guardar,
  onBorrar,
  onCancelar,
}: {
  inicial: CamposSkill
  pilares: Pilar[]
  guardar: (campos: CamposSkill) => Promise<{ ok: true } | { ok: false; error: string }>
  onBorrar?: () => void
  onCancelar?: () => void
}) {
  const f = useFormulario<CamposSkill>(
    {
      nombre: inicial.nombre,
      descripcion: inicial.descripcion,
      texto: inicial.texto,
      original: inicial.original,
      agentes: inicial.agentes,
      cuando: inicial.cuando,
      activo: inicial.activo,
    },
    guardar
  )
  const v = f.valores
  const base = React.useId()
  const id = (campo: string) => `${base}-${campo}`

  const alternar = (a: AgenteConMarca) =>
    f.set("agentes", v.agentes.includes(a) ? v.agentes.filter((x) => x !== a) : [...v.agentes, a])

  const originalLargo = v.original.length > TOPES_SKILL.texto

  const archivoRef = React.useRef<HTMLInputElement>(null)
  const [avisoArchivo, setAvisoArchivo] = React.useState<{ ok: boolean; texto: string } | null>(null)

  /**
   * Lee los archivos en el navegador y deja su texto en el original: no se
   * suben a ningun sitio. Cada archivo entra con una cabecera que dice cual
   * es, con el nombre de su skill si lo trae: varios SKILL.md se llaman igual,
   * y sin ella no se sabria donde acaba uno y empieza el siguiente.
   */
  const adjuntar = async (lista: FileList | null) => {
    const archivos = [...(lista ?? [])]
    if (archivos.length === 0) return
    const otros = archivos.filter((a) => !/\.(md|markdown|txt)$/i.test(a.name))
    if (otros.length > 0) {
      setAvisoArchivo({
        ok: false,
        texto: `Solo archivos de texto (.md o .txt). No se cargó: ${otros.map((a) => a.name).join(", ")}.`,
      })
      return
    }

    const leidos = await Promise.all(
      archivos.map(async (a) => ({ nombre: a.name, texto: (await a.text()).replace(/\r\n/g, "\n").trim() }))
    )
    const titulo = (l: { nombre: string; texto: string }) => {
      const skill = cabeceraDe(l.texto).name
      return skill ? `${skill} (${l.nombre})` : l.nombre
    }
    const nuevo = [v.original.trim(), ...leidos.map((l) => `===== ${titulo(l)} =====\n${l.texto}`)]
      .filter(Boolean)
      .join("\n\n")
    if (nuevo.length > TOPES_SKILL.original) {
      setAvisoArchivo({ ok: false, texto: `No cabe: el original quedaría en ${nuevo.length} caracteres y el tope es ${TOPES_SKILL.original}.` })
      return
    }
    f.set("original", nuevo)

    // La cabecera de un SKILL.md trae nombre y descripcion: si la skill aun no
    // los tiene, se toman de ahi. Nunca se pisa lo que ya escribiste.
    const cabecera = cabeceraDe(leidos[0].texto)
    if (!v.nombre.trim() && cabecera.name) f.set("nombre", cabecera.name.slice(0, TOPES_SKILL.nombre))
    if (!v.descripcion.trim() && cabecera.description) {
      f.set("descripcion", cabecera.description.slice(0, TOPES_SKILL.descripcion))
    }
    setAvisoArchivo({ ok: true, texto: `Cargado: ${leidos.map((l) => l.nombre).join(", ")}. Falta guardar la skill.` })
  }

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <CampoTexto
        id={id("nombre")}
        label="Nombre"
        placeholder="Captions de Instagram"
        valor={v.nombre}
        tope={TOPES_SKILL.nombre}
        filas={1}
        onChange={(x) => f.set("nombre", x)}
      />
      <CampoTexto
        id={id("descripcion")}
        label="Para qué sirve"
        ayuda="Una línea para reconocerla en la lista. No entra al prompt."
        valor={v.descripcion}
        tope={TOPES_SKILL.descripcion}
        filas={2}
        onChange={(x) => f.set("descripcion", x)}
      />

      <div className="grid gap-1.5">
        <Label>Agentes que la reciben</Label>
        <div className="flex flex-wrap gap-1.5">
          {AGENTES_CON_MARCA.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => alternar(a)}
              aria-pressed={v.agentes.includes(a)}
              className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                v.agentes.includes(a) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent border-input"
              }`}
            >
              {NOMBRE_AGENTE[a]}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Cada agente recibe solo lo que le toca: una skill de captions no le sirve al análisis y encarece cada llamada.
        </p>
      </div>

      <CuandoEntra cuando={v.cuando} pilares={pilares} onChange={(c) => f.set("cuando", c)} />

      <div className="flex items-center gap-2">
        <Switch id={id("activo")} checked={v.activo} onCheckedChange={(x) => f.set("activo", Boolean(x))} />
        <Label htmlFor={id("activo")} className="text-sm font-normal">
          Activa
        </Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor={id("texto")}>Texto operativo</Label>
            <span
              className={`text-xs tabular-nums ${v.texto.length > TOPES_SKILL.texto * 0.9 ? "text-amber-600" : "text-muted-foreground"}`}
            >
              {v.texto.length} / {TOPES_SKILL.texto}
            </span>
          </div>
          <Textarea
            id={id("texto")}
            rows={16}
            maxLength={TOPES_SKILL.texto}
            value={v.texto}
            placeholder="Las reglas y ejemplos que el agente tiene que seguir. Sin pasos para personas ni rutas de archivos."
            onChange={(e) => f.set("texto", e.target.value)}
            className="font-mono text-xs leading-relaxed"
          />
          <p className="text-muted-foreground text-xs">Es lo que entra al prompt.</p>
        </div>
        <div className="grid content-start gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor={id("original")}>Original</Label>
            <span className="text-muted-foreground text-xs tabular-nums">{v.original.length} caracteres</span>
          </div>
          <Textarea
            id={id("original")}
            rows={16}
            maxLength={TOPES_SKILL.original}
            value={v.original}
            placeholder="El documento tal cual (opcional). Pégalo, adjúntalo con el clip o arrastra aquí el archivo."
            onChange={(e) => f.set("original", e.target.value)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (e.dataTransfer.files.length === 0) return
              e.preventDefault()
              void adjuntar(e.dataTransfer.files)
            }}
            className="font-mono text-xs leading-relaxed"
          />
          <input
            ref={archivoRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            multiple
            hidden
            onChange={(e) => {
              void adjuntar(e.target.files)
              // Para poder volver a elegir el mismo archivo.
              e.target.value = ""
            }}
          />
          {avisoArchivo ? (
            <p className={`text-xs ${avisoArchivo.ok ? "text-muted-foreground" : "text-destructive"}`}>{avisoArchivo.texto}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => archivoRef.current?.click()}>
              <PaperclipIcon />
              Adjuntar archivo
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!v.original.trim() || v.texto === v.original.slice(0, TOPES_SKILL.texto)}
              onClick={() => f.set("texto", v.original.slice(0, TOPES_SKILL.texto))}
            >
              Usar el original
            </Button>
            {originalLargo ? (
              <span className="text-muted-foreground text-xs">
                El original cabe entero. Solo «Usar el original» se quedaría con los primeros {TOPES_SKILL.texto} caracteres:
                al prompt va el texto operativo, con las reglas.
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button onClick={f.onGuardar} disabled={f.pending || !f.dirty || !v.nombre.trim()}>
          {f.pending ? "Guardando…" : "Guardar skill"}
        </Button>
        {onCancelar ? (
          <Button variant="ghost" onClick={onCancelar} disabled={f.pending}>
            Cancelar
          </Button>
        ) : null}
        {f.resultado?.ok && !f.dirty ? <span className="text-sm text-emerald-600">Guardada.</span> : null}
        {f.resultado && !f.resultado.ok ? <span className="text-destructive text-sm">{f.resultado.error}</span> : null}
        {onBorrar ? (
          <Button
            variant="ghost"
            onClick={onBorrar}
            disabled={f.pending}
            className="text-muted-foreground hover:text-destructive ml-auto"
          >
            <Trash2Icon />
            Borrar
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Un grupo de opciones que se marcan y desmarcan, como los agentes. */
function Opciones<T extends string>({
  titulo,
  opciones,
  marcadas,
  onChange,
}: {
  titulo: string
  opciones: { valor: T; nombre: string }[]
  marcadas: T[]
  onChange: (v: T[]) => void
}) {
  if (opciones.length === 0) return null
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{titulo}</span>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((o) => {
          const activa = marcadas.includes(o.valor)
          return (
            <button
              key={o.valor}
              type="button"
              onClick={() => onChange(activa ? marcadas.filter((x) => x !== o.valor) : [...marcadas, o.valor])}
              aria-pressed={activa}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                activa ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent border-input"
              }`}
            >
              {o.nombre}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Con que piezas entra la skill. Sin nada marcado entra siempre, que es lo que
 * hacen todas hasta que se elija otra cosa.
 */
function CuandoEntra({
  cuando,
  pilares,
  onChange,
}: {
  cuando: Cuando
  pilares: Pilar[]
  onChange: (c: Cuando) => void
}) {
  const set = <K extends keyof Cuando>(clave: K, valor: Cuando[K]) => onChange({ ...cuando, [clave]: valor })
  const nombrePilar = (id: string) => pilares.find((p) => p.id === id)?.name ?? "(pilar borrado)"
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>Cuándo entra</Label>
        <span className="text-muted-foreground text-xs">
          {esSiempre(cuando) ? "Siempre" : `Solo con: ${describirCuando(cuando, nombrePilar)}`}
        </span>
      </div>
      <div className="grid gap-3 rounded-md border p-3">
        <Opciones
          titulo="Pilar"
          opciones={pilares.map((p) => ({ valor: p.id, nombre: p.name }))}
          marcadas={cuando.pilares}
          onChange={(v) => set("pilares", v)}
        />
        <Opciones
          titulo="Objetivo"
          opciones={OBJETIVOS.map((o) => ({ valor: o, nombre: NOMBRE_OBJETIVO[o] }))}
          marcadas={cuando.objetivos}
          onChange={(v) => set("objetivos", v)}
        />
        <Opciones
          titulo="Tipo de CTA"
          opciones={TIPOS_CTA.map((t) => ({ valor: t, nombre: NOMBRE_TIPO_CTA[t] }))}
          marcadas={cuando.cta_tipos}
          onChange={(v) => set("cta_tipos", v)}
        />
        <Opciones
          titulo="Formato del ángulo"
          opciones={FORMATOS_ANGULO.map((f) => ({ valor: f, nombre: NOMBRE_FORMATO[f] }))}
          marcadas={cuando.formatos as (typeof FORMATOS_ANGULO)[number][]}
          onChange={(v) => set("formatos", v)}
        />
        <Opciones
          titulo="Señales de la noticia"
          opciones={SENALES.map((x) => ({ valor: x, nombre: NOMBRE_SENAL[x] }))}
          marcadas={cuando.senales}
          onChange={(v) => set("senales", v)}
        />
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Sin nada marcado, entra siempre. Entre grupos se tienen que cumplir todos; dentro de un grupo basta uno. Las
        condiciones se miran en Instagram y LinkedIn, que escriben con la pieza ya clasificada; en los demás agentes una
        skill con condiciones no entra.
      </p>
    </div>
  )
}
