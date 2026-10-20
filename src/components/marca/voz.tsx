"use client"

import { guardarVoz, type CamposVoz } from "@/app/configuracion/marca/actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LONGITUDES, TONOS } from "@/engine/content/variables"
import { RANGOS_REGLAS, TOPES_PERFIL, type PerfilMarca } from "@/engine/marca/perfil-modelo"

import { BarraGuardar, CampoTexto, Chips, Opciones, useFormulario } from "./campos"

type Campos = CamposVoz

/** Un minimo y un maximo, con sus limites a la vista. */
function Rango({
  id,
  label,
  ayuda,
  limites,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  ayuda: string
  limites: { min: number; max: number }
  min: number
  max: number
  onChange: (min: number, max: number) => void
}) {
  const numero = (v: string, actual: number) => {
    const n = Number(v)
    return v.trim() !== "" && Number.isInteger(n) ? n : actual
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}_min`}>{label}</Label>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">de</span>
        <Input
          id={`${id}_min`}
          type="number"
          min={limites.min}
          max={limites.max}
          className="w-20"
          value={min}
          onChange={(e) => onChange(numero(e.target.value, min), max)}
        />
        <span className="text-muted-foreground">a</span>
        <Input
          id={`${id}_max`}
          type="number"
          min={limites.min}
          max={limites.max}
          className="w-20"
          value={max}
          onChange={(e) => onChange(min, numero(e.target.value, max))}
        />
      </div>
      <p className="text-muted-foreground text-xs">{ayuda}</p>
    </div>
  )
}

const SI_NO = [
  { valor: "no", etiqueta: "No" },
  { valor: "si", etiqueta: "Sí" },
] as const

const NOMBRE_TONO: Record<string, string> = {
  profesional: "Profesional",
  cercano: "Cercano",
  provocador: "Provocador",
  tecnico: "Técnico",
}
const NOMBRE_LONGITUD: Record<string, string> = { corto: "Corto", medio: "Medio", largo: "Largo" }

export function PestanaVoz({ perfil, tono, longitud }: { perfil: PerfilMarca; tono: string; longitud: string }) {
  const f = useFormulario<Campos>(
    {
      voz_si: perfil.voz_si,
      voz_no: perfil.voz_no,
      reglas: perfil.reglas,
      frases_prohibidas: perfil.frases_prohibidas,
      temas_vetados: perfil.temas_vetados,
      hashtags_min: perfil.hashtags_min,
      hashtags_max: perfil.hashtags_max,
      laminas_min: perfil.laminas_min,
      laminas_max: perfil.laminas_max,
      emojis_instagram: perfil.emojis_instagram,
      emojis_linkedin: perfil.emojis_linkedin,
      tono,
      longitud,
    },
    guardarVoz
  )

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm">
        Cómo escribe la marca. Lo leen todos los agentes que redactan: posts, carruseles, ideas y guiones.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <Opciones
          label="Tono"
          valor={f.valores.tono}
          opciones={TONOS.map((t) => ({ valor: t, etiqueta: NOMBRE_TONO[t] ?? t }))}
          onChange={(v) => f.set("tono", v)}
        />
        <Opciones
          label="Longitud"
          valor={f.valores.longitud}
          opciones={LONGITUDES.map((l) => ({ valor: l, etiqueta: NOMBRE_LONGITUD[l] ?? l }))}
          onChange={(v) => f.set("longitud", v)}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <CampoTexto
          id="voz_si"
          label="Cómo suena"
          filas={5}
          tope={TOPES_PERFIL.voz_si}
          placeholder="Rasgos de la voz: directa, cercana, precisa, con humor seco…"
          valor={f.valores.voz_si}
          onChange={(v) => f.set("voz_si", v)}
        />
        <CampoTexto
          id="voz_no"
          label="Cómo no suena"
          filas={5}
          tope={TOPES_PERFIL.voz_no}
          placeholder="Lo que la marca nunca es: institucional, vendedora, motivacional…"
          valor={f.valores.voz_no}
          onChange={(v) => f.set("voz_no", v)}
        />
      </div>

      <CampoTexto
        id="reglas"
        label="Reglas de escritura"
        filas={5}
        tope={TOPES_PERFIL.reglas}
        placeholder={"Una por línea. Por ejemplo:\nTutea al lector.\nNada de emojis en LinkedIn.\nCada dato lleva su fuente."}
        valor={f.valores.reglas}
        onChange={(v) => f.set("reglas", v)}
      />

      <Chips
        id="frases"
        label="Frases prohibidas"
        placeholder="Escribe una y pulsa Enter"
        ayuda="Muletillas que la marca no quiere ver nunca en un texto suyo."
        tope={TOPES_PERFIL.frases}
        topeFrase={TOPES_PERFIL.frase}
        valores={f.valores.frases_prohibidas}
        onChange={(v) => f.set("frases_prohibidas", v)}
      />

      <CampoTexto
        id="temas_vetados"
        label="Temas vetados"
        filas={3}
        tope={TOPES_PERFIL.temas_vetados}
        placeholder="Lo que la marca no toca, aunque sea noticia."
        ayuda="El análisis descarta las noticias de estos temas antes de escribir nada."
        valor={f.valores.temas_vetados}
        onChange={(v) => f.set("temas_vetados", v)}
      />

      {/* Lo que el revisor comprueba en cada pieza. Los numeros entran tambien
          en el formato que se le pide al agente, asi que lo que se pide y lo
          que se mide son lo mismo. */}
      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="grid gap-1">
          <p className="text-sm font-medium">Reglas que se comprueban</p>
          <p className="text-muted-foreground text-xs">
            El revisor automático las mira en cada pieza, sin IA, y lo que encuentra vuelve al agente para que lo
            corrija. Lo que frena (un guion largo, una frase prohibida, una cifra o un «miles de» que no están en
            la noticia, un emoji donde no van) no se publica solo hasta que lo apruebes. Las frases prohibidas de
            arriba también cuentan.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Rango
            id="hashtags"
            label="Hashtags en Instagram"
            ayuda="Si sobran, se quitan los últimos. 0 y 0 es sin hashtags."
            limites={RANGOS_REGLAS.hashtags}
            min={f.valores.hashtags_min}
            max={f.valores.hashtags_max}
            onChange={(min, max) => {
              f.set("hashtags_min", min)
              f.set("hashtags_max", max)
            }}
          />
          <Rango
            id="laminas"
            label="Láminas del carrusel, sin el cierre"
            ayuda={`Con el cierre del CTA, el carrusel llega a ${RANGOS_REGLAS.laminas.max + 1} como mucho.`}
            limites={RANGOS_REGLAS.laminas}
            min={f.valores.laminas_min}
            max={f.valores.laminas_max}
            onChange={(min, max) => {
              f.set("laminas_min", min)
              f.set("laminas_max", max)
            }}
          />
          <Opciones
            label="Emojis en Instagram"
            valor={f.valores.emojis_instagram ? "si" : "no"}
            opciones={[...SI_NO]}
            onChange={(v) => f.set("emojis_instagram", v === "si")}
          />
          <Opciones
            label="Emojis en LinkedIn"
            valor={f.valores.emojis_linkedin ? "si" : "no"}
            opciones={[...SI_NO]}
            onChange={(v) => f.set("emojis_linkedin", v === "si")}
          />
        </div>
      </div>

      <BarraGuardar texto="Guardar voz" {...f} />
    </div>
  )
}
