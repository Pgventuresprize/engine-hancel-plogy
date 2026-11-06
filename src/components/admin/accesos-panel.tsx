"use client"

import * as React from "react"

import { cambiarRegistro, nombrarAdmin, quitarAdmin } from "@/app/admin/actions"
import { BotonConMotivo, useAccion } from "@/components/admin/boton-con-motivo"
import { fechaCorta, fechaDia } from "@/components/admin/piezas"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Fila = { id: string; email: string; adminDesde: string | null; ultimoIngreso: string | null }

export function AccesosPanel({ admins, yo, registroAbierto }: { admins: Fila[]; yo: string; registroAbierto: boolean }) {
  const { pendiente, correr } = useAccion()
  const [correo, setCorreo] = React.useState("")

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Administradores de la plataforma</CardTitle>
          <CardDescription>Solo ellos ven este panel. Ser owner de una empresa no da acceso.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Correo</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead>Último ingreso</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.email}
                      {a.id === yo ? <span className="text-muted-foreground font-normal"> (tú)</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fechaDia(a.adminDesde)}</TableCell>
                    <TableCell className="text-muted-foreground">{fechaCorta(a.ultimoIngreso)}</TableCell>
                    <TableCell className="text-right">
                      <BotonConMotivo
                        etiqueta="Quitar acceso"
                        disabled={a.id === yo}
                        title={a.id === yo ? "No puedes quitarte a ti mismo." : undefined}
                        titulo="Quitar administrador"
                        descripcion={`${a.email} deja de ver este panel. Sigue en sus empresas con su rol.`}
                        confirmar="Quitar acceso"
                        accion={(motivo) => quitarAdmin(a.id, motivo)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
            <div>
              <p className="text-sm font-medium">Nombrar administrador</p>
              <p className="text-muted-foreground text-xs">Tiene que tener cuenta en el Studio. Verá todas las empresas y podrá cambiar lo mismo que tú.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input className="sm:w-80" type="email" aria-label="Correo del nuevo administrador" placeholder="correo de la persona" value={correo} disabled={pendiente} onChange={(e) => setCorreo(e.target.value)} />
              <Button type="button" variant="brand" disabled={pendiente || !correo.trim()} onClick={() => correr(() => nombrarAdmin(correo), () => setCorreo(""))}>
                Nombrar administrador
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registro de cuentas nuevas</CardTitle>
          <CardDescription>Con el registro cerrado, solo se entra por invitación.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={registroAbierto ? "default" : "outline"} disabled={pendiente || registroAbierto} onClick={() => correr(() => cambiarRegistro(true))}>
            Abierto
          </Button>
          <Button type="button" size="sm" variant={registroAbierto ? "outline" : "default"} disabled={pendiente || !registroAbierto} onClick={() => correr(() => cambiarRegistro(false))}>
            Solo por invitación
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
