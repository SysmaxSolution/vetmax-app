import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import PatientsWorkspace from '@/components/patients/PatientsWorkspace'
import { getPatientsList } from '@/lib/actions/timeline'

export const metadata = { title: 'Pacientes | SysVetMax' }

export default async function PatientsPage() {
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

  const patientsResult = await getPatientsList()
  const patients = 'error' in patientsResult ? [] : patientsResult

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <PatientsWorkspace
        initialPatients={patients}
        clinicName={clinicName}
      />
    </div>
  )
}
