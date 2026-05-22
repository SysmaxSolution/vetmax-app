import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleAccess } from '@/lib/server/require-module'
import { getPharmacyStockV2 } from '@/lib/actions/stock'
import PharmacyWorkspace from '@/components/pharmacy/PharmacyWorkspace'

export const metadata = { title: 'Estoque | SysVetMax' }

export default async function PharmacyPage() {
  const profile = await requireModuleAccess('pharmacy')

  // Re-busca active_modules da clínica caso seja necessário para feature flags
  const admin = createAdminClient()
  const { data: clinicRow } = await admin
    .from('clinics')
    .select('active_modules')
    .eq('id', profile.clinic_id)
    .single()
  const activeModules = (clinicRow?.active_modules as string[] | null) ?? []

  const stockResult = await getPharmacyStockV2()
  const stock = Array.isArray(stockResult) ? stockResult : []

  return <PharmacyWorkspace stock={stock} userRole={profile.role as 'admin' | 'vet'} activeModules={activeModules} />
}
