import { requireModuleAccess } from '@/lib/server/require-module'
import { listCardInstallments, getCardInstallmentsSummary } from '@/lib/actions/card-receivables'
import { listPaymentCards } from '@/lib/actions/payment-cards'
import CardReceivablesWorkspace from '@/components/financial/CardReceivablesWorkspace'

export const metadata = { title: 'Cartões — Financeiro | SysVetMax' }

export default async function FinancialCardsPage() {
  const profile = await requireModuleAccess('financial')

  const [installments, summary, cards] = await Promise.all([
    listCardInstallments({ status: 'pending' }),
    getCardInstallmentsSummary(),
    listPaymentCards({ only_active: true }),
  ])

  return (
    <CardReceivablesWorkspace
      initialInstallments={Array.isArray(installments) ? installments : []}
      initialSummary={'error' in summary ? null : summary}
      cards={Array.isArray(cards) ? cards : []}
      userRole={profile.role}
    />
  )
}
