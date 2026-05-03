import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getGroomingBoard } from '@/lib/actions/grooming'
import GroomingKanban from '@/components/grooming/GroomingKanban'

export const metadata = { title: 'Banho e Tosa | VetMax' }

export default async function GroomingPage() {
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
  if (!['admin', 'vet', 'assistant', 'receptionist'].includes(profile.role)) redirect('/dashboard')

  // Verifica se módulo está ativo
  const { data: clinicRow } = await supabase
    .from('clinics')
    .select('active_modules')
    .eq('id', profile.clinic_id)
    .single()

  const mods = clinicRow?.active_modules as string[] | null
  if (mods && !mods.includes('grooming')) redirect('/dashboard/reception')

  const boardResult = await getGroomingBoard()
  const board = 'error' in boardResult
    ? { scheduled: [], received: [], bathing: [], grooming: [], waiting_pickup: [], delivered: [] }
    : boardResult

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 sm:px-6">
      <GroomingKanban
        initialBoard={board}
        clinicId={profile.clinic_id}
      />
    </div>
  )
}
