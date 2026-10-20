"use client"

import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { guardarVisual, type CamposVisual } from "@/app/configuracion/marca/actions"
import { LogoMarca } from "@/components/configuracion/logo-marca"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  coloresDePaleta,
  contraste,
  esHex,
  FUENTES,
  PALETAS,
  paletaDesdeColores,
  type ColoresMarca,
  type Estilo,
} from "@/engine/render/theme"

import { BarraGuardar, Opciones, useFormulario } from "./campos"

const NOMBRE_COLOR: Record<Exclude<keyof ColoresMarca, "degradado">, { nombre: string; pista: string }> = {
  tinta: { nombre: "Tinta", pista: "El oscuro: texto sobre claro, fondo de las láminas oscuras." },
  papel: { nombre: "Papel", pista: "El claro: fondo de las láminas claras, texto sobre oscuro." },
  superficie: { nombre: "Superficie", pista: "El fondo alterno claro, para tarjetas y láminas de apoyo." },
  acento: { nombre: "Acento", pista: "El color de la marca: resaltados, números grandes, detalles." },
  acentoTexto: { nombre: "Acento para texto", pista: "El acento en versión legible sobre papel." },
}

/**
 * Como se ve la marca. Los colores son de la marca; las paletas, solo un punto
 * de partida para no empezar en blanco.
 */
