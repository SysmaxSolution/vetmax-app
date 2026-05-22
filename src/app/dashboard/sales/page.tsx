import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleAccess } from '@/lib/server/require-module'
import { getDailySales } from '@/lib/actions/sales'
import SalesWorkspace from '@/components/sales/SalesWorkspace'

export const metadata = { title: 'Vendas — SysVetMax' }

export default async function SalesPage() {
  const profile = await requireModuleAccess('sales')

  const salesResult = await getDailySales()
  const dailySales  = Array.isArray(salesResult) ? salesResult : []

  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Clínica'

  const admin = createAdminClient()
  const { data: clinicRow } = await admin
    .from('clinics')
    .select('active_modules')
    .eq('id', profile.clinic_id)
    .single()
  const activeModules = (clinicRow?.active_modules as string[] | null) ?? []

  return (
    <SalesWorkspace
      clinicId={profile.clinic_id}
      clinicName={clinicName}
      dailySales={dailySales}
      activeModules={activeModules}
    />
  )
}
