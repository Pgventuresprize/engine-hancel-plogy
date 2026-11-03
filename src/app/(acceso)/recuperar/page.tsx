import type { Metadata } from "next"

import { RecuperarForm } from "@/components/auth/formularios"

export const metadata: Metadata = {
  title: "Recuperar contraseña · Plogy Studio",
}

/** "¿Olvidaste tu contraseña?": se pide el enlace por correo. Abierta sin sesion. */
export default function RecuperarPage() {
  return <RecuperarForm />
}
