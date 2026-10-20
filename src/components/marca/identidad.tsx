"use client"

import { guardarIdentidad } from "@/app/configuracion/marca/actions"
import { Label } from "@/components/ui/label"
import { TOPES_PERFIL, type PerfilMarca } from "@/engine/marca/perfil-modelo"

import { BarraGuardar, CampoTexto, Opciones, useFormulario } from "./campos"

/** Los paises que se ofrecen. "Sin pais" para una marca que no escribe para uno. */
const PAISES: { codigo: string; nombre: string }[] = [
  { codigo: "AR", nombre: "Argentina" },
  { codigo: "BO", nombre: "Bolivia" },
  { codigo: "BR", nombre: "Brasil" },
  { codigo: "CL", nombre: "Chile" },
  { codigo: "CO", nombre: "Colombia" },
  { codigo: "CR", nombre: "Costa Rica" },
  { codigo: "EC", nombre: "Ecuador" },
  { codigo: "SV", nombre: "El Salvador" },
  { codigo: "ES", nombre: "España" },
  { codigo: "US", nombre: "Estados Unidos" },
  { codigo: "GT", nombre: "Guatemala" },
  { codigo: "HN", nombre: "Honduras" },
  { codigo: "MX", nombre: "México" },
  { codigo: "NI", nombre: "Nicaragua" },
  { codigo: "PA", nombre: "Panamá" },
  { codigo: "PY", nombre: "Paraguay" },
  { codigo: "PE", nombre: "Perú" },
  { codigo: "DO", nombre: "República Dominicana" },
  { codigo: "UY", nombre: "Uruguay" },
  { codigo: "VE", nombre: "Venezuela" },
]

type Campos = Pick<PerfilMarca, "nombre" | "handle" | "que_hace" | "mensaje_central" | "idioma" | "pais">

export function PestanaIdentidad({ perfil }: { perfil: PerfilMarca }) {
  const f = useFormulario<Campos>(
    {
      nombre: perfil.nombre,
      handle: perfil.handle,
      que_hace: perfil.que_hace,
      mensaje_central: perfil.mensaje_central,
      idioma: perfil.idioma,
      pais: perfil.pais,
    },
    guardarIdentidad
  )

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm">
        Quién es la marca. Los agentes lo leen antes de escribir cualquier pieza.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <CampoTexto
          id="nombre"
          label="Nombre de la marca"
          filas={1}
          tope={TOPES_PERFIL.nombre}
          valor={f.valores.nombre}
          onChange={(v) => f.set("nombre", v)}
        />
        <CampoTexto
          id="handle"
          label="Usuario en redes"
          filas={1}
          prefijo="@"
          tope={TOPES_PERFIL.handle}
          placeholder="tumarca"
          ayuda="Letras, números, punto y guion bajo. Sale en el cierre del carrusel."
          valor={f.valores.handle}
          onChange={(v) => f.set("handle", v.replace(/^@+/, ""))}
        />
      </div>

      <CampoTexto
        id="que_hace"
        label="Qué hace la marca"
        tope={TOPES_PERFIL.que_hace}
        placeholder="En dos o tres frases: qué ofrece, a quién y cómo."
        valor={f.valores.que_hace}
        onChange={(v) => f.set("que_hace", v)}
      />

      <CampoTexto
        id="mensaje_central"
        label="Mensaje central"
        filas={2}
        tope={TOPES_PERFIL.mensaje_central}
        placeholder="La idea que atraviesa todo lo que publica."
        ayuda="Una tesis, no un eslogan: algo que la marca defiende y que se puede discutir."
        valor={f.valores.mensaje_central}
        onChange={(v) => f.set("mensaje_central", v)}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Opciones
          label="Idioma"
          valor={f.valores.idioma}
          opciones={[
            { valor: "es", etiqueta: "Español" },
            { valor: "en", etiqueta: "English" },
          ]}
          onChange={(v) => f.set("idioma", v)}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="pais">País</Label>
          <select
            id="pais"
            value={f.valores.pais ?? ""}
            onChange={(e) => f.set("pais", e.target.value || null)}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="">Sin país</option>
            {PAISES.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">Para la ortografía, los números y la moneda.</p>
        </div>
      </div>

      <BarraGuardar texto="Guardar identidad" {...f} />
    </div>
  )
}