export function PestanaVisual({
  estilo,
  paleta,
  pexelsConfigurado,
}: {
  estilo: Estilo
  paleta: string
  pexelsConfigurado: boolean
}) {
  const inicial = React.useMemo<CamposVisual>(() => {
    const desdePaleta = coloresDePaleta(PALETAS[paleta] ?? PALETAS.negro)
    return {
      paleta: paleta in PALETAS ? paleta : "negro",
      colores: estilo.colores ?? desdePaleta.colores,
      fondo: estilo.colores ? estilo.fondoBase : desdePaleta.fondo,
      fuenteTitulos: estilo.fuente,
      fuenteTexto: estilo.fuenteTexto,
      marca: estilo.marca,
      mostrarPaginacion: estilo.mostrarPaginacion,
      usarFotos: estilo.usarFotos,
      fotosLiterales: estilo.fotosLiterales,
      cierre: { ...estilo.cierre },
    }
  }, [estilo, paleta])

  const f = useFormulario<CamposVisual>(inicial, guardarVisual)
  const v = f.valores
  const setColor = (clave: Exclude<keyof ColoresMarca, "degradado">, valor: string) =>
    f.set("colores", { ...v.colores, [clave]: valor })

  const coloresValidos = (["tinta", "papel", "superficie", "acento", "acentoTexto"] as const).every((c) =>
    esHex(v.colores[c])
  )
  const avisos = coloresValidos ? avisosDeContraste(v.colores, v.fondo) : []

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Cómo se ven las piezas. El carrusel clásico ya usa estos colores; la plantilla editorial los usará todos.
      </p>

      {/* ------------------------------------------------ punto de partida */}
      <div className="grid gap-1.5">
        <Label>Punto de partida</Label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PALETAS).map(([nombre, valores]) => (
            <button
              key={nombre}
              type="button"
              onClick={() => {
                const base = coloresDePaleta(valores)
                f.set("paleta", nombre)
                f.set("colores", { ...base.colores, degradado: v.colores.degradado })
                f.set("fondo", base.fondo)
              }}
              aria-pressed={v.paleta === nombre}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs capitalize transition-colors ${
                v.paleta === nombre ? "border-primary ring-primary ring-1" : "border-input"
              }`}
            >
              <span className="size-4 rounded-full border" style={{ background: valores.fondo }} />
              <span className="size-4 rounded-full" style={{ background: valores.acento }} />
              {nombre}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">Llena los colores de abajo; después los ajustas a tu marca.</p>
      </div>

      {/* ------------------------------------------------------- colores */}
      <div className="grid gap-3">
        <Label>Colores de la marca</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(NOMBRE_COLOR) as (keyof typeof NOMBRE_COLOR)[]).map((clave) => (
            <SelectorColor
              key={clave}
              id={`color-${clave}`}
              nombre={NOMBRE_COLOR[clave].nombre}
              pista={NOMBRE_COLOR[clave].pista}
              valor={v.colores[clave]}
              onChange={(c) => setColor(clave, c)}
            />
          ))}
        </div>

        <Degradado valores={v.colores.degradado} onChange={(d) => f.set("colores", { ...v.colores, degradado: d })} />

        <Opciones
          label="Fondo del carrusel clásico"
          valor={v.fondo}
          opciones={[
            { valor: "oscuro", etiqueta: "Oscuro (tinta)" },
            { valor: "claro", etiqueta: "Claro (papel)" },
          ]}
          onChange={(x) => f.set("fondo", x)}
        />

        <MuestraColores colores={v.colores} fondo={v.fondo} valida={coloresValidos} />

        {avisos.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ---------------------------------------------------- tipografia */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Opciones
          label="Fuente de títulos"
          valor={v.fuenteTitulos}
          opciones={Object.keys(FUENTES).map((n) => ({ valor: n, etiqueta: FUENTES[n as keyof typeof FUENTES].nombre }))}
          onChange={(x) => f.set("fuenteTitulos", x)}
        />
        <Opciones
          label="Fuente de texto"
          valor={v.fuenteTexto}
          opciones={Object.keys(FUENTES).map((n) => ({ valor: n, etiqueta: FUENTES[n as keyof typeof FUENTES].nombre }))}
          onChange={(x) => f.set("fuenteTexto", x)}
        />
      </div>
      <p className="text-muted-foreground -mt-3 text-xs">
        El carrusel clásico usa la de títulos para todo. Subir una fuente propia llegará más adelante.
      </p>

      {/* -------------------------------------------------------- logos */}
      <div className="grid gap-3 border-t pt-5">
        <Label>Logos</Label>
        <LogoMarca
          claro={estilo.logoClaro}
          oscuro={estilo.logoOscuro}
          perfil={estilo.perfil}
          fondoClaro={v.fondo === "claro"}
          estiloCierre={v.cierre.estilo}
        />
      </div>

      {/* ------------------------------------------------------ carrusel */}
      <div className="grid gap-4 border-t pt-5">
        <Label>Carrusel</Label>

        <div className="grid gap-1.5">
          <Label htmlFor="marca" className="text-xs font-normal">
            Rótulo de la esquina
          </Label>
          <Input
            id="marca"
            maxLength={40}
            placeholder="vacío = sin rótulo"
            value={v.marca}
            onChange={(e) => f.set("marca", e.target.value)}
          />
        </div>

        <Interruptor
          id="paginacion"
          label="Numerar las láminas"
          pista="El 1 / 5 y el desliza del pie."
          checked={v.mostrarPaginacion}
          onChange={(x) => f.set("mostrarPaginacion", x)}
        />
        <Interruptor
          id="usarFotos"
          label="Fotos de banco en las láminas"
          pista={
            pexelsConfigurado
              ? "Busca en Pexels por el tema concreto de la pieza."
              : "Falta PEXELS_API_KEY en el entorno: las láminas saldrán sin fotos de banco."
          }
          checked={v.usarFotos && pexelsConfigurado}
          disabled={!pexelsConfigurado}
          onChange={(x) => f.set("usarFotos", x)}
        />
        <Interruptor
          id="fotosLiterales"
          label="Fotos literales del tema"
          pista="Ilustra el asunto de frente en vez de buscar la imagen de alrededor. Útil cuando el tema tiene una foto obvia."
          checked={v.fotosLiterales && v.usarFotos && pexelsConfigurado}
          disabled={!pexelsConfigurado || !v.usarFotos}
          onChange={(x) => f.set("fotosLiterales", x)}
        />
      </div>

      {/* ------------------------------------------------------- cierre */}
      <div className="grid gap-3 border-t pt-5">
        <div>
          <Label>Lámina de cierre</Label>
          <p className="text-muted-foreground mt-1 text-xs">
            Cierra todos los carruseles. Su texto lo escribe el agente con el CTA de cada pieza; el de aquí es el
            respaldo, para cuando no hay CTA. El estilo Perfil solo se usa si el CTA pide seguir. El usuario de la
            marca sale de la pestaña Identidad.
          </p>
        </div>
        <Opciones
          label="Estilo"
          valor={v.cierre.estilo}
          opciones={[
            { valor: "marca", etiqueta: "Marca" },
            { valor: "perfil", etiqueta: "Perfil" },
          ]}
          onChange={(x) => f.set("cierre", { ...v.cierre, estilo: x })}
        />
        <Input
          maxLength={40}
          placeholder="Síguenos"
          value={v.cierre.titulo}
          onChange={(e) => f.set("cierre", { ...v.cierre, titulo: e.target.value })}
        />
        <Input
          maxLength={140}
          placeholder="para más contenido como este"
          value={v.cierre.texto}
          onChange={(e) => f.set("cierre", { ...v.cierre, texto: e.target.value })}
        />
      </div>

      <BarraGuardar texto="Guardar aspecto" {...f} dirty={f.dirty && coloresValidos} />
    </div>
  )
}

/** Lo que no se va a leer bien en un telefono. Avisa; no impide guardar. */
function avisosDeContraste(c: ColoresMarca, fondo: "claro" | "oscuro"): string[] {
  const p = paletaDesdeColores(c, fondo)
  const avisos: string[] = []
  const texto = contraste(p.texto, p.fondo)
  if (texto < 4.5) avisos.push(`El texto sobre el fondo tiene poco contraste (${texto.toFixed(1)}:1; lo mínimo es 4,5:1).`)
  const acentoPapel = contraste(c.acentoTexto, c.papel)
  if (acentoPapel < 3) {
    avisos.push(`El acento para texto sobre papel se lee mal (${acentoPapel.toFixed(1)}:1; lo mínimo es 3:1).`)
  }
  const acentoTinta = contraste(c.acento, c.tinta)
  if (acentoTinta < 3) avisos.push(`El acento sobre tinta se lee mal (${acentoTinta.toFixed(1)}:1; lo mínimo es 3:1).`)
  return avisos
}

function SelectorColor({
  id,
  nombre,
  pista,
  valor,
  onChange,
}: {
  id: string
  nombre: string
  pista: string
  valor: string
  onChange: (valor: string) => void
}) {
  const valido = esHex(valor)
  return (
    <div className="flex items-start gap-3">
      <input
        type="color"
        aria-label={nombre}
        value={valido ? valor : "#000000"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="border-input mt-5 size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
      />
      <div className="grid flex-1 gap-1">
        <Label htmlFor={id} className="text-xs">
          {nombre}
        </Label>
        <Input
          id={id}
          value={valor}
          maxLength={7}
          onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
          className={`font-mono text-xs ${valido ? "" : "border-destructive"}`}
        />
        <p className="text-muted-foreground text-xs">{pista}</p>
      </div>
    </div>
  )
}

function Degradado({ valores, onChange }: { valores: string[]; onChange: (valores: string[]) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">Degradado (opcional, hasta 5 colores)</Label>
      <div className="flex flex-wrap items-center gap-2">
        {valores.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <input
              type="color"
              aria-label={`Color ${i + 1} del degradado`}
              value={c}
              onChange={(e) => onChange(valores.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))}
              className="border-input size-8 cursor-pointer rounded-md border bg-transparent p-0.5"
            />
            <button
              type="button"
              aria-label={`Quitar color ${i + 1}`}
              onClick={() => onChange(valores.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-foreground rounded p-0.5"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        {valores.length < 5 ? (
          <button
            type="button"
            onClick={() => onChange([...valores, valores[valores.length - 1] ?? "#FF5B00"])}
            className="border-input hover:bg-accent flex size-8 items-center justify-center rounded-md border border-dashed"
            aria-label="Añadir color al degradado"
          >
            <PlusIcon className="size-4" />
          </button>
        ) : null}
        {valores.length >= 2 ? (
          <span
            className="h-8 w-32 rounded-md border"
            style={{ background: `linear-gradient(90deg, ${valores.join(", ")})` }}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Una lamina en miniatura con los colores, para ver la combinacion de un vistazo. */
function MuestraColores({ colores, fondo, valida }: { colores: ColoresMarca; fondo: "claro" | "oscuro"; valida: boolean }) {
  if (!valida) return null
  const p = paletaDesdeColores(colores, fondo)
  const resaltado = fondo === "claro" ? colores.acentoTexto : colores.acento
  return (
    <div className="flex flex-wrap gap-3">
      {[
        { bg: p.fondo, fg: p.texto, suave: p.textoSuave, acento: resaltado, etiqueta: "Lámina" },
        { bg: p.fondoAlterno, fg: p.texto, suave: p.textoSuave, acento: resaltado, etiqueta: "Alterna" },
      ].map((m) => (
        <div
          key={m.etiqueta}
          className="flex h-40 w-32 flex-col justify-between rounded-md border p-3"
          style={{ background: m.bg }}
        >
          <span className="text-[10px] tracking-wide uppercase" style={{ color: m.suave }}>
            {m.etiqueta}
          </span>
          <span className="text-sm leading-tight font-bold" style={{ color: m.fg }}>
            Un titular con <span style={{ color: m.acento }}>acento</span>
          </span>
          <span className="h-1.5 w-8 rounded-full" style={{ background: m.acento }} />
        </div>
      ))}
    </div>
  )
}

function Interruptor({
  id,
  label,
  pista,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  pista: string
  checked: boolean
  disabled?: boolean
  onChange: (valor: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <Label htmlFor={id} className="text-xs font-normal">
          {label}
        </Label>
        <p className="text-muted-foreground mt-0.5 text-xs">{pista}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={(x) => onChange(Boolean(x))} />
    </div>
  )
}
