import Link from "next/link"
import { DownloadIcon } from "lucide-react"

import { AdminShell } from "@/components/admin/admin-shell"
import { fechaCorta } from "@/components/admin/piezas"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cargarPanel, type FilaActividad } from "@/lib/admin-data"

export const dynamic = "force-dynamic"

const FILTROS: { id: string; texto: string; pasa: (a: FilaActividad) => boolean }[] = [
  { id: "todo", texto: "Todo", pasa: () => true },
  { id: "plan", texto: "Planes", pasa: (a) => a.tipo === "plan" },
  { id: "acceso", texto: "Accesos", pasa: (a) => a.tipo === "acceso" },
  { id: "bloqueo", texto: "Bloqueos", pasa: (a) => a.tipo === "bloqueo" },
  { id: "sistema", texto: "Sistema", pasa: (a) => a.tipo === "sistema" || a.tipo === "plataforma" },
]

export default async function AdminActividadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [p, params] = await Promise.all([cargarPanel(), searchParams])
  const filtro = FILTROS.find((f) => f.id === params.tipo) ?? FILTROS[0]
  const filas = p.actividad.filter(filtro.pasa)

  return (
    <AdminShell
      title="Actividad"
      descripcion="Todo lo que pasa en la plataforma y quién lo hizo. No se puede editar ni borrar."
      acciones={
        <Button variant="outline" render={<a href={`/admin/actividad/csv?tipo=${filtro.id}`} />}>
          <DownloadIcon />
          Exportar CSV
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button key={f.id} size="sm" variant={f.id === filtro.id ? "default" : "outline"} render={<Link href={f.id === "todo" ? "/admin/actividad" : `/admin/actividad?tipo=${f.id}`} />}>
            {f.texto}
          </Button>
        ))}
      </div>
      <Card className="py-2">
        <CardContent className="px-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead>Qué</TableHead>
                  <TableHead>Sobre</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{fechaCorta(a.at)}</TableCell>
                    <TableCell>{a.actor}</TableCell>
                    <TableCell className="font-medium">{a.accion}</TableCell>
                    <TableCell>{a.sobre}</TableCell>
                    <TableCell className="text-muted-foreground max-w-md whitespace-normal">{[a.detalle, a.motivo ? `Motivo: ${a.motivo}` : null].filter(Boolean).join(". ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filas.length === 0 ? <p className="text-muted-foreground p-4 text-sm">Todavía no hay nada aquí.</p> : null}
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  )
}
