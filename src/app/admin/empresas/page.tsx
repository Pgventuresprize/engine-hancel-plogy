import { AdminShell } from "@/components/admin/admin-shell"
import { BotonNuevaEmpresa, EmpresasLista } from "@/components/admin/empresas-lista"
import { cargarPanel, formatBytes } from "@/lib/admin-data"

export const dynamic = "force-dynamic"

export default async function AdminEmpresasPage() {
  const p = await cargarPanel()
  return (
    <AdminShell title="Empresas" descripcion="Cada empresa con su plan, su estado y lo que consume en 30 días." acciones={<BotonNuevaEmpresa />}>
      <EmpresasLista empresas={p.empresas.map((e) => ({ ...e, archivos: formatBytes(e.bytes) }))} />
    </AdminShell>
  )
}
