import { requireModuleAccess } from '@/lib/server/require-module'
import { listSuppliers } from '@/lib/actions/suppliers'
import RegistryWorkspace from '@/components/registry/RegistryWorkspace'

export const metadata = { title: 'Cadastros Gerais | SysVetMax' }

export default async function RegistryPage() {
  const profile = await requireModuleAccess('registry')

  const suppliersResult = await listSuppliers({ is_active: true })
  const suppliers = 'error' in suppliersResult ? [] : suppliersResult

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <RegistryWorkspace
        initialSuppliers={suppliers}
        userRole={profile.role}
      />
    </div>
  )
}
