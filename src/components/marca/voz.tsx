"use client"

import { guardarVoz } from "@/app/configuracion/marca/actions"
import { LONGITUDES, TONOS } from "@/engine/content/variables"
import { TOPES_PERFIL, type PerfilMarca } from "@/engine/marca/perfil-modelo"

import { BarraGuardar, CampoTexto, Chips, Opciones, useFormulario } from "./campos"

type Campos = Pick<PerfilMarca, "voz_si" | "voz_no" | "reglas" | "frases_prohibidas" | "temas_vetados"> & {
  tono: string
  longitud: string
}

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

      <BarraGuardar texto="Guardar voz" {...f} />
    </div>
  )
}
