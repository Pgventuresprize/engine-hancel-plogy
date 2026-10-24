import { ConsumoGrafico } from "@/components/configuracion/consumo-grafico"
import { DashboardShell } from "@/components/dashboard-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { consumoDeLaCuenta, DIAS_DE_CONSUMO, GRUPOS } from "@/lib/consumo-data"
import { formatTokens } from "@/lib/format"

export const dynamic = "force-dynamic"

export const metadata = { title: "Consumo · Engine Hancel" }

const RED: Record<string, string> = { instagram: "Carrusel", linkedin: "LinkedIn" }

/**
 * Lo que la cuenta gasta en Claude: por dia, por paso y por pieza. Sale del
 * registro que deja cada llamada (engine/claude/messages.ts).
 */
export default async function ConsumoPage() {
  const c = await consumoDeLaCuenta()

  const tarjetas = [
    { titulo: "Hoy", valor: formatTokens(c.hoy) },
    { titulo: "Últimos 7 días", valor: formatTokens(c.semana) },
    { titulo: `Últimos ${DIAS_DE_CONSUMO} días`, valor: formatTokens(c.mes), nota: `${c.llamadasMes} llamadas` },
    { titulo: "Por carrusel", valor: c.porCarrusel === null ? "—" : formatTokens(c.porCarrusel), nota: "promedio, de la noticia a las láminas" },
  ]

  return (
    <DashboardShell title="Consumo">
      <div className="flex max-w-5xl flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tarjetas.map((t) => (
            <Card key={t.titulo} className="gap-1 py-4">
              <CardHeader className="px-4">
                <CardDescription>{t.titulo}</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <div className="text-2xl font-semibold tabular-nums">{t.valor}</div>
                <div className="text-xs text-muted-foreground">{t.nota ?? "tokens"}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tokens por día</CardTitle>
            <CardDescription>Entrada más salida de todas las llamadas a Claude, por grupo de pasos.</CardDescription>
          </CardHeader>
          <CardContent>
            {c.llamadasMes === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay llamadas registradas.</p>
            ) : (
              <ConsumoGrafico dias={c.dias} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por post</CardTitle>
            <CardDescription>
              Lo que costó cada pieza. Compartido es el análisis y el ángulo de su noticia; propio, el guion, el revisor, el criterio y el diseño.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {c.piezas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Las piezas que se generen a partir de ahora muestran aquí su consumo.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pieza</TableHead>
                      {GRUPOS.map((g) => (
                        <TableHead key={g.clave} className="hidden text-right lg:table-cell">{g.etiqueta}</TableHead>
                      ))}
                      <TableHead className="text-right">Compartido</TableHead>
                      <TableHead className="text-right">Propio</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.piezas.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="max-w-40 sm:max-w-72">
                          <div className="truncate font-medium" title={p.titulo}>{p.titulo}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">{RED[p.red] ?? p.red}</Badge>
                            {new Date(p.fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short" })} · {p.llamadas} llamadas
                          </div>
                        </TableCell>
                        {GRUPOS.map((g) => (
                          <TableCell key={g.clave} className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">
                            {p.porGrupo[g.clave] ? formatTokens(p.porGrupo[g.clave]) : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">{formatTokens(p.compartido)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatTokens(p.propio)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatTokens(p.compartido + p.propio)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por paso</CardTitle>
            <CardDescription>
              Últimos {DIAS_DE_CONSUMO} días. De la entrada, la parte de caché se reaprovecha y cuesta una décima parte.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {c.pasos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay llamadas registradas.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paso</TableHead>
                      <TableHead className="hidden sm:table-cell">Modelo</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Llamadas</TableHead>
                      <TableHead className="text-right">Entrada</TableHead>
                      <TableHead className="hidden text-right md:table-cell">De caché</TableHead>
                      <TableHead className="text-right">Salida</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Tiempo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.pasos.map((p) => (
                      <TableRow key={`${p.paso}|${p.modelo}`}>
                        <TableCell className="whitespace-normal font-medium">{p.etiqueta}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{p.modelo}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{p.llamadas}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatTokens(p.entrada)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{formatTokens(p.cache)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatTokens(p.salida)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatTokens(p.entrada + p.salida)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                          {p.segundos >= 60 ? `${Math.round(p.segundos / 60)} min` : `${Math.round(p.segundos)} s`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
