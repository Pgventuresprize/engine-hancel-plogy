"use client"

import * as React from "react"
import { Combobox } from "@base-ui/react/combobox"

import { Input } from "@/components/ui/input"
import type { Pais } from "@/lib/paises"

/**
 * El pais del celular: se escribe el nombre o el indicativo y se elige de la lista.
 *
 * Los indicativos son libres de prefijos, asi que uno que coincide exacto con un
 * solo pais ya no puede ser otro: `+57` lo elige sin mas. Los compartidos, como
 * `+1`, se dejan en la lista para que la persona decida.
 *
 * Abre siempre hacia abajo: con mas de 200 paises, voltearla la manda fuera de
 * la pantalla.
 */

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
}

const etiqueta = (pais: Pais) => `${pais.nombre} (${pais.indicativo})`

function coincide(pais: Pais, busqueda: string): boolean {
  const buscado = normalizar(busqueda)
  if (!buscado) return true
  if (buscado === normalizar(etiqueta(pais))) return true
  if (/^\+?\d+$/.test(buscado)) return pais.indicativo.startsWith(buscado.startsWith("+") ? buscado : `+${buscado}`)
  // Por inicio de palabra: "co" trae Colombia y Costa Rica, no Marruecos.
  return normalizar(pais.nombre)
    .split(/\s+/)
    .some((palabra) => palabra.startsWith(buscado))
}

export function SelectorPais({ paises, paisInicial }: { paises: Pais[]; paisInicial: string }) {
  const [pais, setPais] = React.useState<Pais | null>(() => paises.find((p) => p.codigo === paisInicial) ?? null)

  function alEscribir(texto: string) {
    const exactos = paises.filter((p) => p.indicativo === texto.trim())
    if (exactos.length === 1) setPais(exactos[0])
  }

  return (
    <Combobox.Root
      items={paises}
      value={pais}
      onValueChange={setPais}
      onInputValueChange={alEscribir}
      filter={coincide}
      itemToStringLabel={etiqueta}
      itemToStringValue={(p) => p.codigo}
      name="pais"
      required
      autoHighlight
    >
      <Combobox.Input
        aria-label="País del celular"
        placeholder="País o indicativo"
        autoComplete="off"
        onFocus={(evento) => evento.currentTarget.select()}
        render={<Input className="h-11 bg-white/85" />}
      />
      <Combobox.Portal>
        <Combobox.Positioner side="bottom" align="start" sideOffset={4} collisionAvoidance={{ side: "none" }} className="z-50">
          <Combobox.Popup className="bg-popover text-popover-foreground ring-foreground/10 w-(--anchor-width) min-w-64 overflow-hidden rounded-lg shadow-md ring-1">
            <Combobox.Empty className="text-muted-foreground p-3 text-sm empty:hidden">No encontramos ese país.</Combobox.Empty>
            <Combobox.List className="max-h-[min(16rem,var(--available-height))] overflow-y-auto p-1 empty:hidden">
              {(opcion: Pais) => (
                <Combobox.Item
                  key={opcion.codigo}
                  value={opcion}
                  className="data-highlighted:bg-accent data-highlighted:text-accent-foreground flex cursor-default items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm outline-none"
                >
                  <span>{opcion.nombre}</span>
                  <span className="text-muted-foreground shrink-0">{opcion.indicativo}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
