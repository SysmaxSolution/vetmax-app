import { requireModuleAccess } from '@/lib/server/require-module'
import {
  listEntries, getFinancialSummary,
  listBankAccounts, listChartOfAccounts, listCreditCards, listEmployees,
  listClinicProfiles,
} from '@/lib/actions/financial'
import FinancialWorkspace from '@/components/financial/FinancialWorkspace'

export const metadata = { title: 'Financeiro | SysVetMax' }

export default async function FinancialPage() {
  const profile = await requireModuleAccess('financial')
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
    clinicProfilesRes,
  ] = await Promise.all([
    listEntries({ type: 'receivable', status: 'all' }),
    listEntries({ type: 'payable',   status: 'all' }),
    getFinancialSummary('receivable'),
    getFinancialSummary('payable'),
    listBankAccounts(),
    listChartOfAccounts(),
    listCreditCards(),
    listEmployees(isAdmin),
    listClinicProfiles(),
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
      clinicProfiles={clinicProfilesRes}
      currentUserId={profile.id}
    />
  )
}
