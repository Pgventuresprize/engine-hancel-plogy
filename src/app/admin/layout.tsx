import type { Metadata } from "next"
import type * as React from "react"

import { exigirAdmin } from "@/lib/admin"

export const metadata: Metadata = { title: "Administración · Plogy Studio", robots: { index: false, follow: false } }

/** Primera barrera; cada pagina y cada accion comprueban por su cuenta (ver lib/admin.ts). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirAdmin()
  return children
}
