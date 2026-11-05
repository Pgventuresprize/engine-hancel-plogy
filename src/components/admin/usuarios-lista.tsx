"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"

import { bloquearUsuario, cerrarSesionesUsuario, darAcceso, desbloquearUsuario, enviarEnlaceContrasena, quitarAcceso, reenviarInvitacionPanel } from "@/app/admin/actions"
import { BotonConMotivo, useAccion } from "@/components/admin/boton-con-motivo"
import { EstadoDeUsuario, fechaCorta, fechaDia } from "@/components/admin/piezas"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Rol } from "@/engine/empresas"
import type { UsuarioPanel } from "@/lib/admin-data"

const FILTROS = [
  { id: "todos", texto: "Todos", pasa: () => true },
  { id: "activos", texto: "Activos", pasa: (u: UsuarioPanel) => u.estado === "activo" },
  { id: "pendientes", texto: "Pendientes", pasa: (u: UsuarioPanel) => u.estado === "pendiente" },
  { id: "bloqueados", texto: "Bloqueados", pasa: (u: UsuarioPanel) => u.estado === "bloqueado" },
  { id: "admins", texto: "Administradores", pasa: (u: UsuarioPanel) => u.esAdmin },
]

type EmpresaResumen = { id: string; name: string; owners: number }

export function UsuariosLista({
  usuarios,
  empresas,
  yo,
  abierto,
}: {
  usuarios: UsuarioPanel[]
  empresas: EmpresaResumen[]
  yo: string
  abierto?: string
}) {
  const [buscar, setBuscar] = React.useState("")
  const [filtro, setFiltro] = React.useState("todos")
  const [elegido, setElegido] = React.useState<string | null>(abierto ?? null)
  const pasa = FILTROS.find((f) => f.id === filtro)?.pasa ?? (() => true)
  const q = buscar.trim().toLowerCase()
  const visibles = usuarios.filter((u) => pasa(u) && (!q || u.email.toLowerCase().includes(q)))
  const usuario = usuarios.find((u) => u.id === elegido) ?? null

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="sm:w-72" type="search" aria-label="Buscar por correo" placeholder="Buscar por correo" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
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
                  <TableHead>Correo</TableHead>
                  <TableHead>Empresas</TableHead>
                  <TableHead>Último ingreso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <button type="button" className="hover:text-brand-text font-medium hover:underline" onClick={() => setElegido(u.id)}>
                          {u.email}
                        </button>
                        {u.esAdmin ? <Badge>Admin</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="flex flex-wrap gap-1">
                        {u.empresas.map((e) => (
                          <Badge key={e.accountId} variant={e.suspendida ? "destructive" : "outline"}>
                            {e.nombre} · {e.rol}
                          </Badge>
                        ))}
                        {u.empresas.length === 0 ? <span className="text-muted-foreground">Sin empresa</span> : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fechaCorta(u.ultimoIngreso)}</TableCell>
                    <TableCell>
                      <EstadoDeUsuario estado={u.estado} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" aria-label={`Abrir ${u.email}`} onClick={() => setElegido(u.id)}>
                        <ChevronRightIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {visibles.length === 0 ? <p className="text-muted-foreground p-4 text-sm">Ningún usuario coincide con la búsqueda.</p> : null}
          </div>
        </CardContent>
      </Card>
      <Sheet open={usuario !== null} onOpenChange={(o) => !o && setElegido(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {usuario ? <FichaUsuario key={usuario.id} usuario={usuario} empresas={empresas} esTu={usuario.id === yo} /> : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

function FichaUsuario({ usuario: u, empresas, esTu }: { usuario: UsuarioPanel; empresas: EmpresaResumen[]; esTu: boolean }) {
  const { pendiente, correr } = useAccion()
  const [otra, setOtra] = React.useState<string | null>(null)
  const [rol, setRol] = React.useState<Rol>("member")
  const otras = empresas.filter((e) => !u.empresas.some((x) => x.accountId === e.id))

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6 break-all">{u.email}</SheetTitle>
        <SheetDescription render={<div />}>
          <span className="flex items-center gap-1.5">
            <EstadoDeUsuario estado={u.estado} />
            {u.esAdmin ? <Badge>Admin</Badge> : null}
          </span>
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-6">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Último ingreso</div>
            {fechaCorta(u.ultimoIngreso)}
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Alta</div>
            {fechaDia(u.alta)}
          </div>
        </div>

        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Empresas</h3>
          {u.empresas.length === 0 ? <p className="text-muted-foreground text-sm">No pertenece a ninguna empresa.</p> : null}
          <div className="flex flex-col divide-y">
            {u.empresas.map((e) => {
              const unico = e.rol === "owner" && (empresas.find((x) => x.id === e.accountId)?.owners ?? 0) <= 1
              return (
                <div key={e.accountId} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <Link className="hover:text-brand-text font-medium hover:underline" href={`/admin/empresas/${e.accountId}`}>
                      {e.nombre}
                    </Link>{" "}
                    <span className="text-muted-foreground">· {e.rol}</span>
                  </span>
                  <BotonConMotivo
                    etiqueta="Quitar"
                    disabled={unico}
                    title={unico ? "Es el único owner de la empresa." : undefined}
                    titulo="Quitar acceso"
                    descripcion={`${u.email} deja de entrar a ${e.nombre}. Su cuenta sigue existiendo para sus otras empresas.`}
                    confirmar="Quitar acceso"
                    accion={(motivo) => quitarAcceso(e.accountId, u.id, motivo)}
                  />
                </div>
              )
            })}
          </div>
        </section>

        {otras.length > 0 ? (
          <section className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <p className="text-sm font-medium">Dar acceso a otra empresa</p>
            <div className="flex flex-wrap gap-1">
              {otras.map((e) => (
                <Button key={e.id} type="button" size="sm" variant={otra === e.id ? "default" : "outline"} onClick={() => setOtra(e.id)}>
                  {e.name}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["member", "owner"] as Rol[]).map((r) => (
                <Button key={r} type="button" size="sm" variant={rol === r ? "default" : "outline"} onClick={() => setRol(r)}>
                  {r}
                </Button>
              ))}
              <Button type="button" size="sm" variant="brand" disabled={pendiente || !otra} onClick={() => otra && correr(() => darAcceso(otra, u.email, rol), () => setOtra(null))}>
                Dar acceso
              </Button>
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Seguridad</h3>
          <div className="flex flex-wrap gap-2">
            {u.estado === "pendiente" && u.empresas[0] ? (
              <Button type="button" variant="outline" size="sm" disabled={pendiente} onClick={() => correr(() => reenviarInvitacionPanel(u.empresas[0].accountId, u.id))}>
                Reenviar invitación
              </Button>
            ) : null}
            {u.estado !== "pendiente" ? (
              <Button type="button" variant="outline" size="sm" disabled={pendiente} onClick={() => correr(() => enviarEnlaceContrasena(u.id))}>
                Enviar enlace de contraseña
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" disabled={pendiente || esTu} onClick={() => correr(() => cerrarSesionesUsuario(u.id))}>
              Cerrar sesiones
            </Button>
          </div>
          <div>
            {u.estado === "bloqueado" ? (
              <BotonConMotivo etiqueta="Desbloquear usuario" variante="brand" titulo="Desbloquear usuario" descripcion={u.email} confirmar="Desbloquear" accion={(motivo) => desbloquearUsuario(u.id, motivo)} />
            ) : (
              <BotonConMotivo
                etiqueta="Bloquear usuario"
                disabled={esTu}
                title={esTu ? "No puedes bloquearte a ti mismo." : undefined}
                titulo="Bloquear usuario"
                descripcion={u.email}
                efectos={["Se cierra su sesión y no puede volver a entrar a ninguna empresa.", "Sus empresas siguen funcionando.", "Sigue contando como miembro hasta que lo quites."]}
                confirmar="Bloquear usuario"
                accion={(motivo) => bloquearUsuario(u.id, motivo)}
              />
            )}
          </div>
        </section>
      </div>
    </>
  )
}
