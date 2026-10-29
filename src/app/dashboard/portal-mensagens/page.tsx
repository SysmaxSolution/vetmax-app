import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import ClinicPortalInbox from '@/components/portal/ClinicPortalInbox'

export const metadata = { title: 'Mensagens do Portal | SysVetMax' }
export const dynamic = 'force-dynamic'

export default async function PortalMessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Gate da rotina: flow_config.portal_enabled (padrão desligado). Antes a
  // única checagem era "está logado?", e o item herdava o módulo 'reception'.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) redirect('/dashboard')
  const { data: clinic } = await admin
    .from('clinics').select('flow_config').eq('id', profile.clinic_id).single()
  if ((clinic?.flow_config as { portal_enabled?: boolean } | null)?.portal_enabled !== true) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <header className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Mensagens do Portal</h1>
            <p className="text-sm text-slate-600 mt-1">Converse com os tutores que escreveram pela Área do Tutor.</p>
          </div>
        </header>
        <ClinicPortalInbox />
      </main>
    </div>
  )
}
