"use client"

import * as React from "react"

import { guardarAjustesVideo } from "@/app/videos/actions"
import { PromptFinal } from "@/components/agentes/prompt-final"
import type { AjustesVideo } from "@/engine/videos/ajustes"
import type { OpcionesVideo } from "@/lib/videos-data"
import { MODELOS_DISPONIBLES } from "@/lib/modelos-ia"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

const HORAS = Array.from({ length: 18 }, (_, i) => i + 5)
const TODAS = "__todas__"

/**
 * La configuracion de Video studio: cuando se generan los guiones, de que
 * ideas, con que personaje, donde se publica, con que modelo y con que prompt.
 */
export function ConfigVideos({ ajustes, opciones }: { ajustes: AjustesVideo; opciones: OpcionesVideo }) {
  const [modo, setModo] = React.useState(ajustes.modo)
  const [horas, setHoras] = React.useState<Set<number>>(new Set(ajustes.horas))
  const [pillarId, setPillarId] = React.useState(ajustes.pillarId ?? TODAS)
  const [intentId, setIntentId] = React.useState(ajustes.intentId ?? TODAS)
  const [narrativeId, setNarrativeId] = React.useState(ajustes.narrativeId ?? TODAS)
  const [tag, setTag] = React.useState(ajustes.personajeTag)
  const [nombre, setNombre] = React.useState(ajustes.personajeNombre)
  const [publicar, setPublicar] = React.useState(ajustes.publicarActivo)
  const [redes, setRedes] = React.useState<string[]>(ajustes.redes)
  const [model, setModel] = React.useState(ajustes.model)
  const [prompt, setPrompt] = React.useState(ajustes.prompt ?? "")
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)
  const [pending, startTransition] = React.useTransition()

  // Las narrativas que se ofrecen: las que desbloquea la intencion elegida, o
  // todas si no hay intencion.
  const intencion = opciones.intenciones.find((i) => i.id === intentId)
  const narrativas = intencion ? opciones.narrativas.filter((n) => intencion.narrativas.includes(n.id)) : opciones.narrativas
  const narrativaValida = narrativeId === TODAS || narrativas.some((n) => n.id === narrativeId)

  const guardar = () => {
    setAviso(null)
    startTransition(async () => {
      const r = await guardarAjustesVideo({
        modo,
        horas: [...horas],
        pillarId: pillarId === TODAS ? null : pillarId,
        intentId: intentId === TODAS ? null : intentId,
        narrativeId: narrativeId === TODAS || !narrativaValida ? null : narrativeId,
        personajeTag: tag,
        personajeNombre: nombre,
        publicarActivo: publicar,
        redes,
        model,
        prompt,
      })
      setAviso(r.ok ? { ok: true, texto: r.aviso ?? "Guardado." } : { ok: false, texto: r.error })
    })
  }

  const nombreDe = (lista: { id: string; name: string }[], id: string, todas: string) =>
    id === TODAS ? todas : (lista.find((x) => x.id === id)?.name ?? todas)

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Generación de guiones</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            En manual, cada guion se pide con el botón «Generar guion». En automático, cada hora elegida es un video al
            día: el agente deja su guion listo con un día de antelación, y en cada tarjeta se ve a qué hora se publica y
            hasta cuándo hay para entregar el video (una hora antes).
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-1.5">
            {(["manual", "automatico"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={pending}
                onClick={() => setModo(m)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  modo === m ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-accent"
                }`}
              >
                {m === "manual" ? "Manual" : "Automático"}
              </button>
            ))}
          </div>
          {modo === "automatico" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Horas de publicación ({horas.size} {horas.size === 1 ? "video" : "videos"} al día)</Label>
              <div className="flex flex-wrap gap-1.5">
                {HORAS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      setHoras((prev) => {
                        const n = new Set(prev)
                        if (n.has(h)) n.delete(h)
                        else n.add(h)
                        return n
                      })
                    }
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                      horas.has(h) ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {String(h).padStart(2, "0")}:00
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">De qué ideas</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            El agente toma una idea disponible al azar entre las que cumplan estos filtros. Sin filtros, entre todas.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Pilar</Label>
            <Select value={pillarId} onValueChange={(v) => setPillarId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => nombreDe(opciones.pilares, pillarId, "Todos")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todos</SelectItem>
                {opciones.pilares.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Intención</Label>
            <Select value={intentId} onValueChange={(v) => setIntentId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => nombreDe(opciones.intenciones, intentId, "Cualquiera")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Cualquiera</SelectItem>
                {opciones.intenciones.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Narrativa</Label>
            <Select value={narrativaValida ? narrativeId : TODAS} onValueChange={(v) => setNarrativeId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => nombreDe(narrativas, narrativaValida ? narrativeId : TODAS, "Cualquiera")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Cualquiera{intencion ? " de esta intención" : ""}</SelectItem>
                {narrativas.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Personaje y publicación</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-tag">Tag del personaje en Flow</Label>
              <Input id="v-tag" value={tag} disabled={pending} placeholder="@juan" onChange={(e) => setTag(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-nombre">Nombre del personaje</Label>
              <Input id="v-nombre" value={nombre} disabled={pending} placeholder="Juan" onChange={(e) => setNombre(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <Switch checked={publicar} disabled={pending} onCheckedChange={setPublicar} aria-label="Publicar videos" />
              <span className="text-sm">{publicar ? "Publica los videos a su hora" : "Publicación apagada"}</span>
            </div>
            <div className="flex gap-1.5">
              {[
                { id: "instagram", nombre: "Instagram" },
                { id: "facebook", nombre: "Facebook" },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={pending}
                  onClick={() => setRedes((v) => (v.includes(r.id) ? v.filter((x) => x !== r.id) : [...v, r.id]))}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    redes.includes(r.id) ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {r.nombre}
                </button>
              ))}
            </div>
          </div>
          <p className="text-muted-foreground text-xs">Se publica como reel, con la descripción que escribió el agente.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agente de guiones</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">El modelo que escribe el guion y el prompt que define cómo se construye.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 sm:w-80">
            <Label>Modelo</Label>
            <Select value={model} onValueChange={(v) => setModel(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => MODELOS_DISPONIBLES.find((m) => m.id === model)?.nombre ?? model}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MODELOS_DISPONIBLES.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="v-prompt">Oficio del guion (vacío = el de serie)</Label>
              {!prompt ? (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPrompt(opciones.promptPorDefecto)}>
                  Partir del de serie
                </Button>
              ) : null}
            </div>
            <Textarea
              id="v-prompt"
              rows={16}
              value={prompt}
              disabled={pending}
              placeholder={opciones.promptPorDefecto}
              onChange={(e) => setPrompt(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <PromptFinal prompt={opciones.promptFinal} />
        </CardContent>
      </Card>

      {aviso ? <p className={`text-sm ${aviso.ok ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p> : null}
      <div>
        <Button onClick={guardar} disabled={pending}>
          Guardar configuración
        </Button>
      </div>
    </div>
  )
}
