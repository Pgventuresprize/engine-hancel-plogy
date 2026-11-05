"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRightIcon, PlusIcon } from "lucide-react"

import { crearEmpresaPanel } from "@/app/admin/actions"
import { useAccion } from "@/components/admin/boton-con-motivo"
import { EstadoClaude, EstadoEmpresa, PlanBadge, fechaCorta } from "@/components/admin/piezas"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Plan } from "@/engine/accounts"
import type { EmpresaPanel } from "@/lib/admin-data"
import { formatTokens } from "@/lib/format"
import { formatUsd } from "@/lib/precios-claude"

type Fila = EmpresaPanel & { archivos: string }

const FILTROS = [
  { id: "todas", texto: "Todas", pasa: () => true },
  { id: "advance", texto: "Advance", pasa: (e: Fila) => e.plan === "advance" },
  { id: "basic", texto: "Basic", pasa: (e: Fila) => e.plan === "basic" },
  { id: "suspendidas", texto: "Suspendidas", pasa: (e: Fila) => Boolean(e.suspendidaEn) },
  { id: "sin-claude", texto: "Sin Claude", pasa: (e: Fila) => e.claude === "sin-conectar" },
]

export function EmpresasLista({ empresas }: { empresas: Fila[] }) {
  const [buscar, setBuscar] = React.useState("")
  const [filtro, setFiltro] = React.useState("todas")
  const pasa = FILTROS.find((f) => f.id === filtro)?.pasa ?? (() => true)
  const q = buscar.trim().toLowerCase()
  const visibles = empresas.filter((e) => pasa(e) && (!q || e.name.toLowerCase().includes(q) || e.slug.includes(q)))

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="sm:w-72" type="search" aria-label="Buscar empresa" placeholder="Buscar empresa" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        {FILTROS.map((f) => (
          <Button key={f.id} type="button" size="sm" variant={filtro === f.id ? "default" : "outline"} onClick={() => setFiltro(f.id)}>
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
                  <TableHead>Empresa</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Miembros</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">≈ USD</TableHead>
                  <TableHead className="text-right">Piezas</TableHead>
                  <TableHead className="text-right">Archivos</TableHead>
                  <TableHead>Claude</TableHead>
                  <TableHead>Última actividad</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-56">
                      <Link href={`/admin/empresas/${e.id}`} className="hover:text-brand-text block truncate font-medium hover:underline">
                        {e.name}
                      </Link>
                      <div className="text-muted-foreground truncate text-xs">{e.slug}</div>
                    </TableCell>
                    <TableCell>
                      <PlanBadge plan={e.plan} />
                    </TableCell>
                    <TableCell>
                      <EstadoEmpresa suspendida={Boolean(e.suspendidaEn)} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.miembros}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTokens(e.tokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(e.usd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.piezas}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.archivos}</TableCell>
                    <TableCell>
                      <EstadoClaude empresa={e} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fechaCorta(e.ultimaActividad)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" aria-label={`Abrir ${e.name}`} render={<Link href={`/admin/empresas/${e.id}`} />}>
                        <ChevronRightIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {visibles.length === 0 ? <p className="text-muted-foreground p-4 text-sm">Ninguna empresa coincide con la búsqueda.</p> : null}
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export function BotonNuevaEmpresa() {
  const { pendiente, correr } = useAccion()
  const [abierto, setAbierto] = React.useState(false)
  const [nombre, setNombre] = React.useState("")
  const [correo, setCorreo] = React.useState("")
  const [plan, setPlan] = React.useState<Plan>("basic")
  const valido = nombre.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())

  return (
    <>
      <Button type="button" variant="brand" onClick={() => setAbierto(true)}>
        <PlusIcon />
        Nueva empresa
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !pendiente && setAbierto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
            <DialogDescription>Empieza vacía y sin conexiones. Si el correo no tiene cuenta, le llega una invitación.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="n-empresa">Nombre de la empresa</Label>
            <Input id="n-empresa" value={nombre} disabled={pendiente} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="n-owner">Correo del owner</Label>
            <Input id="n-owner" type="email" placeholder="persona@empresa.com" value={correo} disabled={pendiente} onChange={(e) => setCorreo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            {(["basic", "advance"] as Plan[]).map((p) => (
              <Button key={p} type="button" size="sm" variant={plan === p ? "default" : "outline"} onClick={() => setPlan(p)}>
                {p === "advance" ? "Advance" : "Basic"}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pendiente} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="brand"
              disabled={pendiente || !valido}
              onClick={() =>
                correr(
                  () => crearEmpresaPanel(nombre, plan, correo),
                  () => {
                    setAbierto(false)
                    setNombre("")
                    setCorreo("")
                  }
                )
              }
            >
              {pendiente ? "Creando…" : "Crear empresa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
