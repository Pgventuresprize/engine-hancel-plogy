import type { NoticiaAdjunta } from "@/engine/chat/mensajes"

/**
 * El nombre que una conversacion lleva al instante, antes de que Plogy Studio ponga
 * uno mejor a partir de lo hablado. Lo usan el servidor al crearla y la
 * pantalla mientras espera la respuesta, para que no cambie al llegar.
 */
export function tituloProvisional(
  texto: string,
  noticia: Pick<NoticiaAdjunta, "titulo"> | null,
  agentes: readonly ("instagram" | "linkedin" | "revisor")[]
): string {
  if (noticia) {
    const tipos: string[] = []
    if (agentes.includes("instagram")) tipos.push("carrusel")
    if (agentes.includes("linkedin")) tipos.push("post")
    if (!tipos.length) tipos.push(agentes.includes("revisor") ? "revisión" : "ángulo")
    return `${recortar(noticia.titulo, 34)} · ${tipos.join(" y ")}`
  }
  return recortar(texto, 42)
}

function recortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max - 2).trim()}…` : t
}
