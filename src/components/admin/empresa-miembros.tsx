"use client"

import * as React from "react"
import Link from "next/link"

import { cambiarRolPanel, darAcceso, quitarAcceso, reenviarInvitacionPanel } from "@/app/admin/actions"
import { BotonConMotivo, useAccion } from "@/components/admin/boton-con-motivo"
import { EstadoDeUsuario, fechaCorta } from "@/components/admin/piezas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Rol } from "@/engine/empresas"
import type { EstadoUsuario } from "@/lib/admin-data"

export type Miembro = { id: string; email: string; rol: Rol; ultimoIngreso: string | null; estado: EstadoUsuario }

const ROLES: Rol[] = ["owner", "member"]

/** Los miembros de una empresa. Las reglas (nunca sin owner) las pone el motor, igual que en Configuración. */
export function EmpresaMiembros({ accountId, miembros }: { accountId: string; miembros: Miembro[] }) {
  const { pendiente, correr } = useAccion()
  const [correo, setCorreo] = React.useState("")
  const [rol, setRol] = React.useState<Rol>("member")
  const owners = miembros.filter((m) => m.rol === "owner").length

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Último ingreso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {miembros.map((m) => {
              const unico = m.rol === "owner" && owners <= 1
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    <Link className="hover:text-brand-text hover:underline" href={`/admin/usuarios?u=${m.id}`}>
                      {m.email}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {ROLES.map((r) => (
                        <button
                          key={r}
                          type="button"
                          disabled={pendiente || m.rol === r}
                          onClick={() => correr(() => cambiarRolPanel(accountId, m.id, r))}
                          className={`rounded border px-2 py-0.5 text-xs ${m.rol === r ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-accent"}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fechaCorta(m.ultimoIngreso)}</TableCell>
                  <TableCell>
                    <EstadoDeUsuario estado={m.estado} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {m.estado === "pendiente" ? (
                        <Button variant="ghost" size="sm" disabled={pendiente} onClick={() => correr(() => reenviarInvitacionPanel(accountId, m.id))}>
                          Reenviar
                        </Button>
                      ) : null}
                      <BotonConMotivo
                        etiqueta="Quitar"
                        disabled={unico}
                        title={unico ? "Es el único owner de la empresa." : undefined}
                        titulo="Quitar acceso"
                        descripcion={`${m.email} deja de entrar a esta empresa. Su cuenta sigue existiendo para sus otras empresas.`}
                        confirmar="Quitar acceso"
                        accion={(motivo) => quitarAcceso(accountId, m.id, motivo)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
        <div>
          <p className="text-sm font-medium">Dar acceso a alguien</p>
          <p className="text-muted-foreground text-xs">Si no tiene cuenta, le llega una invitación para elegir su contraseña. Si ya la tiene, entra con la suya.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="sm:w-80" type="email" aria-label="Correo" placeholder="persona@empresa.com" value={correo} disabled={pendiente} onChange={(e) => setCorreo(e.target.value)} />
          {(["member", "owner"] as Rol[]).map((r) => (
            <Button key={r} type="button" size="sm" variant={rol === r ? "default" : "outline"} onClick={() => setRol(r)}>
              {r}
            </Button>
          ))}
          <Button type="button" variant="brand" disabled={pendiente || !correo.trim()} onClick={() => correr(() => darAcceso(accountId, correo, rol), () => setCorreo(""))}>
            Dar acceso
          </Button>
        </div>
      </div>
    </div>
  )
}
