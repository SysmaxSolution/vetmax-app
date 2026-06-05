import { requireModuleAccess } from '@/lib/server/require-module'
import { createAdminClient } from '@/lib/supabase/admin'
import { listCashierEntries, getCashierSummary } from '@/lib/actions/core-management'
import { getCashierDashboard, getCurrentSession, listOutflows } from '@/lib/actions/cashier-sessions'
import { getPendingInvoices } from '@/lib/actions/billing'
import { getPendingGroomingSessions } from '@/lib/actions/grooming'
import { hasAccessRight } from '@/lib/actions/access-rights'
import CashierPageClient from '@/components/cashier/CashierPageClient'

export const metadata = { title: 'Caixa | SysVetMax' }

export default async function CashierPage() {
  const profile = await requireModuleAccess('cashier')
  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Minha Clínica'

  const today        = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'

  const [entriesResult, summaryResult, dashboardResult, sessionResult, invoicesResult, outflowsResult, groomingResult] = await Promise.all([
    listCashierEntries({ from_date: firstOfMonth }),
    getCashierSummary({ from_date: firstOfMonth, to_date: today }),
    getCashierDashboard(today),
    getCurrentSession(),
    getPendingInvoices(),
    listOutflows({ date: today }),
    getPendingGroomingSessions(),
  ])

  const entries         = 'error' in entriesResult    ? [] : entriesResult
  const summary         = 'error' in summaryResult    ? null : summaryResult
  const dashboard       = 'error' in dashboardResult  ? null : dashboardResult
  const session         = sessionResult && !('error' in sessionResult) ? sessionResult : null
  const invoices        = 'error' in invoicesResult   ? [] : invoicesResult
  const outflows        = 'error' in outflowsResult   ? [] : outflowsResult
  const groomingSessions = 'error' in groomingResult  ? [] : groomingResult

  // Épico B (04/06, Q4): PDV unificado ao Caixa — venda avulsa no Recebimentos
  const admin = createAdminClient()
  const { data: clinicRow } = await admin
    .from('clinics')
    .select('flow_config, active_modules')
    .eq('id', profile.clinic_id)
    .single()
  const pdvUnified = (clinicRow?.flow_config as { pdv_unified_with_cashier?: boolean } | null)?.pdv_unified_with_cashier === true
  const activeModules = (clinicRow?.active_modules as string[] | null) ?? []

  // HF 05/06: visualização completa dos "dados inteligentes" do convênio no
  // recebimento é um DIREITO DE ACESSO (Gestão > Usuários > Direitos de
  // Acesso > Caixa Central > Dados Inteligentes do Convênio). Default
  // liberado; o admin desmarca "Visualizar" para o operador ver a tela limpa.
  const canViewInsuranceDetails = await hasAccessRight('cashier.insurance_intelligence', 'view')

  return (
    <CashierPageClient
      initialEntries={entries}
      initialSummary={summary}
      initialDashboard={dashboard}
      initialSession={session}
      initialInvoices={invoices}
      initialOutflows={outflows}
      initialGroomingSessions={groomingSessions}
      userRole={profile.role}
      clinicId={profile.clinic_id}
      clinicName={clinicName}
      today={today}
      firstOfMonth={firstOfMonth}
      pdvUnified={pdvUnified}
      canViewInsuranceDetails={canViewInsuranceDetails}
      activeModules={activeModules}
    />
  )
}
