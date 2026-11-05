import { NextResponse } from "next/server"

import { adminActual } from "@/lib/admin"
import { cargarPanel, type FilaActividad } from "@/lib/admin-data"

export const dynamic = "force-dynamic"

const TIPOS: Record<string, (a: FilaActividad) => boolean> = {
  plan: (a) => a.tipo === "plan",
  acceso: (a) => a.tipo === "acceso",
  bloqueo: (a) => a.tipo === "bloqueo",
  sistema: (a) => a.tipo === "sistema" || a.tipo === "plataforma",
}

/** Las comillas se doblan, y lo que empieza como formula se neutraliza: esto se abre en Excel. */
function celda(valor: string | null): string {
  const texto = valor ?? ""
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
  return `"${seguro.replace(/"/g, '""')}"`
}

export async function GET(request: Request) {
  // Aqui no hay pagina que responda notFound(): se contesta lo mismo, un 404.
  if (!(await adminActual())) return new NextResponse("Not found", { status: 404 })

  const tipo = new URL(request.url).searchParams.get("tipo") ?? ""
  const { actividad } = await cargarPanel()
  const filas = actividad.filter(TIPOS[tipo] ?? (() => true))
  const csv = [
    ["Cuándo", "Quién", "Tipo", "Qué", "Sobre", "Detalle", "Motivo"].map(celda).join(","),
    ...filas.map((a) => [a.at, a.actor, a.tipo, a.accion, a.sobre, a.detalle, a.motivo].map(celda).join(",")),
  ].join("\r\n")

  // El BOM es para que Excel lea las tildes.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="actividad-plogy-studio.csv"`,
    },
  })
}
