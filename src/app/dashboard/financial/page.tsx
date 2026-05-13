import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { listEntries, getFinancialSummary } from '@/lib/actions/financial'
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

  const [receivableEntries, payableEntries, receivableSummary, payableSummary] = await Promise.all([
    listEntries({ type: 'receivable', status: 'all' }),
    listEntries({ type: 'payable',   status: 'all' }),
    getFinancialSummary('receivable'),
    getFinancialSummary('payable'),
  ])

  return (
    <FinancialWorkspace
      initialReceivable={Array.isArray(receivableEntries) ? receivableEntries : []}
      initialPayable={Array.isArray(payableEntries) ? payableEntries : []}
      initialReceivableSummary={'error' in receivableSummary ? null : receivableSummary}
      initialPayableSummary={'error' in payableSummary ? null : payableSummary}
    />
  )
}
