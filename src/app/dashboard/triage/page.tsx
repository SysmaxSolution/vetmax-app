import { getTriageQueue, getTriageHistory, getTriageRecordsQueue } from '@/lib/actions/triage'
import NurseWorkspace from '@/components/triage/NurseWorkspace'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = {
  title: 'Triagem Veterinária | VetMax',
}

export default async function TriagePage() {
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
  if (mods && !mods.includes('triage')) redirect('/dashboard')

  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Minha Clínica'

  const [queueResult, historyResult, triageRecords] = await Promise.all([
    getTriageQueue(),
    getTriageHistory(),
    getTriageRecordsQueue(),
  ])

  // Fallback: se houver erro, renderizar com listas vazias ao invés de redirecionar
  const consultationsQueue = 'error' in queueResult ? [] : queueResult
  // Merge triage_records (status='waiting') com consultations (status='triage')
  // Evitar duplicatas por patient_id
  const seenPatientIds = new Set(consultationsQueue.map(q => q.patient.id))
  const extraRecords = triageRecords.filter(r => !seenPatientIds.has(r.patient.id))
  const queue = [...consultationsQueue, ...extraRecords]
  const history = 'error' in historyResult ? [] : historyResult

  return (
    <NurseWorkspace queue={queue} history={history} clinicId={profile.clinic_id} />
  )
}
