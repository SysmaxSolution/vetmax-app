import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Painel | SysVetMax' }

export default async function DashboardPage() {
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

  switch (profile.role) {
    case 'receptionist': redirect('/dashboard/reception')
    case 'vet':          redirect('/dashboard/vet')
    case 'assistant':    redirect('/dashboard/triage')
    case 'pharmacist':   redirect('/dashboard/pharmacy')
    default:             redirect('/dashboard/reception')
  }
}
