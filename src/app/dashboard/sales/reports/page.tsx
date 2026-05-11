import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getSalesSummary } from '@/lib/actions/sales'
import SalesReports from '@/components/sales/SalesReports'

export const metadata = { title: 'Relatório de Vendas — SysVetMax' }

export default async function SalesReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')
  if (!['admin', 'owner', 'manager', 'accountant'].includes(profile.role)) redirect('/dashboard/sales')

  const today = new Date().toISOString().split('T')[0]
  const summaryResult = await getSalesSummary(today, today)
  const summary = 'error' in summaryResult ? null : summaryResult

  return <SalesReports initialSummary={summary} />
}
