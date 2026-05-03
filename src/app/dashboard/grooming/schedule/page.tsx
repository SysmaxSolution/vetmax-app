import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import GroomingScheduleWorkspace from '@/components/grooming/GroomingScheduleWorkspace'

export const metadata = { title: 'Agendamento Banho e Tosa | VetMax' }

export default async function GroomingSchedulePage() {
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
  if (!['admin', 'assistant', 'receptionist'].includes(profile.role)) redirect('/dashboard')

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6">
      <GroomingScheduleWorkspace clinicId={profile.clinic_id} />
    </div>
  )
}
