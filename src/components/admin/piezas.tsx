import type { Plan } from "@/engine/accounts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import type { EmpresaPanel, EstadoUsuario } from "@/lib/admin-data"
import { DISPLAY_TIMEZONE } from "@/lib/format"

/** Las piezas chicas que se repiten en todo el panel. Sin estado: sirven en servidor y en cliente. */

export function Cifra({ titulo, valor, nota, barra }: { titulo: string; valor: string; nota?: string; barra?: number }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{titulo}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 px-4">
        <div className="text-2xl font-semibold tabular-nums">{valor}</div>
        {nota ? <div className="text-muted-foreground text-xs">{nota}</div> : null}
        {barra !== undefined ? <Barra valor={barra} /> : null}
      </CardContent>
    </Card>
  )
}

export function Barra({ valor }: { valor: number }) {
  return (
    <span className="bg-secondary block h-2 overflow-hidden rounded-full" aria-hidden>
      <span className="bg-brand block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, valor))}%` }} />
    </span>
  )
}

export function PlanBadge({ plan }: { plan: Plan }) {
  return plan === "advance" ? <Badge>Advance</Badge> : <Badge variant="secondary">Basic</Badge>
}

export function EstadoEmpresa({ suspendida }: { suspendida: boolean }) {
  return suspendida ? <Badge variant="destructive">Suspendida</Badge> : <Badge variant="success">Activa</Badge>
}

export function EstadoClaude({ empresa }: { empresa: Pick<EmpresaPanel, "claude" | "claudeConErrores"> }) {
  if (empresa.claudeConErrores) return <Badge variant="destructive">Con errores</Badge>
  if (empresa.claude === "sin-conectar") return <Badge variant="warning">Sin conectar</Badge>
  return <Badge variant="success">{empresa.claude === "api" ? "API key" : "Suscripción"}</Badge>
}

const USUARIO: Record<EstadoUsuario, { texto: string; variante: "success" | "warning" | "destructive" }> = {
  activo: { texto: "Activo", variante: "success" },
  pendiente: { texto: "Invitación pendiente", variante: "warning" },
  bloqueado: { texto: "Bloqueado", variante: "destructive" },
}

export function EstadoDeUsuario({ estado }: { estado: EstadoUsuario }) {
  return <Badge variant={USUARIO[estado].variante}>{USUARIO[estado].texto}</Badge>
}

/** 5 nov, 11:42. */
export function fechaCorta(valor: string | null): string {
  if (!valor) return "—"
  return new Date(valor).toLocaleString("es-CO", { timeZone: DISPLAY_TIMEZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

/** 5 nov 2026. */
export function fechaDia(valor: string | null): string {
  if (!valor) return "—"
  return new Date(valor).toLocaleDateString("es-CO", { timeZone: DISPLAY_TIMEZONE, day: "numeric", month: "short", year: "numeric" })
}
