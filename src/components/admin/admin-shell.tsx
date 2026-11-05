import * as React from "react"
import Link from "next/link"

import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { Avisos } from "@/components/admin/avisos"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { exigirAdmin } from "@/lib/admin"

/**
 * El marco del panel. No pasa por `cuentaActual`: un administrador tiene que poder
 * entrar aunque su empresa este suspendida, o aunque no tenga ninguna.
 */
export async function AdminShell({
  title,
  descripcion,
  acciones,
  children,
}: {
  title: string
  descripcion?: string
  acciones?: React.ReactNode
  children: React.ReactNode
}) {
  const admin = await exigirAdmin()
  return (
    <SidebarProvider>
      <AdminSidebar email={admin.email} />
      <SidebarInset>
        <header className="bg-background/85 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1.5" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink render={<Link href="/admin" />}>Administración</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-6 md:p-6 md:pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl leading-tight">{title}</h1>
              {descripcion ? <p className="text-muted-foreground">{descripcion}</p> : null}
            </div>
            {acciones}
          </div>
          {children}
        </div>
        <Avisos />
      </SidebarInset>
    </SidebarProvider>
  )
}
