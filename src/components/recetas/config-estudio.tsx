"use client"

import * as React from "react"

import Link from "next/link"

import { guardarPromptsEstudio } from "@/app/recetas/actions"
import { PromptFinal } from "@/components/agentes/prompt-final"
import type { ConfigEstudio as Config } from "@/lib/recetas-data"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * La configuracion de las dos agentes del pipeline nuevo, y el estado de Canva.
 *
 * Los prompts son de la cuenta: vacio vuelve al que trae el codigo, que se
 * muestra como punto de partida. Canva no se configura aqui: se conecta
 * iniciando sesion desde Conexiones, y aqui solo se ve si esta listo.
 */
export function ConfigEstudio({ config }: { config: Config }) {
  const [ideas, setIdeas] = React.useState(config.ideasPrompt ?? "")
  const [contenido, setContenido] = React.useState(config.contentPrompt ?? "")
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null)
  const [pending, startTransition] = React.useTransition()

  const guardarPrompts = () => {
    setAviso(null)
    startTransition(async () => {
      const r = await guardarPromptsEstudio({ ideas_prompt: ideas, content_prompt: contenido })
      setAviso(r.ok ? { ok: true, texto: "Prompts guardados." } : { ok: false, texto: r.error })
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {aviso ? (
        <p className={`text-sm ${aviso.ok ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agente de ideas</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Convierte las capas de cada pilar en cartuchos. Se rellena solo cuando a un pilar le
            quedan menos de siete dias de cartuchos segun lo que consumen sus recetas.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="cfg-ideas">Oficio (vacío = el de serie)</Label>
          <Textarea
            id="cfg-ideas"
            rows={8}
            value={ideas}
            disabled={pending}
            placeholder={config.ideasPorDefecto}
            onChange={(e) => setIdeas(e.target.value)}
            className="font-mono text-xs"
          />
          <PromptFinal prompt={config.ideasFinal} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agente de contenido</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Toma un cartucho y lo desarrolla en una pieza para el canal y formato de la receta.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="cfg-contenido">Oficio (vacío = el de serie)</Label>
          <Textarea
            id="cfg-contenido"
            rows={8}
            value={contenido}
            disabled={pending}
            placeholder={config.contentPorDefecto}
            onChange={(e) => setContenido(e.target.value)}
            className="font-mono text-xs"
          />
          <PromptFinal prompt={config.contentFinal} />
          <div>
            <Button onClick={guardarPrompts} disabled={pending}>
              Guardar prompts
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Subgenerador Canva</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Dibuja las piezas en Canva con tus estilos gráficos. Se conecta iniciando
            sesion, una sola vez, y sirve a todas las cuentas.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className={`text-sm ${config.canvaConectado ? "text-emerald-600" : "text-muted-foreground"}`}>
            {config.canvaConectado ? "Conectado." : "Sin conectar."}
          </span>
          <Button variant="outline" render={<Link href="/configuracion/conexiones" />}>
            {config.canvaConectado ? "Ver en Conexiones" : "Conectar en Conexiones"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
