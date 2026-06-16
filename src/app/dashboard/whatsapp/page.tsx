import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getWhatsappConversations } from '@/lib/actions/whatsapp-conversations'
import ConversationsPageClient from '@/components/whatsapp/ConversationsPageClient'

export default async function WhatsappPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [conversations, profileRes] = await Promise.all([
    getWhatsappConversations(),
    supabase.from('profiles').select('clinic_id, full_name').eq('id', user.id).single(),
  ])

  const clinicId       = profileRes.data?.clinic_id ?? ''
  const currentUserName = profileRes.data?.full_name ?? null

  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6">
      <ConversationsPageClient
        initialConversations={Array.isArray(conversations) ? conversations : []}
        clinicId={clinicId}
        currentUserId={user.id}
        currentUserName={currentUserName}
      />
    </div>
  )
}
