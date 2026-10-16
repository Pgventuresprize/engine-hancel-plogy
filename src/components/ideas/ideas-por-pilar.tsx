"use client"

import type { PilarConIdeas } from "@/lib/ideas-data"
import { PanelPilar } from "@/components/ideas/panel-pilar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Las ideas, una pestaña por pilar: antes iban todos los pilares uno debajo del
 * otro y para llegar al segundo habia que bajar por todas las ideas del primero.
 */
export function IdeasPorPilar({ pilares }: { pilares: PilarConIdeas[] }) {
  return (
    <Tabs defaultValue={pilares[0]?.id} className="flex flex-col gap-4">
      <TabsList className="h-auto flex-wrap">
        {pilares.map((p) => (
          <TabsTrigger key={p.id} value={p.id} className="gap-1.5">
            {p.name}
            <span className="text-muted-foreground text-xs tabular-nums">{p.disponibles.length}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {pilares.map((p) => (
        <TabsContent key={p.id} value={p.id}>
          <PanelPilar pilar={p} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
