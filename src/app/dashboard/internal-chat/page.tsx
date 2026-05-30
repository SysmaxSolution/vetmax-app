import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import InternalChatWorkspace from '@/components/internal-chat/InternalChatWorkspace'
import { listMyChats } from '@/lib/actions/internal-chat'

export const metadata = { title: 'Chat Interno | SysVetMax' }
export const dynamic = 'force-dynamic'

export default async function InternalChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, full_name')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) redirect('/onboarding')

  const initialChats = await listMyChats()

  return (
    <InternalChatWorkspace
      initialChats={Array.isArray(initialChats) ? initialChats : []}
      clinicId={profile.clinic_id}
      userId={user.id}
      userName={profile.full_name ?? 'Você'}
    />
  )
}
