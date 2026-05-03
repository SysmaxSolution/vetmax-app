import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import VetWorkspace from '@/components/vet/VetWorkspace'
import { getVetQueue, getVetCompleted } from '@/lib/actions/vet'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Consultório | VetMax',
}

export default async function VetPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const { data: profile } = await adminClient
    .from('profiles')
    .select('full_name, role, clinic_id, clinics(name)')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')
  const { data: clinicRow } = await adminClient.from('clinics').select('active_modules').eq('id', profile.clinic_id).single()
  const mods = clinicRow?.active_modules as string[] | null
  if (mods && !mods.includes('consultation')) redirect('/dashboard')

  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Minha Clínica'

  const [queueResult, completedResult] = await Promise.all([
    getVetQueue(),
    getVetCompleted(),
  ])

  const queue = 'error' in queueResult ? [] : queueResult
  const completed = 'error' in completedResult ? [] : completedResult

  return (
    <VetWorkspace queue={queue} completed={completed} clinicId={profile.clinic_id} />
  )
}
