import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getReceptionQueue, getReceptionHistory } from '@/lib/actions/consultations'
import { getClinicSettingsConfig } from '@/lib/actions/clinic-settings'
import { ReceptionWorkspace } from '@/components/reception/ReceptionWorkspace'

export default async function ReceptionPage() {
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

  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Minha Clínica'

  // Obter fila de espera
  const queueResult = await getReceptionQueue()
  const initialQueue = 'error' in queueResult ? [] : queueResult

  // Obter histórico de recepção
  const historyResult = await getReceptionHistory()
  const initialHistory = 'error' in historyResult ? [] : historyResult
  const { data: clinic } = await admin
    .from('clinics')
    .select('reception_checklist, active_modules')
    .eq('id', profile.clinic_id)
    .single()

  const mods = clinic?.active_modules as string[] | null
  if (mods && !mods.includes('reception')) redirect('/dashboard')

  const clinicChecklist = (clinic?.reception_checklist as string[] | null) ?? []

  // Fetch configurable required fields for check-in
  const settingsResult = await getClinicSettingsConfig()
  const checkinRequiredFields = 'error' in settingsResult ? ['address', 'emergency_contact'] : settingsResult.checkin_required_fields

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <ReceptionWorkspace
        initialQueue={initialQueue}
        initialHistory={initialHistory}
        clinicName={clinicName}
        userName={profile.full_name}
        clinicChecklist={clinicChecklist}
        clinicId={profile.clinic_id}
        checkinRequiredFields={checkinRequiredFields}
      />
    </div>
  )
}
