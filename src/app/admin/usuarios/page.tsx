import { AdminShell } from "@/components/admin/admin-shell"
import { UsuariosLista } from "@/components/admin/usuarios-lista"
import { exigirAdmin } from "@/lib/admin"
import { cargarPanel } from "@/lib/admin-data"

export const dynamic = "force-dynamic"

export default async function AdminUsuariosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [p, yo, params] = await Promise.all([cargarPanel(), exigirAdmin(), searchParams])
  const empresas = p.empresas.map((e) => ({
    id: e.id,
    name: e.name,
    owners: p.usuarios.filter((u) => u.empresas.some((x) => x.accountId === e.id && x.rol === "owner")).length,
  }))
  return (
    <AdminShell title="Usuarios" descripcion="Todas las personas con cuenta, en cualquier empresa.">
      <UsuariosLista usuarios={p.usuarios} empresas={empresas} yo={yo.id} abierto={typeof params.u === "string" ? params.u : undefined} />
    </AdminShell>
  )
}
