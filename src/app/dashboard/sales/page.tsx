import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleAccess } from '@/lib/server/require-module'
import { getDailySales } from '@/lib/actions/sales'
import SalesWorkspace from '@/components/sales/SalesWorkspace'
import type { FlowConfig } from '@/lib/actions/clinic-settings'

export const metadata = { title: 'Vendas — SysVetMax' }

export default async function SalesPage() {
  const profile = await requireModuleAccess('sales')

  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Clínica'

  const admin = createAdminClient()
  const { data: clinicRow } = await admin
    .from('clinics')
    .select('active_modules, flow_config')
    .eq('id', profile.clinic_id)
    .single()
  const activeModules = (clinicRow?.active_modules as string[] | null) ?? []

  // Épico B (04/06, Q4): PDV unificado ao Caixa — venda avulsa vive em
  // Caixa > Recebimentos; este módulo redireciona em vez de sumir num 404.
  const flowConfig = (clinicRow?.flow_config as FlowConfig | null) ?? null
  if (flowConfig?.pdv_unified_with_cashier) {
    redirect('/dashboard/cashier')
  }

  const salesResult = await getDailySales()
  const dailySales  = Array.isArray(salesResult) ? salesResult : []

  return (
    <SalesWorkspace
      clinicId={profile.clinic_id}
      clinicName={clinicName}
      dailySales={dailySales}
      activeModules={activeModules}
    />
  )
}
