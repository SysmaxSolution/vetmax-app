import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getHospitalizationsBoard } from '@/lib/actions/hospitalizations'
import HospitalizationKanban from '@/components/hospitalization/HospitalizationKanban'

export const metadata = { title: 'Internação | VetMax' }

export default async function HospitalizationPage() {
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
  if (!['admin', 'vet', 'assistant'].includes(profile.role)) redirect('/dashboard')

  const { data: clinicRow } = await supabase.from('clinics').select('active_modules').eq('id', profile.clinic_id).single()
  const mods = clinicRow?.active_modules as string[] | null
  if (!mods || !mods.includes('hospitalization')) redirect('/dashboard')

  const boardResult = await getHospitalizationsBoard()
  
  const board = 'error' in boardResult
    ? { observation: [], ward: [], icu: [], ready_for_discharge: [] }
    : boardResult
  
  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6">
      <HospitalizationKanban
        initialBoard={board}
        clinicId={profile.clinic_id}
      />
    </main>
  )
}
