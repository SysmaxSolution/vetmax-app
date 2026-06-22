import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ProgramacoesWorkspace from '@/components/reception/ProgramacoesWorkspace'
import { getVaccinationSchedule } from '@/lib/actions/reception-schedule'
import { getAppointmentRequests } from '@/lib/actions/appointment-requests'

export const metadata = { title: 'Programações | SysVetMax' }

export default async function ProgramacoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) redirect('/onboarding')

  const [scheduleResult, requestsResult] = await Promise.all([
    getVaccinationSchedule(),
    getAppointmentRequests('pending_reception_validation'),
  ])

  const schedule     = 'error' in scheduleResult ? { overdue: [], upcoming: [] } : scheduleResult
  const appointments = Array.isArray(requestsResult) ? requestsResult : []

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <ProgramacoesWorkspace schedule={schedule} appointmentRequests={appointments} />
    </div>
  )
}
