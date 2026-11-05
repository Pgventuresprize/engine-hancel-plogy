import { AccesosPanel } from "@/components/admin/accesos-panel"
import { AdminShell } from "@/components/admin/admin-shell"
import { exigirAdmin } from "@/lib/admin"
import { cargarPanel } from "@/lib/admin-data"

export const dynamic = "force-dynamic"

export default async function AdminAccesosPage() {
  const [p, yo] = await Promise.all([cargarPanel(), exigirAdmin()])
  const admins = p.usuarios.filter((u) => u.esAdmin).map((u) => ({ id: u.id, email: u.email, adminDesde: u.adminDesde, ultimoIngreso: u.ultimoIngreso }))
  return (
    <AdminShell title="Accesos" descripcion="Quién entra a este panel y quién puede crear cuenta.">
      <AccesosPanel admins={admins} yo={yo.id} registroAbierto={p.registroAbierto} />
    </AdminShell>
  )
}
