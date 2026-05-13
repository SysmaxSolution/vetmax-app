import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getReportsEnabled } from '@/lib/actions/reports-g13'
import ReportsWorkspace from '@/components/reports/ReportsWorkspace'

export const metadata = { title: 'Relatórios | SysVetMax' }

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')
  if (profile.role !== 'admin') redirect('/dashboard')

  const enabledResult = await getReportsEnabled()
  const initialEnabled = 'error' in enabledResult
    ? {
        pet_frequency: true,
        productivity:  true,
        financial:     true,
        dre:           true,
        curva_abc:     true,
        whatsapp:      true,
        operational:   true,
      }
    : enabledResult

  return <ReportsWorkspace initialEnabled={initialEnabled} />
}
