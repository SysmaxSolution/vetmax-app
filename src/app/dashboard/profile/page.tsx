import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import UserProfileForm from '@/components/profile/UserProfileForm'

export const metadata = { title: 'Meu Perfil — SysVetMax' }

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, nickname, phone, crmv, specialties, photo_url, role, clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Meu Perfil</h1>
          <p className="mt-0.5 text-sm text-slate-500">Gerencie seus dados profissionais</p>
        </div>
        <UserProfileForm profile={profile} email={user.email ?? ''} />
      </main>
    </div>
  )
}
