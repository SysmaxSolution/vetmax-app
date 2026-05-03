import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { OnboardingForm } from './OnboardingForm'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ clinic_id?: string; token?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()
    if (profile?.clinic_id) redirect('/dashboard')
  }

  const { clinic_id, token } = await searchParams

  // Só busca o nome da clínica quando há token de convite válido junto com o clinic_id.
  // Sem token, expor o nome apenas por clinic_id na query string seria um info leak.
  let clinicName: string | null = null
  if (clinic_id && token) {
    const admin = createAdminClient()
    const { data } = await admin.from('clinics').select('name').eq('id', clinic_id).single()
    clinicName = data?.name ?? null
  }

  return <OnboardingForm clinicId={clinic_id ?? null} clinicName={clinicName} token={token ?? null} />
}
