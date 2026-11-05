"use client"

import * as React from "react"

import { cambiarPlan, reactivarEmpresa, suspenderEmpresa } from "@/app/admin/actions"
import { BotonConMotivo } from "@/components/admin/boton-con-motivo"
import type { Plan } from "@/engine/accounts"

const SOLO_ADVANCE = "Calendario, Capas, Ideas, Estudio de pilares, Recetas, Publicación y Video studio"

const OPCIONES: { id: Plan; nombre: string; detalle: string }[] = [
  { id: "basic", nombre: "Basic", detalle: "Noticias y sus agentes." },
  { id: "advance", nombre: "Advance", detalle: "Todo lo de Basic más estudio, publicación y video." },
]

export function BotonCambiarPlan({ empresa }: { empresa: { id: string; name: string; plan: Plan; programadas: number } }) {
  const [plan, setPlan] = React.useState<Plan>(empresa.plan === "advance" ? "basic" : "advance")
  const baja = empresa.plan === "advance" && plan === "basic"
  const efectos =
    plan === empresa.plan
      ? []
      : baja
        ? [`Dejan de funcionar ${SOLO_ADVANCE}.`, `${empresa.programadas} posts programados no saldrán.`, "Sus datos se conservan si vuelve a Advance."]
        : [`Se habilitan ${SOLO_ADVANCE}.`, "La empresa lo ve la próxima vez que cargue una página."]
  return (
    <BotonConMotivo
      etiqueta="Cambiar plan"
      variante="outline"
      titulo={`Cambiar plan de ${empresa.name}`}
      descripcion={`Plan actual: ${empresa.plan === "advance" ? "Advance" : "Basic"}.`}
      efectos={efectos}
      confirmar="Cambiar plan"
      puedeConfirmar={plan !== empresa.plan}
      accion={(motivo) => cambiarPlan(empresa.id, plan, motivo)}
    >
      <div className="flex flex-col gap-2">
        {OPCIONES.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={plan === o.id}
            onClick={() => setPlan(o.id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              plan === o.id ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
            }`}
          >
            <span className="font-medium">{o.nombre}</span>
            <span className="block text-xs opacity-80">{o.detalle}</span>
          </button>
        ))}
      </div>
    </BotonConMotivo>
  )
}

export function BotonSuspension({ empresa }: { empresa: { id: string; name: string; suspendida: boolean; miembros: number; programadas: number } }) {
  if (empresa.suspendida) {
    return (
      <BotonConMotivo
        etiqueta="Reactivar empresa"
        variante="brand"
        titulo={`Reactivar ${empresa.name}`}
        descripcion="Vuelven el acceso y los agentes."
        confirmar="Reactivar empresa"
        accion={(motivo) => reactivarEmpresa(empresa.id, motivo)}
      />
    )
  }
  return (
    <BotonConMotivo
      etiqueta="Suspender empresa"
      titulo={`Suspender ${empresa.name}`}
      descripcion="Afecta a toda la empresa de inmediato."
      efectos={[
        `Sus ${empresa.miembros} miembros ven un aviso y no pueden trabajar.`,
        "Se detienen la ingesta, los agentes y el chat.",
        `${empresa.programadas} posts programados no saldrán.`,
        "Nada se borra: al reactivarla sigue donde estaba.",
      ]}
      confirmar="Suspender empresa"
      accion={(motivo) => suspenderEmpresa(empresa.id, motivo)}
    />
  )
}
