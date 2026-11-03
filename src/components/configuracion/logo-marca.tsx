"use client"

import * as React from "react"

import {
  quitarLogoMarca,
  subirLogoMarca,
  type ActionResult,
  type VersionLogo,
} from "@/app/estudio/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * El logo que cierra los carruseles, en sus dos versiones.
 *
 * Son dos porque un logo no sirve sobre cualquier fondo: el claro va sobre las
 * paletas oscuras y el oscuro sobre la blanca. Guardar solo uno obligaria a
 * volver a subirlo cada vez que se cambia de paleta, y el fallo —un logo blanco
 * sobre fondo blanco— no se ve hasta tener el post delante.
 *
 * Se elige solo, por la paleta activa. Si falta la version que toca se usa la
 * otra: mal contraste se ve y se arregla; sin logo no hay nada que arreglar.
 */
export function LogoMarca({
  claro,
  oscuro,
  perfil,
  fondoClaro,
  estiloCierre,
}: {
  claro: string | null
  oscuro: string | null
  /** La captura del propio perfil, para el cierre de estilo perfil. */
  perfil: string | null
  /** La paleta activa tiene fondo claro, asi que manda el logo oscuro. */
  fondoClaro: boolean
  estiloCierre: "marca" | "perfil"
}) {
  const [result, setResult] = React.useState<ActionResult | null>(null)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Logo</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Aparece en la lamina de cierre de cada carrusel. PNG, JPG o WEBP, hasta 2 MB; un PNG con
          fondo transparente es lo que mejor queda sobre la foto. Con la paleta de ahora se usa el{" "}
          <strong>{fondoClaro ? "oscuro" : "claro"}</strong>.
        </p>
      </CardHeader>

      <CardContent className="grid gap-5 sm:grid-cols-2">
        <Ranura
          version="claro"
          titulo="Claro"
          pista="Para fondos oscuros. Es el que se usa con las paletas negro y carbon."
          url={claro}
          enUso={!fondoClaro}
          onResult={setResult}
        />
        <Ranura
          version="oscuro"
          titulo="Oscuro"
          pista="Para fondos claros. Es el que se usa con la paleta blanco."
          url={oscuro}
          enUso={fondoClaro}
          onResult={setResult}
        />

        <div className="sm:col-span-2 border-t pt-4">
          <Ranura
            version="perfil"
            titulo="Captura del perfil"
            pista="Tu perfil tal como se ve en Instagram, con su boton de seguir a la vista. Solo la usa el cierre de estilo perfil; el cursor se dibuja encima."
            url={perfil}
            enUso={estiloCierre === "perfil"}
            onResult={setResult}
            ancha
          />
        </div>

        <div className="sm:col-span-2">
          {result?.ok ? <span className="text-sm text-success">Guardado.</span> : null}
          {result && !result.ok ? (
            <span className="text-destructive text-sm">{result.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function Ranura({
  version,
  titulo,
  pista,
  url,
  enUso,
  onResult,
  ancha = false,
}: {
  version: VersionLogo
  titulo: string
  pista: string
  url: string | null
  enUso: boolean
  onResult: (r: ActionResult | null) => void
  /** La captura es apaisada: en un cuadro de 80px no se distingue nada. */
  ancha?: boolean
}) {
  const [pending, startTransition] = React.useTransition()
  const input = React.useRef<HTMLInputElement>(null)

  const subir = (archivo: File) => {
    const form = new FormData()
    form.set("logo", archivo)
    form.set("version", version)
    onResult(null)
    startTransition(async () => {
      const r = await subirLogoMarca(form)
      onResult(r)
      if (r.ok && input.current) input.current.value = ""
    })
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Label>{titulo}</Label>
        {enUso ? <span className="text-muted-foreground text-xs">en uso</span> : null}
      </div>
      <p className="text-muted-foreground text-xs">{pista}</p>

      {url ? (
        <div className="flex items-center gap-3">
          {/* Sobre el fondo donde va a ir de verdad: un logo blanco sobre blanco
              se veria vacio y pareceria que no se subio. */}
          <div
            className={`flex items-center justify-center rounded-md border p-2 ${
              ancha ? "h-28 w-56" : "size-20"
            }`}
            style={{ background: version === "claro" ? "#0A0A0A" : "#FFFFFF" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={titulo} className="max-h-full max-w-full object-contain" />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              onResult(null)
              startTransition(async () => onResult(await quitarLogoMarca(version)))
            }}
          >
            Quitar
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs italic">Sin subir.</p>
      )}

      <Input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={pending}
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          if (archivo) subir(archivo)
        }}
      />
      {pending ? <span className="text-muted-foreground text-xs">Subiendo…</span> : null}
    </div>
  )
}
