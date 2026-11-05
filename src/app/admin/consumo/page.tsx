import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"

import { AdminShell } from "@/components/admin/admin-shell"
import { Barra, Cifra, PlanBadge } from "@/components/admin/piezas"
import { ConsumoGrafico } from "@/components/configuracion/consumo-grafico"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cargarPanel, DIAS_PANEL } from "@/lib/admin-data"
import { formatTokens } from "@/lib/format"
import { formatUsd } from "@/lib/precios-claude"

export const dynamic = "force-dynamic"

export default async function AdminConsumoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [p, params] = await Promise.all([cargarPanel(), searchParams])
  const rango = params.dias === "7" ? 7 : DIAS_PANEL
  const t = p.totales
  const orden = [...p.empresas].sort((a, b) => b.tokens - a.tokens)
  const maximo = orden[0]?.tokens || 1
  const sinPiezas = t.piezas === 0

  return (
    <AdminShell
      title="Consumo"
      descripcion="Lo que gasta cada empresa en Claude. Los dólares son estimados a precio de API."
      acciones={
        <div className="flex gap-2">
          {[7, DIAS_PANEL].map((d) => (
            <Button nativeButton={false} key={d} size="sm" variant={rango === d ? "default" : "outline"} render={<Link href={d === DIAS_PANEL ? "/admin/consumo" : `/admin/consumo?dias=${d}`} />}>
              {d} días
            </Button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cifra titulo="Hoy" valor={formatTokens(t.hoy)} nota={`≈ ${formatUsd(t.hoyUsd)}`} />
        <Cifra titulo="Últimos 7 días" valor={formatTokens(t.semana)} nota={`≈ ${formatUsd(t.semanaUsd)}`} />
        <Cifra titulo={`Últimos ${DIAS_PANEL} días`} valor={formatTokens(t.tokens)} nota={`≈ ${formatUsd(t.usd)} · ${t.llamadas.toLocaleString("es-CO")} llamadas`} />
        <Cifra titulo="Por pieza" valor={sinPiezas ? "—" : formatTokens(t.tokens / t.piezas)} nota={sinPiezas ? "sin piezas" : `≈ ${formatUsd(t.usd / t.piezas)} en promedio`} />
        <Cifra titulo="De caché" valor={`${t.cache} %`} nota="de la entrada, a una décima parte" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tokens por día</CardTitle>
          <CardDescription>Entrada más salida de todas las empresas, por grupo de pasos.</CardDescription>
        </CardHeader>
        <CardContent>{t.llamadas === 0 ? <p className="text-muted-foreground text-sm">Todavía no hay llamadas registradas.</p> : <ConsumoGrafico dias={p.dias.slice(-rango)} />}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por empresa</CardTitle>
          <CardDescription>Últimos {DIAS_PANEL} días, de la que más consume a la que menos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="min-w-32">Parte del total</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">≈ USD</TableHead>
                  <TableHead className="text-right">Por pieza</TableHead>
                  <TableHead className="text-right">Contra el mes anterior</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orden.map((e) => {
                  const cambio = e.tokensAntes ? Math.round(((e.tokens - e.tokensAntes) / e.tokensAntes) * 100) : null
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <Link href={`/admin/empresas/${e.id}`} className="hover:text-brand-text font-medium hover:underline">
                            {e.name}
                          </Link>
                          <PlanBadge plan={e.plan} />
                        </span>
                      </TableCell>
                      <TableCell>
                        <Barra valor={(e.tokens / maximo) * 100} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">{t.tokens ? Math.round((e.tokens / t.tokens) * 100) : 0} %</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatTokens(e.tokens)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUsd(e.usd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.piezas ? formatTokens(e.tokens / e.piezas) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{cambio === null ? "—" : `${cambio > 0 ? "+" : ""}${cambio} %`}</TableCell>
                      <TableCell>
                        <Button nativeButton={false} variant="ghost" size="icon-sm" aria-label={`Abrir ${e.name}`} render={<Link href={`/admin/empresas/${e.id}`} />}>
                          <ChevronRightIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por paso</CardTitle>
          <CardDescription>En qué se va el consumo, sumando todas las empresas.</CardDescription>
        </CardHeader>
        <CardContent>
          {p.pasos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no hay llamadas registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paso</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Llamadas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">≈ USD</TableHead>
                    <TableHead className="text-right">Caché</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.pasos.map((s) => (
                    <TableRow key={s.clave}>
                      <TableCell className="font-medium whitespace-normal">{s.etiqueta}</TableCell>
                      <TableCell className="text-muted-foreground">{s.modelo}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.llamadas.toLocaleString("es-CO")}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatTokens(s.tokens)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUsd(s.usd)}</TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">{s.cache} %</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  )
}
