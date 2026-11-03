import { PlogyStudioLogo } from "@/components/plogy-studio-logo"

/**
 * El logo y una frase, arriba de cada pantalla de acceso.
 *
 * El lockup ya lleva el nombre dentro, asi que hace de titulo y no se repite
 * debajo en texto. Su nombre accesible es "Plogy Studio".
 */
export function EncabezadoAcceso({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <h1 className="flex">
        <PlogyStudioLogo className="text-2xl" />
      </h1>
      {titulo ? <p className="text-center text-base font-semibold">{titulo}</p> : null}
      <div className="text-muted-foreground text-center text-sm text-balance">{children}</div>
    </div>
  )
}
