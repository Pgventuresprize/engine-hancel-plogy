import Link from "next/link"

import { TOPE_PROMPT } from "@/engine/marca/bloque"

/** 12345 -> "12.345", igual en el servidor y en el navegador. */
const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".")

/**
 * El prompt tal cual lo recibe el agente: su oficio, el bloque de la marca y
 * el formato de respuesta, armado con los datos reales de la cuenta.
 *
 * Sin estado ni efectos, para poder usarlo desde una pagina de servidor y
 * desde un componente de cliente.
 */
export function PromptFinal({ prompt }: { prompt: string }) {
  const caracteres = prompt.length
  // Aproximado: en español sale un token por cada tres o cuatro caracteres.
  const tokens = Math.round(caracteres / 3.5)

  return (
    <details className="group rounded-lg border px-4 py-3">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
        Ver prompt final
        <span className="text-muted-foreground text-xs font-normal tabular-nums">
          {miles(caracteres)} caracteres · ~{miles(tokens)} tokens
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-muted-foreground text-xs leading-relaxed">
          Lo que recibe el agente como instrucciones: el oficio, el bloque de{" "}
          <Link href="/marca" className="text-foreground underline underline-offset-2">
            tu marca
          </Link>{" "}
          y el formato de respuesta, que no se edita. En cada llamada recibe además el material de la pieza.
        </p>
        {caracteres > TOPE_PROMPT ? (
          <p className="text-xs text-amber-600">
            Es largo: pasa de {miles(TOPE_PROMPT)} caracteres y cada llamada lo paga entero. Revisa si sobra algo en la
            marca o en el oficio.
          </p>
        ) : null}
        <pre className="bg-muted max-h-[32rem] overflow-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {prompt}
        </pre>
      </div>
    </details>
  )
}
