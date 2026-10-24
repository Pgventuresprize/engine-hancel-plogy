"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { Cuenta } from "@/engine/accounts"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { BotIcon, ChefHatIcon, ClapperboardIcon, FingerprintIcon, GalleryHorizontalEndIcon, KanbanIcon, LayersIcon, LightbulbIcon, SendIcon, SettingsIcon } from "lucide-react"

import { AGENTES } from "@/lib/agentes-catalogo"

export function AppSidebar({
  email,
  cuentas,
  cuenta,
  ...props
}: {
  email: string
  cuentas: Cuenta[]
  cuenta: Cuenta
} & React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  // El estudio, la publicacion y los videos son del plan advance; una empresa
  // basic solo ve las noticias, sus agentes y la configuracion.
  const advance = cuenta.plan === "advance"

  const todo = [
    {
      // Sin subsecciones: el estudio es una sola pantalla, el tablero, y
      // colgarle hijos que no existen solo añadiria un desplegable vacio.
      title: "Estudio",
      url: "/",
      icon: <KanbanIcon />,
      isActive: pathname === "/",
      items: [],
    },
    {
      // Seccion propia y no un ajuste: es lo que leen todos los agentes antes
      // de escribir y dibujar (identidad, voz, kit, imagenes, ejemplos).
      title: "Marca",
      url: "/marca",
      icon: <FingerprintIcon />,
      isActive: pathname.startsWith("/marca"),
      items: [],
    },
    {
      title: "Capas",
      url: "/capas",
      icon: <LayersIcon />,
      isActive: pathname.startsWith("/capas"),
      items: [],
    },
    {
      title: "Ideas",
      url: "/ideas",
      icon: <LightbulbIcon />,
      isActive: pathname.startsWith("/ideas"),
      items: [],
    },
    {
      // Lo que produce el pipeline nuevo, por pilar. El "Estudio" de arriba es
      // el tablero de las noticias, que sigue igual.
      title: "Estudio de pilares",
      url: "/estudio/pilares",
      icon: <GalleryHorizontalEndIcon />,
      isActive: pathname.startsWith("/estudio/pilares"),
      items: [],
    },
    {
      title: "Recetas",
      url: "/recetas",
      icon: <ChefHatIcon />,
      isActive: pathname.startsWith("/recetas"),
      items: [],
    },
    {
      // El agente de publicacion del estudio: publica lo que producen las
      // recetas. Es otro que el "Publicacion" de Agentes, que es el de noticias.
      title: "Publicación",
      url: "/publicacion",
      icon: <SendIcon />,
      isActive: pathname.startsWith("/publicacion"),
      items: [],
    },
    {
      // Los videos: un pipeline aparte, a medias entre el agente (idea y guion)
      // y una persona (clips en Flow y montaje en Canva).
      title: "Video studio",
      url: "/videos",
      icon: <ClapperboardIcon />,
      isActive: pathname.startsWith("/videos"),
      items: [],
    },
    {
      title: "Agentes",
      url: `/agentes/${AGENTES[0].clave}`,
      icon: <BotIcon />,
      isActive: pathname.startsWith("/agentes"),
      // En el orden del pipeline, que es el recorrido de una noticia: quien
      // abre esto casi siempre viene siguiendo donde se atasco algo.
      items: AGENTES.map((a) => ({
        title: a.nombre,
        url: `/agentes/${a.clave}`,
        isActive: pathname === `/agentes/${a.clave}`,
      })),
    },
    {
      title: "Configuracion",
      url: "/configuracion/general",
      icon: <SettingsIcon />,
      isActive: pathname.startsWith("/configuracion"),
      items: [
        {
          title: "General",
          url: "/configuracion/general",
          isActive: pathname === "/configuracion/general",
        },
        {
          title: "Conexiones",
          url: "/configuracion/conexiones",
          isActive: pathname === "/configuracion/conexiones",
        },
        {
          title: "Empresa",
          url: "/configuracion/empresa",
          isActive: pathname === "/configuracion/empresa",
        },
        {
          title: "Consumo",
          url: "/configuracion/consumo",
          isActive: pathname === "/configuracion/consumo",
        },
      ],
    },
  ]
  const SOLO_ADVANCE = ["/capas", "/ideas", "/estudio/pilares", "/recetas", "/publicacion", "/videos"]
  const navMain = todo.filter((item) => advance || !SOLO_ADVANCE.includes(item.url))

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              {/* El lockup completo con la sidebar abierta; al colapsarla a
                  ancho de icono no cabe una marca apaisada, asi que se cambia
                  por el isotipo. Ambas llevan alt vacio y el nombre accesible
                  lo pone el span de abajo, para que no cambie con el estado. */}
              <Image
                src="/hancel-lockup.png"
                alt=""
                width={469}
                height={114}
                priority
                className="h-7 w-auto group-data-[collapsible=icon]:hidden"
              />
              <Image
                src="/hancel.png"
                alt=""
                width={180}
                height={180}
                className="hidden size-8 shrink-0 rounded-lg group-data-[collapsible=icon]:block"
              />
              <span className="sr-only">Hancel</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser email={email} cuentas={cuentas} cuenta={cuenta} />
      </SidebarFooter>
    </Sidebar>
  )
}
