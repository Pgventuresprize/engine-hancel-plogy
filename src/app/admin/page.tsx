import Link from "next/link"

import { AdminShell } from "@/components/admin/admin-shell"
import { Barra, Cifra, fechaCorta } from "@/components/admin/piezas"
import { ConsumoGrafico } from "@/components/configuracion/consumo-grafico"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cargarPanel, DIAS_PANEL, formatBytes, LIMITE_ALMACENAMIENTO } from "@/lib/admin-data"
import { formatTokens } from "@/lib/format"
import { formatUsd } from "@/lib/precios-claude"

export const dynamic = "force-dynamic"

export default async function AdminResumenPage() {
  const p = await cargarPanel()
  const t = p.totales
  const suspendidas = p.empresas.filter((e) => e.suspendidaEn).length
  const top = [...p.empresas].sort((a, b) => b.tokens - a.tokens).slice(0, 5)
  const maximo = top[0]?.tokens || 1
  const ultimos = p.actividad.filter((a) => a.tipo !== "sistema").slice(0, 5)

  return (
    <AdminShell title="Resumen" descripcion="Cómo va toda la plataforma hoy.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cifra titulo="Empresas" valor={String(p.empresas.length)} nota={`${p.empresas.length - suspendidas} activas, ${suspendidas} suspendidas`} />
        <Cifra titulo="Usuarios" valor={String(p.usuarios.length)} nota={`${p.usuarios.filter((u) => u.estado === "activo").length} activos`} />
        <Cifra titulo={`Tokens, ${DIAS_PANEL} días`} valor={formatTokens(t.tokens)} nota={`≈ ${formatUsd(t.usd)} · ${t.llamadas.toLocaleString("es-CO")} llamadas`} />
        <Cifra titulo={`Piezas, ${DIAS_PANEL} días`} valor={String(t.piezas)} nota={`${t.publicadas} publicadas`} />
        <Cifra titulo="Almacenamiento" valor={formatBytes(t.bytes)} nota={`de ${formatBytes(LIMITE_ALMACENAMIENTO)}`} barra={(t.bytes / LIMITE_ALMACENAMIENTO) * 100} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Requiere atención <Badge variant="secondary">{p.atencion.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {p.atencion.length === 0 ? <p className="text-muted-foreground text-sm">Nada pendiente.</p> : null}
            {p.atencion.map((a) => (
              <div key={`${a.quien}|${a.texto}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={a.nivel === "urgente" ? "destructive" : "warning"}>{a.nivel === "urgente" ? "Urgente" : "Revisar"}</Badge>
                    <span className="truncate font-medium">{a.quien}</span>
                  </div>
                  <div className="text-muted-foreground text-sm">{a.texto}</div>
                </div>
                <Button variant="outline" size="sm" render={<Link href={a.href} />}>
                  Abrir
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tokens por día</CardTitle>
            <CardDescription>Toda la plataforma, últimos {DIAS_PANEL} días.</CardDescription>
          </CardHeader>
          <CardContent>{t.llamadas === 0 ? <p className="text-muted-foreground text-sm">Todavía no hay llamadas registradas.</p> : <ConsumoGrafico dias={p.dias} />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Quién más consume</CardTitle>
            <Button variant="outline" size="sm" render={<Link href="/admin/consumo" />}>
              Ver consumo
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {top.map((e) => (
              <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-3 text-sm">
                <Link href={`/admin/empresas/${e.id}`} className="hover:text-brand-text truncate font-medium hover:underline">
                  {e.name}
                </Link>
                <Barra valor={(e.tokens / maximo) * 100} />
                <span className="w-28 text-right tabular-nums">
                  {formatTokens(e.tokens)} <span className="text-muted-foreground">· {formatUsd(e.usd)}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Últimos cambios</CardTitle>
            <Button variant="outline" size="sm" render={<Link href="/admin/actividad" />}>
              Ver actividad
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {ultimos.length === 0 ? <p className="text-muted-foreground text-sm">Todavía no hay cambios.</p> : null}
            {ultimos.map((a) => (
              <div key={a.id} className="py-2 text-sm first:pt-0 last:pb-0">
                <span className="font-medium">{a.accion}</span> <span className="text-muted-foreground">· {a.sobre}</span>
                <div className="text-muted-foreground text-xs">
                  {a.actor} · {fechaCorta(a.at)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
