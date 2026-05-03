import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ExamsWorkspace from '@/components/exams/ExamsWorkspace'
import { getExamsQueue, getExamsHistory, getExamRequests } from '@/lib/actions/exams'

export const metadata = { title: 'Exames | VetMax' }

export default async function ExamsPage() {
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

  const { data: clinicRow } = await supabase.from('clinics').select('active_modules').eq('id', profile.clinic_id).single()
  const mods = clinicRow?.active_modules as string[] | null
  if (mods && !mods.includes('exams')) redirect('/dashboard')

  const [queueResult, historyResult, examRequests] = await Promise.all([
    getExamsQueue(),
    getExamsHistory(),
    getExamRequests(),
  ])

  const queue   = 'error' in queueResult   ? [] : queueResult
  const history = 'error' in historyResult ? [] : historyResult

  return (
    <ExamsWorkspace queue={queue} history={history} examRequests={examRequests} clinicId={profile.clinic_id} />
  )
}
