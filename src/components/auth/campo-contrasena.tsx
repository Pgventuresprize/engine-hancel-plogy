"use client"

import * as React from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * Un campo de contraseña con un ojo para verla.
 *
 * Acepta lo mismo que `Input` y solo se queda con el `type`. El boton es
 * `type="button"` para que no envie el formulario al pulsarlo.
 */
export function CampoContrasena({ className, disabled, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} disabled={disabled} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Ver contraseña"}
        aria-pressed={visible}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}
