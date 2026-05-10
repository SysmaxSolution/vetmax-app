import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { listCashierEntries, getCashierSummary } from '@/lib/actions/core-management'
import { getCashierDashboard, getCurrentSession, listOutflows } from '@/lib/actions/cashier-sessions'
import { getPendingInvoices } from '@/lib/actions/billing'
import { getPendingGroomingSessions } from '@/lib/actions/grooming'
import CashierPageClient from '@/components/cashier/CashierPageClient'

export const metadata = { title: 'Caixa | SysVetMax' }

const ALLOWED_ROLES = ['admin', 'owner', 'manager', 'accountant', 'receptionist']

export default async function CashierPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role, clinic_id, clinics(name)')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')
  if (!ALLOWED_ROLES.includes(profile.role)) redirect('/dashboard')

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
    />
  )
}
