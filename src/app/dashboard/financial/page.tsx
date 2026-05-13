import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import {
  listEntries, getFinancialSummary,
  listBankAccounts, listChartOfAccounts, listCreditCards, listEmployees,
} from '@/lib/actions/financial'
import FinancialWorkspace from '@/components/financial/FinancialWorkspace'

export const metadata = { title: 'Financeiro | SysVetMax' }

export default async function FinancialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const isAdmin = profile.role === 'admin'

  const [
    receivableEntries,
    payableEntries,
    receivableSummary,
    payableSummary,
    bankAccountsRes,
    chartAccountsRes,
    creditCardsRes,
    employeesRes,
  ] = await Promise.all([
    listEntries({ type: 'receivable', status: 'all' }),
    listEntries({ type: 'payable',   status: 'all' }),
    getFinancialSummary('receivable'),
    getFinancialSummary('payable'),
    listBankAccounts(),
    listChartOfAccounts(),
    listCreditCards(),
    listEmployees(isAdmin),
  ])

  return (
    <FinancialWorkspace
      initialReceivable={Array.isArray(receivableEntries) ? receivableEntries : []}
      initialPayable={Array.isArray(payableEntries) ? payableEntries : []}
      initialReceivableSummary={'error' in receivableSummary ? null : receivableSummary}
      initialPayableSummary={'error' in payableSummary ? null : payableSummary}
      initialBankAccounts={Array.isArray(bankAccountsRes) ? bankAccountsRes : []}
      initialChartAccounts={Array.isArray(chartAccountsRes) ? chartAccountsRes : []}
      initialCreditCards={Array.isArray(creditCardsRes) ? creditCardsRes : []}
      initialEmployees={Array.isArray(employeesRes) ? employeesRes : []}
      isAdmin={isAdmin}
    />
  )
}
