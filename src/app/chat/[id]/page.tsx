import { redirect } from "next/navigation"

/** El enlace directo a una conversacion: el chat vive en el inicio, con ella abierta. */
export default async function ConversacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/?c=${encodeURIComponent(id)}`)
}
