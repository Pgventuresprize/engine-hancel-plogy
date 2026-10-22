/**
 * Las pestanas de Marca. Aparte de marca-tabs.tsx porque la pagina, que es de
 * servidor, tambien las lee: un valor exportado desde un modulo "use client"
 * le llega al servidor como referencia de cliente, no como el array.
 */
export const PESTANAS = [
  { valor: "identidad", etiqueta: "Identidad" },
  { valor: "voz", etiqueta: "Voz" },
  { valor: "editorial", etiqueta: "Editorial" },
  { valor: "cta", etiqueta: "CTA" },
  { valor: "visual", etiqueta: "Visual" },
  { valor: "kit", etiqueta: "Kit de diseño" },
  { valor: "imagenes", etiqueta: "Imágenes" },
  { valor: "skills", etiqueta: "Skills" },
  { valor: "ejemplos", etiqueta: "Ejemplos" },
] as const
export type Pestana = (typeof PESTANAS)[number]["valor"]
