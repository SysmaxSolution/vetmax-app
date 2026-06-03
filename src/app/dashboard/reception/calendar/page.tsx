import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import CalendarWorkspace from '@/components/reception/CalendarWorkspace'
import { getClinicSettingsConfig } from '@/lib/actions/clinic-settings'

export const metadata = { title: 'Agenda | SysVetMax' }

export default async function CalendarPage() {
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

  // Mesma fonte usada em /dashboard/reception — garante que o check-in
  // disparado pela Agenda respeite os mesmos required fields da clínica.
  const settingsResult = await getClinicSettingsConfig()
  const checkinRequiredFields = 'error' in settingsResult
    ? ['address', 'emergency_contact']
    : settingsResult.checkin_required_fields

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <CalendarWorkspace
        clinicName={clinicName}
        userName={profile.full_name}
        checkinRequiredFields={checkinRequiredFields}
      />
    </div>
  )
}
