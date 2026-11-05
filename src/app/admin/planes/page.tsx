import Link from "next/link"

import { AdminShell } from "@/components/admin/admin-shell"
import { BotonCambiarPlan } from "@/components/admin/empresa-acciones"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cargarPanel, type EmpresaPanel } from "@/lib/admin-data"

export const dynamic = "force-dynamic"

/** Lo mismo que oculta la barra lateral (app-sidebar.tsx) y cierra `exigirAdvance`. */
const FUNCIONES: [string, boolean][] = [
  ["Chat con agentes", true],
  ["Estudio de noticias", true],
  ["Marca", true],
  ["Recursos", true],
  ["Agentes", true],
  ["Calendario", false],
  ["Capas", false],
  ["Ideas", false],
  ["Estudio de pilares", false],
  ["Recetas", false],
  ["Publicación", false],
  ["Video studio", false],
]

function ListaDePlan({ titulo, detalle, empresas }: { titulo: string; detalle: string; empresas: EmpresaPanel[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{titulo}</CardTitle>
          <CardDescription>{detalle}</CardDescription>
        </div>
        <Badge variant="secondary">{empresas.length === 1 ? "1 empresa" : `${empresas.length} empresas`}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {empresas.length === 0 ? <p className="text-muted-foreground text-sm">Ninguna empresa en este plan.</p> : null}
        {empresas.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
            <Link href={`/admin/empresas/${e.id}`} className="hover:text-brand-text truncate font-medium hover:underline">
              {e.name}
            </Link>
            <BotonCambiarPlan empresa={{ id: e.id, name: e.name, plan: e.plan, programadas: e.programadas }} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default async function AdminPlanesPage() {
  const p = await cargarPanel()
  return (
    <AdminShell title="Planes" descripcion="Solo un administrador cambia el plan de una empresa.">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ListaDePlan titulo="Basic" detalle="Noticias y sus agentes." empresas={p.empresas.filter((e) => e.plan === "basic")} />
        <ListaDePlan titulo="Advance" detalle="Todo lo de Basic más estudio, publicación y video." empresas={p.empresas.filter((e) => e.plan === "advance")} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qué incluye cada plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Función</TableHead>
                <TableHead>Basic</TableHead>
                <TableHead>Advance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FUNCIONES.map(([nombre, basic]) => (
                <TableRow key={nombre}>
                  <TableCell>{nombre}</TableCell>
                  <TableCell className={basic ? "" : "text-muted-foreground"}>{basic ? "Incluido" : "No incluido"}</TableCell>
                  <TableCell>Incluido</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminShell>
  )
}
